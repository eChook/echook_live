<script setup>
import { computed } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'

const telemetry = useTelemetryStore()

// Headers for the table
const headers = ['Lap', 'Time', 'Volts', 'Amps', 'RPM', 'Speed', 'Ah']
const keys = ['lapNumber', 'LL_Time', 'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah']

const sortedRaces = computed(() => {
  // Show newest race first
  return [...telemetry.races].reverse()
})

const formatValue = (val) => {
  if (typeof val === 'number') {
    return val.toFixed(2)
  }
  return val
}

const formatDate = (isoStringOrMs) => {
  if (!isoStringOrMs) return 'Unknown Time'
  return new Date(isoStringOrMs).toLocaleString()
}
</script>

<template>
  <div class="h-full flex flex-col p-6 overflow-hidden space-y-8">
    <div v-if="telemetry.races.length === 0" class="flex items-center justify-center h-full text-gray-500 italic">
      No lap data recorded yet.
    </div>

    <div class="flex-1 overflow-y-auto space-y-8 pr-2"> <!-- Scrollable container -->
      <div v-for="race in sortedRaces" :key="race.id" class="flex flex-col space-y-4">
        <div
          class="flex items-center justify-between sticky top-0 bg-neutral-900 z-10 py-2 border-b border-neutral-800">
          <h2 class="text-xl font-bold text-white tracking-tight">
            Race Start Time: <span class="text-primary font-mono">{{ formatDate(race.startTime) }}</span>
          </h2>
          <div class="text-sm text-gray-400">
            Laps: <span class="text-white font-mono font-bold">{{ race.laps.length }}</span>
          </div>
        </div>

        <div class="bg-neutral-800 rounded-lg border border-neutral-700 shadow-xl overflow-hidden">
          <table class="w-full text-left border-collapse">
            <thead class="bg-neutral-900">
              <tr>
                <th v-for="(header, i) in headers" :key="header"
                  class="p-3 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-neutral-700">
                  {{ header }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-700">
              <!-- Show laps in race REVERSED (newest first) -->
              <tr v-for="(lap, idx) in [...race.laps].reverse()" :key="idx" class="hover:bg-neutral-700/50 transition">
                <td class="p-3 font-mono text-primary font-bold">
                  {{ lap.lapNumber ?? '-' }}
                </td>
                <td v-for="key in keys.slice(1)" :key="key" class="p-3 font-mono text-sm text-gray-300">
                  {{ formatValue(lap[key]) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
