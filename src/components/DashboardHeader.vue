<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTelemetryStore } from '../stores/telemetry'
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
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'
import logo from '../assets/vue.svg'
import HistoryCalendar from './HistoryCalendar.vue'
import ConfirmationModal from './ui/ConfirmationModal.vue'


const auth = useAuthStore()
const telemetry = useTelemetryStore()
const router = useRouter()

// -- Original Logic --
const now = ref(Date.now())
let timer = null

const lastUpdatedText = computed(() => {
  if (!telemetry.lastPacketTime) return 'No Data'
  const diff = Math.floor((now.value - telemetry.lastPacketTime) / 1000)
  if (diff < 2) return 'Just Now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return '>1h ago'
})

const carStatusColor = computed(() => {
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
  return new Date(ts).toLocaleString('en-GB', {
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
  if (telemetry.history.length === 0) return 'Waiting for Data...'
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
    isLoadingHistory.value = true
    showHistoryMenu.value = false // Close menu
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
  if (dontAskAgain.value) {
    confirmLoadDay()
  } else {
    showLoadConfirmModal.value = true
  }
}

async function confirmLoadDay() {
  if (displayedCar.value?.id && selectedDate.value) {
    isLoadingHistory.value = true
    try {
      await telemetry.loadDay(displayedCar.value.id, selectedDate.value, startTime.value, endTime.value)
    } finally {
      isLoadingHistory.value = false
    }
  }
  closeConfirmModal()
  showHistoryMenu.value = false
}

function closeConfirmModal() {
  showLoadConfirmModal.value = false
  // Don't clear selectedDate here immediately if we want to keep the menu state, 
  // but usually we want to reset if cancelled. 
  // For now, let's keep the menu open or closed based on flow.
  // Actually, if we cancel, we probably just close the modal.
}

const toggleHistoryMenu = () => {
  if (!showHistoryMenu.value) {
    if (auth.user?.id) {
      telemetry.fetchAvailableDays(auth.user.id)
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

    if (shouldReset && auth.user?.id) {
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
  if (auth.user?.id) {
    isLoadingHistory.value = true
    try {
      await telemetry.resetToLive(auth.user.id)
    } finally {
      isLoadingHistory.value = false
      showResumeConfirmModal.value = false
    }
  }
}

</script>

<template>
  <header
    class="h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-6 sticky top-0 z-50">
    <!-- Brand / Left Side -->
    <div class="flex items-center space-x-4">
      <div class="font-bold text-xl text-white tracking-tight">
        <span class="font-oswald tracking-normal text-2xl">eChook</span><span class="text-primary">Telemetry</span>
      </div>
      <div class="h-6 w-px bg-neutral-700"></div>
      <!-- Car Info Display -->
      <div v-if="displayedCar" class="flex flex-col">
        <span class="text-sm text-white font-semibold flex items-center">
          {{ displayedCar.carName }}
          <span v-if="isViewingOther" class="ml-2 text-[10px] text-yellow-500 uppercase tracking-wider">(Viewing)</span>
        </span>
        <span class="text-xs text-gray-400">{{ displayedCar.teamName }} #{{ displayedCar.number || '00' }}</span>
      </div>
    </div>

    <!-- Right Side Controls & Info -->
    <div class="flex items-center space-x-6">

      <!-- Loading Indicator -->
      <div v-if="isLoadingHistory" class="flex items-center space-x-2 text-primary animate-pulse">
        <ArrowPathIcon class="w-4 h-4 animate-spin" />
        <span class="text-xs font-bold uppercase">Loading...</span>
      </div>

      <!-- History Controls Group -->
      <div class="hidden md:flex items-center space-x-3">

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

          <!-- History Dropdown -->
          <div v-if="showHistoryMenu"
            class="absolute top-10 right-0 bg-neutral-900 border border-neutral-700 shadow-2xl rounded-lg p-4 z-50 flex space-x-6 min-w-[700px]">

            <!-- Column 1: Quick Load -->
            <div class="flex flex-col space-y-2 w-32 border-r border-neutral-800 pr-4">
              <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Quick Add</h3>
              <button @click="loadExtra(10)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+
                10
                Mins</button>
              <button @click="loadExtra(30)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+
                30
                Mins</button>
              <button @click="loadExtra(60)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+ 1
                Hour</button>
              <button @click="loadExtra(180)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+ 3
                Hours</button>
            </div>

            <!-- Column 2: Calendar -->
            <div class="flex flex-col">
              <HistoryCalendar :available-days="telemetry.availableDays" @select-day="handleDayClick" />
              <p class="text-[10px] text-gray-500 max-w-[250px] leading-tight mt-2">
                <ExclamationTriangleIcon class="w-3 h-3 inline mr-1" />
                Data stored on the server is not permanent. It may be deleted to free up space.
              </p>
            </div>

            <!-- Column 3: Time Range & Load Action -->
            <div class="flex flex-col w-48 border-l border-neutral-800 pl-4 space-y-4">
              <!-- Selection Status -->
              <div v-if="selectedDate" class="text-sm font-bold text-primary">
                {{ selectedDate }}
              </div>
              <div v-else class="text-sm font-bold text-gray-500">
                Select a day...
              </div>

              <!-- Time Inputs -->
              <div class="flex flex-col space-y-1">
                <label class="text-[10px] text-gray-500 uppercase tracking-wider">Start Time</label>
                <input v-model="startTime" type="time"
                  class="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-white text-sm focus:border-primary outline-none w-full">
              </div>

              <div class="flex flex-col space-y-1">
                <label class="text-[10px] text-gray-500 uppercase tracking-wider">End Time</label>
                <input v-model="endTime" type="time"
                  class="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-white text-sm focus:border-primary outline-none w-full">
              </div>

              <!-- Action Button -->
              <button @click="triggerLoadDay" :disabled="!selectedDate"
                class="w-full bg-primary hover:bg-primary/90 text-white font-bold py-2 rounded text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                Load Data
              </button>
            </div>
          </div>
          <!-- Overlay -->
          <div v-if="showHistoryMenu" class="fixed inset-0 z-40" @click="closeHistoryMenu"></div>
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

      <!-- Divider -->
      <div class="h-8 w-px bg-neutral-800 hidden md:block"></div>

      <!-- Server Status -->
      <div class="flex items-center space-x-2">
        <div class="flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700">
          <div class="w-2 h-2 rounded-full"
            :class="telemetry.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'">
          </div>
          <span class="text-xs font-medium text-gray-300">SERVER</span>
        </div>
      </div>

      <!-- Car Status -->
      <div class="flex items-center space-x-2">
        <div class="flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700">
          <div class="w-2 h-2 rounded-full transition-colors duration-300" :class="carStatusColor"></div>
          <span class="text-xs font-medium text-gray-300 uppercase tracking-wider">Car:</span>
          <span class="text-[10px] font-bold text-white whitespace-nowrap">{{ lastUpdatedText }}</span>
        </div>
      </div>

      <button @click="handleLogout" class="text-sm text-gray-400 hover:text-white transition cursor-pointer">
        Logout
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
