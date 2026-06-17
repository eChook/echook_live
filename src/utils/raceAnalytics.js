import { LAP_KEYS } from './telemetryKeys'
import { roundMetric } from './metricPrecision'
/**
 * @file raceAnalytics.js
 * @brief Race session detection and lap tracking utilities.
 * @description Provides logic for detecting race sessions and tracking lap data
 *              from incoming telemetry packets. Maintains a hierarchical structure
 *              of race sessions with associated lap information.
 */

/**
 * @brief Parse candidate value to a finite number.
 * @param {unknown} value - Candidate numeric value
 * @returns {number|null} Finite number or null
 */
function toFiniteNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * @brief Extract LL_* lap summary keys from a telemetry packet.
 * @param {Object} packet - Telemetry packet
 * @returns {{ lapData: Object, hasLapKeys: boolean }} Extracted lap summary and key presence
 */
export function extractLapSummary(packet) {
    let hasLapKeys = false
    const lapData = {}

    LAP_KEYS.forEach((key) => {
        if (packet?.[key] !== undefined) {
            lapData[key] = packet[key]
            hasLapKeys = true
        }
    })

    return { lapData, hasLapKeys }
}

/**
 * @brief Determine whether lap summary payload has meaningful values.
 * @description Filters out LL_* placeholders (all zero/empty values).
 * @param {Object} lapSummary - LL_* lap summary map
 * @returns {boolean} True when summary contains real lap metrics
 */
export function hasMeaningfulLapSummary(lapSummary) {
    const lapTime = Number(lapSummary?.LL_Time)
    if (Number.isFinite(lapTime) && lapTime > 0) return true

    return Object.values(lapSummary || {}).some((value) => {
        const num = Number(value)
        return Number.isFinite(num) && num !== 0
    })
}

/**
 * @brief Resolve latest active race from sessions map.
 * @param {Object} sessions - Race sessions map
 * @returns {{ currentStartTime: string|undefined, currentRace: Object|null }} Latest race details
 */
function getCurrentRace(sessions) {
    const sessionKeys = Object.keys(sessions || {}).sort((a, b) => b - a)
    const currentStartTime = sessionKeys[0]
    return {
        currentStartTime,
        currentRace: currentStartTime ? sessions[currentStartTime] : null
    }
}

/**
 * @brief Get last recorded lap number in a race.
 * @param {Object|null} race - Race object
 * @returns {number} Highest lap number in race
 */
function getLastRecordedLap(race) {
    const laps = race ? Object.values(race.laps || {}).sort((a, b) => (a?.lapNumber || 0) - (b?.lapNumber || 0)) : []
    return laps.length > 0 ? (laps[laps.length - 1].lapNumber || 0) : 0
}

/**
 * @brief Evaluate whether current lap should start a new race session.
 * @param {Object|null} currentRace - Current active race
 * @param {number} lapNumber - Incoming lap number
 * @returns {boolean} True when race boundary is detected
 */
function shouldStartNewRace(currentRace, lapNumber) {
    const lastRecordedLap = getLastRecordedLap(currentRace)
    return !currentRace || (lapNumber < lastRecordedLap) || (lapNumber === 1 && lastRecordedLap > 1)
}

/**
 * @brief Build a new race session object.
 * @param {number} startTimeMs - Session start timestamp
 * @param {string|null} trackName - Optional track name
 * @returns {Object} New race session object
 */
function createRaceSession(startTimeMs, trackName = null) {
    return {
        id: startTimeMs,
        startTimeMs,
        startTimeIso: new Date(startTimeMs).toISOString(),
        trackName: trackName || null,
        laps: {}
    }
}

/**
 * @brief Clone sessions map to avoid mutating store references.
 * @param {Object} sessions - Existing sessions map
 * @returns {Object} Deep-cloned sessions map
 */
function cloneSessions(sessions) {
    const source = sessions && typeof sessions === 'object' && !Array.isArray(sessions) ? sessions : {}
    const cloned = {}
    Object.entries(source).forEach(([startTime, race]) => {
        if (!race || typeof race !== 'object') return
        const clonedLaps = {}
        Object.entries(race.laps || {}).forEach(([lapNumber, lap]) => {
            clonedLaps[lapNumber] = { ...(lap || {}) }
        })
        cloned[startTime] = {
            ...(race || {}),
            laps: clonedLaps
        }
    })
    return cloned
}

