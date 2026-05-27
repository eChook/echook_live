<!--
  @file components/tabs/AnalyticsTab.vue
  @brief Admin-only analytics tab for live and historical telemetry insights.
  @description Computes derived metrics from existing telemetry channels:
               race start behavior, throttle histogram, overlap warnings,
               and supply resistance estimation.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'
import {
  computeThrottleHistogram,
  computeThrottleBrakeOverlap,
  computeStartMetrics,
  computeSupplyResistance,
  computeSessionStintKpis,
  computeEnergyThermalSummary,
  computeBaselineComparison,
  detectReliabilityEvents,
  buildEventJumpWindow,
  buildAnalyticsSummaryReport
} from '../../utils/analyticsMetrics'
import { exportEventsAsCsv, downloadTextFile } from '../../utils/csvExport'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()

/** @brief Current analytics mode. */
const mode = ref('live')
/** @brief Selected race key for history mode. */
const selectedRaceKey = ref(null)
/** @brief Optional comparison race key in history mode. */
const selectedComparisonRaceKey = ref(null)
/** @brief Start metrics card open state for auto-collapse behavior. */
const isStartCardOpen = ref(true)
/** @brief Shared collapse state for analytics cards. */
const cardsCollapsed = ref(false)

/** @brief Analytics settings with safe defaults. */
const analyticsConfig = computed(() => settings.analyticsSettings || {})

/** @brief Live analysis window duration in ms. */
const liveWindowMs = computed(() => {
  const minutes = Number.isFinite(analyticsConfig.value.liveWindowMinutes)
    ? analyticsConfig.value.liveWindowMinutes
    : 10
  return Math.max(1, minutes) * 60 * 1000
})

/** @brief Races sorted newest first. */
const sortedRaces = computed(() =>
  Object.values(telemetry.races).sort((a, b) => b.startTimeMs - a.startTimeMs)
)

watch(sortedRaces, (races) => {
  if (races.length === 0) return
  const selectedStillExists = races.some((race) => String(race.startTimeMs) === selectedRaceKey.value)
  if (!selectedRaceKey.value || !selectedStillExists) {
    selectedRaceKey.value = String(races[0].startTimeMs)
  }
  const comparisonStillExists = races.some((race) => String(race.startTimeMs) === selectedComparisonRaceKey.value)
  if (!selectedComparisonRaceKey.value || !comparisonStillExists || selectedComparisonRaceKey.value === selectedRaceKey.value) {
    const fallback = races.find((race) => String(race.startTimeMs) !== selectedRaceKey.value)
    selectedComparisonRaceKey.value = fallback ? String(fallback.startTimeMs) : null
  }
}, { immediate: true })

/** @brief Most recent packet timestamp available for filtering windows. */
const latestTimestamp = computed(() => {
  const latest = telemetry.history[telemetry.history.length - 1]
  return latest?.timestamp || Date.now()
})

/** @brief Live-mode sample window. */
const liveSamples = computed(() => {
  if (telemetry.displayHistory.length === 0) return []
  const end = latestTimestamp.value
  const start = end - liveWindowMs.value
  return telemetry.displayHistory.filter((sample) => sample.timestamp >= start && sample.timestamp <= end)
})

/** @brief History-mode sample window for selected race. */
const historySamples = computed(() => {
  if (sortedRaces.value.length === 0 || telemetry.displayHistory.length === 0 || !selectedRaceKey.value) return []

  const raceStart = Number(selectedRaceKey.value)
  const selectedIndex = sortedRaces.value.findIndex((race) => race.startTimeMs === raceStart)
  if (selectedIndex < 0) return []

  const race = sortedRaces.value[selectedIndex]
  const nextOlderRace = sortedRaces.value[selectedIndex + 1]
  const start = race.startTimeMs
  const end = nextOlderRace
    ? nextOlderRace.startTimeMs
    : latestTimestamp.value

  return telemetry.displayHistory.filter((sample) => sample.timestamp >= start && sample.timestamp <= end)
})

/** @brief History samples for optional second race comparison. */
const comparisonHistorySamples = computed(() => {
  if (mode.value !== 'history') return []
  if (sortedRaces.value.length === 0 || telemetry.displayHistory.length === 0 || !selectedComparisonRaceKey.value) return []

  const raceStart = Number(selectedComparisonRaceKey.value)
  const selectedIndex = sortedRaces.value.findIndex((race) => race.startTimeMs === raceStart)
  if (selectedIndex < 0) return []
  const race = sortedRaces.value[selectedIndex]
  const nextOlderRace = sortedRaces.value[selectedIndex + 1]
  const end = nextOlderRace ? nextOlderRace.startTimeMs : latestTimestamp.value
  return telemetry.displayHistory.filter((sample) => sample.timestamp >= race.startTimeMs && sample.timestamp <= end)
})

