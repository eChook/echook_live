import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isHorizontalWheel,
  wheelDeltaXToPanMs,
  getVisibleDurationMs,
  dispatchChartPan,
  scheduleWheelPan,
  resetWheelPanSchedule
} from '../chartWheel'

describe('isHorizontalWheel', () => {
  it('returns true when deltaX dominates', () => {
    expect(isHorizontalWheel({ deltaX: 10, deltaY: 2 })).toBe(true)
  })

  it('returns false when deltaY dominates', () => {
    expect(isHorizontalWheel({ deltaX: 2, deltaY: 10 })).toBe(false)
  })

  it('returns false when deltaX is below threshold', () => {
    expect(isHorizontalWheel({ deltaX: 0.5, deltaY: 0 }, 1)).toBe(false)
  })
})

describe('wheelDeltaXToPanMs', () => {
  it('scales offset proportionally to visible duration and width', () => {
    // half chart width swipe => half visible window
    expect(wheelDeltaXToPanMs(400, 60000, 800)).toBe(30000)
  })

  it('returns 0 for zero chart width', () => {
    expect(wheelDeltaXToPanMs(100, 60000, 0)).toBe(0)
  })

  it('returns 0 for invalid visible duration', () => {
    expect(wheelDeltaXToPanMs(100, 0, 800)).toBe(0)
    expect(wheelDeltaXToPanMs(100, NaN, 800)).toBe(0)
  })
})

describe('getVisibleDurationMs', () => {
  it('uses startValue/endValue when present', () => {
    expect(getVisibleDurationMs({ startValue: 1000, endValue: 5000 }, 0, 10000)).toBe(4000)
  })

  it('derives duration from percentage span and total range', () => {
    expect(getVisibleDurationMs({ start: 10, end: 30 }, 0, 100000)).toBe(20000)
  })

  it('returns null when axis is missing or invalid', () => {
    expect(getVisibleDurationMs(null, 0, 10000)).toBe(null)
    expect(getVisibleDurationMs({ start: 50, end: 50 }, 0, 10000)).toBe(null)
    expect(getVisibleDurationMs({ start: 0, end: 100 }, 0, 0)).toBe(null)
  })
})

describe('dispatchChartPan', () => {
  it('dispatches startValue/endValue pan with zero animation', () => {
    const dispatchAction = vi.fn()
    const chart = {
      getOption: () => ({ dataZoom: [{ startValue: 1000, endValue: 5000 }] }),
      dispatchAction
    }
    expect(dispatchChartPan(chart, 500, { earliestTime: 0, latestTime: 10000 })).toBe(true)
    expect(dispatchAction).toHaveBeenCalledWith({
      type: 'dataZoom',
      startValue: 1500,
      endValue: 5500,
      animation: { duration: 0, easing: 'linear' }
    })
  })
})

describe('scheduleWheelPan', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetWheelPanSchedule()
  })

  afterEach(() => {
    resetWheelPanSchedule()
    vi.useRealTimers()
  })

  it('batches multiple wheel deltas into one apply per frame', () => {
    const apply = vi.fn()
    scheduleWheelPan(100, apply)
    scheduleWheelPan(200, apply)
    expect(apply).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(apply).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenCalledWith(300)
  })
})
