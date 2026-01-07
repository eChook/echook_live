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
    const auth = useAuthStore()

    // Constants
    const MAX_HISTORY_POINTS = 500

    // Computed: Get array of keys present in data for UI toggles
    const availableKeys = computed(() => {
        // Merge keys from live data and recent history to ensure coverage
        const keys = new Set(Object.keys(liveData.value))
        if (history.value.length > 0) {
            Object.keys(history.value[history.value.length - 1]).forEach(k => keys.add(k))
        }
        // Filter out internal keys or metadata if any
        return Array.from(keys).filter(k => k !== 'timestamp')
    })

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
            // Prefer server/packet timestamp to align with history
            const timestamp = packet.timestamp || packet.updated || Date.now()
            // freeze to prevent Vue from making this deeply reactive (performance)
            const processed = Object.freeze({ ...packet, timestamp })

            liveData.value = packet
            lastPacketTime.value = timestamp

            // Buffer history
            history.value.push(processed)
            // Limit history size to prevent memory leaks/crash, but allow larger buffer
            const LIMIT = Math.max(MAX_HISTORY_POINTS, 5000)
            if (history.value.length > LIMIT) {
                history.value.shift()
            }
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

    async function fetchHistory(carId) {
        if (!carId) return

        // 30 minutes ago
        const start = Date.now() - 30 * 60 * 1000

        try {
            const response = await axios.get(`http://localhost:3000/api/history/${carId}`, {
                params: { start }
            })

            if (response.data && Array.isArray(response.data)) {
                const dataMap = new Map()

                response.data.forEach(pt => {
                    // Normalize timestamp: Server uses 'updated', Frontend uses 'timestamp'
                    // If timestamp is missing, use updated.
                    const normalized = Object.freeze({
                        ...pt,
                        timestamp: pt.timestamp || pt.updated
                    })
                    if (normalized.timestamp) {
                        dataMap.set(normalized.timestamp, normalized)
                    }
                })

                // Merge with existing live data
                history.value.forEach(pt => dataMap.set(pt.timestamp, pt))

                // Convert back to array and sort
                history.value = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp)

                console.log(`Loaded ${response.data.length} historical points`)
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
        availableKeys,
        connect,
        joinRoom,
        leaveRoom,
        leaveRoom,
        disconnect,
        clearHistory,
        fetchHistory
    }
})
