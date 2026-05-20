import { describe, it, expect } from 'vitest'
import {
    computeThrottleHistogram,
    computeThrottleBrakeOverlap,
    detectRaceStart,
    computeStartMetrics,
    computeSupplyResistance
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
})

