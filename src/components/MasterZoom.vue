<!--
  @file components/MasterZoom.vue
  @brief Master zoom slider component for synchronized chart control.
  @description Provides a slider-based dataZoom control that syncs across
               all ECharts instances in the same group. Displays time axis
               and allows range selection.
-->
<script setup>
/**
 * @description Master zoom component for graph range selection.
 * 
 * Features:
 * - Slider-based time range selection
 * - Syncs with all charts in the same ECharts group
 * - Handles absolute zoom requests from store
 * - Minimal styling without data display (just timestamps)
 * 
 * Props:
 * - data: Array of telemetry data points (for time range)
 * - group: ECharts group name for synchronization
 */
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

// Register ECharts components
use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  DataZoomComponent,
  TooltipComponent
]);

/**
 * @brief Component props definition.
 */
const props = defineProps({
  /** @brief Array of telemetry data points */
  data: {
    type: Array,
    required: true
  },
  /** @brief ECharts group name for synchronization */
  group: {
    type: String,
    required: true
  }
})

const telemetry = useTelemetryStore()
const chartRef = ref(null)
const MAX_ZOOM_POINTS = 500

/**
 * @brief Build a bounded point set for slider rendering.
 * @description Keeps zoom slider responsive by decimating large history arrays.
 */
const zoomSeriesData = computed(() => {
  const points = props.data
  if (!Array.isArray(points) || points.length === 0) return []
  if (points.length <= MAX_ZOOM_POINTS) {
    return points.map(item => [item.timestamp, 0])
  }
  const step = Math.ceil(points.length / MAX_ZOOM_POINTS)
  const decimated = []
  for (let i = 0; i < points.length; i += step) {
    decimated.push([points[i].timestamp, 0])
  }
  const last = points[points.length - 1]
  if (decimated[decimated.length - 1]?.[0] !== last.timestamp) {
    decimated.push([last.timestamp, 0])
  }
  return decimated
})

/**
 * @brief Process absolute zoom requests from the telemetry store.
 * @description Only handles 'absolute' zoom type; ignores 'reset', 'pan', 'scale'.
 */
const processZoom = () => {
  const req = telemetry.chartZoomRequest
  if (req && chartRef.value) {
    if (req.type === 'absolute') {
      chartRef.value.dispatchAction({
        type: 'dataZoom',
        startValue: req.start,
        endValue: req.end
      })
      telemetry.chartZoomRequest = null
    }
  }
}

// Watch for zoom requests
watch(() => telemetry.chartZoomRequest, (req) => {
  if (req) {
    processZoom()
  }
})

onMounted(() => {
  requestAnimationFrame(() => {
    processZoom()
  })
})

/**
 * @brief ECharts option configuration for zoom slider.
 * @type {ComputedRef<Object>}
 */
const option = computed(() => {
  return {
    animation: false,
    grid: {
      left: 60,
      right: 20,
      top: 5,
      bottom: 35
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
        height: 30,
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
        data: zoomSeriesData.value,
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
