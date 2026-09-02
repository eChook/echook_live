<!--
  @file components/tabs/batteries/BatteryDetailModal.vue
  @brief Full battery details with optional edit and retire actions.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'
import { formatBatteryAge, formatDateStampLabel, formatRelativeTime, formatStatValue, resolveManufactureDateStamp } from '../../../utils/batteryFormatters'
import ConfirmationModal from '../../ui/ConfirmationModal.vue'
import BatteryManufactureDateFields from './BatteryManufactureDateFields.vue'

const props = defineProps({
    /** @brief Battery id to display, or null when closed. */
    batteryId: { type: Number, default: null }
})

const emit = defineEmits(['close', 'updated'])

const battery = useBatteryStore()
const { showToast } = useToast()

const detail = ref(null)
const loading = ref(false)
const editMode = ref(false)
const saving = ref(false)
/** @brief Pending status confirmation: retire or reactivate (un-retire). */
const statusConfirmAction = ref(null)

const editLabel = ref('')
const editSerial = ref('')
const editDateStamp = ref('')
const editOriginalCapacity = ref(0)
const editActualCapacity = ref(0)
const editPeukert = ref(0)

/** @brief Whether the modal should be visible. */
const isOpen = computed(() => props.batteryId !== null && props.batteryId !== undefined)

/** @brief Resolve car name for current assignment display. */
const assignedCarName = computed(() => {
    const assignment = detail.value?.currentAssignment
    if (!assignment?.carId) return null
    const match = battery.authorisedCars.find((car) => car.id === assignment.carId)
    return match?.car || assignment.carId
})

/** @brief Whether a status-change confirmation dialog is open. */
const showStatusConfirm = computed(() => statusConfirmAction.value !== null)

/** @brief Copy for the active status confirmation dialog. */
const statusConfirmCopy = computed(() => {
    if (statusConfirmAction.value === 'retire') {
        return {
            title: 'Retire Battery',
            message: 'Retired batteries are hidden from assignment pickers. History is preserved.',
            confirmText: 'Retire',
            confirmButtonClass: 'bg-amber-600 hover:bg-amber-700'
        }
    }
    if (statusConfirmAction.value === 'reactivate') {
        return {
            title: 'Un-retire Battery',
            message: 'Return this battery to the active inventory? It will appear in assignment pickers again.',
            confirmText: 'Un-retire',
            confirmButtonClass: 'bg-emerald-600 hover:bg-emerald-700'
        }
    }
    return {
        title: '',
        message: '',
        confirmText: 'Confirm',
        confirmButtonClass: 'bg-primary hover:bg-primary/90'
    }
})

/**
 * @brief Load full battery details when opened.
 */
async function loadDetail() {
    if (!props.batteryId) {
        detail.value = null
        return
    }
    loading.value = true
    detail.value = await battery.fetchBattery(props.batteryId)
    loading.value = false
    seedEditFields()
}

/**
 * @brief Copy detail fields into edit form state.
 */
function seedEditFields() {
    if (!detail.value) return
    editLabel.value = detail.value.label || ''
    editSerial.value = detail.value.serial || ''
    editDateStamp.value = resolveManufactureDateStamp(detail.value.dateStamp)
    editOriginalCapacity.value = detail.value.originalCapacity
    editActualCapacity.value = detail.value.actualCapacity
    editPeukert.value = detail.value.peukertConstant
}

watch(() => props.batteryId, () => {
    editMode.value = false
    statusConfirmAction.value = null
    loadDetail()
}, { immediate: true })

/**
 * @brief Handle parent dialog close; keep detail open while a confirm dialog is showing.
 */
function handleDialogClose() {
    if (showStatusConfirm.value) return
    close()
}

/**
 * @brief Enter edit mode or cancel and restore fields.
 */
function toggleEditMode() {
    if (editMode.value) {
        editMode.value = false
        seedEditFields()
        return
    }
    editMode.value = true
}

/**
 * @brief Close the modal.
 */
function close() {
    emit('close')
}

/**
 * @brief Save edited battery metadata.
 */
