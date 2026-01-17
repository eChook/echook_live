import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../settings'

describe('settings store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('has correct default values', () => {
        const settings = useSettingsStore()

        expect(settings.maxHistoryPoints).toBe(50000)
        expect(settings.unitSettings.speedUnit).toBe('mph')
        expect(settings.unitSettings.tempUnit).toBe('c')
        expect(settings.graphSettings.showLapHighlights).toBe(true)
        expect(settings.graphSettings.showAnimations).toBe(false)
        expect(settings.activeTabId).toBe('graph')
    })

    it('allows updating unit settings', () => {
        const settings = useSettingsStore()

        settings.unitSettings.speedUnit = 'kph'
        settings.unitSettings.tempUnit = 'f'

        expect(settings.unitSettings.speedUnit).toBe('kph')
        expect(settings.unitSettings.tempUnit).toBe('f')
    })

    it('allows updating graph settings', () => {
        const settings = useSettingsStore()

        settings.graphSettings.showGrid = false
        settings.graphSettings.graphHeight = 400

        expect(settings.graphSettings.showGrid).toBe(false)
        expect(settings.graphSettings.graphHeight).toBe(400)
    })

    describe('importSettings', () => {
        it('imports maxHistoryPoints', () => {
            const settings = useSettingsStore()

            settings.importSettings({ maxHistoryPoints: 25000 })

            expect(settings.maxHistoryPoints).toBe(25000)
        })

        it('merges unitSettings without overwriting unset fields', () => {
            const settings = useSettingsStore()
            settings.unitSettings.speedUnit = 'kph'

            settings.importSettings({ unitSettings: { tempUnit: 'f' } })

            expect(settings.unitSettings.speedUnit).toBe('kph') // Preserved
            expect(settings.unitSettings.tempUnit).toBe('f') // Updated
        })

        it('imports graphSettings', () => {
            const settings = useSettingsStore()

            settings.importSettings({
                graphSettings: {
                    showAnimations: true,
                    graphHeight: 500
                }
            })

            expect(settings.graphSettings.showAnimations).toBe(true)
            expect(settings.graphSettings.graphHeight).toBe(500)
        })

        it('handles null input gracefully', () => {
            const settings = useSettingsStore()
            const original = settings.maxHistoryPoints

            settings.importSettings(null)

            expect(settings.maxHistoryPoints).toBe(original)
        })

        it('imports dataCardOrder', () => {
            const settings = useSettingsStore()

            settings.importSettings({
                dataCardOrder: ['current', 'voltage', 'speed']
            })

            expect(settings.dataCardOrder).toEqual(['current', 'voltage', 'speed'])
        })
    })

    describe('export/import roundtrip', () => {
        it('exports all settings to JSON and imports them correctly', () => {
            const settings = useSettingsStore()

            // Configure various settings
            settings.maxHistoryPoints = 30000
            settings.unitSettings.speedUnit = 'kph'
            settings.unitSettings.tempUnit = 'f'
            settings.graphSettings.showAnimations = true
            settings.graphSettings.graphHeight = 450
            settings.activeTabId = 'laps'
            settings.selectedDashboardKeys = ['voltage', 'current', 'rpm']
            settings.showDashboardMetrics = false
            settings.hideLapsDisclaimer = true
            settings.dataCardOrder = ['speed', 'voltage', 'current']

            // Export settings (simulate what SettingsTab does)
            const exported = JSON.stringify({
                maxHistoryPoints: settings.maxHistoryPoints,
                unitSettings: settings.unitSettings,
                graphSettings: settings.graphSettings,
                activeTabId: settings.activeTabId,
                selectedDashboardKeys: settings.selectedDashboardKeys,
                showDashboardMetrics: settings.showDashboardMetrics,
                hideLapsDisclaimer: settings.hideLapsDisclaimer,
                dataCardOrder: settings.dataCardOrder
            })

            // Create new store (simulating app restart)
            setActivePinia(createPinia())
            const freshSettings = useSettingsStore()

            // Verify defaults
            expect(freshSettings.maxHistoryPoints).toBe(50000)
            expect(freshSettings.unitSettings.speedUnit).toBe('mph')

            // Import exported settings
            freshSettings.importSettings(JSON.parse(exported))

            // Verify all settings restored
            expect(freshSettings.maxHistoryPoints).toBe(30000)
            expect(freshSettings.unitSettings.speedUnit).toBe('kph')
            expect(freshSettings.unitSettings.tempUnit).toBe('f')
            expect(freshSettings.graphSettings.showAnimations).toBe(true)
            expect(freshSettings.graphSettings.graphHeight).toBe(450)
            expect(freshSettings.activeTabId).toBe('laps')
            expect(freshSettings.selectedDashboardKeys).toEqual(['voltage', 'current', 'rpm'])
            expect(freshSettings.showDashboardMetrics).toBe(false)
            expect(freshSettings.hideLapsDisclaimer).toBe(true)
            expect(freshSettings.dataCardOrder).toEqual(['speed', 'voltage', 'current'])
        })

        it('handles partial exports correctly', () => {
            const settings = useSettingsStore()
            settings.unitSettings.speedUnit = 'kph'

            // Export only unit settings
            const partialExport = JSON.stringify({
                unitSettings: settings.unitSettings
            })

            // New store
            setActivePinia(createPinia())
            const freshSettings = useSettingsStore()
            freshSettings.maxHistoryPoints = 99999 // Custom value

            // Import partial
            freshSettings.importSettings(JSON.parse(partialExport))

            // Unit settings updated, other settings preserved
            expect(freshSettings.unitSettings.speedUnit).toBe('kph')
            expect(freshSettings.maxHistoryPoints).toBe(99999)
        })
    })
})
