<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import "leaflet/dist/leaflet.css"
import { LMap, LTileLayer, LCircleMarker, LControl } from "@vue-leaflet/vue-leaflet"
import { ChevronDownIcon, AdjustmentsHorizontalIcon } from '@heroicons/vue/24/outline'
import GradientPath from '../../components/GradientPath.vue'

const telemetry = useTelemetryStore()

// Map State
const map = ref(null)
const isAutoFitEnabled = ref(true)

// Controls State
const trailTimeSeconds = ref(300) // Default 5 minutes
const selectedMetric = ref('speed')
const isSettingsExpanded = ref(false)

// Update center to follow car ONLY if user hasn't panned away
// For simplicity, let's just re-center if we have data and maybe add a "Recenter" button later
// Or better: auto-center until user drags.
const onMapReady = () => {
  // 
}

// Compute Trail
// Map history to { lat, lon, value } within the selected time window
const trailData = computed(() => {
  if (telemetry.displayHistory.length === 0) return []

  const latestTs = telemetry.displayHistory[telemetry.displayHistory.length - 1].timestamp
  const startTime = latestTs - (trailTimeSeconds.value * 1000)

  // Filter history for points within time range and map to simplified objects
  return telemetry.displayHistory
    .filter(p => p.timestamp >= startTime && p.lat != null && p.lon != null)
    .map(p => ({
      lat: p.lat,
      lon: p.lon,
      value: typeof p[selectedMetric.value] === 'number' ? p[selectedMetric.value] : 0
    }))
})

const fitToTrail = () => {
  if (!map.value || trailData.value.length === 0) return

  // Calculate bounds
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  trailData.value.forEach(p => {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
  })

  if (minLat !== Infinity) {
    const leafletMap = map.value.leafletObject
    if (leafletMap) {
      leafletMap.fitBounds(
        [[minLat, minLon], [maxLat, maxLon]],
        {
          padding: [200, 200],
          maxZoom: 18,
          animate: true,
          duration: 0.5
        }
      )
    }
  }
}

// Auto-fit bounds directly on trail updates
watch(trailData, (val) => {
  if (isAutoFitEnabled.value) {
    fitToTrail()
  }
}, { deep: false }) // deep false because computed array reference changes often, but elements are immutable

// Trigger fit when enabled
watch(isAutoFitEnabled, (val) => {
  if (val) fitToTrail()
})

// Compute Min/Max for gradient
const trailRange = computed(() => {
  if (trailData.value.length === 0) return { min: 0, max: 100 }

  const values = trailData.value.map(p => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)

  if (min === max) max = min + 1 // Avoid divide by zero
  return { min, max }
})

</script>

<template>
  <div class="h-full w-full relative">
    <l-map ref="map" :use-global-leaflet="false">
      <l-tile-layer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" layer-type="base"
        name="OpenStreetMap"></l-tile-layer>

      <!-- Gradient Trail -->
      <GradientPath :points="trailData" :min="trailRange.min" :max="trailRange.max" />

      <!-- Car Marker (Dot) -->
      <l-circle-marker v-if="telemetry.displayLiveData.lat && telemetry.displayLiveData.lon"
        :lat-lng="[telemetry.displayLiveData.lat, telemetry.displayLiveData.lon]" :radius="8" color="#fff" :weight="2"
        fill-color="#cb1557" :fill-opacity="1"></l-circle-marker>

      <!-- Controls Overlay -->
      <l-control position="topright" class="leaflet-control-layers leaflet-control !border-none !bg-transparent">
        <div class="flex flex-col items-end space-y-2">
          <!-- Toggle Button -->
          <button @click="isSettingsExpanded = !isSettingsExpanded"
            class="bg-neutral-900 border border-neutral-700 p-2 rounded-lg shadow-xl text-white hover:bg-neutral-800 transition-colors flex items-center space-x-2 z-[1000]">
            <AdjustmentsHorizontalIcon class="w-5 h-5 text-primary" />
            <span class="text-xs font-bold uppercase tracking-wider hidden md:inline">Map Settings</span>
            <ChevronDownIcon class="w-4 h-4 transition-transform duration-300"
              :class="{ 'rotate-180': isSettingsExpanded }" />
          </button>

          <!-- Settings Panel -->
          <Transition enter-active-class="transition duration-300 ease-out"
            enter-from-class="opacity-0 scale-95 -translate-y-2" enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition duration-200 ease-in" leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 -translate-y-2">
            <div v-if="isSettingsExpanded"
              class="bg-neutral-900/90 backdrop-blur-md border border-neutral-700 p-4 rounded-xl shadow-2xl text-white w-64 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <h3
                class="font-bold text-xs uppercase tracking-widest text-gray-500 mb-4 pb-2 border-b border-neutral-800">
                Configuration</h3>

              <!-- Auto Fit Toggle -->
              <div class="mb-6 flex items-center justify-between">
                <label class="text-xs font-bold text-gray-300 uppercase">Auto-Fit Map</label>
                <div @click="isAutoFitEnabled = !isAutoFitEnabled"
                  class="w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-300"
                  :class="isAutoFitEnabled ? 'bg-primary' : 'bg-neutral-700'">
                  <div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-300"
                    :style="{ transform: isAutoFitEnabled ? 'translateX(20px)' : 'translateX(0)' }"></div>
                </div>
              </div>

              <!-- Trail Length (Time Based) -->
              <div class="mb-6">
                <div class="flex justify-between items-center mb-2">
                  <label class="text-xs font-bold text-gray-300 uppercase">Trail History</label>
                  <span class="text-[10px] font-mono text-primary">{{ trailTimeSeconds >= 60 ?
                    Math.floor(trailTimeSeconds / 60) + 'm' : trailTimeSeconds + 's' }}</span>
                </div>
                <input type="range" min="10" max="600" step="10" v-model.number="trailTimeSeconds"
                  class="w-full accent-primary h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer">
              </div>

              <!-- Metric Selection -->
              <div>
                <label class="block text-xs font-bold text-gray-300 uppercase mb-3">Color Trail By</label>
                <div class="grid grid-cols-1 gap-1">
                  <button v-for="key in telemetry.availableKeys" :key="key" @click="selectedMetric = key"
                    class="flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all text-xs font-medium"
                    :class="selectedMetric === key ? 'bg-primary/20 text-primary border border-primary/30' : 'text-gray-400 hover:bg-neutral-800 hover:text-white border border-transparent'">
                    <span>{{ key }}</span>
                    <div v-if="selectedMetric === key"
                      class="w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(203,21,87,0.8)]"></div>
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </l-control>

    </l-map>
  </div>
</template>

<style scoped>
/* Leaflet dark mode overrides if desired, but for now standard OSM */
</style>
