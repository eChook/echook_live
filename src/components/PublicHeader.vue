<!--
  @file components/PublicHeader.vue
  @brief Public-facing header component for login/spectator pages.
  @description Displays the eChook branding and real-time server statistics
               (active cars, pit crews, spectators). Connects to the public
               WebSocket namespace for live stat updates.
-->
<script setup>
/**
 * @description Public header component with server statistics.
 * 
 * Features:
 * - eChook branding with link to login
 * - Real-time server stats: active cars, pit crews, spectators
 * - Auto-connects to public namespace on mount
 * - Responsive layout (icons on mobile, full text on desktop)
 */
import { onMounted } from 'vue'
import { useSpectatorStore } from '../stores/spectator'
import {
    UsersIcon,
    BoltIcon,
    EyeIcon
} from '@heroicons/vue/24/outline'

const spectatorStore = useSpectatorStore()

// Ensure connection to public socket for stats
onMounted(() => {
    spectatorStore.connectPublic()
})
</script>

<template>
    <header
        class="h-16 bg-neutral-900/90 backdrop-blur border-b border-neutral-800 flex items-center justify-between px-6 fixed top-0 w-full z-50">
        <!-- Brand / Left Side -->
        <div class="flex items-center space-x-4">
            <router-link to="/login"
                class="font-bold text-xl text-white tracking-tight hover:opacity-80 transition cursor-pointer">
                <span class="font-oswald tracking-normal text-2xl">eChook</span><span class="text-primary">Live</span>
            </router-link>
        </div>

        <!-- Right Side: Server Stats -->
        <div class="flex items-center space-x-3 md:space-x-6 text-xs md:text-sm text-gray-400">
            <!-- Active Cars -->
            <div class="flex items-center space-x-1 md:space-x-2" title="Active Cars">
                <BoltIcon class="w-4 h-4 md:w-5 md:h-5 text-primary" />
                <span>
                    <span class="hidden md:inline">Active Cars: </span>
                    <span class="text-white font-bold">{{ spectatorStore.serverStats.activeCars }}</span>
                </span>
            </div>
            <!-- Pit Crews (Private Spectators) -->
            <div class="flex items-center space-x-1 md:space-x-2" title="Pit Crews">
                <UsersIcon class="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
                <span>
                    <span class="hidden md:inline">Pit Crews: </span>
                    <span class="text-white font-bold">{{ spectatorStore.serverStats.privateSpectators }}</span>
                </span>
            </div>
            <!-- Public Spectators -->
            <div class="flex items-center space-x-1 md:space-x-2" title="Spectators">
                <EyeIcon class="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                <span>
                    <span class="hidden md:inline">Spectators: </span>
                    <span class="text-white font-bold">{{ spectatorStore.serverStats.publicSpectators }}</span>
                </span>
            </div>
        </div>
    </header>
</template>
