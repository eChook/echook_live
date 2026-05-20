import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AnalyticsTab from '../tabs/AnalyticsTab.vue'

let telemetryState
let settingsState

vi.mock('../../stores/telemetry', () => ({
    useTelemetryStore: () => telemetryState
}))

vi.mock('../../stores/settings', () => ({
    useSettingsStore: () => settingsState
}))

describe('AnalyticsTab', () => {
    beforeEach(() => {
        const now = Date.now()
        telemetryState = {
            unitSettings: { speedUnit: 'mph' },
            history: [],
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
                eventUndervoltageWarningV: 20,
                eventUndervoltageCriticalV: 18,
                eventOverTempWarningC: 55,
                eventOverTempCriticalC: 65,
                eventCurrentSpikeWarningA: 20,
                eventCurrentSpikeCriticalA: 35,
                eventDropoutWarningSec: 10,
                eventDropoutCriticalSec: 30,
                eventStaleWarningSec: 5,
                eventStaleCriticalSec: 15,
                eventOverlapWarningSec: 1,
                eventOverlapCriticalSec: 3
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
        telemetryState.history = [
            { timestamp: start, speed: 12, voltage: 24, current: 8, temp1: 30, temp2: 31, voltageDiff: 0.09, throttle: 10, brake: 0 },
            { timestamp: start + 1000, speed: 16, voltage: 24, current: 9, temp1: 31, temp2: 32, voltageDiff: 0.1, throttle: 15, brake: 0 },
            { timestamp: start + 2000, speed: 20, voltage: 24, current: 10, temp1: 32, temp2: 33, voltageDiff: 0.11, throttle: 20, brake: 0 }
        ]
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
        expect(wrapper.text()).toContain('LL_Time degradation')
        expect(wrapper.text()).toContain('Voltage / Imbalance')
        expect(wrapper.text()).toContain('Thermal')
    })

    it('switches between live and history modes', async () => {
        const wrapper = mount(AnalyticsTab)
        const historyButton = wrapper.findAll('button').find((button) => button.text().includes('History'))
        await historyButton.trigger('click')
        expect(wrapper.text()).toContain('Race')
        const liveButton = wrapper.findAll('button').find((button) => button.text().includes('Live Race'))
        await liveButton.trigger('click')
        expect(wrapper.text()).toContain('Analytics')
    })
})
