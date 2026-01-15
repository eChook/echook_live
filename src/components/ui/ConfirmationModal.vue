<script setup>
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
    isOpen: {
        type: Boolean,
        required: true
    },
    title: {
        type: String,
        default: 'Confirm Action'
    },
    message: {
        type: String,
        default: 'Are you sure you want to proceed?'
    },
    confirmText: {
        type: String,
        default: 'Confirm'
    },
    cancelText: {
        type: String,
        default: 'Cancel'
    },
    confirmButtonClass: {
        type: String,
        default: 'bg-primary hover:bg-primary/90'
    }
})

const emit = defineEmits(['close', 'confirm'])

function close() {
    emit('close')
}

function confirm() {
    emit('confirm')
}
</script>

<template>
    <TransitionRoot as="template" :show="isOpen">
        <Dialog as="div" class="relative z-[100]" @close="close">
            <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0" enter-to="opacity-100"
                leave="ease-in duration-200" leave-from="opacity-100" leave-to="opacity-0">
                <div class="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" />
            </TransitionChild>

            <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
                <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <TransitionChild as="template" enter="ease-out duration-300"
                        enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        enter-to="opacity-100 translate-y-0 sm:scale-100" leave="ease-in duration-200"
                        leave-from="opacity-100 translate-y-0 sm:scale-100"
                        leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95">
                        <DialogPanel
                            class="relative transform overflow-hidden rounded-lg bg-neutral-900 border border-neutral-700 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm">
                            <div class="px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                                <div class="sm:flex sm:items-start">
                                    <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                                        <DialogTitle as="h3" class="text-lg font-bold text-white">{{ title }}
                                        </DialogTitle>
                                        <div class="mt-2">
                                            <p class="text-sm text-gray-400">
                                                {{ message }}
                                            </p>
                                        </div>
                                        <!-- Custom content slot (e.g. checkboxes) -->
                                        <div class="mt-4">
                                            <slot name="body"></slot>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div
                                class="px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 space-y-2 sm:space-y-0 sm:space-x-2 sm:space-x-reverse">
                                <button type="button"
                                    class="inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm sm:ml-3 sm:w-auto transition"
                                    :class="confirmButtonClass" @click="confirm">{{ confirmText }}</button>
                                <button type="button"
                                    class="mt-3 inline-flex w-full justify-center rounded-md bg-neutral-800 px-3 py-2 text-sm font-semibold text-gray-300 shadow-sm ring-1 ring-inset ring-neutral-700 hover:bg-neutral-700 sm:mt-0 sm:w-auto transition"
                                    @click="close">{{ cancelText }}</button>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
