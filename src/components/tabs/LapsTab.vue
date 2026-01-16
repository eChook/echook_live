<script setup>
import { computed } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()

// Headers for the table
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
const keys = ['lapNumber', 'startTime', 'finishTime', 'LL_Time', 'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_Eff']

const sortedRaces = computed(() => {
  // Show newest race first
  const raceList = Object.values(telemetry.races).sort((a, b) => b.startTimeMs - a.startTimeMs)

  return raceList.map(race => {
    const lapList = Object.values(race.laps).sort((a, b) => a.lapNumber - b.lapNumber)

    // 1. Create Converted Laps
    const convertedLaps = lapList.map(lap => {
      const newLap = { ...lap }

      // Convert Speed
      if (newLap.LL_Spd !== undefined) {
        let val = newLap.LL_Spd
        if (telemetry.unitSettings.speedUnit === 'mph') val = val * 2.23694
        if (telemetry.unitSettings.speedUnit === 'kph') val = val * 3.6
        newLap.LL_Spd = val
      }
      return newLap
    })

    // 2. Calculate stats for this race using convert laps
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
      startTime: race.startTimeMs, // Ensure formatDate can use this
      sortedLaps,
      stats
    }
  })
})

const formatValue = (val) => {
  if (typeof val === 'number') {
    return val.toFixed(2)
  }
  return val
}

const formatTime = (ms) => {
  if (!ms || !Number.isFinite(ms)) return '-'
  return new Date(ms).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const formatDate = (isoStringOrMs) => {
  if (!isoStringOrMs) return 'Unknown Time'
  return new Date(isoStringOrMs).toLocaleString()
}

// Comparison Logic
// Define "Good" direction for each key. 
// -1 means Lower is Better (Green). 1 means Higher is Better (Green).
const metricDirection = {
  'LL_Time': -1,
  'LL_Ah': -1,
  'LL_I': -1, // Assume lower amps is better efficiency? Or Neutral? Let's go efficiency.
  'LL_V': 1,  // Higher voltage is better (less sag)
  'LL_RPM': 1, // Higher RPM/Speed usually "better" performance
  'LL_Spd': 1,
  'LL_Eff': 1  // Higher efficiency is better
}

const getDiff = (currentLap, sortedLaps, key, currentIndex) => {
  // sortedLaps is Newest First (3, 2, 1).
  // So "previous lap" (chronologically) is the NEXT item in the array (index + 1).

  // We want the diff FROM the previous lap TO the current lap.
  // Diff = Current - Previous.

  const prevLapData = sortedLaps[currentIndex + 1]
  if (!prevLapData) return null

  const curr = currentLap[key] || 0
  const prev = prevLapData[key] || 0

  return curr - prev
}

const getDiffColor = (key, diff) => {
  if (Math.abs(diff) < 0.001) return 'text-gray-500' // No change

  const dir = metricDirection[key] || 1
  // If dir is 1 (Higher Better): Positive Diff = Green, Negative = Red
  // If dir is -1 (Lower Better): Negative Diff = Green, Positive = Red

  const isGood = (diff * dir) > 0
  return isGood ? 'text-green-500' : 'text-red-500'
}

const getBarPercent = (val, min, max) => {
  const cleanVal = val || 0
  const range = max - min
  if (range === 0) return 0
  return Math.min(100, Math.max(0, ((cleanVal - min) / range) * 100))
}

// Disclaimer Modal Logic
import DisclaimerModal from '../ui/DisclaimerModal.vue'
import { onMounted, ref } from 'vue'

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
  <div class="h-full flex flex-col p-6 overflow-hidden space-y-8">
    <div v-if="sortedRaces.length === 0" class="flex items-center justify-center h-full text-gray-500 italic">
      No lap data recorded yet.
    </div>

    <div class="flex-1 overflow-y-auto space-y-8 pr-2"> <!-- Scrollable container -->
      <div v-for="race in sortedRaces" :key="race.id" class="flex flex-col space-y-4">
        <!-- Changed z-10 to z-20 for header to stay above table content -->
        <div
          class="flex items-center justify-between sticky top-0 bg-neutral-900 z-20 py-2 border-b border-neutral-800">
          <h2 class="text-xl font-bold text-white tracking-tight">
            Race Start Time: <span class="text-primary font-mono">{{ formatDate(race.startTime) }}</span>
          </h2>
          <div class="text-sm text-gray-400">
            Laps: <span class="text-white font-mono font-bold">{{ race.sortedLaps.length }}</span>
          </div>
        </div>

        <div class="bg-neutral-800 rounded-lg border border-neutral-700 shadow-xl overflow-x-auto custom-scrollbar">
          <table class="w-full min-w-[1000px] text-left border-collapse">
            <thead class="bg-neutral-900">
              <tr>
                <th v-for="(header, i) in headers" :key="header"
                  class="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-neutral-700">
                  {{ header }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-700">
              <!-- Show laps in race REVERSED (newest first) -->
              <tr v-for="(lap, idx) in race.sortedLaps" :key="lap.lapNumber" class="hover:bg-neutral-700/50 transition">
                <td class="px-8 py-4 font-mono text-primary font-bold">
                  {{ lap.lapNumber ?? '-' }}
                </td>
                <td v-for="key in keys.slice(1)" :key="key" class="px-8 py-4 font-mono text-sm text-gray-300 relative">
                  <!-- Background Bar Container -->
                  <div v-if="!['startTime', 'finishTime'].includes(key)" class="absolute inset-y-1 left-2 right-2 z-0">
                    <!-- Animated Bar -->
                    <div class="h-full rounded bg-white/10 transition-all duration-700 ease-out"
                      :style="{ width: getBarPercent(lap[key], race.stats[key].min, race.stats[key].max) + '%' }">
                    </div>
                  </div>

                  <!-- Content -->
                  <div class="relative z-10 flex justify-between items-center space-x-2">
                    <span v-if="['startTime', 'finishTime'].includes(key)">{{ formatTime(lap[key]) }}</span>
                    <span v-else>{{ formatValue(lap[key]) }}</span>

                    <!-- Diff -->
                    <span
                      v-if="!['startTime', 'finishTime'].includes(key) && getDiff(lap, race.sortedLaps, key, idx) !== null"
                      class="text-xs font-bold" :class="getDiffColor(key, getDiff(lap, race.sortedLaps, key, idx))">
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
    </div>

    <DisclaimerModal :is-open="showDisclaimer" title="Disclaimer"
      message="eChook measured lap times are only accurate to within a few seconds and are no replacement for the official lap times."
      @confirm="handleDisclaimerConfirm" />
  </div>
</template>
