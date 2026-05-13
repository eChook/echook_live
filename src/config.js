/**
 * @file config.js
 * @brief Application configuration constants.
 * @description Exports environment-configurable URLs for the API and WebSocket
 *              connections. Falls back to localhost for development.
 */

/**
 * @brief Local development fallback URL.
 * @description Used only when explicit Vite env vars are missing.
 */
const LOCAL_FALLBACK_URL = 'http://localhost:3000'

/**
 * @brief Normalize URL string and enforce secure transport in production.
 * @param {string|undefined} rawUrl - URL value from environment
 * @param {'api'|'ws'} channel - URL channel for diagnostics
 * @returns {string} Normalized URL suitable for runtime client usage
 */
function normalizeRuntimeUrl(rawUrl, channel) {
    const resolvedUrl = rawUrl || LOCAL_FALLBACK_URL

    try {
        const parsed = new URL(resolvedUrl)
        const isSecure = parsed.protocol === 'https:' || parsed.protocol === 'wss:'
        const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'

        // Never allow plaintext transport outside local development.
        if (import.meta.env.PROD && !isSecure && !isLocalhost) {
            throw new Error(`Refusing insecure ${channel.toUpperCase()} URL in production: ${resolvedUrl}`)
        }

        return parsed.toString().replace(/\/$/, '')
    } catch (error) {
        throw new Error(`Invalid ${channel.toUpperCase()} URL configuration: ${resolvedUrl}. ${error.message}`)
    }
}

/**
 * @brief Base URL for REST API requests.
 * @description Uses `VITE_API_BASE_URL` with secure transport enforcement
 *              in production. Localhost remains allowed for development.
 * @type {string}
 */
export const API_BASE_URL = normalizeRuntimeUrl(import.meta.env.VITE_API_BASE_URL, 'api')

/**
 * @brief WebSocket server URL.
 * @description Uses `VITE_WS_URL` with secure transport enforcement in
 *              production while keeping localhost development support.
 * @type {string}
 */
export const WS_URL = normalizeRuntimeUrl(import.meta.env.VITE_WS_URL, 'ws')
