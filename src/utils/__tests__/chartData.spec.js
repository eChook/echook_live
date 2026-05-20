import { describe, it, expect } from 'vitest'
import { insertGapBreaks, MAX_LINE_GAP_MS } from '../chartData'

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
        expect(result[1]).toEqual({ timestamp: 37000, speed: null })
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
        expect(result[2]).toEqual({ timestamp: 60000, speed: null })
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

    it('does not break when next metric value is not finite', () => {
        const points = [
            { timestamp: 0, speed: 10 },
            { timestamp: 50000, speed: null }
        ]
        expect(insertGapBreaks(points, 'speed')).toEqual(points)
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
})
