<!--
  @file components/tabs/batteries/StatCalculationModal.vue
  @brief Schedules overnight server-side lifetime stats rebuild for active batteries.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'
import { formatRelativeTime } from '../../../utils/batteryFormatters'

defineProps({
    /** @brief Whether the modal is visible. */
    isOpen: { type: Boolean, required: true }
})

const emit = defineEmits(['close', 'completed'])

const battery = useBatteryStore()
const { showToast } = useToast()

/** @brief Wizard step: schedule | done */
const step = ref('schedule')
const submitting = ref(false)
const selectedIds = ref([])
const statusSummary = ref(null)

/** @brief Active batteries available to queue. */
const activeBatteries = computed(() => battery.batteries.filter((item) => item.status === 'active'))

/** @brief Whether every active battery is selected. */
const allSelected = computed(() =>
    activeBatteries.value.length > 0
    && activeBatteries.value.every((item) => selectedIds.value.includes(item.id))
)

/**
 * @brief Reset modal state when closed.
 */
function resetState() {
    step.value = 'schedule'
    submitting.value = false
    selectedIds.value = activeBatteries.value.map((item) => item.id)
}

/**
 * @brief Close the modal.
 */
function close() {
    emit('close')
}

/**
 * @brief Toggle one battery in the selection list.
 * @param {number} id
 */
function toggleBattery(id) {
    if (selectedIds.value.includes(id)) {
        selectedIds.value = selectedIds.value.filter((value) => value !== id)
    } else {
        selectedIds.value = [...selectedIds.value, id]
    }
}

/**
 * @brief Select or clear all active batteries.
 */
function toggleAll() {
    if (allSelected.value) {
        selectedIds.value = []
    } else {
        selectedIds.value = activeBatteries.value.map((item) => item.id)
    }
}

/**
 * @brief Refresh queue status from the server.
 */
async function refreshStatus() {
    statusSummary.value = await battery.fetchStatsBackfillStatus()
}

/**
 * @brief Queue selected batteries for overnight rebuild.
 */
async function scheduleBackfill() {
    if (selectedIds.value.length === 0) {
        showToast('Select at least one battery.', 'warning')
        return
    }

    submitting.value = true
    try {
        const result = await battery.requestStatsBackfill(selectedIds.value)
        if (!result) {
            showToast(battery.error || 'Failed to queue overnight recalculation.', 'error')
            return
        }
        statusSummary.value = {
            scheduledHour: result.scheduledHour ?? 3,
            batteries: result.batteries || []
        }
        step.value = 'done'
        showToast(
            result.queued > 0
                ? `Queued ${result.queued} batter${result.queued === 1 ? 'y' : 'ies'} for ~${result.scheduledHour ?? 3}:00.`
                : 'Selected batteries were already queued.',
            'success'
        )
        emit('completed')
        await battery.fetchBatteries()
    } finally {
        submitting.value = false
    }
}

watch(
    () => battery.batteries,
    () => {
        if (step.value === 'schedule' && selectedIds.value.length === 0) {
            selectedIds.value = activeBatteries.value.map((item) => item.id)
        }
    },
    { immediate: true }
)
</script>

<template>
    <TransitionRoot as="template" :show="isOpen" @after-leave="resetState" @after-enter="refreshStatus">
        <Dialog as="div" class="relative z-[100]" @close="close">
            <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0"
                enter-to="opacity-100" leave="ease-in duration-200" leave-from="opacity-100" leave-to="opacity-0">
                <div class="fixed inset-0 bg-black/80 backdrop-blur-sm" />
            </TransitionChild>

            <div class="fixed inset-0 z-10 overflow-y-auto p-4">
                <div class="flex min-h-full items-center justify-center">
                    <TransitionChild as="template" enter="ease-out duration-300"
                        enter-from="opacity-0 translate-y-4 sm:scale-95"
                        enter-to="opacity-100 translate-y-0 sm:scale-100" leave="ease-in duration-200"
                        leave-from="opacity-100 translate-y-0 sm:scale-100"
                        leave-to="opacity-0 translate-y-4 sm:scale-95">
                        <DialogPanel
                            class="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 shadow-xl">
                            <DialogTitle class="text-lg font-bold text-zinc-900 dark:text-white mb-2">
                                Schedule Overnight Statistics
                            </DialogTitle>

                            <div v-if="step === 'schedule'" class="space-y-4">
                                <p class="text-sm text-zinc-600 dark:text-gray-400">
                                    Fitted batteries update continuously on the server as telemetry arrives.
                                    Use this to queue a full historical rebuild, which runs around
                                    {{ statusSummary?.scheduledHour ?? 3 }}:00 so the live server stays free during events.
                                </p>
                                <div
                                    class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                                    Do not expect results until after the overnight run. Avoid queueing huge histories
                                    during a race weekend if the server is already busy.
                                </div>

                                <div class="flex items-center justify-between">
                                    <p class="text-sm font-medium text-zinc-800 dark:text-gray-200">Batteries</p>
                                    <button type="button" class="text-xs text-primary hover:underline"
                                        @click="toggleAll">
                                        {{ allSelected ? 'Clear all' : 'Select all active' }}
                                    </button>
                                </div>

                                <div
                                    class="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-neutral-700 divide-y divide-zinc-100 dark:divide-neutral-800">
                                    <label v-for="pack in activeBatteries" :key="pack.id"
                                        class="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800/60">
                                        <input type="checkbox" class="mt-1" :checked="selectedIds.includes(pack.id)"
                                            @change="toggleBattery(pack.id)" />
                                        <span class="flex-1 min-w-0">
                                            <span class="font-medium text-zinc-900 dark:text-white">{{ pack.label }}</span>
                                            <span class="block text-xs text-zinc-500">
                                                Stats
                                                {{ pack.statsUpdatedAt ? formatRelativeTime(pack.statsUpdatedAt) : 'never updated' }}
                                                · {{ pack.statsBackfillStatus || 'idle' }}
                                            </span>
                                        </span>
                                    </label>
                                    <p v-if="activeBatteries.length === 0"
                                        class="px-3 py-4 text-sm text-zinc-500 text-center">
                                        No active batteries to queue.
                                    </p>
                                </div>

                                <button type="button"
                                    class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                    :disabled="submitting || selectedIds.length === 0"
                                    @click="scheduleBackfill">
                                    {{ submitting ? 'Queueing…' : 'Queue overnight recalculation' }}
                                </button>
                            </div>

                            <div v-else class="space-y-4">
                                <p class="text-sm text-zinc-700 dark:text-gray-300">
                                    Overnight recalculation is queued. The server will rebuild lifetime statistics
                                    around {{ statusSummary?.scheduledHour ?? 3 }}:00 and update each battery when done.
                                </p>
                                <ul
                                    class="max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-800/50 p-3 text-xs space-y-1">
                                    <li v-for="item in (statusSummary?.batteries || []).filter((b) => b.statsBackfillStatus === 'queued' || b.statsBackfillStatus === 'running' || b.statsBackfillStatus === 'failed')"
                                        :key="item.id" class="text-zinc-600 dark:text-gray-400">
                                        {{ item.label }} — {{ item.statsBackfillStatus }}
                                        <span v-if="item.statsBackfillError"> ({{ item.statsBackfillError }})</span>
                                    </li>
                                </ul>
                                <button type="button"
                                    class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-zinc-800 dark:text-gray-200 hover:bg-zinc-50 dark:hover:bg-neutral-800"
                                    @click="close">
                                    Close
                                </button>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
