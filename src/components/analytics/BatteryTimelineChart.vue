<!--
  @file components/analytics/BatteryTimelineChart.vue
  @brief Battery section timeline chart for voltage/current trends.
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
  MarkLineComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useSettingsStore } from '../../stores/settings'
import { getChartTokens, getMetricColorMap, getTimeAxisDataZoom } from '../../constants/chartTheme'
import { METRIC_PRECISION } from '../../utils/metricPrecision'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent])

const props = defineProps({
  series: {
    type: Array,
    default: () => []
  },
  cutoffVoltage: {
    type: Number,
    default: 9.6
  },
  /** @brief Timeline scope: combined shows all voltages; branch shows one voltage + current. */
  variant: {
    type: String,
    default: 'combined',
    validator: (value) => ['combined', 'lower', 'upper'].includes(value)
  }
})

const emit = defineEmits(['help'])

const settings = useSettingsStore()

const timelinePoints = computed(() => (Array.isArray(props.series) ? props.series : []))

const hasSmoothedVoc = computed(() => (
  timelinePoints.value.some((entry) => Number.isFinite(entry?.smoothedVoc))
))

const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const colors = getMetricColorMap(settings.resolvedTheme)
  const timeline = timelinePoints.value
  const toSeries = (key) =>
    timeline
      .filter((entry) => Number.isFinite(entry?.[key]) && Number.isFinite(entry?.timestamp))
      .map((entry) => [entry.timestamp, entry[key]])

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
          const isCurrent = item.seriesName === 'Current'
          const digits = isCurrent ? METRIC_PRECISION.current : METRIC_PRECISION.voltage
          const unit = isCurrent ? ' A' : ' V'
          return `${item.marker}${item.seriesName}: ${Number(raw).toFixed(digits)}${unit}`
        })
        return header ? `${header}<br/>${lines.join('<br/>')}` : lines.join('<br/>')
      }
    },
    legend: {
      top: 0,
      textStyle: { color: t.axisLabel }
    },
    grid: { top: 28, left: 52, right: 24, bottom: 44 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: { color: t.axisLabel },
      splitLine: { lineStyle: { color: t.grid } }
    },
    dataZoom: getTimeAxisDataZoom(t),
    yAxis: [
      {
        type: 'value',
        name: 'Voltage (V)',
        axisLine: { lineStyle: { color: t.axisLine } },
        axisLabel: { color: t.axisLabel },
        splitLine: { lineStyle: { color: t.grid } }
      },
      {
        type: 'value',
        name: 'Current (A)',
        axisLine: { lineStyle: { color: t.axisLine } },
        axisLabel: { color: t.axisLabel },
        splitLine: { show: false }
      }
    ],
    series: [
      ...(props.variant === 'combined' ? [{
        name: 'Pack Voltage',
        type: 'line',
        showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: 2, color: colors.voltage },
        data: toSeries('combinedVoltage'),
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: '#f59e0b', type: 'dashed' },
          data: [{ yAxis: props.cutoffVoltage }]
        }
      }] : []),
      ...(props.variant === 'combined' || props.variant === 'lower' ? [{
        name: props.variant === 'lower' ? 'Lower Voltage' : 'Lower Voltage',
        type: 'line',
        showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: props.variant === 'lower' ? 2 : 1.75, color: colors.voltageLower },
        data: toSeries('lowerVoltage')
      }] : []),
      ...(props.variant === 'combined' || props.variant === 'upper' ? [{
        name: props.variant === 'upper' ? 'Upper Voltage' : 'Upper Voltage',
        type: 'line',
        showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: props.variant === 'upper' ? 2 : 1.75, color: colors.voltageHigh },
        data: toSeries('upperVoltage')
      }] : []),
      ...(hasSmoothedVoc.value ? [{
        name: 'Smoothed Est. V_oc',
        type: 'line',
        showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: 1.75, color: colors.smoothedVoc },
        data: toSeries('smoothedVoc')
      }] : []),
      {
        name: 'Current',
        type: 'line',
        showSymbol: false,
        yAxisIndex: 1,
        lineStyle: { width: 1.5, color: colors.current },
        data: toSeries('current')
      }
    ]
  }
})
</script>

<template>
  <div class="rounded border border-zinc-200 dark:border-neutral-700 p-3">
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
        Voltage + Current Timeline
      </div>
      <button
        type="button"
        class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold"
        title="Voltage and current timeline help"
        aria-label="Show voltage timeline help"
        @click="emit('help')"
      >
        ?
      </button>
    </div>
    <VChart class="h-64 w-full" :option="option" autoresize />
    <div class="mt-2 text-[11px] text-zinc-500 dark:text-gray-400 space-y-1">
      <p v-if="variant === 'combined'">
        <strong>Dashed horizontal</strong> line is the safe combined pack cutoff voltage under load ({{ cutoffVoltage.toFixed(1) }} V)
      
      <span v-if="hasSmoothedVoc">
        , <strong>Smoothed Est. V_oc</strong> is an EMA smoothed estimation of the open circuit pack voltage.
      </span>
      </p>
      <p>
        Scroll to pan the time axis; drag the range slider to zoom. Ctrl+scroll also zooms.
      </p>
    </div>
  </div>
</template>
