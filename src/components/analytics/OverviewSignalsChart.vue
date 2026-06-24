<!--
  @file components/analytics/OverviewSignalsChart.vue
  @brief Pack voltage and current timeline with optional overlay signals for Overview.
-->
<script setup>
import { computed, defineEmits, defineProps } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useSettingsStore } from '../../stores/settings'
import { getChartTokens, getMetricColorMap, getTimeAxisDataZoom } from '../../constants/chartTheme'
import { METRIC_PRECISION } from '../../utils/metricPrecision'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent])

const props = defineProps({
  /** @brief Timeline points from buildOverviewSignalsTimeline. */
  series: {
    type: Array,
    default: () => []
  },
  /** @brief Enabled overlay channel ids (temp1, temp2, speed, throttle). */
  overlays: {
    type: Array,
    default: () => []
  },
  /** @brief Speed unit for axis label and tooltip. */
  speedUnit: {
    type: String,
    default: 'mph'
  }
})

const emit = defineEmits(['update:overlays'])

const settings = useSettingsStore()

/** @brief Optional overlay channel toggles. */
const overlayOptions = Object.freeze([
  { id: 'temp1', label: 'Temp 1' },
  { id: 'temp2', label: 'Temp 2' },
  { id: 'speed', label: 'Speed' },
  { id: 'throttle', label: 'Throttle' }
])

/**
 * @brief Resolve speed unit suffix for labels.
 * @returns {string} Unit suffix
 */
function speedUnitSuffix() {
  if (props.speedUnit === 'kph') return 'kph'
  if (props.speedUnit === 'ms') return 'm/s'
  return 'mph'
}

/**
 * @brief Toggle an optional overlay channel on or off.
 * @param {string} channelId - Overlay channel id
 */
function toggleOverlay(channelId) {
  const active = new Set(Array.isArray(props.overlays) ? props.overlays : [])
  if (active.has(channelId)) {
    active.delete(channelId)
  } else {
    active.add(channelId)
  }
  emit('update:overlays', [...active])
}

/**
 * @brief Build a line series from timeline points.
 * @param {Object} config - Series configuration
 * @returns {Object|null} ECharts line series or null when empty
 */
function buildLineSeries({ name, color, yAxisIndex, key }) {
  const timeline = Array.isArray(props.series) ? props.series : []
  const data = timeline
    .filter((entry) => Number.isFinite(entry?.timestamp) && Number.isFinite(entry?.[key]))
    .map((entry) => [entry.timestamp, entry[key]])

  if (data.length === 0) return null

  return {
    name,
    type: 'line',
    color,
    yAxisIndex,
    showSymbol: false,
    lineStyle: { width: name === 'Pack Voltage' || name === 'Current' ? 2 : 1.5, color },
    data
  }
}

