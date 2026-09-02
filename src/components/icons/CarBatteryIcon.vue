<!--
  @file components/icons/CarBatteryIcon.vue
  @brief Outline car-battery icon for dashboard navigation.
  @description Rectangular battery case with short terminal posts and +/- markers inside the case.
-->
<template>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
        stroke="currentColor" aria-hidden="true" v-bind="$attrs">
        <!-- Left terminal post (short bump on top of case) -->
        <rect x="6" y="4.5" width="2.75" height="2.75" rx="0.5" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Right terminal post -->
        <rect x="15.25" y="4.5" width="2.75" height="2.75" rx="0.5" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Battery case -->
        <rect x="3" y="7.25" width="18" height="13.25" rx="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Positive marker inside case -->
        <path stroke-linecap="round" stroke-linejoin="round" d="M7.25 11.75v5M4.75 14.25h5" />
        <!-- Negative marker inside case -->
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 14.25h5" />
    </svg>
</template>

<script setup>
/**
 * @brief Prevent duplicate attribute binding on the component wrapper.
 */
defineOptions({
    inheritAttrs: false
})
</script>
