<!--
  @file components/PublicFooter.vue
  @brief Shared footer for public pages with legal policy links.
-->
<script setup>
/**
 * @description Footer links to Privacy Policy, Data Management Policy, and Terms of Service.
 */
</script>

<template>
  <footer class="border-t border-zinc-200/80 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur">
    <div class="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 dark:text-gray-500">
      <p>&copy; {{ new Date().getFullYear() }} eChook Telemetry</p>
      <nav class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <router-link to="/privacy" class="hover:text-primary transition">Privacy Policy</router-link>
        <router-link to="/data-management" class="hover:text-primary transition">Data Management</router-link>
        <router-link to="/terms" class="hover:text-primary transition">Terms of Service</router-link>
      </nav>
    </div>
  </footer>
</template>
