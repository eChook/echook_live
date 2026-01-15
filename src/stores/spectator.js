
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io } from 'socket.io-client'

export const useSpectatorStore = defineStore('spectator', () => {
    // State
    const activeTracks = ref([])
    const serverStats = ref({ activeCars: 0, privateSpectators: 0, publicSpectators: 0 })
    const isConnecting = ref(false)
    const publicSocket = ref(null)

    // Live Data State
    const currentTrack = ref(null)
    const cars = ref({}) // Map of carKey -> carData
    const isSpectating = ref(false)

    // Map Interaction
    const hoveredCarId = ref(null)
    const selectedCarId = ref(null)

    // --- Public Socket Logic (/public) ---
    const connectPublic = () => {
        if (publicSocket.value) return

        isConnecting.value = true
        publicSocket.value = io('http://localhost:3000/public', {
            transports: ['websocket']
        })

        publicSocket.value.on('connect', () => {
            console.log('Connected to /public namespace')
            isConnecting.value = false
            // If we were supposed to be joined to a track, re-join on reconnect
            if (currentTrack.value) {
                publicSocket.value.emit('joinTrack', currentTrack.value)
            }
        })

        publicSocket.value.on('trackList', (tracks) => {
            console.log('Received track list:', tracks)
            activeTracks.value = tracks
        })

        publicSocket.value.on('stats', (stats) => {
            if (stats) serverStats.value = stats
        })

        publicSocket.value.on('data', (data) => {
            // data contains { name, number, team, lat, lon, speed, track, updated }
            // Use name-number-team as a unique key for better collision avoidance
            if (data && data.name && data.number != null) {
                const team = data.team || 'NoTeam'
                const carKey = `${data.name}-${data.number}-${team}`
                cars.value[carKey] = {
                    ...cars.value[carKey], // Preserve previous state if any
                    ...data,
                    id: carKey, // Inject id for backward compatibility with UI components
                    lastUpdate: Date.now()
                }
            }
        })

        publicSocket.value.on('disconnect', () => {
            console.log('Disconnected from /public')
        })
    }

    const disconnectPublic = () => {
        if (publicSocket.value) {
            publicSocket.value.disconnect()
            publicSocket.value = null
        }
    }

    // --- Spectate Logic (Now part of /public) ---
    const joinTrack = (trackName) => {
        if (currentTrack.value === trackName) return

        // Cleanup previous
        leaveTrack()

        currentTrack.value = trackName
        cars.value = {}

        if (publicSocket.value && publicSocket.value.connected) {
            console.log(`Joining track room: ${trackName}`)
            publicSocket.value.emit('joinTrack', trackName)
            isSpectating.value = true
        } else {
            // If not connected, connectPublic will handle joining once connected
            connectPublic()
        }
    }

    const leaveTrack = () => {
        if (publicSocket.value && currentTrack.value) {
            console.log(`Leaving track room: ${currentTrack.value}`)
            publicSocket.value.emit('leaveTrack', currentTrack.value)
        }
        currentTrack.value = null
        cars.value = {}
        isSpectating.value = false
    }

    // --- Getters ---
    const activeCarList = computed(() => {
        return Object.values(cars.value)
    })

    return {
        // State
        activeTracks,
        serverStats,
        isConnecting,
        currentTrack,
        cars,
        isSpectating,
        hoveredCarId,
        selectedCarId,
        activeCarList,

        // Actions
        connectPublic,
        disconnectPublic,
        joinTrack,
        leaveTrack
    }
})

