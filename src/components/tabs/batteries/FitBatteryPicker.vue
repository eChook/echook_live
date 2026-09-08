<!--
  @file components/tabs/batteries/FitBatteryPicker.vue
  @brief Modal picker for fitting an available pack to a position.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { useBatteryStore } from '../../../stores/battery'
import { useAuthStore } from '../../../stores/auth'
import { useToast } from '../../../composables/useToast'

const props = defineProps({
    /** @brief Whether the picker is open */
    isOpen: { type: Boolean, required: true },
    /** @brief Target position: upper or lower */
    position: { type: String, default: 'lower' }
})

const emit = defineEmits(['close', 'fitted'])

const battery = useBatteryStore()
const auth = useAuthStore()
const { showToast } = useToast()

const selectedId = ref(null)
const fitting = ref(false)

watch(() => props.isOpen, (open) => {
    if (open) selectedId.value = null
})

/** @brief Offerable packs for this picker */
const offerable = computed(() => battery.batteriesAvailableForFit)

/**
 * @brief Percent of nominal capacity for a pack.
 * @param {Object} row - Battery row
 * @returns {number}
 */
function percentOfNominal(row) {
    if (!row?.originalCapacity) return 0
    return Math.round((row.actualCapacity / row.originalCapacity) * 100)
}

/** @brief Note explaining packs omitted because they are already fitted. */
const omittedNote = computed(() => {
    const offerableIds = new Set(offerable.value.map((row) => row.id))
    const omitted = battery.activeBatteries.filter((row) =>
        battery.storeWideFitment[row.id] && !offerableIds.has(row.id)
    )
    if (omitted.length === 0) return ''

    const thisCarParts = []
    const otherByCar = {}
    for (const row of omitted) {
        const fit = battery.storeWideFitment[row.id]
        if (fit?.carId === auth.user?.id) {
            thisCarParts.push(`${row.label} is in this car's ${fit.position} position`)
        } else {
            const carName = fit?.carName || 'another car'
            if (!otherByCar[carName]) otherByCar[carName] = []
            otherByCar[carName].push(row.label)
        }
    }

    const otherParts = Object.entries(otherByCar).map(([carName, labels]) => {
        const joined = labels.length === 1
            ? labels[0]
            : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
        return `${joined} ${labels.length === 1 ? 'is' : 'are'} on ${carName}`
    })

    const parts = [...thisCarParts, ...otherParts]
    const pronoun = omitted.length === 1 ? "it isn't" : "they aren't"
    return `${parts.join(' and ')}, so ${pronoun} offered — no more accidental double fitment.`
})

/** @brief Selected battery record */
const selectedBattery = computed(() =>
    offerable.value.find((row) => row.id === selectedId.value) || null
)

/**
 * @brief Close without saving.
 */
function close() {
    selectedId.value = null
    emit('close')
}

/**
 * @brief Fit the selected pack to the target position.
 */
async function confirmFit() {
    if (!selectedId.value || !auth.user?.id || !props.position) return
    fitting.value = true
    const payload = {
        carId: auth.user.id,
        [props.position]: { batteryId: selectedId.value, assignedAt: Date.now() }
    }
    const success = await battery.assignBatteries(payload)
    fitting.value = false
    if (success) {
        showToast(`${selectedBattery.value?.label || 'Battery'} fitted to ${props.position}.`, 'success')
        selectedId.value = null
        emit('fitted')
        emit('close')
        return
    }
    showToast(battery.error || 'Fit failed.', 'error')
}
</script>

<template>
    <TransitionRoot as="template" :show="isOpen">
        <Dialog as="div" class="relative z-[100]" @close="close">
            <TransitionChild as="template" enter="ease-out duration-200" enter-from="opacity-0" enter-to="opacity-100"
                leave="ease-in duration-150" leave-from="opacity-100" leave-to="opacity-0">
                <div class="fixed inset-0 bg-black/80 backdrop-blur-sm" />
            </TransitionChild>
            <div class="fixed inset-0 z-10 flex items-end sm:items-center justify-center p-4">
                <TransitionChild as="template" enter="ease-out duration-200"
                    enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                    enter-to="opacity-100 translate-y-0 sm:scale-100" leave="ease-in duration-150"
                    leave-from="opacity-100" leave-to="opacity-0 translate-y-4">
                    <DialogPanel
                        class="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] shadow-xl">
                        <div class="border-b border-zinc-200 dark:border-[color:var(--app-border)] px-5 py-3.5">
                            <DialogTitle class="m-0 text-sm font-semibold capitalize text-zinc-900 dark:text-white">
                                Fit a battery · {{ position }} position
                            </DialogTitle>
                            <p class="mt-1 text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                Only packs that are actually free, with the numbers you choose on
                            </p>
                        </div>
                        <div class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-3">
                            <button v-for="row in offerable" :key="row.id" type="button"
                                class="flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition"
                                :class="selectedId === row.id
                                    ? 'border-primary bg-primary/[0.08]'
                                    : 'border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)] hover:border-zinc-400'"
                                @click="selectedId = row.id">
                                <span class="min-w-0 flex-1">
                                    <span class="block text-sm font-semibold text-zinc-900 dark:text-white">{{ row.label }}</span>
                                    <span class="mt-0.5 block font-mono text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                        {{ row.serial || '—' }} · {{ row.numberOfDischarges ?? 0 }} cycles ·
                                        {{ row.numberOfCriticalDischarges ?? 0 }} critical
                                    </span>
                                </span>
                                <span class="shrink-0 text-right">
                                    <span class="block font-mono text-base font-bold text-zinc-900 dark:text-white">
                                        {{ Number(row.actualCapacity).toFixed(1) }} Ah
                                    </span>
                                    <span class="block text-[11px]"
                                        :class="percentOfNominal(row) >= 90 ? 'text-emerald-600 dark:text-emerald-300' : 'text-zinc-500 dark:text-[color:var(--app-muted)]'">
                                        {{ percentOfNominal(row) }}% of nominal
                                    </span>
                                </span>
                            </button>
                            <p v-if="offerable.length === 0" class="py-6 text-center text-sm italic text-zinc-500">
                                No packs available to fit.
                            </p>
                            <div v-if="omittedNote"
                                class="flex items-start gap-2.5 rounded-md border border-dashed border-zinc-300 dark:border-neutral-600 bg-zinc-50 dark:bg-[color:var(--app-inset)] px-3 py-2.5">
                                <span class="text-xs leading-relaxed text-zinc-500 dark:text-[color:var(--app-muted)]">
                                    {{ omittedNote }}
                                </span>
                            </div>
                        </div>
                        <div class="flex flex-row-reverse gap-2 px-5 py-4">
                            <button type="button"
                                class="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                :disabled="!selectedId || fitting" @click="confirmFit">
                                {{ fitting ? 'Fitting…' : `Fit ${selectedBattery?.label || 'pack'} to ${position}` }}
                            </button>
                            <button type="button"
                                class="h-10 rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] px-4 text-[13px] font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)] hover:bg-zinc-50 dark:hover:bg-[color:var(--app-inset)]"
                                @click="close">
                                Cancel
                            </button>
                        </div>
                    </DialogPanel>
                </TransitionChild>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
