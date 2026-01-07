<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
import { connect } from 'echarts/core'
import DashboardHeader from '../components/DashboardHeader.vue'
import DataCard from '../components/DataCard.vue'
import TelemetryGraph from '../components/TelemetryGraph.vue'
import MasterZoom from '../components/MasterZoom.vue'

const telemetry = useTelemetryStore()

// Chart Sync
const CHART_GROUP = 'telemetry_sync_group'
connect(CHART_GROUP)

// State
const selectedKeys = ref(new Set([])) // Defaults cleared as requested
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
  if (selectedKeys.value.has(key)) {
    selectedKeys.value.delete(key)
  } else {
    selectedKeys.value.add(key)
  }
}

const getColor = (key) => {
  // stable color based on string hash or index in available keys?
  // simple index for now
  const index = telemetry.availableKeys.indexOf(key)
  return colors[index % colors.length]
}

onMounted(() => {
  telemetry.connect()
})

onUnmounted(() => {
  telemetry.disconnect()
})
</script>

<template>
  <div class="min-h-screen bg-neutral-900 flex flex-col">
    <DashboardHeader />

    <!-- Data Ribbon -->
    <div class="h-28 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur flex items-center px-6 space-x-4 overflow-x-auto no-scrollbar py-2">
      <DataCard 
        v-for="key in telemetry.availableKeys" 
        :key="key"
        :label="key"
        :value="telemetry.liveData[key]"
      />
      <div v-if="telemetry.availableKeys.length === 0" class="text-gray-500 text-sm italic">
        Waiting for telemetry data...
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Controls / Sidebar -->
      <aside class="w-64 bg-neutral-900 border-r border-neutral-800 p-4 overflow-y-auto hidden md:block">
        <h3 class="text-gray-400 uppercase text-xs font-bold tracking-wider mb-4">Visible Metrics</h3>
        <div class="space-y-2">
          <div 
            v-for="key in telemetry.availableKeys" 
            :key="key"
            class="flex items-center space-x-3 cursor-pointer hover:bg-neutral-800 p-2 rounded transition"
            @click="toggleKey(key)"
          >
            <div 
              class="w-4 h-4 rounded border flex items-center justify-center transition"
              :class="selectedKeys.has(key) ? 'bg-teal-500 border-teal-500' : 'border-neutral-600'"
            >
              <svg v-if="selectedKeys.has(key)" class="w-3 h-3 text-neutral-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <span :class="selectedKeys.has(key) ? 'text-white' : 'text-gray-400'">{{ key }}</span>
          </div>
        </div>
      </aside>

      <!-- Graphs Area -->
      <main class="flex-1 flex flex-col overflow-hidden">
         <!-- Master Zoom Timeline -->
         <!-- Only show if there is history to zoom on -->
         <MasterZoom 
            v-if="telemetry.history.length > 0"
            :data="telemetry.history" 
            :group="CHART_GROUP"
         />

        <div class="flex-1 overflow-y-auto space-y-4 p-4">
            <div v-if="selectedKeys.size > 0">
            <div v-for="key in Array.from(selectedKeys)" :key="key" class="w-full">
                <TelemetryGraph 
                :data="telemetry.history" 
                :data-key="key" 
                :group="CHART_GROUP"
                :color="getColor(key)"
                />
            </div>
            </div>
            <div v-else class="h-full flex items-center justify-center text-gray-500">
            Select metrics to view graph data
            </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
/* Hide scrollbar for ribbon */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
