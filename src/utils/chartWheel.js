/**
 * @file utils/chartWheel.js
 * @brief Wheel-event helpers for horizontal trackpad pan on telemetry charts.
 */

/**
 * @brief True when horizontal wheel delta dominates (trackpad sideways scroll).
 * @param {{ deltaX: number, deltaY: number }} wheel - Wheel-like object
 * @param {number} [threshold=1] - Minimum |deltaX| to treat as horizontal
 * @returns {boolean}
 */
export function isHorizontalWheel(wheel, threshold = 1) {
  return Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY) && Math.abs(wheel.deltaX) >= threshold
}

/**
 * @brief Map horizontal wheel delta to pan offset in milliseconds.
 * @description Positive deltaX maps to positive offset (later in time), matching ArrowRight pan.
 * @param {number} deltaX - Wheel deltaX in pixels
 * @param {number} visibleDurationMs - Currently visible time window on the x-axis
 * @param {number} chartWidthPx - Chart width in pixels
 * @returns {number} Pan offset in ms (0 when inputs are invalid)
 */
export function wheelDeltaXToPanMs(deltaX, visibleDurationMs, chartWidthPx) {
  if (!chartWidthPx || chartWidthPx <= 0) return 0
  if (!Number.isFinite(visibleDurationMs) || visibleDurationMs <= 0) return 0
  if (!Number.isFinite(deltaX) || deltaX === 0) return 0

  const offsetMs = (deltaX / chartWidthPx) * visibleDurationMs
  return Number.isFinite(offsetMs) ? offsetMs : 0
}

/**
 * @brief Visible time range (ms) from ECharts inside dataZoom axis state.
 * @param {Object|null|undefined} axis - dataZoom[0] from getOption()
 * @param {number} earliestTime - Session earliest timestamp (ms)
 * @param {number} latestTime - Session latest timestamp (ms)
 * @returns {number|null} Visible duration in ms, or null if unknown
 */
export function getVisibleDurationMs(axis, earliestTime, latestTime) {
  if (!axis) return null

  const startVal = axis.startValue
  const endVal = axis.endValue
  if (
    startVal !== undefined &&
    endVal !== undefined &&
    typeof startVal === 'number' &&
    typeof endVal === 'number' &&
    endVal > startVal
  ) {
    return endVal - startVal
  }

  const totalDuration = (latestTime || 0) - (earliestTime || 0)
  if (totalDuration <= 0) return null

  const startP = axis.start !== undefined ? axis.start : 0
  const endP = axis.end !== undefined ? axis.end : 100
  const spanP = endP - startP
  if (spanP <= 0) return null

  return (spanP / 100) * totalDuration
}
