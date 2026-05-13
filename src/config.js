/**
 * @file config.js
 * @brief Application configuration constants.
 * @description Exports environment-configurable URLs for the API and WebSocket
 *              connections. Falls back to the current browser host for development.
 */

/**
 * @brief Local development fallback URL.
 * @description Uses the current browser hostname so Vite's network URL works
 *              with a locally running API server on the same machine/LAN host.
 * @returns {string} Local API server URL
 */
function getLocalFallbackUrl() {
    const hostname = typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost'

    return `http://${hostname}:3000`
}

/**
 * @brief Align localhost env defaults with the current browser host in dev.
 * @description Vite exposes LAN URLs when run with --host. If .env.development
 *              still points to localhost, a browser opened on the LAN URL will
 *              send API/socket traffic to the wrong host from that browser's
 *              perspective, which breaks cookies and websocket connections.
 * @param {URL} parsed - Parsed runtime URL
 * @returns {URL} URL with local dev hostname aligned when appropriate
 */
function alignLocalDevHost(parsed) {
    const browserHostname = typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : ''
    const isBrowserOnLanHost = browserHostname && browserHostname !== 'localhost' && browserHostname !== '127.0.0.1'
    const isEnvLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'

    if (import.meta.env.DEV && isBrowserOnLanHost && isEnvLocalhost) {
        parsed.hostname = browserHostname
    }

    return parsed
}

/**
 * @brief Normalize URL string and enforce secure transport in production.
 * @param {string|undefined} rawUrl - URL value from environment
 * @param {'api'|'ws'} channel - URL channel for diagnostics
 * @returns {string} Normalized URL suitable for runtime client usage
 */
function normalizeRuntimeUrl(rawUrl, channel) {
    const resolvedUrl = rawUrl || getLocalFallbackUrl()

    try {
        const parsed = alignLocalDevHost(new URL(resolvedUrl))
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
 * @brief Whether local development should use the Vite same-origin proxy.
 * @description Keeping auth/admin/API calls same-origin in development makes
 *              browser session cookies behave exactly like production behind a
 *              reverse proxy, avoiding cross-port cookie edge cases.
 */
const USE_DEV_PROXY = import.meta.env.DEV && import.meta.env.VITE_DISABLE_DEV_PROXY !== 'true'

/**
 * @brief Base URL for REST API requests.
 * @description Uses `VITE_API_BASE_URL` with secure transport enforcement
 *              in production. Localhost remains allowed for development.
 * @type {string}
 */
export const API_BASE_URL = USE_DEV_PROXY ? '' : normalizeRuntimeUrl(import.meta.env.VITE_API_BASE_URL, 'api')

/**
 * @brief WebSocket server URL.
 * @description Uses `VITE_WS_URL` with secure transport enforcement in
 *              production while keeping localhost development support.
 * @type {string}
 */
export const WS_URL = USE_DEV_PROXY ? '' : normalizeRuntimeUrl(import.meta.env.VITE_WS_URL, 'ws')
