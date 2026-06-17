import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useTelemetryStore } from '../telemetry'
import { useSettingsStore } from '../settings'
import { roundMetric } from '../../utils/metricPrecision'

// Mock socket.io-client
const socketHandlers = {}
vi.mock('socket.io-client', () => ({
    io: vi.fn(() => ({
        on: vi.fn((event, cb) => {
            socketHandlers[event] = cb
        }),
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
    socketMsgpackOptions: { query: { format: 'msgpack' } },
    createSocketOptions: vi.fn(() => ({}))
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

    describe('availableKeys', () => {
        it('includes client-derived voltage keys when voltage and voltageLower are present', async () => {
            const telemetry = useTelemetryStore()

            telemetry.liveData = { voltage: 24.5, voltageLower: 12.1, current: 5 }
            await nextTick()

            expect(telemetry.availableKeys).toContain('voltageHigh')
            expect(telemetry.availableKeys).toContain('voltageDiff')
        })

        it('omits derived voltage keys when voltageLower is missing', async () => {
            const telemetry = useTelemetryStore()

            telemetry.liveData = { voltage: 24.5, current: 5 }
            await nextTick()

            expect(telemetry.availableKeys).not.toContain('voltageHigh')
            expect(telemetry.availableKeys).not.toContain('voltageDiff')
        })
    })

    describe('displayLiveData', () => {
        it('returns empty object when no data', () => {
            const telemetry = useTelemetryStore()

            expect(telemetry.displayLiveData).toEqual({})
        })

        it('applies speed conversion only once for live data', async () => {
            const telemetry = useTelemetryStore()
            const settings = useSettingsStore()

            telemetry.liveData = { speed: 10 }
            settings.unitSettings.speedUnit = 'mph'
            await nextTick()

            expect(telemetry.displayLiveData.speed).toBeCloseTo(22.3694, 4)
        })

        it('recomputes live display speed when unit changes without new packet', async () => {
            const telemetry = useTelemetryStore()
            const settings = useSettingsStore()

            telemetry.liveData = { speed: 10 }
            settings.unitSettings.speedUnit = 'mph'
            await nextTick()
            expect(telemetry.displayLiveData.speed).toBeCloseTo(22.3694, 4)

            settings.unitSettings.speedUnit = 'kph'
            await nextTick()
            expect(telemetry.displayLiveData.speed).toBeCloseTo(36, 4)
        })

        it('displays live speed correctly for all speed unit options', async () => {
            const telemetry = useTelemetryStore()
            const settings = useSettingsStore()
            const expectedByUnit = {
                mph: 22.3694,
                kph: 36,
                ms: 10
            }

            telemetry.liveData = { speed: 10 }

            for (const [speedUnit, expected] of Object.entries(expectedByUnit)) {
                settings.unitSettings.speedUnit = speedUnit
                await nextTick()
                expect(telemetry.displayLiveData.speed).toBeCloseTo(expected, 4)
            }
        })

        it('displays live temperatures correctly for all temperature unit options', async () => {
            const telemetry = useTelemetryStore()
            const settings = useSettingsStore()
            const expectedByUnit = {
                c: { temp1: 25, temp2: 30, tempDiff: 5 },
                f: { temp1: 77, temp2: 86, tempDiff: 9 }
            }

            telemetry.liveData = { temp1: 25, temp2: 30 }

            for (const [tempUnit, expected] of Object.entries(expectedByUnit)) {
                settings.unitSettings.tempUnit = tempUnit
                await nextTick()
                expect(telemetry.displayLiveData.temp1).toBeCloseTo(expected.temp1, 4)
                expect(telemetry.displayLiveData.temp2).toBeCloseTo(expected.temp2, 4)
                expect(telemetry.displayLiveData.tempDiff).toBeCloseTo(expected.tempDiff, 4)
            }
        })

        it('rescales display history when temperature units change', async () => {
            const telemetry = useTelemetryStore()
            const settings = useSettingsStore()

            telemetry.history = [{ timestamp: 1000, temp1: 25, temp2: 30, speed: 10 }]

            settings.unitSettings.speedUnit = 'mph'
            settings.unitSettings.tempUnit = 'f'
            await nextTick()

            expect(telemetry.displayHistory).toHaveLength(1)
            expect(telemetry.displayHistory[0].temp1).toBeCloseTo(77, 4)
            expect(telemetry.displayHistory[0].temp2).toBeCloseTo(86, 4)
            expect(telemetry.displayHistory[0].tempDiff).toBeCloseTo(9, 4)
            expect(telemetry.displayHistory[0].speed).toBeCloseTo(22.3694, 4)
        })

        it('rescales display history correctly for each speed and temperature unit option', async () => {
            const telemetry = useTelemetryStore()
            const settings = useSettingsStore()
            const speedByUnit = {
                mph: 22.3694,
                kph: 36,
                ms: 10
            }
            const tempByUnit = {
                c: { temp1: 25, temp2: 30, tempDiff: 5 },
                f: { temp1: 77, temp2: 86, tempDiff: 9 }
            }

            telemetry.history = [{ timestamp: 1000, speed: 10, temp1: 25, temp2: 30 }]
            // Prime display history by triggering unit-setting watch at least once.
            settings.unitSettings.tempUnit = 'f'
            await nextTick()

            for (const [speedUnit, expectedSpeed] of Object.entries(speedByUnit)) {
                for (const [tempUnit, expectedTemp] of Object.entries(tempByUnit)) {
                    settings.unitSettings.speedUnit = speedUnit
                    settings.unitSettings.tempUnit = tempUnit
                    await nextTick()

                    expect(telemetry.displayHistory).toHaveLength(1)
                    expect(telemetry.displayHistory[0].speed).toBeCloseTo(expectedSpeed, 4)
                    expect(telemetry.displayHistory[0].temp1).toBeCloseTo(expectedTemp.temp1, 4)
                    expect(telemetry.displayHistory[0].temp2).toBeCloseTo(expectedTemp.temp2, 4)
                    expect(telemetry.displayHistory[0].tempDiff).toBeCloseTo(expectedTemp.tempDiff, 4)
                }
            }
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
    describe('derived power metrics', () => {
        it('rounds powerW and powerUsedWh to 2 decimal places on ingest', () => {
            const telemetry = useTelemetryStore()
            telemetry.connect()

            const t0 = Date.now()
            socketHandlers.data?.({
                timestamp: t0,
                voltage: 24.567,
                current: 10.123
            })
            expect(telemetry.liveData.powerW).toBe(roundMetric(24.567 * 10.123, 'powerW'))

            socketHandlers.data?.({
                timestamp: t0 + 1000,
                voltage: 24.567,
                current: 10.123
            })
            expect(telemetry.liveData.powerUsedWh).toBe(0.07)
        })
    })

    describe('lapMarkAreas', () => {
        it('calculates current lap number with +1 offset', () => {
            const telemetry = useTelemetryStore()

            // Setup valid timestamps
            const t0 = 1600000000000
            const t1 = t0 + 10000
            const t2 = t1 + 5000

            // Mock races with one completed lap (Lap 1)
            telemetry.races = {
                'race1': {
                    startTimeMs: t0,
                    laps: {
                        1: { startTime: t0, finishTime: t1, lapNumber: 1 }
                    }
                }
            }

            // Mock history showing we are now past the finish line, with currLap=1
            // currLap=1 (from server) + 1 (fix) -> Lap 2
            telemetry.history = [
                { timestamp: t2, currLap: 1 }
            ]

            const areas = telemetry.lapMarkAreas
            // 1st area: Lap 1 (completed). 2nd area: Current Lap
            expect(areas).toHaveLength(2)

            const completedLap = areas[0]
            expect(completedLap[1].name).toBe('Lap 1')

            const currentLap = areas[1]
            expect(currentLap[1].name).toBe('Lap 2')
        })
    })

    describe('race reset invariants', () => {
        it('keeps races as an object map when clearing state', () => {
            const telemetry = useTelemetryStore()
            telemetry.races = { race1: { laps: {} } }
            telemetry.resetState()
            expect(Array.isArray(telemetry.races)).toBe(false)
            expect(typeof telemetry.races).toBe('object')
        })
    })

    describe('isViewingHistoricalDay', () => {
        it('is false when live (not paused)', () => {
            const telemetry = useTelemetryStore()

            telemetry.isPaused = false
            telemetry.wasLoadedFromCalendar = true
            telemetry.history = [{ timestamp: Date.now() - 24 * 60 * 60 * 1000 }]

            expect(telemetry.isViewingHistoricalDay).toBe(false)
        })

        it('is false when paused on today without a calendar load', () => {
            const telemetry = useTelemetryStore()

            telemetry.isPaused = true
            telemetry.wasLoadedFromCalendar = false
            telemetry.history = [{ timestamp: Date.now() }]

            expect(telemetry.isViewingHistoricalDay).toBe(false)
        })

        it('is true when paused after loading a day from the calendar', () => {
            const telemetry = useTelemetryStore()

            telemetry.isPaused = true
            telemetry.wasLoadedFromCalendar = true
            telemetry.history = [{ timestamp: Date.now() - 24 * 60 * 60 * 1000 }]

            expect(telemetry.isViewingHistoricalDay).toBe(true)
        })

        it('becomes false after resetToLive clears the calendar flag', async () => {
            const telemetry = useTelemetryStore()

            telemetry.isPaused = true
            telemetry.wasLoadedFromCalendar = true
            telemetry.history = [{ timestamp: Date.now() - 24 * 60 * 60 * 1000 }]
            expect(telemetry.isViewingHistoricalDay).toBe(true)

            telemetry.wasLoadedFromCalendar = false
            telemetry.isPaused = false
            telemetry.history = []

            expect(telemetry.isViewingHistoricalDay).toBe(false)
        })
    })

    describe('showDataRibbon', () => {
        it('is false when disconnected', () => {
            const telemetry = useTelemetryStore()

            telemetry.isConnected = false
            telemetry.isPaused = false
            telemetry.lastPacketTime = Date.now()

            expect(telemetry.showDataRibbon).toBe(false)
        })

        it('is false when connected but no live car data has been received', () => {
            const telemetry = useTelemetryStore()

            telemetry.isConnected = true
            telemetry.isPaused = false
            telemetry.lastPacketTime = 0

            expect(telemetry.showDataRibbon).toBe(false)
        })

        it('is true when connected and receiving live data', () => {
            const telemetry = useTelemetryStore()

            telemetry.isConnected = true
            telemetry.isPaused = false
            telemetry.lastPacketTime = Date.now()

            expect(telemetry.showDataRibbon).toBe(true)
        })

        it('is false when live car data goes stale', () => {
            const telemetry = useTelemetryStore()

            telemetry.isConnected = true
            telemetry.isPaused = false
            telemetry.lastPacketTime = Date.now() - 10000

            expect(telemetry.showDataRibbon).toBe(false)
        })

        it('stays visible when paused on today even if data is stale', () => {
            const telemetry = useTelemetryStore()

            telemetry.isConnected = true
            telemetry.isPaused = true
            telemetry.lastPacketTime = Date.now() - 10000
            telemetry.history = [{ timestamp: Date.now() }]

            expect(telemetry.showDataRibbon).toBe(true)
        })

        it('is false when connected but viewing a previous day from the calendar', () => {
            const telemetry = useTelemetryStore()
            const yesterday = Date.now() - 24 * 60 * 60 * 1000

            telemetry.isConnected = true
            telemetry.isPaused = true
            telemetry.wasLoadedFromCalendar = true
            telemetry.lastPacketTime = yesterday
            telemetry.history = [{ timestamp: yesterday }]

            expect(telemetry.showDataRibbon).toBe(false)
        })

        it('is true again when connection is restored and live data resumes', () => {
            const telemetry = useTelemetryStore()

            telemetry.isConnected = false
            telemetry.lastPacketTime = 0
            expect(telemetry.showDataRibbon).toBe(false)

            telemetry.isConnected = true
            telemetry.lastPacketTime = Date.now()
            expect(telemetry.showDataRibbon).toBe(true)
        })
    })
})
