/**
 * @file composables/useChartZoom.js
 * @brief Chart zoom state management composable.
 * @description Provides reactive state and methods for controlling
 *              chart zoom levels across all synchronized graphs.
 */

import { ref, computed } from 'vue'

/**
 * @brief Composable for managing chart zoom requests.
 * @description Centralizes chart zoom state so multiple components
 *              (keyboard shortcuts, slider, graph toolbar) can request
 *              zoom changes that are processed by TelemetryGraph.
 * @returns {Object} Chart zoom state and control methods
 */
export function useChartZoom() {
    /**
     * @brief Current chart zoom request.
     * @description Request types:
     * - 'absolute': { type, start, end } - Zoom to specific time range
     * - 'reset': { type } - Unlock and return to live scroll
     * - 'pan': { type, offsetMs } - Pan by milliseconds (+ = right)
     * - 'scale': { type, factor } - Scale zoom (< 1 = in, > 1 = out)
     * @type {Ref<Object|null>}
     */
    const chartZoomRequest = ref(null)
    /**
     * @brief Last resolved absolute zoom window applied to charts.
     * @description Stored in milliseconds so newly mounted charts can inherit
     *              the currently visible time span without waiting for a new
     *              user zoom gesture.
     * @type {Ref<{start: number, end: number} | null>}
     */
    const currentZoomWindowMs = ref(null)

    /** @brief Human-readable label for the active zoom lock (shown on Status/Graph). */
    const chartZoomLockLabel = ref('')

    /** @brief True when charts are locked to an absolute window instead of live scroll. */
    const isChartZoomLocked = computed(() => currentZoomWindowMs.value !== null)

    /**
     * @brief Request absolute chart zoom to specific time range.
     * @param {number} start - Start timestamp in milliseconds
     * @param {number} end - End timestamp in milliseconds
     * @param {string} [label='CUSTOM'] - Lock label for UI chip
     */
    function requestChartZoom(start, end, label = 'CUSTOM') {
        chartZoomRequest.value = { type: 'absolute', start, end }
        chartZoomLockLabel.value = label
    }

    /**
     * @brief Request chart zoom reset (unlock to live scroll).
     */
    function requestChartUnlock() {
        chartZoomRequest.value = { type: 'reset' }
        chartZoomLockLabel.value = ''
    }

    /**
     * @brief Request chart pan by time offset.
     * @param {number} offsetMs - Offset in milliseconds (positive = right, negative = left)
     */
    function requestChartPan(offsetMs) {
        chartZoomRequest.value = { type: 'pan', offsetMs }
    }

    /**
     * @brief Request chart zoom scale change.
     * @param {number} factor - Scale factor (< 1 = zoom in, > 1 = zoom out)
     */
    function requestChartScale(factor) {
        chartZoomRequest.value = { type: 'scale', factor }
    }

    /**
     * @brief Persist the current absolute chart zoom window.
     * @param {number} start - Window start timestamp in milliseconds
     * @param {number} end - Window end timestamp in milliseconds
     */
    function setCurrentZoomWindow(start, end) {
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            currentZoomWindowMs.value = { start, end }
            return
        }
        currentZoomWindowMs.value = null
    }

    /**
     * @brief Clear persisted absolute zoom window.
     */
    function clearCurrentZoomWindow() {
        currentZoomWindowMs.value = null
        chartZoomLockLabel.value = ''
    }

    /**
     * @brief Set the lock label without issuing a zoom request.
     * @param {string} label - Display label
     */
    function setChartZoomLockLabel(label) {
        chartZoomLockLabel.value = label || ''
    }

    return {
        chartZoomRequest,
        currentZoomWindowMs,
        chartZoomLockLabel,
        isChartZoomLocked,
        requestChartZoom,
        requestChartUnlock,
        requestChartPan,
        requestChartScale,
        setCurrentZoomWindow,
        clearCurrentZoomWindow,
        setChartZoomLockLabel
    }
}
