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
 * @brief Process zoom requests from the telemetry store.
 * @description Handles: 'reset' (unlock to live), 'absolute' (specific range),
 *              'pan' (offset by time), 'scale' (zoom in/out).
 * @param {Object|null} payload - Zoom request or null to use store value
 */
const processZoom = (payload) => {
  const req = payload || telemetry.chartZoomRequest
  if (req && chart.value) {
    if (req.type === 'reset') {
      // Unlock: Show latest data but maintain current window size
      try {
        const currentOption = chart.value.getOption()
        const axis = currentOption.dataZoom && currentOption.dataZoom[0]

        let sizePercent = 10 // Default fallback

        if (axis) {
          const startVal = axis.startValue
          const endVal = axis.endValue

          if (startVal !== undefined && endVal !== undefined && typeof startVal === 'number' && typeof endVal === 'number') {
            const duration = endVal - startVal
            const totalDuration = (telemetry.latestTime || Date.now()) - (telemetry.earliestTime || 0)
            if (totalDuration > 0) {
              sizePercent = (duration / totalDuration) * 100
            }
          } else if (axis.start !== undefined && axis.end !== undefined) {
            sizePercent = axis.end - axis.start
          }
        }

        // Clamp
        if (isNaN(sizePercent) || sizePercent <= 0) sizePercent = 10
        if (sizePercent > 100) sizePercent = 100
        if (sizePercent < 0.1) sizePercent = 0.1

        chart.value.dispatchAction({
          type: 'dataZoom',
          start: 100 - sizePercent,
          end: 100
        })

      } catch (e) {
        console.error('Zoom calc failed, using fallback', e)
        chart.value.dispatchAction({
          type: 'dataZoom',
          start: 90,
          end: 100
        })
      }
    } else if (req.type === 'absolute') {
      chart.value.dispatchAction({
        type: 'dataZoom',
        startValue: req.start,
        endValue: req.end
      })
    } else if (req.type === 'pan') {
      dispatchChartPan(chart.value, req.offsetMs, {
        earliestTime: telemetry.earliestTime,
        latestTime: telemetry.latestTime || Date.now()
      })
      telemetry.chartZoomRequest = null
    } else if (req.type === 'scale') {
      try {
        const currentOption = chart.value.getOption()
        const axis = currentOption.dataZoom && currentOption.dataZoom[0]

        if (axis && axis.startValue !== undefined && axis.endValue !== undefined) {
          const duration = axis.endValue - axis.startValue
          const center = axis.startValue + (duration / 2)
          const newDuration = duration * req.factor
          const start = center - (newDuration / 2)
          const end = center + (newDuration / 2)

          chart.value.dispatchAction({
            type: 'dataZoom',
            startValue: start,
            endValue: end
          })
        } else {
          const totalDuration = (telemetry.latestTime || Date.now()) - (telemetry.earliestTime || 0)

          if (totalDuration > 0 && axis) {
            let startP = axis.start !== undefined ? axis.start : 0
            let endP = axis.end !== undefined ? axis.end : 100
            const durationP = endP - startP
            const centerP = startP + (durationP / 2)
            const newDurationP = durationP * req.factor

            startP = centerP - (newDurationP / 2)
            endP = centerP + (newDurationP / 2)

            if (startP < 0) startP = 0
            if (endP > 100) endP = 100
            if (endP - startP < 0.1) {
              const center = (startP + endP) / 2
              startP = center - 0.05
              endP = center + 0.05
            }

            chart.value.dispatchAction({
              type: 'dataZoom',
              start: startP,
              end: endP
            })
          }
        }
      } catch (e) {
        console.error('Scale failed', e)
      }
      telemetry.chartZoomRequest = null
    }

    if (req.type === 'reset') {
      telemetry.chartZoomRequest = null
    }
  }
}

// Watch for zoom requests
watch(() => telemetry.chartZoomRequest, (req) => {
  if (req) {
    requestAnimationFrame(() => processZoom(req))
  }
})

onMounted(() => {
  if (telemetry.chartZoomRequest) {
    processZoom()
  }
  if (containerRef.value) {
    containerRef.value.addEventListener('wheel', handleWheel, { capture: true, passive: false })
  }
})

onUnmounted(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('wheel', handleWheel, { capture: true })
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
