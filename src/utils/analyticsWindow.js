/**
 * @file analyticsWindow.js
 * @brief Pure helpers for analytics sample window selection.
 * @description Snaps chart clicks to telemetry timestamps, filters samples,
 *              and tests lap overlap against a time window.
 */

/** @brief Maximum points used when downsampling voltage preview series. */
export const ANALYTICS_VOLTAGE_CHART_MAX_POINTS = 500

/**
 * @brief Parse a value to finite number.
 * @param {unknown} value - Candidate numeric value
 * @returns {number|null} Finite number or null
 */
function toFiniteNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * @brief Snap a candidate timestamp to the nearest sample timestamp.
 * @param {number} candidateMs - Click or drag position in ms
 * @param {Array<{timestamp: number}>} samples - Sorted telemetry samples
 * @returns {number|null} Nearest sample timestamp or null
 */
export function snapToNearestSampleTimestamp(candidateMs, samples) {
    if (!Number.isFinite(candidateMs) || !Array.isArray(samples) || samples.length === 0) {
        return null
    }

    let left = 0
    let right = samples.length - 1

    while (left < right) {
        const mid = Math.floor((left + right) / 2)
        const midTs = toFiniteNumber(samples[mid]?.timestamp)
        if (midTs === null) {
            right = mid
            continue
        }
        if (midTs < candidateMs) {
            left = mid + 1
        } else {
            right = mid
        }
    }

    const candidates = []
    for (let index = Math.max(0, left - 1); index <= Math.min(samples.length - 1, left + 1); index += 1) {
        const ts = toFiniteNumber(samples[index]?.timestamp)
        if (ts !== null) candidates.push(ts)
    }
    if (candidates.length === 0) return null

    return candidates.reduce((best, ts) =>
        Math.abs(ts - candidateMs) < Math.abs(best - candidateMs) ? ts : best
    )
}

/**
 * @brief Resolve start/end after dragging a window marker onto a snapped timestamp.
 * @param {'start'|'end'} marker - Marker being dragged
 * @param {number} snappedMs - Snapped sample timestamp
 * @param {number|null} startMs - Current start marker
 * @param {number|null} endMs - Current end marker
 * @param {Array<{timestamp: number}>} samples - Sorted telemetry samples
 * @param {boolean} allowEndSelection - Whether end marker is active (history mode)
 * @returns {{startMs: number|null, endMs: number|null}} Updated marker timestamps
 */
export function applyDraggedMarker(marker, snappedMs, startMs, endMs, samples, allowEndSelection) {
    if (!Number.isFinite(snappedMs)) {
        return { startMs, endMs }
    }

    if (!allowEndSelection) {
        return { startMs: snappedMs, endMs }
    }

    const timestamps = (samples || [])
        .map((sample) => toFiniteNumber(sample?.timestamp))
        .filter((ts) => ts !== null)
        .sort((a, b) => a - b)

    const findNextAfter = (ms) => {
        for (let i = 0; i < timestamps.length; i += 1) {
            if (timestamps[i] > ms) return timestamps[i]
        }
        return timestamps[timestamps.length - 1] ?? ms
    }

    const findPrevBefore = (ms) => {
        for (let i = timestamps.length - 1; i >= 0; i -= 1) {
            if (timestamps[i] < ms) return timestamps[i]
        }
        return timestamps[0] ?? ms
    }

    if (marker === 'start') {
        let nextStart = snappedMs
        let nextEnd = endMs
        if (Number.isFinite(nextEnd) && nextStart >= nextEnd) {
            // Prefer advancing end; when start is at/after the last sample, findNextAfter
            // returns that same timestamp and cannot widen the window on its own.
            nextEnd = findNextAfter(nextStart)
            if (nextEnd <= nextStart) {
                nextStart = findPrevBefore(nextEnd)
            }
        }
        return { startMs: nextStart, endMs: nextEnd }
    }

    let nextEnd = snappedMs
    let nextStart = startMs
    if (Number.isFinite(nextStart) && nextEnd <= nextStart) {
        // Mirror start handling: pull start back first, then advance end if needed.
        nextStart = findPrevBefore(nextEnd)
        if (nextEnd <= nextStart) {
            nextEnd = findNextAfter(nextStart)
        }
    }
    return { startMs: nextStart, endMs: nextEnd }
}

