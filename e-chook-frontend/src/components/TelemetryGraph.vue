<script setup>
import { computed, defineProps } from 'vue'
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent
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
  DatasetComponent
]);

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

const option = computed(() => {
  return {
    animation: false, // Performance optimization 
    color: [props.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(23, 23, 23, 0.9)',
      borderColor: '#333',
      textStyle: { color: '#fff' }
    },
    grid: {
      top: 30,
      bottom: 20, // Minimal bottom since we sync zoom, but need some space
      left: 60,
      right: 20
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#525252' } }, // neutral-600
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: true, // Don't start at 0 if data is far from it
      axisLine: { lineStyle: { color: '#525252' } },
      splitLine: { lineStyle: { color: '#262626' } } // neutral-800
    },
    large: true,
    largeThreshold: 1000,
    progressive: 500,
    progressiveThreshold: 1000,
    dataZoom: [
      {
        type: 'inside', // Allow zooming/panning on the graph itself
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
        // areaStyle: {
        //   // color: {
        //   //   type: 'linear',
        //   //   x: 0, y: 0, x2: 0, y2: 1,
        //   //   colorStops: [
        //   //     { offset: 0, color: props.color.replace(')', ', 0.5)').replace('rgb', 'rgba') || props.color },
        //   //     { offset: 1, color: 'transparent' }
        //   //   ]
        //   // },
        //   // opacity: 0.2
        // },
        lineStyle: { width: 2 }
      }
    ]
  }
})
</script>

<template>
  <div
    class="h-64 bg-neutral-800/50 rounded-lg border border-neutral-700/50 backdrop-blur-sm shadow-sm overflow-hidden p-2 relative">
    <h3 class="absolute top-2 left-4 text-xs font-bold uppercase tracking-wider text-gray-400 z-10">{{ dataKey }}</h3>
    <VChart class="w-full h-full" :option="option" autoresize :group="group" />
  </div>
</template>

<style scoped>
/* Ensure chart takes full space */
</style>