/**
 * @brief Detect completed lap boundaries from currLap transitions.
 * @param {Array<Object>} samples - Sorted telemetry samples
 * @param {Object} [options] - Boundary options
 * @param {number} [options.minDerivedLapMs=5000] - Minimum derived lap duration in ms
 * @returns {Array<Object>} Derived boundary descriptors
 */
export function detectLapBoundaries(samples, options = {}) {
    const minDerivedLapMs = Number.isFinite(options.minDerivedLapMs) ? Math.max(0, options.minDerivedLapMs) : 5000
    const boundaries = []

    if (!Array.isArray(samples) || samples.length === 0) return boundaries

    let activeLapNumber = null
    let activeStartTime = null
    let activeTrackName = null

    samples.forEach((sample) => {
        const timestamp = toFiniteNumber(sample?.timestamp)
        if (timestamp === null) return

        const lapNumber = toFiniteNumber(sample?.currLap)
        const trackName = typeof sample?.track === 'string' && sample.track.trim() ? sample.track.trim() : null

        if (lapNumber === null || lapNumber <= 0) {
            if (!activeTrackName && trackName) activeTrackName = trackName
            return
        }

        if (activeLapNumber === null) {
            activeLapNumber = lapNumber
            activeStartTime = timestamp
            activeTrackName = trackName
            return
        }

        if (lapNumber === activeLapNumber) {
            if (!activeTrackName && trackName) activeTrackName = trackName
            return
        }

        const durationMs = timestamp - activeStartTime
        if (durationMs >= minDerivedLapMs) {
            boundaries.push({
                lapNumber: activeLapNumber,
                startTime: activeStartTime,
                finishTime: timestamp,
                trackName: activeTrackName || trackName || null
            })
        }

        activeLapNumber = lapNumber
        activeStartTime = timestamp
        activeTrackName = trackName
    })

    return boundaries
}

/**
 * @brief Derive LL_* summary metrics from raw sample window.
 * @param {Array<Object>} samples - Sorted telemetry samples
 * @param {number} startMs - Lap start timestamp
 * @param {number} finishMs - Lap finish timestamp
 * @returns {Object} Derived lap summary fields
 */
export function deriveLapSummary(samples, startMs, finishMs) {
    const windowSamples = (Array.isArray(samples) ? samples : [])
        .filter((sample) => {
            const ts = toFiniteNumber(sample?.timestamp)
            return ts !== null && ts >= startMs && ts <= finishMs
        })
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    const averageField = (key) => {
        const values = windowSamples
            .map((sample) => toFiniteNumber(sample?.[key]))
            .filter((value) => value !== null)
        if (values.length === 0) return undefined
        return values.reduce((sum, value) => sum + value, 0) / values.length
    }

    const derived = {
        LL_Time: Math.max(0, (finishMs - startMs) / 1000),
        LL_V: averageField('voltage'),
        LL_I: averageField('current'),
        LL_RPM: averageField('rpm'),
        LL_Spd: averageField('speed')
    }

    const powerSamples = windowSamples
        .map((sample) => {
            const voltage = toFiniteNumber(sample?.voltage)
            const current = toFiniteNumber(sample?.current)
            if (voltage === null || current === null) return null
            return Math.max(0, voltage * current)
        })
        .filter((powerW) => powerW !== null)

    if (powerSamples.length > 0) {
        derived.LL_PeakW = Math.max(...powerSamples)
    }

    const ampHSeries = windowSamples
        .map((sample) => ({
            timestamp: toFiniteNumber(sample?.timestamp),
            ampH: toFiniteNumber(sample?.ampH)
        }))
        .filter((sample) => sample.timestamp !== null && sample.ampH !== null)

    if (ampHSeries.length >= 2) {
        const ampHDelta = ampHSeries[ampHSeries.length - 1].ampH - ampHSeries[0].ampH
        if (Number.isFinite(ampHDelta) && ampHDelta >= 0) {
            derived.LL_Ah = ampHDelta
        }
    }

    let integratedWh = 0
    for (let index = 0; index < windowSamples.length - 1; index += 1) {
        const sample = windowSamples[index]
        const nextSample = windowSamples[index + 1]
        const t0 = toFiniteNumber(sample?.timestamp)
        const t1 = toFiniteNumber(nextSample?.timestamp)
        const voltage = toFiniteNumber(sample?.voltage)
        const current = toFiniteNumber(sample?.current)
        if (t0 === null || t1 === null || voltage === null || current === null) continue
        const dtMs = t1 - t0
        if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 10000) continue
        const powerW = Math.max(0, voltage * current)
        integratedWh += powerW * (dtMs / 3600000)
    }

    if (integratedWh > 0) {
        derived.LL_Wh = integratedWh
    }

    if (!Number.isFinite(derived.LL_Ah)) {
        const meanVoltage = averageField('voltage')
        if (Number.isFinite(integratedWh) && integratedWh > 0 && Number.isFinite(meanVoltage) && meanVoltage > 0) {
            derived.LL_Ah = integratedWh / meanVoltage
        }
    }

    // Quantize derived lap metrics to policy precision before export.
    if (Number.isFinite(derived.LL_V)) derived.LL_V = roundMetric(derived.LL_V, 'voltage')
    if (Number.isFinite(derived.LL_I)) derived.LL_I = roundMetric(derived.LL_I, 'current')
    if (Number.isFinite(derived.LL_Spd)) derived.LL_Spd = roundMetric(derived.LL_Spd, 'voltage')
    if (Number.isFinite(derived.LL_RPM)) derived.LL_RPM = roundMetric(derived.LL_RPM, 'integer')
    if (Number.isFinite(derived.LL_PeakW)) derived.LL_PeakW = roundMetric(derived.LL_PeakW, 'powerW')
    if (Number.isFinite(derived.LL_Ah)) derived.LL_Ah = roundMetric(derived.LL_Ah, 'current')
    if (Number.isFinite(derived.LL_Wh)) derived.LL_Wh = roundMetric(derived.LL_Wh, 'energyWh')

    return Object.fromEntries(Object.entries(derived).filter(([, value]) => value !== undefined))
}

