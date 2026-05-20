/**
 * @file chartData.js
 * @brief Helpers for preparing telemetry arrays for ECharts line series.
 */

/** @brief Default max elapsed time (ms) between points before a line break is inserted. */
export const MAX_LINE_GAP_MS = 30000

/**
 * @brief Convert a telemetry timestamp to milliseconds for gap comparison.
 * @description History payloads may use Unix seconds (~1e9) while live data uses ms (~1e12).
 * @param {number} timestamp - Raw timestamp from a packet
 * @returns {number} Timestamp in milliseconds
 */
export function timestampToMs(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return NaN
  }
  // Modern Unix seconds live in [1e9, 1e12); ms timestamps are >= 1e12.
  if (timestamp >= 1e9 && timestamp < 1e12) {
    return timestamp * 1000
  }
  return timestamp
}

/**
 * @brief Insert synthetic rows with a null metric so ECharts does not draw across time gaps.
 * @description For each adjacent pair A → B, if B.timestamp - A.timestamp exceeds maxGapMs
 *              and B has a finite value for valueKey, appends a shallow copy of B with
 *              valueKey set to null immediately before B in the output sequence.
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

    const nextValue = next[valueKey]
    if (!Number.isFinite(nextValue)) {
      continue
    }

    // NaN is the reliable missing-value sentinel for ECharts line series data.
    result.push({ ...next, [valueKey]: NaN })
  }

  return result
}

/**
 * @brief Build [timestamp, value] pairs for a line series, including gap breaks.
 * @param {Array<Object>} points - Time-ordered telemetry objects
 * @param {string} valueKey - Metric field encoded on the Y axis
 * @param {number} [maxGapMs=MAX_LINE_GAP_MS] - Gap threshold in milliseconds
 * @returns {Array<[number, number]>} ECharts line series data tuples
 */
export function toLineSeriesData(points, valueKey, maxGapMs = MAX_LINE_GAP_MS) {
  return insertGapBreaks(points, valueKey, maxGapMs).map((point) => {
    const value = point[valueKey]
    const y = Number.isFinite(value) ? value : NaN
    return [point.timestamp, y]
  })
}
