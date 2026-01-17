import { describe, it, expect } from 'vitest'
import { convertSpeed, convertTemp, scalePacket } from '../unitConversions'

describe('convertSpeed', () => {
    it('converts m/s to mph correctly', () => {
        expect(convertSpeed(10, 'mph')).toBeCloseTo(22.37, 1)
    })

    it('converts m/s to kph correctly', () => {
        expect(convertSpeed(10, 'kph')).toBe(36)
    })

    it('returns m/s unchanged when unit is ms', () => {
        expect(convertSpeed(10, 'ms')).toBe(10)
    })

    it('handles null/undefined gracefully', () => {
        expect(convertSpeed(null, 'mph')).toBeNull()
        expect(convertSpeed(undefined, 'mph')).toBeUndefined()
    })

    it('uses mph as default unit', () => {
        expect(convertSpeed(10)).toBeCloseTo(22.37, 1)
    })
})

describe('convertTemp', () => {
    it('converts Celsius to Fahrenheit correctly', () => {
        expect(convertTemp(0, 'f')).toBe(32)
        expect(convertTemp(100, 'f')).toBe(212)
        expect(convertTemp(25, 'f')).toBe(77)
    })

    it('returns Celsius unchanged when unit is c', () => {
        expect(convertTemp(25, 'c')).toBe(25)
    })

    it('handles null/undefined gracefully', () => {
        expect(convertTemp(null, 'f')).toBeNull()
        expect(convertTemp(undefined, 'f')).toBeUndefined()
    })

    it('uses Celsius as default', () => {
        expect(convertTemp(25)).toBe(25)
    })
})

describe('scalePacket', () => {
    const basePacket = {
        timestamp: 1234567890,
        voltage: 24.5,
        voltageLower: 12.1,
        current: 15.2,
        speed: 10, // m/s
        temp1: 25,
        temp2: 30,
        rpm: 3500
    }

    it('calculates voltageHigh correctly', () => {
        const result = scalePacket(basePacket)
        expect(result.voltageHigh).toBeCloseTo(12.4, 1) // 24.5 - 12.1
    })

    it('calculates voltageDiff correctly', () => {
        const result = scalePacket(basePacket)
        expect(result.voltageDiff).toBeCloseTo(0.3, 1) // 12.4 - 12.1
    })

    it('calculates tempDiff correctly', () => {
        const result = scalePacket(basePacket)
        expect(result.tempDiff).toBe(5) // |25 - 30|
    })

    it('converts speed to mph by default', () => {
        const result = scalePacket(basePacket)
        expect(result.speed).toBeCloseTo(22.37, 1)
    })

    it('converts speed to kph when specified', () => {
        const result = scalePacket(basePacket, { speedUnit: 'kph', tempUnit: 'c' })
        expect(result.speed).toBe(36)
    })

    it('converts temps to Fahrenheit when specified', () => {
        const result = scalePacket(basePacket, { speedUnit: 'mph', tempUnit: 'f' })
        expect(result.temp1).toBe(77) // 25C -> 77F
        expect(result.temp2).toBe(86) // 30C -> 86F
    })

    it('preserves other fields unchanged', () => {
        const result = scalePacket(basePacket)
        expect(result.voltage).toBe(24.5)
        expect(result.current).toBe(15.2)
        expect(result.rpm).toBe(3500)
        expect(result.timestamp).toBe(1234567890)
    })

    it('returns frozen object', () => {
        const result = scalePacket(basePacket)
        expect(Object.isFrozen(result)).toBe(true)
    })
})
