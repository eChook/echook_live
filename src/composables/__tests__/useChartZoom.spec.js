import { describe, it, expect } from 'vitest'
import { useChartZoom } from '../useChartZoom'

describe('useChartZoom', () => {
    it('stores absolute zoom requests', () => {
        const zoom = useChartZoom()
        zoom.requestChartZoom(1000, 2000)
        expect(zoom.chartZoomRequest.value).toEqual({ type: 'absolute', start: 1000, end: 2000 })
    })

    it('persists and clears current absolute window', () => {
        const zoom = useChartZoom()
        zoom.setCurrentZoomWindow(1500, 4500)
        expect(zoom.currentZoomWindowMs.value).toEqual({ start: 1500, end: 4500 })

        zoom.clearCurrentZoomWindow()
        expect(zoom.currentZoomWindowMs.value).toBeNull()
    })

    it('rejects invalid persisted windows', () => {
        const zoom = useChartZoom()
        zoom.setCurrentZoomWindow(2000, 1000)
        expect(zoom.currentZoomWindowMs.value).toBeNull()

        zoom.setCurrentZoomWindow(Number.NaN, 1000)
        expect(zoom.currentZoomWindowMs.value).toBeNull()
    })

    it('issues reset request on unlock', () => {
        const zoom = useChartZoom()
        zoom.requestChartUnlock()
        expect(zoom.chartZoomRequest.value).toEqual({ type: 'reset' })
    })
})
