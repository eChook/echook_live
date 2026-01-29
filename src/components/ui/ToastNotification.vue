<script setup>
import { useToast } from '../../composables/useToast'
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const { isVisible, message, type, hideToast } = useToast()

const iconMap = {
    success: CheckCircleIcon,
    warning: ExclamationCircleIcon,
    error: ExclamationCircleIcon,
    info: InformationCircleIcon
}

const colorMap = {
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
}
</script>

<template>
    <transition enter-active-class="transform ease-out duration-300 transition"
        enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0" leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="isVisible"
            class="fixed bottom-4 right-4 z-[9999] flex items-center w-full max-w-xs p-4 space-x-4 text-white bg-neutral-800 rounded-lg shadow-2xl border border-neutral-700"
            role="alert">
            <div
                :class="`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${colorMap[type] || colorMap.info}`">
                <component :is="iconMap[type] || iconMap.info" class="w-5 h-5 text-white" />
            </div>
            <div class="ml-3 text-sm font-normal">{{ message }}</div>
            <button type="button" @click="hideToast"
                class="ml-auto -mx-1.5 -my-1.5 bg-neutral-800 text-gray-400 hover:text-white rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-neutral-700 inline-flex items-center justify-center h-8 w-8"
                aria-label="Close">
                <span class="sr-only">Close</span>
                <XMarkIcon class="w-4 h-4" />
            </button>
        </div>
    </transition>
</template>
