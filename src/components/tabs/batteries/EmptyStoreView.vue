<!--
  @file components/tabs/batteries/EmptyStoreView.vue
  @brief Empty state when the authenticated car has no battery store yet.
-->
<script setup>
import { ref } from 'vue'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'
import CarBatteryIcon from '../../icons/CarBatteryIcon.vue'

const emit = defineEmits(['created'])

const battery = useBatteryStore()
const { showToast } = useToast()
const creating = ref(false)

/** @brief Create a new battery store for the current car */
async function handleCreateStore() {
    creating.value = true
    const success = await battery.createStore()
    creating.value = false
    if (success) {
        showToast('Battery store created.', 'success')
        await battery.fetchBatteries()
        emit('created')
        return
    }
    showToast(battery.error || 'Failed to create battery store.', 'error')
}
</script>

<template>
    <div class="flex flex-1 items-center justify-center p-8 min-h-[50vh]">
        <div class="max-w-md w-full text-center space-y-5">
            <div
                class="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)]">
                <CarBatteryIcon class="h-6 w-6 text-primary" />
            </div>
            <p class="text-sm text-zinc-600 dark:text-[color:var(--app-secondary)] leading-relaxed">
                Track pack fitment, measured capacity, and lifetime stats from telemetry you've already sent.
            </p>
            <button type="button"
                class="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition"
                :disabled="creating" @click="handleCreateStore">
                {{ creating ? 'Creating…' : 'Create battery store' }}
            </button>
            <p class="text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                Stats are computed on the server from telemetry you've already sent. Nothing new is collected.
            </p>
        </div>
    </div>
</template>
