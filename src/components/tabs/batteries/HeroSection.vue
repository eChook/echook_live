<!--
  @file components/tabs/batteries/HeroSection.vue
  @brief Fitment panel with physical upper/lower slots for the current car.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { useBatteryStore } from '../../../stores/battery'
import { useAuthStore } from '../../../stores/auth'
import { useTelemetryStore } from '../../../stores/telemetry'
import { useToast } from '../../../composables/useToast'
import {
    combineDateTimeInput,
    formatBatteryAge,
    formatRelativeTime,
    msToDateInput,
    msToTimeInput
} from '../../../utils/batteryFormatters'
import ConfirmationModal from '../../ui/ConfirmationModal.vue'
import StatusPanel from '../../ui/StatusPanel.vue'
import FitBatteryPicker from './FitBatteryPicker.vue'

const emit = defineEmits(['expand-battery'])

const battery = useBatteryStore()
const auth = useAuthStore()
const telemetry = useTelemetryStore()
const { showToast } = useToast()

/** @brief Whether assignment uses historic date/time instead of Now */
const showHistoricAssignedAt = ref(false)
const assignedAtDate = ref(msToDateInput())
const assignedAtTime = ref(msToTimeInput())
const unassignTarget = ref(null)
const showFitPicker = ref(false)
const fitPickerPosition = ref('lower')

/** @brief Slot order: upper above lower per design */
const slotOrder = Object.freeze(['upper', 'lower'])

/** @brief Lookup map from battery id to full battery record */
const batteryById = computed(() => {
    const map = new Map()
    for (const item of battery.batteries) map.set(item.id, item)
    return map
})

const maxAssignedDate = computed(() => msToDateInput(Date.now()))
const maxAssignedTime = computed(() => {
    if (assignedAtDate.value !== maxAssignedDate.value) return undefined
    return msToTimeInput(Date.now())
})
const assignedAtMs = computed(() => combineDateTimeInput(assignedAtDate.value, assignedAtTime.value))

watch(assignedAtDate, (date) => {
    if (date !== maxAssignedDate.value) return
    const parsed = assignedAtMs.value
    if (parsed !== null && parsed > Date.now()) {
        assignedAtTime.value = msToTimeInput(Date.now())
    }
})

/** @brief Live pack voltage from telemetry */
const packVoltage = computed(() => {
    const value = telemetry.liveData?.voltage ?? telemetry.displayLiveData?.voltage
    return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—'
})

/**
 * @brief Resolve enriched battery record for a fitment summary.
 * @param {Object|null} summary - Fitment summary from API
 * @returns {Object|null}
 */
function resolveBattery(summary) {
    if (!summary?.id) return null
    return batteryById.value.get(summary.id) || summary
}

/**
 * @brief Open fit picker for an empty slot.
 * @param {'upper'|'lower'} position - Slot position
 */
function openFitPicker(position) {
    fitPickerPosition.value = position
    showFitPicker.value = true
}

/**
 * @brief Handle drag-drop fit from inventory.
 * @param {'upper'|'lower'} position - Target slot
 * @param {number} batteryId - Dropped battery id
 */
async function fitDroppedBattery(position, batteryId) {
    if (!auth.user?.id || battery.storeWideFitment[batteryId]) {
        showToast('That pack is already fitted elsewhere.', 'error')
        return
    }
    const payload = {
        carId: auth.user.id,
        [position]: { batteryId, assignedAt: Date.now() }
    }
    const success = await battery.assignBatteries(payload)
    if (success) showToast('Battery fitted.', 'success')
    else showToast(battery.error || 'Fit failed.', 'error')
}

/**
 * @brief Allow drop on empty slot.
 * @param {DragEvent} event - Drag event
 */
function onDragOver(event) {
    event.preventDefault()
}

/**
 * @brief Handle inventory row drop.
 * @param {DragEvent} event - Drop event
 * @param {'upper'|'lower'} position - Slot position
 */
function onDrop(event, position) {
    event.preventDefault()
    const raw = event.dataTransfer?.getData('application/x-echook-battery-id')
    const batteryId = Number(raw)
    if (Number.isFinite(batteryId)) fitDroppedBattery(position, batteryId)
}

/**
 * @brief Request unassign confirmation.
 * @param {'upper'|'lower'} position - Slot to clear
 * @param {string} batteryName - Pack name for aria label
 */
function requestUnassign(position, batteryName) {
    unassignTarget.value = { position, batteryName }
}

/** @brief Confirm unassign */
async function confirmUnassign() {
    if (!unassignTarget.value || !auth.user?.id) return
    const success = await battery.unassignBattery({
        carId: auth.user.id,
        position: unassignTarget.value.position
    })
    unassignTarget.value = null
    if (success) showToast('Battery removed from slot.', 'success')
    else showToast(battery.error || 'Unassign failed.', 'error')
}

/**
 * @brief Expand inventory row for fitted pack details.
 * @param {number} batteryId - Battery id
 */
function openDetails(batteryId) {
    emit('expand-battery', batteryId)
}
</script>

