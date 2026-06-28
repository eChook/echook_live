<!--
  @file components/AppBrand.vue
  @brief Shared eChook Live wordmark for app headers.
  @description Keeps logo typography and footprint consistent across public
               and dashboard headers so the mark does not shift between routes.
-->
<script setup>
/**
 * @description Shared brand wordmark link.
 *
 * Props:
 * - to: Router destination (defaults to login / spectate menu)
 * - title: Optional link title for tooltips
 * - ariaLabel: Optional accessible name override
 */
defineProps({
  to: {
    type: String,
    default: '/login'
  },
  title: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <router-link :to="to"
    class="inline-flex items-end font-bold text-xl text-zinc-900 dark:text-white tracking-tight hover:opacity-80 transition cursor-pointer whitespace-nowrap"
    :title="title || undefined" :aria-label="ariaLabel || undefined">
    <span class="font-oswald tracking-normal text-2xl leading-none">eChook</span><span
      class="text-primary leading-none">Live</span>
  </router-link>
</template>