async function saveEdits() {
    if (!detail.value) return
    saving.value = true
    const updated = await battery.updateBattery(detail.value.id, {
        label: editLabel.value.trim(),
        serial: editSerial.value.trim(),
        dateStamp: editDateStamp.value.trim(),
        originalCapacity: Number(editOriginalCapacity.value),
        actualCapacity: Number(editActualCapacity.value),
        peukertConstant: Number(editPeukert.value)
    })
    saving.value = false

    if (updated) {
        if (!updated.dateStamp && editDateStamp.value.trim()) {
            updated.dateStamp = editDateStamp.value.trim()
        }
        detail.value = updated
        editMode.value = false
        showToast('Battery updated.', 'success')
        emit('updated')
        return
    }
    showToast(battery.error || 'Update failed.', 'error')
}

/**
 * @brief Apply retire or un-retire after confirmation.
 */
async function confirmStatusChange() {
    const id = props.batteryId ?? detail.value?.id
    const action = statusConfirmAction.value
    if (!id || !action) {
        statusConfirmAction.value = null
        return
    }

    const nextStatus = action === 'retire' ? 'retired' : 'active'
    saving.value = true
    try {
        const updated = await battery.updateBattery(id, { status: nextStatus })
        statusConfirmAction.value = null

        if (updated) {
            detail.value = updated
            showToast(action === 'retire' ? 'Battery retired.' : 'Battery returned to active inventory.', 'success')
            emit('updated')
            if (action === 'retire') {
                close()
            }
            return
        }
        showToast(battery.error || 'Status update failed.', 'error')
    } finally {
        saving.value = false
    }
}

