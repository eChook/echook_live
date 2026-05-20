import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { useHistory } from '../useHistory'

vi.mock('../../utils/msgpack', () => ({
    api: {
        get: vi.fn()
    }
}))

vi.mock('../useToast', () => ({
    useToast: () => ({
        showToast: vi.fn()
    })
}))

import { api } from '../../utils/msgpack'

describe('useHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('ignores stale overlapping fetch responses', async () => {
        const historyRef = ref([])
        const maxPointsRef = ref(1000)
        const processPacket = vi.fn((packet) => packet)
        const processLapData = vi.fn()
        const clearRaces = vi.fn()
        const rebuildRacesFromHistory = vi.fn()

        const history = useHistory({
            historyRef,
            maxPointsRef,
            processPacket,
            processLapData,
            clearRaces,
            rebuildRacesFromHistory
        })

        let resolveFirstRequest
        const firstRequest = new Promise((resolve) => {
            resolveFirstRequest = resolve
        })

        api.get
            .mockImplementationOnce(() => firstRequest)
            .mockResolvedValueOnce({
                data: [{ timestamp: 2000, speed: '15' }]
            })

        const stalePromise = history.fetchHistory('car-1')
        const activePromise = history.fetchHistory('car-1')

        const activeCount = await activePromise
        resolveFirstRequest({ data: [{ timestamp: 1000, speed: '10' }] })
        const staleCount = await stalePromise

        expect(activeCount).toBe(1)
        expect(staleCount).toBe(0)
        expect(historyRef.value.map((p) => p.timestamp)).toEqual([2000])
        expect(historyRef.value[0].speed).toBe(15)
        expect(rebuildRacesFromHistory).toHaveBeenCalledTimes(1)
    })

    it('prefers LL-rich existing packet when prepending history with duplicate timestamp', async () => {
        const historyRef = ref([
            { timestamp: 1000, currLap: 1, LL_Time: 61.2, LL_V: 24.7, speed: 10 }
        ])
        const maxPointsRef = ref(1000)
        const processPacket = vi.fn((packet) => packet)
        const processLapData = vi.fn()
        const clearRaces = vi.fn()
        const rebuildRacesFromHistory = vi.fn()

        const history = useHistory({
            historyRef,
            maxPointsRef,
            processPacket,
            processLapData,
            clearRaces,
            rebuildRacesFromHistory
        })

        api.get.mockResolvedValueOnce({
            data: [{ timestamp: 1000, currLap: 1, speed: '8' }]
        })

        await history.fetchHistory('car-1', 500, 1500, true)

        expect(historyRef.value).toHaveLength(1)
        expect(historyRef.value[0].LL_Time).toBe(61.2)
        expect(historyRef.value[0].LL_V).toBe(24.7)
    })
})
