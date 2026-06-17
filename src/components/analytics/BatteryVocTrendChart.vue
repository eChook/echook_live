<!--
  @file components/analytics/BatteryVocTrendChart.vue
  @brief Terminal voltage, estimated V_oc, and current over the analysis window.
-->
<script setup>
import { computed, defineProps } from 'vue'
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
  /** @brief Per-sample V, V_oc, and I trend points. */
  series: {
    type: Array,
    default: () => []
  },
  /** @brief Legend label for the measured terminal voltage trace. */
  terminalVoltageLabel: {
    type: String,
    default: 'Terminal Voltage'
  }
})

const settings = useSettingsStore()

/**
 * @brief Blend a hex line color toward white for point markers.
 * @param {string} hex - #rrggbb series color
 * @param {number} [mixRatio=0.4] - White mix amount (0–1)
 * @returns {string} Lighter hex color
 */
function lighterLineColor(hex, mixRatio = 0.4) {
  const normalized = hex?.replace('#', '')
  if (!normalized || normalized.length !== 6) return hex
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  const mix = (channel) => Math.round(channel + (255 - channel) * mixRatio)
  const toHex = (value) => value.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

/**
 * @brief Build a line series with matched line, legend, and marker colors.
 * @param {Object} config - Series definition
 * @returns {Object} ECharts line series option
 */
function buildLineSeries({ name, color, width, yAxisIndex, data, dashed = false, showSymbol = null }) {
  const markerColor = lighterLineColor(color)
  const pointCount = Array.isArray(data) ? data.length : 0
  const symbolVisible = showSymbol ?? (pointCount > 0 && pointCount <= 120)
  return {
    name,
    type: 'line',
    color,
    yAxisIndex,
    showSymbol: symbolVisible,
    symbol: 'circle',
    symbolSize: 5,
    lineStyle: { width, color, type: dashed ? 'dashed' : 'solid' },
    itemStyle: { color: markerColor, borderColor: color, borderWidth: 1 },
    emphasis: {
      focus: 'series',
      lineStyle: { width: width + 0.5, color },
      itemStyle: { color: lighterLineColor(color, 0.25), borderColor: color, borderWidth: 1 }
    },
    data
  }
}

const option = computed(() => {
  const t = getChartTokens(settings.resolvedTheme)
  const colors = getMetricColorMap(settings.resolvedTheme)
  const trend = Array.isArray(props.series) ? props.series : []
  const toSeries = (key) =>
    trend
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
    grid: { top: 28, left: 52, right: 52, bottom: 44 },
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
        // Auto-scale to data range so pack voltages are not compressed against zero.
        scale: true,
        axisLine: { lineStyle: { color: t.axisLine } },
        axisLabel: { color: t.axisLabel },
        splitLine: { lineStyle: { color: t.grid } }
      },
      {
        type: 'value',
        name: 'Current (A)',
        scale: true,
        axisLine: { lineStyle: { color: t.axisLine } },
        axisLabel: { color: t.axisLabel },
        splitLine: { show: false }
      }
    ],
    series: [
      buildLineSeries({
        name: props.terminalVoltageLabel,
        color: colors.voltage,
        width: 2,
        yAxisIndex: 0,
        data: toSeries('terminalVoltage')
      }),
      buildLineSeries({
        name: 'Estimated V_oc',
        color: colors.estimatedVoc,
        width: 2,
        yAxisIndex: 0,
        data: toSeries('estimatedVoc')
      }),
      buildLineSeries({
        name: 'Smoothed V_oc',
        color: colors.smoothedVoc,
        width: 1.5,
        yAxisIndex: 0,
        showSymbol: false,
        data: toSeries('smoothedVoc')
      }),
      buildLineSeries({
        name: 'V_C/20',
        color: colors.vC20,
        width: 1.75,
        yAxisIndex: 0,
        dashed: true,
        showSymbol: false,
        data: toSeries('vC20')
      }),
      buildLineSeries({
        name: 'Current',
        color: colors.current,
        width: 1.5,
        yAxisIndex: 1,
        data: toSeries('current')
      })
    ]
  }
})
</script>

<template>
  <div class="rounded border border-zinc-200 dark:border-neutral-700 p-3">
    <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">
      Terminal V, Estimated V_oc, and Current
    </div>
    <VChart class="h-72 w-full" :option="option" autoresize />
    <div class="mt-2 text-[11px] text-zinc-500 dark:text-gray-400">
      Estimated V_oc uses per-sample RC polarization and rolling resistance (V_oc ≈ V_terminal + Vp(t) + I×R(t)).
      V_C/20 emulates terminal voltage at the C/20 load for SoH ΔAh/ΔSoC lookup.
      Smoothed V_oc is a slow EMA for SOC-style reading.
      Scroll to pan the time axis; drag the range slider to zoom. Ctrl+scroll also zooms.
    </div>
  </div>
</template>
