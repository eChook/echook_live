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
 * @brief Default analytics event threshold values.
 * @description Shared by the settings UI reset controls and store initial state.
 */
/** @brief Default battery pack parameters used by analytics health metrics. */
export const DEFAULT_BATTERY_PACK_SETTINGS = Object.freeze({
    packNominalCapacityAh: 36,
    /** @brief Deliverable pack capacity (Ah) used as C_actual for DoD and SoH. */
    packActualCapacityAh: 36,
    packNominalSeriesVoltage: 24,
    peukertExponent: 1.16
})

/** @brief Default internal-resistance estimation settings for analytics IR v2. */
export const DEFAULT_IR_ESTIMATION_SETTINGS = Object.freeze({
    irCurrentDeadbandA: 0.5,
    irRcTauSec: 30,
    irRcResistanceScale: 0.35
})

export const DEFAULT_EVENT_THRESHOLD_SETTINGS = Object.freeze({
    eventUndervoltageWarningV: 18,
    eventUndervoltageCriticalV: 14,
    eventOverTempWarningC: 55,
    eventOverTempCriticalC: 65,
    eventCurrentSpikeWarningA: 40,
    eventCurrentSpikeCriticalA: 120,
    eventDropoutWarningSec: 10,
    eventOverlapWarningSec: 2
})

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
    /** @brief Minimum live analytics window in minutes. */
    const MIN_ANALYTICS_LIVE_WINDOW_MINUTES = 1
    /** @brief Maximum live analytics window in minutes. */
    const MAX_ANALYTICS_LIVE_WINDOW_MINUTES = 120

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
    // Analytics Settings
    // ============================================

    /**
     * @brief Configurable analytics thresholds and windows.
     * @description Used by analytics and laps derived metrics.
     * @property {number} liveWindowMinutes - Rolling live analysis window duration
     * @property {number} throttleOverlapThresholdPct - Min throttle percent for overlap detection
     * @property {number} startCurrentThresholdA - Min current used by race start detector
     * @type {Ref<Object>}
     */
    const analyticsSettings = ref({
        liveWindowMinutes: 10,
        throttleOverlapThresholdPct: 5,
        startCurrentThresholdA: 10,
        lapConfidenceMinTimeSec: 15,
        lapConfidenceMaxTimeSec: 600,
        hideSuspectLaps: false,
        hideInvalidLaps: false,
        excludeFirstLap: false,
        minimumLapTimeSec: 0,
        baselineRequireTrackMatch: true,
        manualStartOffsetSec: null,
        autoCollapseStartCardSec: 60,
        enableSideBySideHistoryCompare: false,
        ...DEFAULT_BATTERY_PACK_SETTINGS,
        ...DEFAULT_IR_ESTIMATION_SETTINGS,
        ...DEFAULT_EVENT_THRESHOLD_SETTINGS
    })

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
     * @brief Reset one analytics event threshold to its default value.
     * @param {keyof typeof DEFAULT_EVENT_THRESHOLD_SETTINGS} key - Threshold setting key
     */
    function resetEventThreshold(key) {
        if (!(key in DEFAULT_EVENT_THRESHOLD_SETTINGS)) return
        analyticsSettings.value[key] = DEFAULT_EVENT_THRESHOLD_SETTINGS[key]
    }

    /** @brief Reset all analytics event thresholds to their default values. */
    function resetAllEventThresholds() {
        Object.assign(analyticsSettings.value, DEFAULT_EVENT_THRESHOLD_SETTINGS)
    }

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
            'themeMode',
            'analyticsSettings'
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
        if (newData.analyticsSettings !== undefined) {
            if (isObjectRecord(newData.analyticsSettings)) {
                const nextAnalyticsSettings = { ...analyticsSettings.value }
                if (newData.analyticsSettings.liveWindowMinutes !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.liveWindowMinutes)) {
                        nextAnalyticsSettings.liveWindowMinutes = clampNumber(
                            Math.round(newData.analyticsSettings.liveWindowMinutes),
                            MIN_ANALYTICS_LIVE_WINDOW_MINUTES,
                            MAX_ANALYTICS_LIVE_WINDOW_MINUTES
                        )
                    } else {
                        errors.push('analyticsSettings.liveWindowMinutes must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.throttleOverlapThresholdPct !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.throttleOverlapThresholdPct)) {
                        nextAnalyticsSettings.throttleOverlapThresholdPct = clampNumber(
                            Number(newData.analyticsSettings.throttleOverlapThresholdPct),
                            0,
                            100
                        )
                    } else {
                        errors.push('analyticsSettings.throttleOverlapThresholdPct must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.startCurrentThresholdA !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.startCurrentThresholdA)) {
                        nextAnalyticsSettings.startCurrentThresholdA = clampNumber(
                            Number(newData.analyticsSettings.startCurrentThresholdA),
                            0,
                            1000
                        )
                    } else {
                        errors.push('analyticsSettings.startCurrentThresholdA must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.lapConfidenceMinTimeSec !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.lapConfidenceMinTimeSec)) {
                        nextAnalyticsSettings.lapConfidenceMinTimeSec = clampNumber(
                            Number(newData.analyticsSettings.lapConfidenceMinTimeSec),
                            1,
                            600
                        )
                    } else {
                        errors.push('analyticsSettings.lapConfidenceMinTimeSec must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.lapConfidenceMaxTimeSec !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.lapConfidenceMaxTimeSec)) {
                        nextAnalyticsSettings.lapConfidenceMaxTimeSec = clampNumber(
                            Number(newData.analyticsSettings.lapConfidenceMaxTimeSec),
                            1,
                            7200
                        )
                    } else {
                        errors.push('analyticsSettings.lapConfidenceMaxTimeSec must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.hideSuspectLaps !== undefined) {
                    if (typeof newData.analyticsSettings.hideSuspectLaps === 'boolean') {
                        nextAnalyticsSettings.hideSuspectLaps = newData.analyticsSettings.hideSuspectLaps
                    } else {
                        errors.push('analyticsSettings.hideSuspectLaps must be boolean.')
                    }
                }
                if (newData.analyticsSettings.hideInvalidLaps !== undefined) {
                    if (typeof newData.analyticsSettings.hideInvalidLaps === 'boolean') {
                        nextAnalyticsSettings.hideInvalidLaps = newData.analyticsSettings.hideInvalidLaps
                    } else {
                        errors.push('analyticsSettings.hideInvalidLaps must be boolean.')
                    }
                }
                if (newData.analyticsSettings.excludeFirstLap !== undefined) {
                    if (typeof newData.analyticsSettings.excludeFirstLap === 'boolean') {
                        nextAnalyticsSettings.excludeFirstLap = newData.analyticsSettings.excludeFirstLap
                    } else {
                        errors.push('analyticsSettings.excludeFirstLap must be boolean.')
                    }
                }
                if (newData.analyticsSettings.minimumLapTimeSec !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.minimumLapTimeSec)) {
                        nextAnalyticsSettings.minimumLapTimeSec = clampNumber(
                            Number(newData.analyticsSettings.minimumLapTimeSec),
                            0,
                            3600
                        )
                    } else {
                        errors.push('analyticsSettings.minimumLapTimeSec must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.baselineRequireTrackMatch !== undefined) {
                    if (typeof newData.analyticsSettings.baselineRequireTrackMatch === 'boolean') {
                        nextAnalyticsSettings.baselineRequireTrackMatch = newData.analyticsSettings.baselineRequireTrackMatch
                    } else {
                        errors.push('analyticsSettings.baselineRequireTrackMatch must be boolean.')
                    }
                }
                if (newData.analyticsSettings.manualStartOffsetSec !== undefined) {
                    if (newData.analyticsSettings.manualStartOffsetSec === null || Number.isFinite(newData.analyticsSettings.manualStartOffsetSec)) {
                        nextAnalyticsSettings.manualStartOffsetSec = newData.analyticsSettings.manualStartOffsetSec === null
                            ? null
                            : clampNumber(Number(newData.analyticsSettings.manualStartOffsetSec), 0, 1200)
                    } else {
                        errors.push('analyticsSettings.manualStartOffsetSec must be a valid number or null.')
                    }
                }
                if (newData.analyticsSettings.autoCollapseStartCardSec !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.autoCollapseStartCardSec)) {
                        nextAnalyticsSettings.autoCollapseStartCardSec = clampNumber(
                            Number(newData.analyticsSettings.autoCollapseStartCardSec),
                            0,
                            1800
                        )
                    } else {
                        errors.push('analyticsSettings.autoCollapseStartCardSec must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.enableSideBySideHistoryCompare !== undefined) {
                    if (typeof newData.analyticsSettings.enableSideBySideHistoryCompare === 'boolean') {
                        nextAnalyticsSettings.enableSideBySideHistoryCompare = newData.analyticsSettings.enableSideBySideHistoryCompare
                    } else {
                        errors.push('analyticsSettings.enableSideBySideHistoryCompare must be boolean.')
                    }
                }
                if (newData.analyticsSettings.eventUndervoltageWarningV !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventUndervoltageWarningV)) {
                        nextAnalyticsSettings.eventUndervoltageWarningV = clampNumber(
                            Number(newData.analyticsSettings.eventUndervoltageWarningV),
                            0,
                            1000
                        )
                    } else {
                        errors.push('analyticsSettings.eventUndervoltageWarningV must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.eventUndervoltageCriticalV !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventUndervoltageCriticalV)) {
                        nextAnalyticsSettings.eventUndervoltageCriticalV = clampNumber(
                            Number(newData.analyticsSettings.eventUndervoltageCriticalV),
                            0,
                            1000
                        )
                    } else {
                        errors.push('analyticsSettings.eventUndervoltageCriticalV must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.eventOverTempWarningC !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventOverTempWarningC)) {
                        nextAnalyticsSettings.eventOverTempWarningC = clampNumber(
                            Number(newData.analyticsSettings.eventOverTempWarningC),
                            -100,
                            300
                        )
                    } else {
                        errors.push('analyticsSettings.eventOverTempWarningC must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.eventOverTempCriticalC !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventOverTempCriticalC)) {
                        nextAnalyticsSettings.eventOverTempCriticalC = clampNumber(
                            Number(newData.analyticsSettings.eventOverTempCriticalC),
                            -100,
                            300
                        )
                    } else {
                        errors.push('analyticsSettings.eventOverTempCriticalC must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.eventCurrentSpikeWarningA !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventCurrentSpikeWarningA)) {
                        nextAnalyticsSettings.eventCurrentSpikeWarningA = clampNumber(
                            Number(newData.analyticsSettings.eventCurrentSpikeWarningA),
                            0,
                            1000
                        )
                    } else {
                        errors.push('analyticsSettings.eventCurrentSpikeWarningA must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.eventCurrentSpikeCriticalA !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventCurrentSpikeCriticalA)) {
                        nextAnalyticsSettings.eventCurrentSpikeCriticalA = clampNumber(
                            Number(newData.analyticsSettings.eventCurrentSpikeCriticalA),
                            0,
                            1000
                        )
                    } else {
                        errors.push('analyticsSettings.eventCurrentSpikeCriticalA must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.eventDropoutWarningSec !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventDropoutWarningSec)) {
                        nextAnalyticsSettings.eventDropoutWarningSec = clampNumber(
                            Number(newData.analyticsSettings.eventDropoutWarningSec),
                            0,
                            3600
                        )
                    } else {
                        errors.push('analyticsSettings.eventDropoutWarningSec must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.eventOverlapWarningSec !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.eventOverlapWarningSec)) {
                        nextAnalyticsSettings.eventOverlapWarningSec = clampNumber(
                            Number(newData.analyticsSettings.eventOverlapWarningSec),
                            0,
                            300
                        )
                    } else {
                        errors.push('analyticsSettings.eventOverlapWarningSec must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.packNominalCapacityAh !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.packNominalCapacityAh)) {
                        nextAnalyticsSettings.packNominalCapacityAh = clampNumber(
                            Number(newData.analyticsSettings.packNominalCapacityAh),
                            1,
                            500
                        )
                    } else {
                        errors.push('analyticsSettings.packNominalCapacityAh must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.packActualCapacityAh !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.packActualCapacityAh)) {
                        nextAnalyticsSettings.packActualCapacityAh = clampNumber(
                            Number(newData.analyticsSettings.packActualCapacityAh),
                            1,
                            500
                        )
                    } else {
                        errors.push('analyticsSettings.packActualCapacityAh must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.packNominalSeriesVoltage !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.packNominalSeriesVoltage)) {
                        nextAnalyticsSettings.packNominalSeriesVoltage = clampNumber(
                            Number(newData.analyticsSettings.packNominalSeriesVoltage),
                            6,
                            96
                        )
                    } else {
                        errors.push('analyticsSettings.packNominalSeriesVoltage must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.peukertExponent !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.peukertExponent)) {
                        nextAnalyticsSettings.peukertExponent = clampNumber(
                            Number(newData.analyticsSettings.peukertExponent),
                            1,
                            2.5
                        )
                    } else {
                        errors.push('analyticsSettings.peukertExponent must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.irCurrentDeadbandA !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.irCurrentDeadbandA)) {
                        nextAnalyticsSettings.irCurrentDeadbandA = clampNumber(
                            Number(newData.analyticsSettings.irCurrentDeadbandA),
                            0,
                            20
                        )
                    } else {
                        errors.push('analyticsSettings.irCurrentDeadbandA must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.irRcTauSec !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.irRcTauSec)) {
                        nextAnalyticsSettings.irRcTauSec = clampNumber(
                            Number(newData.analyticsSettings.irRcTauSec),
                            1,
                            600
                        )
                    } else {
                        errors.push('analyticsSettings.irRcTauSec must be a valid number.')
                    }
                }
                if (newData.analyticsSettings.irRcResistanceScale !== undefined) {
                    if (Number.isFinite(newData.analyticsSettings.irRcResistanceScale)) {
                        nextAnalyticsSettings.irRcResistanceScale = clampNumber(
                            Number(newData.analyticsSettings.irRcResistanceScale),
                            0,
                            1
                        )
                    } else {
                        errors.push('analyticsSettings.irRcResistanceScale must be a valid number.')
                    }
                }
                analyticsSettings.value = nextAnalyticsSettings
            } else {
                errors.push('analyticsSettings must be an object.')
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
        analyticsSettings,

        // Race Data
        races,

        // Actions
        importSettings,
        resetEventThreshold,
        resetAllEventThresholds
    }
}, {
    persist: true
})
