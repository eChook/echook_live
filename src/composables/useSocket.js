/**
 * @file composables/useSocket.js
 * @brief WebSocket connection management composable.
 * @description Provides Socket.IO connection lifecycle management
 *              including connect, disconnect, and room joining.
 */

import { ref } from 'vue'
import { io } from 'socket.io-client'
import { WS_URL } from '../config'
import { socketMsgpackOptions } from '../utils/msgpack'

/**
 * @brief Composable for managing WebSocket connections.
 * @description Encapsulates Socket.IO client lifecycle and room management.
 *              Designed to be used by the telemetry store.
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.onConnect - Callback when connected
 * @param {Function} options.onDisconnect - Callback when disconnected
 * @param {Function} options.onData - Callback when data is received
 * @returns {Object} Socket state and control methods
 */
export function useSocket({ onConnect, onDisconnect, onData }) {
    /** @brief Socket.IO client instance */
    const socket = ref(null)

    /** @brief Whether WebSocket is currently connected */
    const isConnected = ref(false)

    /**
     * @brief Establish WebSocket connection to the telemetry server.
     * @description Connects to WS_URL with MessagePack parser and sets up event handlers.
     */
    function connect() {
        if (socket.value?.connected) return

        socket.value = io(WS_URL, socketMsgpackOptions)

        socket.value.on('connect', () => {
            isConnected.value = true
            if (onConnect) onConnect()
        })

        socket.value.on('disconnect', () => {
            isConnected.value = false
            if (onDisconnect) onDisconnect()
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
    }

    /**
     * @brief Join a car's data room to receive its telemetry.
     * @param {string} carId - Car ID to join
     */
    function joinRoom(carId) {
        if (socket.value && isConnected.value) {
            socket.value.emit('join', carId)
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

    return {
        socket,
        isConnected,
        connect,
        disconnect,
        joinRoom,
        leaveRoom
    }
}
