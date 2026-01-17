import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
    // 1. Performance & Retention
    const maxHistoryPoints = ref(50000)

    // 2. Unit Settings
    const unitSettings = ref({
        speedUnit: 'mph', // mph, kph, ms
        tempUnit: 'c'     // c, f
    })

    // 3. Graph/Visual Settings
    const graphSettings = ref({
        showLapHighlights: true,
        showAnimations: false,
        showGrid: true,
        graphHeight: 320,
        chartUpdateFreq: 5
    })

    // 4. Dashboard Persistence
    const activeTabId = ref('graph')
    const selectedDashboardKeys = ref(['voltage', 'current', 'speed', 'rpm']) // Default keys
    const showDashboardMetrics = ref(true)
    const hideLapsDisclaimer = ref(false)
    const hideHistoryClearConfirmation = ref(false)
    const dataCardOrder = ref([]) // User's custom order for data cards

    // 5. Race Records (Historical Lap Data)
    const races = ref({}) // { [raceStartTime]: { startTimeMs, laps: { [lapNum]: data } } }

    // 6. Utility Actions
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
        if (newData.dataCardOrder) dataCardOrder.value = newData.dataCardOrder
        if (newData.races) races.value = { ...races.value, ...newData.races }
    }

    return {
        maxHistoryPoints,
        unitSettings,
        graphSettings,
        activeTabId,
        selectedDashboardKeys,
        showDashboardMetrics,
        hideLapsDisclaimer,
        hideHistoryClearConfirmation,
        dataCardOrder,
        races,
        importSettings
    }
}, {
    persist: true
})
