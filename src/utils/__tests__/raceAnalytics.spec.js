import { describe, it, expect } from 'vitest'
import { updateRaceSessions } from '../raceAnalytics'

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
})
