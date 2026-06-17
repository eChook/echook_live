<!--
  @file components/analytics/AnalyticsVoltageWindowChart.vue
  @brief Full-buffer voltage chart for picking analytics window boundaries.
-->
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useSettingsStore } from '../../stores/settings'
import { getChartTokens, getMetricColorMap, getTimeAxisDataZoom } from '../../constants/chartTheme'
import { METRIC_PRECISION } from '../../utils/metricPrecision'
import {
  applyDraggedMarker,
  buildVoltageChartSeries,
  snapToNearestSampleTimestamp
} from '../../utils/analyticsWindow'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, MarkLineComponent, DataZoomComponent])

const props = defineProps({
  /** @brief Full telemetry display history for the loaded buffer. */
  samples: {
    type: Array,
    default: () => []
  },
  /** @brief Selected window start timestamp (ms). */
  startMs: {
    type: Number,
    default: null
  },
  /** @brief Selected window end timestamp (ms); ignored when end selection disabled. */
  endMs: {
    type: Number,
    default: null
  },
  /** @brief When false, chart clicks only move the start marker (live mode). */
  allowEndSelection: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:startMs', 'update:endMs'])

const settings = useSettingsStore()
const chartRef = ref(null)

/** @brief Nearest-marker pick threshold in milliseconds for click placement. */
const MARKER_HIT_MS = 2500
/** @brief Pixel tolerance when hit-testing draggable marker handles. */
const MARKER_HIT_PX = 14

/** @brief Active drag target (`start`, `end`, or null). */
const dragTarget = ref(null)
/** @brief True after a drag gesture so the click handler is skipped. */
const didDrag = ref(false)
/** @brief Cursor style while hovering or dragging markers. */
const chartCursor = ref('crosshair')

/**
 * @brief Build markLine entries for start/end window markers.
 * @param {number|null} startMs - Start marker timestamp
 * @param {number|null} endMs - End marker timestamp
 * @param {boolean} showEnd - Whether to render the end marker
 * @returns {Array<Object>} ECharts markLine data entries
 */
function buildWindowMarkLines(startMs, endMs, showEnd) {
  const lines = []
  if (Number.isFinite(startMs)) {
    lines.push({
      name: 'Start',
      xAxis: startMs,
      lineStyle: { color: '#10b981', width: 2 },
      label: { formatter: 'Start', color: '#10b981', fontWeight: 'bold' }
    })
  }
  if (showEnd && Number.isFinite(endMs)) {
    lines.push({
      name: 'End',
      xAxis: endMs,
      lineStyle: { color: '#ef4444', width: 2 },
      label: { formatter: 'End', color: '#ef4444', fontWeight: 'bold' }
    })
  }
  return lines
}

const voltageSeriesData = computed(() => buildVoltageChartSeries(props.samples))

const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const colors = getMetricColorMap(settings.resolvedTheme)
  const markLineData = buildWindowMarkLines(
    props.startMs,
    props.endMs,
    props.allowEndSelection
  )

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText },
      valueFormatter: (value) => {
        if (!Number.isFinite(value)) return '-'
        return Number(value).toFixed(METRIC_PRECISION.voltage)
      }
    },
    grid: { top: 16, left: 52, right: 20, bottom: 44 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: {
        color: t.axisLabel,
        formatter: '{HH}:{mm}:{ss}'
      },
      splitLine: { lineStyle: { color: t.grid } }
    },
    dataZoom: getTimeAxisDataZoom(t, { moveOnMouseMove: false }),
    yAxis: {
      type: 'value',
      name: 'Voltage (V)',
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { lineStyle: { color: t.grid } }
    },
    series: [
      {
        name: 'Pack Voltage',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color: colors.voltage },
        data: voltageSeriesData.value,
        markLine: markLineData.length > 0
          ? {
              symbol: ['none', 'none'],
              silent: true,
              data: markLineData
            }
          : undefined
      }
    ]
  }
})

/**
 * @brief Resolve ECharts instance from vue-echarts ref.
 * @returns {Object|null} ECharts chart instance
 */
function getChart() {
  return chartRef.value?.chart ?? null
}

/**
 * @brief Convert marker timestamp to canvas x pixel.
 * @param {Object} chart - ECharts instance
 * @param {number} timestampMs - Marker timestamp
 * @returns {number|null} X pixel coordinate
 */
