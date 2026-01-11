<script setup>
import { onMounted, onUnmounted, ref, computed, shallowRef } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
import DashboardHeader from '../components/DashboardHeader.vue'
import DataCard from '../components/DataCard.vue'

// Tabs
import GraphTab from '../components/tabs/GraphTab.vue'
import MapTab from '../components/tabs/MapTab.vue'
import LapsTab from '../components/tabs/LapsTab.vue'
import SettingsTab from '../components/tabs/SettingsTab.vue'

// Icons
import { ChartBarIcon, MapIcon, FlagIcon, CogIcon } from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()

// Tab Configuration
const activeTabId = ref(localStorage.getItem('activeTabId') || 'graph')

import { watch } from 'vue'
watch(activeTabId, (newValue) => {
  localStorage.setItem('activeTabId', newValue)
})

const tabs = [
  { id: 'graph', label: 'Graph', icon: ChartBarIcon, component: GraphTab },
  { id: 'map', label: 'Map', icon: MapIcon, component: MapTab },
  { id: 'laps', label: 'Laps', icon: FlagIcon, component: LapsTab },
]

const activeComponent = computed(() => {
  if (activeTabId.value === 'settings') return SettingsTab
  const tab = tabs.find(t => t.id === activeTabId.value)
  return tab ? tab.component : GraphTab
})

onMounted(() => {
  telemetry.connect()
})

onUnmounted(() => {
  telemetry.disconnect()
})
</script>

<template>
  <div class="h-screen overflow-hidden bg-neutral-900 flex flex-col">
    <DashboardHeader />

    <!-- Data Ribbon -->
    <div
      class="h-28 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur flex items-center justify-center px-6 space-x-4 overflow-x-auto no-scrollbar py-2">
      <DataCard v-for="key in telemetry.availableKeys" :key="key" :label="key" :value="telemetry.liveData[key]" />
      <div v-if="telemetry.availableKeys.length === 0" class="text-gray-500 text-sm italic">
        Waiting for telemetry data...
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Vertical Tab Sidebar -->
      <aside class="w-16 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-4 space-y-4 z-40">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTabId = tab.id"
          class="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group relative"
          :class="activeTabId === tab.id ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-neutral-800 hover:text-gray-300'"
          :title="tab.label">
          <!-- Icon -->
          <component :is="tab.icon" class="w-6 h-6" />

          <!-- Active Indicator -->
          <div v-if="activeTabId === tab.id" class="absolute left-0 w-1 h-6 bg-primary rounded-r-full"></div>
        </button>

        <div class="flex-1"></div>

        <!-- Settings Tab at bottom -->
        <button @click="activeTabId = 'settings'"
          class="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group"
          :class="activeTabId === 'settings' ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-neutral-800 hover:text-gray-300'"
          title="Settings">
          <CogIcon class="w-6 h-6" />
        </button>
      </aside>

      <!-- Tab Content Area -->
      <main class="flex-1 overflow-hidden relative">
        <KeepAlive>
          <component :is="activeComponent" />
        </KeepAlive>
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
