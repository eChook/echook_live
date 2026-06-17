<!--
  @file components/analytics/AnalyticsWindowPickerModal.vue
  @brief Modal for user-defined analytics window selection on voltage timeline.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import AnalyticsVoltageWindowChart from './AnalyticsVoltageWindowChart.vue'
import { formatClockTime } from '../../utils/formatting'
import { clampWindowBounds } from '../../utils/analyticsWindow'

const props = defineProps({
  /** @brief Whether the modal is visible. */
  isOpen: {
    type: Boolean,
    required: true
  },
  /** @brief True when analytics mode is live (end tracks latest, no end pick). */
  isLiveMode: {
    type: Boolean,
    default: false
  },
  /** @brief Full display history for the voltage chart. */
  samples: {
    type: Array,
    default: () => []
  },
  /** @brief Committed window start (ms). */
  startMs: {
    type: Number,
    default: null
  },
  /** @brief Committed window end (ms); live mode ignores on apply. */
  endMs: {
    type: Number,
    default: null
  },
  /** @brief Latest packet timestamp for live end display and clamping. */
  latestMs: {
    type: Number,
    default: null
  },
  /** @brief Oldest packet timestamp for clamping. */
  oldestMs: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['close', 'apply'])

/** @brief Draft start while modal is open. */
const draftStartMs = ref(null)
/** @brief Draft end while modal is open (history only). */
const draftEndMs = ref(null)

/**
 * @brief Seed draft markers from committed bounds when modal opens.
 * @description Leaves markers unset when the user has not applied a window yet.
 */
function seedDraftFromProps() {
  draftStartMs.value = Number.isFinite(props.startMs) ? props.startMs : null
  draftEndMs.value = Number.isFinite(props.endMs) ? props.endMs : null
}

watch(() => props.isOpen, (open) => {
  if (open) seedDraftFromProps()
}, { immediate: true })

/** @brief Effective end shown in header (live uses latest). */
const displayEndMs = computed(() => {
  if (props.isLiveMode) return props.latestMs
  return draftEndMs.value
})

/** @brief Whether apply can commit a valid window. */
const canApply = computed(() => {
  const endMs = props.isLiveMode ? props.latestMs : draftEndMs.value
  return clampWindowBounds(draftStartMs.value, endMs, props.oldestMs, props.latestMs) !== null
})

/**
 * @brief Reset draft markers to the full loaded buffer span.
 */
function resetToFullBuffer() {
  draftStartMs.value = props.oldestMs
  draftEndMs.value = props.latestMs
}

/**
 * @brief Remove start/end markers from the draft window.
 */
function clearMarkers() {
  draftStartMs.value = null
  if (!props.isLiveMode) {
    draftEndMs.value = null
  }
}

/**
 * @brief Commit draft window and close modal.
 */
function handleApply() {
  const endMs = props.isLiveMode ? props.latestMs : draftEndMs.value
  const bounds = clampWindowBounds(draftStartMs.value, endMs, props.oldestMs, props.latestMs)
  if (!bounds) return
  emit('apply', { startMs: bounds.startMs, endMs: bounds.endMs })
  emit('close')
}

/**
 * @brief Close without applying draft edits.
 */
function handleCancel() {
  emit('close')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Set analytics window"
    @click.self="handleCancel"
  >
    <div
      class="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 md:p-5 shadow-xl"
    >
      <div class="flex items-start justify-between gap-3 mb-4 sticky top-0 bg-white dark:bg-neutral-800 pb-2 border-b border-zinc-200 dark:border-neutral-700 z-10">
        <div>
          <h3 class="text-sm md:text-base font-semibold text-zinc-900 dark:text-white">
            Set analytics window
          </h3>
          <p class="mt-1 text-xs text-zinc-500 dark:text-gray-400">
            Select start
            <template v-if="!isLiveMode">and end</template>
            on the loaded voltage timeline.
          </p>
        </div>
        <button
          type="button"
          class="px-2 py-1 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-700 border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 shrink-0"
          @click="handleCancel"
        >
          Close
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-4 mb-4 font-mono text-sm">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">Start</span>
          <div class="text-zinc-900 dark:text-white">{{ formatClockTime(draftStartMs) }}</div>
        </div>
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">End</span>
          <div class="text-zinc-900 dark:text-white">
            <template v-if="isLiveMode">Live ({{ formatClockTime(displayEndMs) }})</template>
            <template v-else>{{ formatClockTime(displayEndMs) }}</template>
          </div>
        </div>
      </div>

      <AnalyticsVoltageWindowChart
        :samples="samples"
        :start-ms="draftStartMs"
        :end-ms="draftEndMs"
        :allow-end-selection="!isLiveMode"
        @update:start-ms="draftStartMs = $event"
        @update:end-ms="draftEndMs = $event"
      />

      <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-semibold border border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!Number.isFinite(draftStartMs) && (isLiveMode || !Number.isFinite(draftEndMs))"
          @click="clearMarkers"
        >
          Clear markers
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-semibold border border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition"
          @click="resetToFullBuffer"
        >
          Reset to full buffer
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-semibold border border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition"
          @click="handleCancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded text-xs font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50"
          :disabled="!canApply"
          @click="handleApply"
        >
          Apply
        </button>
      </div>
    </div>
  </div>
</template>
