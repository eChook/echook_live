/**
 * @file main.js
 * @brief Vue application entry point.
 * @description Initializes and mounts the Vue 3 application with Pinia state
 *              management (including persistence plugin) and Vue Router.
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import App from './App.vue'
import router from './router'
import { setupThemeApplication } from './composables/useTheme'

// Create Vue application instance
const app = createApp(App)

// Configure Pinia with persistence plugin for local storage state
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// Register plugins and mount
app.use(pinia)
// Apply persisted / system theme to <html> before first paint of routed views
setupThemeApplication()
app.use(router)
app.mount('#app')
