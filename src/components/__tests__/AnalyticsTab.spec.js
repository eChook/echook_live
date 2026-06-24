import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AnalyticsTab from '../tabs/AnalyticsTab.vue'
import AnalyticsWindowPickerModal from '../analytics/AnalyticsWindowPickerModal.vue'

let telemetryState
let settingsState

vi.mock('../../stores/telemetry', () => ({
    useTelemetryStore: () => telemetryState
}))

vi.mock('../../stores/settings', () => ({
    useSettingsStore: () => settingsState
}))

vi.mock('../analytics/AnalyticsWindowPickerModal.vue', () => ({
    default: {
        props: ['isOpen', 'isLiveMode', 'samples', 'startMs', 'endMs', 'latestMs', 'oldestMs'],
        emits: ['close', 'apply'],
        template: `
          <div v-if="isOpen" data-test="analytics-window-picker-modal">
            <button type="button" data-test="apply-window" @click="$emit('apply', { startMs, endMs: latestMs })">Apply</button>
            <button type="button" data-test="close-window" @click="$emit('close')">Close</button>
          </div>
        `
    }
}))

vi.mock('../analytics/OverviewLapTrendChart.vue', () => ({
    default: {
        props: ['lapTime', 'lapAh', 'lapEfficiency'],
        template: '<div data-test="overview-lap-trend-chart" />'
    }
}))

vi.mock('../analytics/OverviewHistogramChart.vue', () => ({
    default: {
        props: ['histogram', 'channel'],
        emits: ['update:channel'],
        template: '<div data-test="overview-histogram-chart" />'
    }
}))

vi.mock('../analytics/OverviewSignalsChart.vue', () => ({
    default: {
        props: ['series', 'overlays', 'speedUnit'],
        emits: ['update:overlays'],
        template: '<div data-test="overview-signals-chart" />'
    }
}))

vi.mock('../analytics/BatterySectionPanel.vue', () => ({
    default: {
        props: [
            'title',
            'chartSeries',
            'batteryHealth',
            'scatterBranch'
        ],
        emits: ['help'],
        template: `
          <section :data-test="'battery-section-' + title.toLowerCase().replace(/\\s+/g, '-')">
            <h3>{{ title }}</h3>
            <button
              v-if="scatterBranch === 'total'"
              type="button"
              aria-label="Show supply resistance help"
              @click="$emit('help', 'supply_resistance_total')"
            >?</button>
            <div data-test="battery-resistance-scatter-chart" />
            <div v-if="(chartSeries?.resistanceVsAh?.points || []).length > 0" data-test="battery-resistance-ah-chart" />
            <slot name="header" />
            <div v-if="batteryHealth">Detailed {{ title }} Metrics — DoD {{ batteryHealth.dodPct?.value }}</div>
            <slot name="health" />
          </section>
        `
    }
}))

/**
 * @brief Click an analytics sub-tab by visible label.
 * @param {import('@vue/test-utils').VueWrapper} wrapper - Mounted component wrapper
 * @param {string} label - Sub-tab label (Overview, Battery, Event Log)
 */
async function selectAnalyticsSubTab(wrapper, label) {
    const tabButton = wrapper.findAll('[role="tab"]').find((button) => button.text().trim() === label)
    expect(tabButton).toBeTruthy()
    await tabButton.trigger('click')
}

