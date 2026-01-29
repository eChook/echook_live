<script setup>
import { RouterView } from 'vue-router'
import { watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useTelemetryStore } from './stores/telemetry'
import ToastNotification from './components/ui/ToastNotification.vue'

const auth = useAuthStore()
const telemetry = useTelemetryStore()

watch(() => auth.user, (newUser) => {
  if (!newUser) {
    telemetry.resetState()
  }
})
</script>

<template>
  <div class="min-h-screen bg-neutral-900 text-white font-sans antialiased">
    <RouterView />
    <ToastNotification />
  </div>
</template>
