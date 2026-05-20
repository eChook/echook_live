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
import { computed, ref, onMounted } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'
import { ChartBarIcon, ArrowPathIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import {
  computeStartMetrics,
  computeThrottleBrakeOverlap,
  computeSessionStintKpis,
  filterLapSummaries,
  computeBaselineComparison
} from '../../utils/analyticsMetrics'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()
const auth = useAuthStore()

/** @brief Resolve race sample window from race list index. */
function getRaceSamplesByIndex(raceList, raceIndex) {
  const race = raceList[raceIndex]
  if (!race) return []
  const nextOlderRace = raceList[raceIndex + 1]
  const raceStart = race.startTimeMs
  const raceEnd = nextOlderRace
    ? nextOlderRace.startTimeMs
    : (telemetry.history[telemetry.history.length - 1]?.timestamp || Date.now())
  return telemetry.history.filter((sample) => sample.timestamp >= raceStart && sample.timestamp <= raceEnd)
}

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

  return raceList.map((race, raceIndex) => {
    const raceSamples = getRaceSamplesByIndex(raceList, raceIndex)

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
    const stintKpis = computeSessionStintKpis(filteredLapResult.laps, raceSamples, { lastNLaps: 5 })
    const lapDeltaLookup = stintKpis.lapTimesWithDelta.reduce((lookup, lapSummary) => {
      lookup[lapSummary.lapNumber] = lapSummary
      return lookup
    }, {})

    let baselineComparison = null
    const baselineRace = raceList.slice(raceIndex + 1).find((candidate) => {
      if (settings.analyticsSettings?.baselineRequireTrackMatch !== false) {
        return (candidate.trackName || '').trim() === (race.trackName || '').trim()
      }
      return true
    })
    if (baselineRace) {
      const baselineIndex = raceList.findIndex((entry) => entry.startTimeMs === baselineRace.startTimeMs)
      const baselineSamples = getRaceSamplesByIndex(raceList, baselineIndex)
      baselineComparison = computeBaselineComparison(filteredLapResult.laps, Object.values(baselineRace.laps || {}), raceSamples, baselineSamples)
      baselineComparison.baselineRaceName = baselineRace.trackName || 'Unknown Track'
      baselineComparison.baselineRaceStart = baselineRace.startTimeMs
    }

    return {
      ...race,
      startTime: race.startTimeMs,
      sortedLaps,
      stats,
      excludedLaps: filteredLapResult.excluded,
      stintKpis,
      filteredLapCount: filteredLapResult.laps.length,
      sourceLapCount: convertedLaps.length,
      lapDeltaLookup,
      baselineComparison,
      startSummary: computeStartMetrics(raceSamples, {
        speedUnit: telemetry.unitSettings.speedUnit,
        startCurrentThreshold: Number.isFinite(settings.analyticsSettings?.startCurrentThresholdA)
          ? settings.analyticsSettings.startCurrentThresholdA
          : 10
      }),
      overlapSummary: computeThrottleBrakeOverlap(raceSamples, {
        throttleThresholdPct: Number.isFinite(settings.analyticsSettings?.throttleOverlapThresholdPct)
          ? settings.analyticsSettings.throttleOverlapThresholdPct
          : 5
      })
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
 * @brief Format signed metric values for trend and delta labels.
 */
const formatSigned = (value, digits = 2) => {
  if (!Number.isFinite(value)) return '-'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`
}

/**
 * @brief Severity label for throttle+brake overlap duration.
 */
const getOverlapSeverity = (overlapSummary) => {
  const total = overlapSummary?.totalDurationSec || 0
  if (total >= 3) return 'Critical'
  if (total >= 1) return 'Warning'
  return 'OK'
}

/**
 * @brief Color class for overlap severity badge.
 */
const getOverlapSeverityClass = (severity) => {
  if (severity === 'Critical') return 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/20'
  if (severity === 'Warning') return 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20'
  return 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20'
}

/**
 * @brief Badge classes for lap confidence labels.
 */
const getConfidenceClass = (label) => {
  if (label === 'invalid') return 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/20'
  if (label === 'suspect') return 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/20'
  return 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/20'
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

/**
 * @brief Create an SVG path string for compact sparkline rendering.
 */
const buildSparklinePath = (values, width = 128, height = 40) => {
  if (!Array.isArray(values) || values.length === 0) return ''
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return ''
  const minValue = Math.min(...finite)
  const maxValue = Math.max(...finite)
  const range = maxValue - minValue || 1
  return values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * width : width / 2
      const y = height - (((value - minValue) / range) * height)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
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

    <!-- Lap Confidence + Filters -->
    <section class="bg-zinc-50 dark:bg-neutral-900/60 border border-zinc-200 dark:border-neutral-700 rounded-lg p-3 md:p-4">
      <h3 class="text-xs md:text-sm font-semibold text-zinc-800 dark:text-gray-200 uppercase tracking-wider">Lap Confidence Filters</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-xs">
        <label class="flex items-center gap-2 text-zinc-700 dark:text-gray-300">
          <input v-model="settings.analyticsSettings.hideSuspectLaps" type="checkbox" class="rounded border-zinc-300 dark:border-neutral-700">
          Hide suspect laps
        </label>
        <label class="flex items-center gap-2 text-zinc-700 dark:text-gray-300">
          <input v-model="settings.analyticsSettings.hideInvalidLaps" type="checkbox" class="rounded border-zinc-300 dark:border-neutral-700">
          Hide invalid laps
        </label>
        <label class="flex items-center gap-2 text-zinc-700 dark:text-gray-300">
          <input v-model="settings.analyticsSettings.excludeFirstLap" type="checkbox" class="rounded border-zinc-300 dark:border-neutral-700">
          Exclude first lap (out-lap)
        </label>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-xs">
        <label class="block text-zinc-600 dark:text-gray-400">
          Min Lap Time (s)
          <input
            v-model.number="settings.analyticsSettings.minimumLapTimeSec"
            type="number"
            min="0"
            step="0.1"
            class="mt-1 w-full bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-2 py-1 text-zinc-900 dark:text-gray-100"
          >
        </label>
        <label class="block text-zinc-600 dark:text-gray-400">
          Confidence Min Time (s)
          <input
            v-model.number="settings.analyticsSettings.lapConfidenceMinTimeSec"
            type="number"
            min="1"
            step="0.5"
            class="mt-1 w-full bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-2 py-1 text-zinc-900 dark:text-gray-100"
          >
        </label>
        <label class="block text-zinc-600 dark:text-gray-400">
          Confidence Max Time (s)
          <input
            v-model.number="settings.analyticsSettings.lapConfidenceMaxTimeSec"
            type="number"
            min="1"
            step="1"
            class="mt-1 w-full bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-2 py-1 text-zinc-900 dark:text-gray-100"
          >
        </label>
      </div>
    </section>

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

        <!-- Session KPI Summary -->
        <details class="bg-zinc-50 dark:bg-neutral-900/60 border border-zinc-200 dark:border-neutral-700 rounded-lg p-3" open>
          <summary class="cursor-pointer text-xs md:text-sm font-semibold text-zinc-800 dark:text-gray-200">
            Session KPI and Stint Summary
          </summary>
          <div class="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div class="text-zinc-600 dark:text-gray-400">Best Lap<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatValue(race.stintKpis.bestLapTimeSec) }} s</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Median Lap<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatValue(race.stintKpis.medianLapTimeSec) }} s</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Consistency (Std Dev)<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatValue(race.stintKpis.lapConsistencyStdDevSec) }} s</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Total Ah<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatValue(race.stintKpis.totalAh) }} Ah</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Avg Efficiency<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatValue(race.stintKpis.averageEfficiency) }}</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Laps<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ race.stintKpis.totalLaps }}</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Max Temp<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatValue(race.stintKpis.maxTemp) }} °</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Max Imbalance<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatValue(race.stintKpis.maxImbalance) }} V</div></div>
            <div class="text-zinc-600 dark:text-gray-400 col-span-2">
              Last 5 Lap Trend
              <div class="font-mono text-zinc-900 dark:text-white font-semibold">
                {{ race.stintKpis.lastNLaps.length > 0 ? race.stintKpis.lastNLaps.map((value) => value.toFixed(2)).join(' / ') : '-' }}
              </div>
              <div class="text-[10px] text-zinc-500 dark:text-gray-500">
                slope {{ formatSigned(race.stintKpis.lastNTrendSlopeSecPerLap, 3) }} s/lap
              </div>
            </div>
          </div>
        </details>

        <details
          v-if="race.baselineComparison"
          class="bg-zinc-50 dark:bg-neutral-900/60 border border-zinc-200 dark:border-neutral-700 rounded-lg p-3"
        >
          <summary class="cursor-pointer text-xs md:text-sm font-semibold text-zinc-800 dark:text-gray-200">
            Baseline Comparison vs {{ race.baselineComparison.baselineRaceName }} ({{ formatDate(race.baselineComparison.baselineRaceStart) }})
          </summary>
          <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div class="text-zinc-600 dark:text-gray-400">Δ Best Lap<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatSigned(race.baselineComparison.deltas.bestLapTimeSec, 2) }} s</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Δ Median Lap<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatSigned(race.baselineComparison.deltas.medianLapTimeSec, 2) }} s</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Δ Total Ah<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatSigned(race.baselineComparison.deltas.totalAh, 3) }} Ah</div></div>
            <div class="text-zinc-600 dark:text-gray-400">Δ Avg Eff<div class="font-mono text-zinc-900 dark:text-white font-semibold">{{ formatSigned(race.baselineComparison.deltas.averageEfficiency, 3) }}</div></div>
          </div>
        </details>

        <!-- Lap Degradation -->
        <details class="bg-zinc-50 dark:bg-neutral-900/60 border border-zinc-200 dark:border-neutral-700 rounded-lg p-3">
          <summary class="cursor-pointer text-xs md:text-sm font-semibold text-zinc-800 dark:text-gray-200">
            Lap Degradation (Time / Ah / Efficiency)
          </summary>
          <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="rounded-md border border-zinc-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800/60">
              <div class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-gray-400 font-bold">Lap Time (LL_Time)</div>
              <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
                <path :d="buildSparklinePath(race.stintKpis.degradation.lapTime.sparkline)" fill="none" stroke="currentColor" class="text-primary" stroke-width="2" />
              </svg>
              <div class="text-[11px] text-zinc-600 dark:text-gray-400 mt-1">Trend: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(race.stintKpis.degradation.lapTime.trendSlopePerLap, 3) }}</span> s/lap</div>
            </div>
            <div class="rounded-md border border-zinc-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800/60">
              <div class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-gray-400 font-bold">Energy Per Lap (LL_Ah)</div>
              <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
                <path :d="buildSparklinePath(race.stintKpis.degradation.lapAh.sparkline)" fill="none" stroke="currentColor" class="text-amber-500" stroke-width="2" />
              </svg>
              <div class="text-[11px] text-zinc-600 dark:text-gray-400 mt-1">Trend: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(race.stintKpis.degradation.lapAh.trendSlopePerLap, 4) }}</span> Ah/lap</div>
            </div>
            <div class="rounded-md border border-zinc-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800/60">
              <div class="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-gray-400 font-bold">Efficiency (LL_Eff)</div>
              <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
                <path :d="buildSparklinePath(race.stintKpis.degradation.lapEfficiency.sparkline)" fill="none" stroke="currentColor" class="text-emerald-500" stroke-width="2" />
              </svg>
              <div class="text-[11px] text-zinc-600 dark:text-gray-400 mt-1">Trend: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(race.stintKpis.degradation.lapEfficiency.trendSlopePerLap, 3) }}</span> /lap</div>
            </div>
          </div>
        </details>

        <!-- Start Summary Strip -->
        <div
          class="grid grid-cols-1 md:grid-cols-5 gap-2 bg-zinc-50 dark:bg-neutral-900/60 border border-zinc-200 dark:border-neutral-700 rounded-lg p-2 md:p-3 text-xs">
          <div class="text-zinc-600 dark:text-gray-400">
            Peak Start Current
            <div class="font-mono text-zinc-900 dark:text-white font-semibold">
              {{ race.startSummary.detected ? formatValue(race.startSummary.peakCurrentFirst30sA) : '-' }} A
            </div>
          </div>
          <div class="text-zinc-600 dark:text-gray-400">
            Wh First 30s
            <div class="font-mono text-zinc-900 dark:text-white font-semibold">
              {{ race.startSummary.detected ? formatValue(race.startSummary.whFirst30s) : '-' }} Wh
            </div>
          </div>
          <div class="text-zinc-600 dark:text-gray-400">
            0-10 mph
            <div class="font-mono text-zinc-900 dark:text-white font-semibold">
              {{ race.startSummary.detected ? formatValue(race.startSummary.time0to10mphSec) : '-' }} s
            </div>
          </div>
          <div class="text-zinc-600 dark:text-gray-400">
            0-20 mph
            <div class="font-mono text-zinc-900 dark:text-white font-semibold">
              {{ race.startSummary.detected ? formatValue(race.startSummary.time0to20mphSec) : '-' }} s
            </div>
          </div>
          <div class="text-zinc-600 dark:text-gray-400">
            Overlap (Throttle+Brake)
            <div class="flex items-center gap-2 mt-1">
              <span
                class="px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]"
                :class="getOverlapSeverityClass(getOverlapSeverity(race.overlapSummary))">
                {{ getOverlapSeverity(race.overlapSummary) }}
              </span>
              <span class="font-mono text-zinc-900 dark:text-white font-semibold">
                {{ formatValue(race.overlapSummary.totalDurationSec) }}s
              </span>
            </div>
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
                  <div class="flex items-center space-x-2">
                    <span>{{ lap.lapNumber ?? '-' }}</span>
                    <span
                      class="px-1.5 py-0.5 rounded text-[9px] md:text-[10px] uppercase tracking-wider"
                      :class="getConfidenceClass(lap.confidenceLabel)"
                    >
                      {{ lap.confidenceLabel || 'good' }}
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
                  <div
                    v-if="key === 'LL_Time' && race.lapDeltaLookup?.[lap.lapNumber]"
                    class="relative z-10 mt-1 flex flex-wrap gap-2 text-[9px] md:text-[10px] text-zinc-500 dark:text-gray-500"
                  >
                    <span>Δ best: <span class="font-mono">{{ formatSigned(race.lapDeltaLookup[lap.lapNumber].deltaToBestSec, 2) }}</span>s</span>
                    <span>
                      Δ roll:
                      <span class="font-mono">
                        {{ formatSigned(race.lapDeltaLookup[lap.lapNumber].deltaToRollingAverageSec, 2) }}
                      </span>s
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
