<!--
  @file components/tabs/MapTab.vue
  @brief Interactive map tab with car position and gradient trail.
  @description Displays an OpenStreetMap with the car's current position
               and a color-coded historical trail. Trail color represents
               a selected telemetry metric value.
-->
<script setup>
/**
 * @description Map tab component for GPS visualization.
 * 
 * Features:
 * - OpenStreetMap tile layer via Leaflet
 * - Real-time car position marker
 * - Gradient-colored trail based on selected metric
 * - Configurable trail duration (10s to 10m)
 * - Auto-fit bounds option
 * - Collapsible settings panel
 * 
 * Trail coloring uses red-to-green gradient based on metric value.
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'
import { getMapTileUrl } from '../../constants/mapTiles'
import { navTabMetricPickerClass } from '../../utils/navTabClasses'
import "leaflet/dist/leaflet.css"
import { LMap, LTileLayer, LCircleMarker, LControl } from "@vue-leaflet/vue-leaflet"
import { Switch, SwitchGroup, SwitchLabel } from '@headlessui/vue'
import { ChevronDownIcon, AdjustmentsHorizontalIcon } from '@heroicons/vue/24/outline'
import GradientPath from '../../components/GradientPath.vue'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()
const AUTO_FIT_THROTTLE_MS = 1000
const MAX_TRAIL_POINTS = 1200

// Map State
const map = ref(null)

/** @brief Whether map auto-fits to trail bounds */
const isAutoFitEnabled = ref(true)

// Controls State
/** @brief Trail duration in seconds (default 5 minutes) */
const trailTimeSeconds = ref(300)

/** @brief Currently selected metric for trail coloring */
const selectedMetric = ref('speed')

/** @brief Whether settings panel is expanded */
const isSettingsExpanded = ref(false)

/**
 * @brief Compute trail data within the selected time window.
 * @description Filters telemetry history to points with GPS data
 *              within the configured time range.
 * @type {ComputedRef<Array<{lat: number, lon: number, value: number}>>}
 */
const trailData = computed(() => {
  const history = telemetry.displayHistory
  if (history.length === 0) return []

  const latestTs = history[history.length - 1].timestamp
  const startTime = latestTs - (trailTimeSeconds.value * 1000)
  const points = []
  for (let i = history.length - 1; i >= 0; i--) {
    const packet = history[i]
    if (packet.timestamp < startTime) break
    if (packet.lat != null && packet.lon != null) {
      points.push({
        lat: packet.lat,
        lon: packet.lon,
        value: typeof packet[selectedMetric.value] === 'number' ? packet[selectedMetric.value] : 0
      })
      if (points.length >= MAX_TRAIL_POINTS) break
    }
  }
  return points.reverse()
})

/**
 * @brief Fit map bounds to current trail data.
 */
