/**
 * @file composables/useSocket.js
 * @brief WebSocket connection management composable.
 * @description Provides Socket.IO connection lifecycle management
 *              including connect, disconnect, and room joining.
 */

import { ref } from 'vue'
import { io } from 'socket.io-client'
import { WS_URL } from '../config'
import { createSocketOptions } from '../utils/msgpack'

/**
 * @brief Composable for managing WebSocket connections.
 * @description Encapsulates Socket.IO client lifecycle and room management.
 *              Designed to be used by the telemetry store.
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.onConnect - Callback when connected
 * @param {Function} options.onDisconnect - Callback when disconnected
 * @param {Function} options.onData - Callback when data is received
 * @param {Function} options.onError - Callback when socket connection fails
 * @returns {Object} Socket state and control methods
 */
export function useSocket({ onConnect, onDisconnect, onData, onError }) {
    /** @brief Socket.IO client instance */
    const socket = ref(null)

    /** @brief Whether WebSocket is currently connected */
    const isConnected = ref(false)
    /** @brief Last socket connection error message */
    const lastError = ref('')
    /** @brief Room to join once socket reconnects */
    const pendingRoomId = ref(null)
    /** @brief Current socket connection lifecycle state */
    const connectionState = ref('disconnected')
    /** @brief Whether socket is in reconnection cycle */
    const isReconnecting = ref(false)
    /** @brief Current reconnect attempt count */
    const reconnectAttempts = ref(0)

    /**
     * @brief Establish WebSocket connection to the telemetry server.
     * @description Connects to WS_URL with MessagePack parser and sets up event handlers.
     */
    function connect() {
        if (socket.value?.connected) return

        lastError.value = ''
        connectionState.value = 'connecting'
        socket.value = io(WS_URL, createSocketOptions())

        socket.value.on('connect', () => {
            isConnected.value = true
            lastError.value = ''
            isReconnecting.value = false
            reconnectAttempts.value = 0
            connectionState.value = 'connected'
            let flushedRoomId = null
            if (pendingRoomId.value) {
                socket.value.emit('join', pendingRoomId.value)
                flushedRoomId = pendingRoomId.value
                pendingRoomId.value = null
            }
            if (onConnect) onConnect({ flushedRoomId })
        })

        socket.value.on('disconnect', (reason) => {
            isConnected.value = false
            if (reason === 'io client disconnect') {
                connectionState.value = 'disconnected'
                isReconnecting.value = false
            } else {
                connectionState.value = 'reconnecting'
                isReconnecting.value = true
            }
            if (onDisconnect) onDisconnect(reason)
        })

        socket.value.on('connect_error', (error) => {
            lastError.value = error?.message || 'Socket connection failed'
            connectionState.value = isReconnecting.value ? 'reconnecting' : 'failed'
            if (onError) onError(lastError.value)
        })
        socket.value.on('reconnect_attempt', (attempt) => {
            reconnectAttempts.value = Number(attempt) || (reconnectAttempts.value + 1)
            isReconnecting.value = true
            connectionState.value = 'reconnecting'
        })
        socket.value.on('reconnect_failed', () => {
            isReconnecting.value = false
            connectionState.value = 'failed'
            lastError.value = lastError.value || 'Unable to reconnect socket'
            if (onError) onError(lastError.value)
        })

        socket.value.on('data', (rawData) => {
            if (onData) onData(rawData)
        })
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
        pendingRoomId.value = null
        isReconnecting.value = false
        reconnectAttempts.value = 0
        connectionState.value = 'disconnected'
    }

    /**
     * @brief Join a car's data room to receive its telemetry.
     * @param {string} carId - Car ID to join
     */
    function joinRoom(carId) {
        if (!carId) return
        pendingRoomId.value = carId
        if (socket.value && isConnected.value) {
            socket.value.emit('join', carId)
            pendingRoomId.value = null
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
        if (pendingRoomId.value === carId) {
            pendingRoomId.value = null
        }
    }

    return {
        socket,
        isConnected,
        lastError,
        connectionState,
        isReconnecting,
        reconnectAttempts,
        connect,
        disconnect,
        joinRoom,
        leaveRoom
    }
}
