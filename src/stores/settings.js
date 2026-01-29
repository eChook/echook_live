/**
 * @file stores/settings.js
 * @brief User settings and preferences store.
 * @description Pinia store for managing persistent user preferences including
 *              unit settings, graph configuration, dashboard layout, and
 *              historical race data. All settings persist to localStorage.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * @brief Settings store for user preferences and race history.
 * @description Centralizes all user-configurable settings with automatic
 *              persistence. Separates UI preferences from telemetry data.
 */
export const useSettingsStore = defineStore('settings', () => {
    // ============================================
    // Performance & Retention Settings
    // ============================================

    /**
     * @brief Maximum number of telemetry history points to retain.
     * @description Limits memory usage by capping stored data points.
     *              Older points are discarded when limit is exceeded.
     * @type {Ref<number>}
     */
    const maxHistoryPoints = ref(50000)

    // ============================================
    // Unit Settings
    // ============================================

    /**
     * @brief Unit preferences for value display.
     * @property {string} speedUnit - Speed unit: 'mph', 'kph', or 'ms'
     * @property {string} tempUnit - Temperature unit: 'c' or 'f'
     * @type {Ref<Object>}
     */
    const unitSettings = ref({
        speedUnit: 'mph',
        tempUnit: 'c'
    })

    // ============================================
    // Graph/Visual Settings
    // ============================================

    /**
     * @brief Graph display configuration.
     * @property {boolean} showLapHighlights - Show colored lap regions on graph
     * @property {boolean} showAnimations - Enable chart animations
     * @property {boolean} showGrid - Show grid lines
     * @property {number} graphHeight - Graph height in pixels
     * @type {Ref<Object>}
     */
    const graphSettings = ref({
        showLapHighlights: true,
        showAnimations: false,
        showGrid: true,
        graphHeight: 320
    })

    // ============================================
    // Dashboard Persistence
    // ============================================

    /** @brief Currently active tab ID (graph, map, laps, etc.) */
    const activeTabId = ref('graph')

    /** @brief List of data keys shown in dashboard cards */
    const selectedDashboardKeys = ref(['voltage', 'current', 'speed', 'rpm'])

    /** @brief Whether to show the metric cards above the graph */
    const showDashboardMetrics = ref(true)

    /** @brief Whether user has dismissed the laps disclaimer */
    const hideLapsDisclaimer = ref(false)

    /** @brief Whether user has dismissed the history clear confirmation */
    const hideHistoryClearConfirmation = ref(false)

    /** @brief Whether to show the graph help modal on first load */
    const showGraphHelp = ref(true)

    /**
     * @brief Transient state for shortcuts modal visibility.
     * @description Not persisted - resets to false on page load.
     */
    const showShortcutsModal = ref(false)

    /** @brief Custom ordering of data cards set by user */
    const dataCardOrder = ref([])

    // ============================================
    // Race Records (Historical Lap Data)
    // ============================================

    /**
     * @brief Historical race session data.
     * @description Stores lap data organized by race start time:
     *              { [raceStartTime]: { startTimeMs, laps: { [lapNum]: data } } }
     * @type {Ref<Object>}
     */
    const races = ref({})

    // ============================================
    // Utility Actions
    // ============================================

    /**
     * @brief Import settings from an external source.
     * @description Merges provided settings into current state. Used for
     *              settings import/export functionality.
     * @param {Object} newData - Settings object to import
     */
    function importSettings(newData) {
        if (!newData) return

        if (newData.maxHistoryPoints !== undefined) maxHistoryPoints.value = newData.maxHistoryPoints
        if (newData.unitSettings) unitSettings.value = { ...unitSettings.value, ...newData.unitSettings }
        if (newData.graphSettings) graphSettings.value = { ...graphSettings.value, ...newData.graphSettings }
        if (newData.activeTabId) activeTabId.value = newData.activeTabId
        if (newData.selectedDashboardKeys) selectedDashboardKeys.value = newData.selectedDashboardKeys
        if (newData.showDashboardMetrics !== undefined) showDashboardMetrics.value = newData.showDashboardMetrics
        if (newData.hideLapsDisclaimer !== undefined) hideLapsDisclaimer.value = newData.hideLapsDisclaimer
        if (newData.hideHistoryClearConfirmation !== undefined) hideHistoryClearConfirmation.value = newData.hideHistoryClearConfirmation
        if (newData.showGraphHelp !== undefined) showGraphHelp.value = newData.showGraphHelp
        if (newData.dataCardOrder) dataCardOrder.value = newData.dataCardOrder
        if (newData.races) races.value = { ...races.value, ...newData.races }
    }

    return {
        // Performance
        maxHistoryPoints,

        // Units
        unitSettings,

        // Graph
        graphSettings,

        // Dashboard
        activeTabId,
        selectedDashboardKeys,
        showDashboardMetrics,
        hideLapsDisclaimer,
        hideHistoryClearConfirmation,
        showGraphHelp,
        showShortcutsModal,
        dataCardOrder,

        // Race Data
        races,

        // Actions
        importSettings
    }
}, {
    persist: true
})
