/**
 * @file config.js
 * @brief Application configuration constants.
 * @description Exports environment-configurable URLs for the API and WebSocket
 *              connections. Falls back to localhost for development.
 */

/**
 * @brief Base URL for REST API requests.
 * @description Uses VITE_API_BASE_URL environment variable if set,
 *              otherwise defaults to localhost:3000.
 * @type {string}
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

/**
 * @brief WebSocket server URL.
 * @description Uses VITE_WS_URL environment variable if set,
 *              otherwise defaults to localhost:3000.
 * @type {string}
 */
export const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000'
