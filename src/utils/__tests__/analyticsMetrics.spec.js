import { describe, it, expect } from 'vitest'
import {
    computeThrottleHistogram,
    computeThrottleBrakeOverlap,
    detectRaceStart,
    computeStartMetrics,
    computeSupplyResistance,
    computeSessionStintKpis,
    computeLapDegradation,
    computeEnergyThermalSummary,
    scoreLapConfidence,
    filterLapSummaries,
    computeBaselineComparison,
    detectReliabilityEvents,
    buildEventJumpWindow,
    buildAnalyticsSummaryReport
} from '../analyticsMetrics'

describe('analyticsMetrics', () => {
    it('computes throttle histogram time percentages', () => {
        const samples = [
            { timestamp: 1000, throttle: 0, voltage: 24, current: 5 },
            { timestamp: 2000, throttle: 0, voltage: 24, current: 5 },
            { timestamp: 3000, throttle: 100, voltage: 24, current: 10 },
            { timestamp: 4000, throttle: 100, voltage: 24, current: 10 }
        ]

        const histogram = computeThrottleHistogram(samples)
        const idle = histogram.bins.find((bin) => bin.label === '0%')
        const full = histogram.bins.find((bin) => bin.label === '100%')

        expect(Math.round(idle.timePct)).toBe(67)
        expect(Math.round(full.timePct)).toBe(33)
        expect(histogram.totalTimeSec).toBe(3)
    })

    it('computes overlap events and durations', () => {
        const samples = [
            { timestamp: 1000, throttle: 0, brake: 0, voltage: 24, current: 2 },
            { timestamp: 2000, throttle: 15, brake: 1, voltage: 24, current: 10 },
            { timestamp: 3000, throttle: 20, brake: 1, voltage: 24, current: 10 },
            { timestamp: 4000, throttle: 0, brake: 0, voltage: 24, current: 2 },
            { timestamp: 5000, throttle: 20, brake: 1, voltage: 24, current: 10 },
            { timestamp: 6000, throttle: 0, brake: 0, voltage: 24, current: 2 }
        ]

        const overlap = computeThrottleBrakeOverlap(samples, { throttleThresholdPct: 5 })
        expect(overlap.eventCount).toBe(2)
        expect(overlap.totalDurationSec).toBe(3)
        expect(overlap.maxDurationSec).toBe(2)
    })

    it('detects race start from sustained speed/current', () => {
        const samples = [
            { timestamp: 1000, speed: 0, current: 0 },
            { timestamp: 2000, speed: 0.2, current: 12 },
            { timestamp: 3000, speed: 0.3, current: 11 },
            { timestamp: 4000, speed: 2.0, current: 8 }
        ]

        const start = detectRaceStart(samples, { speedUnit: 'mph', startCurrentThreshold: 10, sustainedSamples: 2 })
        expect(start.detected).toBe(true)
        expect(start.startIndex).toBe(1)
        expect(start.startTimestamp).toBe(2000)
    })

    it('computes interpolated 0-10 mph with sparse cadence', () => {
        const samples = [
            { timestamp: 0, speed: 0, current: 12, voltage: 24 },
            { timestamp: 2000, speed: 6, current: 11, voltage: 24 },
            { timestamp: 4000, speed: 12, current: 10, voltage: 24 },
            { timestamp: 6000, speed: 18, current: 9, voltage: 24 },
            { timestamp: 8000, speed: 24, current: 8, voltage: 24 }
        ]

        const metrics = computeStartMetrics(samples, {
            speedUnit: 'mph',
            startCurrentThreshold: 10,
            startWindowMs: 30000
        })

        expect(metrics.detected).toBe(true)
        expect(metrics.time0to10mphSec).toBeCloseTo(3.33, 2)
        expect(metrics.time0to20mphSec).toBeCloseTo(6.67, 2)
    })

    it('estimates supply resistance from V-I trend', () => {
        // Synthetic model: V = 24 - 0.02 * I (R = 20 mOhm)
        const samples = Array.from({ length: 12 }, (_, idx) => {
            const current = 2 + (idx * 2)
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current)
            }
        })

        const resistance = computeSupplyResistance(samples, {
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(resistance.valid).toBe(true)
        expect(resistance.rMilliOhm).toBeCloseTo(20, 3)
        expect(resistance.fitR2).toBeGreaterThan(0.99)
    })

    it('rejects resistance estimate when current spread is too small', () => {
        const samples = [
            { timestamp: 0, current: 10, voltage: 23.8 },
            { timestamp: 1000, current: 10.2, voltage: 23.79 },
            { timestamp: 2000, current: 10.1, voltage: 23.81 },
            { timestamp: 3000, current: 10.3, voltage: 23.78 },
            { timestamp: 4000, current: 10.2, voltage: 23.79 },
            { timestamp: 5000, current: 10.1, voltage: 23.8 },
            { timestamp: 6000, current: 10.2, voltage: 23.79 },
            { timestamp: 7000, current: 10.3, voltage: 23.78 }
        ]

        const resistance = computeSupplyResistance(samples, {
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(resistance.valid).toBe(false)
        expect(resistance.reason).toBe('insufficient_current_spread')
    })

    it('computes session and stint KPI summary with lap deltas', () => {
        const laps = [
            { lapNumber: 1, LL_Time: 75, LL_Ah: 0.5, LL_Eff: 6.2 },
            { lapNumber: 2, LL_Time: 74, LL_Ah: 0.51, LL_Eff: 6.3 },
            { lapNumber: 3, LL_Time: 76, LL_Ah: 0.52, LL_Eff: 6.1 },
            { lapNumber: 4, LL_Time: 73, LL_Ah: 0.49, LL_Eff: 6.4 }
        ]
        const samples = [
            { timestamp: 0, temp1: 34, temp2: 35, voltageDiff: 0.09 },
            { timestamp: 1000, temp1: 36, temp2: 37, voltageDiff: 0.12 }
        ]

        const kpis = computeSessionStintKpis(laps, samples, { lastNLaps: 3 })

        expect(kpis.totalLaps).toBe(4)
        expect(kpis.bestLapTimeSec).toBe(73)
        expect(kpis.medianLapTimeSec).toBe(74.5)
        expect(kpis.totalAh).toBeCloseTo(2.02, 5)
        expect(kpis.averageEfficiency).toBeCloseTo(6.25, 3)
        expect(kpis.maxTemp).toBe(37)
        expect(kpis.maxImbalance).toBe(0.12)
        expect(kpis.lapTimesWithDelta.length).toBe(4)
        expect(kpis.lapTimesWithDelta[0].deltaToBestSec).toBe(2)
        expect(kpis.lastNLaps).toEqual([74, 76, 73])
    })

    it('computes lap degradation with rolling deltas', () => {
        const laps = [
            { lapNumber: 1, LL_Time: 70 },
            { lapNumber: 2, LL_Time: 72 },
            { lapNumber: 3, LL_Time: 74 },
            { lapNumber: 4, LL_Time: 73 }
        ]

        const degradation = computeLapDegradation(laps, 'LL_Time', { rollingWindow: 2 })
        expect(degradation.bestValue).toBe(70)
        expect(degradation.points.length).toBe(4)
        expect(degradation.points[1].deltaToBest).toBe(2)
        expect(degradation.points[2].rollingAverage).toBeCloseTo(71, 3)
        expect(degradation.sparkline).toEqual([70, 72, 74, 73])
    })

    it('computes energy and thermal summary from time-window samples', () => {
        const samples = [
            { timestamp: 0, voltage: 24, current: 10, speed: 36, temp1: 30, temp2: 32, voltageDiff: 0.1 },
            { timestamp: 1000, voltage: 24, current: 12, speed: 36, temp1: 31, temp2: 33, voltageDiff: 0.12 },
            { timestamp: 2000, voltage: 24, current: 8, speed: 18, temp1: 32, temp2: 34, voltageDiff: 0.11 }
        ]

        const summary = computeEnergyThermalSummary(samples, { speedUnit: 'kph' })
        expect(summary.totalWh).toBeGreaterThan(0)
        expect(summary.avgPowerW).toBeGreaterThan(0)
        expect(summary.peakPowerW).toBe(288)
        expect(summary.distanceMiles).toBeGreaterThan(0)
        expect(summary.whPerMile).toBeGreaterThan(0)
        expect(summary.maxTemp).toBe(32)
        expect(summary.maxVoltageDiff).toBe(0.12)
    })

    it('handles sparse cadence and no-data windows for session KPIs', () => {
        const emptySummary = computeSessionStintKpis([], [])
        expect(emptySummary.totalLaps).toBe(0)
        expect(emptySummary.bestLapTimeSec).toBe(null)

        const sparseSamples = [
            { timestamp: 0, voltage: 24, current: 10, speed: 20 },
            { timestamp: 50000, voltage: 24, current: 10, speed: 20 }
        ]
        const sparseEnergy = computeEnergyThermalSummary(sparseSamples, { speedUnit: 'mph', maxDtMs: 10000 })
        expect(sparseEnergy.totalWh).toBe(0)
        expect(sparseEnergy.avgPowerW).toBe(null)
    })

    it('scores lap confidence and filters suspect laps', () => {
        const laps = [
            { lapNumber: 1, LL_Time: 74, LL_V: 24, LL_I: 10, LL_RPM: 1000, LL_Spd: 20, LL_Ah: 0.5, LL_Eff: 6.1 },
            { lapNumber: 2, LL_Time: 4, LL_V: 24, LL_I: 9, LL_RPM: 980, LL_Spd: 19, LL_Ah: 0.48, LL_Eff: 6.0 },
            { lapNumber: 4, LL_Time: 76, LL_V: null, LL_I: null, LL_RPM: null, LL_Spd: null, LL_Ah: null, LL_Eff: null }
        ]

        const confidence = scoreLapConfidence(laps[0], null, { minLapTimeSec: 10, maxLapTimeSec: 300 })
        expect(confidence.label).toBe('good')

        const filtered = filterLapSummaries(laps, {
            hideSuspect: true,
            hideInvalid: true,
            confidenceOptions: { minLapTimeSec: 10, maxLapTimeSec: 300 }
        })
        expect(filtered.laps.length).toBe(1)
        expect(filtered.excluded.length).toBe(2)
    })

    it('computes baseline deltas between races', () => {
        const currentLaps = [
            { lapNumber: 1, LL_Time: 74, LL_Ah: 0.49, LL_Eff: 6.2 },
            { lapNumber: 2, LL_Time: 73, LL_Ah: 0.5, LL_Eff: 6.3 }
        ]
        const baselineLaps = [
            { lapNumber: 1, LL_Time: 76, LL_Ah: 0.55, LL_Eff: 6.0 },
            { lapNumber: 2, LL_Time: 75, LL_Ah: 0.56, LL_Eff: 6.0 }
        ]
        const baseline = computeBaselineComparison(currentLaps, baselineLaps)
        expect(baseline.deltas.bestLapTimeSec).toBeLessThan(0)
        expect(baseline.deltas.totalAh).toBeLessThan(0)
        expect(baseline.deltas.averageEfficiency).toBeGreaterThan(0)
    })

    it('detects reliability events and builds jump windows', () => {
        const samples = [
            { timestamp: 0, voltage: 24, temp1: 30, temp2: 31, current: 10, throttle: 0, brake: 0 },
            { timestamp: 5_000, voltage: 17.5, temp1: 70, temp2: 68, current: 60, throttle: 20, brake: 1 },
            { timestamp: 45_000, voltage: 19.5, temp1: 40, temp2: 41, current: 5, throttle: 0, brake: 0 }
        ]

        const events = detectReliabilityEvents(samples, {
            dropoutWarningSec: 10
        })
        expect(events.some((event) => event.type === 'undervoltage')).toBe(true)
        expect(events.some((event) => event.type === 'over_temp')).toBe(true)
        expect(events.filter((event) => event.type === 'current_spike')).toHaveLength(1)
        expect(events.some((event) => event.type === 'dropout')).toBe(true)
        expect(events.some((event) => event.message.includes('Current reached 60.0 A'))).toBe(true)

        const jumpWindow = buildEventJumpWindow(events[0], { paddingBeforeMs: 1000, paddingAfterMs: 2000 })
        expect(jumpWindow.start).toBeGreaterThanOrEqual(0)
        expect(jumpWindow.end).toBeGreaterThan(jumpWindow.start)
    })

    it('builds analytics summary report text', () => {
        const report = buildAnalyticsSummaryReport({
            sessionKpis: { bestLapTimeSec: 72, medianLapTimeSec: 74, lapConsistencyStdDevSec: 1.2, totalLaps: 8, totalAh: 4.1, averageEfficiency: 6.3 },
            energyThermal: { totalWh: 150, whPerMile: 40 },
            overlapMetrics: { eventCount: 2 },
            events: [{ id: 'e1' }, { id: 'e2' }]
        })
        expect(report).toContain('eChook Analytics Summary')
        expect(report).toContain('Reliability events: 2')
    })
})