<template>
    <StatusPanel :title="'Fitted to this car'" :note="auth.user?.car || 'This car'">
        <div class="space-y-3">
            <div v-for="position in slotOrder" :key="position" class="flex gap-3 items-stretch">
                <!-- Position rail -->
                <div
                    class="w-11 shrink-0 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)]">
                    <span
                        class="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[color:var(--app-muted)] [writing-mode:vertical-rl] rotate-180">
                        {{ position }}
                    </span>
                </div>

                <!-- Filled slot -->
                <div v-if="resolveBattery(battery.currentFitment?.[position])"
                    class="relative flex-1 rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)] p-3.5">
                    <button type="button"
                        class="absolute top-3 right-3 h-8 w-8 inline-flex items-center justify-center rounded-md border border-zinc-200 dark:border-[color:var(--app-border)] text-zinc-500 hover:bg-rose-500/20 hover:text-rose-500 hover:border-rose-500/50 transition"
                        :title="`Remove ${resolveBattery(battery.currentFitment[position]).label} from the ${position} position`"
                        :aria-label="`Remove ${resolveBattery(battery.currentFitment[position]).label} from the ${position} position`"
                        @click="requestUnassign(position, resolveBattery(battery.currentFitment[position]).label)">
                        <XMarkIcon class="h-4 w-4" />
                    </button>
                    <div class="font-bold text-[15px] text-zinc-900 dark:text-white pr-10">
                        {{ resolveBattery(battery.currentFitment[position]).label }}
                    </div>
                    <div class="font-mono text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)] mt-0.5">
                        {{ resolveBattery(battery.currentFitment[position]).serial || '—' }}
                        · {{ formatBatteryAge(resolveBattery(battery.currentFitment[position]).manufactureDate, resolveBattery(battery.currentFitment[position]).dateStamp) }}
                    </div>
                    <div class="flex flex-wrap gap-4 mt-3">
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-[color:var(--app-muted)]">Measured cap.</div>
                            <div class="font-mono text-lg font-bold text-zinc-900 dark:text-white">{{ resolveBattery(battery.currentFitment[position]).actualCapacity }} Ah</div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-[color:var(--app-muted)]">Cycles</div>
                            <div class="font-mono text-lg font-bold text-zinc-900 dark:text-white">{{ resolveBattery(battery.currentFitment[position]).numberOfDischarges ?? 0 }}</div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-[color:var(--app-muted)]">Critical</div>
                            <div class="font-mono text-lg font-bold text-zinc-900 dark:text-white">{{ resolveBattery(battery.currentFitment[position]).numberOfCriticalDischarges ?? 0 }}</div>
                        </div>
                    </div>
                    <div class="flex items-center justify-between mt-3 pt-3 border-t border-zinc-200 dark:border-[color:var(--app-hairline)] text-xs">
                        <span class="inline-flex items-center gap-2 text-zinc-600 dark:text-[color:var(--app-secondary)]">
                            <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                            Fitted since <strong>{{ formatRelativeTime(battery.currentFitment[position]?.assignedAt) }}</strong>
                        </span>
                        <button type="button" class="text-primary dark:text-[color:var(--app-link)] hover:underline font-medium"
                            @click="openDetails(resolveBattery(battery.currentFitment[position]).id)">
                            Details
                        </button>
                    </div>
                </div>

                <!-- Empty slot -->
                <div v-else
                    class="flex-1 rounded-lg border border-dashed border-zinc-400 dark:border-neutral-600 bg-zinc-50/50 dark:bg-[#1c1c1c] px-3.5 py-5 text-center"
                    @dragover="onDragOver" @drop="onDrop($event, position)">
                    <p class="text-sm text-zinc-600 dark:text-[color:var(--app-secondary)] capitalize mb-3">{{ position }} position is empty</p>
                    <button type="button"
                        class="inline-flex h-10 items-center justify-center rounded-lg border border-primary bg-white dark:bg-[color:var(--app-surface)] px-4 text-sm font-semibold text-pink-700 dark:text-pink-300 hover:bg-primary/5 transition"
                        @click="openFitPicker(position)">
                        Fit a battery
                    </button>
                    <p class="text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)] mt-2">or drag one across from the inventory</p>
                </div>
            </div>

            <!-- Fitted at row -->
            <div class="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)] px-3 py-2.5">
                <span class="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-[color:var(--app-muted)]">Fitted at</span>
                <span v-if="!showHistoricAssignedAt"
                    class="inline-flex rounded-full border border-primary/50 bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-pink-700 dark:text-pink-300">Now</span>
                <button v-if="!showHistoricAssignedAt" type="button"
                    class="text-[11px] text-primary dark:text-[color:var(--app-link)] hover:underline"
                    @click="showHistoricAssignedAt = true">
                    Fitted earlier…
                </button>
                <div v-else class="flex flex-wrap items-center gap-2">
                    <input v-model="assignedAtDate" type="date" :max="maxAssignedDate"
                        class="rounded border border-zinc-300 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] px-2 py-1 text-xs" />
                    <input v-model="assignedAtTime" type="time" :max="maxAssignedTime"
                        class="rounded border border-zinc-300 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] px-2 py-1 text-xs" />
                    <button type="button" class="text-[11px] text-primary dark:text-[color:var(--app-link)] hover:underline"
                        @click="showHistoricAssignedAt = false">Use Now</button>
                </div>
                <span class="ml-auto text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">Can't be in the future</span>
            </div>

            <!-- Live pack voltage -->
            <div class="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-[color:var(--app-hairline)]">
                <span class="text-xs text-zinc-500 dark:text-[color:var(--app-muted)]">Live pack voltage</span>
                <span class="font-mono text-base font-bold text-zinc-900 dark:text-white">{{ packVoltage }} V</span>
            </div>
        </div>

        <FitBatteryPicker :is-open="showFitPicker" :position="fitPickerPosition" @close="showFitPicker = false"
            @fitted="battery.refreshStoreWideFitment(auth.user?.id)" />

        <ConfirmationModal :is-open="!!unassignTarget" title="Remove battery"
            :message="unassignTarget ? `Remove ${unassignTarget.batteryName} from the ${unassignTarget.position} position?` : ''"
            confirm-text="Remove" @close="unassignTarget = null" @confirm="confirmUnassign" />
    </StatusPanel>
</template>
