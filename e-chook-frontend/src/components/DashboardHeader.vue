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
  ArrowPathIcon
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

const carStatusColor = computed(() => {
  if (!telemetry.lastPacketTime) return 'bg-red-500' // No data yet

  const diffStr = now.value - telemetry.lastPacketTime
  const diff = diffStr / 1000 // seconds

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
const pendingDay = ref(null)
const dontAskAgain = ref(false)

const formatTime = (ts) => {
  if (!ts) return '--/--'
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const statusText = computed(() => {
  if (telemetry.history.length === 0) return 'Waiting for Data...'

  const start = formatTime(telemetry.earliestTime)
  let end = 'Live'
  if (telemetry.isPaused) {
    end = formatTime(telemetry.latestTime)
  }
  return `${start} - ${end}`
})

const handleLogout = () => {
  auth.logout()
  router.push('/login')
}

// History Actions
function closeHistoryMenu() {
  showHistoryMenu.value = false
}

async function loadExtra(minutes) {
  if (auth.user?.id) {
    isLoadingHistory.value = true
    showHistoryMenu.value = false // Close menu
    try {
      await telemetry.loadExtraHistory(auth.user.id, minutes)
    } finally {
      isLoadingHistory.value = false
    }
  }
}

function onDaySelected(dateString) {
  if (dontAskAgain.value) {
    confirmLoadDay(dateString)
  } else {
    pendingDay.value = dateString
    showLoadConfirmModal.value = true
    showHistoryMenu.value = false // Close menu immediately
  }
}

async function confirmLoadDay(dateString = pendingDay.value) {
  if (auth.user?.id) {
    isLoadingHistory.value = true
    try {
      await telemetry.loadDay(auth.user.id, dateString)
    } finally {
      isLoadingHistory.value = false
    }
  }
  closeConfirmModal()
}

function closeConfirmModal() {
  showLoadConfirmModal.value = false
  pendingDay.value = null
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
      <div v-if="auth.user" class="flex flex-col">
        <span class="text-sm text-white font-semibold">{{ auth.user.carName || auth.user.car }}</span>
        <span class="text-xs text-gray-400">{{ auth.user.teamName || auth.user.team }} #{{ auth.user.number || '00'
        }}</span>
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
        <div class="relative">
          <div @click="toggleHistoryMenu"
            class="h-8 flex items-center text-xs font-mono text-gray-400 bg-neutral-800 px-3 rounded border border-neutral-700 whitespace-nowrap cursor-pointer hover:bg-neutral-700 hover:text-gray-300 transition select-none"
            :class="showHistoryMenu ? 'ring-1 ring-primary border-primary' : ''">
            Loaded Data: <span class="text-white font-bold ml-2">{{ statusText }}</span>
          </div>

          <!-- History Dropdown -->
          <div v-if="showHistoryMenu"
            class="absolute top-10 right-0 bg-neutral-900 border border-neutral-700 shadow-2xl rounded-lg p-4 z-50 flex space-x-4 min-w-[500px]">

            <!-- Quick Load -->
            <div class="flex flex-col space-y-2 w-32">
              <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Add History</h3>
              <button @click="loadExtra(10)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+
                10 Mins</button>
              <button @click="loadExtra(30)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+
                30 Mins</button>
              <button @click="loadExtra(60)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+ 1
                Hour</button>
              <button @click="loadExtra(180)"
                class="text-left text-sm text-gray-300 hover:text-white hover:bg-neutral-800 p-2 rounded transition">+ 3
                Hours</button>
              <div class="mt-auto pt-4">
                <p class="text-[10px] text-gray-600 leading-tight">Data deleted after 7 days.</p>
              </div>
            </div>
            <div class="w-px bg-neutral-700"></div>
            <!-- Calendar -->
            <div>
              <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Select Day</h3>
              <HistoryCalendar :available-days="telemetry.availableDays" @select-day="onDaySelected" />
            </div>
          </div>
          <!-- Overlay for dropdown -->
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
            :class="telemetry.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'"></div>
          <span class="text-xs font-medium text-gray-300">SERVER</span>
        </div>
      </div>

      <!-- Car Status -->
      <div class="flex items-center space-x-2">
        <div class="flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700">
          <div class="w-2 h-2 rounded-full transition-colors duration-300" :class="carStatusColor"></div>
          <span class="text-xs font-medium text-gray-300">CAR</span>
        </div>
      </div>

      <button @click="handleLogout" class="text-sm text-gray-400 hover:text-white transition cursor-pointer">
        Logout
      </button>
    </div>

    <!-- Modals -->
    <ConfirmationModal :is-open="showLoadConfirmModal" title="Load Historic Data?"
      :message="`Loading data for ${pendingDay} will remove all currently loaded data.`" confirm-text="Load Data"
      @close="closeConfirmModal" @confirm="confirmLoadDay(pendingDay)">
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
