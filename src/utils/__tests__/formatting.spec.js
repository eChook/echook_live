import { describe, it, expect } from 'vitest'
import { getUnit, formatValue } from '../formatting'

describe('getUnit', () => {
    it('returns RPM for rpm-related keys', () => {
        expect(getUnit('rpm')).toBe('RPM')
        expect(getUnit('motorRPM')).toBe('RPM')
    })

    it('returns V for voltage-related keys', () => {
        expect(getUnit('voltage')).toBe('V')
        expect(getUnit('voltageLower')).toBe('V')
        expect(getUnit('voltageHigh')).toBe('V')
        expect(getUnit('V_Batt Low')).toBe('V')
    })

    it('returns A for current-related keys', () => {
        expect(getUnit('current')).toBe('A')
        expect(getUnit('amp')).toBe('A')
    })

    it('returns Ah for amp-hour keys', () => {
        expect(getUnit('ampH')).toBe('Ah')
        expect(getUnit('AmpHours')).toBe('Ah') // No space version matches
    })

    it('returns °C for temperature keys', () => {
        expect(getUnit('temp1')).toBe('°C')
        expect(getUnit('temp2')).toBe('°C')
        expect(getUnit('tempDiff')).toBe('°C')
    })

    it('returns % for throttle/SOC keys', () => {
        expect(getUnit('throttle')).toBe('%')
        expect(getUnit('soc')).toBe('%')
    })

    it('returns empty string for gear and lap', () => {
        expect(getUnit('gear')).toBe('')
        expect(getUnit('currLap')).toBe('')
    })

    it('returns empty string for unknown keys', () => {
        expect(getUnit('unknownKey')).toBe('')
    })
})

describe('formatValue', () => {
    it('returns - for null or undefined', () => {
        expect(formatValue('voltage', null)).toBe('-')
        expect(formatValue('voltage', undefined)).toBe('-')
    })

    it('returns non-numbers as-is', () => {
        expect(formatValue('status', 'OK')).toBe('OK')
    })

    it('formats RPM as integer', () => {
        expect(formatValue('rpm', 1234.56)).toBe('1235')
    })

    it('formats gear as integer', () => {
        expect(formatValue('gear', 3.0)).toBe('3')
    })

    it('formats currLap as integer', () => {
        expect(formatValue('currLap', 5.0)).toBe('5')
    })

    it('formats brake as integer', () => {
        expect(formatValue('brake', 1)).toBe('1')
        expect(formatValue('brake', 0)).toBe('0')
    })

    it('formats GPS coordinates to 5 decimal places', () => {
        expect(formatValue('lat', 51.123456789)).toBe('51.12346')
        expect(formatValue('lon', -1.987654321)).toBe('-1.98765')
    })

    it('formats default values to 2 decimal places', () => {
        expect(formatValue('voltage', 24.567)).toBe('24.57')
        expect(formatValue('current', 5.1)).toBe('5.10')
    })

    it('formats timestamp as time string', () => {
        const timestamp = new Date('2024-01-15T12:30:45').getTime()
        const result = formatValue('timestamp', timestamp)
        expect(result).toContain(':30:45')
    })
})
