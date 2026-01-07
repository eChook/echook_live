import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io } from 'socket.io-client'
import { useAuthStore } from './auth'

export const useTelemetryStore = defineStore('telemetry', () => {
    const socket = ref(null)
    const isConnected = ref(false)
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
            // User object might be { id: "..." } or similar. we need to verify what ID to use.
            // Doc says "Retrieves the ID of the currently authenticated user... { "id": "..." }"
            // And "Join... emit 'join', '60b8...'" (Mongo Object ID)
            // So use auth.user.id
            if (auth.user?.id || auth.user?._id) {
                joinRoom(auth.user.id || auth.user._id)
            } else if (auth.user?.car) {
                // Fallback or if ID is missing (though it shouldn't be if login was real)
                console.warn('User ID missing, trying to join with Car Name or waiting for ID check')
            }
        })

        socket.value.on('disconnect', () => {
            isConnected.value = false
            console.log('Socket disconnected')
        })

        socket.value.on('data', (packet) => {
            // Add timestamp if not present
            const processed = { ...packet, timestamp: Date.now() }

            liveData.value = packet

            // Buffer history
            history.value.push(processed)
            if (history.value.length > MAX_HISTORY_POINTS) {
                history.value.shift()
            }
        })
    }

    function joinRoom(carId) {
        if (socket.value && isConnected.value) {
            console.log('Joining room for:', carId)
            socket.value.emit('join', carId)
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

    return {
        socket,
        isConnected,
        liveData,
        history,
        availableKeys,
        connect,
        joinRoom,
        leaveRoom,
        disconnect,
        clearHistory
    }
})
