<script setup>
import { computed } from 'vue'
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  DataZoomComponent,
  TooltipComponent
} from "echarts/components";
import VChart from "vue-echarts";

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  DataZoomComponent,
  TooltipComponent
]);

const props = defineProps({
  data: {
    type: Array,
    required: true
  },
  group: {
    type: String,
    required: true
  }
})

const option = computed(() => {
  return {
    animation: false,
    grid: {
      left: 60,
      right: 20,
      top: 0,
      bottom: 0,
      height: 40 // Minimal height for just the slider
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: { 
        show: true,
        formatter: '{HH}:{mm}:{ss}',
        color: '#a3a3a3'
      },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      show: false
    },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'empty', 
        height: 30,
        bottom: 5,
        borderColor: '#404040',
        textStyle: { color: '#a3a3a3' },
        handleStyle: { color: '#14b8a6' }, // teal-500
        dataBackground: {
            lineStyle: { color: '#525252' },
            areaStyle: { color: '#262626' }
        },
        selectedDataBackground: {
            lineStyle: { color: '#2dd4bf' },
            areaStyle: { color: '#115e59' }
        }
      }
    ],
    series: [
      {
        // Dummy series to establish the time range for the slider
        type: 'line',
        data: props.data.map(item => [item.timestamp, 0]), // Just timestamp matters
        showSymbol: false,
        lineStyle: { opacity: 0 }
      }
    ]
  }
})
</script>

<template>
  <div class="h-12 bg-neutral-900 border-b border-neutral-800 flex items-center w-full px-4">
    <div class="w-full h-full">
         <VChart 
            class="w-full h-full" 
            :option="option" 
            autoresize 
            :group="group"
        />
    </div>
  </div>
</template>
