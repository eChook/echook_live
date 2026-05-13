<!--
  @file components/tabs/ServerStatsTab.vue
  @brief Server statistics and monitoring dashboard.
  @description Displays real-time server health metrics including
               CPU usage, memory, bandwidth, and user activity.
               Uses TelemetryGraph for historical data visualization.
-->
<template>
    <div class="h-full flex flex-col space-y-6 bg-zinc-100 dark:bg-transparent">
        <!-- Header / Actions -->
        <div class="flex justify-between items-center px-8 pt-8">
            <h3 class="text-lg font-medium text-zinc-900 dark:text-white">Server Statistics</h3>
            <div class="text-sm text-zinc-600 dark:text-gray-400">
                Updating every 60s
                <button @click="refreshStats" class="ml-2 p-1 bg-zinc-200 dark:bg-neutral-800 rounded hover:bg-zinc-300 dark:hover:bg-neutral-700 transition"
                    title="Refresh Now">
                    <ArrowPathIcon class="w-4 h-4 text-zinc-600 dark:text-gray-400"
                        :class="{ 'animate-spin': adminStore.isStatsLoading }" />
                </button>
            </div>
        </div>

        <div v-if="!adminStore.serverStats" class="text-zinc-500 dark:text-gray-500 italic px-8">
            Loading stats...
        </div>

        <div v-else class="space-y-8 overflow-y-auto px-8 pb-10">
            <!-- Section 1: Server Health -->
            <div>
                <h4 class="text-sm font-bold text-zinc-600 dark:text-gray-400 uppercase tracking-wider mb-3">Server Health</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <!-- Uptime -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                        <div class="text-zinc-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">Uptime</div>
                        <div class="text-2xl font-mono text-zinc-900 dark:text-white mt-1">{{ formatUptime(adminStore.serverStats.uptime)
                        }}
                        </div>
                    </div>
                    <!-- CPU Load -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                        <div class="text-zinc-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">CPU Load</div>
                        <div class="text-2xl font-mono text-zinc-900 dark:text-white mt-1">{{ (adminStore.serverStats.current?.cpuLoad ||
                            0).toFixed(1) }}%</div>
                    </div>
                    <!-- Memory -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                        <div class="text-zinc-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">Memory Usage</div>
                        <div class="text-2xl font-mono text-zinc-900 dark:text-white mt-1">{{ (adminStore.serverStats.current?.memoryUsage
                            || 0).toFixed(0) }} MB</div>
                    </div>
                    <!-- Bandwidth -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                        <div class="text-zinc-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">Bandwidth (In/Out)</div>
                        <div class="text-2xl font-mono text-zinc-900 dark:text-white mt-1">
                            {{ formatBytes(adminStore.serverStats.current?.bandwidthIn) }} / {{
                                formatBytes(adminStore.serverStats.current?.bandwidthOut) }}
                        </div>
                    </div>
                </div>

                <!-- Server Health Graphs -->
                <div class="grid grid-cols-1 xl:grid-cols-4 gap-6 mt-4">
                    <!-- CPU Graph -->
                    <div class="bg-zinc-200/80 dark:bg-black/20 rounded-lg p-2 border border-zinc-300 dark:border-neutral-800">
                        <TelemetryGraph :data="historyData" dataKey="cpuLoad" :color="statColors.cpuLoad" group="stats"
                            :show-laps="false" />
                    </div>
                    <!-- Memory Graph -->
                    <div class="bg-zinc-200/80 dark:bg-black/20 rounded-lg p-2 border border-zinc-300 dark:border-neutral-800">
                        <TelemetryGraph :data="historyData" dataKey="memoryUsage" :color="statColors.memoryUsage" group="stats"
                            :show-laps="false" />
                    </div>
                    <!-- Bandwidth In -->
                    <div class="bg-zinc-200/80 dark:bg-black/20 rounded-lg p-2 border border-zinc-300 dark:border-neutral-800">
                        <TelemetryGraph :data="historyData" dataKey="bandwidthIn" :color="statColors.bandwidthIn" group="stats"
                            :show-laps="false" />
                    </div>
                    <!-- Bandwidth Out -->
                    <div class="bg-zinc-200/80 dark:bg-black/20 rounded-lg p-2 border border-zinc-300 dark:border-neutral-800">
                        <TelemetryGraph :data="historyData" dataKey="bandwidthOut" :color="statColors.bandwidthOut" group="stats"
                            :show-laps="false" />
                    </div>
                </div>
            </div>

            <!-- Section 2: User Activity -->
            <div>
                <h4 class="text-sm font-bold text-zinc-600 dark:text-gray-400 uppercase tracking-wider mb-3">User Activity</h4>

                <!-- Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <!-- Active Cars -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                        <div class="text-zinc-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">Active Cars</div>
                        <div class="text-2xl font-mono text-zinc-900 dark:text-white mt-1">{{ adminStore.serverStats.current?.activeCars ||
                            0 }}</div>
                    </div>
                    <!-- Public Spectators -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                        <div class="text-zinc-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">Public Spectators</div>
                        <div class="text-2xl font-mono text-zinc-900 dark:text-white mt-1">{{
                            adminStore.serverStats.current?.publicSpectators || 0 }}</div>
                    </div>
                    <!-- Private Spectators -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                        <div class="text-zinc-500 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">Private Spectators</div>
                        <div class="text-2xl font-mono text-zinc-900 dark:text-white mt-1">{{
                            adminStore.serverStats.current?.privateSpectators || 0 }}</div>
                    </div>
                </div>

                <!-- Graphs -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 mb-6">
                    <!-- Active Cars Graph -->
                    <div class="bg-zinc-200/80 dark:bg-black/20 rounded-lg p-2 border border-zinc-300 dark:border-neutral-800">
                        <TelemetryGraph :data="historyData" dataKey="activeCars" :color="statColors.activeCars" group="stats"
                            :show-laps="false" />
                    </div>
                    <!-- Public Spectators Graph -->
                    <div class="bg-zinc-200/80 dark:bg-black/20 rounded-lg p-2 border border-zinc-300 dark:border-neutral-800">
                        <TelemetryGraph :data="historyData" dataKey="publicSpectators" :color="statColors.spectators" group="stats"
                            :show-laps="false" />
                    </div>
                    <!-- Private Spectators Graph -->
                    <div class="bg-zinc-200/80 dark:bg-black/20 rounded-lg p-2 border border-zinc-300 dark:border-neutral-800">
                        <TelemetryGraph :data="historyData" dataKey="privateSpectators" :color="statColors.defaultAccent" group="stats"
                            :show-laps="false" />
                    </div>
                </div>

                <!-- Below: Table -->
                <div class="grid grid-cols-1 gap-6">
                    <!-- Spectator Distribution Table -->
                    <div class="bg-white dark:bg-neutral-800 rounded-lg border border-zinc-200 dark:border-neutral-700 overflow-hidden">
                        <div class="px-4 py-3 bg-zinc-100 dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-700">
                            <h4 class="text-sm font-bold text-zinc-800 dark:text-gray-300">Spectator Distribution</h4>
                        </div>
                        <div class="overflow-y-auto max-h-[300px]">
                            <table class="min-w-full divide-y divide-zinc-200 dark:divide-neutral-700">
                                <thead class="bg-zinc-50 dark:bg-neutral-800/50 sticky top-0">
                                    <tr>
                                        <th
                                            class="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-gray-400 uppercase tracking-wider">
                                            Car Name</th>
                                        <th
                                            class="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-gray-400 uppercase tracking-wider">
                                            Count</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-zinc-200 dark:divide-neutral-700 font-mono text-sm bg-white dark:bg-neutral-800">
                                    <tr v-for="(count, target) in spectatorDistribution" :key="target">
                                        <td class="px-6 py-2 text-zinc-700 dark:text-gray-300">{{ target }}</td>
                                        <td class="px-6 py-2 text-right text-zinc-900 dark:text-white">{{ count }}</td>
                                    </tr>
                                    <tr v-if="Object.keys(spectatorDistribution).length === 0">
                                        <td colspan="2" class="px-6 py-4 text-center text-zinc-500 dark:text-gray-500 italic">No active
                                            spectators</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * @description Server Stats Tab component.
 * 
 * Features:
 * - Real-time server health metrics (CPU, memory, bandwidth)
 * - User activity tracking (active cars, spectators)
 * - Historical graphs for all metrics using TelemetryGraph
 * - Auto-refresh every 60 seconds
 * - Spectator distribution table
 * 
 * Graphs are linked via ECharts 'stats' group for synchronized zoom.
 */
