<!--
  @file components/GraphHelpModal.vue
  @brief Keyboard shortcuts and controls help modal.
  @description Displays a modal dialog with documentation for all keyboard
               shortcuts and graph controls. Can be dismissed permanently
               via settings. Supports light and dark app themes.
-->
<script setup>
/**
 * @description Help modal for graph controls and keyboard shortcuts.
 *
 * Features:
 * - Displays all available keyboard shortcuts
 * - Graph navigation controls (pan, zoom)
 * - Tab cycling and global shortcuts
 * - "Don't show again" option persisted to settings
 *
 * Props:
 * - isOpen: Controls modal visibility
 *
 * Emits:
 * - close: When modal should be closed
 */
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import { useSettingsStore } from '../stores/settings'

defineProps({
    /** @brief Whether the modal is currently visible */
    isOpen: Boolean
})

const emit = defineEmits(['close'])
const settings = useSettingsStore()

/**
 * @brief Close the modal.
 */
const close = () => {
    emit('close')
}

/**
 * @brief Close modal and disable future auto-shows.
 */
const doNotShowAgain = () => {
    settings.showGraphHelp = false
    emit('close')
}

</script>

<template>
    <TransitionRoot as="template" :show="isOpen">
        <Dialog as="div" class="relative z-50" @close="close">
            <TransitionChild as="template" enter="ease-out duration-300" enter-from="opacity-0" enter-to="opacity-100"
                leave="ease-in duration-200" leave-from="opacity-100" leave-to="opacity-0">
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </TransitionChild>

            <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
                <div class="flex min-h-full items-center justify-center p-4">
                    <TransitionChild as="template" enter="ease-out duration-300"
                        enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        enter-to="opacity-100 translate-y-0 sm:scale-100" leave="ease-in duration-200"
                        leave-from="opacity-100 translate-y-0 sm:scale-100"
                        leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95">
                        <DialogPanel
                            class="bg-white dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-700 rounded-xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col items-center text-center p-6 space-y-6">

                            <DialogTitle as="h2"
                                class="text-xl font-bold text-zinc-900 dark:text-white uppercase tracking-wide">
                                Controls & Shortcuts
                            </DialogTitle>

                            <div
                                class="space-y-4 w-full text-sm text-zinc-700 dark:text-gray-300 overflow-y-auto max-h-[60vh] pr-2 text-left">
                                <div
                                    class="text-xs font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-wider mb-2 text-center">
                                    Graph Navigation</div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Pan</span>
                                    <div class="flex items-center space-x-1">
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">Shift</kbd>
                                        <span class="text-zinc-500 dark:text-gray-500">+</span>
                                        <span class="text-zinc-600 dark:text-gray-400">Scroll</span>
                                    </div>
                                </div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Pan (trackpad)</span>
                                    <span class="text-zinc-600 dark:text-gray-400">Sideways scroll over graph</span>
                                </div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Zoom</span>
                                    <div class="flex items-center space-x-1">
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">Ctrl</kbd>
                                        <span class="text-zinc-500 dark:text-gray-500">+</span>
                                        <span class="text-zinc-600 dark:text-gray-400">Scroll</span>
                                    </div>
                                </div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Page Scroll</span>
                                    <span class="text-zinc-600 dark:text-gray-400">Scroll</span>
                                </div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Pan / Zoom</span>
                                    <div class="flex items-center space-x-1">
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">↑↓</kbd>
                                        <span class="text-zinc-500 dark:text-gray-500">/</span>
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">←→</kbd>
                                    </div>
                                </div>

                                <div
                                    class="text-xs font-bold text-zinc-500 dark:text-gray-500 uppercase tracking-wider mt-4 mb-2 text-center">
                                    Keyboard Shortcuts</div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Cycle Tabs</span>
                                    <div class="flex items-center space-x-1">
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">Ctrl</kbd>
                                        <span class="text-zinc-500 dark:text-gray-500">+</span>
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">Tab</kbd>
                                    </div>
                                </div>
                                <p class="text-xs text-zinc-500 dark:text-gray-500 text-center -mt-2">
                                    Cycles all visible tabs including Settings. Use Ctrl+Shift+Tab to go backward.
                                </p>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Pause / Resume</span>
                                    <kbd
                                        class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">Space</kbd>
                                </div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Zoom to Race</span>
                                    <kbd
                                        class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">R</kbd>
                                </div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Zoom Last N Laps</span>
                                    <div class="flex items-center space-x-1">
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">1</kbd>
                                        <span class="text-zinc-500 dark:text-gray-500">-</span>
                                        <kbd
                                            class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">9</kbd>
                                    </div>
                                </div>

                                <div
                                    class="flex items-center justify-between bg-zinc-100 dark:bg-neutral-800/50 p-2 rounded-lg border border-zinc-200 dark:border-neutral-700/50">
                                    <span class="font-bold text-zinc-800 dark:text-gray-200">Unlock / Resume Scroll</span>
                                    <kbd
                                        class="px-2 py-0.5 rounded bg-zinc-200 dark:bg-neutral-700 border border-zinc-300 dark:border-neutral-600 font-mono text-xs text-zinc-800 dark:text-gray-300">L</kbd>
                                </div>
                            </div>

                            <div class="flex items-center space-x-3 w-full pt-2">
                                <button type="button" @click="doNotShowAgain"
                                    class="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-neutral-600 text-zinc-600 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-gray-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 transition text-sm font-medium">
                                    Don't Show Again
                                </button>
                                <button type="button" @click="close"
                                    class="flex-1 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold transition text-sm">
                                    Got it
                                </button>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
