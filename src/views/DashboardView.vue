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
import { CARD_THRESHOLD_KEYS, evaluateChannelThresholds } from '../utils/eventThresholds'
import { useCriticalEventAlerts } from '../composables/useCriticalEventAlerts'
import { navTabIconButtonClass, NAV_TAB_LEFT_ACCENT_CLASS } from '../utils/navTabClasses'

// Lazy-loaded tab components for code splitting
const GraphTab = defineAsyncComponent(() => import('../components/tabs/GraphTab.vue'))
const MapTab = defineAsyncComponent(() => import('../components/tabs/MapTab.vue'))
const LapsTab = defineAsyncComponent(() => import('../components/tabs/LapsTab.vue'))
const AnalyticsTab = defineAsyncComponent(() => import('../components/tabs/AnalyticsTab.vue'))
const SettingsTab = defineAsyncComponent(() => import('../components/tabs/SettingsTab.vue'))
const AdminTab = defineAsyncComponent(() => import('../components/tabs/AdminTab.vue'))

// Heroicons for tab navigation
import { ChartBarIcon, MapIcon, TableCellsIcon, CogIcon, ShieldCheckIcon, PresentationChartLineIcon } from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const auth = useAuthStore()
const settings = useSettingsStore()

useCriticalEventAlerts({
  telemetry,
  settings,
  isEnabled: computed(() => !!auth.user)
})

/**
 * @brief Get display unit for a telemetry key.
 * @param {string} key - Telemetry key
 * @returns {string|undefined} Unit string or undefined
 */
