<template>
    <TransitionRoot appear :show="isOpen" as="template">
        <Dialog as="div" @close="handleClose" class="relative z-50">
            <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0" enter-to="opacity-100"
                leave="duration-200 ease-in" leave-from="opacity-100" leave-to="opacity-0">
                <div class="fixed inset-0 bg-black/75 backdrop-blur-sm" />
            </TransitionChild>

            <div class="fixed inset-0 overflow-y-auto">
                <div class="flex min-h-full items-center justify-center p-4 text-center">
                    <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0 scale-95"
                        enter-to="opacity-100 scale-100" leave="duration-200 ease-in" leave-from="opacity-100 scale-100"
                        leave-to="opacity-0 scale-95">
                        <DialogPanel
                            class="w-full max-w-md transform overflow-hidden rounded-2xl bg-neutral-800 border border-neutral-700 p-6 text-left align-middle shadow-xl transition-all">

                            <DialogTitle as="h3" class="text-xl font-bold leading-6 text-white mb-4">
                                {{ title }}
                            </DialogTitle>

                            <div class="mt-2 text-sm text-gray-300">
                                <p>{{ message }}</p>
                            </div>

                            <div class="mt-6">
                                <!-- Do Not Show Again Checkbox -->
                                <div class="flex items-center mb-4">
                                    <input id="doNotShow" v-model="doNotShow" type="checkbox"
                                        class="w-4 h-4 text-primary bg-neutral-900 border-neutral-600 rounded focus:ring-primary focus:ring-2">
                                    <label for="doNotShow" class="ml-2 text-sm text-gray-400">Do not show this
                                        again</label>
                                </div>

                                <div class="flex justify-end">
                                    <button type="button"
                                        class="inline-flex justify-center rounded-md border border-transparent bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                        @click="confirm">
                                        Accept
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

<script setup>
import { ref, watch } from 'vue'
import {
    TransitionRoot,
    TransitionChild,
    Dialog,
    DialogPanel,
    DialogTitle,
} from '@headlessui/vue'

const props = defineProps({
    isOpen: Boolean,
    title: {
        type: String,
        default: 'Notice'
    },
    message: {
        type: String,
        required: true
    }
})

const emit = defineEmits(['close', 'confirm'])

const doNotShow = ref(false)

// Reset state when opened? standard practice not to, but kept simple here.

function handleClose() {
    // If forced to accept, maybe don't allow close by clicking outside? 
    // User asked for "Accept" button. Disallowing implicit close is safer for disclaimers.
    // But standard modal behavior usually allows background click. Let's allow it but treat as non-confirm?
    // User request: "Accept button". Usually implies it blocks until accepted? 
    // Let's assume backdrop click does NOT close or acts as accept? 
    // Safer: backdrop does nothing or closes without saving preference? 
    // Let's allow generic close.
    // emit('close')
}

function confirm() {
    emit('confirm', doNotShow.value)
}
</script>
