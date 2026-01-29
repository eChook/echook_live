<!--
  @file components/GraphHelpModal.vue
  @brief Keyboard shortcuts and controls help modal.
  @description Displays a modal dialog with documentation for all keyboard
               shortcuts and graph controls. Can be dismissed permanently
               via settings.
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
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'

const props = defineProps({
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
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="close"></div>

        <!-- Modal Content -->
        <div
            class="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col items-center text-center p-6 space-y-6">

            <h2 class="text-xl font-bold text-white uppercase tracking-wide">Controls & Shortcuts</h2>

            <div class="space-y-4 w-full text-sm text-gray-300 overflow-y-auto max-h-[60vh] pr-2">
                <!-- Graph Controls Section -->
                <div class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Graph Navigation</div>

                <!-- Pan -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Pan</span>
                    <div class="flex items-center space-x-1">
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">Shift</kbd>
                        <span class="text-gray-500">+</span>
                        <span class="text-gray-400">Scroll</span>
                    </div>
                </div>

                <!-- Zoom -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Zoom</span>
                    <div class="flex items-center space-x-1">
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">Ctrl</kbd>
                        <span class="text-gray-500">+</span>
                        <span class="text-gray-400">Scroll</span>
                    </div>
                </div>

                <!-- Page Scroll -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Page Scroll</span>
                    <span class="text-gray-400">Scroll</span>
                </div>

                <!-- Arrow Keys -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Pan / Zoom</span>
                    <div class="flex items-center space-x-1">
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">↑↓</kbd>
                        <span class="text-gray-500">/</span>
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">←→</kbd>
                    </div>
                </div>

                <!-- Keyboard Shortcuts Section -->
                <div class="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4 mb-2">Keyboard Shortcuts</div>

                <!-- Tab Cycle -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Cycle Tabs</span>
                    <kbd
                        class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">Tab</kbd>
                </div>

                <!-- Pause/Resume -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Pause / Resume</span>
                    <kbd
                        class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">Space</kbd>
                </div>

                <!-- Zoom to Race -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Zoom to Race</span>
                    <kbd
                        class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">R</kbd>
                </div>

                <!-- Zoom to Laps -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Zoom Last N Laps</span>
                    <div class="flex items-center space-x-1">
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">1</kbd>
                        <span class="text-gray-500">-</span>
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">9</kbd>
                    </div>
                </div>

                <!-- Unlock Zoom -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-2 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Unlock / Resume Scroll</span>
                    <kbd
                        class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">L</kbd>
                </div>

            </div>

            <!-- Action Buttons -->
            <div class="flex items-center space-x-3 w-full pt-2">
                <button @click="doNotShowAgain"
                    class="flex-1 px-4 py-2 rounded-lg border border-neutral-600 text-gray-400 hover:text-white hover:border-gray-400 hover:bg-neutral-800 transition text-sm font-medium">
                    Don't Show Again
                </button>
                <button @click="close"
                    class="flex-1 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-bold transition text-sm">
                    Got it
                </button>
            </div>
        </div>
    </div>
</template>
