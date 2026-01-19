<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
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

// Import connect REMOVED (reverting to handle in parent)
// import { connect } from 'echarts/core'

const telemetry = useTelemetryStore()
const chartRef = ref(null)

const processZoom = () => {
  const req = telemetry.chartZoomRequest
  if (req && chartRef.value) {
    chartRef.value.dispatchAction({
      type: 'dataZoom',
      startValue: req.start,
      endValue: req.end
    })
    telemetry.chartZoomRequest = null // Consume request
  }
}

// Watch for zoom requests from other components
watch(() => telemetry.chartZoomRequest, (req) => {
  if (req) {
    // specific check to avoid loops or errors if ref not ready
    processZoom()
  }
})

onMounted(() => {
  // Check for pending request on mount
  // Use requestAnimationFrame to avoid "Layout was forced" warnings by ensuring DOM is ready
  requestAnimationFrame(() => {
    processZoom()
  })
})

const option = computed(() => {
  return {
    animation: false,
    grid: {
      left: 60,
      right: 20,
      top: 5,
      bottom: 35, // Space for slider
      // height: 40 // Let it auto-calculate
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: {
        show: true,
        formatter: '{HH}:{mm}:{ss}',
        color: '#a3a3a3',
        margin: 8
      },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      show: false,
      min: 0,
      max: 1
    },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'empty',
        height: 30, // Restored height
        bottom: 5,
        borderColor: '#404040',
        textStyle: { color: '#a3a3a3' },
        handleStyle: { color: '#cb1557' },
        dataBackground: {
          lineStyle: { color: '#525252' },
          areaStyle: { color: '#262626' }
        },
        selectedDataBackground: {
          lineStyle: { color: '#cb1557' },
          areaStyle: { color: '#9f1245' }
        }
      }
    ],
    series: [
      {
        type: 'line',
        data: props.data.map(item => [item.timestamp, 0]),
        showSymbol: false,
        lineStyle: { opacity: 0 }
      }
    ]
  }
})
</script>

<template>
  <div class="h-16 bg-neutral-900 border-b border-neutral-800 flex items-center w-full px-4">
    <div class="w-full h-full">
      <VChart ref="chartRef" class="w-full h-full" :option="option" autoresize :group="group" />
    </div>
  </div>
</template>
