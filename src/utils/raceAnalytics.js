/**
 * Handles the logic for detecting races and laps from telemetry packets.
 * Maintains a hierarchical structure: { [raceStartTime]: { startTime, laps: { [lapNum]: data } } }
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

    if (isNewRace) {
        const durationMs = Number((lapData.LL_Time || 0) * 1000)
        const startTime = Number(timestamp - durationMs)

        sessions[startTime] = {
            id: startTime,
            startTimeMs: startTime,
            startTimeIso: new Date(startTime).toISOString(),
            laps: {}
        }
        currentRace = sessions[startTime]
        lapData.startTime = startTime
    } else {
        // Chain to previous lap finish time
        const prevLap = currentRace.laps[lapNumber - 1]
        lapData.startTime = prevLap ? prevLap.finishTime : currentRace.startTimeMs
    }

    // Store lap
    lapData.lapNumber = lapNumber
    lapData.finishTime = timestamp
    currentRace.laps[lapNumber] = Object.freeze(lapData)

    return sessions
}
