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
import { onMounted, watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useTelemetryStore } from './stores/telemetry'
import { useSettingsStore } from './stores/settings'
import ToastNotification from './components/ui/ToastNotification.vue'

const auth = useAuthStore()
const telemetry = useTelemetryStore()
const settings = useSettingsStore()

/**
 * @brief Restore per-account analytics settings after a page reload.
 * @description Auth is hydrated from localStorage but applyTrustedUser is not
 *              called again, so load the saved analytics for the active user.
 */
onMounted(() => {
  if (auth.isAuthenticated && auth.userId) {
    settings.loadAccountSettings(auth.userId)
  }
})

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
  <div
    class="min-h-screen font-sans antialiased bg-[color:var(--app-bg)] text-[color:var(--app-text)]">
    <RouterView />
    <ToastNotification />
  </div>
</template>
