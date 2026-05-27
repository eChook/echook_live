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
 * - Voltage, current, RPM, speed, Ah, Peak W, kWh, efficiency
 */
import { computed, ref, onMounted } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'
import { ChartBarIcon, ArrowPathIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import {
  filterLapSummaries
} from '../../utils/analyticsMetrics'

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
  'Peak W',
  'kWh',
  'Eff'
])

/** @brief Data keys corresponding to table columns */
const keys = ['lapNumber', 'startTime', 'finishTime', 'LL_Time', 'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_PeakW', 'LL_kWh', 'LL_Eff']

/**
 * @brief Sorted races with converted laps and per-race stats.
 * @description Processes race data for display, including unit conversion
 *              and min/max stats calculation for background bars.
 * @type {ComputedRef<Array<Object>>}
 */
const sortedRaces = computed(() => {
  const raceList = Object.values(telemetry.races).sort((a, b) => b.startTimeMs - a.startTimeMs)

  return raceList.map((race) => {
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

    const confidenceOptions = {
      minLapTimeSec: Number.isFinite(settings.analyticsSettings?.lapConfidenceMinTimeSec)
        ? settings.analyticsSettings.lapConfidenceMinTimeSec
        : 15,
      maxLapTimeSec: Number.isFinite(settings.analyticsSettings?.lapConfidenceMaxTimeSec)
        ? settings.analyticsSettings.lapConfidenceMaxTimeSec
        : 600
    }
    const filteredLapResult = filterLapSummaries(convertedLaps, {
      hideSuspect: settings.analyticsSettings?.hideSuspectLaps === true,
      hideInvalid: settings.analyticsSettings?.hideInvalidLaps === true,
      excludeFirstLap: settings.analyticsSettings?.excludeFirstLap === true,
      minimumLapTimeSec: Number.isFinite(settings.analyticsSettings?.minimumLapTimeSec)
        ? settings.analyticsSettings.minimumLapTimeSec
        : 0,
      confidenceOptions
    })

    // Sort laps newest first for display
    const sortedLaps = [...filteredLapResult.laps].reverse()
    return {
      ...race,
      startTime: race.startTimeMs,
      sortedLaps,
      stats,
      excludedLaps: filteredLapResult.excluded,
      filteredLapCount: filteredLapResult.laps.length,
      sourceLapCount: convertedLaps.length
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
  const carId = telemetry.viewingCar?.id || auth.userId
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
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val.toFixed(2)
  }
  if (val === null || val === undefined || val === '') return '-'
  return val
}

/**
 * @brief Format laps-table values by key with metric-specific precision.
 */
const formatTableValue = (key, val) => {
  if (!Number.isFinite(val)) return formatValue(val)
  if (key === 'LL_PeakW') return val.toFixed(1)
  if (key === 'LL_kWh') return val.toFixed(3)
  return formatValue(val)
}

/** @brief Human-readable text for lap confidence reason codes. */
const CONFIDENCE_REASON_TEXT = {
  missing_or_nonpositive_lap_time: 'Lap time is missing or zero.',
  lap_time_below_minimum_bound: 'Lap time is below the configured minimum.',
  lap_time_above_maximum_bound: 'Lap time is above the configured maximum.',
  missing_ll_placeholder_metrics: 'Several lap summary metrics are missing.',
  lap_sequence_jump_detected: 'Lap number sequence has a gap or jump.'
}

/** @brief Summary tooltip text for each confidence label. */
const CONFIDENCE_SUMMARY = {
  good: 'Lap passed confidence checks — timing and metrics look consistent.',
  suspect: 'Lap may be unreliable — review timing and metrics before comparing.',
  invalid: 'Lap failed confidence checks — exclude from timing analysis.'
}

/**
 * @brief Single-letter icon for lap confidence label.
 */
const getConfidenceIcon = (label) => {
  if (label === 'invalid') return 'I'
  if (label === 'suspect') return 'S'
  return 'G'
}

/**
 * @brief Colour classes for compact confidence icon badges.
 */
const getConfidenceIconClass = (label) => {
  if (label === 'invalid') return 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30'
  if (label === 'suspect') return 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30'
  return 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30'
}

/**
 * @brief Build mouseover tooltip for lap confidence icon.
 */
const getConfidenceTooltip = (lap) => {
  const label = lap.confidenceLabel || 'good'
  const parts = [CONFIDENCE_SUMMARY[label] || CONFIDENCE_SUMMARY.good]
  const reasons = Array.isArray(lap.confidenceReasons) ? lap.confidenceReasons : []
  reasons.forEach((code) => {
    const reasonText = CONFIDENCE_REASON_TEXT[code]
    if (reasonText) parts.push(reasonText)
  })
  return parts.join(' ')
}

/** @brief Tooltip for derived lap summary icon. */
const DERIVED_LAP_TOOLTIP =
  'This lap uses live data streamed directly from the car, rather than a local more accurate lap summary from the car. As a result, lap timing accuracy is very limited. We are working to reduce this occurrence.'

/**
 * @brief Format timestamp as time string.
 */
const formatTime = (ms) => {
  if (!ms || !Number.isFinite(ms)) return '-'
  return new Date(ms).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * @brief Format lap duration (seconds) as minutes:seconds for the laps table.
 * @description LL_Time is stored in seconds; display as m:ss.ss (e.g. 62.5 -> 1:02.50).
 */
const formatLapDuration = (totalSeconds) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '-'
  const wholeMinutes = Math.floor(totalSeconds / 60)
  const remainderSeconds = totalSeconds - (wholeMinutes * 60)
  const secondsPart = remainderSeconds.toFixed(2).padStart(5, '0')
  return `${wholeMinutes}:${secondsPart}`
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
  'LL_kWh': -1,
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
  if (Math.abs(diff) < 0.001) return 'text-zinc-500 dark:text-gray-500'

  const dir = metricDirection[key] || 1
  const isGood = (diff * dir) > 0
  return isGood ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
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

import DisclaimerModal from '../ui/DisclaimerModal.vue'

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
    <div v-if="sortedRaces.length === 0" class="flex items-center justify-center h-full text-zinc-500 dark:text-gray-500 italic text-sm">
      No lap data recorded yet.
    </div>

    <!-- Race List -->
    <div class="flex-1 overflow-y-auto space-y-4 md:space-y-8 pr-1 md:pr-2">
      <div v-for="race in sortedRaces" :key="race.id" class="flex flex-col space-y-2 md:space-y-4">
        <!-- Race Header -->
        <div
          class="flex flex-col md:flex-row md:items-center md:justify-between sticky top-0 bg-zinc-100 dark:bg-neutral-900 z-20 py-1 md:py-2 border-b border-zinc-200 dark:border-neutral-800">
          <div class="flex items-center space-x-3">
            <h2
              class="text-sm md:text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center flex-wrap gap-2 leading-none">
              <span v-if="race.trackName" class="text-zinc-900 dark:text-white">{{ race.trackName }} </span>
              <span class="text-primary font-mono text-xs md:text-base pt-0.5">{{ formatDate(race.startTime) }}</span>
            </h2>
            <button @click="downloadRaceCsv(race)"
              class="bg-zinc-200 dark:bg-neutral-800 hover:bg-zinc-300 dark:hover:bg-neutral-700 text-zinc-600 dark:text-gray-300 hover:text-zinc-900 dark:hover:text-white p-1 rounded transition"
              title="Download Race CSV">
              <ArrowDownTrayIcon class="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button @click="viewSessionOnGraph(race)"
              class="bg-zinc-200 dark:bg-neutral-800 hover:bg-zinc-300 dark:hover:bg-neutral-700 text-zinc-600 dark:text-gray-300 hover:text-zinc-900 dark:hover:text-white p-1 rounded transition"
              title="View Race on Graph">
              <ChartBarIcon class="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
          <div class="text-xs md:text-sm text-zinc-600 dark:text-gray-400 mt-1 md:mt-0">
            Laps: <span class="text-zinc-900 dark:text-white font-mono font-bold">{{ race.filteredLapCount }}</span>
            <span class="mx-1">/</span>
            <span class="font-mono">{{ race.sourceLapCount }}</span>
            <span v-if="race.excludedLaps.length > 0" class="ml-1 text-amber-600 dark:text-amber-400">
              ({{ race.excludedLaps.length }} filtered)
            </span>
          </div>
        </div>

        <!-- Lap Table -->
        <div class="bg-white dark:bg-neutral-800 rounded-lg border border-zinc-200 dark:border-neutral-700 shadow-xl overflow-x-auto custom-scrollbar">
          <table class="w-full min-w-[600px] md:min-w-[1000px] text-left border-collapse">
            <thead class="bg-zinc-50 dark:bg-neutral-900">
              <tr>
                <th v-for="(header, i) in headers" :key="header"
                  class="px-2 md:px-8 py-2 md:py-4 text-[10px] md:text-xs font-bold text-zinc-500 dark:text-gray-400 uppercase tracking-wider border-b border-zinc-200 dark:border-neutral-700">
                  {{ header }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-neutral-700">
              <tr v-for="(lap, idx) in race.sortedLaps" :key="lap.lapNumber" class="hover:bg-zinc-100 dark:hover:bg-neutral-700/50 transition">
                <td class="px-2 md:px-8 py-1.5 md:py-4 font-mono text-xs md:text-base text-primary font-bold">
                  <div class="flex items-center gap-1">
                    <span>{{ lap.lapNumber ?? '-' }}</span>
                    <span
                      v-if="(lap.confidenceLabel || 'good') !== 'good'"
                      class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none cursor-help shrink-0"
                      :class="getConfidenceIconClass(lap.confidenceLabel)"
                      :title="getConfidenceTooltip(lap)"
                    >
                      {{ getConfidenceIcon(lap.confidenceLabel) }}
                    </span>
                    <span
                      v-if="lap.lapSummarySource === 'derived'"
                      class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none cursor-help shrink-0 text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/30"
                      :title="DERIVED_LAP_TOOLTIP"
                    >
                      D
                    </span>
                    <button @click="viewLapOnGraph(lap)"
                      class="text-zinc-400 dark:text-gray-500 hover:text-primary transition opacity-50 hover:opacity-100"
                      title="View Lap on Graph">
                      <ChartBarIcon class="w-3 h-3 md:w-4 md:h-4" />
                    </button>
                  </div>
                </td>
                <td v-for="key in keys.slice(1)" :key="key"
                  class="px-2 md:px-8 py-1.5 md:py-4 font-mono text-[11px] md:text-sm text-zinc-700 dark:text-gray-300 relative">
                  <!-- Background Bar -->
                  <div v-if="!['startTime', 'finishTime'].includes(key)"
                    class="absolute inset-y-0.5 left-1 right-1 z-0">
                    <div class="h-full rounded bg-zinc-900/10 dark:bg-white/10 transition-all duration-700 ease-out"
                      :style="{ width: getBarPercent(lap[key], race.stats[key].min, race.stats[key].max) + '%' }">
                    </div>
                  </div>

                  <!-- Content -->
                  <div class="relative z-10 flex justify-between items-center space-x-1 md:space-x-2">
                    <span v-if="['startTime', 'finishTime'].includes(key)">{{ formatTime(lap[key]) }}</span>
                    <span v-else-if="key === 'LL_Time'">{{ formatLapDuration(lap[key]) }}</span>
                    <span v-else>{{ formatTableValue(key, lap[key]) }}</span>

                    <!-- Diff Badge -->
                    <span
                      v-if="!['startTime', 'finishTime'].includes(key) && getDiff(lap, race.sortedLaps, key, idx) !== null"
                      class="text-[9px] md:text-xs font-bold"
                      :class="getDiffColor(key, getDiff(lap, race.sortedLaps, key, idx))">
                      {{ getDiff(lap, race.sortedLaps, key, idx) > 0 ? '+' : '' }}{{ formatTableValue(key, getDiff(lap,
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
        class="flex flex-col md:flex-row items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-3 rounded-lg border border-zinc-200 dark:border-neutral-700/50 mt-4 mb-4">
        <div class="flex items-center space-x-2 text-xs text-zinc-600 dark:text-gray-400 mb-2 md:mb-0">
          <ArrowPathIcon class="w-4 h-4" :class="isLoadingHistory ? 'animate-spin text-primary' : ''" />
          <span>Load More History:</span>
        </div>
        <div class="flex space-x-2 w-full md:w-auto">
          <button @click="loadExtra(10)" :disabled="isLoadingHistory"
            class="flex-1 md:flex-none px-3 py-1.5 bg-zinc-200 dark:bg-neutral-800 hover:bg-zinc-300 dark:hover:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 rounded text-xs text-zinc-700 dark:text-gray-300 hover:text-zinc-900 dark:hover:text-white transition disabled:opacity-50">
            +10m
          </button>
          <button @click="loadExtra(30)" :disabled="isLoadingHistory"
            class="flex-1 md:flex-none px-3 py-1.5 bg-zinc-200 dark:bg-neutral-800 hover:bg-zinc-300 dark:hover:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 rounded text-xs text-zinc-700 dark:text-gray-300 hover:text-zinc-900 dark:hover:text-white transition disabled:opacity-50">
            +30m
          </button>
          <button @click="loadExtra(60)" :disabled="isLoadingHistory"
            class="flex-1 md:flex-none px-3 py-1.5 bg-zinc-200 dark:bg-neutral-800 hover:bg-zinc-300 dark:hover:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 rounded text-xs text-zinc-700 dark:text-gray-300 hover:text-zinc-900 dark:hover:text-white transition disabled:opacity-50">
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
