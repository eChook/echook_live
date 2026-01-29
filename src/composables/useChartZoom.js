/**
 * @file composables/useChartZoom.js
 * @brief Chart zoom state management composable.
 * @description Provides reactive state and methods for controlling
 *              chart zoom levels across all synchronized graphs.
 */

import { ref } from 'vue'

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
     * @brief Request absolute chart zoom to specific time range.
     * @param {number} start - Start timestamp in milliseconds
     * @param {number} end - End timestamp in milliseconds
     */
    function requestChartZoom(start, end) {
        chartZoomRequest.value = { type: 'absolute', start, end }
    }

    /**
     * @brief Request chart zoom reset (unlock to live scroll).
     */
    function requestChartUnlock() {
        chartZoomRequest.value = { type: 'reset' }
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

    return {
        chartZoomRequest,
        requestChartZoom,
        requestChartUnlock,
        requestChartPan,
        requestChartScale
    }
}
