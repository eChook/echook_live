<!--
  @file components/TelemetryGraph.vue
  @brief ECharts-based telemetry graph component.
  @description Renders a time-series graph for a single telemetry data key.
               Supports zoom controls, lap highlighting, and synced charts via
               ECharts grouping. Handles keyboard and mouse zoom requests.
-->
<script setup>
/**
 * @description TelemetryGraph component for visualizing telemetry data.
 * 
 * Features:
 * - Time-series line chart with auto-scaling
 * - Zoom controls: Ctrl+Scroll for zoom, Shift+Scroll for pan
 * - Horizontal trackpad scroll over graph pans time axis (blocks browser back/forward)
 * - Lap highlighting via markArea (alternating colors)
 * - Chart grouping for synchronized zoom across multiple graphs
 * - Programmatic zoom via chartZoomRequest from store
 * - Configurable height, color, and display options
 * 
 * Props:
 * - data: Array of telemetry data points with timestamp
 * - dataRevision: Monotonic revision used to invalidate computed data on in-place pushes
 * - dataKey: Which data key to display (e.g., 'speed', 'voltage')
 * - color: Line color (defaults to primary theme color)
 * - group: ECharts group name for synchronized charts
 * - showLaps: Whether to show lap highlight areas
 * - showTitle: Whether to show the data key title
 * - height: Custom height (number or string)
 */
import { computed, defineProps, ref, watch, onMounted, onUnmounted } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
import { useSettingsStore } from '../stores/settings'
import { getChartTokens } from '../constants/chartTheme'
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  TitleComponent,
  MarkAreaComponent
} from "echarts/components";
import VChart from "vue-echarts";

// Register ECharts components
use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  TitleComponent,
  MarkAreaComponent
]);

import { formatValue, getUnit } from '../utils/formatting'
import { splitLineSeriesAtGaps } from '../utils/chartData'
import {
  isHorizontalWheel,
  wheelDeltaXToPanMs,
  getVisibleDurationMs,
  dispatchChartPan,
  scheduleWheelPan,
  resetWheelPanSchedule
} from '../utils/chartWheel'

/**
 * @brief Component props definition.
 */
const props = defineProps({
  /** @brief Array of telemetry data points */
  data: {
    type: Array,
    required: true
  },
  /** @brief Monotonic data revision (e.g., history length) */
  dataRevision: {
    type: Number,
    default: 0
  },
  /** @brief Custom chart height (px or CSS string) */
  height: {
    type: [String, Number],
    default: null
  },
  /** @brief Telemetry key to display */
  dataKey: {
    type: String,
    required: true
  },
  /** @brief Line color */
  color: {
    type: String,
    default: '#cb1557'
  },
  /** @brief ECharts group for synchronized zoom */
  group: {
    type: String,
    default: 'telemetry'
  },
  /** @brief Whether to show lap highlight areas */
  showLaps: {
    type: Boolean,
    default: true
  },
  /** @brief Whether to show the data key title */
  showTitle: {
    type: Boolean,
    default: true
  }
})

const telemetry = useTelemetryStore()
const settings = useSettingsStore()
const chart = ref(null)
/** @brief Chart wrapper for non-passive wheel listener */
const containerRef = ref(null)

/**
 * @brief Resolve shared telemetry time bounds used by all charts.
 * @returns {{start: number, end: number} | null} Shared bounds in ms
 */
const getSharedTimeBounds = () => {
  const earliest = Number(telemetry.earliestTime)
  const latest = Number(telemetry.latestTime || Date.now())
  if (Number.isFinite(earliest) && Number.isFinite(latest) && latest > earliest) {
    return { start: earliest, end: latest }
  }

  if (Array.isArray(props.data) && props.data.length > 1) {
    const start = Number(props.data[0]?.timestamp)
    const end = Number(props.data[props.data.length - 1]?.timestamp)
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return { start, end }
    }
  }

  return null
}

/**
 * @brief Clamp a candidate absolute window to shared telemetry bounds.
 * @param {number} start - Candidate window start in ms
 * @param {number} end - Candidate window end in ms
 * @param {{start: number, end: number} | null} bounds - Shared time bounds
 * @returns {{start: number, end: number} | null} Clamped window
 */
