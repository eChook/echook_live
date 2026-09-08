<!--
  @file components/tabs/batteries/AddBatteryModal.vue
  @brief Modal for creating a new battery — preset first, then identity and measured capacity.
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
const actualCapacity = ref('')
const peukertConstant = ref(DEFAULT_BATTERY_PACK_SETTINGS.peukertExponent)
const submitting = ref(false)

/** @brief Yuasa REC36-12I preset values aligned with analytics defaults. */
const YUASA_PRESET = Object.freeze({
    originalCapacity: DEFAULT_BATTERY_PACK_SETTINGS.packNominalCapacityAh,
    peukertConstant: DEFAULT_BATTERY_PACK_SETTINGS.peukertExponent
})

/** @brief Whether Yuasa defaults are locked (nominal + Peukert muted). */
const isYuasa = computed(() => batteryType.value === 'yuasa')

/**
 * @brief Apply Yuasa preset when type changes away from custom.
 */
watch(batteryType, (type) => {
    if (type === 'yuasa') {
        originalCapacity.value = YUASA_PRESET.originalCapacity
        peukertConstant.value = YUASA_PRESET.peukertConstant
    }
})

/** @brief Resolved measured Ah — empty measured matches nominal. */
const resolvedMeasuredAh = computed(() => {
    const measured = Number(actualCapacity.value)
    if (Number.isFinite(measured) && measured > 0) return measured
    const nominal = Number(originalCapacity.value)
    return Number.isFinite(nominal) && nominal > 0 ? nominal : null
})

/** @brief Whether the form has enough data to submit. */
const canSubmit = computed(() =>
    label.value.trim().length > 0
    && Number(originalCapacity.value) > 0
    && resolvedMeasuredAh.value > 0
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
    actualCapacity.value = ''
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
        actualCapacity: resolvedMeasuredAh.value,
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

/** @brief Emphasised field chrome. */
const inputClass =
    'w-full box-border rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-[color:var(--app-bg)] px-3 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary'

/** @brief Muted / prefilled field chrome for locked Yuasa values. */
const mutedInputClass =
    'w-full box-border rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)] px-3 py-2.5 text-sm font-mono text-zinc-500 dark:text-[color:var(--app-muted)] outline-none'
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
                            class="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] shadow-xl">
                            <div class="border-b border-zinc-200 dark:border-[color:var(--app-border)] px-5 py-3.5">
                                <DialogTitle class="m-0 text-sm font-semibold text-zinc-900 dark:text-white">
                                    Add a battery
                                </DialogTitle>
                                <p class="mt-1 text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                    Preset first, so most packs are three fields
                                </p>
                            </div>

                            <div class="flex flex-col gap-[18px] p-5">
                                <div>
                                    <span class="mb-2 block text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                        Pack type
                                    </span>
                                    <div class="flex flex-wrap gap-2">
                                        <button type="button"
                                            class="rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition"
                                            :class="isYuasa
                                                ? 'border-primary bg-primary/15 text-pink-700 dark:text-pink-300'
                                                : 'border-zinc-300 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)] text-zinc-700 dark:text-[color:var(--app-secondary)] hover:border-zinc-400'"
                                            @click="batteryType = 'yuasa'">
                                            Yuasa REC36-12I
                                        </button>
                                        <button type="button"
                                            class="rounded-lg border px-3.5 py-2 text-[13px] transition"
                                            :class="!isYuasa
                                                ? 'border-primary bg-primary/15 font-semibold text-pink-700 dark:text-pink-300'
                                                : 'border-zinc-300 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)] text-zinc-700 dark:text-[color:var(--app-secondary)] hover:border-zinc-400'"
                                            @click="batteryType = 'custom'">
                                            Custom
                                        </button>
                                    </div>
                                    <p class="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-[color:var(--app-muted)]">
                                        Sets {{ Number(YUASA_PRESET.originalCapacity).toFixed(1) }} Ah nominal and Peukert
                                        {{ YUASA_PRESET.peukertConstant }} — the same defaults Analytics uses.
                                    </p>
                                </div>

                                <div class="flex flex-wrap gap-3">
                                    <div class="min-w-0 flex-[1_1_160px]">
                                        <label class="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                            Name
                                        </label>
                                        <input v-model="label" type="text" maxlength="64" placeholder="e.g. Alpha"
                                            :class="inputClass" />
                                    </div>
                                    <div class="min-w-0 flex-[1_1_120px]">
                                        <label class="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                            Serial
                                            <span class="font-normal text-zinc-500 dark:text-[color:var(--app-muted)]">· 10 max</span>
                                        </label>
                                        <input v-model="serial" type="text" maxlength="10" placeholder="RR-A01"
                                            :class="[inputClass, 'font-mono']" />
                                    </div>
                                </div>

                                <div>
                                    <label class="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                        Manufactured
                                    </label>
                                    <BatteryManufactureDateFields v-model="dateStamp" :show-label="false" />
                                </div>

                                <div class="border-t border-zinc-200 dark:border-[color:var(--app-border)] pt-4">
                                    <div class="mb-2.5 flex items-baseline gap-2">
                                        <span class="text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                            Measured capacity
                                        </span>
                                        <span class="ml-auto text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                            optional now, editable later
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap gap-3">
                                        <div class="min-w-0 flex-[1_1_100px]">
                                            <label class="mb-1.5 block text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                                Nominal (Ah)
                                            </label>
                                            <input v-model.number="originalCapacity" type="number" min="0" step="0.1"
                                                :readonly="isYuasa"
                                                :class="isYuasa ? mutedInputClass : [inputClass, 'font-mono']" />
                                        </div>
                                        <div class="min-w-0 flex-[1_1_100px]">
                                            <label class="mb-1.5 block text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                                Measured (Ah)
                                            </label>
                                            <input v-model="actualCapacity" type="number" min="0" step="0.1"
                                                :placeholder="Number(originalCapacity).toFixed(1)"
                                                :class="[inputClass, 'font-mono']" />
                                        </div>
                                        <div class="min-w-0 flex-[1_1_100px]">
                                            <label class="mb-1.5 block text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                                Peukert
                                            </label>
                                            <input v-model.number="peukertConstant" type="number" min="0" step="0.01"
                                                :readonly="isYuasa"
                                                :class="isYuasa ? mutedInputClass : [inputClass, 'font-mono']" />
                                        </div>
                                    </div>
                                    <p class="mt-2.5 text-[11px] leading-relaxed text-zinc-500 dark:text-[color:var(--app-muted)]">
                                        If you've capacity-tested the pack, put your figure in
                                        <strong class="font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">Measured</strong>.
                                        Leave it and it matches nominal — eChook never estimates it for you.
                                    </p>
                                </div>

                                <div class="flex flex-row-reverse gap-2">
                                    <button type="button"
                                        class="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                        :disabled="!canSubmit || submitting" @click="submit">
                                        {{ submitting ? 'Adding…' : 'Add to store' }}
                                    </button>
                                    <button type="button"
                                        class="h-10 rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] px-4 text-[13px] font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)] hover:bg-zinc-50 dark:hover:bg-[color:var(--app-inset)]"
                                        @click="close">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
