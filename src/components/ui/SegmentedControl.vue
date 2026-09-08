<!--
  @file components/ui/SegmentedControl.vue
  @brief Segmented button group for window/filter selection (Status, Battery Store).
-->
<script setup>
/**
 * @description Segmented control matching the design-handoff spec.
 *
 * Props:
 * - modelValue: active option value
 * - options: [{ value, label, count? }]
 * - size: 'sm' | 'md'
 */
const props = defineProps({
    /** @brief Currently selected option value */
    modelValue: { type: [String, Number], required: true },
    /** @brief Selectable segments */
    options: {
        type: Array,
        required: true,
        validator: (items) => items.every((item) => item?.value !== undefined && item?.label)
    },
    /** @brief Visual density */
    size: {
        type: String,
        default: 'sm',
        validator: (value) => ['sm', 'md'].includes(value)
    },
    /** @brief Accessible label for the group */
    ariaLabel: { type: String, default: 'Options' }
})

const emit = defineEmits(['update:modelValue'])

/**
 * @brief Select a segment.
 * @param {string|number} value - Option value
 */
function select(value) {
    emit('update:modelValue', value)
}

/** @brief Padding classes by size */
const optionPadClass = props.size === 'md' ? 'px-3 py-1.5' : 'px-3 py-[5px]'
</script>

<template>
    <div
        class="inline-flex p-[3px] rounded-lg border border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)]"
        role="group"
        :aria-label="ariaLabel">
        <button
            v-for="option in options"
            :key="String(option.value)"
            type="button"
            class="rounded-md text-xs font-medium transition-colors duration-150"
            :class="[
                optionPadClass,
                modelValue === option.value
                    ? 'bg-primary/15 text-pink-700 dark:text-pink-300 font-semibold'
                    : 'text-zinc-500 dark:text-[color:var(--app-muted)] hover:text-zinc-900 dark:hover:text-white'
            ]"
            :aria-pressed="modelValue === option.value"
            @click="select(option.value)">
            {{ option.label }}<span v-if="option.count !== undefined" class="ml-0.5">{{ option.count }}</span>
        </button>
    </div>
</template>
