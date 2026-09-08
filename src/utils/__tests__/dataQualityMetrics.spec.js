/**
 * @file utils/__tests__/dataQualityMetrics.spec.js
 * @brief Tests for Status data quality helpers.
 */

import { describe, it, expect } from 'vitest'
import {
    computeGapMetrics,
    computePacketRateMetrics,
    computeChannelReporting,
    formatWindowMeta
} from '../dataQualityMetrics'

describe('dataQualityMetrics', () => {
    const samples = [
        { timestamp: 1000, speed: 10, voltage: 24 },
        { timestamp: 1200, speed: 11, voltage: 24.1 },
        { timestamp: 50000, speed: 12, voltage: 23.9 },
        { timestamp: 50200, speed: 13, voltage: 23.8 }
    ]

    it('counts gaps above threshold', () => {
        const gaps = computeGapMetrics(samples, 1000)
        expect(gaps.gapCount).toBe(1)
        expect(gaps.maxGapSec).toBeGreaterThan(40)
    })

    it('computes packet rate from window span', () => {
        const packets = computePacketRateMetrics(samples)
        expect(packets.sampleCount).toBe(4)
        expect(packets.packetRatePerSec).toBeGreaterThan(0)
    })

    it('reports channel availability in window', () => {
        const channels = computeChannelReporting(samples, ['speed', 'voltage', 'missing'])
        expect(channels.reporting).toBe(2)
        expect(channels.total).toBe(3)
    })

    it('formats window meta string', () => {
        const meta = formatWindowMeta(samples)
        expect(meta).toContain('samples')
        expect(meta).toContain('→')
    })
})
