<script setup>
import { computed, defineProps } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  MarkAreaComponent
} from "echarts/components";
import VChart from "vue-echarts";

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  MarkAreaComponent
]);

import { formatValue, getUnit } from '../utils/formatting'

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  dataKey: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: '#cb1557' // primary
  },
  group: {
    type: String,
    default: 'telemetry'
  }
})

const telemetry = useTelemetryStore()

// Dynamic Unit Helper
const getDisplayUnit = (key) => {
  if (key === 'speed') return telemetry.unitSettings.speedUnit
  if (key === 'temp1' || key === 'temp2') return telemetry.unitSettings.tempUnit === 'f' ? '°F' : '°C'
  return getUnit(key)
}

const option = computed(() => {
  const showGrid = telemetry.graphSettings.showGrid
  const showHighlights = telemetry.graphSettings.showLapHighlights

  return {
    animation: telemetry.graphSettings.showAnimations,
    color: [props.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(23, 23, 23, 0.9)',
      borderColor: '#333',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        if (!params.length) return ''
        const date = new Date(params[0].axisValue)
        const timeStr = date.toLocaleTimeString()
        let result = `<div class="font-bold mb-1">${timeStr}</div>`

        params.forEach(item => {
          const val = item.data[props.dataKey]
          const formatted = formatValue(props.dataKey, val) // Assuming formatValue handles generic number formatting well
          const unit = getDisplayUnit(props.dataKey)

          result += `
            <div class="flex items-center justify-between space-x-4">
              <span style="color: ${item.color}">● ${item.seriesName}</span>
              <span class="font-mono font-bold">${formatted} <span class="text-xs text-gray-400">${unit}</span></span>
            </div>
           `
        })
        return result
      }
    },
    grid: {
      top: 30,
      bottom: 20,
      left: 60,
      right: 20
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#525252' } },
      splitLine: { show: showGrid, lineStyle: { color: '#262626' } }
    },
    yAxis: {
      type: 'value',
      scale: true, // Auto-scale
      axisLine: { lineStyle: { color: '#525252' } },
      splitLine: { show: showGrid, lineStyle: { color: '#262626' } }
    },
    large: true,
    largeThreshold: 10000,
    progressive: 500,
    progressiveThreshold: 1000,
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0
      }
    ],
    dataset: {
      source: props.data
    },
    series: [
      {
        name: props.dataKey,
        type: 'line',
        showSymbol: false,
        sampling: 'average',
        encode: {
          x: 'timestamp',
          y: props.dataKey
        },
        lineStyle: { width: 2 },
        // Add markArea for Laps
        markArea: {
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
            color: '#666',
            fontFamily: 'monospace',
            fontSize: 10
          },
          data: showHighlights ? telemetry.lapMarkAreas : []
        }
      }
    ]
  }
})
</script>

<template>
  <div
    class="relative overflow-hidden"
    :style="{ height: telemetry.graphSettings.graphHeight + 'px' }">
    <h3 class="absolute top-2 left-4 text-xs font-bold uppercase tracking-wider text-gray-400 z-10">{{ telemetry.getDisplayName(dataKey) }}</h3>
    <VChart class="w-full h-full" :option="option" autoresize :group="group" />
  </div>
</template>

<style scoped>
/* Ensure chart takes full space */
</style>