/** @brief Samples currently used for analytics calculations. */
const activeSamples = computed(() => (mode.value === 'live' ? liveSamples.value : historySamples.value))

/** @brief Lap summaries for active mode (for session KPI parity with Laps tab). */
const activeLaps = computed(() => {
  if (sortedRaces.value.length === 0) return []
  if (mode.value === 'history') {
    const race = sortedRaces.value.find((entry) => String(entry.startTimeMs) === selectedRaceKey.value)
    return race ? Object.values(race.laps || {}).sort((a, b) => a.lapNumber - b.lapNumber) : []
  }
  const newestRace = sortedRaces.value[0]
  return newestRace ? Object.values(newestRace.laps || {}).sort((a, b) => a.lapNumber - b.lapNumber) : []
})

/** @brief Laps for optional baseline race in history comparison. */
const comparisonLaps = computed(() => {
  if (mode.value !== 'history' || !selectedComparisonRaceKey.value) return []
  const race = sortedRaces.value.find((entry) => String(entry.startTimeMs) === selectedComparisonRaceKey.value)
  return race ? Object.values(race.laps || {}).sort((a, b) => a.lapNumber - b.lapNumber) : []
})

/** @brief Histogram metrics for current window. */
const throttleHistogram = computed(() =>
  computeThrottleHistogram(activeSamples.value, {
    maxDtMs: 10000
  })
)

/** @brief Overlap metrics for current window. */
const overlapMetrics = computed(() =>
  computeThrottleBrakeOverlap(activeSamples.value, {
    maxDtMs: 10000,
    throttleThresholdPct: Number.isFinite(analyticsConfig.value.throttleOverlapThresholdPct)
      ? analyticsConfig.value.throttleOverlapThresholdPct
      : 5
  })
)

/** @brief Start-phase metrics for current window. */
const startMetrics = computed(() =>
  computeStartMetrics(activeSamples.value, {
    speedUnit: telemetry.unitSettings.speedUnit,
    startCurrentThreshold: Number.isFinite(analyticsConfig.value.startCurrentThresholdA)
      ? analyticsConfig.value.startCurrentThresholdA
      : 10,
    startWindowMs: 30000,
    manualStartTimestamp: Number.isFinite(analyticsConfig.value.manualStartOffsetSec)
      ? ((activeSamples.value[0]?.timestamp || 0) + (analyticsConfig.value.manualStartOffsetSec * 1000))
      : null
  })
)

/** @brief Supply resistance estimate for current window. */
const resistanceMetrics = computed(() =>
  computeSupplyResistance(activeSamples.value, {
    minSampleCount: 8,
    minCurrentSpread: 5
  })
)

/** @brief Session/stint KPI summary aligned with Laps tab. */
const sessionKpis = computed(() => computeSessionStintKpis(activeLaps.value, activeSamples.value, { lastNLaps: 5 }))

/** @brief Energy and thermal summary cards for current mode window. */
const energyThermal = computed(() =>
  computeEnergyThermalSummary(activeSamples.value, {
    speedUnit: telemetry.unitSettings.speedUnit,
    maxDtMs: 10000
  })
)

/** @brief Reliability event stream for current mode window. */
const reliabilityEvents = computed(() => detectReliabilityEvents(activeSamples.value, {
  nowTimestamp: latestTimestamp.value,
  throttleOverlapThresholdPct: Number.isFinite(analyticsConfig.value.throttleOverlapThresholdPct)
    ? analyticsConfig.value.throttleOverlapThresholdPct
    : 5,
  undervoltageWarningV: analyticsConfig.value.eventUndervoltageWarningV,
  undervoltageCriticalV: analyticsConfig.value.eventUndervoltageCriticalV,
  overTempWarningC: analyticsConfig.value.eventOverTempWarningC,
  overTempCriticalC: analyticsConfig.value.eventOverTempCriticalC,
  currentSpikeWarningA: analyticsConfig.value.eventCurrentSpikeWarningA,
  currentSpikeCriticalA: analyticsConfig.value.eventCurrentSpikeCriticalA,
  dropoutWarningSec: analyticsConfig.value.eventDropoutWarningSec,
  dropoutCriticalSec: analyticsConfig.value.eventDropoutCriticalSec,
  staleLiveWarningSec: analyticsConfig.value.eventStaleWarningSec,
  staleLiveCriticalSec: analyticsConfig.value.eventStaleCriticalSec,
  overlapWarningSec: analyticsConfig.value.eventOverlapWarningSec,
  overlapCriticalSec: analyticsConfig.value.eventOverlapCriticalSec
}))

