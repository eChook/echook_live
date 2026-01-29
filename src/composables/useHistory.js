/**
 * @file composables/useHistory.js
 * @brief Telemetry history fetching and management composable.
 * @description Provides methods for fetching, paginating, and loading
 *              historical telemetry data from the server.
 */

import { ref, computed } from 'vue'
import { api } from '../utils/msgpack'

/**
 * @brief Composable for managing telemetry history.
 * @description Handles fetching historical data from the server, including
 *              pagination, day loading, and gap filling on resume.
 * 
 * @param {Object} options - Configuration options
 * @param {Ref<Array>} options.historyRef - Reference to the history array
 * @param {Ref<number>} options.maxPointsRef - Reference to max history points setting
 * @param {Function} options.processPacket - Function to process/scale incoming packets
 * @param {Function} options.processLapData - Function to process lap data from packets
 * @param {Function} options.clearRaces - Function to clear race data
 * @returns {Object} History state and control methods
 */
export function useHistory({ historyRef, maxPointsRef, processPacket, processLapData, clearRaces }) {
    /** @brief Set of available history days (YYYY-MM-DD format) */
    const availableDays = ref(new Set())

    /**
     * @brief Earliest timestamp in history.
     * @type {ComputedRef<number|null>}
     */
    const earliestTime = computed(() => {
        if (historyRef.value.length === 0) return null
        return historyRef.value[0].timestamp
    })

    /**
     * @brief Latest timestamp in history.
     * @type {ComputedRef<number|null>}
     */
    const latestTime = computed(() => {
        if (historyRef.value.length === 0) return null
        return historyRef.value[historyRef.value.length - 1].timestamp
    })

    /**
     * @brief Whether history is at maximum capacity.
     * @type {ComputedRef<boolean>}
     */
    const isHistoryTruncated = computed(() => {
        return historyRef.value.length >= maxPointsRef.value
    })

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
                    historyRef.value.forEach(pt => dataMap.set(pt.timestamp, pt))
                } else {
                    incoming.forEach(pt => dataMap.set(pt.timestamp, pt))
                }

                // Sort and scale
                historyRef.value = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp)
                historyRef.value = historyRef.value.map(pt => processPacket(pt))

                // Rebuild race data from history
                clearRaces()

                historyRef.value.forEach(pt => {
                    processLapData(pt)
                })
            }
            return fullHistory.length
        } catch (error) {
            console.error('Failed to fetch history:', error)
            return 0
        }
    }

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
     * @param {Function} clearHistory - Function to clear current history
     * @param {Ref<boolean>} isPausedRef - Reference to pause state
     * @returns {Promise<void>}
     */
    async function loadDay(carId, dateString, startTimeStr = '00:00', endTimeStr = '23:59', clearHistory, isPausedRef) {
        if (!carId) return

        const getTs = (timeStr) => {
            const [h, m] = timeStr.split(':')
            const d = new Date(dateString)
            d.setHours(parseInt(h), parseInt(m), 0, 0)
            return d.getTime()
        }

        const start = getTs(startTimeStr)
        const end = getTs(endTimeStr)

        isPausedRef.value = true
        clearHistory()

        const count = await fetchHistory(carId, start, end)
        if (count === 0) {
            const { useToast } = await import('../composables/useToast')
            const { showToast } = useToast()
            showToast('No history found for the selected period.', 'warning')
        }
    }

    return {
        availableDays,
        earliestTime,
        latestTime,
        isHistoryTruncated,
        fetchAvailableDays,
        fetchHistory,
        loadExtraHistory,
        loadDay
    }
}
