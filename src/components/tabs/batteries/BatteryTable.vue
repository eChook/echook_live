<!--
  @file components/tabs/batteries/BatteryTable.vue
  @brief Inventory panel with filters, where chips, and inline expanded details.
-->
<script setup>
import { computed, ref } from 'vue'
import { useBatteryStore } from '../../../stores/battery'
import { useAuthStore } from '../../../stores/auth'
import { useToast } from '../../../composables/useToast'
import {
    formatBatteryAge,
    formatRelativeTime,
    formatStatValue
} from '../../../utils/batteryFormatters'
import SegmentedControl from '../../ui/SegmentedControl.vue'
import StatusPanel from '../../ui/StatusPanel.vue'
import ConfirmationModal from '../../ui/ConfirmationModal.vue'
import BatteryDetailModal from './BatteryDetailModal.vue'

const battery = useBatteryStore()
const auth = useAuthStore()
const { showToast } = useToast()

const retireTarget = ref(null)
const editBatteryId = ref(null)

/** @brief Expose expand from parent */
defineExpose({
    expandBattery(id) {
        battery.expandedBatteryId = id
    }
})

/** @brief Filter counts for segmented control */
const filterCounts = computed(() => {
    const rows = battery.batteries
    const currentCarId = auth.user?.id
    let available = 0
    let fitted = 0
    let retired = 0
    for (const row of rows) {
        if (row.status === 'retired') retired += 1
        else if (battery.storeWideFitment[row.id]) fitted += 1
        else available += 1
    }
    return { all: rows.length, available, fitted, retired }
})

const filterOptions = computed(() => [
    { value: 'all', label: 'All', count: ` ${filterCounts.value.all}` },
    { value: 'available', label: 'Available', count: ` ${filterCounts.value.available}` },
    { value: 'fitted', label: 'Fitted', count: ` ${filterCounts.value.fitted}` },
    { value: 'retired', label: 'Retired', count: ` ${filterCounts.value.retired}` }
])

/** @brief Rows after filter, active first then retired */
const visibleRows = computed(() => {
    const currentCarId = auth.user?.id
    let rows = [...battery.batteries]
    if (battery.inventoryFilter === 'retired') {
        rows = rows.filter((row) => row.status === 'retired')
    } else if (battery.inventoryFilter === 'available') {
        rows = rows.filter((row) => row.status === 'active' && !battery.storeWideFitment[row.id])
    } else if (battery.inventoryFilter === 'fitted') {
        rows = rows.filter((row) => row.status === 'active' && battery.storeWideFitment[row.id])
    } else {
        const active = rows.filter((row) => row.status === 'active')
        const retired = rows.filter((row) => row.status === 'retired')
        rows = [...active, ...retired]
    }
    return rows.sort((a, b) => (b.actualCapacity || 0) - (a.actualCapacity || 0))
})

/**
 * @brief Capacity bar colour by measured vs nominal percentage.
 * @param {Object} row - Battery row
 * @returns {string} Tailwind bg class
 */
function capacityBarClass(row) {
    if (row.status === 'retired') return 'bg-zinc-400 dark:bg-neutral-500'
    const pct = row.originalCapacity > 0 ? (row.actualCapacity / row.originalCapacity) * 100 : 0
    if (pct >= 90) return 'bg-green-500'
    if (pct >= 75) return 'bg-amber-400'
    return 'bg-zinc-400'
}

/**
 * @brief Where chip classes by kind.
 * @param {string} kind - Chip kind from store helper
 * @returns {string}
 */
function whereChipClass(kind) {
    if (kind === 'available') return 'border-green-500/45 bg-green-500/10 text-green-700 dark:text-green-300'
    if (kind === 'this-car') return 'border-primary/50 bg-primary/15 text-pink-700 dark:text-pink-300'
    if (kind === 'retired') return 'border-neutral-600 bg-zinc-100 dark:bg-[color:var(--app-inset)] text-zinc-400'
    return 'border-neutral-600 bg-zinc-100 dark:bg-[color:var(--app-inset)] text-zinc-300'
}

/**
 * @brief Toggle inline row expansion.
 * @param {Object} row - Battery row
 */
function toggleExpand(row) {
    battery.expandedBatteryId = battery.expandedBatteryId === row.id ? null : row.id
}

/**
 * @brief Open the edit-pack modal for a row.
 * @param {Object} row - Battery row
 */
function startEdit(row) {
    editBatteryId.value = row.id
}