const clampAbsoluteWindow = (start, end, bounds) => {
  if (!bounds) return null
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const total = bounds.end - bounds.start
  if (!(total > 0)) return null

  let clampedStart = start
  let clampedEnd = end

  // Clamp using shift-first behavior to preserve the requested duration when possible.
  if (clampedStart < bounds.start) {
    const delta = bounds.start - clampedStart
    clampedStart = bounds.start
    clampedEnd += delta
  }
  if (clampedEnd > bounds.end) {
    const delta = clampedEnd - bounds.end
    clampedEnd = bounds.end
    clampedStart -= delta
  }

  clampedStart = Math.max(bounds.start, clampedStart)
  clampedEnd = Math.min(bounds.end, clampedEnd)

  const minSpan = Math.min(total, 1)
  if ((clampedEnd - clampedStart) < minSpan) {
    clampedEnd = Math.min(bounds.end, clampedStart + minSpan)
    clampedStart = Math.max(bounds.start, clampedEnd - minSpan)
  }
  return clampedEnd > clampedStart ? { start: clampedStart, end: clampedEnd } : null
}

/**
 * @brief Convert chart dataZoom state into absolute timestamp window.
 * @param {Object|null|undefined} axis - dataZoom[0] option payload
 * @param {{start: number, end: number} | null} bounds - Shared telemetry bounds
 * @returns {{start: number, end: number} | null} Absolute window in ms
 */
const resolveAxisAbsoluteWindow = (axis, bounds) => {
  if (!axis || !bounds) return null
  if (Number.isFinite(axis.startValue) && Number.isFinite(axis.endValue)) {
    return clampAbsoluteWindow(axis.startValue, axis.endValue, bounds)
  }

  if (Number.isFinite(axis.start) && Number.isFinite(axis.end)) {
    const total = bounds.end - bounds.start
    if (total <= 0) return null
    const start = bounds.start + ((axis.start / 100) * total)
    const end = bounds.start + ((axis.end / 100) * total)
    return clampAbsoluteWindow(start, end, bounds)
  }

  return null
}

/**
 * @brief Apply an absolute window to this chart and persist it globally.
 * @param {{start: number, end: number} | null} window - Absolute window in ms
 * @returns {boolean} True when a zoom dispatch was emitted
 */
const applyAbsoluteWindow = (window) => {
  if (!chart.value || !window) return false
  chart.value.dispatchAction({
    type: 'dataZoom',
    startValue: window.start,
    endValue: window.end
  })
  telemetry.setCurrentZoomWindow?.(window.start, window.end)
  return true
}

/**
 * @brief Persist the current chart dataZoom as the shared window.
 */
const syncWindowFromChart = () => {
  if (!chart.value) return
  const bounds = getSharedTimeBounds()
  if (!bounds) return
  const axis = chart.value.getOption()?.dataZoom?.[0]
  const window = resolveAxisAbsoluteWindow(axis, bounds)
  if (window) {
    telemetry.setCurrentZoomWindow?.(window.start, window.end)
  }
}

/**
 * @brief Process zoom requests from the telemetry store using absolute windows only.
 * @param {Object|null} payload - Zoom request or null to use store value
 */
