/**
 * @file utils/telemetryKeys.js
 * @brief Telemetry key metadata and display utilities.
 * @description Provides constants and helper functions for telemetry key
 *              display names, descriptions, ordering, and categorization.
 */

/**
 * @brief Set of regular telemetry data keys (non-lap).
 * @description These keys represent continuous telemetry values that are
 *              graphed and displayed in the data ribbon.
 * @type {Set<string>}
 */
export const REGULAR_KEYS = new Set([
    'voltage', 'current', 'ampH', 'speed', 'rpm', 'throttle',
    'temp1', 'temp2', 'tempDiff', 'voltageLower', 'voltageHigh',
    'voltageDiff', 'gear', 'brake', 'currLap', 'lat', 'lon', 'track'
])

/**
 * @brief Set of lap summary data keys.
 * @description These keys are sent once per lap with aggregated statistics.
 * @type {Set<string>}
 */
export const LAP_KEYS = new Set([
    'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_Time', 'LL_Eff'
])

/**
 * @brief Human-readable display names for telemetry keys.
 * @type {Object.<string, string>}
 */
export const KEY_DISPLAY_NAMES = {
    voltage: 'Voltage',
    current: 'Current',
    voltageLower: 'V_Batt Low',
    voltageHigh: 'V_Batt High',
    voltageDiff: 'V_Batt Diff',
    rpm: 'RPM',
    speed: 'Speed',
    throttle: 'Throttle',
    temp1: 'Temp 1',
    temp2: 'Temp 2',
    tempDiff: 'Temp Diff',
    ampH: 'Amp Hours',
    currLap: 'Current Lap',
    gear: 'Gear',
    brake: 'Brake',
    lat: 'Latitude',
    lon: 'Longitude',
    track: 'Track'
}

/**
 * @brief Tooltip descriptions for telemetry keys.
 * @type {Object.<string, string>}
 */
export const KEY_DESCRIPTIONS = {
    voltage: 'Total battery voltage (24V Nominal)',
    current: 'Current draw from the battery',
    voltageLower: 'Lower battery voltage (The GND-12V battery)',
    voltageHigh: 'Upper battery voltage (12V-24V battery)',
    voltageDiff: 'Absolute difference between upper and lower',
    rpm: 'Motor revolutions per minute',
    speed: 'Ground speed in configured units',
    throttle: 'Throttle position (0-100%)',
    temp1: 'Temperature sensor 1',
    temp2: 'Temperature sensor 2',
    tempDiff: 'Absolute difference between the two temperatures',
    ampH: 'Cumulative amp-hours consumed this session',
    currLap: 'Current lap number',
    gear: 'Current gear selection',
    brake: 'Brake status (1 = engaged, 0 = released)',
    lat: 'GPS latitude coordinate',
    lon: 'GPS longitude coordinate',
    track: 'Current track or circuit name'
}

/**
 * @brief Preferred display order for telemetry keys.
 * @type {string[]}
 */
export const KEY_ORDER = [
    'voltage', 'current', 'ampH',
    'speed', 'rpm', 'throttle', 'voltageLower',
    'voltageHigh', 'voltageDiff', 'gear', 'brake',
    'temp1', 'temp2', 'tempDiff',
    'currLap', 'lat', 'lon', 'track'
]

/**
 * @brief Get human-readable display name for a telemetry key.
 * @param {string} key - Telemetry key
 * @returns {string} Display name or the key itself if not found
 */
export const getDisplayName = (key) => KEY_DISPLAY_NAMES[key] || key

/**
 * @brief Get description tooltip for a telemetry key.
 * @param {string} key - Telemetry key
 * @returns {string} Description or empty string if not found
 */
export const getDescription = (key) => KEY_DESCRIPTIONS[key] || ''
