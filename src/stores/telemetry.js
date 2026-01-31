/**
 * @file stores/telemetry.js
 * @brief Core telemetry data management store.
 * @description Pinia store for managing real-time telemetry data from the eChook
 *              car. Orchestrates WebSocket connections, data ingestion, history management,
 *              unit conversions, lap/race detection, and graph zoom state.
 *              This is the primary data store for the dashboard.
 */

import { defineStore } from 'pinia'
import { ref, computed, watch, shallowRef } from 'vue'
import { useAuthStore } from './auth'
import { useSettingsStore } from './settings'
import { updateRaceSessions } from '../utils/raceAnalytics'
import { decodeMsgpack } from '../utils/msgpack'
import { scalePacket } from '../utils/unitConversions'

// Extracted modules
import { useSocket } from '../composables/useSocket'
import { useHistory } from '../composables/useHistory'
import { useChartZoom } from '../composables/useChartZoom'
import {
    REGULAR_KEYS,
    LAP_KEYS,
    KEY_ORDER,
    getDisplayName,
    getDescription
} from '../utils/telemetryKeys'

/**
 * @brief Telemetry store for real-time car data.
 * @description Manages the complete lifecycle of telemetry data from socket
 *              connection through display. Provides reactive state for live
 *              data, historical data, lap tracking, and chart controls.
 */
