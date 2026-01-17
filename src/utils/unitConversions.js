/**
 * Unit conversion and packet scaling utilities
 * Extracted from telemetry store for testability
 */

// Speed conversion factors
const SPEED_CONVERSIONS = {
    mph: 2.23694,
    kph: 3.6,
    ms: 1
}

/**
 * Convert speed from m/s to specified unit
 * @param {number} valMs - Speed in meters per second
 * @param {string} unit - Target unit (mph, kph, ms)
 * @returns {number} Converted speed
 */
export function convertSpeed(valMs, unit = 'mph') {
    if (valMs === undefined || valMs === null) return valMs
    return valMs * (SPEED_CONVERSIONS[unit] || 1)
}

/**
 * Convert temperature from Celsius to specified unit
 * @param {number} valC - Temperature in Celsius
 * @param {string} unit - Target unit (c, f)
 * @returns {number} Converted temperature
 */
export function convertTemp(valC, unit = 'c') {
    if (valC === undefined || valC === null) return valC
    if (unit === 'f') return (valC * 9 / 5) + 32
    return valC
}

/**
 * Scale a telemetry packet for display, applying unit conversions and calculating derived values
 * @param {object} pt - Raw telemetry data point
 * @param {object} unitSettings - { speedUnit, tempUnit }
 * @returns {object} Scaled packet with converted units and calculated metrics
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
