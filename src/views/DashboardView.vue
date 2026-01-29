<!--
  @file views/DashboardView.vue
  @brief Main dashboard view for authenticated users.
  @description The primary interface for viewing telemetry data. Features a
               data ribbon with draggable cards, tabbed content area (Graph,
               Map, Laps, Settings, Admin), and keyboard shortcuts for navigation.
-->
<script setup>
/**
 * @description Dashboard view component setup.
 * 
 * Features:
 * - Real-time telemetry data display via data cards
 * - Draggable data card reordering (persisted to settings)
 * - Multiple tabs: Graph, Map, Laps, Settings, Admin (if admin)
 * - Lazy-loaded tab components for performance
 * - Keyboard shortcuts for navigation and chart control
 * - Responsive layout (mobile bottom tabs, desktop side tabs)
 */
import { onMounted, onUnmounted, ref, computed, shallowRef, defineAsyncComponent } from 'vue'
import { useTelemetryStore } from '../stores/telemetry'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import DashboardHeader from '../components/DashboardHeader.vue'
import DataCard from '../components/DataCard.vue'
import GraphHelpModal from '../components/GraphHelpModal.vue'
import draggable from 'vuedraggable'

// Lazy-loaded tab components for code splitting
const GraphTab = defineAsyncComponent(() => import('../components/tabs/GraphTab.vue'))
const MapTab = defineAsyncComponent(() => import('../components/tabs/MapTab.vue'))
const LapsTab = defineAsyncComponent(() => import('../components/tabs/LapsTab.vue'))
const SettingsTab = defineAsyncComponent(() => import('../components/tabs/SettingsTab.vue'))
const AdminTab = defineAsyncComponent(() => import('../components/tabs/AdminTab.vue'))

// Heroicons for tab navigation
import { ChartBarIcon, MapIcon, FlagIcon, CogIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const auth = useAuthStore()
const settings = useSettingsStore()

/**
 * @brief Get display unit for a telemetry key.
 * @param {string} key - Telemetry key
 * @returns {string|undefined} Unit string or undefined
 */
const getDisplayUnit = (key) => {
  if (key === 'speed') return telemetry.unitSettings.speedUnit
  if (key === 'temp1' || key === 'temp2' || key === 'tempDiff') return telemetry.unitSettings.tempUnit === 'f' ? '°F' : '°C'
  return undefined
}

/**
 * @brief Computed property for ordered data card keys.
 * @description Merges user's saved order with available telemetry keys.
 *              New keys are appended to the end of the user's order.
 */
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

// ============================================
// Tab Configuration
// ============================================

/**
 * @brief Currently active tab ID (persisted to settings).
 */
const activeTabId = computed({
  get: () => settings.activeTabId,
  set: (val) => { settings.activeTabId = val }
})

/**
 * @brief Tab definitions with conditional admin tab.
 * @type {ComputedRef<Array<Object>>}
 */
const tabs = computed(() => {
  const baseTabs = [
    { id: 'graph', label: 'Graph', icon: ChartBarIcon, component: GraphTab },
    { id: 'map', label: 'Map', icon: MapIcon, component: MapTab },
    { id: 'laps', label: 'Laps', icon: FlagIcon, component: LapsTab },
  ]

  if (auth.user?.isAdmin) {
    baseTabs.push({ id: 'admin', label: 'Admin', icon: ShieldCheckIcon, component: AdminTab })
  }

  return baseTabs
})

/**
 * @brief Get the component for the currently active tab.
 * @type {ComputedRef<Component>}
 */
const activeComponent = computed(() => {
  if (activeTabId.value === 'settings') return SettingsTab
  const tab = tabs.value.find(t => t.id === activeTabId.value)
  return tab ? tab.component : GraphTab
})

// ============================================
// Lifecycle Hooks
// ============================================

onMounted(() => {
  telemetry.connect()
  window.addEventListener('keydown', handleKeydown)

  // Show help modal for first-time users
  if (settings.showGraphHelp) {
    settings.showShortcutsModal = true
  }
})

onUnmounted(() => {
  telemetry.disconnect()
  window.removeEventListener('keydown', handleKeydown)
})

// ============================================
// Keyboard Shortcuts
// ============================================

/**
 * @brief Handle keyboard shortcuts for dashboard navigation and chart control.
 * @param {KeyboardEvent} e - Keyboard event
 * 
 * Shortcuts:
 * - Tab: Cycle through Graph → Map → Laps tabs
 * - Space: Pause/Resume live data
 * - R: Zoom chart to full current race
 * - 1-9: Zoom chart to last N laps
 * - L: Unlock chart zoom (return to live scroll)
 * - Arrow keys: Pan (left/right) and zoom (up/down) chart
 */
const handleKeydown = (e) => {
  // 1. Tab Cycling (Graph -> Map -> Laps)
  if (e.key === 'Tab') {
    e.preventDefault()

    const cycle = ['graph', 'map', 'laps']
    const currentIndex = cycle.indexOf(activeTabId.value)

    if (currentIndex === -1) {
      activeTabId.value = cycle[0]
    } else {
      const nextIndex = (currentIndex + 1) % cycle.length
      activeTabId.value = cycle[nextIndex]
    }
  }

  // 2. Space: Pause/Resume
  if (e.key === ' ' && e.target.tagName !== 'INPUT') {
    e.preventDefault()
    telemetry.togglePause()
  }

  // 3. 'R': Zoom to Full Race
  if (e.key.toLowerCase() === 'r' && e.target.tagName !== 'INPUT') {
    const races = Object.values(telemetry.races).sort((a, b) => b.startTimeMs - a.startTimeMs)
    if (races.length > 0) {
      const race = races[0]
      const end = telemetry.latestTime || Date.now()
      telemetry.requestChartZoom(race.startTimeMs, end)
    }
  }

  // 4. Number Keys (1-9): Zoom to Last N Laps
  if (!isNaN(parseInt(e.key)) && parseInt(e.key) > 0 && e.target.tagName !== 'INPUT') {
    const n = parseInt(e.key)
    const laps = telemetry.lapHistory

    if (laps.length > 0) {
      const lapsToShow = laps.slice(-n)
      if (lapsToShow.length > 0) {
        const start = lapsToShow[0].startTime
        let end = lapsToShow[lapsToShow.length - 1].finishTime

        if (!end || end < start) end = telemetry.latestTime || Date.now()

        telemetry.requestChartZoom(start, end)
      }
    }
  }

  // 5. 'L': Unlock Zoom (Return to Live Scroll)
  if (e.key.toLowerCase() === 'l' && e.target.tagName !== 'INPUT') {
    telemetry.requestChartUnlock()
  }

  // 6. Arrow Keys (Zoom/Pan) - Only on Graph Tab
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.target.tagName !== 'INPUT' && activeTabId.value === 'graph') {
    e.preventDefault()

    if (e.key === 'ArrowLeft') {
      telemetry.requestChartPan(-1 * 60 * 1000) // Back 1 min
    } else if (e.key === 'ArrowRight') {
      telemetry.requestChartPan(1 * 60 * 1000) // Forward 1 min
    } else if (e.key === 'ArrowUp') {
      telemetry.requestChartScale(0.8) // Zoom In (20%)
    } else if (e.key === 'ArrowDown') {
      telemetry.requestChartScale(1.2) // Zoom Out (20%)
    }
  }
}
</script>