const fitToTrail = () => {
  if (!map.value || trailData.value.length === 0) return

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

// Auto-fit bounds when trail data updates
let lastAutoFitAt = 0
watch(trailData, () => {
  if (!isAutoFitEnabled.value) return
  const now = Date.now()
  if (now - lastAutoFitAt < AUTO_FIT_THROTTLE_MS) return
  lastAutoFitAt = now
  fitToTrail()
}, { deep: false })

// Trigger fit when auto-fit is enabled
watch(isAutoFitEnabled, (val) => {
  if (val) fitToTrail()
})

/**
 * @brief Compute min/max values for gradient coloring.
 * @type {ComputedRef<{min: number, max: number}>}
 */
const trailRange = computed(() => {
  if (trailData.value.length === 0) return { min: 0, max: 100 }
  let min = Infinity
  let max = -Infinity
  trailData.value.forEach((point) => {
    if (point.value < min) min = point.value
    if (point.value > max) max = point.value
  })

  if (min === max) max = min + 1
  return { min, max }
})

/** @brief Tile layer URL for the active UI theme */
const mapTileUrl = computed(() => getMapTileUrl(settings.resolvedTheme))

</script>

<template>
  <div class="h-full w-full relative">
    <l-map ref="map" :use-global-leaflet="false">
      <l-tile-layer :url="mapTileUrl" layer-type="base"
        name="OpenStreetMap"></l-tile-layer>

      <!-- Gradient Trail -->
      <GradientPath :points="trailData" :min="trailRange.min" :max="trailRange.max" />

      <!-- Car Marker -->
      <l-circle-marker v-if="telemetry.displayLiveData.lat && telemetry.displayLiveData.lon"
        :lat-lng="[telemetry.displayLiveData.lat, telemetry.displayLiveData.lon]" :radius="8" color="#fff" :weight="2"
        fill-color="#cb1557" :fill-opacity="1"></l-circle-marker>

      <!-- Settings Control Overlay -->
      <l-control position="topright" class="leaflet-control-layers leaflet-control !border-none !bg-transparent">
        <div class="flex flex-col items-end space-y-2">
          <!-- Toggle Button -->
          <button @click="isSettingsExpanded = !isSettingsExpanded"
            class="bg-white dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-700 p-2 rounded-lg shadow-xl text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-neutral-800 transition-colors flex items-center space-x-2 z-[1000]">
            <AdjustmentsHorizontalIcon class="w-5 h-5 text-primary" />
            <span class="text-xs font-bold uppercase tracking-wider hidden md:inline">Map Settings</span>
            <ChevronDownIcon class="w-4 h-4 text-zinc-600 dark:text-inherit transition-transform duration-300"
              :class="{ 'rotate-180': isSettingsExpanded }" />
          </button>

          <!-- Settings Panel -->
          <Transition enter-active-class="transition duration-300 ease-out"
            enter-from-class="opacity-0 scale-95 -translate-y-2" enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition duration-200 ease-in" leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 -translate-y-2">
            <div v-if="isSettingsExpanded"
              class="bg-white/95 dark:bg-neutral-900/90 backdrop-blur-md border border-zinc-200 dark:border-neutral-700 p-4 rounded-xl shadow-2xl text-zinc-900 dark:text-white w-64 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <h3
                class="font-bold text-xs uppercase tracking-widest text-zinc-500 dark:text-gray-500 mb-4 pb-2 border-b border-zinc-200 dark:border-neutral-800">
                Configuration</h3>

              <!-- Auto Fit Toggle -->
              <SwitchGroup as="div" class="mb-6 flex items-center justify-between">
                <SwitchLabel class="text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase cursor-pointer">
                  Auto-Fit Map
                </SwitchLabel>
                <Switch v-model="isAutoFitEnabled"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900"
                  :class="isAutoFitEnabled ? 'bg-primary' : 'bg-zinc-300 dark:bg-neutral-700'">
                  <span class="sr-only">Auto-fit map to trail bounds</span>
                  <span aria-hidden="true"
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition"
                    :class="isAutoFitEnabled ? 'translate-x-6' : 'translate-x-1'" />
                </Switch>
              </SwitchGroup>

              <!-- Trail Length Slider -->
              <div class="mb-6">
                <div class="flex justify-between items-center mb-2">
                  <label class="text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase">Trail History</label>
                  <span class="text-[10px] font-mono text-primary">{{ trailTimeSeconds >= 60 ?
                    Math.floor(trailTimeSeconds / 60) + 'm' : trailTimeSeconds + 's' }}</span>
                </div>
                <input type="range" min="10" max="600" step="10" v-model.number="trailTimeSeconds"
                  class="w-full accent-primary h-1.5 bg-zinc-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer">
              </div>

              <!-- Metric Selection -->
              <div>
                <label class="block text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase mb-3">Color Trail By</label>
                <div class="grid grid-cols-1 gap-1">
                  <button v-for="key in telemetry.availableKeys" :key="key" @click="selectedMetric = key"
                    class="flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all text-xs font-medium"
                    :class="['flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all text-xs font-medium', navTabMetricPickerClass(selectedMetric === key)]">
                    <span>{{ telemetry.getDisplayName(key) }}</span>
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
/* Leaflet dark mode overrides if desired */
</style>
