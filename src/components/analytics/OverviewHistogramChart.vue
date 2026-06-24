<!--
  @file components/analytics/OverviewHistogramChart.vue
  @brief Channel distribution histogram (time % vs energy %) for Analytics Overview.
-->
<script setup>
import { computed, defineEmits, defineProps } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useSettingsStore } from '../../stores/settings'
import { getChartTokens, getMetricColorMap } from '../../constants/chartTheme'
import { METRIC_PRECISION } from '../../utils/metricPrecision'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps({
  /** @brief Histogram payload from computeChannelHistogram. */
  histogram: {
    type: Object,
    default: () => ({ bins: [], channel: 'throttle' })
  },
  /** @brief Active channel key (throttle, speed, current). */
  channel: {
    type: String,
    default: 'throttle'
  }
})

const emit = defineEmits(['update:channel'])

const settings = useSettingsStore()

/** @brief Channel selector options for the histogram. */
const channelOptions = Object.freeze([
  { id: 'throttle', label: 'Throttle' },
  { id: 'speed', label: 'Speed' },
  { id: 'current', label: 'Current' }
])

/**
 * @brief Update selected histogram channel.
 * @param {string} nextChannel - Channel key
 */
function selectChannel(nextChannel) {
  if (nextChannel !== props.channel) {
    emit('update:channel', nextChannel)
  }
}

const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const colors = getMetricColorMap(settings.resolvedTheme)
  const bins = Array.isArray(props.histogram?.bins) ? props.histogram.bins : []
  const categories = bins.map((bin) => bin.label)
  const timePct = bins.map((bin) => (Number.isFinite(bin.timePct) ? bin.timePct : 0))
  const whPct = bins.map((bin) => (Number.isFinite(bin.whPct) ? bin.whPct : 0))
  const channelColor = props.channel === 'speed'
    ? colors.speed
    : props.channel === 'current'
      ? colors.current
      : colors.throttle

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
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
          return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(METRIC_PRECISION.estimatedPercent)}%`
        })
        return header ? `${header}<br/>${lines.join('<br/>')}` : lines.join('<br/>')
      }
    },
    legend: {
      top: 0,
      textStyle: { color: t.axisLabel }
    },
    grid: { top: 32, left: 48, right: 16, bottom: 28 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel, interval: 0, rotate: categories.length > 5 ? 24 : 0 }
    },
    yAxis: {
      type: 'value',
      name: '%',
      max: 100,
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { lineStyle: { color: t.grid } }
    },
    series: [
      {
        name: 'Time %',
        type: 'bar',
        color: channelColor,
        itemStyle: { color: channelColor, opacity: 0.85 },
        data: timePct
      },
      {
        name: 'Energy %',
        type: 'bar',
        color: colors.voltage,
        barGap: '20%',
        itemStyle: { color: colors.voltage, opacity: 0.85 },
        data: whPct
      }
    ]
  }
})

/** @brief True when histogram bins contain integrated time. */
const hasData = computed(() => {
  const bins = Array.isArray(props.histogram?.bins) ? props.histogram.bins : []
  return bins.some((bin) => Number.isFinite(bin.timePct) && bin.timePct > 0)
})
</script>

<template>
  <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
        Channel Distribution
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="entry in channelOptions"
          :key="entry.id"
          type="button"
          class="px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors"
          :class="channel === entry.id
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-zinc-300 dark:border-neutral-600 text-zinc-600 dark:text-gray-400 hover:border-zinc-400'"
          @click="selectChannel(entry.id)"
        >
          {{ entry.label }}
        </button>
      </div>
    </div>

    <div v-if="!hasData" class="h-52 flex items-center justify-center text-sm text-zinc-500 dark:text-gray-500 italic">
      No {{ channel }} data in this window.
    </div>
    <VChart v-else class="h-52 w-full" :option="option" autoresize />
    <div class="mt-2 text-[11px] text-zinc-500 dark:text-gray-400">
      Side-by-side bars show share of time vs share of energy per {{ channel }} band.
    </div>
  </div>
</template>
