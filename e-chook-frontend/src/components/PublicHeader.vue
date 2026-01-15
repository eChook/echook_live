<script setup>
import { onMounted } from 'vue'
import { useSpectatorStore } from '../stores/spectator'
import {
    UsersIcon,
    BoltIcon,
    EyeIcon
} from '@heroicons/vue/24/outline'

const spectatorStore = useSpectatorStore()

// Ensure we are connected to public socket to get stats
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
                <span class="font-oswald tracking-normal text-2xl">eChook</span><span
                    class="text-primary">Telemetry</span>
            </router-link>
        </div>

        <!-- Right Side Stats -->
        <div class="flex items-center space-x-6 text-sm text-gray-400">
            <div class="flex items-center space-x-2">
                <BoltIcon class="w-5 h-5 text-primary" />
                <span>Active Cars: <span class="text-white font-bold">{{ spectatorStore.serverStats.activeCars
                }}</span></span>
            </div>
            <div class="flex items-center space-x-2">
                <UsersIcon class="w-5 h-5 text-blue-400" />
                <span>Pit Crews: <span class="text-white font-bold">{{ spectatorStore.serverStats.privateSpectators
                }}</span></span>
            </div>
            <div class="flex items-center space-x-2">
                <EyeIcon class="w-5 h-5 text-green-400" />
                <span>Spectators: <span class="text-white font-bold">{{ spectatorStore.serverStats.publicSpectators
                }}</span></span>
            </div>
        </div>
    </header>
</template>
