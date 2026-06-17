import { describe, it, expect } from 'vitest'
import { deriveLapSummary, rebuildRaceSessionsFromSamples, updateRaceSessions } from '../raceAnalytics'

describe('updateRaceSessions', () => {
    const createPacket = (overrides = {}) => ({
        timestamp: Date.now(),
        currLap: 1,
        LL_Time: 60.5, // 60.5 seconds lap time
        LL_V: 24.5,
        LL_I: 15.2,
        LL_RPM: 3500,
        LL_Spd: 12.5,
        LL_Ah: 0.42,
        ...overrides
    })

    it('creates a new race session when sessions is empty', () => {
        const sessions = {}
        const packet = createPacket({ currLap: 1 })

        const result = updateRaceSessions(sessions, packet, 0)

        const keys = Object.keys(result)
        expect(keys.length).toBe(1)

        const race = result[keys[0]]
        expect(race.laps[1]).toBeDefined()
        expect(race.laps[1].lapNumber).toBe(1)
    })

    it('does not create session for lap 0', () => {
        const sessions = {}
        const packet = createPacket({ currLap: 0 })

        const result = updateRaceSessions(sessions, packet, 0)

        expect(Object.keys(result).length).toBe(0)
    })

    it('adds subsequent laps to existing race', () => {
        const startTime = Date.now() - 120000
        const sessions = {
            [startTime]: {
                id: startTime,
                startTimeMs: startTime,
                laps: {
                    1: { lapNumber: 1, finishTime: startTime + 60000 }
                }
            }
        }

        const packet = createPacket({ currLap: 2, timestamp: startTime + 120000 })
        const result = updateRaceSessions(sessions, packet, 1)

        expect(result[startTime].laps[2]).toBeDefined()
        expect(result[startTime].laps[2].lapNumber).toBe(2)
    })

    it('detects new race when lap number resets to 1 from higher', () => {
        const oldStart = Date.now() - 300000
        const sessions = {
            [oldStart]: {
                id: oldStart,
                startTimeMs: oldStart,
                laps: {
                    1: { lapNumber: 1, finishTime: oldStart + 60000 },
                    2: { lapNumber: 2, finishTime: oldStart + 120000 },
                    3: { lapNumber: 3, finishTime: oldStart + 180000 }
                }
            }
        }

        const packet = createPacket({ currLap: 1, timestamp: Date.now() })
        const result = updateRaceSessions(sessions, packet, 3)

        const keys = Object.keys(result)
        expect(keys.length).toBe(2) // Old race + new race
    })

    it('stores lap data with correct LL_ values', () => {
        const sessions = {}
        const packet = createPacket({
            currLap: 1,
            LL_Time: 62.3,
            LL_V: 23.8,
            LL_Ah: 0.55
        })

        const result = updateRaceSessions(sessions, packet, 0)
        const race = Object.values(result)[0]
        const lap = race.laps[1]

        expect(lap.LL_Time).toBe(62.3)
        expect(lap.LL_V).toBe(23.8)
        expect(lap.LL_Ah).toBe(0.55)
    })

    it('ignores packets without LL_ keys', () => {
        const sessions = {}
        const packet = {
            timestamp: Date.now(),
            currLap: 1,
            voltage: 24.5 // No LL_ keys
        }

        const result = updateRaceSessions(sessions, packet, 0)

        expect(Object.keys(result).length).toBe(0)
    })

    it('ignores LL_ packets with only zero placeholder values', () => {
        const sessions = {}
        const packet = createPacket({
            currLap: 1,
            LL_Time: 0,
            LL_V: 0,
            LL_I: 0,
            LL_RPM: 0,
            LL_Spd: 0,
            LL_Ah: 0,
            LL_Eff: 0
        })

        const result = updateRaceSessions(sessions, packet, 0)

        expect(Object.keys(result).length).toBe(0)
    })

    it('does not overwrite a valid lap with zero placeholder LL_ values', () => {
        const sessions = {}
        const validPacket = createPacket({ currLap: 2, LL_Time: 71.2, LL_V: 24.1 })
        const withValidLap = updateRaceSessions(sessions, validPacket, 1)

        const race = Object.values(withValidLap)[0]
        const firstLapData = race.laps[2]

        const zeroPacket = createPacket({
            currLap: 2,
            timestamp: validPacket.timestamp + 1000,
            LL_Time: 0,
            LL_V: 0,
            LL_I: 0,
            LL_RPM: 0,
            LL_Spd: 0,
            LL_Ah: 0,
            LL_Eff: 0
        })

        const result = updateRaceSessions(withValidLap, zeroPacket, 2)
        const updatedRace = Object.values(result)[0]
        const lapAfterZeroPacket = updatedRace.laps[2]

        expect(lapAfterZeroPacket.LL_Time).toBe(firstLapData.LL_Time)
        expect(lapAfterZeroPacket.LL_V).toBe(firstLapData.LL_V)
    })
})