export const useTelemetryStore = defineStore('telemetry', () => {
    // ============================================
    // Core State
    // ============================================

    /** @brief Current timestamp for staleness calculations (updated every second) */
    const now = ref(Date.now())
    setInterval(() => { now.value = Date.now() }, 1000)

    /** @brief Timestamp of last received data packet */
    const lastPacketTime = ref(0)

    /** @brief Latest telemetry packet (scaled for display) */
    const liveData = ref({})

    /**
     * @brief Historical telemetry data array.
     * @description Uses shallowRef for performance - array mutations are batched.
     * @type {ShallowRef<Array<Object>>}
     */
    const history = shallowRef([])

    /** @brief Sequential array of lap data for backup/legacy consumers */
    const lapHistory = ref([])

    /** @brief Current lap number from latest data */
    const currentLapIndex = ref(0)

    /** @brief Whether live data ingestion is paused */
    const isPaused = ref(false)

    /**
     * @brief Currently viewed car details.
     * @description { id, carName, teamName, number, isOwn }
     */
    const viewingCar = ref(null)

    // ============================================
    // Settings Proxy (from Settings Store)
    // ============================================

    const settings = useSettingsStore()
    const auth = useAuthStore()

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

    // ============================================
    // Computed Properties
    // ============================================

    /**
     * @brief Whether data is considered stale (no updates in 5+ seconds).
     * @type {ComputedRef<boolean>}
     */
    const isDataStale = computed(() => {
        if (!socketComposable.isConnected.value) return true
        if (lastPacketTime.value === 0) return true
        return (now.value - lastPacketTime.value) > 5000
    })

    /**
     * @brief Scale a packet using current unit settings.
     * @param {Object} pt - Raw telemetry packet
     * @returns {Object} Scaled packet with converted units
     */
    const scalePacketWithUnits = (pt) => scalePacket(pt, unitSettings.value)

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
                const currentLapNum = lastPt.currLap !== undefined ? (lastPt.currLap + 1) : (Object.keys(lapHistory.value).length + 1)
                areas.push([
                    {
                        xAxis: lastFinish,
                        itemStyle: {
                            color: currentLapNum % 2 === 0 ? '#360a31ff' : '#ffffff',
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

    /**
     * @brief Clear race tracking data.
     */
    function clearRaces() {
        races.value = []
        lapHistory.value = []
        currentLapIndex.value = 0
    }

    /**
     * @brief Handle incoming data from WebSocket.
     * @param {ArrayBuffer} rawData - MessagePack encoded data
     */
    function handleIncomingData(rawData) {
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
    }

    // ============================================
    // Composables Integration
    // ============================================

    // Socket composable
    const socketComposable = useSocket({
        onConnect: () => {
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
        },
        onDisconnect: () => { },
        onData: handleIncomingData
    })

    // History composable
    const historyComposable = useHistory({
        historyRef: history,
        maxPointsRef: maxHistoryPoints,
        processPacket: scalePacketWithUnits,
        processLapData,
        clearRaces
    })

    // Chart zoom composable
    const chartZoomComposable = useChartZoom()

    // ============================================
    // Connection & Room Functions
    // ============================================

    /**
     * @brief Establish WebSocket connection to the telemetry server.
     */
    function connect() {
        socketComposable.connect()
    }

    /**
     * @brief Join a car's data room to receive its telemetry.
     * @param {string} carId - Car ID to join
     * @param {Object|null} carDetails - Optional car details object
     */
    function joinRoom(carId, carDetails = null) {
        if (socketComposable.isConnected.value) {
            socketComposable.joinRoom(carId)
            if (carDetails) {
                viewingCar.value = carDetails
            } else {
                viewingCar.value = { id: carId }
            }
            historyComposable.fetchHistory(carId)
        }
    }

    /**
     * @brief Leave a car's data room.
     * @param {string} carId - Car ID to leave
     */
    function leaveRoom(carId) {
        socketComposable.leaveRoom(carId)
    }

    /**
     * @brief Disconnect from the WebSocket server.
     */
    function disconnect() {
        socketComposable.disconnect()
    }

    // ============================================
    // History & Data Management
    // ============================================

    /**
     * @brief Clear all history and race data.
     */
    function clearHistory() {
        history.value = []
        clearRaces()
    }

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
            const lastTime = historyComposable.latestTime.value
            const carId = viewingCar.value?.id || auth.user?.id || auth.user?._id

            if (lastTime && carId) {
                const today = new Date().toDateString()
                const lastDate = new Date(lastTime).toDateString()

                // Only fill gap if same day
                if (today === lastDate) {
                    const now = Date.now()
                    await historyComposable.fetchHistory(carId, lastTime, now, true)
                }
            }
        }
    }

    /**
     * @brief Load history for a specific day.
     * @param {string} carId - Car ID to fetch for
     * @param {string} dateString - Date in YYYY-MM-DD format
     * @param {string} [startTimeStr='00:00'] - Start time (HH:MM)
     * @param {string} [endTimeStr='23:59'] - End time (HH:MM)
     * @returns {Promise<void>}
     */
    async function loadDay(carId, dateString, startTimeStr = '00:00', endTimeStr = '23:59') {
        await historyComposable.loadDay(carId, dateString, startTimeStr, endTimeStr, clearHistory, isPaused)
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
        await historyComposable.fetchHistory(carId)
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
        historyComposable.availableDays.value = new Set()
        isPaused.value = false
    }

    // ============================================
    // Return Public API
    // ============================================

    return {
        // Connection State
        socket: socketComposable.socket,
        isConnected: socketComposable.isConnected,
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
        availableDays: historyComposable.availableDays,
        earliestTime: historyComposable.earliestTime,
        latestTime: historyComposable.latestTime,
        isHistoryTruncated: historyComposable.isHistoryTruncated,

        // Connection Actions
        connect,
        joinRoom,
        leaveRoom,
        disconnect,

        // Data Actions
        clearHistory,
        fetchHistory: historyComposable.fetchHistory,
        togglePause,
        fetchAvailableDays: historyComposable.fetchAvailableDays,
        loadExtraHistory: historyComposable.loadExtraHistory,
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
        chartZoomRequest: chartZoomComposable.chartZoomRequest,
        requestChartZoom: chartZoomComposable.requestChartZoom,
        requestChartUnlock: chartZoomComposable.requestChartUnlock,
        requestChartPan: chartZoomComposable.requestChartPan,
        requestChartScale: chartZoomComposable.requestChartScale
    }
})