/** @brief Optional baseline race comparison for history mode. */
const baselineComparison = computed(() => {
  if (mode.value !== 'history') return null
  if (!analyticsConfig.value.enableSideBySideHistoryCompare) return null
  if (activeLaps.value.length === 0 || comparisonLaps.value.length === 0) return null
  return computeBaselineComparison(activeLaps.value, comparisonLaps.value, historySamples.value, comparisonHistorySamples.value)
})

watch([mode, startMetrics, analyticsConfig], () => {
  if (mode.value !== 'live') {
    isStartCardOpen.value = true
    return
  }
  const autoCollapseSec = Number.isFinite(analyticsConfig.value.autoCollapseStartCardSec)
    ? analyticsConfig.value.autoCollapseStartCardSec
    : 60
  const startTs = startMetrics.value?.startTimestamp
  if (!Number.isFinite(startTs) || autoCollapseSec <= 0) return
  const elapsedSec = (latestTimestamp.value - startTs) / 1000
  if (elapsedSec >= autoCollapseSec) {
    isStartCardOpen.value = false
  }
}, { immediate: true, deep: true })

/**
 * @brief Format metric value for display with fallback.
 * @param {number|null} value - Numeric value
 * @param {number} [digits=2] - Decimal digits
 * @returns {string} Formatted value
 */
function formatMetric(value, digits = 2) {
  if (!Number.isFinite(value)) return '-'
  return Number(value).toFixed(digits)
}

/**
 * @brief Format signed values with explicit +/- prefix.
 * @param {number|null} value - Numeric value
 * @param {number} [digits=2] - Decimal digits
 * @returns {string} Signed value
 */
function formatSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return '-'
  return `${value > 0 ? '+' : ''}${Number(value).toFixed(digits)}`
}

/**
 * @brief Create sparkline SVG path from numeric series.
 * @param {number[]} values - Numeric values
 * @param {number} [width=128] - SVG width
 * @param {number} [height=40] - SVG height
 * @returns {string} SVG path string
 */
