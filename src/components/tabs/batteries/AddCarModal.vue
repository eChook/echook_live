<!--
  @file components/tabs/batteries/AddCarModal.vue
  @brief Two-step modal to grant another car access to the battery store via OTP.
-->
<script setup>
import { ref } from 'vue'
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { useBatteryStore } from '../../../stores/battery'
import { useToast } from '../../../composables/useToast'

defineProps({
    /** @brief Whether the modal is visible. */
    isOpen: { type: Boolean, required: true }
})

const emit = defineEmits(['close'])

const battery = useBatteryStore()
const { showToast } = useToast()

const step = ref(1)
const carName = ref('')
const password = ref('')
const targetCarId = ref('')
const resolvedCarLabel = ref('')
const otpCode = ref('')
const loading = ref(false)

/**
 * @brief Reset wizard state when modal opens.
 */
function resetState() {
    step.value = 1
    carName.value = ''
    password.value = ''
    targetCarId.value = ''
    resolvedCarLabel.value = ''
    otpCode.value = ''
}

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
        step.value = 2
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
        close()
        return
    }
    showToast(battery.error || 'Failed to grant access.', 'error')
}
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
                            class="w-full max-w-md rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 shadow-xl">
                            <DialogTitle class="text-lg font-bold text-zinc-900 dark:text-white mb-2">
                                Add Car to Battery Store
                            </DialogTitle>

                            <div v-if="step === 1" class="space-y-4">
                                <p class="text-sm text-zinc-600 dark:text-gray-400">
                                    Enter the target car's login credentials to look up its account ID.
                                </p>
                                <input v-model="carName" type="text" placeholder="Car name"
                                    class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                <input v-model="password" type="password" placeholder="Password"
                                    class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white" />
                                <button type="button"
                                    class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                    :disabled="loading || !carName.trim() || !password" @click="lookupCar">
                                    {{ loading ? 'Looking up…' : 'Find Car' }}
                                </button>
                            </div>

                            <div v-else class="space-y-4">
                                <p class="text-sm text-zinc-600 dark:text-gray-400">
                                    Grant access to <strong>{{ resolvedCarLabel }}</strong>.
                                    An OTP will be sent to your registered email address.
                                </p>
                                <button type="button"
                                    class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                                    :disabled="loading" @click="sendOtp">
                                    {{ loading ? 'Sending…' : 'Send Verification Code' }}
                                </button>
                                <input v-model="otpCode" type="text" maxlength="6" placeholder="6-digit code"
                                    class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white tracking-widest text-center" />
                                <button type="button"
                                    class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                    :disabled="loading || otpCode.trim().length < 6" @click="confirmGrant">
                                    {{ loading ? 'Confirming…' : 'Confirm & Grant Access' }}
                                </button>
                            </div>

                            <div class="mt-4 flex justify-end">
                                <button type="button"
                                    class="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-800"
                                    @click="close">Cancel</button>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
