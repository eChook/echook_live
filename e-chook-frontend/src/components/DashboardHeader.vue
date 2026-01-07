<script setup>
import { useAuthStore } from '../stores/auth'
import { useTelemetryStore } from '../stores/telemetry'

const auth = useAuthStore()
const telemetry = useTelemetryStore()
</script>

<template>
  <header class="h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-6 sticky top-0 z-50">
    <div class="flex items-center space-x-4">
      <div class="font-bold text-xl text-white tracking-tight">eChook<span class="text-teal-400">Telemetry</span></div>
      <div class="h-6 w-px bg-neutral-700"></div>
      <div v-if="auth.user" class="flex flex-col">
        <span class="text-sm text-white font-semibold">{{ auth.user.car }}</span>
        <span class="text-xs text-gray-400">{{ auth.user.team }} #{{ auth.user.number || '00' }}</span>
      </div>
    </div>

    <div class="flex items-center space-x-4">
      <div class="flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700">
        <div class="w-2 h-2 rounded-full" :class="telemetry.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'"></div>
        <span class="text-xs font-medium text-gray-300">{{ telemetry.isConnected ? 'LIVE' : 'OFFLINE' }}</span>
      </div>
      <button @click="auth.logout(); $router.push('/login')" class="text-sm text-gray-400 hover:text-white transition">
        Logout
      </button>
    </div>
  </header>
</template>