function buildSparklinePath(values, width = 128, height = 40) {
  if (!Array.isArray(values) || values.length === 0) return ''
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return ''
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * width : width / 2
      const y = height - (((value - min) / range) * height)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

/**
 * @brief Format timestamp as local date-time string.
 * @param {number} timestampMs - Timestamp in ms
 * @returns {string} Local date/time text
 */
function formatDateTime(timestampMs) {
  if (!Number.isFinite(timestampMs)) return 'Unknown'
  return new Date(timestampMs).toLocaleString()
}

/**
 * @brief Event severity badge class map.
 * @param {'info'|'warning'|'critical'} severity - Severity string
 * @returns {string} Utility class list
 */
function getEventSeverityClass(severity) {
  if (severity === 'critical') return 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/20'
  if (severity === 'warning') return 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/20'
  return 'text-zinc-700 dark:text-gray-300 bg-zinc-200 dark:bg-neutral-700'
}

/**
 * @brief Jump graph view to event-centric window.
 * @param {Object} event - Event item with timestamp bounds
 */
function jumpToEvent(event) {
  const window = buildEventJumpWindow(event, { paddingBeforeMs: 15000, paddingAfterMs: 15000 })
  if (!window) return
  telemetry.requestChartZoom?.(window.start, window.end)
  if (!telemetry.isPaused && typeof telemetry.togglePause === 'function') telemetry.togglePause()
  settings.activeTabId = 'graph'
}

/**
 * @brief Export reliability event list as CSV.
 */
function handleExportEventsCsv() {
  exportEventsAsCsv(reliabilityEvents.value, { filenamePrefix: 'eChook-events' })
}

/**
 * @brief Build summary text for copy/download workflows.
 * @returns {string} Summary report text
 */
function getSummaryText() {
  return buildAnalyticsSummaryReport({
    sessionKpis: sessionKpis.value,
    energyThermal: energyThermal.value,
    overlapMetrics: overlapMetrics.value,
    events: reliabilityEvents.value
  })
}

/**
 * @brief Copy analytics summary to clipboard.
 */
async function copySummaryToClipboard() {
  await navigator.clipboard.writeText(getSummaryText())
}

/**
 * @brief Download analytics summary report as text file.
 */
function downloadSummaryReport() {
  const filename = `eChook-analytics-summary-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`
  downloadTextFile(getSummaryText(), filename)
}
</script>

<template>
  <div class="h-full flex flex-col p-3 md:p-6 space-y-4 overflow-hidden">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h2 class="text-lg md:text-xl font-bold text-zinc-900 dark:text-white">Analytics</h2>
        <p class="text-xs text-zinc-600 dark:text-gray-400">
          Derived metrics from current telemetry channels for race review and live monitoring.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="mode = 'live'"
          class="px-3 py-1.5 rounded text-xs font-semibold border transition"
          :class="mode === 'live'
            ? 'bg-primary/20 text-primary border-primary/40'
            : 'bg-zinc-200 dark:bg-neutral-800 border-zinc-300 dark:border-neutral-700 text-zinc-700 dark:text-gray-300'"
        >
          Live Race
        </button>
        <button
          @click="mode = 'history'"
          class="px-3 py-1.5 rounded text-xs font-semibold border transition"
          :class="mode === 'history'
            ? 'bg-primary/20 text-primary border-primary/40'
            : 'bg-zinc-200 dark:bg-neutral-800 border-zinc-300 dark:border-neutral-700 text-zinc-700 dark:text-gray-300'"
        >
          History
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        @click="cardsCollapsed = !cardsCollapsed"
        class="px-3 py-1.5 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-800 border-zinc-300 dark:border-neutral-700 text-zinc-700 dark:text-gray-300"
      >
        {{ cardsCollapsed ? 'Expand Cards' : 'Collapse Cards' }}
      </button>
      <button
        @click="copySummaryToClipboard"
        class="px-3 py-1.5 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-800 border-zinc-300 dark:border-neutral-700 text-zinc-700 dark:text-gray-300"
      >
        Copy Summary
      </button>
      <button
        @click="downloadSummaryReport"
        class="px-3 py-1.5 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-800 border-zinc-300 dark:border-neutral-700 text-zinc-700 dark:text-gray-300"
      >
        Export Summary
      </button>
    </div>

    <div v-if="mode === 'history'" class="flex flex-wrap items-center gap-2">
      <label for="analytics-race" class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">Race</label>
      <select
        id="analytics-race"
        v-model="selectedRaceKey"
        class="bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-3 py-1.5 text-xs text-zinc-800 dark:text-gray-200"
      >
        <option v-for="race in sortedRaces" :key="race.startTimeMs" :value="String(race.startTimeMs)">
          {{ race.trackName || 'Unknown Track' }} - {{ formatDateTime(race.startTimeMs) }}
        </option>
      </select>
      <label v-if="analyticsConfig.enableSideBySideHistoryCompare" for="analytics-race-compare" class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">Compare</label>
      <select
        v-if="analyticsConfig.enableSideBySideHistoryCompare"
        id="analytics-race-compare"
        v-model="selectedComparisonRaceKey"
        class="bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-3 py-1.5 text-xs text-zinc-800 dark:text-gray-200"
      >
        <option v-for="race in sortedRaces.filter((entry) => String(entry.startTimeMs) !== selectedRaceKey)" :key="race.startTimeMs" :value="String(race.startTimeMs)">
          {{ race.trackName || 'Unknown Track' }} - {{ formatDateTime(race.startTimeMs) }}
        </option>
      </select>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label class="text-xs text-zinc-600 dark:text-gray-400">
        Manual Race Start Offset (s)
        <input
          v-model.number="settings.analyticsSettings.manualStartOffsetSec"
          type="number"
          min="0"
          step="1"
          placeholder="Auto"
          class="mt-1 w-full bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-3 py-1.5 text-xs text-zinc-800 dark:text-gray-200"
        >
      </label>
      <label class="text-xs text-zinc-600 dark:text-gray-400">
        Auto-collapse Start Card After (s)
        <input
          v-model.number="settings.analyticsSettings.autoCollapseStartCardSec"
          type="number"
          min="0"
          step="1"
          class="mt-1 w-full bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-3 py-1.5 text-xs text-zinc-800 dark:text-gray-200"
        >
      </label>
      <label class="text-xs text-zinc-600 dark:text-gray-400 flex items-center gap-2 mt-5">
        <input v-model="settings.analyticsSettings.enableSideBySideHistoryCompare" type="checkbox" class="rounded border-zinc-300 dark:border-neutral-700">
        Enable side-by-side race comparison
      </label>
    </div>

    <div v-if="activeSamples.length === 0" class="flex-1 flex items-center justify-center text-zinc-500 dark:text-gray-500 italic">
      No telemetry samples available for this view.
    </div>

    <div v-else class="flex-1 overflow-y-auto space-y-4 pr-1">
      <details class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4" :open="!cardsCollapsed">
        <summary class="cursor-pointer text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
          Session KPI Summary
        </summary>
        <div class="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm text-zinc-700 dark:text-gray-300">
          <div>Best Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.bestLapTimeSec) }} s</span></div>
          <div>Median Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.medianLapTimeSec) }} s</span></div>
          <div>Consistency: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.lapConsistencyStdDevSec) }} s</span></div>
          <div>Total Laps: <span class="font-mono text-zinc-900 dark:text-white">{{ sessionKpis.totalLaps }}</span></div>
          <div>Total Ah: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.totalAh) }} Ah</span></div>
          <div>Avg Eff: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.averageEfficiency) }}</span></div>
          <div>Max Temp: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.maxTemp) }} °</span></div>
          <div>Max Imbalance: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.maxImbalance, 3) }} V</span></div>
          <div class="md:col-span-2">
            Last 5 Lap Trend:
            <span class="font-mono text-zinc-900 dark:text-white">{{ sessionKpis.lastNLaps.length > 0 ? sessionKpis.lastNLaps.map((value) => Number(value).toFixed(2)).join(' / ') : '-' }}</span>
            <div class="text-[11px] text-zinc-500 dark:text-gray-400">Slope {{ formatSigned(sessionKpis.lastNTrendSlopeSecPerLap, 3) }} s/lap</div>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="rounded border border-zinc-200 dark:border-neutral-700 p-2">
            <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">LL_Time degradation</div>
            <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
              <path :d="buildSparklinePath(sessionKpis.degradation.lapTime.sparkline)" fill="none" stroke="currentColor" class="text-primary" stroke-width="2" />
            </svg>
          </div>
          <div class="rounded border border-zinc-200 dark:border-neutral-700 p-2">
            <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">LL_Ah degradation</div>
            <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
              <path :d="buildSparklinePath(sessionKpis.degradation.lapAh.sparkline)" fill="none" stroke="currentColor" class="text-amber-500" stroke-width="2" />
            </svg>
          </div>
          <div class="rounded border border-zinc-200 dark:border-neutral-700 p-2">
            <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">LL_Eff degradation</div>
            <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
              <path :d="buildSparklinePath(sessionKpis.degradation.lapEfficiency.sparkline)" fill="none" stroke="currentColor" class="text-emerald-500" stroke-width="2" />
            </svg>
          </div>
        </div>
      </details>

      <details
        v-if="baselineComparison"
        class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4"
        :open="!cardsCollapsed"
      >
        <summary class="cursor-pointer text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
          Baseline Comparison
        </summary>
        <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-zinc-700 dark:text-gray-300">
          <div>Δ Best Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.bestLapTimeSec, 2) }} s</span></div>
          <div>Δ Median Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.medianLapTimeSec, 2) }} s</span></div>
          <div>Δ Total Ah: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.totalAh, 3) }} Ah</span></div>
          <div>Δ Avg Efficiency: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.averageEfficiency, 3) }}</span></div>
        </div>
      </details>

      <div v-show="!cardsCollapsed" class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">Energy</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Total: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.totalWh, 2) }} Wh</span></div>
            <div>Wh/Mile: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.whPerMile, 2) }}</span></div>
            <div>Distance: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.distanceMiles, 3) }} mi</span></div>
          </div>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">Power</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Average: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.avgPowerW, 1) }} W</span></div>
            <div>Peak: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.peakPowerW, 1) }} W</span></div>
            <div>Avg Current: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.avgCurrent, 2) }} A</span></div>
          </div>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">Voltage / Imbalance</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Avg Voltage: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.avgVoltage, 2) }} V</span></div>
            <div>Max Imbalance: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.maxVoltageDiff, 3) }} V</span></div>
            <div>Avg Imbalance: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.avgVoltageDiff, 3) }} V</span></div>
          </div>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">Thermal</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Max Temp: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.maxTemp, 1) }} °</span></div>
            <div>Rise Rate: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(energyThermal.tempRisePerMin, 2) }} °/min</span></div>
            <div>Mode: <span class="font-mono text-zinc-900 dark:text-white uppercase">{{ mode }}</span></div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <details class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4" :open="isStartCardOpen && !cardsCollapsed">
          <summary class="cursor-pointer text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">Race Start</summary>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300 mt-3">
            <div>Peak Current (30s): <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.peakCurrentFirst30sA, 1) }} A</span></div>
            <div>Wh First 30s: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.whFirst30s, 3) }} Wh</span></div>
            <div>0-10 mph: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.time0to10mphSec, 2) }} s</span></div>
            <div>0-20 mph: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.time0to20mphSec, 2) }} s</span></div>
          </div>
          <p class="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
            {{ startMetrics.disclaimer }}
          </p>
        </details>

        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">Throttle + Brake Overlap</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Events: <span class="font-mono text-zinc-900 dark:text-white">{{ overlapMetrics.eventCount }}</span></div>
            <div>Total Duration: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(overlapMetrics.totalDurationSec, 2) }} s</span></div>
            <div>Longest Event: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(overlapMetrics.maxDurationSec, 2) }} s</span></div>
            <div>Overlap Energy: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(overlapMetrics.overlapWh, 3) }} Wh</span></div>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">Supply Resistance</div>
          <div v-if="resistanceMetrics.valid" class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>R Estimate: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(resistanceMetrics.rMilliOhm, 3) }} mΩ</span></div>
            <div>Fit (R²): <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(resistanceMetrics.fitR2, 3) }}</span></div>
            <div>Samples: <span class="font-mono text-zinc-900 dark:text-white">{{ resistanceMetrics.sampleCount }}</span></div>
            <div>Confidence: <span class="font-mono text-zinc-900 dark:text-white uppercase">{{ resistanceMetrics.confidence }}</span></div>
          </div>
          <div v-else class="text-sm text-zinc-600 dark:text-gray-400">
            Not enough quality data for resistance estimation
            <span v-if="resistanceMetrics.reason" class="font-mono">({{ resistanceMetrics.reason }})</span>.
          </div>
        </div>
      </div>

      <div v-show="!cardsCollapsed" class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
        <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">
          Throttle Histogram (Time / Energy)
        </div>

        <div class="space-y-3">
          <div v-for="bin in throttleHistogram.bins" :key="bin.id" class="space-y-1">
            <div class="flex items-center justify-between text-xs text-zinc-600 dark:text-gray-400">
              <span class="font-semibold text-zinc-800 dark:text-gray-200">{{ bin.label }}</span>
              <span class="font-mono">
                {{ formatMetric(bin.timePct, 1) }}% time / {{ formatMetric(bin.whPct, 1) }}% Wh
              </span>
            </div>
            <div class="h-2 w-full bg-zinc-200 dark:bg-neutral-700 rounded overflow-hidden">
              <div class="h-full bg-primary/70 rounded" :style="{ width: `${Math.max(0, Math.min(100, bin.timePct))}%` }"></div>
            </div>
            <div class="h-2 w-full bg-zinc-200 dark:bg-neutral-700 rounded overflow-hidden">
              <div class="h-full bg-emerald-500/70 rounded" :style="{ width: `${Math.max(0, Math.min(100, bin.whPct))}%` }"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">Reliability Event Log</div>
          <button
            @click="handleExportEventsCsv"
            class="px-2.5 py-1 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-700 border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300"
          >
            Export Events CSV
          </button>
        </div>
        <div v-if="reliabilityEvents.length === 0" class="text-sm text-zinc-500 dark:text-gray-400 italic">
          No reliability events triggered in current window.
        </div>
        <div v-else class="space-y-2 max-h-72 overflow-y-auto pr-1">
          <div
            v-for="event in reliabilityEvents"
            :key="event.id"
            class="border border-zinc-200 dark:border-neutral-700 rounded p-2.5 bg-zinc-50 dark:bg-neutral-900/40"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="px-2 py-0.5 rounded uppercase tracking-wider font-semibold" :class="getEventSeverityClass(event.severity)">{{ event.severity }}</span>
              <span class="font-semibold text-zinc-800 dark:text-gray-200">{{ event.title }}</span>
              <span class="font-mono text-zinc-500 dark:text-gray-400">{{ formatDateTime(event.timestamp) }}</span>
              <button
                @click="jumpToEvent(event)"
                class="ml-auto px-2 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition"
              >
                Jump to Graph
              </button>
            </div>
            <p class="text-xs text-zinc-600 dark:text-gray-400 mt-1">{{ event.message }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