describe('AnalyticsTab', () => {
    beforeEach(() => {
        const now = Date.now()
        telemetryState = {
            unitSettings: { speedUnit: 'mph' },
            history: [],
            displayHistory: [],
            displayLiveData: {},
            races: {},
            requestChartZoom: vi.fn(),
            togglePause: vi.fn(),
            isPaused: true
        }
        settingsState = {
            analyticsSettings: {
                liveWindowMinutes: 10,
                throttleOverlapThresholdPct: 5,
                startCurrentThresholdA: 10,
                manualStartOffsetSec: null,
                autoCollapseStartCardSec: 60,
                enableSideBySideHistoryCompare: false,
                eventUndervoltageWarningV: 18,
                eventUndervoltageCriticalV: 14,
                eventOverTempWarningC: 55,
                eventOverTempCriticalC: 65,
                eventCurrentSpikeWarningA: 40,
                eventCurrentSpikeCriticalA: 120,
                eventDropoutWarningSec: 10,
                eventOverlapWarningSec: 2,
                packNominalCapacityAh: 36,
                packActualCapacityAh: 36,
                packNominalSeriesVoltage: 24,
                peukertExponent: 1.255
            },
            activeTabId: 'analytics'
        }
        // Keep timestamps deterministic in each test run.
        vi.spyOn(Date, 'now').mockReturnValue(now)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('shows no-data state when the active window has no samples', () => {
        const wrapper = mount(AnalyticsTab)
        expect(wrapper.text()).toContain('No telemetry samples available for this view.')
    })

    it('renders session parity and energy/thermal cards in history mode', async () => {
        const start = Date.now() - 60_000
        const samples = [
            { timestamp: start, speed: 12, voltage: 24, voltageLower: 12.1, voltageHigh: 11.9, current: 8, temp1: 30, temp2: 31, voltageDiff: 0.09, throttle: 10, brake: 0 },
            { timestamp: start + 1000, speed: 16, voltage: 24, voltageLower: 12.0, voltageHigh: 12.0, current: 9, temp1: 31, temp2: 32, voltageDiff: 0.1, throttle: 15, brake: 0 },
            { timestamp: start + 2000, speed: 20, voltage: 24, voltageLower: 11.9, voltageHigh: 12.1, current: 10, temp1: 32, temp2: 33, voltageDiff: 0.11, throttle: 20, brake: 0 }
        ]
        telemetryState.history = samples
        telemetryState.displayHistory = samples
        telemetryState.races = {
            [start]: {
                startTimeMs: start,
                trackName: 'Track A',
                laps: {
                    1: { lapNumber: 1, LL_Time: 75, LL_Ah: 0.5, LL_Eff: 6.1 },
                    2: { lapNumber: 2, LL_Time: 74, LL_Ah: 0.49, LL_Eff: 6.2 }
                }
            }
        }

        const wrapper = mount(AnalyticsTab)
        const historyButton = wrapper.findAll('button').find((button) => button.text().includes('History'))
        await historyButton.trigger('click')

        expect(wrapper.text()).toContain('Session KPI Summary')
        expect(wrapper.find('[data-test="overview-lap-trend-chart"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('Pack Electrical')
        expect(wrapper.text()).toContain('Pack Voltage')
        expect(wrapper.text()).toContain('Rolling Avg (60s)')
        expect(wrapper.find('[data-test="overview-signals-chart"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('Thermal')

        await selectAnalyticsSubTab(wrapper, 'Battery')
        expect(wrapper.text()).toContain('Battery Pack')
        expect(wrapper.text()).toContain('Upper Battery')
        expect(wrapper.text()).toContain('Lower Battery')
        expect(wrapper.text()).toContain('Estimated Capacity Metrics')
        expect(wrapper.text()).toContain('Performance VS Yuasa REC36-12I datasheet')
        expect(wrapper.text()).toContain('Depth of Discharge (DoD)')
        expect(wrapper.text()).toContain('Peukert-normalized discharge')
        expect(wrapper.text()).toContain('Normalised Discharge vs Ideal')
        expect(wrapper.text()).toContain('Raw discharge vs ideal')
        expect(wrapper.text()).not.toContain('Percentage against Peukert Capacity')
        expect(wrapper.text()).not.toContain('Percentage against Normalized C/20 (ideal)')
        expect(wrapper.text()).toContain('Estimated State of Health (SoH)')
        expect(wrapper.text()).toContain('Battery State')
        expect(wrapper.text()).toContain('Open Circuit:')
        expect(wrapper.text()).toContain('Detailed Upper Battery Metrics')
        expect(wrapper.text()).toContain('Detailed Lower Battery Metrics')
        expect(wrapper.find('[data-test="battery-section-battery-pack"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="battery-section-upper-battery"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="battery-section-lower-battery"]').exists()).toBe(true)
        const helpButtons = wrapper.findAll('button').filter((button) => button.text().trim() === '?')
        expect(helpButtons.length).toBeGreaterThanOrEqual(5)
    })

    it('renders IR vs Ah chart in each battery section when rolling data exists', async () => {
        const start = Date.now() - 30_000
        const samples = Array.from({ length: 12 }, (_, idx) => {
            const current = 6 + (idx * 2)
            return {
                timestamp: start + (idx * 1000),
                speed: 12 + idx,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.011 * current),
                voltageHigh: 12 - (0.009 * current),
                temp1: 30,
                temp2: 31,
                voltageDiff: 0.05
            }
        })

        telemetryState.history = samples
        telemetryState.displayHistory = samples
        telemetryState.races = {
            [start]: {
                startTimeMs: start,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        await selectAnalyticsSubTab(wrapper, 'Battery')
        expect(wrapper.findAll('[data-test="battery-resistance-ah-chart"]').length).toBeGreaterThan(0)
    })

    it('shows pack health metrics only in the combined battery section', async () => {
        const start = Date.now() - 30_000
        const samples = Array.from({ length: 10 }, (_, idx) => {
            const current = 6 + idx
            return {
                timestamp: start + (idx * 1000),
                speed: 12 + idx,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.011 * current),
                voltageHigh: 12 - (0.009 * current),
                temp1: 30,
                temp2: 31,
                voltageDiff: 0.05
            }
        })

        telemetryState.history = samples
        telemetryState.displayHistory = samples
        telemetryState.races = {
            [start]: {
                startTimeMs: start,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        await selectAnalyticsSubTab(wrapper, 'Battery')

        const combined = wrapper.find('[data-test="battery-section-battery-pack"]')
        const upper = wrapper.find('[data-test="battery-section-upper-battery"]')
        expect(combined.text()).toContain('Depth of Discharge (DoD)')
        expect(upper.text()).toContain('Detailed Upper Battery Metrics')
        expect(upper.text()).not.toContain('Depth of Discharge (DoD)')
        expect(wrapper.find('[data-test="battery-section-lower-battery"]').text()).toContain('Detailed Lower Battery Metrics')
    })

    it('hides upper battery section when voltageHigh is below 1 V', async () => {
        const start = Date.now() - 30_000
        const samples = Array.from({ length: 10 }, (_, idx) => {
            const current = 6 + idx
            return {
                timestamp: start + (idx * 1000),
                speed: 12 + idx,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.011 * current),
                voltageHigh: idx === 9 ? 0.2 : 12 - (0.009 * current),
                temp1: 30,
                temp2: 31,
                voltageDiff: 0.05
            }
        })

        telemetryState.history = samples
        telemetryState.displayHistory = samples
        telemetryState.races = {
            [start]: {
                startTimeMs: start,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        await selectAnalyticsSubTab(wrapper, 'Battery')

        expect(wrapper.find('[data-test="battery-section-battery-pack"]').exists()).toBe(true)
        expect(wrapper.find('[data-test="battery-section-upper-battery"]').exists()).toBe(false)
        expect(wrapper.find('[data-test="upper-battery-unavailable"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('Channel unavailable (voltage below 1 V)')
        expect(wrapper.find('[data-test="battery-section-lower-battery"]').exists()).toBe(true)
    })

    it('opens metric help modal from the battery card', async () => {
        const start = Date.now() - 30_000
        const samples = Array.from({ length: 10 }, (_, idx) => {
            const current = 6 + idx
            return {
                timestamp: start + (idx * 1000),
                speed: 12 + idx,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.011 * current),
                voltageHigh: 12 - (0.009 * current),
                temp1: 30 + (idx * 0.1),
                temp2: 31 + (idx * 0.1),
                voltageDiff: 0.05
            }
        })

        telemetryState.history = samples
        telemetryState.displayHistory = samples
        telemetryState.races = {
            [start]: {
                startTimeMs: start,
                trackName: 'Track A',
                laps: {
                    1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 }
                }
            }
        }

        const wrapper = mount(AnalyticsTab)
        await selectAnalyticsSubTab(wrapper, 'Battery')
        const helpButton = wrapper.find('button[aria-label="Show supply resistance help"]')
        expect(helpButton.exists()).toBe(true)

        await helpButton.trigger('click')
        expect(wrapper.text()).toContain('Supply Resistance')
        expect(wrapper.text()).toContain('What this shows')
        expect(wrapper.text()).toContain('How to use it')
        expect(wrapper.text()).toContain('Caveats and assumptions')
        expect(wrapper.text()).toContain('Confidence interpretation')
        expect(wrapper.text()).toContain('Formula and inputs')
    })

    it('renders overview, battery, and event log sub-tabs when samples exist', async () => {
        const start = Date.now() - 30_000
        const samples = Array.from({ length: 5 }, (_, idx) => ({
            timestamp: start + (idx * 1000),
            speed: 12 + idx,
            current: 8 + idx,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }))
        telemetryState.history = samples
        telemetryState.displayHistory = samples
        telemetryState.races = {
            [start]: {
                startTimeMs: start,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        const subTabs = wrapper.findAll('[role="tab"]')
        expect(subTabs.map((tab) => tab.text().trim())).toEqual(['Overview', 'Battery', 'Event Log'])

        expect(wrapper.text()).toContain('Session KPI Summary')
        expect(wrapper.text()).not.toContain('Reliability Event Log')

        await selectAnalyticsSubTab(wrapper, 'Battery')
        expect(wrapper.text()).toContain('Battery Pack')
        expect(wrapper.text()).not.toContain('Session KPI Summary')

        await selectAnalyticsSubTab(wrapper, 'Event Log')
        expect(wrapper.text()).toContain('Reliability Event Log')
        expect(wrapper.text()).toContain('Export Events CSV')
    })

    it('disables live mode when loaded telemetry is not from today', async () => {
        const priorDay = new Date()
        priorDay.setDate(priorDay.getDate() - 1)
        priorDay.setHours(12, 0, 0, 0)
        const yesterday = priorDay.getTime()
        const sample = {
            timestamp: yesterday,
            speed: 12,
            current: 8,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }
        telemetryState.history = [sample]
        telemetryState.displayHistory = [sample]
        telemetryState.races = {
            [yesterday]: {
                startTimeMs: yesterday,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        const liveButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Live')
        expect(liveButton.attributes('disabled')).toBeDefined()
        expect(wrapper.find('#analytics-race').exists()).toBe(true)
    })

    it('switches between live and history modes', async () => {
        const wrapper = mount(AnalyticsTab)
        const historyButton = wrapper.findAll('button').find((button) => button.text().includes('History'))
        await historyButton.trigger('click')
        expect(wrapper.text()).toContain('Session')
        const liveButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Live')
        await liveButton.trigger('click')
        expect(wrapper.text()).toContain('Analytics')
    })

    it('shows lap session start in live lap mode and session select in history lap mode', async () => {
        const wrapper = mount(AnalyticsTab)
        expect(wrapper.text()).toContain('Session start')

        const historyButton = wrapper.findAll('button').find((button) => button.text().includes('History'))
        await historyButton.trigger('click')
        expect(wrapper.find('#analytics-race').exists()).toBe(true)
        expect(wrapper.text()).not.toContain('Session start')
    })

    it('shows user-defined window controls when User Defined source is selected', async () => {
        const wrapper = mount(AnalyticsTab)
        const userDefinedButton = wrapper.findAll('button').find((button) => button.text().trim() === 'User Defined')
        await userDefinedButton.trigger('click')
        expect(wrapper.text()).toContain('Set window')
        expect(wrapper.text()).toContain('Start')
    })

    it('shows no race session hint when live mode has no laps race yet', () => {
        const now = Date.now()
        telemetryState.history = [{
            timestamp: now - 1000,
            speed: 10,
            current: 8,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }]
        telemetryState.displayHistory = telemetryState.history

        const wrapper = mount(AnalyticsTab)
        expect(wrapper.text()).toContain('No race session yet')
    })

    it('filters live samples to on or after laps session race start', () => {
        const raceStart = Date.now() - 10_000
        const sample = {
            speed: 12,
            current: 8,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }
        telemetryState.history = [
            { ...sample, timestamp: raceStart - 2000 },
            { ...sample, timestamp: raceStart - 1000 }
        ]
        telemetryState.displayHistory = telemetryState.history
        telemetryState.races = {
            [raceStart]: {
                startTimeMs: raceStart,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        expect(wrapper.text()).toContain('No telemetry samples available for this view.')
    })

    it('includes live samples on or after laps session race start', () => {
        const raceStart = Date.now() - 10_000
        const sample = {
            speed: 12,
            current: 8,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }
        telemetryState.history = [
            { ...sample, timestamp: raceStart - 2000 },
            { ...sample, timestamp: raceStart + 1000 },
            { ...sample, timestamp: raceStart + 2000 }
        ]
        telemetryState.displayHistory = telemetryState.history
        telemetryState.races = {
            [raceStart]: {
                startTimeMs: raceStart,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        expect(wrapper.text()).toContain('Session KPI Summary')
        expect(wrapper.text()).not.toContain('No telemetry samples available for this view.')
    })

    it('narrows live analytics to user-defined start without mutating races', async () => {
        const raceStart = Date.now() - 20_000
        const sample = {
            speed: 12,
            current: 8,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }
        telemetryState.history = [
            { ...sample, timestamp: raceStart + 1000 },
            { ...sample, timestamp: raceStart + 5000 },
            { ...sample, timestamp: raceStart + 9000 }
        ]
        telemetryState.displayHistory = telemetryState.history
        telemetryState.races = {
            [raceStart]: {
                startTimeMs: raceStart,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1 } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        const userDefinedButton = wrapper.findAll('button').find((button) => button.text().trim() === 'User Defined')
        await userDefinedButton.trigger('click')

        const setWindowButton = wrapper.findAll('button').find((button) => button.text().includes('Set window'))
        await setWindowButton.trigger('click')
        await wrapper.find('[data-test="apply-window"]').trigger('click')

        expect(telemetryState.races[raceStart].startTimeMs).toBe(raceStart)
        expect(wrapper.text()).toContain('Session KPI Summary')
    })

    it('filters history user-defined window to selected start and end', async () => {
        const start = Date.now() - 60_000
        const mid = start + 20_000
        const end = start + 40_000
        const sample = {
            speed: 12,
            current: 8,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }
        telemetryState.history = [
            { ...sample, timestamp: start },
            { ...sample, timestamp: mid },
            { ...sample, timestamp: end },
            { ...sample, timestamp: end + 10_000 }
        ]
        telemetryState.displayHistory = telemetryState.history
        telemetryState.races = {
            [start]: {
                startTimeMs: start,
                trackName: 'Track A',
                laps: { 1: { lapNumber: 1, LL_Time: 74, LL_Ah: 0.5, LL_Eff: 6.1, startTime: start, finishTime: mid } }
            }
        }

        const wrapper = mount(AnalyticsTab)
        const historyButton = wrapper.findAll('button').find((button) => button.text().includes('History'))
        await historyButton.trigger('click')
        const userDefinedButton = wrapper.findAll('button').find((button) => button.text().trim() === 'User Defined')
        await userDefinedButton.trigger('click')

        const setWindowButton = wrapper.findAll('button').find((button) => button.text().includes('Set window'))
        await setWindowButton.trigger('click')
        const picker = wrapper.findComponent(AnalyticsWindowPickerModal)
        await picker.vm.$emit('apply', { startMs: mid, endMs: end })

        expect(wrapper.text()).toContain('Session KPI Summary')
        expect(wrapper.text()).not.toContain('No telemetry samples available for this view.')
    })

    it('excludes laps outside user-defined window from session KPIs', async () => {
        const windowStart = Date.now() - 50_000
        const windowEnd = Date.now() - 10_000
        const insideStart = windowStart + 5000
        const insideEnd = windowStart + 15_000
        const outsideStart = windowStart - 20_000
        const outsideEnd = windowStart - 5000
        const sample = {
            speed: 12,
            current: 8,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            temp1: 30,
            temp2: 31,
            voltageDiff: 0.1,
            throttle: 10,
            brake: 0
        }
        telemetryState.history = [
            { ...sample, timestamp: windowStart },
            { ...sample, timestamp: windowEnd }
        ]
        telemetryState.displayHistory = telemetryState.history
        telemetryState.races = {
            [windowStart]: {
                startTimeMs: windowStart,
                trackName: 'Track A',
                laps: {
                    1: { lapNumber: 1, LL_Time: 70, LL_Ah: 0.5, LL_Eff: 6.0, startTime: insideStart, finishTime: insideEnd },
                    2: { lapNumber: 2, LL_Time: 72, LL_Ah: 0.51, LL_Eff: 6.1, startTime: outsideStart, finishTime: outsideEnd }
                }
            }
        }

        const wrapper = mount(AnalyticsTab)
        const historyButton = wrapper.findAll('button').find((button) => button.text().includes('History'))
        await historyButton.trigger('click')
        const userDefinedButton = wrapper.findAll('button').find((button) => button.text().trim() === 'User Defined')
        await userDefinedButton.trigger('click')

        const setWindowButton = wrapper.findAll('button').find((button) => button.text().includes('Set window'))
        await setWindowButton.trigger('click')
        const picker = wrapper.findComponent(AnalyticsWindowPickerModal)
        await picker.vm.$emit('apply', { startMs: windowStart, endMs: windowEnd })
        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toMatch(/Total Laps:\s*1/)
    })
})
