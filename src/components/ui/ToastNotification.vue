<!--
  @file components/ui/ToastNotification.vue
  @brief Global toast notification component.
  @description Displays temporary toast messages at the bottom-right corner.
               Uses the useToast composable for shared state across components.
               Supports success, warning, error, and info message types.
-->
<script setup>
/**
 * @description Toast notification component.
 * 
 * Features:
 * - Animated slide-in/fade-out transitions
 * - Color-coded icons based on message type
 * - Manual dismiss button
 * - Auto-hide timer handled by useToast composable
 * 
 * Message Types:
 * - success: Green check icon
 * - warning: Yellow exclamation icon
 * - error: Red exclamation icon
 * - info: Blue information icon
 */
import { useToast } from '../../composables/useToast'
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/vue/24/outline'

const { isVisible, message, type, hideToast } = useToast()

/**
 * @brief Icon component map by message type.
 */
const iconMap = {
    success: CheckCircleIcon,
    warning: ExclamationCircleIcon,
    error: ExclamationCircleIcon,
    info: InformationCircleIcon
}

/**
 * @brief Background color class map by message type.
 */
const colorMap = {
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
}
</script>

<template>
    <transition enter-active-class="transition ease-out duration-250"
        enter-from-class="translate-y-2 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition ease-in duration-150"
        leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-2 opacity-0">
        <div v-if="isVisible"
            class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center w-[min(94vw,40rem)] p-5 space-x-4 text-zinc-900 dark:text-white bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-neutral-700"
            role="alert">
            <div
                :class="`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${colorMap[type] || colorMap.info}`">
                <component :is="iconMap[type] || iconMap.info" class="w-5 h-5 text-white" />
            </div>
            <div class="ml-3 text-base font-medium flex-1 min-w-0">{{ message }}</div>
            <button type="button" @click="hideToast"
                class="px-3 py-1.5 rounded-md border border-zinc-300 dark:border-neutral-600 text-sm font-semibold text-zinc-700 dark:text-gray-200 hover:bg-zinc-100 dark:hover:bg-neutral-700 focus:ring-2 focus:ring-zinc-300 dark:focus:ring-gray-600"
                aria-label="Dismiss notification">
                Dismiss
            </button>
        </div>
    </transition>
</template>
