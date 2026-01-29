<!--
  @file views/SpectatorView.vue
  @brief Public spectator mode view component.
  @description Displays a split-panel view with a live car list table (left)
               and an interactive map (right) for public race spectating.
               Shows real-time car positions and speeds without authentication.
-->
<script setup>
/**
 * @description Vue script setup for SpectatorView.
 * 
 * Features:
 * - Real-time car position updates via WebSocket
 * - Interactive Leaflet map with car markers
 * - Clickable car list with hover highlighting
 * - Unit toggle (MPH/KPH)
 * - Auto-center on first car data
 * - Cross-linked selection between table and map
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSpectatorStore } from '../stores/spectator'
import PublicHeader from '../components/PublicHeader.vue'
import "leaflet/dist/leaflet.css"
import { LMap, LTileLayer, LCircleMarker, LTooltip } from "@vue-leaflet/vue-leaflet"

const route = useRoute()
const spectatorStore = useSpectatorStore()

/** @brief Track name from route params */
const trackName = computed(() => route.params.trackName)

// ============================================
// Unit Conversion
// ============================================

/** @brief Current speed unit ('mph' or 'kph') */
const unit = ref('mph')

/** @brief Speed conversion multiplier from m/s */
const speedMultiplier = computed(() => unit.value === 'mph' ? 2.23694 : 3.6)

/** @brief Cars with valid GPS coordinates for map display */
const mapCars = computed(() => {
    return spectatorStore.activeCarList.filter(c => c.lat && c.lon)
})

/**
 * @brief Format speed for display with unit conversion.
 * @param {number|null} ms - Speed in meters per second
 * @returns {string} Formatted speed string
 */
const formatSpeed = (ms) => {
    if (ms == null) return '--'
    return (ms * speedMultiplier.value).toFixed(1)
}

// ============================================
// Map State
// ============================================

/** @brief Leaflet map reference */
const map = ref(null)

/** @brief Current map zoom level */
const zoom = ref(16)

/** @brief Map center coordinates [lat, lon] */
const center = ref([52.0786, -1.0169]) // Default: Silverstone

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
    if (trackName.value) {
        spectatorStore.joinTrack(trackName.value)
    }
})

onUnmounted(() => {
    spectatorStore.leaveTrack()
})

// ============================================
// Auto-center Logic
// ============================================

/** @brief Whether map has been auto-centered on first car */
const hasCentered = ref(false)

/**
 * @brief Watch for first car with GPS and center map.
 */
watch(() => spectatorStore.activeCarList, (cars) => {
    if (!hasCentered.value && cars.length > 0) {
        const valid = cars.find(c => c.lat && c.lon)
        if (valid) {
            center.value = [valid.lat, valid.lon]
            hasCentered.value = true
        }
    }
}, { deep: true })

</script>