const processZoom = (payload) => {
  const req = payload || telemetry.chartZoomRequest
  if (!req || !chart.value) return

  const bounds = getSharedTimeBounds()
  if (!bounds) {
    telemetry.chartZoomRequest = null
    return
  }

  const axis = chart.value.getOption()?.dataZoom?.[0]
  const persistedWindow = telemetry.currentZoomWindowMs
    ? clampAbsoluteWindow(telemetry.currentZoomWindowMs.start, telemetry.currentZoomWindowMs.end, bounds)
    : null
  const currentWindow = resolveAxisAbsoluteWindow(axis, bounds) || persistedWindow || bounds
  let targetWindow = null

  if (req.type === 'absolute') {
    targetWindow = clampAbsoluteWindow(req.start, req.end, bounds)
  } else if (req.type === 'pan') {
    const offset = Number(req.offsetMs)
    if (Number.isFinite(offset)) {
      targetWindow = clampAbsoluteWindow(currentWindow.start + offset, currentWindow.end + offset, bounds)
    }
  } else if (req.type === 'scale') {
    const factor = Number(req.factor)
    if (Number.isFinite(factor) && factor > 0) {
      const currentDuration = currentWindow.end - currentWindow.start
      const center = currentWindow.start + (currentDuration / 2)
      const nextDuration = currentDuration * factor
      targetWindow = clampAbsoluteWindow(center - (nextDuration / 2), center + (nextDuration / 2), bounds)
    }
  } else if (req.type === 'reset') {
    const totalDuration = bounds.end - bounds.start
    const currentDuration = currentWindow.end - currentWindow.start
    const fallbackDuration = Math.max(totalDuration * 0.1, Math.min(totalDuration, 1000))
    const duration = Number.isFinite(currentDuration) && currentDuration > 0 ? currentDuration : fallbackDuration
    targetWindow = clampAbsoluteWindow(bounds.end - duration, bounds.end, bounds)
  }

  if (targetWindow) {
    applyAbsoluteWindow(targetWindow)
  }
  telemetry.chartZoomRequest = null
}

// Watch for zoom requests
watch(() => telemetry.chartZoomRequest, (req) => {
  if (req) {
    requestAnimationFrame(() => processZoom(req))
  }
})

watch(() => props.dataRevision, () => {
  requestAnimationFrame(() => {
    if (telemetry.currentZoomWindowMs) return
    const bounds = getSharedTimeBounds()
    if (bounds) {
      applyAbsoluteWindow(bounds)
    }
  })
})

onMounted(() => {
  if (containerRef.value) {
    containerRef.value.addEventListener('wheel', handleWheel, { capture: true, passive: false })
  }
  if (chart.value && typeof chart.value.on === 'function') {
    chart.value.on('datazoom', syncWindowFromChart)
  }

  requestAnimationFrame(() => {
    const bounds = getSharedTimeBounds()
    const persisted = telemetry.currentZoomWindowMs
      ? clampAbsoluteWindow(telemetry.currentZoomWindowMs.start, telemetry.currentZoomWindowMs.end, bounds)
      : null
    if (persisted) {
      applyAbsoluteWindow(persisted)
      return
    }
    if (telemetry.chartZoomRequest) {
      processZoom()
      return
    }
    syncWindowFromChart()
  })
})

onUnmounted(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('wheel', handleWheel, { capture: true })
  }
  if (chart.value && typeof chart.value.off === 'function') {
    chart.value.off('datazoom', syncWindowFromChart)
  }
  resetWheelPanSchedule()
})

/**
 * @brief Get display unit for a telemetry key.
 * @param {string} key - Telemetry key
 * @returns {string} Unit string
 */
const getDisplayUnit = (key) => {
  if (key === 'speed') return telemetry.unitSettings.speedUnit
  if (key === 'temp1' || key === 'temp2') return telemetry.unitSettings.tempUnit === 'f' ? '°F' : '°C'
  return getUnit(key)
}

/**
 * @brief Reactive line segments keyed by both data reference and revision.
 * @description `history` is a shallowRef mutated in place, so `dataRevision` forces recompute.
 */
const lineSeriesSegments = computed(() => {
  void props.dataRevision
  return splitLineSeriesAtGaps(props.data, props.dataKey)
})

/**
 * @brief ECharts option configuration.
 * @type {ComputedRef<Object>}
 */
