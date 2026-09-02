<!--
  @file components/tabs/batteries/BatteryTable.vue
  @brief Inventory table listing all batteries in the store.
-->
<script setup>
import { computed, ref } from 'vue'
import { PlusIcon } from '@heroicons/vue/24/outline'
import { useBatteryStore } from '../../../stores/battery'
import { formatBatteryAge } from '../../../utils/batteryFormatters'
import AddBatteryModal from './AddBatteryModal.vue'
import BatteryDetailModal from './BatteryDetailModal.vue'

const battery = useBatteryStore()

const showAddModal = ref(false)
const selectedBatteryId = ref(null)

/** @brief Active batteries shown first, retired at the bottom. */
const sortedBatteries = computed(() => {
    const active = battery.batteries.filter((item) => item.status === 'active')
    const retired = battery.batteries.filter((item) => item.status === 'retired')
    return [...active, ...retired]
})

/**
 * @brief Open the detail modal for a battery row.
 * @param {Object} row - Battery list item
 */
function openDetail(row) {
    selectedBatteryId.value = row.id
}

/**
 * @brief Close the detail modal.
 */
function closeDetail() {
    selectedBatteryId.value = null
}

/**
 * @brief Refresh battery list after modal mutations.
 */
async function refreshList() {
    await battery.fetchBatteries()
}
</script>

<template>
    <section class="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-neutral-700">
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wide">Inventory</h3>
            <button type="button"
                class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition"
                @click="showAddModal = true">
                <PlusIcon class="h-4 w-4" />
                Add Battery
            </button>
        </div>

        <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
                <thead class="bg-zinc-50 dark:bg-neutral-800/60 text-zinc-600 dark:text-gray-400">
                    <tr>
                        <th class="px-4 py-2 text-left font-medium">Name</th>
                        <th class="px-4 py-2 text-left font-medium">Serial</th>
                        <th class="px-4 py-2 text-left font-medium">Age</th>
                        <th class="px-4 py-2 text-left font-medium">Actual Capacity</th>
                        <th class="px-4 py-2 text-left font-medium">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="sortedBatteries.length === 0">
                        <td colspan="5" class="px-4 py-8 text-center text-zinc-500 dark:text-gray-500 italic">
                            No batteries yet. Add your first pack to get started.
                        </td>
                    </tr>
                    <template v-for="(row, index) in sortedBatteries" :key="row.id">
                        <!-- Section divider inserted before the first retired row -->
                        <tr v-if="row.status === 'retired' && (index === 0 || sortedBatteries[index - 1].status === 'active')">
                            <td colspan="5"
                                class="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-gray-500 bg-zinc-50 dark:bg-neutral-800/40 border-t-2 border-zinc-200 dark:border-neutral-700">
                                Retired
                            </td>
                        </tr>
                        <tr class="border-t border-zinc-100 dark:border-neutral-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-neutral-800/40 transition"
                            :class="row.status === 'retired' ? 'opacity-50' : ''" @click="openDetail(row)">
                            <td class="px-4 py-3 font-medium text-zinc-900 dark:text-white">{{ row.label }}</td>
                            <td class="px-4 py-3 text-zinc-700 dark:text-gray-300">{{ row.serial || '—' }}</td>
                            <td class="px-4 py-3 text-zinc-700 dark:text-gray-300">
                                {{ formatBatteryAge(row.manufactureDate, row.dateStamp) }}
                            </td>
                            <td class="px-4 py-3 text-zinc-700 dark:text-gray-300">{{ row.actualCapacity }} Ah</td>
                            <td class="px-4 py-3">
                                <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                                    :class="row.status === 'active'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                        : 'bg-zinc-200 text-zinc-700 dark:bg-neutral-700 dark:text-gray-300'">
                                    {{ row.status }}
                                </span>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
        </div>

        <AddBatteryModal :is-open="showAddModal" @close="showAddModal = false" @created="refreshList" />
        <BatteryDetailModal :battery-id="selectedBatteryId" @close="closeDetail" @updated="refreshList" />
    </section>
</template>