/**
 * @brief Filter telemetry samples to an inclusive timestamp window.
 * @param {Array<Object>} samples - Telemetry samples with timestamp field
 * @param {number} startMs - Window start (inclusive)
 * @param {number} endMs - Window end (inclusive)
 * @returns {Array<Object>} Samples inside the window
 */
export function filterSamplesByWindow(samples, startMs, endMs) {
    if (!Array.isArray(samples) || samples.length === 0) return []
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return []

    return samples.filter((sample) => {
        const ts = toFiniteNumber(sample?.timestamp)
        return ts !== null && ts >= startMs && ts <= endMs
    })
}

/**
 * @brief Clamp analytics window bounds to loaded telemetry range.
 * @param {number} startMs - Candidate start
 * @param {number} endMs - Candidate end
 * @param {number|null} oldestMs - Oldest sample timestamp
 * @param {number|null} latestMs - Latest sample timestamp
 * @returns {{startMs: number, endMs: number}|null} Clamped bounds or null when invalid
 */
export function clampWindowBounds(startMs, endMs, oldestMs, latestMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return null
    }

    let start = startMs
    let end = endMs
    if (Number.isFinite(oldestMs)) start = Math.max(start, oldestMs)
    if (Number.isFinite(latestMs)) end = Math.min(end, latestMs)
    if (end <= start) return null
    return { startMs: start, endMs: end }
}

/**
 * @brief True when a lap's start/finish interval overlaps the analytics window.
 * @param {Object} lap - Lap summary with start/finish timestamps
 * @param {number} startMs - Window start (inclusive)
 * @param {number} endMs - Window end (inclusive)
 * @returns {boolean} True when lap overlaps the window
 */
export function lapOverlapsWindow(lap, startMs, endMs) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        return false
    }

    const lapStart = toFiniteNumber(lap?.startTime ?? lap?.startTimeMs)
    const lapEnd = toFiniteNumber(lap?.finishTime)
    if (lapStart === null || lapEnd === null) return false
    return lapEnd >= startMs && lapStart <= endMs
}

/**
 * @brief Build sorted [timestamp, voltage] pairs for the window picker chart.
 * @param {Array<Object>} samples - Full display history
 * @param {number} [maxPoints=ANALYTICS_VOLTAGE_CHART_MAX_POINTS] - Decimation cap
 * @returns {Array<[number, number]>} ECharts time-series data
 */
export function buildVoltageChartSeries(samples, maxPoints = ANALYTICS_VOLTAGE_CHART_MAX_POINTS) {
    if (!Array.isArray(samples) || samples.length === 0) return []

    const valid = samples
        .map((sample) => {
            const timestamp = toFiniteNumber(sample?.timestamp)
            const voltage = sample?.voltage
            if (timestamp === null || !Number.isFinite(voltage)) return null
            return [timestamp, voltage]
        })
        .filter(Boolean)

    if (valid.length <= maxPoints) return valid

    const step = Math.ceil(valid.length / maxPoints)
    const decimated = []
    for (let i = 0; i < valid.length; i += step) {
        decimated.push(valid[i])
    }
    const last = valid[valid.length - 1]
    if (decimated[decimated.length - 1]?.[0] !== last[0]) {
        decimated.push(last)
    }
    return decimated
}

/**
 * @brief Resolve lap-mode history session bounds for a selected race key.
 * @param {Array<Object>} sortedRaces - Races sorted newest first
 * @param {string|null} selectedRaceKey - Selected race startTimeMs as string
 * @param {number} latestMs - Latest packet timestamp
 * @returns {{startMs: number, endMs: number}|null} Session bounds or null
 */
export function resolveLapHistoryBounds(sortedRaces, selectedRaceKey, latestMs) {
    if (!Array.isArray(sortedRaces) || sortedRaces.length === 0 || !selectedRaceKey) {
        return null
    }

    const raceStart = Number(selectedRaceKey)
    const selectedIndex = sortedRaces.findIndex((race) => race.startTimeMs === raceStart)
    if (selectedIndex < 0) return null

    const race = sortedRaces[selectedIndex]
    // Races are sorted newest-first; the chronologically next session is at index - 1.
    const nextNewerRace = sortedRaces[selectedIndex - 1]
    const startMs = race.startTimeMs
    const endMs = nextNewerRace ? nextNewerRace.startTimeMs : latestMs
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return null
    }
    return { startMs, endMs }
}
