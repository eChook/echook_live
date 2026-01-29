<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTelemetryStore } from '../stores/telemetry'
import { useSettingsStore } from '../stores/settings'
import { useRouter } from 'vue-router'
import {
  SignalIcon,
  SignalSlashIcon,
  UserCircleIcon,
  PauseIcon,
  PlayIcon,
  ClockIcon,
  TrashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  ServerIcon,
  TruckIcon
} from '@heroicons/vue/24/outline'
import logo from '../assets/vue.svg'
import HistoryCalendar from './HistoryCalendar.vue'
import ConfirmationModal from './ui/ConfirmationModal.vue'


const auth = useAuthStore()
const telemetry = useTelemetryStore()
const settings = useSettingsStore()
const router = useRouter()

// -- Original Logic --
const now = ref(Date.now())
let timer = null

const lastUpdatedText = computed(() => {
  if (telemetry.isPaused) return ''
  if (!telemetry.lastPacketTime) return 'No Data'
  const diff = Math.floor((now.value - telemetry.lastPacketTime) / 1000)
  if (diff < 10) return ''
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return '>1h ago'
})

const carStatusColor = computed(() => {
  if (telemetry.isPaused) return 'bg-orange-500'
  if (!telemetry.lastPacketTime || !telemetry.isConnected) return 'bg-red-500'
  const diff = (now.value - telemetry.lastPacketTime) / 1000
  if (diff > 10) return 'bg-red-500'
  if (diff > 5) return 'bg-orange-500'
  return 'bg-green-500 animate-pulse'
})

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// -- New History Logic --
const showHistoryMenu = ref(false)
const showLoadConfirmModal = ref(false) // For loading history
const showResumeConfirmModal = ref(false) // For resuming live
const isLoadingHistory = ref(false)
const selectedDate = ref(null)
const startTime = ref('00:00')
const endTime = ref('23:59')
const dontAskAgain = ref(false)