function markerToPixelX(chart, timestampMs) {
  if (!chart || !Number.isFinite(timestampMs)) return null
  const pixel = chart.convertToPixel({ seriesIndex: 0 }, [timestampMs, 0])
  if (!Array.isArray(pixel) || !Number.isFinite(pixel[0])) return null
  return pixel[0]
}

/**
 * @brief Hit-test pointer position against draggable start/end markers.
 * @param {number} offsetX - Pointer x in chart canvas
 * @returns {'start'|'end'|null} Marker under pointer, if any
 */
function hitTestMarker(offsetX) {
  const chart = getChart()
  if (!chart) return null

  const hits = []
  if (Number.isFinite(props.startMs)) {
    const x = markerToPixelX(chart, props.startMs)
    if (x !== null && Math.abs(offsetX - x) <= MARKER_HIT_PX) {
      hits.push({ marker: 'start', distance: Math.abs(offsetX - x) })
    }
  }
  if (props.allowEndSelection && Number.isFinite(props.endMs)) {
    const x = markerToPixelX(chart, props.endMs)
    if (x !== null && Math.abs(offsetX - x) <= MARKER_HIT_PX) {
      hits.push({ marker: 'end', distance: Math.abs(offsetX - x) })
    }
  }

  if (hits.length === 0) return null
  hits.sort((a, b) => a.distance - b.distance)
  return hits[0].marker
}

/**
 * @brief Emit updated marker timestamps after drag or click.
 * @param {{startMs: number|null, endMs: number|null}} next - Marker values
 */
function emitMarkers(next) {
  emit('update:startMs', Number.isFinite(next.startMs) ? next.startMs : null)
  if (props.allowEndSelection) {
    emit('update:endMs', Number.isFinite(next.endMs) ? next.endMs : null)
  }
}

/**
 * @brief Snap pointer x position to the nearest sample timestamp.
 * @param {number} offsetX - Pointer x in chart canvas
 * @returns {number|null} Snapped timestamp in ms
 */
function snapPointerToTimestamp(offsetX) {
  const chart = getChart()
  if (!chart || !Array.isArray(props.samples) || props.samples.length === 0) return null

  const converted = chart.convertFromPixel({ seriesIndex: 0 }, [offsetX, 0])
  const candidateMs = Array.isArray(converted) ? Number(converted[0]) : Number(converted)
  if (!Number.isFinite(candidateMs)) return null
  return snapToNearestSampleTimestamp(candidateMs, props.samples)
}

/**
 * @brief Apply drag position for the active marker handle.
 * @param {number} offsetX - Pointer x while dragging
 */
function applyDragAtPixel(offsetX) {
  const snappedMs = snapPointerToTimestamp(offsetX)
  if (!Number.isFinite(snappedMs) || !dragTarget.value) return

  const next = applyDraggedMarker(
    dragTarget.value,
    snappedMs,
    props.startMs,
    props.endMs,
    props.samples,
    props.allowEndSelection
  )
  emitMarkers(next)
}

/**
 * @brief Resolve which marker is closer to a snapped click timestamp.
 * @param {number} snappedMs - Snapped sample timestamp
 * @returns {'start'|'end'} Nearest handle id
 */
function resolveNearestMarker(snappedMs) {
  const startDist = Number.isFinite(props.startMs) ? Math.abs(snappedMs - props.startMs) : Infinity
  const endDist = Number.isFinite(props.endMs) ? Math.abs(snappedMs - props.endMs) : Infinity
  return startDist <= endDist ? 'start' : 'end'
}

/**
 * @brief Apply a chart click as a start or end window adjustment.
 * @param {number} snappedMs - Snapped sample timestamp from click
 */
