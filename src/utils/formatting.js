/**
 * @file formatting.js
 * @brief Display formatting utilities for telemetry data.
 * @description Provides helpers to format values and determine display units
 *              based on telemetry data key names.
 */

import { METRIC_PRECISION, roundMetric } from './metricPrecision'

/**
 * @brief Human-readable label for depth-of-discharge capacity basis.
 * @param {'peukert_capacity'|'actual_capacity'|'nominal_fallback'|string|null|undefined} basis - DoD denominator basis code
 * @returns {string} Display label for UI
 */
export function formatDodBasisLabel(basis) {
    if (basis === 'peukert_capacity') return 'Peukert Capacity'
    if (basis === 'actual_capacity') return 'Ideal Capacity'
    return 'Nominal fallback'
}

/**
 * @brief Depth of discharge percent for a discharge amount and capacity reference.
 * @param {number|null|undefined} dischargeAh - Window discharge in Ah
 * @param {number|null|undefined} capacityAh - Capacity denominator in Ah
 * @returns {number|null} DoD percent or null when inputs are invalid
 */
export function computeCapacityDodPercent(dischargeAh, capacityAh) {
    if (!Number.isFinite(dischargeAh) || dischargeAh < 0) return null
    if (!Number.isFinite(capacityAh) || capacityAh <= 0) return null
    return roundMetric((dischargeAh / capacityAh) * 100, 'estimatedPercent')
}

/**
 * @brief Format an open-circuit or loaded voltage zone id for display.
 * @param {string|null|undefined} zone - Voltage zone identifier
 * @returns {string} Human-readable zone label
 */
export function formatVoltageZoneLabel(zone) {
    if (zone === 'high') return 'High'
    if (zone === 'medium') return 'Medium'
    if (zone === 'low') return 'Low'
    if (zone === 'near_cutoff') return 'Near Cutoff'
    if (zone === 'deep_discharge') return 'Deep Discharge'
    if (zone === 'healthy_load') return 'Healthy (loaded)'
    if (zone === 'warning_load') return 'Warning (loaded)'
    if (zone === 'near_cutoff_load') return 'Near Cutoff (loaded)'
    if (zone === 'critical_load') return 'Critical (loaded)'
    if (zone === 'deep_discharge_load') return 'Deep Discharge (loaded)'
    return zone || '-'
}

/**
 * @brief Format a loaded terminal-voltage zone without the redundant loaded suffix.
 * @param {string|null|undefined} zone - Loaded zone identifier
 * @returns {string} Human-readable loaded-zone label
 */
export function formatLoadedZoneLabel(zone) {
    return formatVoltageZoneLabel(zone).replace(/\s*\(loaded\)$/i, '')
}

/**
 * @brief Format epoch ms as local clock time (24-hour HH:MM:SS).
 * @description Matches Laps tab lap timestamp display convention.
 * @param {number|null|undefined} timestampMs - Timestamp in milliseconds
 * @returns {string} Clock time or '-' when invalid
 */
export function formatClockTime(timestampMs) {
    if (!Number.isFinite(timestampMs)) return '-'
    return new Date(timestampMs).toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })
}

/**
 * @brief Get the display unit for a telemetry data key.
 * @description Infers the appropriate unit string based on the key name.
 *              Uses pattern matching on common telemetry naming conventions.
 * 
 * @param {string} key - The telemetry data key (e.g., 'speed', 'voltage', 'temp1')
 * @returns {string} The unit string (e.g., 'mph', 'V', '°C') or empty string if unknown
 */
export const getUnit = (key) => {
    const k = key.toLowerCase()
    if (k.includes('wh') && k !== 'powerw') return 'Wh'
    if (k === 'powerw' || k.includes('watt') || k === 'power') return 'W'
    if (k.includes('rpm')) return 'RPM'
    if (k.includes('gear')) return ''
    if (k.includes('lap')) return ''
    if (k.includes('speed')) return 'mph'
    if (k.includes('volt') || k.includes('batt') || k === 'v') return 'V'
    if (k.includes('amph')) return 'Ah'
    if (k.includes('curr') || k.includes('amp')) return 'A'
    if (k.includes('temp')) return '°C'
    if (k.includes('throttle') || k.includes('soc')) return '%'
    if (k.includes('press')) return 'psi'
    return ''
}

/**
 * @brief Format a telemetry value for display.
 * @description Applies appropriate formatting based on the data type and key name.
 *              Handles null/undefined gracefully, formats timestamps as time strings,
 *              GPS coordinates with high precision, and general numbers with 2 decimal places.
 * 
 * @param {string} key - The telemetry data key used to determine formatting rules
 * @param {*} value - The value to format (number, string, null, undefined)
 * @returns {string} Formatted string representation of the value
 */
export const formatValue = (key, value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '-'
    if (typeof value !== 'number') return value

    const k = key.toLowerCase()

    // Integers
    if (k.includes('rpm') || k.includes('gear') || k.includes('lap') || k.includes('brake')) {
        return value.toFixed(0)
    }

    // Time
    if (k === 'updated' || k === 'timestamp' || k.includes('time')) {
        return new Date(value).toLocaleTimeString()
    }

    // GPS
    if (k === 'lat' || k === 'lon' || k.includes('gps')) {
        return value.toFixed(5)
    }

    // Power and energy metrics
    if (k.includes('wh') && k !== 'powerw') return value.toFixed(METRIC_PRECISION.energyWh)
    if (k === 'powerw' || k.includes('watt') || k === 'power') return value.toFixed(METRIC_PRECISION.powerW)

    // Default 2 decimal places
    return value.toFixed(METRIC_PRECISION.voltage)
}
