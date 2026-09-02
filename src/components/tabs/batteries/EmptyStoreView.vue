<!--
  @file components/tabs/batteries/EmptyStoreView.vue
  @brief Empty state shown when the authenticated car has no battery store yet.
-->
<script setup>
import { ref } from 'vue'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'

const emit = defineEmits(['created'])

const battery = useBatteryStore()
const { showToast } = useToast()
const creating = ref(false)

/**
 * @brief Create a new battery store for the current car.
 */
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
    <div class="flex flex-1 items-center justify-center p-8">
        <div
            class="max-w-md w-full rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 text-center shadow-sm">
            <h2 class="text-xl font-bold text-zinc-900 dark:text-white mb-2">Battery Store</h2>
            <p class="text-sm text-zinc-600 dark:text-gray-400 mb-6">
                Create a team battery inventory to track battery usage and statistics. You can share this battery store between cars.
            </p>
            <button type="button"
                class="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                :disabled="creating" @click="handleCreateStore">
                {{ creating ? 'Creating…' : 'Create Battery Store' }}
            </button>
        </div>
    </div>
</template>
