<!--
  @file components/MasterZoom.vue
  @brief Master zoom slider component for synchronized chart control.
  @description Provides a slider-based dataZoom control that syncs across
               all ECharts instances in the same group. Displays time axis
               and allows range selection.
-->
<script setup>
/**
 * @description Master zoom component for graph range selection.
 * 
 * Features:
 * - Slider-based time range selection
 * - Syncs with all charts in the same ECharts group
 * - Handles absolute zoom requests from store
 * - Minimal styling without data display (just timestamps)
 * 
 * Props:
 * - data: Array of telemetry data points (for time range)
 * - dataRevision: Monotonic revision used to invalidate computed data on in-place pushes
 * - group: ECharts group name for synchronization
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
import { useSettingsStore } from '../stores/settings'
import { getChartTokens } from '../constants/chartTheme'
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  DataZoomComponent,
  TooltipComponent
} from "echarts/components";
import VChart from "vue-echarts";

// Register ECharts components
use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  DataZoomComponent,
  TooltipComponent
]);

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
  /** @brief ECharts group name for synchronization */
  group: {
    type: String,
    required: true
  }
})

const telemetry = useTelemetryStore()
const settings = useSettingsStore()
const chartRef = ref(null)
const MAX_ZOOM_POINTS = 500

/**
 * @brief Resolve shared telemetry time bounds used by all graphs.
 * @returns {{start: number, end: number} | null} Shared bounds in ms
 */
