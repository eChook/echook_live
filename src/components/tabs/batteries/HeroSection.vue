<!--
  @file components/tabs/batteries/HeroSection.vue
  @brief Live-mode hero showing fitment assignment controls or fitted battery cards.
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
    formatRelativeTime,
    msToDateInput,
    msToTimeInput
} from '../../../utils/batteryFormatters'
import ConfirmationModal from '../../ui/ConfirmationModal.vue'

const battery = useBatteryStore()
const auth = useAuthStore()
const telemetry = useTelemetryStore()
const { showToast } = useToast()

const upperBatteryId = ref('')
const lowerBatteryId = ref('')
/** @brief Assignment date portion (YYYY-MM-DD) for native date picker. */
const assignedAtDate = ref(msToDateInput())
/** @brief Assignment time portion (HH:mm) for native time picker. */
const assignedAtTime = ref(msToTimeInput())
const assigning = ref(false)
const unassignTarget = ref(null)

/**
 * @brief Reset assignment date/time pickers to the current local moment.
 */
function resetAssignedAt() {
    assignedAtDate.value = msToDateInput(Date.now())
    assignedAtTime.value = msToTimeInput(Date.now())
}

/** @brief Lookup map from battery id to full battery record. */
const batteryById = computed(() => {
    const map = new Map()
    for (const item of battery.batteries) map.set(item.id, item)
    return map
})

/** @brief Whether neither position has a fitted battery. */
const isUnassigned = computed(() => {
    const fitment = battery.currentFitment
    if (!fitment) return true
    return !fitment.upper && !fitment.lower
})

/** @brief Latest selectable assignment date (today, local). Future days are disabled in the date picker. */
const maxAssignedDate = computed(() => msToDateInput(Date.now()))

/**
 * @brief Latest selectable time when the chosen date is today.
 * @description Omitted for past dates so any time on that day is allowed.
 */
const maxAssignedTime = computed(() => {
    if (assignedAtDate.value !== maxAssignedDate.value) return undefined
    return msToTimeInput(Date.now())
})

/** @brief Combined assignment timestamp from the date and time pickers. */
const assignedAtMs = computed(() => combineDateTimeInput(assignedAtDate.value, assignedAtTime.value))

/** @brief Whether the chosen assignment time is in the past or present. */
const assignedAtIsHistoric = computed(() => {
    const parsed = assignedAtMs.value
    if (parsed === null) return false
    return parsed <= Date.now()
})

// If today is selected, clamp a future time back to now when the date changes.
watch(assignedAtDate, (date) => {
    if (date !== maxAssignedDate.value) return
    const parsed = assignedAtMs.value
    if (parsed !== null && parsed > Date.now()) {
        assignedAtTime.value = msToTimeInput(Date.now())
    }
})

/** @brief Whether assign action is allowed. */
const canAssign = computed(() => {
    const hasUpper = upperBatteryId.value !== ''
    const hasLower = lowerBatteryId.value !== ''
    if (!hasUpper && !hasLower) return false
    if (hasUpper && hasLower && upperBatteryId.value === lowerBatteryId.value) return false
    if (!assignedAtIsHistoric.value) return false
    return true
})

/** @brief Live pack voltage from telemetry ribbon data. */
const packVoltage = computed(() => {
    const value = telemetry.liveData?.voltage ?? telemetry.displayLiveData?.voltage
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—'
})

/**
 * @brief Resolve enriched battery card data for a fitment summary.
 * @param {Object|null} summary - Fitment summary from API
 * @returns {Object|null} Merged battery record
 */
function resolveBatteryCard(summary) {
    if (!summary?.id) return null
    return batteryById.value.get(summary.id) || summary
}

/**
 * @brief Assign selected batteries to the current car.
 */
async function assignBatteries() {
    if (!canAssign.value || !auth.user?.id) return
    assigning.value = true

    const assignedAt = assignedAtMs.value
    if (assignedAt === null || assignedAt > Date.now()) {
        showToast('Assignment time must be in the past or present.', 'error')
        assigning.value = false
        return
    }

    const payload = { carId: auth.user.id }

    if (upperBatteryId.value) {
        payload.upper = { batteryId: Number(upperBatteryId.value), assignedAt }
    }
    if (lowerBatteryId.value) {
        payload.lower = { batteryId: Number(lowerBatteryId.value), assignedAt }
    }

    const success = await battery.assignBatteries(payload)
    assigning.value = false

    if (success) {
        showToast('Batteries assigned.', 'success')
        upperBatteryId.value = ''
        lowerBatteryId.value = ''
        resetAssignedAt()
        return
    }
    showToast(battery.error || 'Assignment failed.', 'error')
}

/**
 * @brief Request unassign confirmation for a position.
 * @param {'upper'|'lower'} position - Car position to clear
 */
function requestUnassign(position) {
    unassignTarget.value = position
}

/**
 * @brief Confirm unassign for the selected position.
 */
