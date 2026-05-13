/**
 * @file constants/accessPolicy.js
 * @brief Access policy constants for frontend API usage.
 * @description Centralizes which API surfaces are intentionally public versus
 *              session-protected so future changes do not accidentally require
 *              auth tokens for telemetry-by-ID workflows.
 */

/**
 * @brief Public telemetry route fragments.
 * @description These endpoints are intentionally usable without bearer tokens.
 */
export const PUBLIC_TELEMETRY_ROUTES = {
    latestByIdPrefix: '/api/get/',
    historyByIdPrefix: '/api/history/',
    availableDaysByIdPrefix: '/api/history/days/'
}

/**
 * @brief Session-protected route fragments.
 * @description These rely on cookie session/authz and must remain protected.
 */
export const AUTHENTICATED_ROUTES = {
    authPrefix: '/auth/',
    adminPrefix: '/admin/',
    accountPrefix: '/account/'
}

/**
 * @brief Build public latest-telemetry endpoint path by car ID.
 * @param {string} carId - Public telemetry identifier
 * @returns {string} Relative API path for latest telemetry packet
 */
export function getPublicLatestTelemetryPath(carId) {
    return `${PUBLIC_TELEMETRY_ROUTES.latestByIdPrefix}${carId}`
}

