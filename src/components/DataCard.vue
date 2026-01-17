<script setup>
import { computed } from 'vue'
import { formatValue, getUnit } from '../utils/formatting'

const props = defineProps({
  label: String,
  value: [String, Number],
  unit: String,
  stale: Boolean,
  tooltip: String
})

const displayValue = computed(() => formatValue(props.label, props.value))
const displayUnit = computed(() => props.unit || getUnit(props.label))
</script>

<template>
  <div :class="[
    'group flex-shrink-0 min-w-20 md:min-w-32 p-2 md:p-3 bg-neutral-800 rounded-lg border border-neutral-700 shadow flex flex-col items-center justify-center space-y-0.5 md:space-y-1 transition-all duration-200 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5',
    stale ? 'opacity-50 grayscale' : 'opacity-100'
  ]" :title="tooltip">
    <span class="text-[10px] md:text-xs uppercase text-gray-400 font-bold tracking-wider truncate max-w-full">{{ label
      }} <span v-if="displayUnit" class="text-gray-500 font-normal">({{ displayUnit }})</span></span>
    <span
      :class="['text-lg md:text-2xl font-mono font-bold transition-colors duration-500', stale ? 'text-gray-500' : 'text-white']">{{
        displayValue }}</span>
  </div>
</template>