async function confirmUnassign() {
    if (!unassignTarget.value || !auth.user?.id) return
    const success = await battery.unassignBattery({
        carId: auth.user.id,
        position: unassignTarget.value
    })
    unassignTarget.value = null

    if (success) {
        showToast('Battery unassigned.', 'success')
        return
    }
    showToast(battery.error || 'Unassign failed.', 'error')
}
</script>

<template>
    <section class="rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 md:p-6">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-gray-400 mb-4">Live Fitment</h3>

        <!-- Unassigned: picker controls (lower, upper, assigned at inline) -->
        <div v-if="isUnassigned" class="space-y-4">
            <p class="text-sm text-zinc-600 dark:text-gray-400">No batteries are currently assigned to this car.</p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Lower Battery</label>
                    <select v-model="lowerBatteryId"
                        class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                        <option value="">— None —</option>
                        <option v-for="item in battery.activeBatteries" :key="`lower-${item.id}`" :value="String(item.id)">
                            {{ item.label }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Upper Battery</label>
                    <select v-model="upperBatteryId"
                        class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                        <option value="">— None —</option>
                        <option v-for="item in battery.activeBatteries" :key="`upper-${item.id}`" :value="String(item.id)">
                            {{ item.label }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Assigned At</label>
                    <div class="flex gap-2">
                        <input v-model="assignedAtDate" type="date" :max="maxAssignedDate"
                            class="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                        <input v-model="assignedAtTime" type="time" :max="maxAssignedTime"
                            class="w-[7.25rem] shrink-0 rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                    </div>
                </div>
            </div>
            <p v-if="assignedAtDate && assignedAtTime && !assignedAtIsHistoric"
                class="text-xs text-amber-700 dark:text-amber-300">
                Assignment time must not be in the future.
            </p>
            <button type="button"
                class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                :disabled="!canAssign || assigning" @click="assignBatteries">
                {{ assigning ? 'Assigning…' : 'Assign Batteries' }}
            </button>
        </div>

        <!-- Assigned: side-by-side battery cards (lower, then upper) -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-for="position in ['lower', 'upper']" :key="position"
                class="relative rounded-lg border border-zinc-200 dark:border-neutral-700 p-4 bg-zinc-50 dark:bg-neutral-800/40">
                <button v-if="battery.currentFitment?.[position]" type="button"
                    class="absolute top-3 right-3 text-zinc-400 hover:text-red-500 transition"
                    :title="`Unassign ${position}`" @click="requestUnassign(position)">
                    <XMarkIcon class="h-5 w-5" />
                </button>

                <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">{{ position }} Battery</p>

                <template v-if="resolveBatteryCard(battery.currentFitment?.[position])">
                    <h4 class="text-lg font-bold text-zinc-900 dark:text-white mb-1">
                        {{ resolveBatteryCard(battery.currentFitment[position]).label }}
                    </h4>
                    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-3">
                        <div>
                            <dt class="text-zinc-500">Serial</dt>
                            <dd class="font-medium">{{ resolveBatteryCard(battery.currentFitment[position]).serial || '—' }}</dd>
                        </div>
                        <div>
                            <dt class="text-zinc-500">Actual Capacity</dt>
                            <dd class="font-medium">{{ resolveBatteryCard(battery.currentFitment[position]).actualCapacity }} Ah</dd>
                        </div>
                        <div>
                            <dt class="text-zinc-500">Peukert</dt>
                            <dd class="font-medium">{{ resolveBatteryCard(battery.currentFitment[position]).peukertConstant }}</dd>
                        </div>
                        <div>
                            <dt class="text-zinc-500">Discharges / Charges</dt>
                            <dd class="font-medium">
                                {{ resolveBatteryCard(battery.currentFitment[position]).numberOfDischarges ?? 0 }}
                                /
                                {{ resolveBatteryCard(battery.currentFitment[position]).numberOfCharges ?? 0 }}
                            </dd>
                        </div>
                        <div class="col-span-2">
                            <dt class="text-zinc-500">Stats Updated</dt>
                            <dd class="font-medium">{{ formatRelativeTime(resolveBatteryCard(battery.currentFitment[position]).statsUpdatedAt) }}</dd>
                        </div>
                        <!-- Show pack voltage in upper card, or lower card when upper is not fitted -->
                        <div v-if="position === 'upper' || !battery.currentFitment?.upper" class="col-span-2">
                            <dt class="text-zinc-500">Pack Voltage (live)</dt>
                            <dd class="font-medium">{{ packVoltage }} V</dd>
                        </div>
                    </dl>
                </template>
                <p v-else class="text-sm text-zinc-500 italic">No battery assigned</p>
            </div>
        </div>

        <ConfirmationModal :is-open="!!unassignTarget" title="Unassign Battery"
            :message="`Remove the ${unassignTarget} battery from this car?`"
            confirm-text="Unassign" @close="unassignTarget = null" @confirm="confirmUnassign" />
    </section>
</template>
