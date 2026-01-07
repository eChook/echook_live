<script setup>
defineProps({
  label: String,
  value: [String, Number],
  unit: String
})
</script>

<template>
  <div class="flex-shrink-0 w-32 p-3 bg-neutral-800 rounded-lg border border-neutral-700 shadow flex flex-col items-center justify-center space-y-1">
    <span class="text-xs uppercase text-gray-400 font-bold tracking-wider">{{ label }}</span>
    <span class="text-2xl font-mono text-white font-bold">{{ typeof value === 'number' ? value.toFixed(2) : (value || '-') }}</span>
    <span v-if="unit" class="text-xs text-gray-500">{{ unit }}</span>
  </div>
</template>
