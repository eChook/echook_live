<!--
  @file components/TelemetryGraph.vue
  @brief ECharts-based telemetry graph component.
  @description Renders a time-series graph for a single telemetry data key.
               Supports zoom controls, lap highlighting, and synced charts via
               ECharts grouping. Handles keyboard and mouse zoom requests.
-->
<script setup>
/**
 * @description TelemetryGraph component for visualizing telemetry data.
 * 
 * Features:
 * - Time-series line chart with auto-scaling
 * - Zoom controls: Ctrl+Scroll for zoom, Shift+Scroll for pan
 * - Lap highlighting via markArea (alternating colors)
 * - Chart grouping for synchronized zoom across multiple graphs
 * - Programmatic zoom via chartZoomRequest from store
 * - Configurable height, color, and display options
 * 
 * Props:
 * - data: Array of telemetry data points with timestamp
 * - dataKey: Which data key to display (e.g., 'speed', 'voltage')
 * - color: Line color (defaults to primary theme color)
 * - group: ECharts group name for synchronized charts
 * - showLaps: Whether to show lap highlight areas
 * - showTitle: Whether to show the data key title
 * - height: Custom height (number or string)
 */
import { computed, defineProps, ref, watch, onMounted } from 'vue'
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

// Register ECharts components
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

/**
 * @brief Component props definition.
 */
const props = defineProps({
  /** @brief Array of telemetry data points */
  data: {
    type: Array,
    required: true
  },
  /** @brief Custom chart height (px or CSS string) */
  height: {
    type: [String, Number],
    default: null
  },
  /** @brief Telemetry key to display */
  dataKey: {
    type: String,
    required: true
  },
  /** @brief Line color */
  color: {
    type: String,
    default: '#cb1557'
  },
  /** @brief ECharts group for synchronized zoom */
  group: {
    type: String,
    default: 'telemetry'
  },
  /** @brief Whether to show lap highlight areas */
  showLaps: {
    type: Boolean,
    default: true
  },
  /** @brief Whether to show the data key title */
  showTitle: {
    type: Boolean,
    default: true
  }
})

const telemetry = useTelemetryStore()
const chart = ref(null)

/**
 * @brief Process zoom requests from the telemetry store.
 * @description Handles: 'reset' (unlock to live), 'absolute' (specific range),
 *              'pan' (offset by time), 'scale' (zoom in/out).
 * @param {Object|null} payload - Zoom request or null to use store value
 */
