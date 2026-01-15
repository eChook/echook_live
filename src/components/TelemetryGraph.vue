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
            color: '#666',
            fontFamily: 'monospace',
            fontSize: 10
          },
          data: showHighlights ? (() => {
            const areas = []
            // Helper: Ensure timestamp is roughly valid (e.g. > year 2000) to avoid scale issues
            const isValidTs = (ts) => ts && Number.isFinite(ts) && ts > 946684800000

            // 1. Process Completed Laps from Races (Stable source of truth)
            if (telemetry.races && telemetry.races.length > 0) {
              telemetry.races.forEach(race => {
                let lapStart = race.startTimeMs
                if (race.laps && race.laps.length > 0) {
                  race.laps.forEach(lap => {
                    const lapEnd = lap.timestamp
                    if (isValidTs(lapStart) && isValidTs(lapEnd)) {
                      areas.push([
                        {
                          xAxis: lapStart,
                          name: `Lap ${lap.lapNumber}`,
                          itemStyle: {
                            color: lap.lapNumber % 2 === 0 ? '#ffffff' : 'transparent'
                          }
                        },
                        {
                          xAxis: lapEnd
                        }
                      ])
                    }
                    lapStart = lapEnd
                  })
                }
              })
            }

            // 2. Process Current (Incomplete) Lap
            // It extends from the end of the last known lap (or start of data) to the latest data point

            if (props.data && props.data.length > 0) {
              const lastPt = props.data[props.data.length - 1]
              let currentLapStart = null

              // Determine where the current lap started based on races
              if (telemetry.races.length > 0) {
                const lastRace = telemetry.races[telemetry.races.length - 1]
                if (lastRace.laps.length > 0) {
                  currentLapStart = lastRace.laps[lastRace.laps.length - 1].timestamp
                } else {
                  currentLapStart = lastRace.startTimeMs
                }
              } else {
                // No race info, fallback to data start
                currentLapStart = props.data[0].timestamp
              }

              // Ensure we draw if valid
              if (isValidTs(currentLapStart) && isValidTs(lastPt.timestamp) && lastPt.timestamp > currentLapStart) {
                const currentLapNum = lastPt.currLap
                areas.push([
                  {
                    xAxis: currentLapStart,
                    name: currentLapNum ? `Lap ${currentLapNum}` : '',
                    itemStyle: {
                      color: (currentLapNum && currentLapNum % 2 === 0) ? '#ffffff' : 'transparent'
                    }
                  },
                  {
                    xAxis: lastPt.timestamp
                  }
                ])
              }
            }

            return areas
          })() : []
        }
      }
    ]
  }
})
</script>

<template>
  <div
    class="bg-neutral-800/50 rounded-lg border border-neutral-700/50 backdrop-blur-sm shadow-sm overflow-hidden p-2 relative"
    :style="{ height: telemetry.graphSettings.graphHeight + 'px' }">
    <h3 class="absolute top-2 left-4 text-xs font-bold uppercase tracking-wider text-gray-400 z-10">{{ dataKey }}</h3>
    <VChart class="w-full h-full" :option="option" autoresize :group="group" />
  </div>
</template>

<style scoped>
/* Ensure chart takes full space */
</style>
