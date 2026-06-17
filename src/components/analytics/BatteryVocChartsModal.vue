<!--
  @file components/analytics/BatteryVocChartsModal.vue
  @brief Modal containing terminal V, estimated V_oc, and current trend for a battery section.
-->
<script setup>
import { computed, defineEmits, defineProps } from 'vue'
import BatteryVocTrendChart from './BatteryVocTrendChart.vue'

const props = defineProps({
  /** @brief Whether the modal is visible. */
  isOpen: {
    type: Boolean,
    required: true
  },
  /** @brief Modal title (section name). */
  title: {
    type: String,
    required: true
  },
  /** @brief Per-sample V_oc trend series for the active section. */
  series: {
    type: Array,
    default: () => []
  },
  /** @brief Scatter/fit branch (`total`, `lower`, or `upper`) for terminal voltage labeling. */
  scatterBranch: {
    type: String,
    default: 'total'
  }
})

const emit = defineEmits(['close'])

/** @brief Terminal voltage legend label for the active branch. */
const terminalVoltageLabel = computed(() => {
  if (props.scatterBranch === 'upper') return 'Upper Terminal Voltage'
  if (props.scatterBranch === 'lower') return 'Lower Terminal Voltage'
  return 'Combined Terminal Voltage'
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Estimated open-circuit voltage chart"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 md:p-5 shadow-xl"
    >
      <div class="flex items-start justify-between gap-3 mb-4 sticky top-0 bg-white dark:bg-neutral-800 pb-2 border-b border-zinc-200 dark:border-neutral-700 z-10">
        <div>
          <h3 class="text-sm md:text-base font-semibold text-zinc-900 dark:text-white">
            {{ title }} — Estimated V_oc trend
          </h3>
          <p class="mt-1 text-xs text-zinc-500 dark:text-gray-400">
            Terminal voltage, estimated open-circuit voltage, and current across the full analysis window.
          </p>
        </div>
        <button
          type="button"
          class="px-2 py-1 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-700 border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 shrink-0"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <BatteryVocTrendChart
        :series="series"
        :terminal-voltage-label="terminalVoltageLabel"
      />
    </div>
  </div>
</template>