<template>
  <div class="h-screen overflow-hidden bg-neutral-900 flex flex-col">
    <DashboardHeader />
    <GraphHelpModal :isOpen="settings.showShortcutsModal" @close="settings.showShortcutsModal = false" />

    <!-- Data Ribbon - horizontal scroll on mobile -->
    <div
      class="h-20 md:h-28 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur flex items-center px-3 md:px-6 overflow-x-auto no-scrollbar py-2">
      <draggable v-model="orderedKeys" item-key="key" class="flex flex-nowrap gap-2 md:gap-4" :animation="200">
        <template #item="{ element: key }">
          <DataCard :label="telemetry.getDisplayName(key)" :value="telemetry.displayLiveData[key]"
            :unit="getDisplayUnit(key)" :stale="telemetry.isDataStale" :tooltip="telemetry.getDescription(key)" />
        </template>
      </draggable>
      <div v-if="orderedKeys.length === 0" class="text-gray-500 text-sm italic">
        Waiting for telemetry data... (You can load historic data from the "Loaded Data" box)
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
      <!-- Desktop: Vertical Tab Sidebar (hidden on mobile) -->
      <aside
        class="hidden md:flex w-16 bg-neutral-900 border-r border-neutral-800 flex-col items-center py-4 space-y-4 z-40">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTabId = tab.id"
          class="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group relative"
          :class="activeTabId === tab.id ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-neutral-800 hover:text-gray-300'"
          :title="tab.label">
          <component :is="tab.icon" class="w-6 h-6" />
          <div v-if="activeTabId === tab.id" class="absolute left-0 w-1 h-6 bg-primary rounded-r-full"></div>
        </button>

        <div class="flex-1"></div>

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

        <!-- Connection Overlay -->
        <Transition enter-active-class="transition duration-500 ease-out" enter-from-class="opacity-0 translate-y-4"
          enter-to-class="opacity-100 translate-y-0" leave-active-class="transition duration-300 ease-in"
          leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 translate-y-4">
          <div v-if="!telemetry.isConnected"
            class="absolute bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 px-4 md:px-6 py-2 md:py-3 bg-red-900/90 backdrop-blur-md border border-red-500/50 rounded-full shadow-2xl flex items-center space-x-2 md:space-x-3 z-50 pointer-events-none">
            <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span class="text-red-100 font-bold text-xs md:text-sm tracking-wide">Reconnecting...</span>
          </div>
        </Transition>
      </main>

      <!-- Mobile: Bottom Tab Bar (hidden on desktop) -->
      <nav class="md:hidden h-14 bg-neutral-900 border-t border-neutral-800 flex items-center justify-around px-2 z-50">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTabId = tab.id"
          class="flex-1 h-full flex items-center justify-center relative"
          :class="activeTabId === tab.id ? 'text-primary' : 'text-gray-500'">
          <component :is="tab.icon" class="w-6 h-6" />
          <div v-if="activeTabId === tab.id" class="absolute bottom-0 w-8 h-1 bg-primary rounded-t-full"></div>
        </button>
        <button @click="activeTabId = 'settings'" class="flex-1 h-full flex items-center justify-center relative"
          :class="activeTabId === 'settings' ? 'text-primary' : 'text-gray-500'">
          <CogIcon class="w-6 h-6" />
          <div v-if="activeTabId === 'settings'" class="absolute bottom-0 w-8 h-1 bg-primary rounded-t-full"></div>
        </button>
      </nav>
    </div>
  </div>
</template>

<style>
/* Hide scrollbar for data ribbon */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