import { onMounted, onUnmounted, computed } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { useSettingsStore } from '../../stores/settings'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import TelemetryGraph from '../TelemetryGraph.vue'
import { connect } from 'echarts/core'
import { getServerStatsSeriesColors } from '../../constants/chartTheme'

const adminStore = useAdminStore()
const settings = useSettingsStore()

/** @brief Theme-aware series colors for admin health charts. */
const statColors = computed(() => getServerStatsSeriesColors(settings.resolvedTheme))
/** @brief Polling interval for auto-refresh */
let pollInterval = null

onMounted(() => {
    refreshStats()
    startPolling()
    // Link all graphs with group 'stats'
    connect('stats')
})

onUnmounted(() => {
    stopPolling()
})

const refreshStats = () => {
    adminStore.fetchServerStats(100) // limit 100
}

const startPolling = () => {
    stopPolling()
    pollInterval = setInterval(refreshStats, 60000) // 1 minute
}

const stopPolling = () => {
    if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
    }
}

// Helpers
const formatUptime = (seconds) => {
    if (!seconds) return '0s'
    const d = Math.floor(seconds / (3600 * 24))
    const h = Math.floor((seconds % (3600 * 24)) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    // const s = Math.floor(seconds % 60)

    let str = ''
    if (d > 0) str += `${d}d `
    if (h > 0) str += `${h}h `
    str += `${m}m`
    return str
}

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Computed
const spectatorDistribution = computed(() => {
    const raw = adminStore.serverStats?.current?.spectatorDistribution
    if (!raw) return {}
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
        console.error('Failed to parse spectator distribution', e)
        return {}
    }
})

const historyData = computed(() => {
    return adminStore.serverStatsHistory.map(item => ({
        ...item,
        timestamp: item.updated || item.timestamp || new Date().toISOString() // Fallback if missing
    }))
})

</script>
