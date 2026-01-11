<script setup>
import { computed } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'

const telemetry = useTelemetryStore()

// Headers for the table
const headers = ['Lap', 'Time', 'Volts', 'Amps', 'RPM', 'Speed', 'Ah']
const keys = ['lapNumber', 'LL_Time', 'LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah']

const sortedHistory = computed(() => {
  // Show newest first
  return [...telemetry.lapHistory].reverse()
})

const formatValue = (val) => {
  if (typeof val === 'number') {
    return val.toFixed(2)
  }
  return val
}
</script>

<template>
  <div class="h-full flex flex-col p-6 overflow-hidden">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-white tracking-tight">Lap History</h2>
      <div class="text-sm text-gray-400" v-if="telemetry.lapHistory.length > 0">
        Total Laps: <span class="text-white font-mono font-bold">{{ telemetry.lapHistory.length }}</span>
      </div>
    </div>

    <div class="flex-1 overflow-auto bg-neutral-800 rounded-lg border border-neutral-700 shadow-xl">
      <table class="w-full text-left border-collapse">
        <thead class="bg-neutral-900 sticky top-0 z-10">
          <tr>
            <th v-for="(header, i) in headers" :key="header"
              class="p-3 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-neutral-700">
              {{ header }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-700">
          <tr v-for="(lap, idx) in sortedHistory" :key="idx" class="hover:bg-neutral-700/50 transition">
            <td class="p-3 font-mono text-primary font-bold">
              {{ lap.lapNumber ?? '-' }}
            </td>
            <td v-for="key in keys.slice(1)" :key="key" class="p-3 font-mono text-sm text-gray-300">
              {{ formatValue(lap[key]) }}
            </td>
          </tr>
          <tr v-if="sortedHistory.length === 0">
            <td :colspan="headers.length" class="p-8 text-center text-gray-500 italic">
              No completed laps recorded yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