/**
 * @brief Queue stats rebuild for one pack.
 * @param {number} id - Battery id
 */
async function rebuildOne(id) {
    const result = await battery.requestStatsBackfill([id])
    if (result) showToast('Stats rebuild queued.', 'success')
    else showToast(battery.error || 'Failed to queue rebuild.', 'error')
}

/**
 * @brief Drag start for inventory → fitment drop.
 * @param {DragEvent} event - Drag event
 * @param {Object} row - Battery row
 */
function onDragStart(event, row) {
    if (row.status !== 'active' || battery.storeWideFitment[row.id]) return
    event.dataTransfer?.setData('application/x-echook-battery-id', String(row.id))
}

/** @brief Confirm retire */
async function confirmRetire() {
    if (!retireTarget.value) return
    const updated = await battery.updateBattery(retireTarget.value, { status: 'retired' })
    retireTarget.value = null
    if (updated) {
        showToast('Battery retired.', 'success')
        await battery.refreshStoreWideFitment(auth.user?.id)
        return
    }
    showToast(battery.error || 'Retire failed.', 'error')
}
</script>

<template>
    <StatusPanel title="Inventory">
        <template #header-extra>
            <SegmentedControl v-model="battery.inventoryFilter" :options="filterOptions" aria-label="Inventory filter" />
            <span class="ml-auto text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)] hidden sm:inline">Sorted by measured capacity</span>
        </template>

        <div class="overflow-x-auto -mx-5 px-5">
            <div class="min-w-[796px]">
                <!-- Column headers -->
                <div
                    class="grid gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[color:var(--app-muted)] border-b border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)]"
                    style="grid-template-columns: minmax(168px,1fr) 132px 84px 64px 96px 152px">
                    <span>Pack</span>
                    <span>Measured / nominal</span>
                    <span class="text-right">Cycles</span>
                    <span class="text-right">Crit.</span>
                    <span class="text-right">Ah out</span>
                    <span>Where</span>
                </div>

                <template v-for="(row, index) in visibleRows" :key="row.id">
                    <div v-if="row.status === 'retired' && (index === 0 || visibleRows[index - 1].status === 'active')"
                        class="px-5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:text-[color:var(--app-muted)] border-b border-zinc-200 dark:border-[color:var(--app-hairline)]">
                        Retired
                    </div>

                    <div class="border-b border-zinc-100 dark:border-[color:var(--app-hairline)]"
                        :class="[
                            row.status === 'retired' ? 'opacity-60' : '',
                            battery.storeWideFitment[row.id]?.carId === auth.user?.id ? 'bg-primary/[0.06]' : ''
                        ]">
                        <div class="grid gap-3 items-center px-5 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#2d2d2d] transition"
                            style="grid-template-columns: minmax(168px,1fr) 132px 84px 64px 96px 152px"
                            :draggable="row.status === 'active' && !battery.storeWideFitment[row.id]"
                            @click="toggleExpand(row)" @dragstart="onDragStart($event, row)">
                            <div>
                                <div class="text-sm font-semibold text-zinc-900 dark:text-white">{{ row.label }}</div>
                                <div class="font-mono text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                    {{ row.serial || '—' }} · {{ formatBatteryAge(row.manufactureDate, row.dateStamp) }}
                                </div>
                            </div>
                            <div>
                                <div class="font-mono text-sm font-bold text-zinc-900 dark:text-white">
                                    {{ row.actualCapacity }}
                                    <span class="text-[11px] font-normal text-zinc-500 dark:text-[color:var(--app-muted)]">
                                        / {{ row.originalCapacity }} ·
                                        {{ row.originalCapacity > 0 ? Math.round((row.actualCapacity / row.originalCapacity) * 100) : 0 }}%
                                    </span>
                                </div>
                                <div class="mt-1 h-[5px] rounded-sm border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-100 dark:bg-[color:var(--app-inset)] overflow-hidden">
                                    <div class="h-full rounded-sm transition-all" :class="capacityBarClass(row)"
                                        :style="{ width: `${Math.min(100, row.originalCapacity > 0 ? (row.actualCapacity / row.originalCapacity) * 100 : 0)}%` }" />
                                </div>
                            </div>
                            <div class="font-mono text-sm text-right text-zinc-900 dark:text-white">{{ row.numberOfDischarges ?? 0 }}</div>
                            <div class="font-mono text-sm text-right"
                                :class="(row.numberOfCriticalDischarges ?? 0) > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-zinc-900 dark:text-white'">
                                {{ row.numberOfCriticalDischarges ?? 0 }}
                            </div>
                            <div class="font-mono text-sm text-right text-zinc-900 dark:text-white">{{ formatStatValue(row.totalAhDelivered, 1) }}</div>
                            <div>
                                <span class="inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                                    :class="whereChipClass(battery.resolveWhereChip(row, auth.user?.id).kind)">
                                    {{ battery.resolveWhereChip(row, auth.user?.id).label }}
                                </span>
                            </div>
                        </div>

                        <!-- Expanded inline details -->
                        <div v-if="battery.expandedBatteryId === row.id"
                            class="px-5 py-4 bg-zinc-100 dark:bg-[#2d2d2d] border-t border-zinc-200 dark:border-[color:var(--app-hairline)]">
                            <div class="flex flex-wrap gap-3 mb-4">
                                <button type="button" class="text-xs font-semibold text-primary dark:text-[color:var(--app-link)] hover:underline"
                                    @click.stop="startEdit(row)">Edit details</button>
                                <button type="button" class="text-xs font-semibold text-primary dark:text-[color:var(--app-link)] hover:underline"
                                    @click.stop="rebuildOne(row.id)">Rebuild stats</button>
                                <button v-if="row.status === 'active'" type="button"
                                    class="text-xs font-semibold text-rose-600 hover:underline"
                                    @click.stop="retireTarget = row.id">Retire pack</button>
                            </div>
                            <p v-if="battery.storeWideFitment[row.id] && battery.storeWideFitment[row.id].carId !== auth.user?.id"
                                class="text-xs text-zinc-600 dark:text-[color:var(--app-secondary)] mb-3">
                                Fitted to {{ battery.storeWideFitment[row.id].carName }} — unfit it there before assigning here.
                            </p>
                            <p class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-[color:var(--app-muted)] mb-2">
                                Lifetime · server-computed, rebuilt overnight
                            </p>
                            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                                <div><span class="text-zinc-500">Discharges</span><p class="font-mono font-bold">{{ row.numberOfDischarges ?? 0 }}</p></div>
                                <div><span class="text-zinc-500">Charges</span><p class="font-mono font-bold">{{ row.numberOfCharges ?? 0 }}</p></div>
                                <div><span class="text-zinc-500">Critical discharges</span><p class="font-mono font-bold">{{ row.numberOfCriticalDischarges ?? 0 }}</p></div>
                                <div><span class="text-zinc-500">Ah delivered</span><p class="font-mono font-bold">{{ formatStatValue(row.totalAhDelivered, 2) }}</p></div>
                                <div><span class="text-zinc-500">kWh delivered</span><p class="font-mono font-bold">{{ formatStatValue(row.totalKwhDelivered, 3) }}</p></div>
                                <div><span class="text-zinc-500">Voltage seen</span><p class="font-mono font-bold">{{ formatStatValue(row.lifetimeMinVoltage, 1) }} – {{ formatStatValue(row.lifetimeMaxVoltage, 1) }}</p></div>
                                <div><span class="text-zinc-500">Avg discharge</span><p class="font-mono font-bold">{{ formatStatValue(row.averageDischargeCurrent, 1) }} A</p></div>
                                <div><span class="text-zinc-500">Distance</span><p class="font-mono font-bold">{{ formatStatValue(row.totalDistanceTravelled, 1) }} km</p></div>
                            </div>
                            <p class="text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)] mt-4 max-w-prose">
                                Measured capacity is the figure <strong>your team</strong> entered — eChook doesn't test packs.
                                Cycles and critical discharges are counted from telemetry while this pack was assigned.
                            </p>
                        </div>
                    </div>
                </template>

                <p v-if="visibleRows.length === 0" class="py-10 text-center text-sm text-zinc-500 italic">No packs match this filter.</p>
            </div>
        </div>

        <ConfirmationModal :is-open="!!retireTarget" title="Retire pack"
            message="Retired packs are hidden from fitment pickers. History is preserved."
            confirm-text="Retire" confirm-button-class="bg-amber-600 hover:bg-amber-700"
            @close="retireTarget = null" @confirm="confirmRetire" />

        <BatteryDetailModal :battery-id="editBatteryId" @close="editBatteryId = null"
            @updated="battery.fetchBatteries()" />
    </StatusPanel>
</template>
