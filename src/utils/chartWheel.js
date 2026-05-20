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

/** @brief ECharts dataZoom action with no animation (smooth trackpad pan). */
const INSTANT_ZOOM_ACTION = {
  animation: { duration: 0, easing: 'linear' }
}

/**
 * @brief Apply a time pan to one ECharts instance (group connect syncs other charts).
 * @param {Object} chartInstance - ECharts instance (getOption / dispatchAction)
 * @param {number} offsetMs - Pan offset in ms (positive = later in time)
 * @param {{ earliestTime: number, latestTime: number }} timeRange - Session time bounds
 * @returns {boolean} True if a dataZoom action was dispatched
 */
export function dispatchChartPan(chartInstance, offsetMs, { earliestTime, latestTime }) {
  if (!chartInstance || !offsetMs) return false

  try {
    const axis = chartInstance.getOption()?.dataZoom?.[0]
    if (!axis) return false

    if (axis.startValue !== undefined && axis.endValue !== undefined) {
      const start = axis.startValue + offsetMs
      const end = axis.endValue + offsetMs
      chartInstance.dispatchAction({
        type: 'dataZoom',
        startValue: start,
        endValue: end,
        ...INSTANT_ZOOM_ACTION
      })
      return true
    }

    const totalDuration = (latestTime || 0) - (earliestTime || 0)
    if (totalDuration <= 0) return false

    let startP = axis.start !== undefined ? axis.start : 0
    let endP = axis.end !== undefined ? axis.end : 100
    const offsetP = (offsetMs / totalDuration) * 100
    startP += offsetP
    endP += offsetP

    if (startP < 0) startP = 0
    if (endP > 100) endP = 100
    if (endP - startP < 0.1) {
      const center = (startP + endP) / 2
      startP = center - 0.05
      endP = center + 0.05
    }

    chartInstance.dispatchAction({
      type: 'dataZoom',
      start: startP,
      end: endP,
      ...INSTANT_ZOOM_ACTION
    })
    return true
  } catch {
    return false
  }
}

/** @brief Accumulated pan offset (ms) for the current wheel gesture frame batch. */
let pendingPanMs = 0
/** @brief rAF id when a wheel pan flush is scheduled. */
let panRafId = null
/** @brief Callback that applies batched pan to the hovered chart. */
let pendingApplyPan = null

/**
 * @brief Reset wheel pan batch state (for tests and unmount).
 */
export function resetWheelPanSchedule() {
  if (panRafId != null) {
    cancelAnimationFrame(panRafId)
    panRafId = null
  }
  pendingPanMs = 0
  pendingApplyPan = null
}

/**
 * @brief Batch horizontal wheel pan to one update per animation frame.
 * @description Avoids N charts × M wheel events all calling getOption/dispatchAction via the store.
 * @param {number} offsetMs - Pan delta for this wheel event
 * @param {(offsetMs: number) => void} applyPan - Applies batched offset to the hovered chart
 */
export function scheduleWheelPan(offsetMs, applyPan) {
  if (!offsetMs) return
  pendingPanMs += offsetMs
  pendingApplyPan = applyPan
  if (panRafId != null) return

  panRafId = requestAnimationFrame(() => {
    const ms = pendingPanMs
    const apply = pendingApplyPan
    resetWheelPanSchedule()
    if (ms !== 0 && apply) apply(ms)
  })
}
