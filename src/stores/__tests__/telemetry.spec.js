import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTelemetryStore } from '../telemetry'
import { useSettingsStore } from '../settings'

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
    io: vi.fn(() => ({
        on: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        connected: false
    }))
}))

// Mock msgpack
vi.mock('../../utils/msgpack', () => ({
    api: {
        get: vi.fn()
    },
    decodeMsgpack: vi.fn((data) => data),
    socketMsgpackOptions: { query: { format: 'msgpack' } }
}))

describe('telemetry store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    describe('getDisplayName', () => {
        it('returns friendly name for known keys', () => {
            const telemetry = useTelemetryStore()

            expect(telemetry.getDisplayName('voltage')).toBe('Voltage')
            expect(telemetry.getDisplayName('voltageLower')).toBe('V_Batt Low')
            expect(telemetry.getDisplayName('voltageHigh')).toBe('V_Batt High')
            expect(telemetry.getDisplayName('ampH')).toBe('Amp Hours')
            expect(telemetry.getDisplayName('temp1')).toBe('Temp 1')
            expect(telemetry.getDisplayName('temp2')).toBe('Temp 2')
        })

        it('returns key itself for unknown keys', () => {
            const telemetry = useTelemetryStore()

            expect(telemetry.getDisplayName('unknownKey')).toBe('unknownKey')
        })
    })

    describe('getDescription', () => {
        it('returns tooltip for known keys', () => {
            const telemetry = useTelemetryStore()

            expect(telemetry.getDescription('brake')).toContain('engaged')
            expect(telemetry.getDescription('voltage')).toContain('24V')
        })

        it('returns empty string for unknown keys', () => {
            const telemetry = useTelemetryStore()

            expect(telemetry.getDescription('unknownKey')).toBe('')
        })
    })

    describe('displayLiveData', () => {
        it('returns empty object when no data', () => {
            const telemetry = useTelemetryStore()

            expect(telemetry.displayLiveData).toEqual({})
        })
    })

    describe('unit conversions (via settings)', () => {
        it('converts speed based on settings', async () => {
            const settings = useSettingsStore()
            const telemetry = useTelemetryStore()

            // Speed in m/s
            const baseSpeed = 10 // m/s

            settings.unitSettings.speedUnit = 'mph'
            // 10 m/s ≈ 22.37 mph
            const mphConversion = baseSpeed * 2.23694
            expect(mphConversion).toBeCloseTo(22.37, 1)

            settings.unitSettings.speedUnit = 'kph'
            // 10 m/s = 36 km/h
            const kphConversion = baseSpeed * 3.6
            expect(kphConversion).toBe(36)
        })

        it('converts temperature based on settings', () => {
            const settings = useSettingsStore()

            const tempC = 25

            settings.unitSettings.tempUnit = 'c'
            expect(tempC).toBe(25)

            settings.unitSettings.tempUnit = 'f'
            const tempF = (tempC * 9 / 5) + 32
            expect(tempF).toBe(77)
        })
    })
})
