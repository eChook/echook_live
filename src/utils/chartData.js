/**
 * @file chartData.js
 * @brief Helpers for preparing telemetry arrays for ECharts line series.
 */

/** @brief Default max elapsed time (ms) between points before a line break is inserted. */
export const MAX_LINE_GAP_MS = 30000

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

    const gapMs = t1 - t0
    if (gapMs <= maxGapMs) {
      continue
    }

    const nextValue = next[valueKey]
    if (!Number.isFinite(nextValue)) {
      continue
    }

    result.push({ ...next, [valueKey]: null })
  }

  return result
}
