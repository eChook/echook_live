<!--
  @file components/tabs/batteries/BatteryDetailModal.vue
  @brief Edit-pack modal — identity and measured capacity, matching Add a battery.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'
import { resolveManufactureDateStamp } from '../../../utils/batteryFormatters'
import BatteryManufactureDateFields from './BatteryManufactureDateFields.vue'

const props = defineProps({
    /** @brief Battery id to edit, or null when closed. */
    batteryId: { type: Number, default: null }
})

const emit = defineEmits(['close', 'updated'])

const battery = useBatteryStore()
const { showToast } = useToast()

const detail = ref(null)
const loading = ref(false)
const saving = ref(false)

const editLabel = ref('')
const editSerial = ref('')
const editDateStamp = ref('')
const editOriginalCapacity = ref(0)
const editActualCapacity = ref(0)
const editPeukert = ref(0)

/** @brief Whether the modal should be visible. */
const isOpen = computed(() => props.batteryId !== null && props.batteryId !== undefined)

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
    loadDetail()
}, { immediate: true })

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
        showToast('Battery updated.', 'success')
        emit('updated')
        close()
        return
    }
    showToast(battery.error || 'Update failed.', 'error')
}

const inputClass =
    'w-full box-border rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-[color:var(--app-bg)] px-3 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary'
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
                                    Edit {{ detail?.label || 'battery' }}
                                </DialogTitle>
                                <p class="mt-1 text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                    Name, serial, manufacture date, and the capacity figures your team entered
                                </p>
                            </div>

                            <div v-if="loading" class="px-5 py-12 text-center text-sm text-zinc-500">Loading…</div>

                            <div v-else-if="detail" class="flex flex-col gap-[18px] p-5">
                                <div class="flex flex-wrap gap-3">
                                    <div class="min-w-0 flex-[1_1_160px]">
                                        <label class="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                            Name
                                        </label>
                                        <input v-model="editLabel" type="text" maxlength="64" :class="inputClass" />
                                    </div>
                                    <div class="min-w-0 flex-[1_1_120px]">
                                        <label class="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                            Serial
                                            <span class="font-normal text-zinc-500 dark:text-[color:var(--app-muted)]">· 10 max</span>
                                        </label>
                                        <input v-model="editSerial" type="text" maxlength="10"
                                            :class="[inputClass, 'font-mono']" />
                                    </div>
                                </div>

                                <div>
                                    <label class="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                        Manufactured
                                    </label>
                                    <BatteryManufactureDateFields v-model="editDateStamp" :show-label="false" />
                                </div>

                                <div class="border-t border-zinc-200 dark:border-[color:var(--app-border)] pt-4">
                                    <div class="mb-2.5 flex items-baseline gap-2">
                                        <span class="text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
                                            Measured capacity
                                        </span>
                                    </div>
                                    <div class="flex flex-wrap gap-3">
                                        <div class="min-w-0 flex-[1_1_100px]">
                                            <label class="mb-1.5 block text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                                Nominal (Ah)
                                            </label>
                                            <input v-model.number="editOriginalCapacity" type="number" step="0.1" min="0"
                                                :class="[inputClass, 'font-mono']" />
                                        </div>
                                        <div class="min-w-0 flex-[1_1_100px]">
                                            <label class="mb-1.5 block text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                                Measured (Ah)
                                            </label>
                                            <input v-model.number="editActualCapacity" type="number" step="0.1" min="0"
                                                :class="[inputClass, 'font-mono']" />
                                        </div>
                                        <div class="min-w-0 flex-[1_1_100px]">
                                            <label class="mb-1.5 block text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                                Peukert
                                            </label>
                                            <input v-model.number="editPeukert" type="number" step="0.01" min="0"
                                                :class="[inputClass, 'font-mono']" />
                                        </div>
                                    </div>
                                    <p class="mt-2.5 text-[11px] leading-relaxed text-zinc-500 dark:text-[color:var(--app-muted)]">
                                        Measured is the figure <strong class="font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">your team</strong>
                                        entered — eChook doesn't test packs.
                                    </p>
                                </div>

                                <div class="flex flex-row-reverse gap-2">
                                    <button type="button"
                                        class="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                        :disabled="saving" @click="saveEdits">
                                        {{ saving ? 'Saving…' : 'Save changes' }}
                                    </button>
                                    <button type="button"
                                        class="h-10 rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] px-4 text-[13px] font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]"
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
