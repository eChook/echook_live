/**
 * @file utils/rateOfChangeWarnings.js
 * @brief Least-squares rate-of-change warnings for threshold channels.
 */

import { EVENT_THRESHOLD_DEFAULTS } from './eventThresholds'

/** @brief Default trailing window for slope calculation (ms). */
export const RATE_WARNING_WINDOW_MS = 3 * 60 * 1000

/** @brief Channel definitions for predictive warnings. */
export const RATE_WARNING_CHANNELS = Object.freeze([
    {
        key: 'temp1',
        label: 'Motor temp',
        unit: '°C',
        sampleKey: 'temp1',
        higherIsWorse: true,
        warningKey: 'eventOverTempWarningC',
        criticalKey: 'eventOverTempCriticalC'
    },
    {
        key: 'temp2',
        label: 'Controller temp',
        unit: '°C',
        sampleKey: 'temp2',
        higherIsWorse: true,
        warningKey: 'eventOverTempWarningC',
        criticalKey: 'eventOverTempCriticalC'
    },
    {
        key: 'voltage',
        label: 'Pack voltage',
        unit: 'V',
        sampleKey: 'voltage',
        higherIsWorse: false,
        warningKey: 'eventUndervoltageWarningV',
        criticalKey: 'eventUndervoltageCriticalV'
    }
])

/**
 * @brief Parse a candidate numeric value into a finite number.
 * @param {unknown} value - Candidate numeric value
 * @returns {number|null} Finite number or null
 */
function toFiniteNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * @brief Compute least-squares slope (value units per minute) over time-ordered samples.
 * @param {Array<{timestamp: number, value: number}>} points - Sample points
 * @returns {number|null} Slope per minute, or null when insufficient data
 */
export function computeLeastSquaresSlopePerMinute(points) {
    const data = (points || []).filter((point) =>
        Number.isFinite(point?.timestamp) && Number.isFinite(point?.value)
    )
    if (data.length < 2) return null

    const t0 = data[0].timestamp
    const xs = data.map((point) => (point.timestamp - t0) / 60000)
    const ys = data.map((point) => point.value)
    const n = xs.length
    const sumX = xs.reduce((acc, x) => acc + x, 0)
    const sumY = ys.reduce((acc, y) => acc + y, 0)
    const sumXY = xs.reduce((acc, x, index) => acc + x * ys[index], 0)
    const sumXX = xs.reduce((acc, x) => acc + x * x, 0)
    const denominator = n * sumXX - sumX * sumX
    if (Math.abs(denominator) < 1e-9) return null

    return (n * sumXY - sumX * sumY) / denominator
}

/**
 * @brief Extract trailing samples for one channel within a time window.
 * @param {Array<Object>} samples - Telemetry history
 * @param {string} sampleKey - Field key on each sample
 * @param {number} endMs - Window end timestamp
 * @param {number} windowMs - Trailing duration
 * @param {boolean} [useAbs=false] - Use absolute value
 * @returns {Array<{timestamp: number, value: number}>}
 */
export function extractTrailingChannelPoints(samples, sampleKey, endMs, windowMs, useAbs = false) {
    const startMs = endMs - windowMs
    const points = []
    for (const sample of samples || []) {
        const timestamp = toFiniteNumber(sample?.timestamp)
        if (timestamp === null || timestamp < startMs || timestamp > endMs) continue
        let value = toFiniteNumber(sample?.[sampleKey])
        if (value === null) continue
        if (useAbs) value = Math.abs(value)
        points.push({ timestamp, value })
    }
    return points
}

/**
 * @brief Find channels already past their warning threshold and return the most urgent (at most one).
 * @param {Array<Object>} samples - Full telemetry history
 * @param {Object} [settings={}] - Analytics threshold settings
 * @param {number} [nowMs=Date.now()] - Reference time for trailing window
 * @returns {Object|null} Warning descriptor or null
 */
export function selectTopRateOfChangeWarning(samples, settings = {}, nowMs = Date.now()) {
    const config = { ...EVENT_THRESHOLD_DEFAULTS, ...(settings || {}) }
    const data = Array.isArray(samples) ? samples : []
    if (data.length < 2) return null

    const candidates = []

    for (const channel of RATE_WARNING_CHANNELS) {
        const warningThreshold = toFiniteNumber(config[channel.warningKey])
        if (warningThreshold === null) continue

        const points = extractTrailingChannelPoints(
            data,
            channel.sampleKey,
            nowMs,
            RATE_WARNING_WINDOW_MS,
            channel.useAbs
        )
        if (points.length < 2) continue

        const slope = computeLeastSquaresSlopePerMinute(points)
        if (slope === null) continue

        const latestValue = points[points.length - 1].value
        const alreadyOver = channel.higherIsWorse
            ? latestValue >= warningThreshold
            : latestValue <= warningThreshold
        if (!alreadyOver) continue

        candidates.push({
            channelKey: channel.key,
            channelLabel: channel.label,
            unit: channel.unit,
            currentValue: latestValue,
            slopePerMinute: slope,
            warningThreshold,
            distanceOverThreshold: Math.abs(latestValue - warningThreshold),
            message: `${channel.label} above your warning threshold — ${formatWarningValue(latestValue, channel.unit)}, rising ${formatSlope(slope, channel.unit)}`
        })
    }

    if (candidates.length === 0) return null

    candidates.sort((a, b) => b.distanceOverThreshold - a.distanceOverThreshold)

    return candidates[0]
}

/**
 * @brief Format a warning value with unit.
 * @param {number} value - Numeric value
 * @param {string} unit - Unit suffix
 * @returns {string}
 */
function formatWarningValue(value, unit) {
    const decimals = unit === 'A' || unit === '°C' ? 1 : 2
    return `${value.toFixed(decimals)} ${unit}`.trim()
}

/**
 * @brief Format slope per minute for banner copy.
 * @param {number} slope - Slope per minute
 * @param {string} unit - Unit suffix
 * @returns {string}
 */
function formatSlope(slope, unit) {
    const sign = slope >= 0 ? '+' : ''
    return `${sign}${slope.toFixed(1)} ${unit}/min`
}
