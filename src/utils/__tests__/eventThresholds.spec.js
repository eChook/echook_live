import { describe, it, expect } from 'vitest'
import {
    CARD_THRESHOLD_KEYS,
    evaluateChannelThresholds,
    getCriticalTransitions,
    resolveThresholdSeverity
} from '../eventThresholds'

describe('eventThresholds', () => {
    it('exposes data-card to channel mapping', () => {
        expect(CARD_THRESHOLD_KEYS.voltage).toBe('voltage')
        expect(CARD_THRESHOLD_KEYS.current).toBe('current')
        expect(CARD_THRESHOLD_KEYS.temp1).toBe('temp1')
        expect(CARD_THRESHOLD_KEYS.temp2).toBe('temp2')
    })

    it('resolves threshold severity for upper and lower bound channels', () => {
        expect(resolveThresholdSeverity(13.8, 18, 14, false)).toBe('critical')
        expect(resolveThresholdSeverity(17, 18, 14, false)).toBe('warning')
        expect(resolveThresholdSeverity(25, 18, 14, false)).toBe('info')
        expect(resolveThresholdSeverity(130, 40, 120, true)).toBe('critical')
    })

    it('evaluates live packet severities with absolute current', () => {
        const thresholds = evaluateChannelThresholds(
            {
                voltage: 17.2,
                current: -125,
                temp1: 56,
                temp2: 51
            },
            {
                eventUndervoltageWarningV: 18,
                eventUndervoltageCriticalV: 14,
                eventOverTempWarningC: 55,
                eventOverTempCriticalC: 65,
                eventCurrentSpikeWarningA: 40,
                eventCurrentSpikeCriticalA: 120
            }
        )

        expect(thresholds.voltage.severity).toBe('warning')
        expect(thresholds.current.severity).toBe('critical')
        expect(thresholds.current.value).toBe(125)
        expect(thresholds.temp1.severity).toBe('warning')
        expect(thresholds.temp2.severity).toBe('info')
        expect(thresholds.temperatureMax.severity).toBe('warning')
    })

    it('detects new critical transitions without repeating existing critical state', () => {
        const previousState = {
            voltage: { severity: 'warning', title: 'Undervoltage', value: 17, criticalThreshold: 14, unit: 'V' },
            current: { severity: 'critical', title: 'High Current', value: 130, criticalThreshold: 120, unit: 'A' }
        }
        const nextState = {
            voltage: { severity: 'critical', title: 'Undervoltage', value: 13.5, criticalThreshold: 14, unit: 'V' },
            current: { severity: 'critical', title: 'High Current', value: 135, criticalThreshold: 120, unit: 'A' },
            temp1: { severity: 'warning', title: 'Over Temperature', value: 57, criticalThreshold: 65, unit: 'C' }
        }

        const transitions = getCriticalTransitions(previousState, nextState)
        expect(transitions).toHaveLength(1)
        expect(transitions[0].channel).toBe('voltage')
        expect(transitions[0].title).toBe('Undervoltage')
    })
})
