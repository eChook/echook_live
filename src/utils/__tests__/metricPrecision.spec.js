import { describe, it, expect } from 'vitest'
import {
    METRIC_PRECISION,
    roundMetric,
    roundResistanceMilliOhm,
    roundToDecimals
} from '../metricPrecision'

describe('metricPrecision', () => {
    it('rounds resistance to nearest integer milliohm', () => {
        expect(roundResistanceMilliOhm(20.4)).toBe(20)
        expect(roundResistanceMilliOhm(20.6)).toBe(21)
    })

    it('roundMetric applies policy decimals by key', () => {
        expect(roundMetric(24.567, 'voltage')).toBe(24.57)
        expect(roundMetric(123.456, 'powerW')).toBe(123.46)
        expect(roundMetric(123.456, 'energyWh')).toBe(123.46)
    })

    it('roundToDecimals handles floating-point noise', () => {
        expect(roundToDecimals(12.400000000001, 2)).toBe(12.4)
    })

    it('exports expected precision keys', () => {
        expect(METRIC_PRECISION.resistanceMilliOhm).toBe(0)
        expect(METRIC_PRECISION.powerW).toBe(2)
        expect(METRIC_PRECISION.energyWh).toBe(2)
        expect(METRIC_PRECISION.powerUsedWh).toBe(2)
        expect(METRIC_PRECISION.peukertAh).toBe(2)
        expect(METRIC_PRECISION.estimatedPercent).toBe(1)
    })

    it('rounds estimated capacity metrics to 0.01 Ah and 0.1%', () => {
        expect(roundMetric(12.347, 'peukertAh')).toBe(12.35)
        expect(roundMetric(87.456, 'estimatedPercent')).toBe(87.5)
    })
})
