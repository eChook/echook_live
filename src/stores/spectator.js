/**
 * @file stores/spectator.js
 * @brief Public spectator mode state management.
 * @description Pinia store for managing public spectator functionality. Handles
 *              WebSocket connections to the public namespace for viewing live
 *              race data without authentication. Supports track selection and
 *              real-time car position updates.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { io } from 'socket.io-client'
import { createSocketOptions, decodeMsgpack } from '../utils/msgpack'
import { WS_URL } from '../config'
import { normalizeTelemetryPacket } from '../utils/telemetryPacket'

/**
 * @brief Spectator store for public race viewing.
 * @description Manages WebSocket connection to the /public namespace and
 *              provides reactive state for available tracks and live car data.
 */
export const useSpectatorStore = defineStore('spectator', () => {
    // ============================================
    // State
    // ============================================

    /** @brief List of tracks with active cars */
    const activeTracks = ref([])

    /** @brief Server statistics (active cars, spectator counts) */
    const serverStats = ref({ activeCars: 0, privateSpectators: 0, publicSpectators: 0 })

    /** @brief Whether currently establishing WebSocket connection */
    const isConnecting = ref(false)

    /** @brief Socket.IO instance for public namespace */
    const publicSocket = ref(null)
    const socketError = ref('')
    const isReconnecting = ref(false)
    const reconnectAttempts = ref(0)

    // ============================================
    // Live Data State
    // ============================================

    /** @brief Currently spectated track name */
    const currentTrack = ref(null)

    /**
     * @brief Map of car data keyed by unique identifier.
     * @description Key format: `${name}-${number}-${team}`
     * @type {Ref<Object.<string, Object>>}
     */
    const cars = ref({})

    /** @brief Whether actively spectating a track */
    const isSpectating = ref(false)

    // ============================================
    // Map Interaction State
    // ============================================

    /** @brief ID of car currently hovered on map */
    const hoveredCarId = ref(null)

    /** @brief ID of car currently selected on map */
    const selectedCarId = ref(null)

    // ============================================
    // Socket Connection Actions
    // ============================================

    /**
     * @brief Connect to the public WebSocket namespace.
     * @description Establishes connection to /public namespace and sets up
     *              event handlers for track lists, stats, and car data.
     *              Automatically re-joins current track on reconnection.
     */
    const connectPublic = () => {
        if (publicSocket.value?.connected) return
        if (publicSocket.value && !publicSocket.value.connected) {
            publicSocket.value.disconnect()
            publicSocket.value = null
        }

        isConnecting.value = true
        socketError.value = ''
        publicSocket.value = io(`${WS_URL}/public`, createSocketOptions())

        publicSocket.value.on('connect', () => {
            isConnecting.value = false
            isReconnecting.value = false
            reconnectAttempts.value = 0
            socketError.value = ''
            // Re-join track on reconnect
            if (currentTrack.value && currentTrack.value !== null) {
                publicSocket.value.emit('joinTrack', currentTrack.value)
            }
        })

        publicSocket.value.on('trackList', (rawData) => {
            const tracks = decodeMsgpack(rawData)
            activeTracks.value = Array.isArray(tracks) ? tracks : []
        })

        publicSocket.value.on('stats', (rawData) => {
            const stats = decodeMsgpack(rawData)
            if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
                serverStats.value = stats
            }
        })

        publicSocket.value.on('data', (rawData) => {
            const data = normalizeTelemetryPacket(decodeMsgpack(rawData))
            // Data contains: { name, number, team, lat, lon, speed, track, updated }
            if (data && data.name && data.number != null) {
                const team = data.team || 'NoTeam'
                const carKey = `${data.name}-${data.number}-${team}`
                cars.value[carKey] = {
                    ...cars.value[carKey],
                    ...data,
                    id: carKey,
                    lastUpdate: Date.now()
                }
            }
        })

        publicSocket.value.on('disconnect', () => {
            // Socket disconnected, will auto-reconnect
            isReconnecting.value = true
        })
        publicSocket.value.on('connect_error', (error) => {
            isConnecting.value = false
            isReconnecting.value = true
            socketError.value = error?.message || 'Unable to connect spectator socket'
        })
        publicSocket.value.on('reconnect_attempt', (attempt) => {
            isReconnecting.value = true
            reconnectAttempts.value = Number(attempt) || (reconnectAttempts.value + 1)
        })
        publicSocket.value.on('reconnect_failed', () => {
            isReconnecting.value = false
            socketError.value = socketError.value || 'Spectator reconnect attempts failed'
        })
    }

    /**
     * @brief Disconnect from the public WebSocket namespace.
     * @description Cleanly closes the socket connection and clears the reference.
     */
    const disconnectPublic = () => {
        if (publicSocket.value) {
            publicSocket.value.disconnect()
            publicSocket.value = null
        }
        socketError.value = ''
        isReconnecting.value = false
        reconnectAttempts.value = 0
    }

    // ============================================
    // Track Spectating Actions
    // ============================================

    /**
     * @brief Join a track room to receive its car data.
     * @description Leaves any current track and joins the specified one.
     *              Clears car data and requests updates for the new track.
     * @param {string} trackName - Name of the track to spectate
     */
    const joinTrack = (trackName) => {
        if (currentTrack.value === trackName) return

        // Cleanup previous track
        leaveTrack()

        currentTrack.value = trackName
        cars.value = {}

        if (publicSocket.value && publicSocket.value.connected) {
            publicSocket.value.emit('joinTrack', trackName)
            isSpectating.value = true
        } else {
            // Connect first, will auto-join on connect
            connectPublic()
        }
    }

    /**
     * @brief Leave the current track room.
     * @description Notifies server and clears local track/car state.
     */
    const leaveTrack = () => {
        if (publicSocket.value && currentTrack.value) {
            publicSocket.value.emit('leaveTrack', currentTrack.value)
        }
        currentTrack.value = null
        cars.value = {}
        isSpectating.value = false
    }

    // ============================================
    // Computed Properties
    // ============================================

    /**
     * @brief Get list of active cars as an array.
     * @returns {Array<Object>} Array of car data objects
     */
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
        socketError,
        isReconnecting,
        reconnectAttempts,

        // Actions
        connectPublic,
        disconnectPublic,
        joinTrack,
        leaveTrack
    }
})
