<script setup>
import { RouterView } from 'vue-router'
import { watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useTelemetryStore } from './stores/telemetry'

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
  </div>
</template>