const getSharedTimeBounds = () => {
  const earliest = Number(telemetry.earliestTime)
  const latest = Number(telemetry.latestTime || Date.now())
  if (Number.isFinite(earliest) && Number.isFinite(latest) && latest > earliest) {
    return { start: earliest, end: latest }
  }

  if (zoomSeriesData.value.length > 1) {
    const first = Number(zoomSeriesData.value[0]?.[0])
    const last = Number(zoomSeriesData.value[zoomSeriesData.value.length - 1]?.[0])
    if (Number.isFinite(first) && Number.isFinite(last) && last > first) {
      return { start: first, end: last }
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

  let clampedStart = Math.max(bounds.start, start)
  let clampedEnd = Math.min(bounds.end, end)
  if (clampedEnd <= clampedStart) return null
  return { start: clampedStart, end: clampedEnd }
}

/**
 * @brief Convert chart dataZoom axis state into absolute timestamp window.
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
 * @brief Persist the current slider window as the shared absolute zoom window.
 */
const syncWindowFromChart = () => {
  if (!chartRef.value) return
  const bounds = getSharedTimeBounds()
  if (!bounds) return
  const axis = chartRef.value.getOption()?.dataZoom?.[0]
  const window = resolveAxisAbsoluteWindow(axis, bounds)
  if (window) {
    telemetry.setCurrentZoomWindow?.(window.start, window.end)
  }
}

/**
 * @brief Build a bounded point set for slider rendering.
 * @description Keeps zoom slider responsive by decimating large history arrays.
 */
const zoomSeriesData = computed(() => {
  void props.dataRevision
  const points = props.data
  if (!Array.isArray(points) || points.length === 0) return []
  if (points.length <= MAX_ZOOM_POINTS) {
    return points.map(item => [item.timestamp, 0])
  }
  const step = Math.ceil(points.length / MAX_ZOOM_POINTS)
  const decimated = []
  for (let i = 0; i < points.length; i += step) {
    decimated.push([points[i].timestamp, 0])
  }
  const last = points[points.length - 1]
  if (decimated[decimated.length - 1]?.[0] !== last.timestamp) {
    decimated.push([last.timestamp, 0])
  }
  return decimated
})

/**
 * @brief Apply an absolute window to the master zoom slider and persist it globally.
 * @param {{start: number, end: number} | null} window - Absolute window in ms
 * @returns {boolean} True when a zoom dispatch was emitted
 */
const applyAbsoluteWindow = (window) => {
  if (!chartRef.value || !window) return false
  chartRef.value.dispatchAction({
    type: 'dataZoom',
    startValue: window.start,
    endValue: window.end
  })
  telemetry.setCurrentZoomWindow?.(window.start, window.end)
  return true
}

/**
 * @brief When history reloads without a persisted window, show the full loaded span on the slider.
 */
const applyFullRangeIfUnlocked = () => {
  if (telemetry.currentZoomWindowMs) return
  const bounds = getSharedTimeBounds()
  if (bounds) {
    applyAbsoluteWindow(bounds)
  }
}

/**
 * @brief Process zoom requests from the telemetry store.
 */
const processZoom = () => {
  const req = telemetry.chartZoomRequest
  if (!req || !chartRef.value) return

  const bounds = getSharedTimeBounds()
  if (!bounds) {
    telemetry.chartZoomRequest = null
    return
  }

  let targetWindow = null
  if (req.type === 'absolute') {
    targetWindow = clampAbsoluteWindow(req.start, req.end, bounds)
  } else if (req.type === 'reset') {
    targetWindow = bounds
  }

  if (targetWindow) {
    applyAbsoluteWindow(targetWindow)
  }
  telemetry.chartZoomRequest = null
}

// Watch for zoom requests
watch(() => telemetry.chartZoomRequest, (req) => {
  if (req) {
    processZoom()
  }
})

watch(() => props.dataRevision, () => {
  requestAnimationFrame(() => {
    applyFullRangeIfUnlocked()
  })
})

onMounted(() => {
  if (chartRef.value && typeof chartRef.value.on === 'function') {
    chartRef.value.on('datazoom', syncWindowFromChart)
  }
  requestAnimationFrame(() => {
    const bounds = getSharedTimeBounds()
    const persisted = telemetry.currentZoomWindowMs
      ? clampAbsoluteWindow(telemetry.currentZoomWindowMs.start, telemetry.currentZoomWindowMs.end, bounds)
      : null
    if (persisted && chartRef.value) {
      chartRef.value.dispatchAction({
        type: 'dataZoom',
        startValue: persisted.start,
        endValue: persisted.end
      })
      telemetry.setCurrentZoomWindow?.(persisted.start, persisted.end)
    }
    processZoom()
    syncWindowFromChart()
  })
})

onUnmounted(() => {
  if (chartRef.value && typeof chartRef.value.off === 'function') {
    chartRef.value.off('datazoom', syncWindowFromChart)
  }
})

/**
 * @brief ECharts option configuration for zoom slider.
 * @type {ComputedRef<Object>}
 */
const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const timeBounds = getSharedTimeBounds()
  return {
    animation: false,
    grid: {
      left: 60,
      right: 20,
      top: 5,
      bottom: 35
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      min: timeBounds ? timeBounds.start : undefined,
      max: timeBounds ? timeBounds.end : undefined,
      axisLabel: {
        show: true,
        formatter: '{HH}:{mm}:{ss}',
        color: t.axisLabel,
        margin: 8
      },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      show: false,
      min: 0,
      max: 1
    },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'empty',
        height: 30,
        bottom: 5,
        borderColor: t.zoomBorder,
        textStyle: { color: t.zoomText },
        handleStyle: { color: t.zoomHandle },
        dataBackground: {
          lineStyle: { color: t.zoomDataLine },
          areaStyle: { color: t.zoomDataArea }
        },
        selectedDataBackground: {
          lineStyle: { color: t.zoomSelectedLine },
          areaStyle: { color: t.zoomSelectedArea }
        }
      }
    ],
    series: [
      {
        type: 'line',
        data: zoomSeriesData.value,
        showSymbol: false,
        lineStyle: { opacity: 0 }
      }
    ]
  }
})
</script>

<template>
  <div class="h-16 bg-zinc-100 dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-800 flex items-center w-full px-4">
    <div class="w-full h-full">
      <VChart ref="chartRef" class="w-full h-full" :option="option" autoresize :group="group" />
    </div>
  </div>
</template>
