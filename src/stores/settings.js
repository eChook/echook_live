/**
 * @file stores/settings.js
 * @brief User settings and preferences store.
 * @description Pinia store for managing persistent user preferences including
 *              unit settings, graph configuration, dashboard layout, and
 *              historical race data. All settings persist to localStorage.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * @brief Settings store for user preferences and race history.
 * @description Centralizes all user-configurable settings with automatic
 *              persistence. Separates UI preferences from telemetry data.
 */
export const useSettingsStore = defineStore('settings', () => {
    /** @brief Minimum allowed telemetry history points for runtime safety. */
    const MIN_HISTORY_POINTS = 5000
    /** @brief Maximum allowed telemetry history points for runtime safety. */
    const MAX_HISTORY_POINTS = 50000
    /** @brief Minimum graph height in pixels. */
    const MIN_GRAPH_HEIGHT = 200
    /** @brief Maximum graph height in pixels. */
    const MAX_GRAPH_HEIGHT = 800

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

    // ============================================
    // Appearance (light / dark / system)
    // ============================================

    /**
     * @brief User-selected appearance mode.
     * @description `system` follows OS `prefers-color-scheme` via
     *              {@link syncSystemPrefersDark} and {@link systemPrefersDark}.
     * @type {Ref<'light'|'dark'|'system'>}
     */
    const themeMode = ref('system')

    /**
     * @brief Cached OS dark preference (updated by theme composable).
     * @description Only affects resolved theme when themeMode is `system`.
     * @type {Ref<boolean>}
     */
    const systemPrefersDark = ref(
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : false
    )

    /**
     * @brief Effective theme for UI and charts (`light` or `dark`).
     * @type {ComputedRef<'light'|'dark'>}
     */
    const resolvedTheme = computed(() => {
        if (themeMode.value === 'dark') return 'dark'
        if (themeMode.value === 'light') return 'light'
        return systemPrefersDark.value ? 'dark' : 'light'
    })

    /**
     * @brief Update cached OS dark-mode preference (from matchMedia).
     * @param {boolean} isDark - Whether prefers-color-scheme is dark
     */
    function syncSystemPrefersDark(isDark) {
        systemPrefersDark.value = !!isDark
    }

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
        if (!newData || typeof newData !== 'object' || Array.isArray(newData)) {
            return { success: false, errors: ['Invalid settings payload.'] }
        }

        const isObjectRecord = (value) => value && typeof value === 'object' && !Array.isArray(value)
        const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value))
        const errors = []

        const allowedRootKeys = new Set([
            'maxHistoryPoints',
            'unitSettings',
            'graphSettings',
            'activeTabId',
            'selectedDashboardKeys',
            'showDashboardMetrics',
            'hideLapsDisclaimer',
            'hideHistoryClearConfirmation',
            'showGraphHelp',
            'dataCardOrder',
            'races',
            'themeMode'
        ])
        Object.keys(newData).forEach((key) => {
            if (!allowedRootKeys.has(key)) {
                errors.push(`Unknown setting key rejected: ${key}`)
            }
        })

        if (newData.themeMode !== undefined) {
            const allowedThemeModes = new Set(['light', 'dark', 'system'])
            if (typeof newData.themeMode === 'string' && allowedThemeModes.has(newData.themeMode)) {
                themeMode.value = newData.themeMode
            } else {
                /** Invalid imports fall back to system (safe default). */
                themeMode.value = 'system'
                errors.push('themeMode invalid; reset to system.')
            }
        }

        if (newData.maxHistoryPoints !== undefined) {
            if (Number.isFinite(newData.maxHistoryPoints)) {
                maxHistoryPoints.value = clampNumber(Math.round(newData.maxHistoryPoints), MIN_HISTORY_POINTS, MAX_HISTORY_POINTS)
            } else {
                errors.push('maxHistoryPoints must be a valid number.')
            }
        }

        if (newData.unitSettings !== undefined) {
            if (isObjectRecord(newData.unitSettings)) {
                const nextUnitSettings = { ...unitSettings.value }
                if (newData.unitSettings.speedUnit !== undefined) {
                    const allowedSpeedUnits = new Set(['mph', 'kph', 'ms'])
                    if (allowedSpeedUnits.has(newData.unitSettings.speedUnit)) {
                        nextUnitSettings.speedUnit = newData.unitSettings.speedUnit
                    } else {
                        errors.push('unitSettings.speedUnit must be one of: mph, kph, ms.')
                    }
                }
                if (newData.unitSettings.tempUnit !== undefined) {
                    const allowedTempUnits = new Set(['c', 'f'])
                    if (allowedTempUnits.has(newData.unitSettings.tempUnit)) {
                        nextUnitSettings.tempUnit = newData.unitSettings.tempUnit
                    } else {
                        errors.push('unitSettings.tempUnit must be one of: c, f.')
                    }
                }
                unitSettings.value = nextUnitSettings
            } else {
                errors.push('unitSettings must be an object.')
            }
        }

        if (newData.graphSettings !== undefined) {
            if (isObjectRecord(newData.graphSettings)) {
                const nextGraphSettings = { ...graphSettings.value }
                if (newData.graphSettings.showLapHighlights !== undefined) {
                    if (typeof newData.graphSettings.showLapHighlights === 'boolean') {
                        nextGraphSettings.showLapHighlights = newData.graphSettings.showLapHighlights
                    } else {
                        errors.push('graphSettings.showLapHighlights must be boolean.')
                    }
                }
                if (newData.graphSettings.showAnimations !== undefined) {
                    if (typeof newData.graphSettings.showAnimations === 'boolean') {
                        nextGraphSettings.showAnimations = newData.graphSettings.showAnimations
                    } else {
                        errors.push('graphSettings.showAnimations must be boolean.')
                    }
                }
                if (newData.graphSettings.showGrid !== undefined) {
                    if (typeof newData.graphSettings.showGrid === 'boolean') {
                        nextGraphSettings.showGrid = newData.graphSettings.showGrid
                    } else {
                        errors.push('graphSettings.showGrid must be boolean.')
                    }
                }
                if (newData.graphSettings.graphHeight !== undefined) {
                    if (Number.isFinite(newData.graphSettings.graphHeight)) {
                        nextGraphSettings.graphHeight = clampNumber(
                            Math.round(newData.graphSettings.graphHeight),
                            MIN_GRAPH_HEIGHT,
                            MAX_GRAPH_HEIGHT
                        )
                    } else {
                        errors.push('graphSettings.graphHeight must be a valid number.')
                    }
                }
                graphSettings.value = nextGraphSettings
            } else {
                errors.push('graphSettings must be an object.')
            }
        }

        if (newData.activeTabId !== undefined) {
            if (typeof newData.activeTabId === 'string' && newData.activeTabId.length > 0) {
                activeTabId.value = newData.activeTabId
            } else {
                errors.push('activeTabId must be a non-empty string.')
            }
        }

        if (newData.selectedDashboardKeys !== undefined) {
            if (Array.isArray(newData.selectedDashboardKeys) && newData.selectedDashboardKeys.every((key) => typeof key === 'string')) {
                selectedDashboardKeys.value = newData.selectedDashboardKeys
            } else {
                errors.push('selectedDashboardKeys must be an array of strings.')
            }
        }
        if (newData.showDashboardMetrics !== undefined) {
            if (typeof newData.showDashboardMetrics === 'boolean') {
                showDashboardMetrics.value = newData.showDashboardMetrics
            } else {
                errors.push('showDashboardMetrics must be boolean.')
            }
        }
        if (newData.hideLapsDisclaimer !== undefined) {
            if (typeof newData.hideLapsDisclaimer === 'boolean') {
                hideLapsDisclaimer.value = newData.hideLapsDisclaimer
            } else {
                errors.push('hideLapsDisclaimer must be boolean.')
            }
        }
        if (newData.hideHistoryClearConfirmation !== undefined) {
            if (typeof newData.hideHistoryClearConfirmation === 'boolean') {
                hideHistoryClearConfirmation.value = newData.hideHistoryClearConfirmation
            } else {
                errors.push('hideHistoryClearConfirmation must be boolean.')
            }
        }
        if (newData.showGraphHelp !== undefined) {
            if (typeof newData.showGraphHelp === 'boolean') {
                showGraphHelp.value = newData.showGraphHelp
            } else {
                errors.push('showGraphHelp must be boolean.')
            }
        }
        if (newData.dataCardOrder !== undefined) {
            if (Array.isArray(newData.dataCardOrder) && newData.dataCardOrder.every((key) => typeof key === 'string')) {
                dataCardOrder.value = newData.dataCardOrder
            } else {
                errors.push('dataCardOrder must be an array of strings.')
            }
        }
        if (newData.races !== undefined) {
            if (isObjectRecord(newData.races)) {
                races.value = { ...races.value, ...newData.races }
            } else {
                errors.push('races must be an object map.')
            }
        }

        return { success: errors.length === 0, errors }
    }

    return {
        // Performance
        maxHistoryPoints,

        // Units
        unitSettings,

        // Graph
        graphSettings,

        // Appearance
        themeMode,
        systemPrefersDark,
        resolvedTheme,
        syncSystemPrefersDark,

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
