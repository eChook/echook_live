<!--
  @file components/ui/StatusPanel.vue
  @brief Panel chrome for Status homescreen and Battery Store sections.
-->
<script setup>
/**
 * @description Bordered panel with header row and padded body.
 *
 * Props:
 * - title: Panel heading
 * - note: Optional right-aligned basis note (muted micro copy)
 */
defineProps({
    /** @brief Panel title */
    title: { type: String, required: true },
    /** @brief Optional header note (e.g. measurement basis) */
    note: { type: String, default: '' }
})
</script>

<template>
    <section
        class="rounded-xl border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] overflow-hidden">
        <header
            class="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-zinc-200 dark:border-[color:var(--app-border)]">
            <h2 class="text-[15px] font-semibold text-zinc-900 dark:text-white m-0">{{ title }}</h2>
            <slot name="header-extra" />
            <span
                v-if="note"
                class="ml-auto text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                {{ note }}
            </span>
        </header>
        <div class="p-5">
            <slot />
        </div>
    </section>
</template>
