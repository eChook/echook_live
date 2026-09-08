/**
 * @file utils/__tests__/rateOfChangeWarnings.spec.js
 * @brief Tests for rate-of-change warning selection.
 */

import { describe, it, expect } from 'vitest'
import {
    computeLeastSquaresSlopePerMinute,
    selectTopRateOfChangeWarning
} from '../rateOfChangeWarnings'

describe('rateOfChangeWarnings', () => {
    it('computes positive slope for rising temperature series', () => {
        const now = 1_000_000
        const points = Array.from({ length: 10 }, (_, index) => ({
            timestamp: now - (9 - index) * 20_000,
            value: 60 + index * 0.5
        }))
        const slope = computeLeastSquaresSlopePerMinute(points)
        expect(slope).toBeGreaterThan(0)
    })

    it('returns a warning once a channel is already past its threshold', () => {
        const end = Date.now()
        const samples = Array.from({ length: 20 }, (_, index) => ({
            timestamp: end - (19 - index) * 10_000,
            temp1: 65 + index * 0.4,
            voltage: 24
        }))
        const warning = selectTopRateOfChangeWarning(samples, {
            eventOverTempWarningC: 70,
            eventOverTempCriticalC: 85
        }, end)
        expect(warning).not.toBeNull()
        expect(warning.channelLabel).toBeTruthy()
    })

    it('returns null when no channel has crossed its threshold yet', () => {
        const end = Date.now()
        const samples = Array.from({ length: 20 }, (_, index) => ({
            timestamp: end - (19 - index) * 10_000,
            temp1: 40 + index * 0.4,
            voltage: 24
        }))
        const warning = selectTopRateOfChangeWarning(samples, {
            eventOverTempWarningC: 70,
            eventOverTempCriticalC: 85
        }, end)
        expect(warning).toBeNull()
    })

    it('does not include a time estimate in the message', () => {
        const end = Date.now()
        const samples = Array.from({ length: 20 }, (_, index) => ({
            timestamp: end - (19 - index) * 10_000,
            temp1: 65 + index * 0.4,
            voltage: 24
        }))
        const warning = selectTopRateOfChangeWarning(samples, {
            eventOverTempWarningC: 70,
            eventOverTempCriticalC: 85
        }, end)
        expect(warning.message).not.toMatch(/min away|over the last|minutes?/i)
    })

    it('ranks multiple over-threshold channels by distance past their threshold', () => {
        const end = Date.now()
        const samples = Array.from({ length: 20 }, (_, index) => ({
            timestamp: end - (19 - index) * 10_000,
            temp1: 71,
            voltage: 10
        }))
        const warning = selectTopRateOfChangeWarning(samples, {
            eventOverTempWarningC: 70,
            eventOverTempCriticalC: 85,
            eventUndervoltageWarningV: 18,
            eventUndervoltageCriticalV: 14
        }, end)
        expect(warning.channelKey).toBe('voltage')
    })

    it('never raises a current rate-of-change warning', () => {
        const end = Date.now()
        const samples = Array.from({ length: 20 }, (_, index) => ({
            timestamp: end - (19 - index) * 10_000,
            current: 5 + index * 2,
            voltage: 24
        }))
        const warning = selectTopRateOfChangeWarning(samples, {
            eventCurrentSpikeWarningA: 30
        }, end)
        expect(warning).toBeNull()
    })
})
