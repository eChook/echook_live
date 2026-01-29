/**
 * @file stores/telemetry.js
 * @brief Core telemetry data management store.
 * @description Pinia store for managing real-time telemetry data from the eChook
 *              car. Handles WebSocket connections, data ingestion, history management,
 *              unit conversions, lap/race detection, and graph zoom state.
 *              This is the primary data store for the dashboard.
 */

import { defineStore } from 'pinia'
import { ref, computed, watch, shallowRef } from 'vue'
import { io } from 'socket.io-client'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import { API_BASE_URL, WS_URL } from '../config'
import { updateRaceSessions } from '../utils/raceAnalytics'
import { api, decodeMsgpack, socketMsgpackOptions } from '../utils/msgpack'
import { scalePacket } from '../utils/unitConversions'

/**
 * @brief Telemetry store for real-time car data.
 * @description Manages the complete lifecycle of telemetry data from socket
 *              connection through display. Provides reactive state for live
 *              data, historical data, lap tracking, and chart controls.
 */
export const useTelemetryStore = defineStore('telemetry', () => {
    // ============================================
    // Connection State
    // ============================================

    /** @brief Socket.IO client instance */
    const socket = ref(null)

    /** @brief Whether WebSocket is currently connected */
    const isConnected = ref(false)

    /** @brief Current timestamp for staleness calculations (updated every second) */
    const now = ref(Date.now())

    // Update 'now' every second for reactive staleness tracking
    setInterval(() => {
        now.value = Date.now()
    }, 1000)

    /** @brief Timestamp of last received data packet */
    const lastPacketTime = ref(0)

    /**
     * @brief Whether data is considered stale (no updates in 5+ seconds).
     * @type {ComputedRef<boolean>}
     */
    const isDataStale = computed(() => {
        if (!isConnected.value) return true
        if (lastPacketTime.value === 0) return true
        return (now.value - lastPacketTime.value) > 5000
    })

    // ============================================
    // Data State
    // ============================================

    /** @brief Latest telemetry packet (scaled for display) */
    const liveData = ref({})

    /**
     * @brief Historical telemetry data array.
     * @description Uses shallowRef for performance - array mutations are batched.
     * @type {ShallowRef<Array<Object>>}
     */
    const history = shallowRef([])

    /** @brief Timestamp of last chart update */
    const lastChartUpdate = ref(0)

    /** @brief Sequential array of lap data for backup/legacy consumers */
    const lapHistory = ref([])

    /**
     * @brief Current chart zoom request.
     * @description Types: 'absolute' (start/end), 'reset', 'pan' (offsetMs), 'scale' (factor)
     * @type {Ref<Object|null>}
     */
    const chartZoomRequest = ref(null)

    // ============================================
    // Viewing State
    // ============================================

    /**
     * @brief Currently viewed car details.
     * @description { id, carName, teamName, number, isOwn }
     */
    const viewingCar = ref(null)

    // ============================================
    // Settings Proxy (from Settings Store)
    // ============================================

    const settings = useSettingsStore()

    /**
     * @brief Proxy for max history points setting.
     * @description Allows components to read/write via telemetry store.
     */
    const maxHistoryPoints = computed({
        get: () => settings.maxHistoryPoints,
        set: (val) => { settings.maxHistoryPoints = val }
    })

    /** @brief Proxy for graph settings */
    const graphSettings = computed(() => settings.graphSettings)

    /** @brief Proxy for unit settings */
    const unitSettings = computed(() => settings.unitSettings)

    /**
     * @brief Proxy for race records.
     * @description Structure: { [raceStartTime]: { startTimeMs, laps: { [lapNum]: data } } }
     */
    const races = computed({
        get: () => settings.races,
        set: (val) => { settings.races = val }
    })

    // Trim history when max points setting changes
    watch(() => settings.maxHistoryPoints, (val) => {
        if (history.value.length > val) {
            history.value = history.value.slice(history.value.length - val)
        }
    })

    // Clear history when units change (requires rescaling)
    watch(() => settings.unitSettings, () => {
        clearHistory()
    }, { deep: true })

    // ============================================
    // Key Configuration
    // ============================================

    /**
     * @brief Set of regular telemetry keys (non-lap data).
     * @type {Set<string>}
     */
    const REGULAR_KEYS = new Set([
        'voltage', 'current', 'voltageLower', 'voltageHigh', 'voltageDiff',
        'rpm', 'speed', 'throttle',
        'temp1', 'temp2', 'tempDiff', 'ampH', 'currLap',
        'gear', 'brake', 'lon', 'lat', 'track'
    ])

    /**
     * @brief Set of lap summary keys (LL_* prefixed).
     * @type {Set<string>}
     */
    const LAP_KEYS = new Set([
        'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_Time', 'LL_Eff'
    ])

    /**
     * @brief Human-readable display names for telemetry keys.
     * @type {Object.<string, string>}
     */
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
        lon: 'Longitude',
        track: 'Track'
    }

    /**
     * @brief Tooltip descriptions for telemetry keys.
     * @type {Object.<string, string>}
     */
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
        lon: 'GPS longitude coordinate',
        track: 'Current track or circuit name'
    }

    /**
     * @brief Get human-readable display name for a telemetry key.
     * @param {string} key - Telemetry key
     * @returns {string} Display name or the key itself if not found
     */
    const getDisplayName = (key) => KEY_DISPLAY_NAMES[key] || key

    /**
     * @brief Get description tooltip for a telemetry key.
     * @param {string} key - Telemetry key
     * @returns {string} Description or empty string if not found
     */
    const getDescription = (key) => KEY_DESCRIPTIONS[key] || ''

    /**
     * @brief Scale a packet using current unit settings.
     * @param {Object} pt - Raw telemetry packet
     * @returns {Object} Scaled packet with converted units
     */
    const scalePacketWithUnits = (pt) => scalePacket(pt, unitSettings.value)

    // ============================================
    // Computed Properties
    // ============================================

    /**
     * @brief Live data with unit conversions applied.
     * @type {ComputedRef<Object>}
     */
    const displayLiveData = computed(() => {
        const pt = liveData.value
        if (!pt) return {}
        return scalePacketWithUnits(pt)
    })

    /**
     * @brief Preferred display order for telemetry keys.
     * @type {string[]}
     */
    const KEY_ORDER = [
        'voltage', 'current', 'ampH',
        'speed', 'rpm', 'throttle', 'voltageLower',
        'voltageHigh', 'voltageDiff', 'gear', 'brake',
        'temp1', 'temp2', 'tempDiff',
        'currLap', 'lat', 'lon', 'track'
    ]

    /**
     * @brief Array of available telemetry keys present in current data.
     * @description Keys are ordered by KEY_ORDER preference.
     * @type {ComputedRef<string[]>}
     */
    const availableKeys = computed(() => {
        const keys = new Set()

        // Add keys from live data if they are in REGULAR_KEYS
        Object.keys(liveData.value).forEach(k => {
            if (REGULAR_KEYS.has(k)) keys.add(k)
        })

        // Also check recent history for temporarily missing keys
        if (history.value.length > 0) {
            Object.keys(history.value[history.value.length - 1]).forEach(k => {
                if (REGULAR_KEYS.has(k)) keys.add(k)
            })
        }

        return KEY_ORDER.filter(k => keys.has(k))
    })

    /**
     * @brief Available keys filtered for graph display (excludes 'track').
     * @type {ComputedRef<string[]>}
     */
    const graphKeys = computed(() => {
        return availableKeys.value.filter(k => k !== 'track')
    })

    /**
     * @brief Generate ECharts markArea data for lap highlights.
     * @description Creates colored regions on the graph for each completed lap.
     * @type {ComputedRef<Array>}
     */
    const lapMarkAreas = computed(() => {
        const areas = []
        const isValidTs = (ts) => ts && Number.isFinite(ts) && ts > 946684800000

        let lastFinish = null

        // Sort races by start time
        const sortedRaces = Object.values(races.value).sort((a, b) => a.startTimeMs - b.startTimeMs)

        sortedRaces.forEach(race => {
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

        // Add current (incomplete) lap
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

    /** @brief Current lap number from latest data */
    const currentLapIndex = ref(0)

    // ============================================
    // Data Processing Functions
    // ============================================

    /**
     * @brief Process incoming packet for lap and race data.
     * @description Updates race sessions when lap summary data (LL_*) is received.
     *              Detects new races, records lap times, and maintains race history.
     * @param {Object} packet - Telemetry packet with timestamp
     */
    function processLapData(packet) {
        if (packet.currLap !== undefined) {
            currentLapIndex.value = packet.currLap
        }

        // Only update races if packet contains lap data
        const hasLapData = packet['LL_Time'] !== undefined || packet['LL_V'] !== undefined
        const hasTrackName = packet['track'] !== undefined || packet['Track'] !== undefined || packet['Circuit'] !== undefined

        if (hasLapData || hasTrackName) {
            races.value = updateRaceSessions({ ...races.value }, packet, currentLapIndex.value)

            // Update lapHistory array for legacy consumers
            const latestRace = Object.values(races.value).sort((a, b) => b.startTimeMs - a.startTimeMs)[0]
            if (latestRace) {
                lapHistory.value = Object.values(latestRace.laps).sort((a, b) => a.lapNumber - b.lapNumber)
            }
        }
    }

    // ============================================
    // Socket Connection Functions
    // ============================================

    /**
     * @brief Establish WebSocket connection to the telemetry server.
     * @description Connects to WS_URL, sets up event handlers for data,
     *              and automatically joins the user's car room.
     */
    function connect() {
        if (socket.value?.connected) return

        socket.value = io(WS_URL, socketMsgpackOptions)

        socket.value.on('connect', () => {
            isConnected.value = true
            // Join room for the authenticated user's car
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
        })

        socket.value.on('data', (rawData) => {
            if (isPaused.value) return

            // Decode MessagePack buffer
            const packet = decodeMsgpack(rawData)

            // Auto-cast numeric strings to numbers
            Object.keys(packet).forEach(key => {
                const val = packet[key]
                if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                    packet[key] = Number(val)
                }
            })

            const timestamp = packet.timestamp || packet.updated || Date.now()

            // 1. Process lap data first (updates races before chart redraw)
            processLapData({ ...packet, timestamp })

            // 2. Process regular telemetry data
            const regularPacket = {}
            let hasRegularData = false

            // Normalize capitalized keys
            if (packet['Lon'] !== undefined) packet['lon'] = packet['Lon']
            if (packet['Lat'] !== undefined) packet['lat'] = packet['Lat']

            REGULAR_KEYS.forEach(key => {
                if (packet[key] !== undefined) {
                    regularPacket[key] = packet[key]
                    hasRegularData = true
                }
            })

            regularPacket.timestamp = timestamp
            if (packet.lat !== undefined) regularPacket.lat = packet.lat
            if (packet.lon !== undefined) regularPacket.lon = packet.lon

            if (hasRegularData) {
                // Scale on ingestion for performance
                const processed = scalePacketWithUnits(regularPacket)

                liveData.value = processed
                lastPacketTime.value = timestamp

                // Add to history
                history.value.push(processed)

                // Limit history size
                if (history.value.length > maxHistoryPoints.value) {
                    history.value.shift()
                }

                // Trigger reactivity
                history.value = [...history.value]
            }
        })
    }

    /**
     * @brief Join a car's data room to receive its telemetry.
     * @param {string} carId - Car ID to join
     * @param {Object|null} carDetails - Optional car details object
     */
    function joinRoom(carId, carDetails = null) {
        if (socket.value && isConnected.value) {
            socket.value.emit('join', carId)
            if (carDetails) {
                viewingCar.value = carDetails
            } else {
                viewingCar.value = { id: carId }
            }
            fetchHistory(carId)
        }
    }

    /**
     * @brief Leave a car's data room.
     * @param {string} carId - Car ID to leave
     */
    function leaveRoom(carId) {
        if (socket.value) {
            socket.value.emit('leave', carId)
        }
    }

    /**
     * @brief Disconnect from the WebSocket server.
     */
    function disconnect() {
        if (socket.value) {
            socket.value.disconnect()
            socket.value = null
            isConnected.value = false
        }
    }

    /**
     * @brief Clear all history and race data.
     */
    function clearHistory() {
        history.value = []
        races.value = []
        lapHistory.value = []
        currentLapIndex.value = 0
    }

    // ============================================
    // Pause/Resume State
    // ============================================

    /** @brief Whether live data ingestion is paused */
    const isPaused = ref(false)

    /** @brief Set of available history days (YYYY-MM-DD format) */
    const availableDays = ref(new Set())

    /**
     * @brief Earliest timestamp in history.
     * @type {ComputedRef<number|null>}
     */
    const earliestTime = computed(() => {
        if (history.value.length === 0) return null
        return history.value[0].timestamp
    })

    /**
     * @brief Latest timestamp in history.
     * @type {ComputedRef<number|null>}
     */
    const latestTime = computed(() => {
        if (history.value.length === 0) return null
        return history.value[history.value.length - 1].timestamp
    })

    /**
     * @brief Toggle pause state for live data ingestion.
     * @description When resuming, automatically fetches data from the gap period.
     * @returns {Promise<void>}
     */
    async function togglePause() {
        const wasPaused = isPaused.value
        isPaused.value = !isPaused.value

        // If resuming, fill the gap
        if (wasPaused && !isPaused.value) {
            const lastTime = latestTime.value
            const carId = viewingCar.value?.id || auth.user?.id || auth.user?._id

            if (lastTime && carId) {
                const today = new Date().toDateString()
                const lastDate = new Date(lastTime).toDateString()

                // Only fill gap if same day
                if (today === lastDate) {
                    const now = Date.now()
                    await fetchHistory(carId, lastTime, now, true)
                }
            }
        }
    }

    // ============================================
    // History Fetching Functions
    // ============================================

    /**
     * @brief Fetch list of days with available history data.
     * @param {string} carId - Car ID to query
     * @returns {Promise<void>}
     */
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

    /**
     * @brief Whether history is at maximum capacity.
     * @type {ComputedRef<boolean>}
     */
    const isHistoryTruncated = computed(() => {
        return history.value.length >= maxHistoryPoints.value
    })

    /**
     * @brief Load additional history before current data.
     * @param {string} carId - Car ID to fetch for
     * @param {number} minutes - Number of minutes to load
     * @returns {Promise<void>}
     */
    async function loadExtraHistory(carId, minutes) {
        if (!carId || !earliestTime.value) return

        const currentStart = earliestTime.value
        const newStart = currentStart - (minutes * 60 * 1000)

        const count = await fetchHistory(carId, newStart, currentStart, true)
        if (count === 0) {
            const { useToast } = await import('../composables/useToast')
            const { showToast } = useToast()
            showToast('No additional history available for this period.', 'warning')
        }
    }

    /**
     * @brief Load history for a specific day.
     * @description Clears existing data and loads the specified day's history.
     * @param {string} carId - Car ID to fetch for
     * @param {string} dateString - Date in YYYY-MM-DD format
     * @param {string} [startTimeStr='00:00'] - Start time (HH:MM)
     * @param {string} [endTimeStr='23:59'] - End time (HH:MM)
     * @returns {Promise<void>}
     */
    async function loadDay(carId, dateString, startTimeStr = '00:00', endTimeStr = '23:59') {
        if (!carId) return

        const getTs = (timeStr) => {
            const [h, m] = timeStr.split(':')
            const d = new Date(dateString)
            d.setHours(parseInt(h), parseInt(m), 0, 0)
            return d.getTime()
        }

        const start = getTs(startTimeStr)
        const end = getTs(endTimeStr)

        isPaused.value = true
        clearHistory()

        const count = await fetchHistory(carId, start, end)
        if (count === 0) {
            const { useToast } = await import('../composables/useToast')
            const { showToast } = useToast()
            showToast('No history found for the selected period.', 'warning')
        }
    }

    /**
     * @brief Reset to live mode with recent data.
     * @description Clears history, resumes live updates, and loads last 30 minutes.
     * @param {string} carId - Car ID to reset for
     * @returns {Promise<void>}
     */
    async function resetToLive(carId) {
        if (!carId) return

        isPaused.value = false
        clearHistory()
        await fetchHistory(carId)
    }

    /**
     * @brief Full state reset (disconnect and clear all data).
     */
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

    /**
     * @brief Fetch historical telemetry data from the server.
     * @description Fetches data in chunks, merges with existing history if prepending.
     *              Reprocesses all data for lap/race detection after loading.
     * @param {string} carId - Car ID to fetch for
     * @param {number|null} [start=null] - Start timestamp (defaults to last 30 minutes)
     * @param {number|null} [end=null] - End timestamp (defaults to now)
     * @param {boolean} [prepend=false] - Whether to merge with existing data
     * @returns {Promise<number>} Number of data points fetched
     */
    async function fetchHistory(carId, start = null, end = null, prepend = false) {
        if (!carId) return 0

        const startTime = start || (Date.now() - 30 * 60 * 1000)

        let fullHistory = []
        let page = 1
        const limit = 5000
        let fetching = true

        try {
            while (fetching) {
                const params = {
                    start: startTime,
                    page,
                    limit
                }
                if (end) params.end = end

                const response = await api.get(`/api/history/${carId}`, { params })

                if (response.data && Array.isArray(response.data)) {
                    const chunk = response.data
                    fullHistory = fullHistory.concat(chunk)

                    if (chunk.length < limit) {
                        fetching = false
                    } else {
                        page++
                    }
                } else {
                    fetching = false
                }
            }

            if (fullHistory.length > 0) {
                const dataMap = new Map()

                // Normalize and cast incoming data
                const incoming = fullHistory.map(pt => {
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
                }).filter(pt => pt.timestamp)

                // Merge strategy
                if (prepend) {
                    incoming.forEach(pt => dataMap.set(pt.timestamp, pt))
                    history.value.forEach(pt => dataMap.set(pt.timestamp, pt))
                } else {
                    incoming.forEach(pt => dataMap.set(pt.timestamp, pt))
                }

                // Sort and scale
                history.value = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp)
                history.value = history.value.map(pt => scalePacketWithUnits(pt))

                // Rebuild race data from history
                races.value = []
                lapHistory.value = []
                currentLapIndex.value = 0

                history.value.forEach(pt => {
                    processLapData(pt)
                })
            }
            return fullHistory.length
        } catch (error) {
            console.error('Failed to fetch history:', error)
            return 0
        }
    }

    // ============================================
    // Chart Zoom Control Functions
    // ============================================

    /**
     * @brief Request absolute chart zoom to specific time range.
     * @param {number} start - Start timestamp in milliseconds
     * @param {number} end - End timestamp in milliseconds
     */
    function requestChartZoom(start, end) {
        chartZoomRequest.value = { type: 'absolute', start, end }
    }

    /**
     * @brief Request chart zoom reset (unlock to live scroll).
     */
    function requestChartUnlock() {
        chartZoomRequest.value = { type: 'reset' }
    }

    /**
     * @brief Request chart pan by time offset.
     * @param {number} offsetMs - Offset in milliseconds (positive = right, negative = left)
     */
    function requestChartPan(offsetMs) {
        chartZoomRequest.value = { type: 'pan', offsetMs }
    }

    /**
     * @brief Request chart zoom scale change.
     * @param {number} factor - Scale factor (< 1 = zoom in, > 1 = zoom out)
     */
    function requestChartScale(factor) {
        chartZoomRequest.value = { type: 'scale', factor }
    }

    return {
        // Connection State
        socket,
        isConnected,
        lastPacketTime,
        isDataStale,

        // Data State
        liveData,
        history,
        displayHistory: history,
        lapHistory,
        races,
        viewingCar,
        availableKeys,
        graphKeys,

        // Pause State
        isPaused,
        availableDays,
        earliestTime,
        latestTime,
        isHistoryTruncated,

        // Connection Actions
        connect,
        joinRoom,
        leaveRoom,
        disconnect,

        // Data Actions
        clearHistory,
        fetchHistory,
        togglePause,
        fetchAvailableDays,
        loadExtraHistory,
        loadDay,
        resetToLive,
        resetState,

        // Settings Proxies
        maxHistoryPoints,
        graphSettings,
        unitSettings,
        displayLiveData,
        lapMarkAreas,

        // Helpers
        getDisplayName,
        getDescription,

        // Chart Control
        chartZoomRequest,
        requestChartZoom,
        requestChartUnlock,
        requestChartPan,
        requestChartScale
    }
})
