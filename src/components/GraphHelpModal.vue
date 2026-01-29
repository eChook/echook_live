<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'

const props = defineProps({
    isOpen: Boolean
})

const emit = defineEmits(['close'])
const settings = useSettingsStore()

const close = () => {
    emit('close')
}

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

            <h2 class="text-xl font-bold text-white uppercase tracking-wide">Graph Navigation</h2>

            <div class="space-y-4 w-full text-sm text-gray-300">
                <!-- Pan -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Pan</span>
                    <span class="text-gray-400">Scroll / Drag</span>
                </div>

                <!-- Zoom -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Zoom</span>
                    <div class="flex items-center space-x-1">
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">Shift</kbd>
                        <span class="text-gray-500">+</span>
                        <span class="text-gray-400">Scroll</span>
                    </div>
                </div>

                <!-- Page Scroll -->
                <div
                    class="flex items-center justify-between bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
                    <span class="font-bold text-gray-200">Page Scroll</span>
                    <div class="flex items-center space-x-1">
                        <kbd
                            class="px-2 py-0.5 rounded bg-neutral-700 border border-neutral-600 font-mono text-xs text-gray-300">Ctrl</kbd>
                        <span class="text-gray-500">+</span>
                        <span class="text-gray-400">Scroll</span>
                    </div>
                </div>
            </div>

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
