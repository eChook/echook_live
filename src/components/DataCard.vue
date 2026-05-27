<!--
  @file components/DataCard.vue
  @brief Telemetry data display card component.
  @description A reusable card for displaying a single telemetry value with
               label, unit, and visual feedback for stale data. Supports
               drag-and-drop reordering in the dashboard ribbon.
-->
<script setup>
/**
 * @description DataCard component for displaying formatted telemetry values.
 * 
 * Props:
 * - label: Display name for the data point
 * - value: Raw value to display
 * - unit: Optional unit override
 * - stale: Whether data is stale (reduces opacity)
 * - tooltip: Hover tooltip text
 */
import { computed } from 'vue'
import { formatValue, getUnit } from '../utils/formatting'

/**
 * @brief Component props definition.
 */
const props = defineProps({
  /** @brief Display label for the data point */
  label: String,
  /** @brief Raw value (formatted for display) */
  value: [String, Number],
  /** @brief Optional unit override (auto-detected if not provided) */
  unit: String,
  /** @brief Whether data should appear stale/dimmed */
  stale: Boolean,
  /** @brief Threshold status used for warning/critical highlighting */
  thresholdStatus: {
    type: String,
    default: 'normal'
  },
  /** @brief Tooltip text for hover */
  tooltip: String
})

/**
 * @brief Formatted display value using formatting utility.
 * @type {ComputedRef<string>}
 */
const displayValue = computed(() => formatValue(props.label, props.value))

/**
 * @brief Display unit (uses prop or auto-detects from label).
 * @type {ComputedRef<string>}
 */
const displayUnit = computed(() => props.unit || getUnit(props.label))

/** @brief Card border/background classes by threshold status. */
const thresholdCardClass = computed(() => {
  if (props.thresholdStatus === 'critical') {
    return 'border-red-400 dark:border-red-500 bg-red-50/70 dark:bg-red-900/15 hover:border-red-400'
  }
  if (props.thresholdStatus === 'warning') {
    return 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-900/15 hover:border-amber-400'
  }
  return 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-primary/50'
})

/** @brief Value text classes by stale state and threshold severity. */
const valueClass = computed(() => {
  if (props.stale) return 'text-zinc-400 dark:text-gray-500'
  if (props.thresholdStatus === 'critical') return 'text-red-700 dark:text-red-300'
  if (props.thresholdStatus === 'warning') return 'text-amber-700 dark:text-amber-300'
  return 'text-zinc-900 dark:text-white'
})
</script>

<template>
  <div :class="[
    'group flex-shrink-0 min-w-20 md:min-w-32 p-2 md:p-3 rounded-lg border shadow flex flex-col items-center justify-center space-y-0.5 md:space-y-1 transition-all duration-200 cursor-grab active:cursor-grabbing hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5',
    thresholdCardClass,
    stale ? 'opacity-50 grayscale' : 'opacity-100'
  ]" :title="tooltip">
    <span class="text-[10px] md:text-xs uppercase text-zinc-500 dark:text-gray-400 font-bold tracking-wider truncate max-w-full">{{ label
    }} <span v-if="displayUnit" class="text-zinc-400 dark:text-gray-500 font-normal">({{ displayUnit }})</span></span>
    <span
      :class="['text-lg md:text-2xl font-mono font-bold transition-colors duration-500', valueClass]">{{
        displayValue }}</span>
  </div>
</template>
