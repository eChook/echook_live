/**
 * @file metricPrecision.js
 * @brief Central display and storage precision policy for telemetry and analytics metrics.
 * @description Defines decimal-place limits aligned with incoming data resolution so derived
 *              values are not portrayed with false precision.
 */

/**
 * @brief Decimal precision policy keyed by metric category.
 * @type {Object.<string, number>}
 */
export const METRIC_PRECISION = {
    voltage: 2,
    current: 2,
    powerW: 2,
    powerUsedWh: 2,
    energyWh: 2,
    temp: 2,
    tempDiff: 2,
    resistanceMilliOhm: 0,
    resistanceSlopeMilliOhmPerMin: 1,
    fitR2: 2,
    /** Measured or lightly derived percentages (e.g. throttle histogram). */
    percent: 2,
    /** Model-estimated health percentages (DoD, SoH, ΔSoC) — coarser than raw math output. */
    estimatedPercent: 1,
    /** Integrated / Peukert-normalized amp-hours from window estimates (0.01 Ah). */
    peukertAh: 2,
    distanceMiles: 2,
    lapTimeSec: 2,
    gps: 5,
    integer: 0
}

/**
 * @brief Round a numeric value to a fixed number of decimal places.
 * @param {number} value - Value to round
 * @param {number} [decimals=2] - Decimal places
 * @returns {number} Rounded value
 */
export function roundToDecimals(value, decimals = 2) {
    const factor = 10 ** decimals
    return Math.round((value + Number.EPSILON) * factor) / factor
}

/**
 * @brief Round a finite numeric value using a METRIC_PRECISION key.
 * @param {number|null|undefined} value - Value to round
 * @param {keyof typeof METRIC_PRECISION|string} precisionKey - Key into METRIC_PRECISION
 * @returns {number|null|undefined} Rounded value, or original null/undefined/non-finite input
 */
export function roundMetric(value, precisionKey) {
    if (value === null || value === undefined) return value
    if (!Number.isFinite(value)) return value
    const decimals = METRIC_PRECISION[precisionKey]
    if (decimals === undefined) return roundToDecimals(value, METRIC_PRECISION.voltage)
    return roundToDecimals(value, decimals)
}

/**
 * @brief Quantize resistance to nearest integer milliohm (1 mΩ resolution).
 * @param {number|null|undefined} rMilliOhm - Resistance in milliohms
 * @returns {number|null|undefined} Integer mΩ or original null/undefined/non-finite input
 */
export function roundResistanceMilliOhm(rMilliOhm) {
    if (rMilliOhm === null || rMilliOhm === undefined) return rMilliOhm
    if (!Number.isFinite(rMilliOhm)) return rMilliOhm
    return roundMetric(rMilliOhm, 'resistanceMilliOhm')
}
