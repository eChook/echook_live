<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { TrashIcon, PlusIcon, MapIcon } from '@heroicons/vue/24/outline'
import "leaflet/dist/leaflet.css"
import { LMap, LTileLayer, LRectangle, LMarker, LTooltip } from "@vue-leaflet/vue-leaflet"

const adminStore = useAdminStore()
const selectedTrackId = ref(null)
const selectedTrack = ref(null) // Local copy for editing
const isCreating = ref(false)

// Map Refs
const map = ref(null)
const zoom = ref(13)
const center = ref([52.0786, -1.0169]) // Silverstone default

onMounted(() => {
    adminStore.fetchTracks()
})

// Watch for selection changes
watch(selectedTrackId, (newId) => {
    if (newId) {
        isCreating.value = false
        const original = adminStore.tracks.find(t => t._id === newId)
        if (original) {
            // Deep copy to local state
            selectedTrack.value = JSON.parse(JSON.stringify(original))
            // Center map
            if (selectedTrack.value.latMin && selectedTrack.value.lonMin) {
                const latCenter = (selectedTrack.value.latMin + selectedTrack.value.latMax) / 2
                const lonCenter = (selectedTrack.value.lonMin + selectedTrack.value.lonMax) / 2
                center.value = [latCenter, lonCenter]
            }
        }
    } else {
        selectedTrack.value = null
    }
})

// Computed Bounds for Rectangle
const bounds = computed(() => {
    if (!selectedTrack.value) return []
    return [
        [selectedTrack.value.latMin, selectedTrack.value.lonMin],
        [selectedTrack.value.latMax, selectedTrack.value.lonMax]
    ]
})

// Draggable Marker Handlers
const updateCorner = (corner, e) => {
    const { lat, lng } = e.target.getLatLng()

    // corner: 'sw', 'nw', 'se', 'ne'
    // latMin/lonMin is SW for typical northern hemisphere

    if (corner === 'sw') {
        selectedTrack.value.latMin = lat
        selectedTrack.value.lonMin = lng
    } else if (corner === 'nw') {
        selectedTrack.value.latMax = lat
        selectedTrack.value.lonMin = lng
    } else if (corner === 'se') {
        selectedTrack.value.latMin = lat
        selectedTrack.value.lonMax = lng
    } else if (corner === 'ne') {
        selectedTrack.value.latMax = lat
        selectedTrack.value.lonMax = lng
    }
}

const createNewTrack = () => {
    isCreating.value = true
    selectedTrackId.value = null
    // Create default around current center
    const cLat = center.value[0]
    const cLon = center.value[1]
    const size = 0.005

    selectedTrack.value = {
        name: 'New Track',
        latMin: cLat - size,
        latMax: cLat + size,
        lonMin: cLon - size,
        lonMax: cLon + size
    }
}

const saveTrack = async () => {
    if (!selectedTrack.value) return

    if (isCreating.value) {
        const res = await adminStore.addTrack(selectedTrack.value)
        if (res.success) {
            isCreating.value = false
            // Find the new track - relying on name is risky but acceptable for now or just fetch
            // Ideally backend returns the new ID. For now clear selection.
            selectedTrackId.value = null
            selectedTrack.value = null
        }
    } else {
        // Update
        await adminStore.updateTrack(selectedTrack.value._id, selectedTrack.value)
    }
}

const deleteTrack = async (id) => {
    if (confirm('Delete this map?')) {
        await adminStore.deleteTrack(id)
        if (selectedTrackId.value === id) {
            selectedTrackId.value = null
        }
    }
}

</script>

