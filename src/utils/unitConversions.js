/**
 * @file unitConversions.js
 * @brief Unit conversion and telemetry packet scaling utilities.
 * @description Provides functions for converting telemetry values between different
 *              unit systems (metric/imperial) and scaling raw telemetry packets
 *              for display with calculated derived values.
 */

/**
 * @brief Speed conversion factors from m/s to various units.
 * @type {Object.<string, number>}
 * @property {number} mph - Conversion factor for miles per hour
 * @property {number} kph - Conversion factor for kilometers per hour
 * @property {number} ms - Base unit (meters per second), factor of 1
 */
const SPEED_CONVERSIONS = {
    mph: 2.23694,
    kph: 3.6,
    ms: 1
}

/**
 * @brief Convert speed from meters per second to specified unit.
 * @description Applies the appropriate conversion factor for the target unit.
 *              Returns the input unchanged if null/undefined.
 * 
 * @param {number|null|undefined} valMs - Speed in meters per second
 * @param {string} [unit='mph'] - Target unit ('mph', 'kph', 'ms')
 * @returns {number|null|undefined} Converted speed, or original value if null/undefined
 */
export function convertSpeed(valMs, unit = 'mph') {
    if (valMs === undefined || valMs === null) return valMs
    return valMs * (SPEED_CONVERSIONS[unit] || 1)
}

/**
 * @brief Convert temperature from Celsius to specified unit.
 * @description Applies Fahrenheit conversion if requested.
 *              Returns the input unchanged if null/undefined.
 * 
 * @param {number|null|undefined} valC - Temperature in Celsius
 * @param {string} [unit='c'] - Target unit ('c' for Celsius, 'f' for Fahrenheit)
 * @returns {number|null|undefined} Converted temperature, or original value if null/undefined
 */
export function convertTemp(valC, unit = 'c') {
    if (valC === undefined || valC === null) return valC
    if (unit === 'f') return (valC * 9 / 5) + 32
    return valC
}

/**
 * @brief Scale a telemetry packet for display.
 * @description Applies unit conversions and calculates derived values from raw
 *              telemetry data. The returned packet is frozen to prevent mutation.
 * 
 *              Conversions applied:
 *              - `speed`: Converted from m/s to user's preferred unit
 *              - `temp1`, `temp2`: Converted to user's preferred temperature unit
 * 
 *              Derived values calculated:
 *              - `voltageHigh`: Battery high cell voltage (voltage - voltageLower)
 *              - `voltageDiff`: Voltage imbalance (voltageHigh - voltageLower)
 *              - `tempDiff`: Absolute temperature difference between sensors
 * 
 * @param {Object} pt - Raw telemetry data point
 * @param {number} [pt.speed] - Speed in meters per second
 * @param {number} [pt.temp1] - Temperature sensor 1 in Celsius
 * @param {number} [pt.temp2] - Temperature sensor 2 in Celsius
 * @param {number} [pt.voltage] - Total battery voltage
 * @param {number} [pt.voltageLower] - Lower cell voltage
 * @param {Object} [unitSettings={ speedUnit: 'mph', tempUnit: 'c' }] - User unit preferences
 * @param {string} [unitSettings.speedUnit] - Speed unit preference ('mph', 'kph', 'ms')
 * @param {string} [unitSettings.tempUnit] - Temperature unit preference ('c', 'f')
 * @returns {Object} Frozen packet with converted units and calculated metrics
 */
export function scalePacket(pt, unitSettings = { speedUnit: 'mph', tempUnit: 'c' }) {
    const newPt = { ...pt }

    // Apply unit conversions
    if (newPt.speed !== undefined) {
        newPt.speed = convertSpeed(pt.speed, unitSettings.speedUnit)
    }
    if (newPt.temp1 !== undefined) {
        newPt.temp1 = convertTemp(pt.temp1, unitSettings.tempUnit)
    }
    if (newPt.temp2 !== undefined) {
        newPt.temp2 = convertTemp(pt.temp2, unitSettings.tempUnit)
    }

    // Calculate V_Batt High = Voltage - V_Batt Low
    if (newPt.voltage !== undefined && newPt.voltageLower !== undefined) {
        newPt.voltageHigh = newPt.voltage - newPt.voltageLower
        // V_Batt Diff = High - Low (positive if H > L)
        newPt.voltageDiff = newPt.voltageHigh - newPt.voltageLower
    }

    // Calculate Temp Diff = |temp1 - temp2|
    if (newPt.temp1 !== undefined && newPt.temp2 !== undefined) {
        newPt.tempDiff = Math.abs(newPt.temp1 - newPt.temp2)
    }

    return Object.freeze(newPt)
}
