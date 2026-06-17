import { describe, it, expect } from 'vitest'
import {
    computeThrottleHistogram,
    computeThrottleBrakeOverlap,
    detectRaceStart,
    computeStartMetrics,
    computeSupplyResistance,
    computeBatteryWindowMetrics,
    computeDischargeCyclePeukertMetrics,
    computeDeltaAhSocWindowSoh,
    estimateC20TerminalVoltage,
    integratePeukertNormalizedNetAh,
    lookupYuasaC20SocFromVoltage,
    buildResistanceVsAhSeries,
    buildResistanceVsXSeries,
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

    it('estimates supply resistance branches from V-I trends', () => {
        // Synthetic model:
        // Total: V = 24 - 0.02 * I (20 mOhm)
        // Lower: V = 12 - 0.011 * I (11 mOhm)
        // Upper: V = 12 - 0.009 * I (9 mOhm)
        const samples = Array.from({ length: 12 }, (_, idx) => {
            const current = 2 + (idx * 2)
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.011 * current),
                voltageHigh: 12 - (0.009 * current)
            }
        })

        const resistance = computeSupplyResistance(samples, {
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(resistance.valid).toBe(true)
        expect(resistance.rMilliOhm).toBe(20)
        expect(resistance.fitR2).toBeGreaterThan(0.99)
        expect(resistance.branches.total.valid).toBe(true)
        expect(resistance.branches.lower.valid).toBe(true)
        expect(resistance.branches.upper.valid).toBe(true)
        expect(resistance.branches.lower.rMilliOhm).toBe(11)
        expect(resistance.branches.upper.rMilliOhm).toBe(9)
        expect(resistance.absDeltaMilliOhm).toBe(2)
        expect(resistance.fitMode).toBe('discharge')
        expect(resistance.discharge?.valid).toBe(true)
    })

    it('reports missing split voltage channels for branch resistance', () => {
        const samples = Array.from({ length: 10 }, (_, idx) => {
            const current = 5 + idx
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current)
            }
        })

        const resistance = computeSupplyResistance(samples, {
            minSampleCount: 8,
            minCurrentSpread: 3
        })

        expect(resistance.valid).toBe(true)
        expect(resistance.branches.lower.valid).toBe(false)
        expect(resistance.branches.upper.valid).toBe(false)
        expect(resistance.branches.lower.reason).toBe('missing_voltage_lower')
        expect(resistance.branches.upper.reason).toBe('missing_voltage_high')
        expect(resistance.absDeltaMilliOhm).toBe(null)
    })

    it('computes per-battery power, discharge, regen, and voltage extrema', () => {
        const samples = [
            { timestamp: 0, current: 10, voltage: 24, voltageLower: 12, voltageHigh: 12 },
            { timestamp: 1000, current: 20, voltage: 24, voltageLower: 11.8, voltageHigh: 12.2 },
            { timestamp: 2000, current: -5, voltage: 24, voltageLower: 12.1, voltageHigh: 11.9 },
            { timestamp: 3000, current: 0, voltage: 24, voltageLower: 12.0, voltageHigh: 12.0 }
        ]

        const metrics = computeBatteryWindowMetrics(samples, { maxDtMs: 10000 })

        expect(metrics.combined.instantaneousPowerW).toBe(0)
        expect(metrics.combined.latestVoltage).toBe(24)
        expect(metrics.combined.maxPowerW).toBe(480)
        expect(metrics.combined.dischargeWh).toBeCloseTo(0.2, 2)
        expect(metrics.combined.regenWh).toBeCloseTo(0.03, 2)
        expect(metrics.combined.maxVoltage).toBe(24)
        expect(metrics.combined.minVoltage).toBe(24)
        expect(metrics.lower.instantaneousPowerW).toBe(0)
        expect(metrics.upper.instantaneousPowerW).toBe(0)
        expect(metrics.lower.latestVoltage).toBe(12)
        expect(metrics.upper.latestVoltage).toBe(12)
        expect(metrics.lower.maxPowerW).toBe(236)
        expect(metrics.upper.maxPowerW).toBe(244)
        expect(metrics.lower.dischargeWh).toBeCloseTo(0.1, 2)
        expect(metrics.upper.dischargeWh).toBeCloseTo(0.1, 2)
        expect(metrics.lower.regenWh).toBeCloseTo(0.02, 2)
        expect(metrics.upper.regenWh).toBeCloseTo(0.02, 2)
        expect(metrics.lower.maxVoltage).toBe(12.1)
        expect(metrics.lower.minVoltage).toBe(11.8)
        expect(metrics.upper.maxVoltage).toBe(12.2)
        expect(metrics.upper.minVoltage).toBe(11.9)
    })

    it('handles missing lower and upper channels in battery window metrics', () => {
        const samples = [
            { timestamp: 0, current: 8, voltage: 24 },
            { timestamp: 1000, current: 9, voltage: 24.1 }
        ]

        const metrics = computeBatteryWindowMetrics(samples)
        expect(metrics.combined.sampleCount).toBe(2)
        expect(metrics.lower.sampleCount).toBe(0)
        expect(metrics.upper.sampleCount).toBe(0)
        expect(metrics.lower.instantaneousPowerW).toBe(null)
        expect(metrics.upper.instantaneousPowerW).toBe(null)
        expect(metrics.lower.latestVoltage).toBe(null)
        expect(metrics.upper.latestVoltage).toBe(null)
        expect(metrics.lower.maxPowerW).toBe(null)
        expect(metrics.upper.maxPowerW).toBe(null)
        expect(metrics.lower.maxVoltage).toBe(null)
        expect(metrics.upper.minVoltage).toBe(null)
        expect(metrics.lower.dischargeWh).toBe(0)
        expect(metrics.upper.regenWh).toBe(0)
    })

    it('computes estimated battery health metrics with confidence metadata', () => {
        const samples = Array.from({ length: 10 }, (_, idx) => {
            const current = 10 + (idx * 2)
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12.1 - (0.01 * current),
                voltageHigh: 11.9 - (0.009 * current),
                voltageDiff: -0.2
            }
        })

        const metrics = computeBatteryWindowMetrics(samples, {
            maxDtMs: 10000,
            nominalCapacityAh: 36,
            nominalSeriesVoltage: 24,
            peukertExponent: 1.255,
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(metrics.health.dodPct.metricType).toBe('estimated')
        expect(metrics.health.dodPct.value).toBeGreaterThan(0)
        expect(metrics.health.dodBasis).toBe('peukert_capacity')
        expect(Number.isFinite(metrics.health.soh.value)).toBe(false)
        expect(metrics.health.peukert.descriptor.id).toBe('peukert_expected_capacity')
        expect(metrics.health.soh.id).toBe('sohPct')
        expect(metrics.health.voltageZone.zone).toBeTruthy()
        expect(metrics.chartSeries.combined).toBeTruthy()
        expect(metrics.chartSeries.upper).toBeTruthy()
        expect(metrics.chartSeries.lower).toBeTruthy()
        expect(Array.isArray(metrics.chartSeries.combined.timeline)).toBe(true)
        expect(Number.isFinite(metrics.chartSeries.combined.timeline[0]?.smoothedVoc)).toBe(true)
        expect(Number.isFinite(metrics.chartSeries.upper.timeline[0]?.smoothedVoc)).toBe(true)
        expect(Number.isFinite(metrics.chartSeries.lower.timeline[0]?.smoothedVoc)).toBe(true)
        expect(Array.isArray(metrics.chartSeries.combined.vocTrend)).toBe(true)
        expect(metrics.chartSeries.combined.vocTrend.length).toBeGreaterThan(0)
        expect(Number.isFinite(metrics.chartSeries.combined.vocTrend[0].terminalVoltage)).toBe(true)
        expect(Number.isFinite(metrics.chartSeries.combined.vocTrend[0].estimatedVoc)).toBe(true)
        expect(Number.isFinite(metrics.chartSeries.combined.vocTrend[0].current)).toBe(true)
        expect(Number.isFinite(metrics.chartSeries.combined.vocTrend[0].smoothedVoc)).toBe(true)
        expect(Array.isArray(metrics.chartSeries.combined.viScatter)).toBe(true)
        expect(Array.isArray(metrics.chartSeries.combined.resistanceVsAh.points)).toBe(true)
        expect(Array.isArray(metrics.chartSeries.combined.netAh.points)).toBe(true)
        expect(Array.isArray(metrics.chartSeries.upper.viScatter)).toBe(true)
        expect(Array.isArray(metrics.chartSeries.lower.resistanceVsAh.points)).toBe(true)
        expect(metrics.batteryHealth.upper.dodPct).toBeTruthy()
        expect(metrics.batteryHealth.lower.voltageZone).toBeTruthy()
        expect(metrics.health.peukert.windowDischargeAh).toBeGreaterThan(0)
        if (Number.isFinite(metrics.health.soh.value)) {
            expect(metrics.health.soh.value).toBeLessThanOrEqual(100)
        }
    })

    it('keeps instantaneous V_oc near the ohmic intercept under synthetic discharge', () => {
        const samples = Array.from({ length: 20 }, (_, idx) => {
            const current = 5 + (idx * 2)
            return {
                timestamp: idx * 500,
                current,
                voltage: 24 - (0.02 * current)
            }
        })

        const metrics = computeBatteryWindowMetrics(samples, {
            maxDtMs: 10000,
            nominalCapacityAh: 36,
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        const vocTrend = metrics.chartSeries.combined.vocTrend
        const estimated = vocTrend.map((point) => point.estimatedVoc).filter(Number.isFinite)
        expect(estimated.length).toBeGreaterThan(0)
        expect(Math.max(...estimated) - Math.min(...estimated)).toBeLessThan(0.2)

        const loaded = vocTrend.find((point) => Number(point.current) > 10)
        expect(loaded).toBeTruthy()
        expect(loaded.estimatedVoc).toBeGreaterThan(loaded.terminalVoltage)
    })

    it('applies ohmic correction during low-current samples in a pulsed load pattern', () => {
        const samples = []
        for (let idx = 0; idx < 24; idx += 1) {
            const highLoad = idx % 2 === 1
            const current = highLoad ? 10 + (idx * 2) : 1
            samples.push({
                timestamp: idx * 400,
                current,
                voltage: highLoad ? 24 - (0.02 * current) : 23.7
            })
        }

        const metrics = computeBatteryWindowMetrics(samples, {
            maxDtMs: 10000,
            nominalCapacityAh: 36,
            minSampleCount: 8,
            minCurrentSpread: 5,
            irCurrentDeadbandA: 0.5
        })

        const loaded = metrics.chartSeries.combined.vocTrend.find((point) => point.current > 10)
        const idle = metrics.chartSeries.combined.vocTrend.find((point) => point.current > 0 && point.current < 5)
        expect(loaded).toBeTruthy()
        expect(idle).toBeTruthy()
        expect(loaded.estimatedVoc).toBeGreaterThan(loaded.terminalVoltage)
        expect(idle.estimatedVoc).toBeGreaterThan(idle.terminalVoltage)
    })

    it('keeps SoH unavailable without valid V_C/20 boundaries', () => {
        const samples = Array.from({ length: 2000 }, (_, idx) => ({
            timestamp: idx * 1000,
            current: 80,
            voltage: 24 - (0.0001 * idx),
            voltageLower: 12 - (0.00005 * idx),
            voltageHigh: 12 - (0.00004 * idx),
            voltageDiff: 0.01
        }))

        const metrics = computeBatteryWindowMetrics(samples, {
            maxDtMs: 10000,
            nominalCapacityAh: 36,
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(metrics.health.dodBasis).toBe('peukert_capacity')
        expect(metrics.health.dodPct.value).toBeGreaterThan(0)
        expect(metrics.health.soh.value).toBe(null)
        expect(metrics.health.soh.reason).toBeTruthy()
        expect(metrics.batteryHealth.upper.soh.value).toBe(null)
        expect(metrics.batteryHealth.lower.soh.value).toBe(null)
    })

    it('computes per-battery health with battery-specific voltage zones and scoped DoD', () => {
        const samples = Array.from({ length: 8 }, (_, idx) => {
            const current = 6 + idx
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.011 * current),
                voltageHigh: 12 - (0.009 * current)
            }
        })
        samples.push({
            timestamp: 8000,
            current: 30,
            voltage: 23.4,
            voltageLower: 11.5,
            voltageHigh: 12.2
        })

        const metrics = computeBatteryWindowMetrics(samples, {
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(metrics.batteryHealth.upper.voltageZone.estimatedVoc).not.toBe(metrics.batteryHealth.lower.voltageZone.estimatedVoc)
        expect(metrics.batteryHealth.upper.dodPct.value).toBeCloseTo(metrics.health.dodPct.value, 5)
        expect(metrics.batteryHealth.lower.dodPct.value).toBeCloseTo(metrics.health.dodPct.value, 5)
        expect(metrics.batteryHealth.upper.peukert.windowDischargeAh).toBe(metrics.health.peukert.windowDischargeAh)
    })

    it('builds monotonic IR vs Net Ah points aligned to rolling timestamps', () => {
        const samples = Array.from({ length: 12 }, (_, idx) => {
            const current = 2 + (idx * 2)
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.011 * current),
                voltageHigh: 12 - (0.009 * current)
            }
        })

        const resistance = computeSupplyResistance(samples, {
            minSampleCount: 8,
            minCurrentSpread: 5
        })
        const series = buildResistanceVsXSeries(samples, resistance.branches.total.rolling, {
            maxDtMs: 10000,
            xAxisMode: 'netAh'
        })

        expect(series.points.length).toBeGreaterThan(0)
        expect(series.xAxisMode).toBe('netAh')
        for (let i = 1; i < series.points.length; i += 1) {
            expect(series.points[i].x).toBeGreaterThanOrEqual(series.points[i - 1].x)
            expect(series.points[i].rMilliOhm).toBeGreaterThan(0)
        }
        series.points.forEach((point) => {
            const rollingMatch = resistance.branches.total.rolling.find((entry) => entry.timestamp === point.timestamp)
            expect(rollingMatch).toBeTruthy()
        })
    })

    it('reduces Net Ah during regen intervals for IR x-axis', () => {
        const samples = [
            { timestamp: 0, current: 10, voltage: 24 },
            { timestamp: 1000, current: 10, voltage: 23.9 },
            { timestamp: 2000, current: -8, voltage: 24.1 },
            { timestamp: 3000, current: -8, voltage: 24.2 },
            { timestamp: 4000, current: 10, voltage: 23.8 }
        ]
        const rolling = [
            { timestamp: 1000, rMilliOhm: 20, fitR2: 0.9 },
            { timestamp: 3000, rMilliOhm: 22, fitR2: 0.85 }
        ]
        const series = buildResistanceVsXSeries(samples, rolling, { maxDtMs: 10000, xAxisMode: 'netAh' })
        expect(series.points).toHaveLength(2)
        expect(series.points[1].x).toBeLessThan(series.points[0].x + (10 / 3600) * 2)
    })

    it('prefers discharge-only fit when charge and discharge samples are mixed', () => {
        const samples = Array.from({ length: 10 }, (_, idx) => {
            const current = idx % 2 === 0 ? (8 + idx) : -(6 + idx)
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current)
            }
        })
        const resistance = computeSupplyResistance(samples, {
            minSampleCount: 4,
            minCurrentSpread: 3,
            irCurrentDeadbandA: 0.5
        })
        expect(resistance.discharge?.valid || resistance.charge?.valid || resistance.combined?.valid).toBe(true)
        if (resistance.discharge?.valid) {
            expect(resistance.fitMode).toBe('discharge')
        }
    })

    it('applies overlap-adjusted confidence penalty for dense rolling windows', () => {
        const samples = Array.from({ length: 24 }, (_, idx) => ({
            timestamp: idx * 1000,
            current: 2 + idx,
            voltage: 24 - (0.02 * (2 + idx))
        }))
        const resistance = computeSupplyResistance(samples, {
            minSampleCount: 8,
            minCurrentSpread: 5,
            rollingWindowSize: 12,
            rollingStep: 4
        })
        const denseSeries = buildResistanceVsXSeries(samples, resistance.branches.total.rolling, {
            maxDtMs: 10000,
            xAxisMode: 'netAh',
            rollingWindowSize: 12,
            rollingStep: 4
        })
        expect(denseSeries.points.length).toBeGreaterThan(1)
        expect(denseSeries.effectiveSampleCount).toBeLessThan(denseSeries.points.length)
    })

    it('filters invalid IR vs Ah points when resistance is non-physical', () => {
        const samples = [
            { timestamp: 0, current: 10, voltage: 24 },
            { timestamp: 1000, current: 12, voltage: 23.9 }
        ]
        const series = buildResistanceVsAhSeries(samples, [
            { timestamp: 0, rMilliOhm: -1, fitR2: 0.9 },
            { timestamp: 1000, rMilliOhm: 15, fitR2: 0.2 }
        ], { minFitR2: 0.5 })

        expect(series.points).toHaveLength(0)
    })

    it('returns low-confidence estimated metrics when data is insufficient', () => {
        const metrics = computeBatteryWindowMetrics([{ timestamp: 0, voltage: 24, current: 10 }])
        expect(metrics.health.dodPct.confidence).toBe('low')
        expect(metrics.health.soh.confidence).toBe('low')
        expect(metrics.health.peukert.descriptor.reason).toBe('insufficient_discharge_window')
    })

    it('uses RC-aware OCV proxy metadata in battery health voltage zone', () => {
        const samples = Array.from({ length: 8 }, (_, idx) => {
            const current = 6 + idx
            return {
                timestamp: idx * 1000,
                current,
                voltage: 24 - (0.02 * current),
                voltageLower: 12 - (0.01 * current),
                voltageHigh: 12 - (0.009 * current)
            }
        })
        samples.push({
            timestamp: 8000,
            current: 30,
            voltage: 23.4,
            voltageLower: 12,
            voltageHigh: 12
        })

        const metrics = computeBatteryWindowMetrics(samples, {
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(metrics.health.voltageZone.estimatedVoc).not.toBe(null)
        expect(metrics.health.voltageZone.descriptor.assumptions.some((entry) => entry.includes('Vp(t)'))).toBe(true)
    })

    it('uses actual capacity when passed via options for DoD basis and ideal capacity display', () => {
        const samples = Array.from({ length: 1000 }, (_, idx) => ({
            timestamp: idx * 1000,
            current: 30,
            voltage: 24,
            voltageLower: 12,
            voltageHigh: 12,
            voltageDiff: 0.02
        }))

        const metrics = computeBatteryWindowMetrics(samples, {
            maxDtMs: 10000,
            nominalCapacityAh: 36,
            actualCapacityAh: 30,
            minSampleCount: 8,
            minCurrentSpread: 5
        })

        expect(metrics.health.dodBasis).toBe('peukert_capacity')
        const expectedDod = (metrics.health.peukert.windowDischargeAh / metrics.health.peukert.expectedCapacityAh) * 100
        expect(metrics.health.dodPct.value).toBeCloseTo(expectedDod, 1)
        expect(metrics.health.peukert.estimatedActualCapacityAh).toBe(30)
        expect(metrics.health.soh.value).toBe(null)
        expect(metrics.health.soh.reason).toBeTruthy()
        expect(metrics.health.normalizedC20DischargeAh).toBeGreaterThan(0)
    })

    describe('Delta Ah / Delta SoC SoH helpers', () => {
        const resistanceBranch = {
            valid: true,
            confidence: 'high',
            rMilliOhm: 20,
            rolling: []
        }

        it('interpolates and clamps Yuasa C/20 SoC lookup values', () => {
            expect(lookupYuasaC20SocFromVoltage(12.73, 12)).toBe(1)
            expect(lookupYuasaC20SocFromVoltage(10.4, 12)).toBe(0)
            expect(lookupYuasaC20SocFromVoltage(25.0, 24)).toBeCloseTo(0.8, 5)
            expect(lookupYuasaC20SocFromVoltage(12.435, 12)).toBeCloseTo(0.75, 5)
        })

        it('calculates emulated V_C/20 from terminal voltage, current, and IR', () => {
            const vC20 = estimateC20TerminalVoltage(24.636, 20, {
                rMilliOhm: 20,
                polarizationV: 0,
                nominalCapacityAh: 36
            })
            expect(vC20).toBeCloseTo(25.0, 2)
            expect(estimateC20TerminalVoltage(24, 20, {
                rMilliOhm: 20,
                nominalCapacityAh: 36,
                resistanceValid: false
            })).toBe(null)
        })

        it('integrates Peukert-normalized net Ah with regen efficiency', () => {
            const samples = [
                { timestamp: 0, current: 18 },
                { timestamp: 3600000, current: -10 },
                { timestamp: 7200000, current: 0 }
            ]
            const integrated = integratePeukertNormalizedNetAh(samples, {
                maxDtMs: 4000000,
                nominalCapacityAh: 36,
                peukertExponent: 1.16,
                chargeEfficiency: 0.95
            })
            const expectedDischarge = 18 * ((18 / 1.8) ** 0.16)
            expect(integrated.normalizedDischargeAh).toBeCloseTo(expectedDischarge, 5)
            expect(integrated.normalizedChargeAh).toBeCloseTo(9.5, 5)
            expect(integrated.normalizedNetAh).toBeCloseTo(expectedDischarge - 9.5, 5)
        })

        it('computes SoH when active window delta SoC is at least 25%', () => {
            const samples = Array.from({ length: 201 }, (_, idx) => {
                const current = 20
                const desiredVC20 = 25.0 - ((25.0 - 22.8) * (idx / 200))
                return {
                    timestamp: idx * 1000,
                    current,
                    voltage: desiredVC20 - ((current - 1.8) * 0.02)
                }
            })
            const soh = computeDeltaAhSocWindowSoh(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                nominalSeriesVoltage: 24,
                idealCapacityAh: 36,
                resistanceBranch,
                voltageKey: 'voltage'
            })
            expect(soh.sohReason).toBe(null)
            expect(soh.sohPctValue).toBeGreaterThan(0)
            expect(soh.deltaSoc).toBeGreaterThanOrEqual(0.25)
            expect(soh.estimatedActualCapacityAh).toBeCloseTo(soh.normalizedWindowAh / soh.deltaSoc, 1)
            expect(soh.sohPctValue).toBeCloseTo((soh.estimatedActualCapacityAh / 36) * 100, 1)
        })

        it('does not cap Delta Ah / Delta SoC SoH above 100%', () => {
            const samples = Array.from({ length: 901 }, (_, idx) => {
                const current = 80
                const desiredVC20 = 25.0 - ((25.0 - 22.8) * (idx / 900))
                return {
                    timestamp: idx * 1000,
                    current,
                    voltage: desiredVC20 - ((current - 1.8) * 0.02)
                }
            })
            const soh = computeDeltaAhSocWindowSoh(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                nominalSeriesVoltage: 24,
                idealCapacityAh: 36,
                resistanceBranch,
                voltageKey: 'voltage'
            })
            expect(soh.sohReason).toBe(null)
            expect(soh.sohPctValue).toBeGreaterThan(100)
            expect(soh.sohPctValue).toBeCloseTo((soh.estimatedActualCapacityAh / 36) * 100, 1)
        })

        it('blocks SoH when active window delta SoC is below 25%', () => {
            const samples = Array.from({ length: 20 }, (_, idx) => {
                const current = 10
                const desiredVC20 = 25.0 - (0.2 * (idx / 19))
                return {
                    timestamp: idx * 1000,
                    current,
                    voltage: desiredVC20 - ((current - 1.8) * 0.02)
                }
            })
            const soh = computeDeltaAhSocWindowSoh(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                nominalSeriesVoltage: 24,
                idealCapacityAh: 36,
                resistanceBranch,
                voltageKey: 'voltage'
            })
            expect(soh.sohPctValue).toBe(null)
            expect(soh.sohReason).toBe('insufficient_delta_soc')
        })

        it('exposes independent pack and per-battery delta-SoC SoH fields', () => {
            const samples = Array.from({ length: 40 }, (_, idx) => {
                const current = 8 + (idx % 8)
                const ratio = idx / 39
                const lowerVC20 = 12.50 - (1.25 * ratio)
                const upperVC20 = 12.62 - (1.00 * ratio)
                const rOhm = 0.02
                return {
                    timestamp: idx * 1000,
                    current,
                    voltageLower: lowerVC20 - ((current - 1.8) * rOhm),
                    voltageHigh: upperVC20 - ((current - 1.8) * rOhm),
                    voltage: (lowerVC20 + upperVC20) - ((current - 1.8) * (rOhm * 2)),
                    voltageDiff: (upperVC20 - lowerVC20)
                }
            })
            const metrics = computeBatteryWindowMetrics(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                actualCapacityAh: 36,
                minSampleCount: 8,
                minCurrentSpread: 5,
                rollingWindowSize: 8,
                rollingStep: 4
            })
            expect(metrics.health.sohMethod).toBe('delta_ah_delta_soc_vc20_window')
            expect(Number.isFinite(metrics.health.deltaSoc)).toBe(true)
            expect(Number.isFinite(metrics.batteryHealth.lower.deltaSoc)).toBe(true)
            expect(Number.isFinite(metrics.batteryHealth.upper.deltaSoc)).toBe(true)
            expect(metrics.batteryHealth.lower.deltaSoc).not.toBe(metrics.batteryHealth.upper.deltaSoc)
            expect(metrics.chartSeries.combined.vocTrend.some((point) => Number.isFinite(point.vC20))).toBe(true)
        })
    })

    describe('computeDischargeCyclePeukertMetrics', () => {
        it('normalizes discharge Ah with (I_avg/I_C20)^(k-1)', () => {
            const samples = Array.from({ length: 11 }, (_, idx) => ({
                timestamp: idx * 1000,
                current: 3.6
            }))
            const cycle = computeDischargeCyclePeukertMetrics(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                peukertExponent: 1.255,
                idealCapacityAh: 36
            })
            const iC20 = 36 / 20
            const ahDis = cycle.cycleDischargeAh
            const iAvg = cycle.cycleAvgCurrentA
            const expectedNorm = ahDis * ((iAvg / iC20) ** 0.255)
            expect(cycle.normalizedC20DischargeAh).toBeCloseTo(expectedNorm, 6)
        })

        it('reports SoH as Ah_norm / C_ideal without capping at 100%', () => {
            const samples = Array.from({ length: 900 }, (_, idx) => ({
                timestamp: idx * 1000,
                current: 40
            }))
            const cycle = computeDischargeCyclePeukertMetrics(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                peukertExponent: 1.255,
                idealCapacityAh: 36
            })
            expect(cycle.normalizedC20DodPct).toBeCloseTo(
                (cycle.normalizedC20DischargeAh / 36) * 100,
                4
            )
            expect(cycle.sohPctValue).toBe(cycle.normalizedC20DodPct)
        })

        it('increases normalized Ah when average discharge current exceeds C/20', () => {
            const lowRate = computeDischargeCyclePeukertMetrics(
                Array.from({ length: 101 }, (_, idx) => ({ timestamp: idx * 1000, current: 1.8 })),
                { nominalCapacityAh: 36, peukertExponent: 1.255, idealCapacityAh: 36, maxDtMs: 10000 }
            )
            const highRate = computeDischargeCyclePeukertMetrics(
                Array.from({ length: 101 }, (_, idx) => ({ timestamp: idx * 1000, current: 18 })),
                { nominalCapacityAh: 36, peukertExponent: 1.255, idealCapacityAh: 36, maxDtMs: 10000 }
            )
            expect(highRate.normalizedC20DischargeAh).toBeGreaterThan(highRate.cycleDischargeAh)
            expect(highRate.normalizedC20DischargeAh).toBeGreaterThan(lowRate.normalizedC20DischargeAh)
        })

        it('returns null SoH when no discharge segment exists', () => {
            const samples = [
                { timestamp: 0, current: 0 },
                { timestamp: 1000, current: -5 }
            ]
            const cycle = computeDischargeCyclePeukertMetrics(samples, { idealCapacityAh: 36 })
            expect(cycle.sohPctValue).toBe(null)
            expect(cycle.sohReason).toBe('no_discharge_cycle')
        })

        it('blocks SoH when cycle depth is below minimum ratio', () => {
            const samples = Array.from({ length: 20 }, (_, idx) => ({
                timestamp: idx * 1000,
                current: 5
            }))
            const cycle = computeDischargeCyclePeukertMetrics(samples, {
                idealCapacityAh: 36,
                minDepthRatio: 0.25,
                maxDtMs: 10000
            })
            expect(cycle.sohPctValue).toBe(null)
            expect(cycle.sohReason).toBe('insufficient_cycle_depth')
        })

        it('exposes normalized DoD fields on window health when cycle is deep enough', () => {
            const samples = Array.from({ length: 500 }, (_, idx) => ({
                timestamp: idx * 1000,
                current: 50,
                voltage: 24,
                voltageLower: 12,
                voltageHigh: 12
            }))
            const metrics = computeBatteryWindowMetrics(samples, {
                nominalCapacityAh: 36,
                actualCapacityAh: 36,
                minSampleCount: 8,
                minCurrentSpread: 5
            })
            expect(metrics.health.normalizedC20DischargeAh).toBeGreaterThan(0)
            expect(metrics.health.normalizedC20DodPct).toBeCloseTo(
                (metrics.health.normalizedC20DischargeAh / 36) * 100,
                1
            )
            expect(metrics.batteryHealth.lower.normalizedC20DischargeAh).toBe(metrics.health.normalizedC20DischargeAh)
        })

        it('uses full-window Peukert integration for DoD normalized C/20, not only the primary segment', () => {
            const samples = [
                ...Array.from({ length: 101 }, (_, idx) => ({
                    timestamp: idx * 1000,
                    current: 50,
                    voltage: 24,
                    voltageLower: 12,
                    voltageHigh: 12
                })),
                { timestamp: 101000, current: 0, voltage: 24, voltageLower: 12, voltageHigh: 12 },
                ...Array.from({ length: 51 }, (_, idx) => ({
                    timestamp: 102000 + idx * 1000,
                    current: 40,
                    voltage: 24,
                    voltageLower: 12,
                    voltageHigh: 12
                }))
            ]
            const windowPeukert = integratePeukertNormalizedNetAh(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                peukertExponent: 1.16
            })
            const primaryCycle = computeDischargeCyclePeukertMetrics(samples, {
                maxDtMs: 10000,
                nominalCapacityAh: 36,
                peukertExponent: 1.16,
                idealCapacityAh: 36
            })
            const metrics = computeBatteryWindowMetrics(samples, {
                nominalCapacityAh: 36,
                actualCapacityAh: 36,
                minSampleCount: 8,
                minCurrentSpread: 5
            })

            expect(windowPeukert.normalizedDischargeAh).toBeGreaterThan(primaryCycle.normalizedC20DischargeAh)
            expect(metrics.health.normalizedC20DischargeAh).toBeCloseTo(windowPeukert.normalizedDischargeAh, 2)
            expect(metrics.health.dischargeCycleNormalizedC20DischargeAh).toBeCloseTo(primaryCycle.normalizedC20DischargeAh, 6)
        })
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
            { timestamp: 1000, temp1: 36, temp2: 37, voltageDiff: -0.14 }
        ]

        const kpis = computeSessionStintKpis(laps, samples, { lastNLaps: 3 })

        expect(kpis.totalLaps).toBe(4)
        expect(kpis.bestLapTimeSec).toBe(73)
        expect(kpis.medianLapTimeSec).toBe(74.5)
        expect(kpis.totalAh).toBeCloseTo(2.02, 5)
        expect(kpis.averageEfficiency).toBeCloseTo(6.25, 3)
        expect(kpis.maxTemp).toBe(37)
        expect(kpis.maxImbalance).toBe(-0.14)
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
            { timestamp: 1000, voltage: 24, current: 12, speed: 36, temp1: 31, temp2: 33, voltageDiff: -0.12 },
            { timestamp: 2000, voltage: 24, current: 8, speed: 18, temp1: 32, temp2: 34, voltageDiff: -0.13 }
        ]

        const summary = computeEnergyThermalSummary(samples, { speedUnit: 'kph' })
        expect(summary.totalWh).toBeGreaterThan(0)
        expect(summary.avgPowerW).toBeGreaterThan(0)
        expect(summary.peakPowerW).toBe(288)
        expect(summary.distanceMiles).toBeGreaterThan(0)
        expect(summary.whPerMile).toBeGreaterThan(0)
        expect(summary.maxTemp).toBe(32)
        expect(summary.maxVoltageDiff).toBe(-0.12)
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

