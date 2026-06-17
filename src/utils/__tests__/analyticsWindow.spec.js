import { describe, it, expect } from 'vitest'
import {
    snapToNearestSampleTimestamp,
    filterSamplesByWindow,
    clampWindowBounds,
    lapOverlapsWindow,
    buildVoltageChartSeries,
    resolveLapHistoryBounds,
    applyDraggedMarker,
    ANALYTICS_VOLTAGE_CHART_MAX_POINTS
} from '../analyticsWindow'

describe('snapToNearestSampleTimestamp', () => {
    const samples = [
        { timestamp: 1000 },
        { timestamp: 2000 },
        { timestamp: 5000 }
    ]

    it('returns null for empty samples', () => {
        expect(snapToNearestSampleTimestamp(1500, [])).toBeNull()
    })

    it('snaps to nearest sample timestamp', () => {
        expect(snapToNearestSampleTimestamp(1900, samples)).toBe(2000)
        expect(snapToNearestSampleTimestamp(3500, samples)).toBe(2000)
        expect(snapToNearestSampleTimestamp(4500, samples)).toBe(5000)
    })
})

describe('filterSamplesByWindow', () => {
    const samples = [
        { timestamp: 1000 },
        { timestamp: 2000 },
        { timestamp: 3000 }
    ]

    it('filters inclusive window', () => {
        expect(filterSamplesByWindow(samples, 1500, 2500)).toEqual([
            { timestamp: 2000 }
        ])
    })

    it('returns empty for invalid window', () => {
        expect(filterSamplesByWindow(samples, 3000, 1000)).toEqual([])
    })
})

describe('clampWindowBounds', () => {
    it('clamps to oldest and latest', () => {
        expect(clampWindowBounds(500, 9000, 1000, 8000)).toEqual({
            startMs: 1000,
            endMs: 8000
        })
    })

    it('returns null when clamped range is empty', () => {
        expect(clampWindowBounds(100, 200, 5000, 6000)).toBeNull()
    })
})

describe('lapOverlapsWindow', () => {
    it('detects overlap', () => {
        expect(lapOverlapsWindow({ startTime: 1000, finishTime: 3000 }, 2000, 5000)).toBe(true)
        expect(lapOverlapsWindow({ startTime: 1000, finishTime: 1500 }, 2000, 5000)).toBe(false)
    })
})

describe('buildVoltageChartSeries', () => {
    it('decimates large buffers', () => {
        const samples = Array.from({ length: 1200 }, (_, idx) => ({
            timestamp: idx * 1000,
            voltage: 24
        }))
        const series = buildVoltageChartSeries(samples, 100)
        expect(series.length).toBeLessThanOrEqual(101)
        expect(series[0][0]).toBe(0)
        expect(series[series.length - 1][0]).toBe(1199000)
    })

    it('skips invalid voltage points', () => {
        const series = buildVoltageChartSeries([
            { timestamp: 1000, voltage: 24 },
            { timestamp: 2000, voltage: null }
        ])
        expect(series).toEqual([[1000, 24]])
    })
})

describe('resolveLapHistoryBounds', () => {
    it('uses next newer session start as end for older races', () => {
        const races = [
            { startTimeMs: 5000 },
            { startTimeMs: 2000 }
        ]
        expect(resolveLapHistoryBounds(races, '2000', 9000)).toEqual({
            startMs: 2000,
            endMs: 5000
        })
    })

    it('uses latest when newest race selected', () => {
        const races = [{ startTimeMs: 3000 }]
        expect(resolveLapHistoryBounds(races, '3000', 8000)).toEqual({
            startMs: 3000,
            endMs: 8000
        })
    })
})

describe('applyDraggedMarker', () => {
    const samples = [
        { timestamp: 1000 },
        { timestamp: 2000 },
        { timestamp: 3000 },
        { timestamp: 4000 }
    ]

    it('updates start only in live mode', () => {
        expect(applyDraggedMarker('start', 2500, 1000, 4000, samples, false)).toEqual({
            startMs: 2500,
            endMs: 4000
        })
    })

    it('keeps start before end when dragging start past end', () => {
        const next = applyDraggedMarker('start', 3500, 1000, 2000, samples, true)
        expect(next.startMs).toBe(3500)
        expect(next.endMs).toBeGreaterThan(next.startMs)
    })

    it('pulls start back when dragged to the last sample with end at the tail', () => {
        const next = applyDraggedMarker('start', 4000, 1000, 4000, samples, true)
        expect(next.startMs).toBe(3000)
        expect(next.endMs).toBe(4000)
        expect(next.startMs).toBeLessThan(next.endMs)
    })

    it('keeps end after start when dragging end before start', () => {
        const next = applyDraggedMarker('end', 1500, 3000, 4000, samples, true)
        expect(next.endMs).toBe(1500)
        expect(next.startMs).toBeLessThan(next.endMs)
    })

    it('advances end when dragged to the first sample with start at the head', () => {
        const next = applyDraggedMarker('end', 1000, 1000, 4000, samples, true)
        expect(next.startMs).toBe(1000)
        expect(next.endMs).toBe(2000)
        expect(next.startMs).toBeLessThan(next.endMs)
    })
})

describe('ANALYTICS_VOLTAGE_CHART_MAX_POINTS', () => {
    it('matches chart decimation default', () => {
        expect(ANALYTICS_VOLTAGE_CHART_MAX_POINTS).toBe(500)
    })
})
