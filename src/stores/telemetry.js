import { defineStore } from 'pinia'
import { ref, computed, watch, shallowRef } from 'vue'
import { io } from 'socket.io-client'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import { API_BASE_URL, WS_URL } from '../config'
import { updateRaceSessions } from '../utils/raceAnalytics'
import { api, decodeMsgpack, socketMsgpackOptions } from '../utils/msgpack'
import { scalePacket } from '../utils/unitConversions'

export const useTelemetryStore = defineStore('telemetry', () => {
    const socket = ref(null)
    const isConnected = ref(false)
    const now = ref(Date.now()) // Reactive time for staleness tracking

    // Update 'now' every second
    setInterval(() => {
        now.value = Date.now()
    }, 1000)
    const lastPacketTime = ref(0)

    const isDataStale = computed(() => {
        if (!isConnected.value) return true
        if (lastPacketTime.value === 0) return true
        return (now.value - lastPacketTime.value) > 5000
    })
    const liveData = ref({}) // Latest packet
    const history = shallowRef([]) // Array of pre-scaled { timestamp, ...data }
    const lastChartUpdate = ref(0)
    const lapHistory = ref([]) // Array of lap data (sequential for backup)
    const chartZoomRequest = ref(null) // { start: ms, end: ms, id: number }

    function requestChartZoom(start, end) {
        chartZoomRequest.value = { start, end, id: Date.now() }
    }

    // 3. Admin / Viewing State
    const viewingCar = ref(null) // { id, carName, teamName, number }

    // -- Persistent Settings Proxy --
    const settings = useSettingsStore()

    // We proxy these so we don't have to update every component immediately
    const maxHistoryPoints = computed({
        get: () => settings.maxHistoryPoints,
        set: (val) => { settings.maxHistoryPoints = val }
    })
    const graphSettings = computed(() => settings.graphSettings)
    const unitSettings = computed(() => settings.unitSettings)
    const races = computed({
        get: () => settings.races,
        set: (val) => { settings.races = val }
    })

    watch(() => settings.maxHistoryPoints, (val) => {
        if (history.value.length > val) {
            history.value = history.value.slice(history.value.length - val)
        }
    })

    watch(() => settings.unitSettings, () => {
        // console.log('Units changed, clearing history to refresh data...')
        clearHistory()
    }, { deep: true })


    // Allowed keys configuration
    const REGULAR_KEYS = new Set([
        'voltage', 'current', 'voltageLower', 'voltageHigh', 'voltageDiff',
        'rpm', 'speed', 'throttle',
        'temp1', 'temp2', 'tempDiff', 'ampH', 'currLap',
        'gear', 'brake', 'lon', 'lat'
    ])

    const LAP_KEYS = new Set([
        'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_Time', 'LL_Eff'
    ])

    // Human-readable display names for telemetry keys
    const KEY_DISPLAY_NAMES = {
        voltage: 'Voltage',
        current: 'Current',
        voltageLower: 'V_Batt Low',
        voltageHigh: 'V_Batt High',
        voltageDiff: 'V_Batt Diff',
        rpm: 'RPM',
        speed: 'Speed',
        throttle: 'Throttle',
        temp1: 'Temp 1',
        temp2: 'Temp 2',
        tempDiff: 'Temp Diff',
        ampH: 'Amp Hours',
        currLap: 'Current Lap',
        gear: 'Gear',
        brake: 'Brake',
        lat: 'Latitude',
        lon: 'Longitude'
    }

    // Descriptions for tooltips
    const KEY_DESCRIPTIONS = {
        voltage: 'Total battery voltage (24V Nominal)',
        current: 'Current draw from the battery',
        voltageLower: 'Lower battery voltage (The GND-12V battery)',
        voltageHigh: 'Upper battery voltage (The 12v-24v battery)',
        voltageDiff: 'Difference between Upper and Lower batteries (+ve if Upper > Lower)',
        rpm: 'Motor revolutions per minute',
        speed: 'Vehicle speed',
        throttle: 'Throttle position (0-100%)',
        temp1: 'Primary temperature sensor (typically motor)',
        temp2: 'Secondary temperature sensor',
        tempDiff: 'Absolute difference between the two temperatures',
        ampH: 'Cumulative amp-hours consumed this session',
        currLap: 'Current lap number',
        gear: 'Current gear selection',
        brake: 'Brake status (1 = engaged, 0 = released)',
        lat: 'GPS latitude coordinate',
        lon: 'GPS longitude coordinate'
    }

    // Helper: Get display name for a key
    const getDisplayName = (key) => KEY_DISPLAY_NAMES[key] || key
    const getDescription = (key) => KEY_DESCRIPTIONS[key] || ''

    // Wrapper to inject current unitSettings into scalePacket
    const scalePacketWithUnits = (pt) => scalePacket(pt, unitSettings.value)

    // Computed: Display Live Data (Converted Units)
    const displayLiveData = computed(() => {
        const pt = liveData.value
        if (!pt) return {}
        return scalePacketWithUnits(pt)
    })


    // Display order for keys
    const KEY_ORDER = [
        'voltage', 'current', 'ampH',
        'speed', 'rpm', 'throttle', 'voltageLower',
        'voltageHigh', 'voltageDiff', 'gear', 'brake',
        'temp1', 'temp2', 'tempDiff',
        'currLap', 'lat', 'lon'
    ]

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

        // Return in preferred order, filtering to only available keys
        return KEY_ORDER.filter(k => keys.has(k))
    })

    // Computed: Generate markArea data for ECharts lap highlights
    const lapMarkAreas = computed(() => {
        const areas = []
        const isValidTs = (ts) => ts && Number.isFinite(ts) && ts > 946684800000

        let lastFinish = null

        // Sort races by start time for visual consistency
        const sortedRaces = Object.values(races.value).sort((a, b) => a.startTimeMs - b.startTimeMs)

        sortedRaces.forEach(race => {
            // Sort laps by number
            const sortedLaps = Object.values(race.laps).sort((a, b) => a.lapNumber - b.lapNumber)

            sortedLaps.forEach(lap => {
                if (isValidTs(lap.startTime) && isValidTs(lap.finishTime)) {
                    areas.push([
                        {
                            xAxis: lap.startTime,
                            itemStyle: {
                                color: lap.lapNumber % 2 === 0 ? '#360a31ff' : '#ffffff',
                                opacity: 0.1
                            }
                        },
                        {
                            xAxis: lap.finishTime,
                            name: `Lap ${lap.lapNumber}`
                        }
                    ])
                    lastFinish = lap.finishTime
                }
            })
        })

        // 2. Process Current (Incomplete) Lap
        if (lastFinish && history.value.length > 0) {
            const lastPt = history.value[history.value.length - 1]
            if (isValidTs(lastFinish) && isValidTs(lastPt.timestamp) && lastPt.timestamp > lastFinish) {
                const currentLapNum = lastPt.currLap || (Object.keys(lapHistory.value).length + 1)
                areas.push([
                    {
                        xAxis: lastFinish,
                        itemStyle: {
                            color: currentLapNum % 2 === 0 ? '#ffffff' : 'transparent',
                            opacity: 0.1
                        }
                    },
                    {
                        xAxis: lastPt.timestamp,
                        name: `Lap ${currentLapNum}`
                    }
                ])
            }
        }

        return areas
    })

    const auth = useAuthStore()
    const currentLapIndex = ref(0)

    /**
     * Processes incoming telemetry packets to update the current lap index and extract lap timing information.
     * It manages race detection by identifying lap number resets and maintains a continuous timeline of laps.
     * 
     * @param {Object} packet - The telemetry data packet containing lap and timing information.
     */

    function processLapData(packet) {
        if (packet.currLap !== undefined) {
            currentLapIndex.value = packet.currLap
        }

        // Use utility to update races structure
        races.value = updateRaceSessions({ ...races.value }, packet, currentLapIndex.value)

        // Update lapHistory array for potential legacy consumers
        const latestRace = Object.values(races.value).sort((a, b) => b.startTimeMs - a.startTimeMs)[0]
        if (latestRace) {
            lapHistory.value = Object.values(latestRace.laps).sort((a, b) => a.lapNumber - b.lapNumber)
        }
    }

    function connect() {
        if (socket.value?.connected) return

        socket.value = io(WS_URL, socketMsgpackOptions)

        socket.value.on('connect', () => {
            isConnected.value = true
            // console.log('Socket connected')
            // Join the room for the specific car if user is valid
            // Note: API doc says emit 'join' with Car ID. 
            // So use auth.user.id
            if (auth.user?.id || auth.user?._id) {
                const userCar = {
                    id: auth.user.id || auth.user._id,
                    carName: auth.user.carName || auth.user.car,
                    teamName: auth.user.teamName || auth.user.team,
                    number: auth.user.number,
                    isOwn: true
                }
                joinRoom(userCar.id, userCar)
            }
        })

        socket.value.on('disconnect', () => {
            isConnected.value = false
            console.log('Socket disconnected')
        })

        socket.value.on('data', (rawData) => {
            if (isPaused.value) return

            // Decode MessagePack buffer
            const packet = decodeMsgpack(rawData)

            // Auto-cast all numeric-like strings to numbers
            Object.keys(packet).forEach(key => {
                const val = packet[key]
                if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                    packet[key] = Number(val)
                }
            })
            // console.log('New Data Packet', packet)
            // Prefer server/packet timestamp to align with history
            const timestamp = packet.timestamp || packet.updated || Date.now()

            // 1. Process Lap Data FIRST
            // This ensures races.value is updated before history triggers the chart redraw logic
            processLapData({ ...packet, timestamp })

            // 2. Process Regular Data
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
                // SCALE ON INGESTION: Store pre-scaled data in history for max performance
                const processed = scalePacketWithUnits(regularPacket)

                liveData.value = processed
                lastPacketTime.value = timestamp

                // Buffer history (Push to array directly)
                history.value.push(processed)

                // Limit history size
                if (history.value.length > maxHistoryPoints.value) {
                    history.value.shift()
                }

                // Throttled Redraw based on user setting
                const nowMs = Date.now()
                const throttleInterval = 1000 / (graphSettings.value.chartUpdateFreq || 5)
                if (nowMs - lastChartUpdate.value > throttleInterval) {
                    history.value = [...history.value]
                    lastChartUpdate.value = nowMs
                }
            }
        })
    }

    function joinRoom(carId, carDetails = null) {
        if (socket.value && isConnected.value) {
            console.log('Joining room for:', carId)
            socket.value.emit('join', carId)
            if (carDetails) {
                viewingCar.value = carDetails
            } else {
                viewingCar.value = { id: carId }
            }
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
        races.value = []
        lapHistory.value = []
        currentLapIndex.value = 0
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
            // Use viewingCar if available, fallback to auth user (though viewingCar should be set)
            const carId = viewingCar.value?.id || auth.user?.id || auth.user?._id

            if (lastTime && carId) {
                const today = new Date().toDateString()
                const lastDate = new Date(lastTime).toDateString()

                // Only fill gap if we are on the same day
                if (today === lastDate) {
                    const now = Date.now()
                    console.log(`Resuming live... fetching gap from ${new Date(lastTime).toLocaleTimeString()} to ${new Date(now).toLocaleTimeString()}`)

                    // Use prepend=true to force merge strategy in fetchHistory
                    await fetchHistory(carId, lastTime, now, true)
                }
            }
        }
    }

    async function fetchAvailableDays(carId) {
        if (!carId) return
        try {
            const response = await api.get(`/api/history/days/${carId}`)
            if (Array.isArray(response.data)) {
                availableDays.value = new Set(response.data)
            }
        } catch (error) {
            console.error('Failed to fetch available days:', error)
        }
    }

    // Computed: Is Truncated?
    const isHistoryTruncated = computed(() => {
        return history.value.length >= maxHistoryPoints.value
    })

    // Load extra history BEFORE the current earliest point
    async function loadExtraHistory(carId, minutes) {
        if (!carId || !earliestTime.value) return

        const currentStart = earliestTime.value
        const newStart = currentStart - (minutes * 60 * 1000)

        await fetchHistory(carId, newStart, currentStart, true) // true = prepend
    }

    // Load a specific day (clears existing)
    // Optional start/end times (HH:MM strings or timestamps, here assuming timestamps or handling in UI)
    // Actually, simpler to pass start/end Timestamps if caller calculates them, 
    // OR pass 00:00 strings. Let's make it flexible: assume timestamps for start/end if provided
    async function loadDay(carId, dateString, startTimeStr = '00:00', endTimeStr = '23:59') {
        if (!carId) return

        // Helper to combine date + time string
        const getTs = (timeStr) => {
            const [h, m] = timeStr.split(':')
            const d = new Date(dateString)
            d.setHours(parseInt(h), parseInt(m), 0, 0)
            return d.getTime()
        }

        const start = getTs(startTimeStr)
        const end = getTs(endTimeStr)

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

    function resetState() {
        disconnect()
        liveData.value = {}
        history.value = []
        lapHistory.value = []
        races.value = []
        lastPacketTime.value = 0
        currentLapIndex.value = 0
        availableDays.value = new Set()
        isPaused.value = false
    }

    async function fetchHistory(carId, start = null, end = null, prepend = false) {
        if (!carId) return

        // Default: last 30 mins if no start provided
        const startTime = start || (Date.now() - 30 * 60 * 1000)

        let fullHistory = []
        let page = 1
        const limit = 5000 // Max chunk size
        let fetching = true

        try {
            while (fetching) {
                const params = {
                    start: startTime,
                    page,
                    limit
                }
                if (end) params.end = end

                const response = await api.get(`/api/history/${carId}`, {
                    params
                })

                console.log('History API response:', {
                    status: response.status,
                    dataType: typeof response.data,
                    isArray: Array.isArray(response.data),
                    dataLength: response.data?.length,
                    dataSample: response.data?.slice?.(0, 2)
                })

                if (response.data && Array.isArray(response.data)) {
                    const chunk = response.data
                    fullHistory = fullHistory.concat(chunk)

                    // CHECK: Did we get a full page?
                    if (chunk.length < limit) {
                        fetching = false
                    } else {
                        page++
                    }
                } else {
                    fetching = false // Error or empty response, stop
                }
            }

            if (fullHistory.length > 0) {
                console.log('Processing fullHistory:', {
                    length: fullHistory.length,
                    sample: fullHistory.slice(0, 2),
                    sampleKeys: fullHistory[0] ? Object.keys(fullHistory[0]) : []
                })

                const dataMap = new Map()

                // Normalize incoming
                const incoming = fullHistory.map(pt => {
                    // Auto-cast strings to numbers (same as websocket)
                    const castPt = { ...pt }
                    Object.keys(castPt).forEach(key => {
                        const val = castPt[key]
                        if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                            castPt[key] = Number(val)
                        }
                    })

                    return Object.freeze({
                        ...castPt,
                        timestamp: castPt.timestamp || castPt.updated
                    })
                }).filter(pt => pt.timestamp) // Ensure timestamp exists

                console.log('After normalization:', {
                    incomingLength: incoming.length,
                    filteredOut: fullHistory.length - incoming.length,
                    sampleTimestamps: incoming.slice(0, 3).map(p => p.timestamp)
                })

                // Merge strategy
                if (prepend) {
                    // Combine incoming + existing
                    // Use Map to dedupe based on timestamp
                    incoming.forEach(pt => dataMap.set(pt.timestamp, pt))
                    history.value.forEach(pt => dataMap.set(pt.timestamp, pt))
                } else {
                    // Just replace (or initial load)
                    incoming.forEach(pt => dataMap.set(pt.timestamp, pt))
                }

                // Convert back to array and sort
                history.value = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp)

                // Scale whole history for initial load
                history.value = history.value.map(pt => scalePacketWithUnits(pt))

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
        displayHistory: history, // Compatibility: Alias history as displayHistory
        lapHistory,
        races,
        viewingCar,
        availableKeys,
        isPaused,
        availableDays,
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
        resetToLive,
        resetState,
        // Settings & Computed
        maxHistoryPoints,
        graphSettings,
        unitSettings,
        displayLiveData,
        isHistoryTruncated,
        lapMarkAreas,
        isDataStale,
        isConnected,
        races,
        maxHistoryPoints,
        graphSettings,
        unitSettings,
        getDisplayName,
        getDescription,
        chartZoomRequest,
        requestChartZoom
    }
})
