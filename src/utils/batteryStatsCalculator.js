/**
 * @file utils/batteryStatsCalculator.js
 * @brief Helpers for preparing telemetry and running lifetime battery stat calculations.
 */

import { normalizeTelemetryPacket } from './telemetryPacket'
import { scalePacket } from './unitConversions'
import {
    computeLifetimeBatteryStats,
    createEmptyLifetimeBatteryStats,
    mergeLifetimeBatteryStats
} from './analyticsMetrics'

/**
 * @brief Normalize raw history rows into analytics-ready scaled samples.
 * @param {Array<Object>} rawPoints - Raw telemetry rows from history API
 * @returns {Array<Object>} Sorted scaled samples
 */
export function prepareAnalyticsSamples(rawPoints) {
    return (Array.isArray(rawPoints) ? rawPoints : [])
        .map((point) => normalizeTelemetryPacket(point))
        .filter((point) => point && Number.isFinite(point.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((point) => scalePacket(point))
}

/**
 * @brief Calculate lifetime stats for one assignment window.
 * @param {Array<Object>} rawTelemetry - Raw history rows
 * @param {Object} options - Options forwarded to computeLifetimeBatteryStats
 * @returns {Object} Partial lifetime stats
 */
export function calculateWindowStats(rawTelemetry, options = {}) {
    const samples = prepareAnalyticsSamples(rawTelemetry)
    return computeLifetimeBatteryStats(samples, options)
}

/**
 * @brief Calculate merged lifetime stats across multiple assignment windows.
 * @param {Array<{telemetry: Array<Object>, position: string}>} windows - Assignment windows
 * @param {Object} options - Shared calculation options
 * @returns {Object} Merged lifetime stats bundle
 */
export function calculateMergedLifetimeStats(windows, options = {}) {
    let accumulator = createEmptyLifetimeBatteryStats()

    for (const window of windows) {
        const partial = calculateWindowStats(window.telemetry, {
            ...options,
            position: window.position
        })
        accumulator = mergeLifetimeBatteryStats(accumulator, partial)
    }

    return accumulator
}

export {
    computeLifetimeBatteryStats,
    createEmptyLifetimeBatteryStats,
    mergeLifetimeBatteryStats
}
