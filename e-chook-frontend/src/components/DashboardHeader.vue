<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useTelemetryStore } from '../stores/telemetry'

const auth = useAuthStore()
const telemetry = useTelemetryStore()

// Car Status Logic
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
</script>

<template>
  <header class="h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-6 sticky top-0 z-50">
    <div class="flex items-center space-x-4">
      <div class="font-bold text-xl text-white tracking-tight"><span class="font-oswald tracking-normal text-2xl">eChook</span><span class="text-primary">Telemetry</span></div>
      <div class="h-6 w-px bg-neutral-700"></div>
      <div v-if="auth.user" class="flex flex-col">
        <span class="text-sm text-white font-semibold">{{ auth.user.car }}</span>
        <span class="text-xs text-gray-400">{{ auth.user.team }} #{{ auth.user.number || '00' }}</span>
      </div>
    </div>

    <div class="flex items-center space-x-6">
      
      <!-- Server Status -->
      <div class="flex items-center space-x-2">
        <div class="flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700">
          <div class="w-2 h-2 rounded-full" :class="telemetry.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'"></div>
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

      <button @click="auth.logout(); $router.push('/login')" class="text-sm text-gray-400 hover:text-white transition">
        Logout
      </button>
    </div>
  </header>
</template>