const processZoom = (payload) => {
  const req = payload || telemetry.chartZoomRequest
  if (req && chart.value) {
    if (req.type === 'reset') {
      // Unlock: Show latest data but maintain current window size
      try {
        const currentOption = chart.value.getOption()
        const axis = currentOption.dataZoom && currentOption.dataZoom[0]

        let sizePercent = 10 // Default fallback

        if (axis) {
          const startVal = axis.startValue
          const endVal = axis.endValue

          if (startVal !== undefined && endVal !== undefined && typeof startVal === 'number' && typeof endVal === 'number') {
            const duration = endVal - startVal
            const totalDuration = (telemetry.latestTime || Date.now()) - (telemetry.earliestTime || 0)
            if (totalDuration > 0) {
              sizePercent = (duration / totalDuration) * 100
            }
          } else if (axis.start !== undefined && axis.end !== undefined) {
            sizePercent = axis.end - axis.start
          }
        }

        // Clamp
        if (isNaN(sizePercent) || sizePercent <= 0) sizePercent = 10
        if (sizePercent > 100) sizePercent = 100
        if (sizePercent < 0.1) sizePercent = 0.1

        chart.value.dispatchAction({
          type: 'dataZoom',
          start: 100 - sizePercent,
          end: 100
        })

      } catch (e) {
        console.error('Zoom calc failed, using fallback', e)
        chart.value.dispatchAction({
          type: 'dataZoom',
          start: 90,
          end: 100
        })
      }
    } else if (req.type === 'absolute') {
      chart.value.dispatchAction({
        type: 'dataZoom',
        startValue: req.start,
        endValue: req.end
      })
    } else if (req.type === 'pan' || req.type === 'scale') {
      try {
        const currentOption = chart.value.getOption()
        const axis = currentOption.dataZoom && currentOption.dataZoom[0]

        if (axis && axis.startValue !== undefined && axis.endValue !== undefined) {
          let start = axis.startValue
          let end = axis.endValue

          if (req.type === 'pan') {
            start += req.offsetMs
            end += req.offsetMs
          } else if (req.type === 'scale') {
            const duration = end - start
            const center = start + (duration / 2)
            const newDuration = duration * req.factor

            start = center - (newDuration / 2)
            end = center + (newDuration / 2)
          }

          chart.value.dispatchAction({
            type: 'dataZoom',
            startValue: start,
            endValue: end
          })
        } else {
          // Fallback: percentage mode
          const totalDuration = (telemetry.latestTime || Date.now()) - (telemetry.earliestTime || 0)

          if (totalDuration > 0) {
            let startP = axis.start !== undefined ? axis.start : 0
            let endP = axis.end !== undefined ? axis.end : 100

            if (req.type === 'pan') {
              const offsetP = (req.offsetMs / totalDuration) * 100
              startP += offsetP
              endP += offsetP
            } else if (req.type === 'scale') {
              const durationP = endP - startP
              const centerP = startP + (durationP / 2)
              const newDurationP = durationP * req.factor

              startP = centerP - (newDurationP / 2)
              endP = centerP + (newDurationP / 2)
            }

            // Clamp
            if (startP < 0) startP = 0
            if (endP > 100) endP = 100
            if (endP - startP < 0.1) {
              const center = (startP + endP) / 2
              startP = center - 0.05
              endP = center + 0.05
            }

            chart.value.dispatchAction({
              type: 'dataZoom',
              start: startP,
              end: endP
            })
          }
        }
      } catch (e) {
        console.error('Pan/Scale failed', e)
      }
      telemetry.chartZoomRequest = null
    }

    if (req.type === 'reset') {
      telemetry.chartZoomRequest = null
    }
  }
}

// Watch for zoom requests
watch(() => telemetry.chartZoomRequest, (req) => {
  if (req) {
    requestAnimationFrame(() => processZoom(req))
  }
})

onMounted(() => {
  if (telemetry.chartZoomRequest) {
    processZoom()
  }
})

/**
 * @brief Get display unit for a telemetry key.
 * @param {string} key - Telemetry key
 * @returns {string} Unit string
 */
const getDisplayUnit = (key) => {
  if (key === 'speed') return telemetry.unitSettings.speedUnit
  if (key === 'temp1' || key === 'temp2') return telemetry.unitSettings.tempUnit === 'f' ? '°F' : '°C'
  return getUnit(key)
}

/**
 * @brief ECharts option configuration.
 * @type {ComputedRef<Object>}
 */
const option = computed(() => {
  const showGrid = telemetry.graphSettings.showGrid
  const showHighlights = props.showLaps && telemetry.graphSettings.showLapHighlights

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
          const formatted = formatValue(props.dataKey, val)
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
      top: 40,
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
      scale: true,
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
        xAxisIndex: 0,
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseWheel: 'shift'
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

/**
 * @brief Handle wheel events to allow page scroll without modifiers.
 * @param {WheelEvent} e - Wheel event
 */
const handleWheel = (e) => {
  if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    e.stopPropagation()
  }
}
</script>

<template>
  <div class="relative overflow-hidden" @wheel.capture="handleWheel"
    :style="{ height: height ? (typeof height === 'number' ? height + 'px' : height) : telemetry.graphSettings.graphHeight + 'px' }">
    <h3 v-if="showTitle" class="absolute top-2 left-4 text-xs font-bold uppercase tracking-wider text-gray-400 z-10">{{
      telemetry.getDisplayName(dataKey) }}</h3>
    <VChart ref="chart" class="w-full h-full" :option="option" autoresize :group="group" />
  </div>
</template>

<style scoped>
/* Ensure chart takes full space */
</style>
