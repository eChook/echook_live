import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io } from 'socket.io-client'
import axios from 'axios'
import { useAuthStore } from './auth'

export const useTelemetryStore = defineStore('telemetry', () => {
    const socket = ref(null)
    const isConnected = ref(false)
    const lastPacketTime = ref(0) // Timestamp of last received packet
    const liveData = ref({}) // Latest packet
    const history = ref([]) // Array of { timestamp, ...data }
    const lapHistory = ref([]) // Array of lap data
    const auth = useAuthStore()

    // Constants
    const MAX_HISTORY_POINTS = 50000

    // Allowed keys configuration
    const REGULAR_KEYS = new Set([
        'voltage', 'current', 'voltageLower',
        'rpm', 'speed', 'throttle',
        'temp1', 'temp2', 'ampH', 'currLap',
        'gear', 'brake', 'lon', 'lat'
    ])

    const LAP_KEYS = new Set([
        'LL_Time', 'LL_V', 'LL_I',
        'LL_RPM', 'LL_Spd', 'LL_Ah'
    ])

    // Computed: Get array of keys present in data for UI toggles
    const availableKeys = computed(() => {
        // Collect all keys from liveData
        const keys = new Set()

        // Add keys from live data if they are in REGULAR_KEYS
        Object.keys(liveData.value).forEach(k => {
            if (REGULAR_KEYS.has(k)) keys.add(k)
        })

        // Also check recent history to ensure we don't drop keys that might be momentarily missing/null
        // but only if they are allowed
        if (history.value.length > 0) {
            Object.keys(history.value[history.value.length - 1]).forEach(k => {
                if (REGULAR_KEYS.has(k)) keys.add(k)
            })
        }

        return Array.from(keys)
    })

    // Race State
    const races = ref([]) // Array of { id, startTime, laps: [] }
    const currentLapIndex = ref(0)

    function processLapData(packet) {
        // Update current lap index from regular data if present
        if (packet.currLap !== undefined) {
            currentLapIndex.value = packet.currLap
        }

        // Check for Lap Data
        let hasLapKeys = false
        const lapData = {}
        LAP_KEYS.forEach(k => {
            if (packet[k] !== undefined) {
                lapData[k] = packet[k]
                hasLapKeys = true
            }
        })

        if (hasLapKeys) {
            // Logic: Lap Number = currLap
            const lapNumber = (packet.currLap !== undefined ? packet.currLap : currentLapIndex.value)

            lapData.lapNumber = lapNumber
            lapData.timestamp = packet.timestamp || Date.now()

            // Race Detection
            let currentRace = races.value.length > 0 ? races.value[races.value.length - 1] : null

            // Check for duplicate lap
            const lastRecordedLap = currentRace && currentRace.laps.length > 0
                ? currentRace.laps[currentRace.laps.length - 1].lapNumber
                : -1

            // Simple race detection:
            // 1. If races is empty, start race.
            // 2. If lapNumber < lastRecordedLap (and not duplicate 1), start new race.
            // 3. If lapNumber <= 1 and lastRecordedLap > 1, start new race.

            let shouldStartNewRace = false
            if (!currentRace) shouldStartNewRace = true
            else if (lapNumber <= 1 && lastRecordedLap > 1) shouldStartNewRace = true
            else if (lapNumber < lastRecordedLap && lapNumber === 1) shouldStartNewRace = true

            // Ignore duplicates within the same race
            // If we are getting the SAME lap number as lastRecordedLap, it's a duplicate.
            const isDuplicate = currentRace && !shouldStartNewRace && (lastRecordedLap === lapNumber)

            if (shouldStartNewRace) {
                // Calculate Start Time: timestamp - LL_Time (assuming LL_Time is in seconds, converting to ms)
                const lapDurationMs = (lapData.LL_Time || 0) * 1000
                const raceStart = lapData.timestamp - lapDurationMs

                currentRace = {
                    id: Date.now() + Math.random(), // Unique ID
                    startTime: new Date(raceStart).toISOString(),
                    startTimeMs: raceStart,
                    laps: []
                }
                races.value.push(currentRace)
            }

            if (!isDuplicate) {
                // Add lap to current race
                currentRace.laps.push(Object.freeze(lapData))

                // Keep flat lapHistory for backward compatibility if needed
                lapHistory.value.push(Object.freeze(lapData))
            }
        }
    }

    function connect() {
        if (socket.value?.connected) return

        socket.value = io('http://localhost:3000')

        socket.value.on('connect', () => {
            isConnected.value = true
            console.log('Socket connected')
            // Join the room for the specific car if user is valid
            // Note: API doc says emit 'join' with Car ID. 
            // So use auth.user.id
            if (auth.user?.id || auth.user?._id) {
                joinRoom(auth.user.id || auth.user._id)
            }
        })

        socket.value.on('disconnect', () => {
            isConnected.value = false
            console.log('Socket disconnected')
        })

        socket.value.on('data', (packet) => {
            if (isPaused.value) return

            // Prefer server/packet timestamp to align with history
            const timestamp = packet.timestamp || packet.updated || Date.now()

            // 1. Process Regular Data
            const regularPacket = {}
            let hasRegularData = false

            // Normalize Capitalized Keys if present
            if (packet['Lon'] !== undefined) packet['lon'] = packet['Lon']
            if (packet['Lat'] !== undefined) packet['lat'] = packet['Lat']

            REGULAR_KEYS.forEach(key => {
                // Check for key in packet (or normalized versions if needed)
                if (packet[key] !== undefined) {
                    regularPacket[key] = packet[key]
                    hasRegularData = true
                }
            })

            // Always preserve timestamp and lat/lon for map if they exist in original packet 
            // even if not explicitly in REGULAR_KEYS (though Lat/Lon are in there)
            regularPacket.timestamp = timestamp
            // Ensure lat/lon are implicitly added if they exist, to ensure map works even if not in REGULAR_KEYS
            if (packet.lat !== undefined) regularPacket.lat = packet.lat
            if (packet.lon !== undefined) regularPacket.lon = packet.lon

            if (hasRegularData) {
                // freeze to prevent Vue from making this deeply reactive (performance)
                const processed = Object.freeze(regularPacket)

                liveData.value = processed
                lastPacketTime.value = timestamp

                // Buffer history
                history.value.push(processed)
                // Limit history size
                const LIMIT = Math.max(MAX_HISTORY_POINTS, 5000)
                if (history.value.length > LIMIT) {
                    history.value.shift()
                }
            }

            // 2. Process Lap Data (Logic moved to helper)
            // We pass the RAW packet because processLapData needs to check both currLap and LL_ keys
            // But ensure we pass the normalized timestamp too
            processLapData({ ...packet, timestamp })
        })
    }

    function joinRoom(carId) {
        if (socket.value && isConnected.value) {
            console.log('Joining room for:', carId)
            socket.value.emit('join', carId)
            fetchHistory(carId)
        }
    }

    function leaveRoom(carId) {
        if (socket.value) {
            socket.value.emit('leave', carId)
        }
    }

    function disconnect() {
        if (socket.value) {
            socket.value.disconnect()
            socket.value = null
            isConnected.value = false
        }
    }

    function clearHistory() {
        history.value = []
    }

    const isPaused = ref(false)
    const availableDays = ref(new Set()) // Set of YYYY-MM-DD

    // Getters for header
    const earliestTime = computed(() => {
        if (history.value.length === 0) return null
        return history.value[0].timestamp
    })

    const latestTime = computed(() => {
        if (history.value.length === 0) return null
        return history.value[history.value.length - 1].timestamp
    })

    async function togglePause() {
        const wasPaused = isPaused.value
        isPaused.value = !isPaused.value

        // If we are RESUMING (switching from true to false)
        if (wasPaused && !isPaused.value) {
            // Check if we are "Live" (i.e. viewing today's data) or just paused on today
            // If we are viewing history (different day), we probably shouldn't auto-fill gap 
            // unless we are sure. But usually 'Reset to Live' handles different days.
            // So here we assume if we are just toggling pause, we want to fill the gap.

            const lastTime = latestTime.value
            if (lastTime && auth.user?.id) {
                const today = new Date().toDateString()
                const lastDate = new Date(lastTime).toDateString()

                // Only fill gap if we are on the same day
                if (today === lastDate) {
                    const now = Date.now()
                    console.log(`Resuming live... fetching gap from ${new Date(lastTime).toLocaleTimeString()} to ${new Date(now).toLocaleTimeString()}`)

                    // Use prepend=true to force merge strategy in fetchHistory
                    await fetchHistory(auth.user.id, lastTime, now, true)
                }
            }
        }
    }

    async function fetchAvailableDays(carId) {
        if (!carId) return
        try {
            const response = await axios.get(`http://localhost:3000/api/history/days/${carId}`)
            if (Array.isArray(response.data)) {
                availableDays.value = new Set(response.data)
            }
        } catch (error) {
            console.error('Failed to fetch available days:', error)
        }
    }

    // Load extra history BEFORE the current earliest point
    async function loadExtraHistory(carId, minutes) {
        if (!carId || !earliestTime.value) return

        const currentStart = earliestTime.value
        const newStart = currentStart - (minutes * 60 * 1000)

        await fetchHistory(carId, newStart, currentStart, true) // true = prepend
    }

    // Load a specific day (clears existing)
    async function loadDay(carId, dateString) {
        if (!carId) return

        // Parse dateString (YYYY-MM-DD) to start/end timestamps
        const start = new Date(dateString).setHours(0, 0, 0, 0)
        const end = new Date(dateString).setHours(23, 59, 59, 999)

        // Pause live feed implicitly when viewing history? 
        // User requirements imply separating live vs history mode via the prompt "modal... remove all currently loaded data"
        isPaused.value = true
        clearHistory()

        await fetchHistory(carId, start, end)
    }

    // Reset to Live Mode (Clear history, load recent)
    async function resetToLive(carId) {
        if (!carId) return

        isPaused.value = false // Resume live updates
        clearHistory() // Clear all data

        // Load last 30 mins
        await fetchHistory(carId)
    }

    async function fetchHistory(carId, start = null, end = null, prepend = false) {
        if (!carId) return

        // Default: last 30 mins if no start provided
        const startTime = start || (Date.now() - 30 * 60 * 1000)

        const params = { start: startTime }
        if (end) params.end = end

        try {
            const response = await axios.get(`http://localhost:3000/api/history/${carId}`, {
                params
            })

            if (response.data && Array.isArray(response.data)) {
                const dataMap = new Map()

                // Normalize incoming
                const incoming = response.data.map(pt => Object.freeze({
                    ...pt,
                    timestamp: pt.timestamp || pt.updated
                })).filter(pt => pt.timestamp) // Ensure timestamp exists

                // Merge strategy
                if (prepend) {
                    // Combine incoming + existing
                    // Use Map to dedupe based on timestamp
                    incoming.forEach(pt => dataMap.set(pt.timestamp, pt))
                    history.value.forEach(pt => dataMap.set(pt.timestamp, pt))
                } else {
                    // Just replace (or initial load)
                    incoming.forEach(pt => dataMap.set(pt.timestamp, pt))
                    // If we weren't prepending, we might still want to merge if we didn't clear? 
                    // But usually fetchHistory called after clear or for specific range.
                    // If we are strictly loading a range (loadDay), we already cleared.
                }

                // Convert back to array and sort
                history.value = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp)

                // Re-process history for laps/races
                // We must rebuild ALL race logic when history changes to ensure continuity
                races.value = []
                lapHistory.value = []
                currentLapIndex.value = 0

                history.value.forEach(pt => {
                    processLapData(pt)
                })

                console.log(`Loaded ${incoming.length} historical points. Total: ${history.value.length}`)
            }
        } catch (error) {
            console.error('Failed to fetch history:', error)
        }
    }

    return {
        socket,
        isConnected,
        lastPacketTime,
        liveData,
        history,
        lapHistory,
        races,
        availableKeys,
        isPaused, // Export
        availableDays, // Export
        earliestTime,
        latestTime,
        connect,
        joinRoom,
        leaveRoom,
        disconnect,
        clearHistory,
        fetchHistory,
        togglePause,
        fetchAvailableDays,
        loadExtraHistory,
        loadDay,
        resetToLive
    }
})
