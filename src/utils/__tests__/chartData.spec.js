import { describe, it, expect } from 'vitest'
import { insertGapBreaks, toLineSeriesData, splitLineSeriesAtGaps, timestampToMs, MAX_LINE_GAP_MS } from '../chartData'

describe('insertGapBreaks', () => {
    it('returns empty array for empty or non-array input', () => {
        expect(insertGapBreaks([], 'speed')).toEqual([])
        expect(insertGapBreaks(null, 'speed')).toEqual([])
        expect(insertGapBreaks(undefined, 'speed')).toEqual([])
    })

    it('does not insert a break when gap is within threshold', () => {
        const points = [
            { timestamp: 1000, speed: 10 },
            { timestamp: 11000, speed: 20 }
        ]
        expect(insertGapBreaks(points, 'speed')).toEqual(points)
        expect(insertGapBreaks(points, 'speed')).toHaveLength(2)
    })

    it('inserts a null break row when gap exceeds threshold', () => {
        const points = [
            { timestamp: 1000, speed: 10 },
            { timestamp: 37000, speed: 20 }
        ]
        const result = insertGapBreaks(points, 'speed')
        expect(result).toHaveLength(3)
        expect(result[0]).toEqual({ timestamp: 1000, speed: 10 })
        expect(result[1].timestamp).toBe(37000)
        expect(Number.isNaN(result[1].speed)).toBe(true)
        expect(result[2]).toEqual({ timestamp: 37000, speed: 20 })
    })

    it('inserts one break for a single large gap among three points', () => {
        const points = [
            { timestamp: 0, speed: 1 },
            { timestamp: 10000, speed: 2 },
            { timestamp: 60000, speed: 3 }
        ]
        const result = insertGapBreaks(points, 'speed')
        expect(result).toHaveLength(4)
        expect(result[2].timestamp).toBe(60000)
        expect(Number.isNaN(result[2].speed)).toBe(true)
        expect(result[3]).toEqual({ timestamp: 60000, speed: 3 })
    })

    it('preserves original point objects and values', () => {
        const a = { timestamp: 0, speed: 5, voltage: 48 }
        const b = { timestamp: 50000, speed: 6, voltage: 47 }
        const result = insertGapBreaks([a, b], 'speed')
        expect(result[0]).toBe(a)
        expect(result[2]).toBe(b)
        expect(a.speed).toBe(5)
        expect(b.speed).toBe(6)
    })

    it('breaks on time gap even when next metric value is missing', () => {
        const points = [
            { timestamp: 0, speed: 10 },
            { timestamp: 50000 }
        ]
        expect(insertGapBreaks(points, 'speed')).toHaveLength(3)
        expect(Number.isNaN(insertGapBreaks(points, 'speed')[1].speed)).toBe(true)
    })

    it('uses MAX_LINE_GAP_MS as default threshold', () => {
        expect(MAX_LINE_GAP_MS).toBe(30000)
        const atThreshold = [
            { timestamp: 0, speed: 1 },
            { timestamp: 30000, speed: 2 }
        ]
        expect(insertGapBreaks(atThreshold, 'speed')).toHaveLength(2)

        const overThreshold = [
            { timestamp: 0, speed: 1 },
            { timestamp: 30001, speed: 2 }
        ]
        expect(insertGapBreaks(overThreshold, 'speed')).toHaveLength(3)
    })

    it('breaks gaps when historic timestamps are Unix seconds', () => {
        const points = [
            { timestamp: 1700000000, speed: 10 },
            { timestamp: 1700000045, speed: 20 }
        ]
        expect(insertGapBreaks(points, 'speed')).toHaveLength(3)
    })

    it('maps line series tuples with NaN at gap breaks', () => {
        const points = [
            { timestamp: 1000, speed: 10 },
            { timestamp: 37000, speed: 20 }
        ]
        const tuples = toLineSeriesData(points, 'speed')
        expect(tuples).toEqual([
            [1000, 10],
            [37000, NaN],
            [37000, 20]
        ])
    })
})

describe('splitLineSeriesAtGaps', () => {
    it('returns one segment when all gaps are within threshold', () => {
        const points = [
            { timestamp: 1000, speed: 10 },
            { timestamp: 11000, speed: 20 }
        ]
        expect(splitLineSeriesAtGaps(points, 'speed')).toEqual([
            [[1000, 10], [11000, 20]]
        ])
    })

    it('returns separate segments at each timestamp gap', () => {
        const points = [
            { timestamp: 0, speed: 1 },
            { timestamp: 10000, speed: 2 },
            { timestamp: 60000, speed: 3 }
        ]
        expect(splitLineSeriesAtGaps(points, 'speed')).toEqual([
            [[0, 1], [10000, 2]],
            [[60000, 3]]
        ])
    })

    it('splits Unix-second timestamps and uses ms on the x axis', () => {
        const points = [
            { timestamp: 1700000000, speed: 10 },
            { timestamp: 1700000045, speed: 20 }
        ]
        expect(splitLineSeriesAtGaps(points, 'speed')).toEqual([
            [[1700000000000, 10]],
            [[1700000045000, 20]]
        ])
    })

    it('skips points without a finite metric but still breaks on time gaps', () => {
        const points = [
            { timestamp: 0, speed: 1 },
            { timestamp: 50000, voltage: 99 },
            { timestamp: 100000, speed: 2 }
        ]
        expect(splitLineSeriesAtGaps(points, 'speed')).toEqual([
            [[0, 1]],
            [[100000, 2]]
        ])
    })
})

describe('timestampToMs', () => {
    it('treats Unix seconds in [1e9, 1e12) as seconds', () => {
        expect(timestampToMs(1700000000)).toBe(1700000000000)
    })

    it('does not scale small relative millisecond offsets', () => {
        expect(timestampToMs(11000)).toBe(11000)
    })

    it('leaves millisecond timestamps unchanged', () => {
        expect(timestampToMs(1700000000000)).toBe(1700000000000)
    })
})
