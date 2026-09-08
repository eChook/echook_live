/**
 * @file utils/dataQualityMetrics.js
 * @brief Packet rate, gap, and channel reporting metrics for Status data quality panel.
 */

import { MAX_LINE_GAP_MS } from './chartData'

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
 * @brief Count telemetry gaps exceeding the line-break threshold within a window.
 * @param {Array<Object>} samples - Sorted telemetry samples
 * @param {number} [maxGapMs=MAX_LINE_GAP_MS] - Gap threshold
 * @returns {{gapCount: number, maxGapSec: number}} Gap statistics
 */
export function computeGapMetrics(samples, maxGapMs = MAX_LINE_GAP_MS) {
    const data = Array.isArray(samples) ? samples : []
    let gapCount = 0
    let maxGapMsSeen = 0

    for (let index = 1; index < data.length; index += 1) {
        const prevTs = toFiniteNumber(data[index - 1]?.timestamp)
        const nextTs = toFiniteNumber(data[index]?.timestamp)
        if (prevTs === null || nextTs === null) continue
        const gapMs = nextTs - prevTs
        if (gapMs > maxGapMs) {
            gapCount += 1
            maxGapMsSeen = Math.max(maxGapMsSeen, gapMs)
        }
    }

    return {
        gapCount,
        maxGapSec: maxGapMsSeen / 1000
    }
}

/**
 * @brief Compute packet rate and last-packet age for a sample window.
 * @param {Array<Object>} samples - Window samples
 * @param {number} [lastPacketTimeMs=0] - Latest live packet timestamp from store
 * @param {number} [nowMs=Date.now()] - Reference clock
 * @returns {{packetRatePerSec: number|null, lastPacketAgeSec: number|null, sampleCount: number}}
 */
export function computePacketRateMetrics(samples, lastPacketTimeMs = 0, nowMs = Date.now()) {
    const data = Array.isArray(samples) ? samples : []
    const sampleCount = data.length

    let packetRatePerSec = null
    if (sampleCount >= 2) {
        const firstTs = toFiniteNumber(data[0]?.timestamp)
        const lastTs = toFiniteNumber(data[data.length - 1]?.timestamp)
        if (firstTs !== null && lastTs !== null && lastTs > firstTs) {
            const durationSec = (lastTs - firstTs) / 1000
            packetRatePerSec = durationSec > 0 ? (sampleCount - 1) / durationSec : null
        }
    }

    let lastPacketAgeSec = null
    if (Number.isFinite(lastPacketTimeMs) && lastPacketTimeMs > 0) {
        lastPacketAgeSec = Math.max(0, (nowMs - lastPacketTimeMs) / 1000)
    }

    return { packetRatePerSec, lastPacketAgeSec, sampleCount }
}

/**
 * @brief Count how many expected telemetry keys report at least one finite value in the window.
 * @param {Array<Object>} samples - Window samples
 * @param {string[]} expectedKeys - Keys the dashboard knows about
 * @returns {{reporting: number, total: number}}
 */
export function computeChannelReporting(samples, expectedKeys = []) {
    const keys = Array.isArray(expectedKeys) ? expectedKeys : []
    if (keys.length === 0) return { reporting: 0, total: 0 }

    let reporting = 0
    for (const key of keys) {
        const hasValue = (samples || []).some((sample) => toFiniteNumber(sample?.[key]) !== null)
        if (hasValue) reporting += 1
    }

    return { reporting, total: keys.length }
}

/**
 * @brief Format window time range and sample count for Status header meta.
 * @param {Array<Object>} samples - Window samples
 * @returns {string} Meta string e.g. "09:31:18 → 09:41:22 · 2,948 samples"
 */
export function formatWindowMeta(samples) {
    const data = Array.isArray(samples) ? samples : []
    if (data.length === 0) return 'No samples in window'

    const startTs = toFiniteNumber(data[0]?.timestamp)
    const endTs = toFiniteNumber(data[data.length - 1]?.timestamp)
    const startLabel = startTs !== null ? formatClock(startTs) : '—'
    const endLabel = endTs !== null ? formatClock(endTs) : '—'
    return `${startLabel} → ${endLabel} · ${data.length.toLocaleString()} samples`
}

/**
 * @brief Format epoch ms as HH:MM:SS (local).
 * @param {number} timestampMs - Epoch ms
 * @returns {string}
 */
function formatClock(timestampMs) {
    const date = new Date(timestampMs)
    const pad = (value) => String(value).padStart(2, '0')
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
