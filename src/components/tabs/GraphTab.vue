<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'
import { connect } from 'echarts/core'
import TelemetryGraph from '../../components/TelemetryGraph.vue'
import MasterZoom from '../../components/MasterZoom.vue'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()

// Chart Sync
const CHART_GROUP = 'telemetry_sync_group'
connect(CHART_GROUP)

// Metrics Visibility State
const showMetrics = computed({
  get: () => settings.showDashboardMetrics,
  set: (val) => { settings.showDashboardMetrics = val }
})

const selectedKeys = computed({
  get: () => new Set(settings.selectedDashboardKeys),
  set: (val) => { settings.selectedDashboardKeys = Array.from(val) }
})

const toggleMetrics = () => {
  showMetrics.value = !showMetrics.value
}

const colors = [
  '#2dd4bf', // teal-400
  '#f472b6', // pink-400
  '#fbbf24', // amber-400
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#34d399', // emerald-400
  '#f87171', // red-400
]

const toggleKey = (key) => {
  const newSet = new Set(selectedKeys.value)
  if (newSet.has(key)) {
    newSet.delete(key)
  } else {
    newSet.add(key)
  }
  selectedKeys.value = newSet
}

const getColor = (key) => {
  const index = telemetry.availableKeys.indexOf(key)
  return colors[index % colors.length]
}

// Ensure charts are connected when this tab mounts
onMounted(() => {
  connect(CHART_GROUP)
})
</script>

<template>
  <div class="flex-1 flex overflow-hidden h-full relative">
    <!-- Controls / Sidebar -->
    <aside
      class="bg-neutral-900 border-r border-neutral-800 transition-all duration-300 overflow-hidden flex flex-col pt-14 md:pt-0"
      :class="showMetrics ? 'w-44 opacity-100' : 'w-0 opacity-0 border-r-0'">
      <div class="w-44 p-4 overflow-y-auto h-full">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-gray-400 uppercase text-xs font-bold tracking-wider">Visible Metrics</h3>
          <button @click="toggleMetrics" class="text-gray-500 hover:text-white transition">
            <ChevronLeftIcon class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-2">
          <div v-for="key in telemetry.availableKeys" :key="key"
            class="flex items-center space-x-3 cursor-pointer hover:bg-neutral-800 p-2 rounded transition"
            @click="toggleKey(key)">
            <div class="w-4 h-4 rounded border flex items-center justify-center transition"
              :class="selectedKeys.has(key) ? 'bg-primary border-primary' : 'border-neutral-600'">
              <svg v-if="selectedKeys.has(key)" class="w-3 h-3 text-neutral-900" fill="none" stroke="currentColor"
                viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <span :class="selectedKeys.has(key) ? 'text-white' : 'text-gray-400'">{{ telemetry.getDisplayName(key) }}</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- Collapsed Toggle Button (Absolute) -->
    <div v-if="!showMetrics" class="absolute top-1 left-4 z-20">
      <button @click="toggleMetrics"
        class="p-2 rounded bg-neutral-800 border border-neutral-700 text-gray-400 hover:text-white hover:bg-neutral-700 transition shadow-lg"
        title="Show Metrics">
        <ChevronRightIcon class="w-5 h-5" />
      </button>
    </div>

    <!-- Graphs Area -->
    <main class="flex-1 flex flex-col overflow-hidden bg-neutral-900">
      <!-- Master Zoom Timeline -->
      <div class="flex-shrink-0 z-10 bg-neutral-900">
        <MasterZoom v-if="telemetry.history.length > 0" :data="telemetry.displayHistory" :group="CHART_GROUP" />
      </div>

      <div class="flex-1 overflow-y-auto space-y-2 px-2 py-2">
        <div v-if="selectedKeys.size > 0">
          <div v-for="key in Array.from(selectedKeys)" :key="key" class="w-full">
            <TelemetryGraph :data="telemetry.displayHistory" :data-key="key" :group="CHART_GROUP"
              :color="getColor(key)" />
          </div>
        </div>
        <div v-else class="h-full flex items-center justify-center text-gray-500">
          Select metrics to view graph data
        </div>
      </div>
    </main>
  </div>
</template>
