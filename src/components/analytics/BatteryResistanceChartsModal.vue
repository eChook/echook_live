<!--
  @file components/analytics/BatteryResistanceChartsModal.vue
  @brief Modal containing V–I scatter and internal resistance vs energy-state charts.
-->
<script setup>
import { defineEmits, defineProps } from 'vue'
import BatteryResistanceScatterChart from './BatteryResistanceScatterChart.vue'
import BatteryResistanceAhChart from './BatteryResistanceAhChart.vue'

defineProps({
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
  /** @brief Chart series bundle for the active section. */
  chartSeries: {
    type: Object,
    default: () => ({})
  },
  /** @brief Supply resistance payload with branch fits. */
  resistance: {
    type: Object,
    default: () => ({})
  },
  /** @brief Scatter/fit branch (`total`, `lower`, or `upper`). */
  scatterBranch: {
    type: String,
    default: 'total'
  },
  /** @brief Resolved IR vs Net Ah series for this section. */
  resistanceChartSeries: {
    type: Object,
    default: () => ({ points: [] })
  }
})

const emit = defineEmits(['close', 'help'])

/**
 * @brief Forward metric help requests to the parent tab.
 * @param {string} metricId - Help map key
 */
function requestHelp(metricId) {
  emit('help', metricId)
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="`${title} resistance charts`"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 md:p-5 shadow-xl"
    >
      <div class="flex items-start justify-between gap-3 mb-4 sticky top-0 bg-white dark:bg-neutral-800 pb-2 border-b border-zinc-200 dark:border-neutral-700 z-10">
        <div>
          <h3 class="text-sm md:text-base font-semibold text-zinc-900 dark:text-white">
            {{ title }} — Resistance charts
          </h3>
          <p class="mt-1 text-xs text-zinc-500 dark:text-gray-400">
            Voltage vs current fit and internal resistance vs energy state for this section.
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

      <div class="space-y-4">
        <BatteryResistanceScatterChart
          :series="chartSeries?.viScatter || []"
          :resistance="resistance"
          :branch="scatterBranch"
          @help="requestHelp('resistance_vi_scatter')"
        />
        <BatteryResistanceAhChart
          :series="resistanceChartSeries"
          @help="requestHelp('resistance_vs_ah')"
        />
      </div>
    </div>
  </div>
</template>
