<!--
  @file components/analytics/BatteryResistanceScatterChart.vue
  @brief Voltage-current scatter chart for resistance context.
-->
<script setup>
import { computed, defineEmits, defineProps } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useSettingsStore } from '../../stores/settings'
import { getChartTokens, getMetricColorMap } from '../../constants/chartTheme'
import { METRIC_PRECISION } from '../../utils/metricPrecision'

use([CanvasRenderer, ScatterChart, LineChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps({
  series: {
    type: Array,
    default: () => []
  },
  resistance: {
    type: Object,
    default: () => ({})
  },
  /** @brief Which resistance branch fit line to overlay (`total`, `lower`, `upper`). */
  branch: {
    type: String,
    default: 'total',
    validator: (value) => ['total', 'lower', 'upper'].includes(value)
  }
})

const emit = defineEmits(['help'])

const settings = useSettingsStore()

const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const colors = getMetricColorMap(settings.resolvedTheme)
  const points = (Array.isArray(props.series) ? props.series : [])
    .filter((entry) => Number.isFinite(entry?.current) && Number.isFinite(entry?.voltage))
    .map((entry) => [entry.current, entry.voltage])

  const branchResistance = props.branch === 'lower'
    ? props.resistance?.branches?.lower
    : props.branch === 'upper'
      ? props.resistance?.branches?.upper
      : props.resistance?.branches?.total
  const fitResistanceMilliOhm = Number.isFinite(branchResistance?.fitRMilliOhm)
    ? branchResistance.fitRMilliOhm
    : branchResistance?.rMilliOhm
  const hasFit = branchResistance?.valid && Number.isFinite(branchResistance?.openCircuitVoltage) && Number.isFinite(fitResistanceMilliOhm)

  let fitLine = []
  if (hasFit && points.length > 0) {
    const currents = points.map((point) => point[0])
    const minCurrent = Math.min(...currents)
    const maxCurrent = Math.max(...currents)
    const rOhm = fitResistanceMilliOhm / 1000
    fitLine = [
      [minCurrent, branchResistance.openCircuitVoltage - (rOhm * minCurrent)],
      [maxCurrent, branchResistance.openCircuitVoltage - (rOhm * maxCurrent)]
    ]
  }

  return {
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.tooltipText },
      formatter: (params) => {
        if (params?.seriesName === 'Fit') return 'Linear V–I fit line'
        const [current, voltage] = params?.data || []
        if (!Number.isFinite(current) || !Number.isFinite(voltage)) return ''
        return `Current: ${Number(current).toFixed(METRIC_PRECISION.current)} A<br/>Voltage: ${Number(voltage).toFixed(METRIC_PRECISION.voltage)} V`
      }
    },
    legend: {
      top: 0,
      textStyle: { color: t.axisLabel }
    },
    grid: { top: 28, left: 52, right: 24, bottom: 28 },
    xAxis: {
      type: 'value',
      name: 'Current (A)',
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: {
        color: t.axisLabel,
        formatter: (value) => Number(value).toFixed(METRIC_PRECISION.current)
      },
      splitLine: { lineStyle: { color: t.grid } }
    },
    yAxis: {
      type: 'value',
      name: 'Voltage (V)',
      axisLine: { lineStyle: { color: t.axisLine } },
      axisLabel: {
        color: t.axisLabel,
        formatter: (value) => Number(value).toFixed(METRIC_PRECISION.voltage)
      },
      splitLine: { lineStyle: { color: t.grid } }
    },
    series: [
      {
        name: 'Samples',
        type: 'scatter',
        symbolSize: 7,
        itemStyle: { color: colors.voltage },
        data: points
      },
      {
        name: 'Fit',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color: colors.current, type: 'dashed' },
        data: fitLine
      }
    ]
  }
})
</script>

<template>
  <div class="rounded border border-zinc-200 dark:border-neutral-700 p-3">
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
        Voltage vs Current (Resistance Fit)
      </div>
      <button
        type="button"
        class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold"
        title="Resistance fit scatter help"
        aria-label="Show resistance scatter help"
        @click="emit('help')"
      >
        ?
      </button>
    </div>
    <VChart class="h-52 w-full" :option="option" autoresize />
  </div>
</template>
