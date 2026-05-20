/**
 * @file chartData.js
 * @brief Helpers for preparing telemetry arrays for ECharts line series.
 */

import { normalizeTimestampToMs } from './telemetryPacket'

/** @brief Default max elapsed time (ms) between points before a line break is inserted. */
export const MAX_LINE_GAP_MS = 30000

/** @brief Re-export for gap comparisons (alias of normalizeTimestampToMs). */
export const timestampToMs = normalizeTimestampToMs

/**
 * @brief Insert synthetic rows with a null metric so ECharts does not draw across time gaps.
 * @description Prefer splitLineSeriesAtGaps for rendering; kept for tests and legacy callers.
 * @param {Array<Object>} points - Time-ordered telemetry objects with timestamp field
 * @param {string} valueKey - Encoded Y field (e.g. speed, voltage)
 * @param {number} [maxGapMs=MAX_LINE_GAP_MS] - Gap threshold in milliseconds
 * @returns {Array<Object>} New array; input is not mutated
 */
export function insertGapBreaks(points, valueKey, maxGapMs = MAX_LINE_GAP_MS) {
  if (!Array.isArray(points) || points.length === 0) {
    return []
  }

  const result = []

  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    result.push(current)

    const next = points[i + 1]
    if (!next) {
      continue
    }

    const t0 = current?.timestamp
    const t1 = next.timestamp
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) {
      continue
    }

    const gapMs = timestampToMs(t1) - timestampToMs(t0)
    if (gapMs <= maxGapMs) {
      continue
    }

    result.push({ ...next, [valueKey]: NaN })
  }

  return result
}

/**
 * @brief Split telemetry into separate line segments at timestamp gaps.
 * @description Each segment becomes its own ECharts line series so no renderer connects
 *              across outages. Breaks are based on elapsed time only (not metric value).
 * @param {Array<Object>} points - Time-ordered telemetry objects with timestamp field
 * @param {string} valueKey - Metric field for the Y axis
 * @param {number} [maxGapMs=MAX_LINE_GAP_MS] - Gap threshold in milliseconds
 * @returns {Array<Array<[number, number]>>} Segment arrays of [timestampMs, value] tuples
 */
export function splitLineSeriesAtGaps(points, valueKey, maxGapMs = MAX_LINE_GAP_MS) {
  if (!Array.isArray(points) || points.length === 0) {
    return []
  }

  const segments = []
  let current = []

  const flush = () => {
    if (current.length > 0) {
      segments.push(current)
      current = []
    }
  }

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const rawTs = point?.timestamp

    if (i > 0) {
      const prevTs = points[i - 1]?.timestamp
      const gapMs = timestampToMs(rawTs) - timestampToMs(prevTs)
      if (Number.isFinite(gapMs) && gapMs > maxGapMs) {
        flush()
      }
    }

    const value = point[valueKey]
    if (!Number.isFinite(value)) {
      continue
    }

    const x = timestampToMs(rawTs)
    current.push([Number.isFinite(x) ? x : rawTs, value])
  }

  flush()
  return segments
}

/**
 * @brief Build a single [timestamp, value] array with NaN breaks (legacy flat series).
 * @param {Array<Object>} points - Time-ordered telemetry objects
 * @param {string} valueKey - Metric field encoded on the Y axis
 * @param {number} [maxGapMs=MAX_LINE_GAP_MS] - Gap threshold in milliseconds
 * @returns {Array<[number, number]>} ECharts line series data tuples
 */
export function toLineSeriesData(points, valueKey, maxGapMs = MAX_LINE_GAP_MS) {
  return insertGapBreaks(points, valueKey, maxGapMs).map((point) => {
    const value = point[valueKey]
    const y = Number.isFinite(value) ? value : NaN
    const x = timestampToMs(point.timestamp)
    return [Number.isFinite(x) ? x : point.timestamp, y]
  })
}
