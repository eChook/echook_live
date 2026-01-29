/**
 * @file raceAnalytics.js
 * @brief Race session detection and lap tracking utilities.
 * @description Provides logic for detecting race sessions and tracking lap data
 *              from incoming telemetry packets. Maintains a hierarchical structure
 *              of race sessions with associated lap information.
 */

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
    const LAP_KEYS = new Set(['LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_Time', 'LL_Eff'])

    // Extract LL_ data
    let hasLapKeys = false
    const lapData = {}
    LAP_KEYS.forEach(k => {
        if (packet[k] !== undefined) {
            lapData[k] = packet[k]
            hasLapKeys = true
        }
    })

    // Only proceed if we have lap completion data and it's not lap 0
    if (!hasLapKeys || packet.currLap === 0) return sessions

    const timestamp = packet.timestamp || Date.now()
    const lapNumber = packet.currLap

    // Get current active race (the one with the latest start time)
    const sessionKeys = Object.keys(sessions).sort((a, b) => b - a)
    let currentStartTime = sessionKeys[0]
    let currentRace = currentStartTime ? sessions[currentStartTime] : null

    // Check for New Race (Induction)
    const laps = currentRace ? Object.values(currentRace.laps).sort((a, b) => a.lapNumber - b.lapNumber) : []
    const lastRecordedLap = laps.length > 0 ? laps[laps.length - 1].lapNumber : 0

    const isNewRace = !currentRace || (lapNumber < lastRecordedLap) || (lapNumber === 1 && lastRecordedLap > 1)

    // Helper to find track name
    const trackName = packet.track || null

    if (isNewRace) {
        const durationMs = Number((lapData.LL_Time || 0) * 1000)
        const startTime = Number(timestamp - durationMs)

        sessions[startTime] = {
            id: startTime,
            startTimeMs: startTime,
            startTimeIso: new Date(startTime).toISOString(),
            trackName: trackName, // Store track name if available
            laps: {}
        }
        currentRace = sessions[startTime]
        lapData.startTime = startTime
    } else {
        // Chain to previous lap finish time
        const prevLap = currentRace.laps[lapNumber - 1]
        lapData.startTime = prevLap ? prevLap.finishTime : currentRace.startTimeMs

        // Update track name if it was missing and now appears
        if (!currentRace.trackName && trackName) {
            currentRace.trackName = trackName
        }
    }

    // Store lap
    lapData.lapNumber = lapNumber
    lapData.finishTime = timestamp
    currentRace.laps[lapNumber] = Object.freeze(lapData)

    return sessions
}