const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const colors = getMetricColorMap(settings.resolvedTheme)
  const activeOverlays = new Set(Array.isArray(props.overlays) ? props.overlays : [])
  const showTemp = activeOverlays.has('temp1') || activeOverlays.has('temp2')
  const showSpeed = activeOverlays.has('speed')
  const showThrottle = activeOverlays.has('throttle')

  const yAxis = [
    {
      type: 'value',
      name: 'Voltage (V)',
      scale: true,
      position: 'left',
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { lineStyle: { color: t.grid } }
    },
    {
      type: 'value',
      name: 'Current (A)',
      scale: true,
      position: 'right',
      offset: 0,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { show: false }
    }
  ]

  let rightOffset = 48
  const axisIndexByOverlay = {
    temp1: null,
    temp2: null,
    speed: null,
    throttle: null
  }

  if (showTemp) {
    axisIndexByOverlay.temp1 = yAxis.length
    axisIndexByOverlay.temp2 = yAxis.length
    yAxis.push({
      type: 'value',
      name: 'Temp (°C)',
      scale: true,
      position: 'right',
      offset: rightOffset,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { show: false }
    })
    rightOffset += 48
  }

  if (showSpeed) {
    axisIndexByOverlay.speed = yAxis.length
    yAxis.push({
      type: 'value',
      name: `Speed (${speedUnitSuffix()})`,
      scale: true,
      position: 'right',
      offset: rightOffset,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { show: false }
    })
    rightOffset += 48
  }

  if (showThrottle) {
    axisIndexByOverlay.throttle = yAxis.length
    yAxis.push({
      type: 'value',
      name: 'Throttle (%)',
      min: 0,
      max: 100,
      position: 'right',
      offset: rightOffset,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { show: false }
    })
    rightOffset += 48
  }

  const chartSeries = [
    buildLineSeries({ name: 'Pack Voltage', color: colors.voltage, yAxisIndex: 0, key: 'voltage' }),
    buildLineSeries({ name: 'Current', color: colors.current, yAxisIndex: 1, key: 'current' })
  ]

  if (activeOverlays.has('temp1') && axisIndexByOverlay.temp1 !== null) {
    chartSeries.push(buildLineSeries({
      name: 'Temp 1',
      color: colors.temp1,
      yAxisIndex: axisIndexByOverlay.temp1,
      key: 'temp1'
    }))
  }
  if (activeOverlays.has('temp2') && axisIndexByOverlay.temp2 !== null) {
    chartSeries.push(buildLineSeries({
      name: 'Temp 2',
      color: colors.temp2,
      yAxisIndex: axisIndexByOverlay.temp2,
      key: 'temp2'
    }))
  }
  if (activeOverlays.has('speed') && axisIndexByOverlay.speed !== null) {
    chartSeries.push(buildLineSeries({
      name: 'Speed',
      color: colors.speed,
      yAxisIndex: axisIndexByOverlay.speed,
      key: 'speed'
    }))
  }
  if (activeOverlays.has('throttle') && axisIndexByOverlay.throttle !== null) {
    chartSeries.push(buildLineSeries({
      name: 'Throttle',
      color: colors.throttle,
      yAxisIndex: axisIndexByOverlay.throttle,
      key: 'throttle'
    }))
  }

  const series = chartSeries.filter(Boolean)
  const rightMargin = Math.max(52, rightOffset)

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText },
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params]
        if (!items.length) return ''
        const header = items[0]?.axisValueLabel ?? items[0]?.name ?? ''
        const lines = items.map((item) => {
          const raw = Array.isArray(item.value) ? item.value[1] : item.value
          if (!Number.isFinite(raw)) return `${item.marker}${item.seriesName}: -`
          if (item.seriesName === 'Pack Voltage') {
            return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(METRIC_PRECISION.voltage)} V`
          }
          if (item.seriesName === 'Current') {
            return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(METRIC_PRECISION.current)} A`
          }
          if (item.seriesName.startsWith('Temp')) {
            return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(1)} °C`
          }
          if (item.seriesName === 'Speed') {
            return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(1)} ${speedUnitSuffix()}`
          }
          if (item.seriesName === 'Throttle') {
            return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(0)}%`
          }
          return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(2)}`
        })
        return header ? `${header}<br/>${lines.join('<br/>')}` : lines.join('<br/>')
      }
    },
    legend: {
      top: 0,
      textStyle: { color: t.axisLabel }
    },
    grid: { top: 32, left: 52, right: rightMargin, bottom: 44 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { lineStyle: { color: t.grid } }
    },
    dataZoom: getTimeAxisDataZoom(t),
    yAxis,
    series
  }
})

/** @brief True when primary voltage or current traces are available. */
const hasData = computed(() => {
  const timeline = Array.isArray(props.series) ? props.series : []
  return timeline.some((entry) => Number.isFinite(entry?.voltage) || Number.isFinite(entry?.current))
})
</script>

<template>
  <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
        Pack Voltage &amp; Current
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="entry in overlayOptions"
          :key="entry.id"
          type="button"
          class="px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors"
          :class="overlays.includes(entry.id)
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-zinc-300 dark:border-neutral-600 text-zinc-600 dark:text-gray-400 hover:border-zinc-400'"
          @click="toggleOverlay(entry.id)"
        >
          + {{ entry.label }}
        </button>
      </div>
    </div>

    <div v-if="!hasData" class="h-64 flex items-center justify-center text-sm text-zinc-500 dark:text-gray-500 italic">
      No voltage or current data in this window.
    </div>
    <VChart v-else class="h-64 w-full" :option="option" autoresize />
    <div class="mt-2 text-[11px] text-zinc-500 dark:text-gray-400">
      Pack voltage and current are always plotted. Toggle optional overlays to compare temperature, speed, or throttle on additional axes.
    </div>
  </div>
</template>
