<!--
  @file components/analytics/OverviewLapTrendChart.vue
  @brief Multi-series per-lap trend chart for Analytics Overview (time, Ah, efficiency).
-->
<script setup>
import { computed, defineProps } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useSettingsStore } from '../../stores/settings'
import { getChartTokens, getMetricColorMap } from '../../constants/chartTheme'
import { METRIC_PRECISION } from '../../utils/metricPrecision'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps({
  /** @brief Lap-time degradation payload from computeLapDegradation. */
  lapTime: {
    type: Object,
    default: () => ({ points: [] })
  },
  /** @brief Lap-Ah degradation payload from computeLapDegradation. */
  lapAh: {
    type: Object,
    default: () => ({ points: [] })
  },
  /** @brief Lap-efficiency degradation payload from computeLapDegradation. */
  lapEfficiency: {
    type: Object,
    default: () => ({ points: [] })
  }
})

const settings = useSettingsStore()

/**
 * @brief Build ECharts line series from lap degradation points.
 * @param {string} name - Series legend label
 * @param {string} color - Line color hex
 * @param {number} yAxisIndex - Left (0) or right (1) axis index
 * @param {Object} degradation - Degradation payload with points array
 * @returns {Object|null} ECharts series option or null when empty
 */
function buildLapSeries(name, color, yAxisIndex, degradation) {
  const points = Array.isArray(degradation?.points) ? degradation.points : []
  const data = points
    .filter((point) => Number.isFinite(point?.lapNumber) && Number.isFinite(point?.value))
    .map((point) => [point.lapNumber, point.value])

  if (data.length === 0) return null

  return {
    name,
    type: 'line',
    color,
    yAxisIndex,
    showSymbol: data.length <= 24,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2, color },
    itemStyle: { color, borderColor: color, borderWidth: 1 },
    emphasis: { focus: 'series' },
    data
  }
}

const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const colors = getMetricColorMap(settings.resolvedTheme)

  const lapTimeSeries = buildLapSeries('Lap Time (s)', colors.speed, 0, props.lapTime)
  const lapAhSeries = buildLapSeries('Lap Ah', colors.ampH, 1, props.lapAh)
  const lapEffSeries = buildLapSeries('Lap Efficiency', colors.throttle, 1, props.lapEfficiency)
  const series = [lapTimeSeries, lapAhSeries, lapEffSeries].filter(Boolean)

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
        const lapLabel = Number.isFinite(items[0]?.axisValue) ? `Lap ${items[0].axisValue}` : items[0]?.name
        const lines = items.map((item) => {
          const raw = Array.isArray(item.value) ? item.value[1] : item.value
          if (!Number.isFinite(raw)) return `${item.marker}${item.seriesName}: -`
          const isTime = item.seriesName.includes('Time')
          const digits = isTime ? 2 : METRIC_PRECISION.current
          const unit = isTime ? ' s' : ''
          return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(digits)}${unit}`
        })
        return lapLabel ? `${lapLabel}<br/>${lines.join('<br/>')}` : lines.join('<br/>')
      }
    },
    legend: {
      top: 0,
      textStyle: { color: t.axisLabel }
    },
    grid: { top: 32, left: 52, right: 52, bottom: 28 },
    xAxis: {
      type: 'value',
      name: 'Lap',
      nameTextStyle: { color: t.axisLabel },
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { lineStyle: { color: t.grid } }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Time (s)',
        scale: true,
        axisLine: { lineStyle: { color: t.axisLine } },
        axisLabel: { color: t.axisLabel },
        splitLine: { lineStyle: { color: t.grid } }
      },
      {
        type: 'value',
        name: 'Ah / Eff',
        scale: true,
        axisLine: { lineStyle: { color: t.axisLine } },
        axisLabel: { color: t.axisLabel },
        splitLine: { show: false }
      }
    ],
    series
  }
})

/** @brief True when at least one lap series has plotted points. */
const hasData = computed(() => {
  const payloads = [props.lapTime, props.lapAh, props.lapEfficiency]
  return payloads.some((payload) => Array.isArray(payload?.points) && payload.points.length > 0)
})
</script>

<template>
  <div class="rounded border border-zinc-200 dark:border-neutral-700 p-2">
    <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">
      Lap Trends (Time / Ah / Efficiency)
    </div>
    <div v-if="!hasData" class="h-40 flex items-center justify-center text-sm text-zinc-500 dark:text-gray-500 italic">
      No lap data in this window.
    </div>
    <VChart v-else class="h-44 w-full" :option="option" autoresize />
  </div>
</template>