function applyChartSelection(snappedMs) {
  if (!props.allowEndSelection) {
    emit('update:startMs', snappedMs)
    return
  }

  const hasStart = Number.isFinite(props.startMs)
  const hasEnd = Number.isFinite(props.endMs)
  const nearStart = hasStart && Math.abs(snappedMs - props.startMs) <= MARKER_HIT_MS
  const nearEnd = hasEnd && Math.abs(snappedMs - props.endMs) <= MARKER_HIT_MS

  if (nearStart || nearEnd) {
    const target = nearStart && nearEnd
      ? resolveNearestMarker(snappedMs)
      : (nearStart ? 'start' : 'end')
    const next = applyDraggedMarker(
      target,
      snappedMs,
      props.startMs,
      props.endMs,
      props.samples,
      true
    )
    emitMarkers(next)
    return
  }

  if (!hasStart || (hasStart && hasEnd && snappedMs < props.startMs)) {
    const next = applyDraggedMarker('start', snappedMs, props.startMs, props.endMs, props.samples, true)
    emitMarkers(next)
    return
  }

  if (!hasEnd || snappedMs > props.startMs) {
    const next = applyDraggedMarker('end', snappedMs, props.startMs, props.endMs, props.samples, true)
    emitMarkers(next)
  }
}

/**
 * @brief Handle canvas click and map pixel position to snapped sample time.
 * @param {Object} event - ZRender pointer event
 */
function handleChartClick(event) {
  if (didDrag.value) {
    didDrag.value = false
    return
  }
  if (dragTarget.value) return

  const chart = getChart()
  if (!chart || !Array.isArray(props.samples) || props.samples.length === 0) return

  const snappedMs = snapPointerToTimestamp(event.offsetX)
  if (!Number.isFinite(snappedMs)) return
  applyChartSelection(snappedMs)
}

/**
 * @brief Begin dragging when pointer down hits a marker handle.
 * @param {Object} event - ZRender pointer event
 */
function handlePointerDown(event) {
  const marker = hitTestMarker(event.offsetX)
  if (!marker) return
  if (!props.allowEndSelection && marker === 'end') return

  dragTarget.value = marker
  didDrag.value = false
  chartCursor.value = 'col-resize'
}

/**
 * @brief Drag active marker along the time axis.
 * @param {Object} event - ZRender pointer event
 */
function handlePointerMove(event) {
  const marker = dragTarget.value || hitTestMarker(event.offsetX)
  if (!dragTarget.value) {
    chartCursor.value = marker ? 'col-resize' : 'crosshair'
    return
  }

  didDrag.value = true
  chartCursor.value = 'col-resize'
  applyDragAtPixel(event.offsetX)
}

/**
 * @brief End marker drag and restore default cursor.
 */
function handlePointerUp() {
  dragTarget.value = null
  chartCursor.value = 'crosshair'
}

/** @brief Attach ZRender pointer handlers when chart instance is ready. */
function bindChartHandlers() {
  const zr = getChart()?.getZr?.()
  if (!zr) return

  zr.off('click', handleChartClick)
  zr.off('mousedown', handlePointerDown)
  zr.off('mousemove', handlePointerMove)
  zr.off('mouseup', handlePointerUp)
  zr.off('globalout', handlePointerUp)

  zr.on('click', handleChartClick)
  zr.on('mousedown', handlePointerDown)
  zr.on('mousemove', handlePointerMove)
  zr.on('mouseup', handlePointerUp)
  zr.on('globalout', handlePointerUp)
}

function unbindChartHandlers() {
  const zr = getChart()?.getZr?.()
  if (!zr) return
  zr.off('click', handleChartClick)
  zr.off('mousedown', handlePointerDown)
  zr.off('mousemove', handlePointerMove)
  zr.off('mouseup', handlePointerUp)
  zr.off('globalout', handlePointerUp)
}

onMounted(() => {
  bindChartHandlers()
})

onUnmounted(() => {
  unbindChartHandlers()
})

watch(() => props.samples.length, () => {
  bindChartHandlers()
})

watch([() => props.startMs, () => props.endMs], () => {
  bindChartHandlers()
})
</script>

<template>
  <div class="rounded border border-zinc-200 dark:border-neutral-700 p-3">
    <p class="text-[11px] text-zinc-500 dark:text-gray-400 mb-2">
      Click the trace to place markers, or drag
      <template v-if="allowEndSelection">start/end</template>
      <template v-else>start</template>
      handles.
      Scroll to pan the time axis; drag the range slider to zoom. Ctrl+scroll also zooms.
    </p>
    <VChart
      ref="chartRef"
      class="h-72 w-full"
      :style="{ cursor: chartCursor }"
      :option="option"
      autoresize
      @finished="bindChartHandlers"
    />
  </div>
</template>
