<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { connect } from 'echarts/core'
import TelemetryGraph from '../../components/TelemetryGraph.vue'
import MasterZoom from '../../components/MasterZoom.vue'

const telemetry = useTelemetryStore()

// Chart Sync
const CHART_GROUP = 'telemetry_sync_group'
connect(CHART_GROUP)

// State
// Initialize from localStorage if available
const savedKeys = localStorage.getItem('dashboard_selected_keys')
const initialKeys = savedKeys ? JSON.parse(savedKeys) : []
const selectedKeys = ref(new Set(initialKeys)) 

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
  // Save to localStorage
  localStorage.setItem('dashboard_selected_keys', JSON.stringify(Array.from(selectedKeys.value)))
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
    <div class="flex-1 flex overflow-hidden h-full">
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
              :class="selectedKeys.has(key) ? 'bg-primary border-primary' : 'border-neutral-600'"
            >
              <svg v-if="selectedKeys.has(key)" class="w-3 h-3 text-neutral-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <span :class="selectedKeys.has(key) ? 'text-white' : 'text-gray-400'">{{ key }}</span>
          </div>
        </div>
      </aside>

      <!-- Graphs Area -->
      <main class="flex-1 flex flex-col overflow-hidden bg-neutral-900">
         <!-- Master Zoom Timeline -->
         <div class="flex-shrink-0 z-10 bg-neutral-900">
             <MasterZoom 
                v-if="telemetry.history.length > 0"
                :data="telemetry.history" 
                :group="CHART_GROUP"
             />
         </div>

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
</template>
