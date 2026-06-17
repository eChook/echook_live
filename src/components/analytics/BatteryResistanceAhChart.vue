<!--

  @file components/analytics/BatteryResistanceAhChart.vue

  @brief Internal resistance vs Net Ah scatter chart.

-->

<script setup>

import { computed, defineProps, defineEmits } from 'vue'

import { use } from 'echarts/core'

import { CanvasRenderer } from 'echarts/renderers'

import { ScatterChart, LineChart } from 'echarts/charts'

import {

  GridComponent,

  TooltipComponent

} from 'echarts/components'

import VChart from 'vue-echarts'

import { useSettingsStore } from '../../stores/settings'

import { getChartTokens, getMetricColorMap } from '../../constants/chartTheme'

import { METRIC_PRECISION } from '../../utils/metricPrecision'



use([CanvasRenderer, ScatterChart, LineChart, GridComponent, TooltipComponent])



const props = defineProps({

  series: {

    type: Object,

    default: () => ({ points: [], confidence: 'low', assumptions: [] })

  }

})



const emit = defineEmits(['help'])



const settings = useSettingsStore()



/**

 * @brief Perform linear regression for y = a + b*x.

 * @param {number[]} xs - X values

 * @param {number[]} ys - Y values

 * @returns {{intercept: number, slope: number}|null} Regression output

 */

function linearRegression(xs, ys) {

  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) return null



  const n = xs.length

  const xMean = xs.reduce((sum, value) => sum + value, 0) / n

  const yMean = ys.reduce((sum, value) => sum + value, 0) / n



  let numerator = 0

  let denominator = 0

  for (let i = 0; i < n; i += 1) {

    const dx = xs[i] - xMean

    numerator += dx * (ys[i] - yMean)

    denominator += dx * dx

  }



  if (denominator === 0) return null

  const slope = numerator / denominator

  const intercept = yMean - slope * xMean

  return { intercept, slope }

}



/** @brief Resolve numeric x value from a series point. */

function resolvePointX(entry) {

  if (Number.isFinite(entry?.x)) return entry.x

  if (Number.isFinite(entry?.ah)) return entry.ah

  return null

}



/** @brief Chart title. */
const chartTitle = 'Internal Resistance vs Net Ah'

/** @brief X-axis label. */
const xAxisLabel = 'Net Ah'



/** @brief Valid scatter points for rendering. */

const validPoints = computed(() =>

  (Array.isArray(props.series?.points) ? props.series.points : [])

    .map((entry) => ({

      ...entry,

      x: resolvePointX(entry)

    }))

    .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.rMilliOhm) && entry.rMilliOhm > 0)

)



/** @brief True when at least two valid scatter points are available. */

const hasEnoughData = computed(() => validPoints.value.length >= 2)



const option = computed(() => {

  const t = getChartTokens(settings.resolvedTheme)

  const colors = getMetricColorMap(settings.resolvedTheme)

  const points = validPoints.value.map((entry) => [entry.x, entry.rMilliOhm, entry.fitR2, entry.timestamp])



  let trendLine = []

  if (points.length >= 2) {

    const xs = points.map((point) => point[0])

    const ys = points.map((point) => point[1])

    const fit = linearRegression(xs, ys)

    if (fit) {

      const minX = Math.min(...xs)

      const maxX = Math.max(...xs)

      trendLine = [

        [minX, fit.intercept + (fit.slope * minX)],

        [maxX, fit.intercept + (fit.slope * maxX)]

      ]

    }

  }



  return {

    animation: false,

    tooltip: {

      trigger: 'item',

      backgroundColor: t.tooltipBg,

      borderColor: t.tooltipBorder,

      textStyle: { color: t.tooltipText },

      formatter: (params) => {

        if (params?.seriesName === 'Trend') {

          return 'Descriptive linear trend through visible rolling R points'

        }

        const [xValue, rMilliOhm, fitR2, timestamp] = params?.data || []

        const r2Text = Number.isFinite(fitR2) ? `<br/>Fit R²: ${Number(fitR2).toFixed(METRIC_PRECISION.fitR2)}` : ''

        const timeText = Number.isFinite(timestamp)

          ? `<br/>Time: ${new Date(timestamp).toLocaleTimeString()}`

          : ''

        return `Net Ah: ${Number(xValue).toFixed(3)}<br/>R: ${Number(rMilliOhm).toFixed(METRIC_PRECISION.resistanceMilliOhm)} mΩ${r2Text}${timeText}`

      }

    },

    legend: { show: false },

    grid: { top: 12, left: 52, right: 24, bottom: 28 },

    xAxis: {

      type: 'value',

      name: xAxisLabel,

      axisLine: { lineStyle: { color: t.axisLine } },

      axisLabel: { color: t.axisLabel },

      splitLine: { lineStyle: { color: t.grid } }

    },

    yAxis: {

      type: 'value',

      name: 'Resistance (mΩ)',

      axisLine: { lineStyle: { color: t.axisLine } },

      axisLabel: { color: t.axisLabel },

      splitLine: { lineStyle: { color: t.grid } }

    },

    series: [

      {

        name: 'Rolling R',

        type: 'scatter',

        symbolSize: 8,

        itemStyle: { color: colors.current },

        data: points

      },

      {

        name: 'Trend',

        type: 'line',

        showSymbol: false,

        lineStyle: { width: 2, color: colors.voltage, type: 'dashed' },

        data: trendLine

      }

    ]

  }

})

</script>



<template>

  <div class="rounded border border-zinc-200 dark:border-neutral-700 p-3">

    <div class="flex items-center justify-between gap-2 mb-2">

      <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">

        {{ chartTitle }}

      </div>

      <button

        type="button"

        class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold"

        title="How to read IR chart"

        aria-label="Show IR chart help"

        @click="emit('help')"

      >

        ?

      </button>

    </div>

    <VChart v-if="hasEnoughData" class="h-52 w-full" :option="option" autoresize />

    <div v-else class="h-52 flex items-center justify-center text-sm text-zinc-500 dark:text-gray-400 italic text-center px-4">

      Insufficient rolling resistance windows for IR chart. Needs varied load current and enough samples.

    </div>

    <div v-if="series?.confidence" class="mt-2 text-[11px] text-zinc-500 dark:text-gray-400">

      Confidence (overlap-adjusted):

      <span class="font-semibold uppercase">{{ series.confidence }}</span>

      <span v-if="Number.isFinite(series?.effectiveSampleCount)" class="ml-1">

        (n_eff ≈ {{ Number(series.effectiveSampleCount).toFixed(1) }})

      </span>

    </div>

  </div>

</template>