/**
 * @brief Rebuild race sessions from telemetry samples with LL priority.
 * @description Pass 1 ingests authoritative LL_* summaries; pass 2 derives missing
 *              laps from currLap transitions when no meaningful LL summary exists.
 * @param {Array<Object>} samples - Telemetry samples (sorted or unsorted)
 * @param {Object} [options] - Rebuild options
 * @param {number} [options.minDerivedLapMs=5000] - Minimum derived lap duration
 * @param {Object} [options.seedSessions={}] - Existing sessions to preserve
 * @returns {Object} Rebuilt sessions map
 */
export function rebuildRaceSessionsFromSamples(samples, options = {}) {
    const minDerivedLapMs = Number.isFinite(options.minDerivedLapMs) ? Math.max(0, options.minDerivedLapMs) : 5000
    const sortedSamples = (Array.isArray(samples) ? samples : [])
        .filter((sample) => sample && typeof sample === 'object' && Number.isFinite(Number(sample.timestamp)))
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))

    const sessions = cloneSessions(options.seedSessions || {})

    sortedSamples.forEach((sample) => {
        updateRaceSessions(sessions, sample, sample?.currLap)
    })

    const boundaries = detectLapBoundaries(sortedSamples, { minDerivedLapMs })

    boundaries.forEach((boundary) => {
        const { currentRace } = getCurrentRace(sessions)
        const shouldCreateNewRace = shouldStartNewRace(currentRace, boundary.lapNumber)

        let activeRace = currentRace
        if (shouldCreateNewRace) {
            const startTime = Number(boundary.startTime)
            sessions[startTime] = createRaceSession(startTime, boundary.trackName)
            activeRace = sessions[startTime]
        } else if (activeRace && !activeRace.trackName && boundary.trackName) {
            activeRace.trackName = boundary.trackName
        }

        if (!activeRace) return

        const derivedSummary = deriveLapSummary(sortedSamples, boundary.startTime, boundary.finishTime)
        const existingLap = activeRace.laps?.[boundary.lapNumber]
        const existingLapSummary = extractLapSummary(existingLap || {}).lapData
        if (existingLap && hasMeaningfulLapSummary(existingLapSummary)) {
            // Preserve authoritative device LL_* metrics, but backfill new derived
            // fields when they are not provided by the sender.
            const nextLap = { ...existingLap }
            if (toFiniteNumber(nextLap.LL_PeakW) === null && toFiniteNumber(derivedSummary.LL_PeakW) !== null) {
                nextLap.LL_PeakW = derivedSummary.LL_PeakW
            }
            if (toFiniteNumber(nextLap.LL_Wh) === null && toFiniteNumber(derivedSummary.LL_Wh) !== null) {
                nextLap.LL_Wh = derivedSummary.LL_Wh
            }
            activeRace.laps[boundary.lapNumber] = Object.freeze(nextLap)
            return
        }

        const derivedLap = {
            ...derivedSummary,
            lapNumber: boundary.lapNumber,
            startTime: boundary.startTime,
            finishTime: boundary.finishTime,
            lapSummarySource: 'derived'
        }

        activeRace.laps[boundary.lapNumber] = Object.freeze(derivedLap)
    })

    return sessions
}

