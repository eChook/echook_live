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
  computeSupplyResistance
} from '../../utils/analyticsMetrics'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()

/** @brief Current analytics mode. */
const mode = ref('live')
/** @brief Selected race key for history mode. */
const selectedRaceKey = ref(null)

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
}, { immediate: true })

/** @brief Most recent packet timestamp available for filtering windows. */
const latestTimestamp = computed(() => {
  const latest = telemetry.history[telemetry.history.length - 1]
  return latest?.timestamp || Date.now()
})

/** @brief Live-mode sample window. */
const liveSamples = computed(() => {
  if (telemetry.history.length === 0) return []
  const end = latestTimestamp.value
  const start = end - liveWindowMs.value
  return telemetry.history.filter((sample) => sample.timestamp >= start && sample.timestamp <= end)
})

/** @brief History-mode sample window for selected race. */
const historySamples = computed(() => {
  if (sortedRaces.value.length === 0 || telemetry.history.length === 0 || !selectedRaceKey.value) return []

  const raceStart = Number(selectedRaceKey.value)
  const selectedIndex = sortedRaces.value.findIndex((race) => race.startTimeMs === raceStart)
  if (selectedIndex < 0) return []

  const race = sortedRaces.value[selectedIndex]
  const nextOlderRace = sortedRaces.value[selectedIndex + 1]
  const start = race.startTimeMs
  const end = nextOlderRace
    ? nextOlderRace.startTimeMs
    : latestTimestamp.value

  return telemetry.history.filter((sample) => sample.timestamp >= start && sample.timestamp <= end)
})

/** @brief Samples currently used for analytics calculations. */
const activeSamples = computed(() => (mode.value === 'live' ? liveSamples.value : historySamples.value))

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
    startWindowMs: 30000
  })
)

/** @brief Supply resistance estimate for current window. */
const resistanceMetrics = computed(() =>
  computeSupplyResistance(activeSamples.value, {
    minSampleCount: 8,
    minCurrentSpread: 5
  })
)

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
 * @brief Format timestamp as local date-time string.
 * @param {number} timestampMs - Timestamp in ms
 * @returns {string} Local date/time text
 */
function formatDateTime(timestampMs) {
  if (!Number.isFinite(timestampMs)) return 'Unknown'
  return new Date(timestampMs).toLocaleString()
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

    <div v-if="mode === 'history'" class="flex items-center gap-2">
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
    </div>

    <div v-if="activeSamples.length === 0" class="flex-1 flex items-center justify-center text-zinc-500 dark:text-gray-500 italic">
      No telemetry samples available for this view.
    </div>

    <div v-else class="flex-1 overflow-y-auto space-y-4 pr-1">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">Race Start</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Peak Current (30s): <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.peakCurrentFirst30sA, 1) }} A</span></div>
            <div>Wh First 30s: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.whFirst30s, 3) }} Wh</span></div>
            <div>0-10 mph: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.time0to10mphSec, 2) }} s</span></div>
            <div>0-20 mph: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.time0to20mphSec, 2) }} s</span></div>
          </div>
          <p class="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
            {{ startMetrics.disclaimer }}
          </p>
        </div>

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

      <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
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
    </div>
  </div>
</template>