const option = computed(() => {
  const showGrid = telemetry.graphSettings.showGrid
  const showHighlights = props.showLaps && telemetry.graphSettings.showLapHighlights
  /** ECharts chrome colors follow app resolved theme (light/dark). */
  const t = getChartTokens(settings.resolvedTheme)
  const timeBounds = getSharedTimeBounds()

  return {
    animation: telemetry.graphSettings.showAnimations,
    color: [props.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText },
      formatter: (params) => {
        if (!params.length) return ''
        const item = params.find((p) => Array.isArray(p.data) && Number.isFinite(p.data[1])) ?? params[0]
        const date = new Date(item.axisValue)
        const timeStr = date.toLocaleTimeString()
        const val = Array.isArray(item.data) ? item.data[1] : item.data[props.dataKey]
        const formatted = formatValue(props.dataKey, val)
        const unit = getDisplayUnit(props.dataKey)

        return `
          <div class="font-bold mb-1">${timeStr}</div>
          <div class="flex items-center justify-between space-x-4">
            <span style="color: ${item.color}">● ${item.seriesName}</span>
            <span class="font-mono font-bold">${formatted} <span class="text-xs" style="color:${t.tooltipUnit}">${unit}</span></span>
          </div>
        `
      }
    },
    grid: {
      top: 40,
      bottom: 20,
      left: 60,
      right: 20
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      min: timeBounds ? timeBounds.start : undefined,
      max: timeBounds ? timeBounds.end : undefined,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { show: showGrid, lineStyle: { color: t.grid } }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { show: showGrid, lineStyle: { color: t.grid } }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseWheel: 'shift'
      }
    ],
    series: (lineSeriesSegments.value.length > 0 ? lineSeriesSegments.value : [[]]).map((segmentData, index) => ({
      name: props.dataKey,
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      large: false,
      data: segmentData,
      lineStyle: { width: 2 },
      markArea: index === 0 ? {
        silent: true,
        itemStyle: {
          opacity: 0.1
        },
        label: {
          show: true,
          position: 'insideTop',
          align: 'center',
          verticalAlign: 'top',
          distance: 0,
          color: t.markAreaLabel,
          fontFamily: 'monospace',
          fontSize: 10
        },
        data: showHighlights ? telemetry.lapMarkAreas : []
      } : undefined
    }))
  }
})

/**
 * @brief Chart plot width in pixels for wheel-to-pan scaling.
 * @returns {number}
 */
const getChartWidthPx = () => {
  if (chart.value && typeof chart.value.getWidth === 'function') {
    const w = chart.value.getWidth()
    if (w > 0) return w
  }
  return containerRef.value?.clientWidth ?? 0
}

/**
 * @brief Apply batched trackpad pan on this chart only (ECharts group syncs the rest).
 * @param {number} offsetMs - Batched pan offset for the current animation frame
 */
const applyBatchedWheelPan = (offsetMs) => {
  if (!chart.value) return
  dispatchChartPan(chart.value, offsetMs, {
    earliestTime: telemetry.earliestTime,
    latestTime: telemetry.latestTime || Date.now()
  })
}

/** @brief Cached visible window (ms) for wheel scaling; refreshed once per wheel burst. */
let cachedVisibleDurationMs = null

/**
 * @brief Handle wheel: horizontal trackpad pan, vertical page scroll, modifiers to ECharts.
 * @param {WheelEvent} e - Wheel event
 */
const handleWheel = (e) => {
  const hasModifier = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey
  if (hasModifier) {
    cachedVisibleDurationMs = null
    return
  }

  if (isHorizontalWheel(e)) {
    e.preventDefault()
    e.stopPropagation()

    if (!chart.value) return

    if (cachedVisibleDurationMs == null) {
      const axis = chart.value.getOption()?.dataZoom?.[0]
      cachedVisibleDurationMs = getVisibleDurationMs(
        axis,
        telemetry.earliestTime,
        telemetry.latestTime || Date.now()
      )
    }

    const offsetMs = wheelDeltaXToPanMs(
      e.deltaX,
      cachedVisibleDurationMs,
      getChartWidthPx()
    )
    if (offsetMs !== 0) {
      scheduleWheelPan(offsetMs, applyBatchedWheelPan)
    }
    return
  }

  cachedVisibleDurationMs = null
  // Vertical wheel without modifiers: do not let ECharts consume it (page/list scroll)
  e.stopPropagation()
}
</script>

<template>
  <div
    ref="containerRef"
    class="telemetry-graph-container relative overflow-hidden"
    :style="{ height: height ? (typeof height === 'number' ? height + 'px' : height) : telemetry.graphSettings.graphHeight + 'px' }">
    <h3 v-if="showTitle" class="absolute top-2 left-4 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400 z-10">{{
      telemetry.getDisplayName(dataKey) }}</h3>
    <VChart ref="chart" class="w-full h-full" :option="option" autoresize :group="group" />
  </div>
</template>

<style scoped>
.telemetry-graph-container {
  overscroll-behavior-x: contain;
}
</style>