<template>
    <div class="h-full flex overflow-hidden">
        <!-- Sidebar List -->
        <div class="w-1/3 min-w-[300px] border-r border-neutral-700 bg-neutral-800 flex flex-col">
            <div class="p-4 border-b border-neutral-700 flex justify-between items-center bg-neutral-900">
                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                    <MapIcon class="w-5 h-5 text-primary" /> Maps
                </h3>
                <button @click="createNewTrack" class="p-2 bg-primary hover:bg-red-700 rounded text-white transition">
                    <PlusIcon class="w-5 h-5" />
                </button>
            </div>

            <div class="flex-1 overflow-y-auto p-2 space-y-2">
                <div v-for="track in adminStore.tracks" :key="track._id" @click="selectedTrackId = track._id"
                    class="p-3 rounded-lg border cursor-pointer transition flex justify-between items-center group"
                    :class="selectedTrackId === track._id ? 'bg-primary/20 border-primary' : 'bg-neutral-900 border-neutral-700 hover:border-gray-500'">

                    <div>
                        <div class="font-bold text-white">{{ track.name }}</div>
                        <div class="text-xs text-gray-500 font-mono">
                            {{ track.latMin.toFixed(4) }}, {{ track.lonMin.toFixed(4) }}
                        </div>
                    </div>

                    <button @click.stop="deleteTrack(track._id)"
                        class="text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-2">
                        <TrashIcon class="w-5 h-5" />
                    </button>
                </div>
            </div>

            <!-- Editor Panel (when selected) -->
            <div v-if="selectedTrack" class="p-4 bg-neutral-900 border-t border-neutral-700 space-y-3">
                <div>
                    <label class="block text-xs uppercase text-gray-400 font-bold mb-1">Track Name</label>
                    <input v-model="selectedTrack.name" type="text"
                        class="w-full bg-neutral-800 border border-neutral-700 rounded p-2 text-white focus:border-primary outline-none">
                </div>

                <div class="grid grid-cols-2 gap-2 text-xs font-mono text-gray-400">
                    <div class="bg-neutral-800 p-2 rounded">Lat Min: {{ selectedTrack.latMin.toFixed(5) }}</div>
                    <div class="bg-neutral-800 p-2 rounded">Lat Max: {{ selectedTrack.latMax.toFixed(5) }}</div>
                    <div class="bg-neutral-800 p-2 rounded">Lon Min: {{ selectedTrack.lonMin.toFixed(5) }}</div>
                    <div class="bg-neutral-800 p-2 rounded">Lon Max: {{ selectedTrack.lonMax.toFixed(5) }}</div>
                </div>

                <div class="flex gap-2 pt-2">
                    <button @click="saveTrack"
                        class="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded transition">
                        {{ isCreating ? 'Create Map' : 'Save Changes' }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Map View -->
        <div class="flex-1 relative bg-neutral-900">
            <l-map ref="map" v-model:zoom="zoom" v-model:center="center" :use-global-leaflet="false">
                <l-tile-layer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" layer-type="base"
                    name="OpenStreetMap" />

                <!-- Editing Rectangle -->
                <l-rectangle v-if="selectedTrack" :bounds="bounds" :color="'#cb1557'" :fill="true" :fillOpacity="0.1" />

                <!-- Draggable Corners -->
                <template v-if="selectedTrack">
                    <!-- SW -->
                    <l-marker :lat-lng="[selectedTrack.latMin, selectedTrack.lonMin]" draggable
                        @moveend="(e) => updateCorner('sw', e)"></l-marker>
                    <!-- NW -->
                    <l-marker :lat-lng="[selectedTrack.latMax, selectedTrack.lonMin]" draggable
                        @moveend="(e) => updateCorner('nw', e)"></l-marker>
                    <!-- SE -->
                    <l-marker :lat-lng="[selectedTrack.latMin, selectedTrack.lonMax]" draggable
                        @moveend="(e) => updateCorner('se', e)"></l-marker>
                    <!-- NE -->
                    <l-marker :lat-lng="[selectedTrack.latMax, selectedTrack.lonMax]" draggable
                        @moveend="(e) => updateCorner('ne', e)"></l-marker>
                </template>

            </l-map>

            <div v-if="!selectedTrack"
                class="absolute top-4 left-4 z-[500] bg-neutral-900/80 backdrop-blur p-4 rounded text-white shadow-xl pointer-events-none">
                <h2 class="font-bold">Map Editor</h2>
                <p class="text-sm text-gray-300">Select a map from the left to edit boundaries, or create a new one.</p>
            </div>
        </div>
    </div>
</template>
