/**
 * @file msgpack.js
 * @brief MessagePack encoding/decoding utilities and API clients.
 * @description Provides MessagePack binary serialization for efficient data transfer
 *              between the client and server. Includes pre-configured Axios instances
 *              for API and Authentication endpoints with automatic MessagePack handling.
 */

import msgpack from 'msgpack-lite'
import axios from 'axios'
import { API_BASE_URL } from '../config'

/**
 * @brief Safely decode JSON text from binary payload.
 * @param {ArrayBuffer|Uint8Array} data - Binary response payload
 * @returns {*|null} Parsed JSON object or null when parsing fails
 */
function safeDecodeJson(data) {
    try {
        const text = new TextDecoder().decode(data)
        return JSON.parse(text)
    } catch {
        return null
    }
}

/**
 * @brief Decode server binary payload as JSON or MessagePack.
 * @param {ArrayBuffer|Uint8Array} data - Binary response payload
 * @returns {*|null} Decoded payload, or null for malformed/empty data
 */
function decodeResponsePayload(data) {
    if (!data || data.byteLength === 0) return null

    // Check for JSON-like start bytes: '{' (123) or '[' (91)
    const firstByte = new Uint8Array(data, 0, 1)[0]
    if (firstByte === 123 || firstByte === 91) {
        const json = safeDecodeJson(data)
        if (json !== null) return json
    }

    const decoded = decodeMsgpack(data)
    if (decoded !== null) return decoded

    return safeDecodeJson(data)
}

/**
 * @brief Create an Axios instance configured for MessagePack APIs.
 * @param {Object} options - Axios configuration overrides
 * @returns {import('axios').AxiosInstance} Configured Axios client
 */
function createMsgpackClient(options = {}) {
    return axios.create({
        headers: {
            'Accept': 'application/msgpack',
            'Content-Type': 'application/msgpack',
            'X-Requested-With': 'XMLHttpRequest'
        },
        responseType: 'arraybuffer',
        transformRequest: [(data) => {
            // Don't encode GET requests (no body) or null/undefined
            if (data === undefined || data === null) return data
            return encodeMsgpack(data)
        }],
        transformResponse: [(data) => decodeResponsePayload(data)],
        ...options
    })
}

/**
 * @brief Decode a MessagePack buffer to a JavaScript object.
 * @description Handles both ArrayBuffer (from fetch/WebSocket) and Uint8Array inputs.
 *              Used to parse binary data received from the server.
 * 
 * @param {ArrayBuffer|Uint8Array} buffer - The MessagePack encoded binary data
 * @returns {*} The decoded JavaScript object/array
 */
export function decodeMsgpack(buffer) {
    if (!buffer) return null
    try {
        if (buffer instanceof ArrayBuffer) {
            if (buffer.byteLength === 0) return null
            return msgpack.decode(new Uint8Array(buffer))
        }
        if (ArrayBuffer.isView(buffer)) {
            if (buffer.byteLength === 0) return null
            return msgpack.decode(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength))
        }
        return msgpack.decode(buffer)
    } catch {
        return null
    }
}

/**
 * @brief Encode a JavaScript object to MessagePack buffer.
 * @description Converts JavaScript objects to compact binary format for transmission.
 * 
 * @param {*} data - The JavaScript object/array to encode
 * @returns {Uint8Array} The MessagePack encoded binary data
 */
export function encodeMsgpack(data) {
    return msgpack.encode(data)
}

/**
 * @brief Socket.IO connection options for MessagePack format.
 * @description Query parameter that tells the server to send data in MessagePack format.
 * @type {Object}
 */
export const socketMsgpackOptions = {
    query: { format: 'msgpack' }
}

/**
 * @brief Build Socket.IO options with MessagePack query support.
 * @description Centralizes transport/query defaults so all socket clients
 *              keep a consistent reconnect and payload format configuration.
 * @param {Object} [overrides={}] - Additional Socket.IO client options
 * @returns {Object} Socket.IO options object
 */
export function createSocketOptions(overrides = {}) {
    return {
        // Allow Socket.IO to start with HTTP polling and upgrade when possible.
        // Some local/browser setups reject direct websocket-only handshakes.
        transports: ['polling', 'websocket'],
        reconnection: true,
        ...socketMsgpackOptions,
        ...overrides
    }
}

/**
 * @brief Axios instance for general API requests with MessagePack support.
 * @description Pre-configured with:
 *              - MessagePack content negotiation headers
 *              - Automatic request body encoding to MessagePack
 *              - Automatic response decoding from MessagePack (with JSON fallback)
 *              - ArrayBuffer response type for binary handling
 * @type {import('axios').AxiosInstance}
 */
export const api = createMsgpackClient({
    baseURL: API_BASE_URL,
    transformResponse: [(data) => {
        const decoded = decodeResponsePayload(data)
        if (decoded === null && data && data.byteLength > 0) {
            console.warn('Failed to decode API response payload')
        }
        return decoded
    }]
})

/**
 * @brief Axios instance for authentication API requests with MessagePack support.
 * @description Same configuration as `api` but with:
 *              - Base URL pointing to /auth endpoint
 *              - Credentials included for cookie-based session handling
 * @type {import('axios').AxiosInstance}
 */
export const authApi = createMsgpackClient({
    baseURL: `${API_BASE_URL}/auth`,
    withCredentials: true,
    transformResponse: [(data) => decodeResponsePayload(data)]
})