const formatTime = (ts) => {
  if (!ts) return '--/--'
  // Ensure ts is a number (Date constructor with string timestamp like "123456" is invalid)
  const date = new Date(Number(ts))
  if (isNaN(date.getTime())) {
    console.warn('Invalid timestamp for header:', ts)
    return '--/--'
  }
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const displayedCar = computed(() => {
  // If we are "viewing" a car via Admin features, use that
  if (telemetry.viewingCar) {
    return {
      id: telemetry.viewingCar.id,
      carName: telemetry.viewingCar.carName || telemetry.viewingCar.car || 'Unknown Car',
      teamName: telemetry.viewingCar.teamName || telemetry.viewingCar.team || 'Unknown Team',
      number: telemetry.viewingCar.number
    }
  }
  // Fallback to logged in user
  if (auth.user) {
    return {
      id: auth.user.id || auth.user._id,
      carName: auth.user.carName || auth.user.car,
      teamName: auth.user.teamName || auth.user.team,
      number: auth.user.number
    }
  }
  return null
})

const isViewingOther = computed(() => {
  if (!displayedCar.value || !auth.user) return false
  const userId = auth.user.id || auth.user._id
  return displayedCar.value.id !== userId
})

const statusText = computed(() => {
  if (telemetry.history.length === 0) return 'Waiting for Data... '
  // ... rest of logic
  const start = formatTime(telemetry.earliestTime)
  let end = 'Live'
  if (telemetry.isPaused) {
    end = formatTime(telemetry.latestTime)
  }
  return `${start} - ${end}`
})
// ... existing code


const handleLogout = () => {
  auth.logout()
  router.push('/login')
}

// History Actions
function closeHistoryMenu() {
  showHistoryMenu.value = false
  selectedDate.value = null
  startTime.value = '00:00'
  endTime.value = '23:59'
}

async function loadExtra(minutes) {
  if (displayedCar.value?.id) {
    showHistoryMenu.value = false // Close menu first for better UX
    isLoadingHistory.value = true
    try {
      await telemetry.loadExtraHistory(displayedCar.value.id, minutes)
    } finally {
      isLoadingHistory.value = false
    }
  }
}

function handleDayClick(dateString) {
  selectedDate.value = dateString
  // Keep defaults or existing selection
}

function triggerLoadDay() {
  if (settings.hideHistoryClearConfirmation) {
    // If setting is enabled, skip modal
    confirmLoadDay(true)
  } else {
    // Reset check state
    dontAskAgain.value = false
    showLoadConfirmModal.value = true
  }
}

async function confirmLoadDay(skipModal = false) {
  // 1. Update setting if checkbox was checked
  if (!skipModal && dontAskAgain.value) {
    settings.hideHistoryClearConfirmation = true
  }

  // 2. Close UI immediately
  closeConfirmModal()
  showHistoryMenu.value = false

  // 3. Start Loading
  if (displayedCar.value?.id && selectedDate.value) {
    isLoadingHistory.value = true
    try {
      await telemetry.loadDay(displayedCar.value.id, selectedDate.value, startTime.value, endTime.value)
    } finally {
      isLoadingHistory.value = false
    }
  }
}

function closeConfirmModal() {
  showLoadConfirmModal.value = false
}

const toggleHistoryMenu = () => {
  if (!showHistoryMenu.value) {
    if (displayedCar.value?.id) {
      telemetry.fetchAvailableDays(displayedCar.value.id)
    }
  }
  showHistoryMenu.value = !showHistoryMenu.value
}

// Smart Play Button logic
const playButtonTitle = computed(() => {
  if (!telemetry.isPaused) return 'Pause'

  // Check if we are in history mode (not today)
  const lastPoint = telemetry.history.length > 0 ? telemetry.history[telemetry.history.length - 1] : null
  if (lastPoint) {
    const lastDate = new Date(lastPoint.timestamp).getDate()
    const today = new Date().getDate()
    if (lastDate !== today) {
      return 'Reset to Live'
    }
  }
  return 'Resume'
})

function handlePlayButton() {
  if (telemetry.isPaused) {
    // Check if we should reset to live
    const lastPoint = telemetry.history.length > 0 ? telemetry.history[telemetry.history.length - 1] : null

    let shouldReset = false
    if (lastPoint) {
      // Simple day check
      const lastDate = new Date(lastPoint.timestamp).toDateString()
      const today = new Date().toDateString()
      if (lastDate !== today) {
        shouldReset = true
      }
    }

    if (shouldReset && displayedCar.value?.id) {
      // Show Resume Confirmation Modal
      showResumeConfirmModal.value = true
    } else {
      telemetry.togglePause()
    }
  } else {
    telemetry.togglePause()
  }
}

async function confirmResetToLive() {
  if (displayedCar.value?.id) {
    isLoadingHistory.value = true
    try {
      await telemetry.resetToLive(displayedCar.value.id)
    } finally {
      isLoadingHistory.value = false
      showResumeConfirmModal.value = false
    }
  }
}

// Download All Data
import { exportHistoryAsCsv } from '../utils/csvExport'
import { ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

const downloadAllData = () => {
  if (telemetry.history.length === 0) return

  // Use earliest and latest time from telemetry store getters
  // If live, latestTime might not be perfectly up to date with 'now', but it covers the data range.
  const start = telemetry.earliestTime
  const end = telemetry.latestTime
  const track = telemetry.races.length > 0 ? 'mixed-session' : 'unknown-track'
  // Ideally we could look at the track of the first race or something, but 'mixed' is safer if multiple

  exportHistoryAsCsv(start, end, 'eChook-full-export', track)
}

</script>

<template>
  <header
    class="h-14 md:h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 md:px-6 sticky top-0 z-50">
    <!-- Brand / Left Side -->
    <div class="flex items-center space-x-2 md:space-x-4">
      <!-- Mobile/Tablet: eC -->
      <div class="block lg:hidden font-oswald text-2xl font-bold text-primary tracking-tight">
        eC
      </div>
      <!-- Desktop: Full logo -->
      <router-link to="/login"
        class="hidden lg:block font-bold text-xl text-white tracking-tight hover:opacity-80 transition cursor-pointer">
        <span class="font-oswald tracking-normal text-2xl">eChook</span><span class="text-primary">Telemetry</span>
      </router-link>
      <div class="h-6 w-px bg-neutral-700 hidden lg:block"></div>
      <!-- Car Info Display - condensed on mobile -->
      <div v-if="displayedCar" class="flex flex-col">
        <span
          class="text-xs md:text-sm text-white font-semibold flex items-center truncate max-w-[100px] md:max-w-none">
          {{ displayedCar.carName }}
          <span v-if="isViewingOther"
            class="ml-1 md:ml-2 text-[8px] md:text-[10px] text-yellow-500 uppercase tracking-wider">(V)</span>
        </span>
        <span class="text-[10px] md:text-xs text-gray-400 truncate max-w-[100px] md:max-w-none">{{ displayedCar.teamName
        }} #{{ displayedCar.number || '00' }}</span>
      </div>
    </div>

    <!-- Right Side Controls & Info -->
    <div class="flex items-center space-x-2 md:space-x-6">

      <!-- Loading Indicator -->
      <div v-if="isLoadingHistory" class="flex items-center space-x-1 md:space-x-2 text-primary animate-pulse">
        <ArrowPathIcon class="w-4 h-4 animate-spin" />
        <span class="text-xs font-bold uppercase hidden md:inline">Loading...</span>
      </div>

      <!-- Mobile/Tablet: History dropdown trigger + Play/Pause -->
      <div class="lg:hidden flex items-center space-x-2">
        <button @click="toggleHistoryMenu"
          class="flex items-center justify-center w-8 h-8 rounded bg-neutral-800 border border-neutral-700 text-gray-300 hover:bg-neutral-700 transition"
          :class="showHistoryMenu ? 'ring-1 ring-primary border-primary' : ''" title="History">
          <ClockIcon class="w-5 h-5" />
        </button>
        <!-- Pause/Resume -->
        <button @click="handlePlayButton" class="flex items-center justify-center w-8 h-8 rounded border transition"
          :class="telemetry.isPaused ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50' : 'bg-neutral-800 border-neutral-700 text-gray-300'"
          :title="playButtonTitle">
          <PlayIcon v-if="telemetry.isPaused" class="w-5 h-5" />
          <PauseIcon v-else class="w-5 h-5" />
        </button>
      </div>

      <!-- Desktop: History Controls Group -->
      <div class="hidden lg:flex items-center space-x-3">

        <!-- Status Text / History Trigger -->
        <!-- Status Text / History Trigger -->
        <div class="relative flex items-center">
          <div v-if="telemetry.isHistoryTruncated" class="mr-2 text-yellow-500 cursor-default"
            title="Data is truncated">
            <ExclamationTriangleIcon class="w-5 h-5" />
          </div>
          <div @click="toggleHistoryMenu"
            class="h-8 flex items-center text-xs font-mono text-gray-400 bg-neutral-800 px-3 rounded border border-neutral-700 whitespace-nowrap cursor-pointer hover:bg-neutral-700 hover:text-gray-300 transition select-none"
            :class="showHistoryMenu ? 'ring-1 ring-primary border-primary' : ''" title="Manage Loaded History">
            Loaded Data:
            <span class="text-white font-bold ml-2 flex items-center">
              {{ statusText }}
            </span>
          </div>
        </div>


        <!-- Pause/Resume/Reset -->
        <button @click="handlePlayButton"
          class="flex items-center justify-center w-8 h-8 rounded border transition relative z-10"
          :class="telemetry.isPaused ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/30' : 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700'"
          :title="playButtonTitle">
          <PlayIcon v-if="telemetry.isPaused" class="w-5 h-5" />
          <PauseIcon v-else class="w-5 h-5" />
        </button>

        <!-- Clear Data -->
        <button @click="telemetry.clearHistory()"
          class="flex items-center justify-center w-8 h-8 rounded bg-neutral-800 border border-neutral-700 hover:bg-rose-500/20 hover:text-rose-500 hover:border-rose-500/50 text-gray-300 transition relative z-10"
          title="Clear All Data">
          <TrashIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- History Dropdown (shared by mobile and desktop triggers) -->
      <div v-if="showHistoryMenu"
        class="fixed lg:absolute top-14 lg:top-16 right-0 lg:right-6 bg-neutral-900 border border-neutral-700 shadow-2xl rounded-lg p-3 lg:p-4 z-[60] flex flex-col w-[calc(100vw-1rem)] max-w-md lg:max-w-none lg:w-auto lg:min-w-[700px] mx-auto lg:mx-0 max-h-[70vh] overflow-y-auto">

        <!-- Mobile: Loaded Data Status Header -->
        <div class="lg:hidden flex items-center justify-between pb-3 border-b border-neutral-700">
          <div class="flex items-center space-x-2">
            <span class="text-xs text-gray-400">Loaded:</span>
            <span class="text-xs font-mono text-white font-bold">{{ statusText }}</span>
            <div v-if="telemetry.isHistoryTruncated" class="text-yellow-500" title="Data is truncated">
              <ExclamationTriangleIcon class="w-4 h-4" />
            </div>
          </div>
          <button @click="telemetry.clearHistory()"
            class="flex items-center space-x-1 text-xs text-gray-400 hover:text-rose-500 transition"
            title="Clear All Data">
            <TrashIcon class="w-4 h-4" />
            <span>Clear</span>
          </button>
        </div>

        <!-- Content Columns Wrapper -->
        <div class="flex flex-col lg:flex-row lg:space-x-6">
          <!-- Quick Load Buttons (horizontal row on mobile) -->
          <div
            class="flex flex-col lg:flex-row lg:flex-col space-y-2 lg:space-y-0 lg:w-32 lg:border-r lg:border-neutral-800 lg:pr-4">
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Quick Add</h3>
            <div class="flex flex-row space-x-2 lg:flex-col lg:space-x-0 lg:space-y-2">
              <button @click="loadExtra(10)"
                class="flex-1 lg:flex-none text-center lg:text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+10m</button>
              <button @click="loadExtra(30)"
                class="flex-1 lg:flex-none text-center lg:text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+30m</button>
              <button @click="loadExtra(60)"
                class="flex-1 lg:flex-none text-center lg:text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+1h</button>
              <button @click="loadExtra(180)"
                class="flex-1 lg:flex-none text-center lg:text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+3h</button>
            </div>
          </div>

          <!-- Mobile: Load History section (calendar + selection side by side) -->
          <div class="flex lg:hidden space-x-3">
            <!-- Calendar -->
            <div class="flex-1">
              <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Load History</h3>
              <HistoryCalendar :available-days="telemetry.availableDays" @select-day="handleDayClick" />
            </div>

            <!-- Date Selection & Time -->
            <div class="flex flex-col space-y-2 w-28">
              <div v-if="selectedDate" class="text-sm font-bold text-primary">{{ selectedDate }}</div>
              <div v-else class="text-xs text-gray-500">Select a day</div>

              <div class="flex flex-col space-y-1">
                <label class="text-[10px] text-gray-500">Start</label>
                <input v-model="startTime" type="time"
                  class="bg-neutral-800 border border-neutral-600 rounded px-1 py-0.5 text-white text-xs focus:border-primary outline-none w-full">
              </div>
              <div class="flex flex-col space-y-1">
                <label class="text-[10px] text-gray-500">End</label>
                <input v-model="endTime" type="time"
                  class="bg-neutral-800 border border-neutral-600 rounded px-1 py-0.5 text-white text-xs focus:border-primary outline-none w-full">
              </div>

              <button @click="triggerLoadDay" :disabled="!selectedDate"
                class="bg-primary hover:bg-primary/90 text-white font-bold py-1.5 rounded text-xs transition disabled:opacity-50 disabled:cursor-not-allowed">
                Load
              </button>
            </div>
          </div>

          <!-- Desktop: Load History Section (Calendar + Time + Load button) -->
          <div class="hidden lg:flex flex-col space-y-3">
            <h3 class="text-sm font-bold text-gray-400">Load History</h3>

            <div class="flex space-x-4">
              <!-- Calendar -->
              <div class="flex flex-col">
                <HistoryCalendar :available-days="telemetry.availableDays" @select-day="handleDayClick" />
                <p class="text-[10px] text-gray-500 max-w-[250px] leading-tight mt-2 cursor-help"
                  title="After 10 days the data resolution is reduced to 10s. Depending on database size and server storage, it will be deleted at a later date.">
                  <ExclamationTriangleIcon class="w-3 h-3 inline mr-1" />
                  Data stored on the server is not permanent.
                </p>
              </div>

              <!-- Date & Time Selection -->
              <div class="flex flex-col space-y-3 w-40">
                <!-- Selected Date -->
                <div v-if="selectedDate" class="text-sm font-bold text-primary">
                  {{ selectedDate }}
                </div>
                <div v-else class="text-sm text-gray-500 italic">
                  Select a day...
                </div>

                <!-- Time Inputs -->
                <div class="flex flex-col space-y-2">
                  <div class="flex flex-col space-y-1">
                    <label class="text-[10px] text-gray-500 uppercase tracking-wider">Start Time</label>
                    <input v-model="startTime" type="time"
                      class="bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-white text-sm focus:border-primary outline-none w-full cursor-pointer">
                  </div>
                  <div class="flex flex-col space-y-1">
                    <label class="text-[10px] text-gray-500 uppercase tracking-wider">End Time</label>
                    <input v-model="endTime" type="time"
                      class="bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-white text-sm focus:border-primary outline-none w-full cursor-pointer">
                  </div>
                </div>


                <!-- Action Button -->
                <button @click="triggerLoadDay" :disabled="!selectedDate"
                  class="w-full bg-primary hover:bg-primary/90 text-white font-bold py-2 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                  Load Data
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Divider & Download All -->
        <div class="border-t border-neutral-800 pt-3 mt-4">
          <button @click="downloadAllData" :disabled="telemetry.history.length === 0"
            class="w-full flex items-center justify-center space-x-2 bg-neutral-800 hover:bg-neutral-700 text-gray-300 hover:text-white font-medium py-2 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed border border-neutral-700">
            <ArrowDownTrayIcon class="w-4 h-4" />
            <span>Download All Loaded Data</span>
          </button>
        </div>
      </div>
      <!-- Overlay -->
      <div v-if="showHistoryMenu" class="fixed inset-0 z-50" @click="closeHistoryMenu"></div>

      <!-- Divider -->
      <div class="h-8 w-px bg-neutral-800 hidden lg:block"></div>

      <!-- Server Status - Icons only on mobile/tablet -->
      <div class="flex items-center">
        <div
          class="flex items-center space-x-1 lg:space-x-2 px-2 lg:px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700"
          title="Server Status">
          <div class="w-2 h-2 rounded-full"
            :class="telemetry.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'">
          </div>
          <ServerIcon class="w-4 h-4 text-gray-400 lg:hidden" />
          <span class="text-xs font-medium text-gray-300 hidden lg:inline">SERVER</span>
        </div>
      </div>

      <!-- Car Status - Icons only on mobile/tablet -->
      <div class="flex items-center">
        <div
          class="flex items-center space-x-1 lg:space-x-2 px-2 lg:px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700"
          title="Car Status">
          <div class="w-2 h-2 rounded-full transition-colors duration-300" :class="carStatusColor"></div>
          <TruckIcon class="w-4 h-4 text-gray-400 lg:hidden" />
          <span class="text-xs font-medium text-gray-300 uppercase tracking-wider hidden lg:inline">Car</span>
          <span class="text-[10px] font-bold text-white whitespace-nowrap hidden lg:inline">{{ lastUpdatedText
          }}</span>
        </div>
      </div>

      <!-- Logout: Icon on mobile/tablet, text on desktop -->
      <!-- Logout: Icon always -->
      <button @click="handleLogout" class="text-gray-400 hover:text-white transition cursor-pointer" title="Logout">
        <ArrowRightOnRectangleIcon class="w-5 h-5" />
      </button>
    </div>

    <!-- Modals -->
    <ConfirmationModal :is-open="showLoadConfirmModal" title="Load Historic Data?"
      :message="`Loading data for ${selectedDate} will remove all currently loaded data.`" confirm-text="Load Data"
      @close="closeConfirmModal" @confirm="confirmLoadDay()">
      <template #body>
        <div class="flex items-center mt-2">
          <input type="checkbox" id="dontAsk" v-model="dontAskAgain"
            class="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-primary focus:ring-primary">
          <label for="dontAsk" class="ml-2 text-xs text-gray-400 select-none">Don't ask me again</label>
        </div>
      </template>
    </ConfirmationModal>

    <ConfirmationModal :is-open="showResumeConfirmModal" title="Return to Live?"
      message="This will clear currently loaded historic data and fetch the latest live data."
      confirm-text="Return to Live" @close="showResumeConfirmModal = false" @confirm="confirmResetToLive" />

  </header>
</template>
