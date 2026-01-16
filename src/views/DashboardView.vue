<script setup>
import { onMounted, onUnmounted, ref, computed, shallowRef } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import DashboardHeader from '../components/DashboardHeader.vue'
import DataCard from '../components/DataCard.vue'
import draggable from 'vuedraggable'

// Tabs
import GraphTab from '../components/tabs/GraphTab.vue'
import MapTab from '../components/tabs/MapTab.vue'
import LapsTab from '../components/tabs/LapsTab.vue'
import SettingsTab from '../components/tabs/SettingsTab.vue'
import AdminTab from '../components/tabs/AdminTab.vue'

// Icons
import { ChartBarIcon, MapIcon, FlagIcon, CogIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const auth = useAuthStore()
const settings = useSettingsStore()

const getDisplayUnit = (key) => {
  if (key === 'speed') return telemetry.unitSettings.speedUnit
  if (key === 'temp1' || key === 'temp2' || key === 'tempDiff') return telemetry.unitSettings.tempUnit === 'f' ? '°F' : '°C'
  return undefined
}

// Ordered keys: merge user order with available keys
const orderedKeys = computed({
  get: () => {
    const available = new Set(telemetry.availableKeys)
    const userOrder = settings.dataCardOrder.filter(k => available.has(k))
    const newKeys = telemetry.availableKeys.filter(k => !settings.dataCardOrder.includes(k))
    return [...userOrder, ...newKeys]
  },
  set: (newOrder) => {
    settings.dataCardOrder = newOrder
  }
})

// Tab Configuration
const activeTabId = computed({
  get: () => settings.activeTabId,
  set: (val) => { settings.activeTabId = val }
})

const tabs = computed(() => {
  const baseTabs = [
    { id: 'graph', label: 'Graph', icon: ChartBarIcon, component: GraphTab },
    { id: 'map', label: 'Map', icon: MapIcon, component: MapTab },
    { id: 'laps', label: 'Laps', icon: FlagIcon, component: LapsTab },
  ]

  if (auth.user?.isAdmin) {
    baseTabs.push({ id: 'admin', label: 'Admin', icon: ShieldCheckIcon, component: AdminTab })
  }

  console.log('Computing tabs. User:', auth.user, 'IsAdmin:', auth.user?.isAdmin, 'Result:', baseTabs)

  return baseTabs
})

const activeComponent = computed(() => {
  if (activeTabId.value === 'settings') return SettingsTab
  const tab = tabs.value.find(t => t.id === activeTabId.value)
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
      class="h-auto md:h-28 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur flex flex-wrap md:flex-nowrap items-center justify-start px-6 gap-4 overflow-x-auto no-scrollbar py-4 md:py-2">
      <draggable v-model="orderedKeys" item-key="key" class="flex flex-wrap md:flex-nowrap gap-4" :animation="200">
        <template #item="{ element: key }">
          <DataCard :label="telemetry.getDisplayName(key)" :value="telemetry.displayLiveData[key]"
            :unit="getDisplayUnit(key)" :stale="telemetry.isDataStale" :tooltip="telemetry.getDescription(key)" />
        </template>
      </draggable>
      <div v-if="orderedKeys.length === 0" class="text-gray-500 text-sm italic">
        Waiting for telemetry data...
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Vertical Tab Sidebar -->
      <aside
        class="w-14 md:w-16 bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-4 space-y-4 z-40 transition-all duration-300">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTabId = tab.id"
          class="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group relative"
          :class="activeTabId === tab.id ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-neutral-800 hover:text-gray-300'"
          :title="tab.label">
          <!-- Icon -->
          <component :is="tab.icon" class="w-5 h-5 md:w-6 md:h-6" />

          <!-- Active Indicator -->
          <div v-if="activeTabId === tab.id" class="absolute left-0 w-1 h-6 bg-primary rounded-r-full"></div>
        </button>

        <div class="flex-1"></div>

        <!-- Settings Tab at bottom -->
        <button @click="activeTabId = 'settings'"
          class="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group"
          :class="activeTabId === 'settings' ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-neutral-800 hover:text-gray-300'"
          title="Settings">
          <CogIcon class="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </aside>

      <!-- Tab Content Area -->
      <main class="flex-1 overflow-hidden relative">
        <KeepAlive>
          <component :is="activeComponent" />
        </KeepAlive>

        <!-- Connection Overlay -->
        <Transition enter-active-class="transition duration-500 ease-out" enter-from-class="opacity-0 translate-y-4"
          enter-to-class="opacity-100 translate-y-0" leave-active-class="transition duration-300 ease-in"
          leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-4">
          <div v-if="!telemetry.isConnected"
            class="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-900/90 backdrop-blur-md border border-red-500/50 rounded-full shadow-2xl flex items-center space-x-3 z-50 pointer-events-none">
            <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span class="text-red-100 font-bold text-sm tracking-wide">Connection Lost - Reconnecting...</span>
          </div>
        </Transition>
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