const getDisplayUnit = (key) => {
  if (key === 'speed') return telemetry.unitSettings.speedUnit
  if (key === 'temp1' || key === 'temp2' || key === 'tempDiff') return telemetry.unitSettings.tempUnit === 'f' ? '°F' : '°C'
  if (key === 'powerW') return 'W'
  if (key === 'powerUsedWh') return 'Wh'
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

/**
 * @brief Live threshold severity snapshot for dashboard cards.
 * @description Evaluates raw live telemetry against user-configured event thresholds.
 */
const liveThresholdStatus = computed(() => evaluateChannelThresholds(
  telemetry.liveData,
  settings.analyticsSettings
))

/**
 * @brief Resolve threshold status for a data-card key.
 * @param {string} key - Telemetry key displayed by the card
 * @returns {'normal'|'warning'|'critical'} Threshold severity for the card
 */
const getCardThresholdStatus = (key) => {
  const channelKey = CARD_THRESHOLD_KEYS[key]
  if (!channelKey) return 'normal'
  const severity = liveThresholdStatus.value?.[channelKey]?.severity
  return severity === 'warning' || severity === 'critical' ? severity : 'normal'
}

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
    { id: 'laps', label: 'Laps', icon: TableCellsIcon, component: LapsTab },
  ]

  if (auth.isAdmin) {
    baseTabs.push({ id: 'analytics', label: 'Analytics', icon: PresentationChartLineIcon, component: AnalyticsTab })
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

/**
 * @brief Ordered tab IDs for Ctrl+Tab keyboard cycling (all visible tabs + Settings).
 * @type {ComputedRef<string[]>}
 */
const tabCycleIds = computed(() => [
  ...tabs.value.map((t) => t.id),
  'settings'
])

/**
 * @brief True when the event target is a form control that should keep native keyboard behavior.
 * @param {EventTarget|null} target - Keyboard event target
 * @returns {boolean}
 */
const isEditableTarget = (target) => {
  if (!target || !target.tagName) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

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
 * - Ctrl+Tab / Ctrl+Shift+Tab: Cycle through all dashboard tabs (including Settings)
 * - Space: Pause/Resume live data
 * - R: Zoom chart to full current race
 * - 1-9: Zoom chart to last N laps
 * - L: Unlock chart zoom (return to live scroll)
 * - Arrow keys: Pan (left/right) and zoom (up/down) chart
 */
const handleKeydown = (e) => {
  // 1. Tab cycling via Ctrl+Tab (forward) / Ctrl+Shift+Tab (backward)
  if (e.ctrlKey && e.key === 'Tab' && !isEditableTarget(e.target)) {
    e.preventDefault()

    const cycle = tabCycleIds.value
    const currentIndex = cycle.indexOf(activeTabId.value)

    if (e.shiftKey) {
      activeTabId.value = currentIndex === -1
        ? cycle[cycle.length - 1]
        : cycle[(currentIndex - 1 + cycle.length) % cycle.length]
    } else {
      activeTabId.value = currentIndex === -1
        ? cycle[0]
        : cycle[(currentIndex + 1) % cycle.length]
    }
    return
  }

  // 2. Space: Pause/Resume
  if (e.key === ' ' && !isEditableTarget(e.target)) {
    e.preventDefault()
    telemetry.togglePause()
  }

  // 3. 'R': Zoom to Full Race
  if (e.key.toLowerCase() === 'r' && !isEditableTarget(e.target)) {
    const races = Object.values(telemetry.races).sort((a, b) => b.startTimeMs - a.startTimeMs)
    if (races.length > 0) {
      const race = races[0]
      const end = telemetry.latestTime || Date.now()
      telemetry.requestChartZoom(race.startTimeMs, end)
    }
  }

  // 4. Number Keys (1-9): Zoom to Last N Laps
  if (!isNaN(parseInt(e.key)) && parseInt(e.key) > 0 && !isEditableTarget(e.target)) {
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
  if (e.key.toLowerCase() === 'l' && !isEditableTarget(e.target)) {
    telemetry.requestChartUnlock()
  }

  // 6. Arrow Keys (Zoom/Pan) - Only on Graph Tab
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !isEditableTarget(e.target) && activeTabId.value === 'graph') {
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
  <div class="h-screen overflow-hidden bg-[color:var(--app-bg)] flex flex-col">
    <DashboardHeader />
    <GraphHelpModal :isOpen="settings.showShortcutsModal" @close="settings.showShortcutsModal = false" />

    <!-- Data Ribbon - hidden when disconnected or viewing a previous day's historic data -->
    <Transition enter-active-class="transition-all duration-300 ease-out overflow-hidden"
      enter-from-class="opacity-0 max-h-0 border-b-0" enter-to-class="opacity-100 max-h-32 border-b"
      leave-active-class="transition-all duration-300 ease-in overflow-hidden"
      leave-from-class="opacity-100 max-h-32 border-b" leave-to-class="opacity-0 max-h-0 border-b-0">
      <div v-if="telemetry.showDataRibbon"
        class="h-20 md:h-28 shrink-0 border-b border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex items-center px-3 md:px-6 overflow-x-auto no-scrollbar py-2">
        <draggable v-model="orderedKeys" item-key="key" class="flex flex-nowrap gap-2 md:gap-4" :animation="200">
          <template #item="{ element: key }">
            <DataCard :label="telemetry.getDisplayName(key)" :value="telemetry.displayLiveData[key]"
              :data-key="key" :unit="getDisplayUnit(key)" :stale="telemetry.isDataStale"
              :threshold-status="getCardThresholdStatus(key)" :tooltip="telemetry.getDescription(key)" />
          </template>
        </draggable>
        <div v-if="orderedKeys.length === 0" class="text-zinc-500 dark:text-gray-500 text-sm italic">
          Waiting for telemetry data... (You can load historic data from the "Loaded Data" box)
        </div>
      </div>
    </Transition>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
      <!-- Desktop: Vertical Tab Sidebar (hidden on mobile) -->
      <aside
        class="hidden md:flex w-16 bg-zinc-100 dark:bg-neutral-900 border-r border-zinc-200 dark:border-neutral-800 flex-col items-center py-4 space-y-4 z-40">
        <button v-for="tab in tabs" :key="tab.id" type="button" @click="activeTabId = tab.id"
          :class="navTabIconButtonClass(activeTabId === tab.id)"
          :title="tab.label" :aria-label="tab.label" :aria-current="activeTabId === tab.id ? 'page' : undefined">
          <component :is="tab.icon" class="w-6 h-6" />
          <div v-if="activeTabId === tab.id" :class="NAV_TAB_LEFT_ACCENT_CLASS"></div>
        </button>

        <div class="flex-1"></div>

        <button type="button" @click="activeTabId = 'settings'"
          :class="navTabIconButtonClass(activeTabId === 'settings')"
          title="Settings" aria-label="Settings" :aria-current="activeTabId === 'settings' ? 'page' : undefined">
          <CogIcon class="w-6 h-6" />
          <div v-if="activeTabId === 'settings'" :class="NAV_TAB_LEFT_ACCENT_CLASS"></div>
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
            class="absolute bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 px-4 md:px-6 py-2 md:py-3 backdrop-blur-md rounded-full shadow-2xl flex items-center space-x-2 md:space-x-3 z-50 pointer-events-none"
            :class="telemetry.isSocketReconnecting ? 'bg-amber-900/90 border border-amber-500/50' : 'bg-red-900/90 border border-red-500/50'">
            <div class="w-2 h-2 rounded-full animate-pulse motion-reduce:animate-none"
              :class="telemetry.isSocketReconnecting ? 'bg-amber-400' : 'bg-red-500'"></div>
            <span class="font-bold text-xs md:text-sm tracking-wide"
              :class="telemetry.isSocketReconnecting ? 'text-amber-100' : 'text-red-100'">
              {{ telemetry.socketStatusMessage || telemetry.socketError || 'Reconnecting...' }}
            </span>
          </div>
        </Transition>
      </main>

      <!-- Mobile: Bottom Tab Bar (hidden on desktop) -->
      <nav class="md:hidden h-14 bg-zinc-100 dark:bg-neutral-900 border-t border-zinc-200 dark:border-neutral-800 flex items-center justify-around px-2 z-50" aria-label="Dashboard tabs">
        <button v-for="tab in tabs" :key="tab.id" type="button" @click="activeTabId = tab.id"
          class="flex-1 h-full flex flex-col items-center justify-center relative gap-0.5"
          :class="activeTabId === tab.id ? 'text-primary' : 'text-zinc-500 dark:text-gray-500'"
          :aria-label="tab.label" :aria-current="activeTabId === tab.id ? 'page' : undefined">
          <component :is="tab.icon" class="w-6 h-6" />
          <span class="sr-only">{{ tab.label }}</span>
          <div v-if="activeTabId === tab.id" class="absolute bottom-0 w-8 h-1 bg-primary rounded-t-full"></div>
        </button>
        <button type="button" @click="activeTabId = 'settings'" class="flex-1 h-full flex flex-col items-center justify-center relative gap-0.5"
          :class="activeTabId === 'settings' ? 'text-primary' : 'text-zinc-500 dark:text-gray-500'"
          aria-label="Settings" :aria-current="activeTabId === 'settings' ? 'page' : undefined">
          <CogIcon class="w-6 h-6" />
          <span class="sr-only">Settings</span>
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
