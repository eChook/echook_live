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
 * @brief Decode a MessagePack buffer to a JavaScript object.
 * @description Handles both ArrayBuffer (from fetch/WebSocket) and Uint8Array inputs.
 *              Used to parse binary data received from the server.
 * 
 * @param {ArrayBuffer|Uint8Array} buffer - The MessagePack encoded binary data
 * @returns {*} The decoded JavaScript object/array
 */
export function decodeMsgpack(buffer) {
    if (buffer instanceof ArrayBuffer) {
        return msgpack.decode(new Uint8Array(buffer))
    }
    return msgpack.decode(buffer)
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
 * @brief Axios instance for general API requests with MessagePack support.
 * @description Pre-configured with:
 *              - MessagePack content negotiation headers
 *              - Automatic request body encoding to MessagePack
 *              - Automatic response decoding from MessagePack (with JSON fallback)
 *              - ArrayBuffer response type for binary handling
 * @type {import('axios').AxiosInstance}
 */
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Accept': 'application/msgpack',
        'Content-Type': 'application/msgpack',
        'X-Requested-With': 'XMLHttpRequest'
    },
    responseType: 'arraybuffer',
    transformRequest: [(data, headers) => {
        // Don't encode GET requests (no body) or null/undefined
        if (data === undefined || data === null) return data
        return encodeMsgpack(data)
    }],
    transformResponse: [(data) => {
        // Handle empty responses
        if (!data) return null
        if (data.byteLength === 0) return null

        try {
            // Check for JSON-like start bytes: '{' (123) or '[' (91)
            // msgpack-lite treats these as positive fixints, so we must check for JSON first
            const firstByte = new Uint8Array(data, 0, 1)[0]
            if (firstByte === 123 || firstByte === 91) {
                try {
                    const text = new TextDecoder().decode(data)
                    return JSON.parse(text)
                } catch {
                    // Not valid JSON, continue to msgpack decode
                }
            }

            const decoded = decodeMsgpack(data)
            return decoded
        } catch (e) {
            // Fallback for non-msgpack responses (e.g., errors, or server sent JSON)
            try {
                const text = new TextDecoder().decode(data)
                console.warn('MessagePack decode failed, falling back to JSON:', text.substring(0, 100))
                return JSON.parse(text)
            } catch (jsonErr) {
                console.error('Failed to decode response as both MessagePack and JSON', e, jsonErr)
                return null
            }
        }
    }]
})

/**
 * @brief Axios instance for authentication API requests with MessagePack support.
 * @description Same configuration as `api` but with:
 *              - Base URL pointing to /auth endpoint
 *              - Credentials included for cookie-based session handling
 * @type {import('axios').AxiosInstance}
 */
export const authApi = axios.create({
    baseURL: `${API_BASE_URL}/auth`,
    withCredentials: true,
    headers: {
        'Accept': 'application/msgpack',
        'Content-Type': 'application/msgpack',
        'X-Requested-With': 'XMLHttpRequest'
    },
    responseType: 'arraybuffer',
    transformRequest: [(data) => {
        if (data === undefined || data === null) return data
        return encodeMsgpack(data)
    }],
    transformResponse: [(data) => {
        if (!data || data.byteLength === 0) return null
        try {
            const firstByte = new Uint8Array(data, 0, 1)[0]
            if (firstByte === 123 || firstByte === 91) {
                try {
                    return JSON.parse(new TextDecoder().decode(data))
                } catch {
                    // ignore
                }
            }
            return decodeMsgpack(data)
        } catch {
            return JSON.parse(new TextDecoder().decode(data))
        }
    }]
})