/**
 * @brief Format discharge duration ms as h:m.
 * @param {number|null} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0m'
    const totalMinutes = Math.floor(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours === 0) return `${minutes}m`
    return `${hours}h ${minutes}m`
}
</script>

<template>
    <TransitionRoot as="template" :show="isOpen">
        <Dialog as="div" class="relative z-[100]" @close="handleDialogClose">
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
                            class="w-full max-w-2xl rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                            <div class="flex items-start justify-between gap-4 mb-4">
                                <DialogTitle class="text-lg font-bold text-zinc-900 dark:text-white">
                                    {{ detail?.label || 'Battery Details' }}
                                </DialogTitle>
                                <div v-if="detail && !loading" class="flex flex-wrap items-center gap-2 shrink-0">
                                    <button v-if="detail.status === 'active' && !editMode" type="button"
                                        class="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition disabled:opacity-50"
                                        :disabled="saving" @click="statusConfirmAction = 'retire'">
                                        Retire
                                    </button>
                                    <button v-if="detail.status === 'retired' && !editMode" type="button"
                                        class="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50"
                                        :disabled="saving" @click="statusConfirmAction = 'reactivate'">
                                        Un-retire
                                    </button>
                                    <button type="button"
                                        class="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                                        :class="editMode
                                            ? 'border border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                                            : 'border border-primary text-primary hover:bg-primary/10'"
                                        :disabled="saving" @click="toggleEditMode">
                                        {{ editMode ? 'Cancel' : 'Edit' }}
                                    </button>
                                </div>
                            </div>

                            <div v-if="loading" class="py-12 text-center text-zinc-500">Loading…</div>

                            <template v-else-if="detail">
                                <div v-if="!editMode" class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                    <div><span class="text-zinc-500">Serial</span><p class="font-medium">{{ detail.serial || '—' }}</p></div>
                                    <div><span class="text-zinc-500">Manufacture Date</span><p class="font-medium">{{ formatDateStampLabel(detail.dateStamp) }}</p></div>
                                    <div><span class="text-zinc-500">Age</span><p class="font-medium">{{ formatBatteryAge(detail.manufactureDate, detail.dateStamp) }}</p></div>
                                    <div><span class="text-zinc-500">Status</span><p class="font-medium capitalize">{{ detail.status }}</p></div>
                                    <div><span class="text-zinc-500">Original Capacity</span><p class="font-medium">{{ detail.originalCapacity }} Ah</p></div>
                                    <div><span class="text-zinc-500">Actual Capacity</span><p class="font-medium">{{ detail.actualCapacity }} Ah</p></div>
                                    <div><span class="text-zinc-500">Peukert Constant</span><p class="font-medium">{{ detail.peukertConstant }}</p></div>
                                    <div><span class="text-zinc-500">Stats Updated</span><p class="font-medium">{{ formatRelativeTime(detail.statsUpdatedAt) }}</p></div>
                                    <div><span class="text-zinc-500">Backfill</span><p class="font-medium capitalize">{{ detail.statsBackfillStatus || 'idle' }}</p></div>

                                    <div class="col-span-2 mt-2 pt-3 border-t border-zinc-200 dark:border-neutral-700">
                                        <h4 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Lifetime Statistics</h4>
                                    </div>
                                    <div><span class="text-zinc-500">Discharges</span><p class="font-medium">{{ detail.numberOfDischarges ?? 0 }}</p></div>
                                    <div><span class="text-zinc-500">Charges</span><p class="font-medium">{{ detail.numberOfCharges ?? 0 }}</p></div>
                                    <div><span class="text-zinc-500">Max Voltage</span><p class="font-medium">{{ formatStatValue(detail.lifetimeMaxVoltage, 2) }} V</p></div>
                                    <div><span class="text-zinc-500">Min Voltage</span><p class="font-medium">{{ formatStatValue(detail.lifetimeMinVoltage, 2) }} V</p></div>
                                    <div><span class="text-zinc-500">Total Ah Delivered</span><p class="font-medium">{{ formatStatValue(detail.totalAhDelivered, 2) }} Ah</p></div>
                                    <div><span class="text-zinc-500">Total kWh Delivered</span><p class="font-medium">{{ formatStatValue(detail.totalKwhDelivered, 3) }} kWh</p></div>
                                    <div><span class="text-zinc-500">Critical Discharges</span><p class="font-medium">{{ detail.numberOfCriticalDischarges ?? 0 }}</p></div>
                                    <div><span class="text-zinc-500">Discharge Time</span><p class="font-medium">{{ formatDuration(detail.totalDischargeTime) }}</p></div>
                                    <div><span class="text-zinc-500">Avg Discharge Current</span><p class="font-medium">{{ formatStatValue(detail.averageDischargeCurrent, 1) }} A</p></div>
                                    <div><span class="text-zinc-500">Distance Travelled</span><p class="font-medium">{{ formatStatValue(detail.totalDistanceTravelled, 1) }} km</p></div>

                                    <div v-if="detail.currentAssignment" class="col-span-2 mt-2 pt-3 border-t border-zinc-200 dark:border-neutral-700">
                                        <span class="text-zinc-500">Current Assignment</span>
                                        <p class="font-medium">
                                            {{ assignedCarName }} — {{ detail.currentAssignment.position }}
                                            (since {{ new Date(detail.currentAssignment.assignedAt).toLocaleString() }})
                                        </p>
                                    </div>
                                    <div v-else class="col-span-2 mt-2 pt-3 border-t border-zinc-200 dark:border-neutral-700">
                                        <span class="text-zinc-500">Current Assignment</span>
                                        <p class="font-medium">Not currently assigned</p>
                                    </div>
                                </div>

                                <div v-else class="space-y-4">
                                    <div>
                                        <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Name</label>
                                        <input v-model="editLabel" type="text" maxlength="64"
                                            class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                    </div>

                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Serial</label>
                                            <input v-model="editSerial" type="text" maxlength="10" placeholder="SN001"
                                                class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                        </div>
                                        <BatteryManufactureDateFields v-model="editDateStamp" />
                                    </div>

                                    <div class="grid grid-cols-3 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Original (Ah)</label>
                                            <input v-model.number="editOriginalCapacity" type="number" step="0.1" min="0"
                                                class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Actual (Ah)</label>
                                            <input v-model.number="editActualCapacity" type="number" step="0.1" min="0"
                                                class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Peukert</label>
                                            <input v-model.number="editPeukert" type="number" step="0.01" min="0"
                                                class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                        </div>
                                    </div>

                                    <button type="button"
                                        class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                        :disabled="saving" @click="saveEdits">
                                        {{ saving ? 'Saving…' : 'Save Changes' }}
                                    </button>
                                </div>
                            </template>

                            <div class="mt-6 flex justify-end">
                                <button type="button"
                                    class="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-800"
                                    @click="close">Close</button>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>

    <ConfirmationModal :is-open="showStatusConfirm" :title="statusConfirmCopy.title"
        :message="statusConfirmCopy.message" :confirm-text="statusConfirmCopy.confirmText"
        :confirm-button-class="statusConfirmCopy.confirmButtonClass" :disabled="saving"
        @close="statusConfirmAction = null" @confirm="confirmStatusChange" />
</template>
