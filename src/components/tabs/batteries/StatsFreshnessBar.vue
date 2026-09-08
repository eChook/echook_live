<!--
  @file components/tabs/batteries/StatsFreshnessBar.vue
  @brief Store-level stats rebuild freshness indicator.
-->
<script setup>
import { ref, onMounted } from 'vue'
import { ClockIcon } from '@heroicons/vue/24/outline'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'

const battery = useBatteryStore()
const { showToast } = useToast()
const rebuilding = ref(false)

/**
 * @brief Human-readable last rebuilt label from API status.
 * @returns {string}
 */
function lastRebuiltLabel() {
    const status = battery.statsBackfillStatus
    if (!status?.lastCompletedAt) return 'never'
    const date = new Date(status.lastCompletedAt)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
        return `today ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    }
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * @brief Queue a store-wide stats rebuild.
 */
async function rebuildStats() {
    rebuilding.value = true
    const result = await battery.requestStatsBackfill()
    rebuilding.value = false
    if (result) {
        showToast('Stats rebuild queued for overnight processing.', 'success')
        battery.statsBackfillStatus = await battery.fetchStatsBackfillStatus()
        return
    }
    showToast(battery.error || 'Failed to queue rebuild.', 'error')
}

onMounted(async () => {
    if (!battery.statsBackfillStatus) {
        battery.statsBackfillStatus = await battery.fetchStatsBackfillStatus()
    }
})
</script>

<template>
    <div
        class="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] px-3.5 py-2.5 text-sm">
        <ClockIcon class="h-4 w-4 shrink-0 text-zinc-500 dark:text-[color:var(--app-muted)]" aria-hidden="true" />
        <span class="text-zinc-700 dark:text-[color:var(--app-secondary)]">
            Lifetime figures last rebuilt <strong class="text-zinc-900 dark:text-white">{{ lastRebuiltLabel() }}</strong>
            <template v-if="battery.statsBackfillStatus?.queuedCount">
                · {{ battery.statsBackfillStatus.queuedCount }} pack{{ battery.statsBackfillStatus.queuedCount === 1 ? '' : 's' }} queued
            </template>
            <span class="text-zinc-500 dark:text-[color:var(--app-muted)]"> · next overnight run ~03:00</span>
        </span>
        <button type="button"
            class="ml-auto text-xs font-semibold text-primary dark:text-[color:var(--app-link)] hover:underline disabled:opacity-50"
            :disabled="rebuilding" @click="rebuildStats">
            {{ rebuilding ? 'Queuing…' : 'Rebuild stats' }}
        </button>
    </div>
</template>