/**
 * @brief Update race session data with a new telemetry packet.
 * @description Analyzes incoming telemetry packets for lap completion data (LL_* keys)
 *              and maintains a hierarchical structure of race sessions and laps.
 *              Automatically detects new races based on lap number patterns:
 *              - Lap number less than last recorded lap (reset)
 *              - Lap 1 received when last recorded lap was > 1 (new race)
 *              - No existing race session exists
 * 
 *              The session structure is:
 *              ```
 *              {
 *                [raceStartTimeMs]: {
 *                  id: number,
 *                  startTimeMs: number,
 *                  startTimeIso: string,
 *                  trackName: string|null,
 *                  laps: {
 *                    [lapNumber]: {
 *                      LL_V, LL_I, LL_RPM, LL_Spd, LL_Ah, LL_Time, LL_Eff,
 *                      lapNumber, startTime, finishTime
 *                    }
 *                  }
 *                }
 *              }
 *              ```
 * 
 * @param {Object} sessions - Existing sessions object to update (mutated in place)
 * @param {Object} packet - Telemetry packet containing potential lap data
 * @param {number} packet.timestamp - Packet timestamp in milliseconds
 * @param {number} [packet.currLap] - Current lap number
 * @param {number} [packet.LL_V] - Last Lap average voltage
 * @param {number} [packet.LL_I] - Last Lap average current
 * @param {number} [packet.LL_RPM] - Last Lap average RPM
 * @param {number} [packet.LL_Spd] - Last Lap average speed
 * @param {number} [packet.LL_Ah] - Last Lap amp-hours consumed
 * @param {number} [packet.LL_Time] - Last Lap time in seconds
 * @param {number} [packet.LL_Eff] - Last Lap efficiency
 * @param {string} [packet.track] - Track name (various key formats supported)
 * @param {number} lastLapIndex - Previously recorded lap index (currently unused)
 * @returns {Object} Updated sessions object
 */
export function updateRaceSessions(sessions, packet, lastLapIndex) {
    const { lapData, hasLapKeys } = extractLapSummary(packet)

    // Only proceed if we have lap completion data, it's not lap 0,
    // and the LL_* payload is meaningful (not zero placeholders).
    if (!hasLapKeys || packet.currLap === 0) return sessions
    if (!hasMeaningfulLapSummary(lapData)) return sessions

    const timestamp = packet.timestamp || Date.now()
    const lapNumber = packet.currLap

    // Get current active race (the one with the latest start time)
    let { currentRace } = getCurrentRace(sessions)
    const isNewRace = shouldStartNewRace(currentRace, lapNumber)

    // Helper to find track name
    const trackName = packet.track || null

    if (isNewRace) {
        const durationMs = Number((lapData.LL_Time || 0) * 1000)
        const startTime = Number(timestamp - durationMs)

        sessions[startTime] = createRaceSession(startTime, trackName)
        currentRace = sessions[startTime]
        lapData.startTime = startTime
    } else {
        if (!currentRace) return sessions

        // Chain to previous lap finish time
        const prevLap = currentRace.laps[lapNumber - 1]
        lapData.startTime = prevLap ? prevLap.finishTime : currentRace.startTimeMs

        // Update track name if it was missing and now appears
        if (!currentRace.trackName && trackName) {
            currentRace.trackName = trackName
        }
    }

    // Store lap
    if (!currentRace) return sessions
    lapData.lapNumber = lapNumber
    lapData.finishTime = timestamp
    lapData.lapSummarySource = 'device'
    currentRace.laps[lapNumber] = Object.freeze(lapData)

    return sessions
}
