<!--
  @file components/ui/StatusWindowControl.vue
  @brief From/to window composer for the Status homescreen.
-->
<script setup>
/**
 * @description Three legal windows only: race→live, custom-start→live, custom-start→custom-end.
 *
 * Props:
 * - startKind: 'race' | 'custom'
 * - endKind: 'live' | 'custom'
 * - startTimeLabel: clock string when a custom start is set
 * - endTimeLabel: clock string when a custom end is set
 * - raceStartLabel: optional clock string for the detected race start
 */
defineProps({
    /** @brief Window start kind */
    startKind: { type: String, required: true },
    /** @brief Window end kind */
    endKind: { type: String, required: true },
    /** @brief Custom start clock label, or empty */
    startTimeLabel: { type: String, default: '' },
    /** @brief Custom end clock label, or empty */
    endTimeLabel: { type: String, default: '' },
    /** @brief Detected race-start clock label */
    raceStartLabel: { type: String, default: '' }
})

const emit = defineEmits(['select-race', 'pick-start', 'select-live', 'pick-end'])

/** @brief Shared segmented chrome */
const groupClass =
    'inline-flex p-[3px] rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)]'

/**
 * @brief Active/inactive classes for a segment button.
 * @param {boolean} active - Whether this option is selected
 * @param {boolean} [disabled=false] - Whether the option is unavailable
 * @returns {string}
 */
function segmentClass(active, disabled = false) {
    if (disabled) {
        return 'px-3 py-[5px] rounded-md text-xs font-medium text-zinc-400 dark:text-neutral-600 cursor-not-allowed'
    }
    if (active) {
        return 'px-3 py-[5px] rounded-md text-xs font-semibold bg-primary/15 text-pink-700 dark:text-pink-300'
    }
    return 'px-3 py-[5px] rounded-md text-xs font-medium text-zinc-500 dark:text-[color:var(--app-muted)] hover:text-zinc-900 dark:hover:text-white'
}
</script>

<template>
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Status time window">
        <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[color:var(--app-muted)]">
            From
        </span>
        <div :class="groupClass">
            <button type="button" :class="segmentClass(startKind === 'race')"
                :aria-pressed="startKind === 'race'"
                :title="raceStartLabel ? `Race start ${raceStartLabel}` : 'No lap session yet — uses first loaded sample'"
                @click="emit('select-race')">
                Race start
                <span v-if="raceStartLabel && startKind === 'race'" class="ml-1 font-mono font-normal opacity-80">
                    {{ raceStartLabel }}
                </span>
            </button>
            <button type="button" :class="segmentClass(startKind === 'custom')"
                :aria-pressed="startKind === 'custom'" @click="emit('pick-start')">
                {{ startKind === 'custom' && startTimeLabel ? startTimeLabel : 'Pick time' }}
            </button>
        </div>

        <span class="text-zinc-400 dark:text-[color:var(--app-muted)]" aria-hidden="true">→</span>

        <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-[color:var(--app-muted)]">
            To
        </span>
        <div :class="groupClass">
            <button type="button" :class="segmentClass(endKind === 'live')"
                :aria-pressed="endKind === 'live'" @click="emit('select-live')">
                Live
            </button>
            <button type="button"
                :class="segmentClass(endKind === 'custom', startKind === 'race')"
                :aria-pressed="endKind === 'custom'"
                :disabled="startKind === 'race'"
                :title="startKind === 'race' ? 'Pick a start time first to set a custom end' : 'Choose an end time'"
                @click="emit('pick-end')">
                {{ endKind === 'custom' && endTimeLabel ? endTimeLabel : 'Pick time' }}
            </button>
        </div>
    </div>
</template>
