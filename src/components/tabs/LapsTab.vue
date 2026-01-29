<!--
  @file components/tabs/LapsTab.vue
  @brief Lap times and race session display tab.
  @description Displays detected race sessions and lap times in tabular format.
               Includes lap-to-lap comparison, CSV export, and graph navigation.
-->
<script setup>
/**
 * @description Laps tab component for race/lap data display.
 * 
 * Features:
 * - Race session grouping with start timestamp
 * - Sortable lap table with telemetry metrics
 * - Lap-to-lap comparison with color-coded diffs
 * - Background bars showing relative performance
 * - CSV export per race session
 * - "View on Graph" navigation for laps and races
 * - Load more history buttons
 * - First-time disclaimer modal
 * 
 * Metrics displayed:
 * - Lap number, start/finish time, lap duration
 * - Voltage, current, RPM, speed, Ah, efficiency
 */
import { computed, ref } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'
import { ChartBarIcon, ArrowPathIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()
const auth = useAuthStore()

/**
 * @brief Table column headers.
 * @type {ComputedRef<Array<string>>}
 */
const headers = computed(() => [
  'Lap',
  'Start',
  'Finish',
  'Time',
  'Volts',
  'Amps',
  'RPM',
  `Speed (${telemetry.unitSettings.speedUnit.toUpperCase()})`,
  'Ah',
  'Eff'
])

/** @brief Data keys corresponding to table columns */
const keys = ['lapNumber', 'startTime', 'finishTime', 'LL_Time', 'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_Eff']

/**
 * @brief Sorted races with converted laps and per-race stats.
 * @description Processes race data for display, including unit conversion
 *              and min/max stats calculation for background bars.
 * @type {ComputedRef<Array<Object>>}
 */
const sortedRaces = computed(() => {
  const raceList = Object.values(telemetry.races).sort((a, b) => b.startTimeMs - a.startTimeMs)

  return raceList.map(race => {
    const lapList = Object.values(race.laps).sort((a, b) => a.lapNumber - b.lapNumber)

    // Convert units (e.g., speed)
    const convertedLaps = lapList.map(lap => {
      const newLap = { ...lap }
      if (newLap.LL_Spd !== undefined) {
        let val = newLap.LL_Spd
        if (telemetry.unitSettings.speedUnit === 'mph') val = val * 2.23694
        if (telemetry.unitSettings.speedUnit === 'kph') val = val * 3.6
        newLap.LL_Spd = val
      }
      return newLap
    })

    // Calculate min/max stats for background bars
    const stats = {}
    keys.slice(1).forEach(key => {
      let min = Infinity
      let max = -Infinity
      convertedLaps.forEach(lap => {
        const val = lap[key] || 0
        if (val < min) min = val
        if (val > max) max = val
      })
      if (max === min) max = min + 1
      stats[key] = { min, max }
    })

    // Sort laps newest first for display
    const sortedLaps = [...convertedLaps].reverse()

    return {
      ...race,
      startTime: race.startTimeMs,
      sortedLaps,
      stats
    }
  })
})

// Load History Logic
const isLoadingHistory = ref(false)

/**
 * @brief Load additional telemetry history.
 * @param {number} minutes - Minutes of history to load
 */
async function loadExtra(minutes) {
  const carId = telemetry.viewingCar?.id || auth.user?.id || auth.user?._id
  if (carId) {
    isLoadingHistory.value = true
    try {
      await telemetry.loadExtraHistory(carId, minutes)
    } finally {
      isLoadingHistory.value = false
    }
  }
}

import { exportHistoryAsCsv } from '../../utils/csvExport'

/**
 * @brief Export race data to CSV file.
 * @param {Object} race - Race object to export
 */
const downloadRaceCsv = (race) => {
  if (!race) return

  const startTime = race.startTimeMs
  const allStartTimes = Object.keys(telemetry.races).map(Number).sort((a, b) => a - b)
  const myIndex = allStartTimes.indexOf(startTime)
  let endTime = Infinity

  if (myIndex !== -1 && myIndex < allStartTimes.length - 1) {
    endTime = allStartTimes[myIndex + 1]
  } else {
    const latest = telemetry.history[telemetry.history.length - 1]
    endTime = latest ? latest.timestamp : Date.now()
  }

  const success = exportHistoryAsCsv(startTime, endTime, 'eChook', race.trackName)
  if (!success) {
    console.warn("CSV Export failed: No data found.")
  }
}

/**
 * @brief Format numeric value for display.
 */
const formatValue = (val) => {
  if (typeof val === 'number') {
    return val.toFixed(2)
  }
  return val
}

/**
 * @brief Format timestamp as time string.
 */
const formatTime = (ms) => {
  if (!ms || !Number.isFinite(ms)) return '-'
  return new Date(ms).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * @brief Format date/timestamp for race header.
 */
const formatDate = (isoStringOrMs) => {
  if (!isoStringOrMs) return 'Unknown Time'
  return new Date(isoStringOrMs).toLocaleString()
}

/**
 * @brief Navigate to graph tab and zoom to race session.
 */
const viewSessionOnGraph = (race) => {
  telemetry.requestChartZoom(
    race.startTime - 30000,
    (race.sortedLaps[0]?.finishTime || Date.now()) + 30000
  )
  if (!telemetry.isPaused) telemetry.togglePause()
  settings.activeTabId = 'graph'
}

/**
 * @brief Navigate to graph tab and zoom to specific lap.
 */
const viewLapOnGraph = (lap) => {
  if (!lap.startTime || !lap.finishTime) return
  telemetry.requestChartZoom(
    lap.startTime - 10000,
    lap.finishTime + 10000
  )
  if (!telemetry.isPaused) telemetry.togglePause()
  settings.activeTabId = 'graph'
}

/**
 * @brief Metric direction for comparison coloring.
 * @description -1 means lower is better (green), 1 means higher is better.
 */
const metricDirection = {
  'LL_Time': -1,
  'LL_Ah': -1,
  'LL_I': -1,
  'LL_V': 1,
  'LL_RPM': 1,
  'LL_Spd': 1,
  'LL_Eff': 1
}

/**
 * @brief Calculate difference from previous lap.
 */
const getDiff = (currentLap, sortedLaps, key, currentIndex) => {
  const prevLapData = sortedLaps[currentIndex + 1]
  if (!prevLapData) return null

  const curr = currentLap[key] || 0
  const prev = prevLapData[key] || 0
  return curr - prev
}

/**
 * @brief Get color class for diff value.
 */
const getDiffColor = (key, diff) => {
  if (Math.abs(diff) < 0.001) return 'text-gray-500'

  const dir = metricDirection[key] || 1
  const isGood = (diff * dir) > 0
  return isGood ? 'text-green-500' : 'text-red-500'
}

/**
 * @brief Calculate percentage for background bar width.
 */
const getBarPercent = (val, min, max) => {
  const cleanVal = val || 0
  const range = max - min
  if (range === 0) return 0
  return Math.min(100, Math.max(0, ((cleanVal - min) / range) * 100))
}

// Disclaimer Modal
import DisclaimerModal from '../ui/DisclaimerModal.vue'
import { onMounted } from 'vue'

const showDisclaimer = ref(false)

onMounted(() => {
  if (!settings.hideLapsDisclaimer) {
    showDisclaimer.value = true
  }
})

const handleDisclaimerConfirm = (doNotShow) => {
  if (doNotShow) {
    settings.hideLapsDisclaimer = true
  }
  showDisclaimer.value = false
}
</script>

<template>
  <div class="h-full flex flex-col p-2 md:p-6 overflow-hidden space-y-4 md:space-y-8">
    <!-- Empty State -->
    <div v-if="sortedRaces.length === 0" class="flex items-center justify-center h-full text-gray-500 italic text-sm">
      No lap data recorded yet.
    </div>

    <!-- Race List -->
    <div class="flex-1 overflow-y-auto space-y-4 md:space-y-8 pr-1 md:pr-2">
      <div v-for="race in sortedRaces" :key="race.id" class="flex flex-col space-y-2 md:space-y-4">
        <!-- Race Header -->
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between sticky top-0 bg-neutral-900 z-20 py-1 md:py-2 border-b border-neutral-800">
          <div class="flex items-center space-x-3">
            <h2
              class="text-sm md:text-xl font-bold text-white tracking-tight flex items-center flex-wrap gap-2 leading-none">
              <span v-if="race.trackName" class="text-white">{{ race.trackName }} </span>
              <span class="text-primary font-mono text-xs md:text-base pt-0.5">{{ formatDate(race.startTime) }}</span>
            </h2>
            <button @click="downloadRaceCsv(race)"
              class="bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white p-1 rounded transition"
              title="Download Race CSV">
              <ArrowDownTrayIcon class="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button @click="viewSessionOnGraph(race)"
              class="bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white p-1 rounded transition"
              title="View Race on Graph">
              <ChartBarIcon class="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
          <div class="text-xs md:text-sm text-gray-400 mt-1 md:mt-0">
            Laps: <span class="text-white font-mono font-bold">{{ race.sortedLaps.length }}</span>
          </div>
        </div>

        <!-- Lap Table -->
        <div class="bg-neutral-800 rounded-lg border border-neutral-700 shadow-xl overflow-x-auto custom-scrollbar">
          <table class="w-full min-w-[600px] md:min-w-[1000px] text-left border-collapse">
            <thead class="bg-neutral-900">
              <tr>
                <th v-for="(header, i) in headers" :key="header"
                  class="px-2 md:px-8 py-2 md:py-4 text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-neutral-700">
                  {{ header }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-700">
              <tr v-for="(lap, idx) in race.sortedLaps" :key="lap.lapNumber" class="hover:bg-neutral-700/50 transition">
                <td class="px-2 md:px-8 py-1.5 md:py-4 font-mono text-xs md:text-base text-primary font-bold">
                  <div class="flex items-center space-x-2">
                    <span>{{ lap.lapNumber ?? '-' }}</span>
                    <button @click="viewLapOnGraph(lap)"
                      class="text-gray-500 hover:text-primary transition opacity-50 hover:opacity-100"
                      title="View Lap on Graph">
                      <ChartBarIcon class="w-3 h-3 md:w-4 md:h-4" />
                    </button>
                  </div>
                </td>
                <td v-for="key in keys.slice(1)" :key="key"
                  class="px-2 md:px-8 py-1.5 md:py-4 font-mono text-[11px] md:text-sm text-gray-300 relative">
                  <!-- Background Bar -->
                  <div v-if="!['startTime', 'finishTime'].includes(key)"
                    class="absolute inset-y-0.5 left-1 right-1 z-0">
                    <div class="h-full rounded bg-white/10 transition-all duration-700 ease-out"
                      :style="{ width: getBarPercent(lap[key], race.stats[key].min, race.stats[key].max) + '%' }">
                    </div>
                  </div>

                  <!-- Content -->
                  <div class="relative z-10 flex justify-between items-center space-x-1 md:space-x-2">
                    <span v-if="['startTime', 'finishTime'].includes(key)">{{ formatTime(lap[key]) }}</span>
                    <span v-else>{{ formatValue(lap[key]) }}</span>

                    <!-- Diff Badge -->
                    <span
                      v-if="!['startTime', 'finishTime'].includes(key) && getDiff(lap, race.sortedLaps, key, idx) !== null"
                      class="text-[9px] md:text-xs font-bold"
                      :class="getDiffColor(key, getDiff(lap, race.sortedLaps, key, idx))">
                      {{ getDiff(lap, race.sortedLaps, key, idx) > 0 ? '+' : '' }}{{ formatValue(getDiff(lap,
                        race.sortedLaps, key, idx)) }}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Load More History -->
      <div
        class="flex flex-col md:flex-row items-center justify-between bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50 mt-4 mb-4">
        <div class="flex items-center space-x-2 text-xs text-gray-400 mb-2 md:mb-0">
          <ArrowPathIcon class="w-4 h-4" :class="isLoadingHistory ? 'animate-spin text-primary' : ''" />
          <span>Load More History:</span>
        </div>
        <div class="flex space-x-2 w-full md:w-auto">
          <button @click="loadExtra(10)" :disabled="isLoadingHistory"
            class="flex-1 md:flex-none px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-xs text-gray-300 hover:text-white transition disabled:opacity-50">
            +10m
          </button>
          <button @click="loadExtra(30)" :disabled="isLoadingHistory"
            class="flex-1 md:flex-none px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-xs text-gray-300 hover:text-white transition disabled:opacity-50">
            +30m
          </button>
          <button @click="loadExtra(60)" :disabled="isLoadingHistory"
            class="flex-1 md:flex-none px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-xs text-gray-300 hover:text-white transition disabled:opacity-50">
            +1h
          </button>
        </div>
      </div>
    </div>

    <!-- Disclaimer Modal -->
    <DisclaimerModal :is-open="showDisclaimer" title="Disclaimer"
      message="eChook measured lap times are only accurate to within a few seconds and are no replacement for the official lap times."
      @confirm="handleDisclaimerConfirm" />
  </div>
</template>
