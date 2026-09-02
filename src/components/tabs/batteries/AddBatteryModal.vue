<!--
  @file components/tabs/batteries/AddBatteryModal.vue
  @brief Modal for creating a new battery in the store inventory.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { DEFAULT_BATTERY_PACK_SETTINGS } from '../../../stores/settings'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'
import { defaultManufactureDateStamp } from '../../../utils/batteryFormatters'
import BatteryManufactureDateFields from './BatteryManufactureDateFields.vue'

const props = defineProps({
    /** @brief Whether the modal is visible. */
    isOpen: { type: Boolean, required: true }
})

const emit = defineEmits(['close', 'created'])

const battery = useBatteryStore()
const { showToast } = useToast()

/** @brief Battery type preset key. */
const batteryType = ref('yuasa')
const label = ref('')
const serial = ref('')
const dateStamp = ref('')
const originalCapacity = ref(DEFAULT_BATTERY_PACK_SETTINGS.packNominalCapacityAh)
const actualCapacity = ref(DEFAULT_BATTERY_PACK_SETTINGS.packActualCapacityAh)
const peukertConstant = ref(DEFAULT_BATTERY_PACK_SETTINGS.peukertExponent)
const submitting = ref(false)

/** @brief Yuasa REC36-12I preset values aligned with analytics defaults. */
const YUASA_PRESET = Object.freeze({
    originalCapacity: DEFAULT_BATTERY_PACK_SETTINGS.packNominalCapacityAh,
    actualCapacity: DEFAULT_BATTERY_PACK_SETTINGS.packActualCapacityAh,
    peukertConstant: DEFAULT_BATTERY_PACK_SETTINGS.peukertExponent
})

/**
 * @brief Apply Yuasa preset when type changes away from custom.
 */
watch(batteryType, (type) => {
    if (type === 'yuasa') {
        originalCapacity.value = YUASA_PRESET.originalCapacity
        actualCapacity.value = YUASA_PRESET.actualCapacity
        peukertConstant.value = YUASA_PRESET.peukertConstant
    }
})

/** @brief Whether the form has enough data to submit. */
const canSubmit = computed(() =>
    label.value.trim().length > 0
    && Number(originalCapacity.value) > 0
    && Number(actualCapacity.value) > 0
    && Number(peukertConstant.value) > 0
)

/**
 * @brief Reset form fields when the modal opens.
 */
function resetForm() {
    batteryType.value = 'yuasa'
    label.value = ''
    serial.value = ''
    dateStamp.value = defaultManufactureDateStamp()
    originalCapacity.value = YUASA_PRESET.originalCapacity
    actualCapacity.value = YUASA_PRESET.actualCapacity
    peukertConstant.value = YUASA_PRESET.peukertConstant
}

watch(() => props.isOpen, (open) => {
    if (open) resetForm()
})

/**
 * @brief Close the modal without saving.
 */
function close() {
    emit('close')
}

/**
 * @brief Submit the new battery to the store API.
 */
async function submit() {
    if (!canSubmit.value) return
    submitting.value = true

    const created = await battery.createBattery({
        label: label.value.trim(),
        serial: serial.value.trim(),
        dateStamp: dateStamp.value.trim(),
        originalCapacity: Number(originalCapacity.value),
        actualCapacity: Number(actualCapacity.value),
        peukertConstant: Number(peukertConstant.value)
    })

    submitting.value = false

    if (created) {
        showToast(`Battery "${created.label}" added.`, 'success')
        emit('created', created)
        close()
        return
    }

    showToast(battery.error || 'Failed to add battery.', 'error')
}
</script>

<template>
    <TransitionRoot as="template" :show="isOpen">
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
                            <DialogTitle class="text-lg font-bold text-zinc-900 dark:text-white mb-4">
                                Add Battery
                            </DialogTitle>

                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Battery Type</label>
                                    <select v-model="batteryType"
                                        class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                                        <option value="yuasa">Yuasa REC36-12I</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Name *</label>
                                    <input v-model="label" type="text" maxlength="64" placeholder="e.g. Pack A"
                                        class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                </div>

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Serial</label>
                                        <input v-model="serial" type="text" maxlength="10" placeholder="SN001"
                                            class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                    </div>
                                    <BatteryManufactureDateFields v-model="dateStamp" />
                                </div>

                                <div class="grid grid-cols-3 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Original (Ah)</label>
                                        <input v-model.number="originalCapacity" type="number" min="0" step="0.1"
                                            class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Actual (Ah)</label>
                                        <input v-model.number="actualCapacity" type="number" min="0" step="0.1"
                                            class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Peukert</label>
                                        <input v-model.number="peukertConstant" type="number" min="0" step="0.01"
                                            class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                    </div>
                                </div>
                            </div>

                            <div class="mt-6 flex justify-end gap-3">
                                <button type="button"
                                    class="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-800"
                                    @click="close">Cancel</button>
                                <button type="button"
                                    class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                    :disabled="!canSubmit || submitting" @click="submit">
                                    {{ submitting ? 'Adding…' : 'Add Battery' }}
                                </button>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
