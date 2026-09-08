<!--
  @file components/tabs/batteries/AddCarModal.vue
  @brief Cars & access modal — member list plus grant-another-car OTP flow.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { useBatteryStore } from '../../../stores/battery'
import { useAuthStore } from '../../../stores/auth'
import { useToast } from '../../../composables/useToast'

const props = defineProps({
    /** @brief Whether the modal is visible. */
    isOpen: { type: Boolean, required: true }
})

const emit = defineEmits(['close'])

const battery = useBatteryStore()
const auth = useAuthStore()
const { showToast } = useToast()

/** @brief 'list' | 'lookup' | 'confirm' */
const step = ref('list')
const carName = ref('')
const password = ref('')
const targetCarId = ref('')
const resolvedCarLabel = ref('')
const otpCode = ref('')
const loading = ref(false)

/**
 * @brief Reset wizard state when the modal opens or closes.
 */
function resetState() {
    step.value = 'list'
    carName.value = ''
    password.value = ''
    targetCarId.value = ''
    resolvedCarLabel.value = ''
    otpCode.value = ''
}

watch(() => props.isOpen, (open) => {
    if (open) {
        resetState()
        battery.fetchAuthorisedCars()
    }
})

/** @brief Authorised cars with pack-count subtitles for the member list. */
const memberRows = computed(() => {
    const cars = Array.isArray(battery.authorisedCars) ? battery.authorisedCars : []
    const currentId = auth.user?.id
    return cars.map((car) => {
        const packCount = Object.values(battery.storeWideFitment)
            .filter((fit) => fit.carId === car.id).length
        const isOwner = car.id === currentId
            || car.role === 'owner'
            || car.isOwner === true
        return {
            id: car.id,
            name: car.car || car.label || car.id,
            isOwner,
            subtitle: isOwner
                ? 'This car · store owner'
                : `${packCount} pack${packCount === 1 ? '' : 's'} currently fitted`
        }
    })
})

/**
 * @brief Close the modal.
 */
function close() {
    emit('close')
}

/**
 * @brief Look up target car id from credentials.
 */
async function lookupCar() {
    if (!carName.value.trim() || !password.value) return
    loading.value = true
    const result = await battery.resolveCarId(carName.value.trim(), password.value)
    loading.value = false

    if (result?.id) {
        targetCarId.value = result.id
        resolvedCarLabel.value = result.car || carName.value.trim()
        step.value = 'confirm'
        return
    }
    showToast(battery.error || 'Could not find car.', 'error')
}

/**
 * @brief Request OTP email for the granting car.
 */
async function sendOtp() {
    loading.value = true
    const success = await battery.requestGrantAccess(targetCarId.value)
    loading.value = false
    if (success) {
        showToast('Verification code sent to your email.', 'success')
        return
    }
    showToast(battery.error || 'Failed to send code.', 'error')
}

/**
 * @brief Confirm OTP and grant access.
 */
async function confirmGrant() {
    if (!otpCode.value.trim()) return
    loading.value = true
    const success = await battery.confirmGrantAccess(targetCarId.value, otpCode.value.trim())
    loading.value = false

    if (success) {
        showToast('Car added to battery store.', 'success')
        resetState()
        return
    }
    showToast(battery.error || 'Failed to grant access.', 'error')
}

const inputClass =
    'w-full box-border rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-[color:var(--app-bg)] px-3 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary'
</script>

<template>
    <TransitionRoot as="template" :show="isOpen" @after-leave="resetState">
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
                            class="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] shadow-xl">
                            <div class="border-b border-zinc-200 dark:border-[color:var(--app-border)] px-5 py-3.5">
                                <DialogTitle class="m-0 text-sm font-semibold text-zinc-900 dark:text-white">
                                    Cars &amp; access
                                </DialogTitle>
                                <p class="mt-1 text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                                    Who else can fit these packs
                                </p>
                            </div>

                            <div v-if="step === 'list'" class="flex flex-col gap-2.5 px-5 py-4">
                                <div v-for="row in memberRows" :key="row.id"
                                    class="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-50 dark:bg-[color:var(--app-inset)] px-3 py-2.5">
                                    <span class="min-w-0 flex-1">
                                        <span class="block text-sm font-semibold text-zinc-900 dark:text-white">{{ row.name }}</span>
                                        <span class="block text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">{{ row.subtitle }}</span>
                                    </span>
                                    <span v-if="row.isOwner"
                                        class="inline-flex shrink-0 items-center rounded-full border border-primary/50 bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-pink-700 dark:text-pink-300">
                                        Owner
                                    </span>
                                </div>
                                <p v-if="memberRows.length === 0" class="py-4 text-center text-sm italic text-zinc-500">
                                    No authorised cars loaded.
                                </p>
                                <button type="button"
                                    class="mt-1 h-10 self-start rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] px-3.5 text-[13px] font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)] hover:bg-zinc-50 dark:hover:bg-neutral-700"
                                    @click="step = 'lookup'">
                                    Grant another car
                                </button>
                                <p class="m-0 text-[11px] leading-relaxed text-zinc-500 dark:text-[color:var(--app-muted)]">
                                    Granting sends a 6-digit code to the other car's team — they confirm before anything is shared.
                                </p>
                            </div>

                            <div v-else-if="step === 'lookup'" class="flex flex-col gap-3 p-5">
                                <p class="m-0 text-sm text-zinc-600 dark:text-[color:var(--app-secondary)]">
                                    Enter the other car's login so we can send them a confirmation code.
                                </p>
                                <input v-model="carName" type="text" placeholder="Car name" :class="inputClass" />
                                <input v-model="password" type="password" placeholder="Password" :class="inputClass" />
                                <div class="flex flex-row-reverse gap-2 pt-1">
                                    <button type="button"
                                        class="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                        :disabled="loading || !carName.trim() || !password" @click="lookupCar">
                                        {{ loading ? 'Looking up…' : 'Find car' }}
                                    </button>
                                    <button type="button"
                                        class="h-10 rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] px-4 text-[13px] font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]"
                                        @click="step = 'list'">
                                        Back
                                    </button>
                                </div>
                            </div>

                            <div v-else class="flex flex-col gap-3 p-5">
                                <p class="m-0 text-sm text-zinc-600 dark:text-[color:var(--app-secondary)]">
                                    Grant access to <strong>{{ resolvedCarLabel }}</strong>.
                                    A 6-digit code is sent to your registered email.
                                </p>
                                <button type="button"
                                    class="h-10 self-start rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] px-4 text-[13px] font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)] hover:bg-zinc-50 dark:hover:bg-[color:var(--app-inset)] disabled:opacity-50"
                                    :disabled="loading" @click="sendOtp">
                                    {{ loading ? 'Sending…' : 'Send verification code' }}
                                </button>
                                <input v-model="otpCode" type="text" maxlength="6" placeholder="6-digit code"
                                    :class="[inputClass, 'text-center tracking-widest font-mono']" />
                                <div class="flex flex-row-reverse gap-2">
                                    <button type="button"
                                        class="h-10 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                        :disabled="loading || otpCode.trim().length < 6" @click="confirmGrant">
                                        {{ loading ? 'Confirming…' : 'Confirm & grant' }}
                                    </button>
                                    <button type="button"
                                        class="h-10 rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] px-4 text-[13px] font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]"
                                        @click="step = 'lookup'">
                                        Back
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
