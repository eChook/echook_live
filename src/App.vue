<!--
  @file App.vue
  @brief Root application component.
  @description The main Vue application wrapper that provides the router outlet
               and global UI elements. Handles authentication state changes to
               reset telemetry on logout.
-->
<script setup>
/**
 * @description Root application component setup.
 * 
 * Features:
 * - Provides RouterView for page routing
 * - Includes global ToastNotification component
 * - Watches auth state to reset telemetry on logout
 */
import { RouterView } from 'vue-router'
import { watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useTelemetryStore } from './stores/telemetry'
import ToastNotification from './components/ui/ToastNotification.vue'

const auth = useAuthStore()
const telemetry = useTelemetryStore()

/**
 * @brief Watch for user logout and reset telemetry state.
 * @description Clears all telemetry data when user is logged out to prevent
 *              data leakage between sessions.
 */
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