<template>
    <div class="h-screen flex flex-col bg-neutral-900 text-white overflow-hidden">
        <PublicHeader />

        <div class="flex-1 flex pt-16 overflow-hidden">
            <!-- Left Panel: Car Table -->
            <div class="w-1/3 min-w-[350px] border-r border-neutral-700 bg-neutral-800 flex flex-col z-10 shadow-xl">

                <!-- Header / Controls -->
                <div class="p-4 border-b border-neutral-700 flex justify-between items-center bg-neutral-800">
                    <div>
                        <h2 class="text-xl font-bold text-white">{{ trackName }}</h2>
                    </div>

                    <!-- Unit Toggle -->
                    <div class="bg-neutral-900 rounded p-1 flex">
                        <button @click="unit = 'mph'" class="px-3 py-1 text-xs font-bold rounded transition"
                            :class="unit === 'mph' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'">
                            MPH
                        </button>
                        <button @click="unit = 'kph'" class="px-3 py-1 text-xs font-bold rounded transition"
                            :class="unit === 'kph' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'">
                            KPH
                        </button>
                    </div>
                </div>

                <!-- Car List Table -->
                <div class="flex-1 overflow-y-auto">
                    <table class="w-full text-left">
                        <thead class="bg-neutral-900 sticky top-0 text-xs text-gray-400 uppercase font-medium">
                            <tr>
                                <th class="px-4 py-3">#</th>
                                <th class="px-4 py-3">Car / Team</th>
                                <th class="px-4 py-3 text-right">Speed ({{ unit.toUpperCase() }})</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-neutral-700">
                            <tr v-for="car in spectatorStore.activeCarList" :key="car.id"
                                class="hover:bg-neutral-700/50 transition cursor-pointer" :class="{
                                    'bg-primary/20': spectatorStore.hoveredCarId === car.id || spectatorStore.selectedCarId === car.id,
                                    'border-l-4 border-primary': spectatorStore.selectedCarId === car.id
                                }"
                                @click="spectatorStore.selectedCarId = (spectatorStore.selectedCarId === car.id ? null : car.id)"
                                @mouseenter="spectatorStore.hoveredCarId = car.id"
                                @mouseleave="spectatorStore.hoveredCarId = null">

                                <td
                                    class="px-4 py-3 font-mono text-lg font-bold text-gray-300 w-16 text-center bg-neutral-800/50">
                                    {{ car.number || '-' }}
                                </td>
                                <td class="px-4 py-3">
                                    <div class="font-bold text-white">{{ car.name || 'Unknown' }}</div>
                                    <div class="text-xs text-gray-400">{{ car.team || 'Unknown Team' }}</div>
                                </td>
                                <td class="px-4 py-3 text-right font-mono text-xl text-primary font-bold">
                                    {{ formatSpeed(car.speed) }}
                                </td>
                            </tr>
                            <tr v-if="spectatorStore.activeCarList.length === 0">
                                <td colspan="3" class="px-4 py-8 text-center text-gray-500 italic">
                                    Waiting for cars...
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Disclaimer -->
                    <div class="p-4 text-xs text-gray-500 text-center border-t border-neutral-700 bg-neutral-900/50">
                        Disclaimer: Data is provided by teams and may not be accurate.
                    </div>
                </div>
            </div>

            <!-- Right Panel: Map -->
            <div class="flex-1 relative bg-neutral-900">
                <l-map ref="map" v-model:zoom="zoom" v-model:center="center" :use-global-leaflet="false">
                    <l-tile-layer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" layer-type="base"
                        name="OpenStreetMap" />

                    <!-- Car Markers -->
                    <l-circle-marker v-for="car in mapCars" :key="car.id" :lat-lng="[car.lat, car.lon]"
                        :radius="(spectatorStore.hoveredCarId === car.id || spectatorStore.selectedCarId === car.id) ? 12 : 8"
                        :color="(spectatorStore.hoveredCarId === car.id || spectatorStore.selectedCarId === car.id) ? '#fff' : '#ffffff'"
                        :weight="2"
                        :fill-color="(spectatorStore.hoveredCarId === car.id || spectatorStore.selectedCarId === car.id) ? '#cb1557' : '#3b82f6'"
                        :fill-opacity="1"
                        @click="spectatorStore.selectedCarId = (spectatorStore.selectedCarId === car.id ? null : car.id)"
                        @mouseover="spectatorStore.hoveredCarId = car.id"
                        @mouseout="spectatorStore.hoveredCarId = null">

                        <l-tooltip :options="{ permanent: false, direction: 'top' }">
                            <div class="text-center font-bold">
                                #{{ car.number }} {{ car.name }}
                                <div class="text-xs font-normal">{{ formatSpeed(car.speed) }} {{ unit }}</div>
                            </div>
                        </l-tooltip>
                    </l-circle-marker>

                </l-map>

                <!-- Map Overlay: Loading State -->
                <div v-if="spectatorStore.activeCarList.length === 0"
                    class="absolute inset-0 flex items-center justify-center bg-black/50 z-[400] pointer-events-none">
                    <div class="bg-neutral-900 p-4 rounded text-white shadow font-bold">Waiting for GPS data...</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Scoped styles for SpectatorView */
</style>
