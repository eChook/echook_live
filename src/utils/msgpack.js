import msgpack from 'msgpack-lite'
import axios from 'axios'
import { API_BASE_URL } from '../config'

/**
 * Decode MessagePack buffer to JavaScript object.
 * Handles both ArrayBuffer and Uint8Array.
 */
export function decodeMsgpack(buffer) {
    if (buffer instanceof ArrayBuffer) {
        return msgpack.decode(new Uint8Array(buffer))
    }
    return msgpack.decode(buffer)
}

/**
 * Encode JavaScript object to MessagePack buffer.
 */
export function encodeMsgpack(data) {
    return msgpack.encode(data)
}

/**
 * Socket.IO options for MessagePack format.
 */
export const socketMsgpackOptions = {
    query: { format: 'msgpack' }
}

/**
 * Axios instance pre-configured for MessagePack content negotiation.
 */
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Accept': 'application/msgpack',
        'Content-Type': 'application/msgpack'
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
 * Auth-specific axios instance (same config, different baseURL).
 */
export const authApi = axios.create({
    baseURL: `${API_BASE_URL}/auth`,
    withCredentials: true,
    headers: {
        'Accept': 'application/msgpack',
        'Content-Type': 'application/msgpack'
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