describe('rebuildRaceSessionsFromSamples', () => {
    it('rebuilds sessions from currLap-only history when LL_* is missing', () => {
        const start = 1700000000000
        const samples = [
            { timestamp: start, currLap: 1, voltage: 24.1, current: 10, rpm: 2000, speed: 8, ampH: 0.1, track: 'Test Track' },
            { timestamp: start + 10000, currLap: 1, voltage: 24.0, current: 11, rpm: 2100, speed: 9, ampH: 0.12 },
            { timestamp: start + 65000, currLap: 2, voltage: 23.9, current: 12, rpm: 2200, speed: 10, ampH: 0.2 },
            { timestamp: start + 73000, currLap: 2, voltage: 23.8, current: 10, rpm: 2100, speed: 9.5, ampH: 0.24 },
            { timestamp: start + 134000, currLap: 3, voltage: 23.7, current: 11, rpm: 2150, speed: 10.2, ampH: 0.31 }
        ]

        const sessions = rebuildRaceSessionsFromSamples(samples)
        const race = Object.values(sessions)[0]
        const laps = Object.values(race.laps).sort((a, b) => a.lapNumber - b.lapNumber)

        expect(Object.keys(sessions)).toHaveLength(1)
        expect(laps).toHaveLength(2)
        expect(laps[0].lapNumber).toBe(1)
        expect(laps[0].lapSummarySource).toBe('derived')
        expect(laps[0].LL_Time).toBeCloseTo(65, 5)
        expect(laps[1].lapNumber).toBe(2)
        expect(laps[1].lapSummarySource).toBe('derived')
    })

    it('keeps authoritative LL_* device summary over derived summary', () => {
        const start = 1700000000000
        const samples = [
            { timestamp: start, currLap: 1, voltage: 24.1, current: 10, rpm: 2000, speed: 8, ampH: 0.1, track: 'Track A' },
            { timestamp: start + 50000, currLap: 2, voltage: 24.0, current: 11, rpm: 2100, speed: 9, ampH: 0.16 },
            { timestamp: start + 120000, currLap: 2, LL_Time: 70, LL_V: 24.8, LL_I: 15.1, LL_RPM: 3200, LL_Spd: 13.2, LL_Ah: 0.48 },
            { timestamp: start + 121000, currLap: 3, voltage: 23.8, current: 12, rpm: 2200, speed: 10, ampH: 0.26 }
        ]

        const sessions = rebuildRaceSessionsFromSamples(samples)
        const race = Object.values(sessions)[0]

        expect(race.laps[2]).toBeDefined()
        expect(race.laps[2].lapSummarySource).toBe('device')
        expect(race.laps[2].LL_Time).toBe(70)
        expect(race.laps[2].LL_V).toBe(24.8)
    })

    it('allows derived fill when LL_* packet is zero placeholder', () => {
        const start = 1700000000000
        const samples = [
            { timestamp: start, currLap: 1, voltage: 24.1, current: 10, rpm: 2000, speed: 8, ampH: 0.1 },
            { timestamp: start + 60000, currLap: 1, LL_Time: 0, LL_V: 0, LL_I: 0, LL_RPM: 0, LL_Spd: 0, LL_Ah: 0, LL_Eff: 0 },
            { timestamp: start + 62000, currLap: 2, voltage: 23.9, current: 11, rpm: 2100, speed: 9, ampH: 0.2 }
        ]

        const sessions = rebuildRaceSessionsFromSamples(samples)
        const race = Object.values(sessions)[0]
        const lapOne = race.laps[1]

        expect(lapOne).toBeDefined()
        expect(lapOne.lapSummarySource).toBe('derived')
        expect(lapOne.LL_Time).toBeCloseTo(62, 5)
    })

    it('derives peak power and lap Wh from sample window', () => {
        const start = 1_700_000_000_000
        const samples = Array.from({ length: 121 }, (_, idx) => ({
            timestamp: start + (idx * 1000),
            voltage: 24,
            current: 12,
            speed: 8 + (idx * 0.01),
            rpm: 2000 + idx
        }))
        const summary = deriveLapSummary(samples, start, start + 120_000)

        expect(summary.LL_PeakW).toBe(288)
        expect(summary.LL_Wh).toBeGreaterThan(0)
    })

    it('backfills missing peak power and Wh on device lap summaries', () => {
        const start = 1_700_000_000_000
        const samples = [
            { timestamp: start, currLap: 1, voltage: 24, current: 10, speed: 8, rpm: 2000, track: 'Track A' },
            { timestamp: start + 60_000, currLap: 2, voltage: 24, current: 12, speed: 9, rpm: 2200 },
            ...Array.from({ length: 59 }, (_, idx) => ({
                timestamp: start + 61_000 + (idx * 1000),
                currLap: 2,
                voltage: 24,
                current: 12,
                speed: 9,
                rpm: 2200
            })),
            { timestamp: start + 120_000, currLap: 2, LL_Time: 60, LL_V: 24, LL_I: 12, LL_RPM: 2200, LL_Spd: 9, LL_Ah: 0.5 },
            { timestamp: start + 180_000, currLap: 3, voltage: 24, current: 8, speed: 10, rpm: 2100 }
        ]

        const sessions = rebuildRaceSessionsFromSamples(samples)
        const race = Object.values(sessions)[0]

        expect(race.laps[2].lapSummarySource).toBe('device')
        expect(race.laps[2].LL_PeakW).toBeGreaterThan(0)
        expect(race.laps[2].LL_Wh).toBeGreaterThan(0)
    })
})
