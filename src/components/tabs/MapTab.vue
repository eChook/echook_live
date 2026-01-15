<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import "leaflet/dist/leaflet.css"
import { LMap, LTileLayer, LCircleMarker, LControl } from "@vue-leaflet/vue-leaflet"
import GradientPath from '../../components/GradientPath.vue'

const telemetry = useTelemetryStore()

// Map State
const map = ref(null)
const isAutoFitEnabled = ref(true)

// Controls State
const trailLength = ref(200)
const selectedMetric = ref('speed')

// Update center to follow car ONLY if user hasn't panned away
// For simplicity, let's just re-center if we have data and maybe add a "Recenter" button later
// Or better: auto-center until user drags.
const onMapReady = () => {
  // 
}

// Compute Trail
// Map history to { lat, lon, value }
const trailData = computed(() => {
  // Get last N points (use displayHistory for converted units)
  const slice = telemetry.displayHistory.slice(-trailLength.value)

  // Map to simplified objects
  const mapped = slice
    .filter(p => p.lat != null && p.lon != null) // Filter invalid GPS
    .map(p => ({
      lat: p.lat,
      lon: p.lon,
      value: typeof p[selectedMetric.value] === 'number' ? p[selectedMetric.value] : 0
    }))

  return mapped
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
      <l-control position="topright" class="leaflet-control-layers leaflet-control">
        <div
          class="bg-neutral-900/80 backdrop-blur border border-neutral-700 p-4 rounded shadow-xl text-white w-64 max-h-[80vh] overflow-y-auto">
          <h3 class="font-bold text-sm uppercase tracking-wider text-gray-400 mb-4">Map Settings</h3>

          <!-- Auto Fit Toggle -->
          <div class="mb-6 flex items-center justify-between">
            <label class="text-xs font-bold">Auto-Fit Map</label>
            <div class="flex items-center">
              <input type="checkbox" v-model="isAutoFitEnabled"
                class="w-4 h-4 text-primary bg-neutral-700 border-neutral-600 rounded focus:ring-primary focus:ring-2">
            </div>
          </div>

          <!-- Trail Length -->
          <div class="mb-6">
            <label class="block text-xs font-bold mb-2">Trail History: <span class="text-primary">{{ trailLength }}
                pts</span></label>
            <input type="range" min="10" max="2000" step="10" v-model.number="trailLength"
              class="w-full accent-primary h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer">
          </div>

          <!-- Metric Selection -->
          <div>
            <label class="block text-xs font-bold mb-2">Color Trail By:</label>
            <div class="space-y-1">
              <label v-for="key in telemetry.availableKeys" :key="key"
                class="flex items-center space-x-2 cursor-pointer hover:bg-neutral-800 p-1 rounded">
                <input type="radio" :value="key" v-model="selectedMetric"
                  class="text-primary focus:ring-primary bg-neutral-700 border-neutral-600">
                <span class="text-sm" :class="selectedMetric === key ? 'text-white' : 'text-gray-400'">{{ key }}</span>
              </label>
            </div>
          </div>
        </div>
      </l-control>

    </l-map>
  </div>
</template>

<style scoped>
/* Leaflet dark mode overrides if desired, but for now standard OSM */
</style>
