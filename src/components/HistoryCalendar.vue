<!--
  @file components/HistoryCalendar.vue
  @brief Calendar component for selecting historical data dates.
  @description A month-view calendar that highlights days with available
               telemetry data. Allows navigation between months with
               constraints based on data availability.
-->
<script setup>
/**
 * @description History calendar component for date selection.
 * 
 * Features:
 * - Month navigation with prev/next controls
 * - Days with data highlighted in primary color
 * - Navigation restricted to months with available data
 * - Disabled state for days without data
 * - Monday-start week format
 * 
 * Emits:
 * - select-day: When a day with data is clicked (payload: YYYY-MM-DD string)
 */
import { ref, computed } from 'vue'
import { ChevronLeftIcon, ChevronRightIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'

/**
 * @brief Component props.
 */
const props = defineProps({
    /**
     * @brief Set of available dates in YYYY-MM-DD format.
     * @type {Set<string>}
     */
    availableDays: {
        type: Object,
        default: () => new Set()
    },
    /**
     * @brief Whether available days are still loading from the server.
     */
    loading: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['select-day'])

/** @brief Currently displayed month/year */
const currentDate = ref(new Date())

/**
 * @brief Formatted display string for current month.
 * @type {ComputedRef<string>}
 */
const displayMonth = computed(() => {
    return currentDate.value.toLocaleString('default', { month: 'long', year: 'numeric' })
})

/**
 * @brief Generate calendar days for the current month.
 * @description Includes padding for alignment and data availability flags.
 * @type {ComputedRef<Array<Object>>}
 */
const calendarDays = computed(() => {
    const year = currentDate.value.getFullYear()
    const month = currentDate.value.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)

    const daysInMonth = lastDayOfMonth.getDate()
    const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7 // Monday = 0

    const days = []

    // Add padding days for alignment
    for (let i = 0; i < startingDayOfWeek; i++) {
        days.push({ day: '', dateString: null, disabled: true })
    }

    // Add actual days
    for (let i = 1; i <= daysInMonth; i++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        const hasData = props.availableDays.has(dateString)

        days.push({
            day: i,
            dateString,
            hasData,
            disabled: !hasData
        })
    }

    return days
})

/**
 * @brief Earliest date with available data.
 * @type {ComputedRef<Date>}
 */
const minDate = computed(() => {
    if (props.availableDays.size === 0) return new Date()
    const dates = Array.from(props.availableDays).sort()
    return new Date(dates[0])
})

/**
 * @brief Maximum navigable date (today).
 * @type {ComputedRef<Date>}
 */
const maxDate = computed(() => {
    return new Date()
})

/**
 * @brief Whether previous month navigation is allowed.
 * @type {ComputedRef<boolean>}
 */
const canPrev = computed(() => {
    if (props.availableDays.size === 0) return true

    const displayed = currentDate.value
    const min = minDate.value

    return (displayed.getFullYear() > min.getFullYear()) ||
        (displayed.getFullYear() === min.getFullYear() && displayed.getMonth() > min.getMonth())
})

/**
 * @brief Whether next month navigation is allowed.
 * @type {ComputedRef<boolean>}
 */
const canNext = computed(() => {
    const displayed = currentDate.value
    const max = maxDate.value

    return (displayed.getFullYear() < max.getFullYear()) ||
        (displayed.getFullYear() === max.getFullYear() && displayed.getMonth() < max.getMonth())
})

/**
 * @brief Navigate to previous month.
 */
const prevMonth = () => {
    if (!canPrev.value) return
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
}

/**
 * @brief Navigate to next month.
 */
const nextMonth = () => {
    if (!canNext.value) return
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
}

/**
 * @brief Handle day selection.
 * @param {Object} day - Day object from calendarDays
 */
const selectDay = (day) => {
    if (day.hasData) {
        emit('select-day', day.dateString)
    }
}
</script>

<template>
    <div
        class="calendar relative w-64 bg-white dark:bg-neutral-900 border border-zinc-200 dark:border-neutral-700 rounded-lg p-4"
        data-test="history-calendar"
    >
        <div
            v-if="loading"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/80 dark:bg-neutral-900/85 backdrop-blur-[1px]"
            data-test="history-calendar-loading"
            aria-live="polite"
            aria-busy="true"
        >
            <ArrowPathIcon class="w-6 h-6 text-primary animate-spin" />
            <span class="text-xs font-medium text-zinc-600 dark:text-gray-300">Loading dates...</span>
        </div>

        <!-- Month Navigation Header -->
        <div class="header flex justify-between items-center mb-4">
            <button @click="prevMonth" :disabled="!canPrev || loading"
                class="p-1 hover:bg-zinc-100 dark:hover:bg-neutral-800 rounded disabled:opacity-30">
                <ChevronLeftIcon class="w-5 h-5 text-zinc-500 dark:text-gray-400" />
            </button>
            <span class="text-sm font-bold text-zinc-900 dark:text-gray-200">{{ displayMonth }}</span>
            <button @click="nextMonth" :disabled="!canNext || loading"
                class="p-1 hover:bg-zinc-100 dark:hover:bg-neutral-800 rounded disabled:opacity-30">
                <ChevronRightIcon class="w-5 h-5 text-zinc-500 dark:text-gray-400" />
            </button>
        </div>

        <!-- Day Names Header -->
        <div class="grid grid-cols-7 gap-1 text-center mb-2">
            <div v-for="d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="d" class="text-xs font-bold text-zinc-500 dark:text-gray-500">
                {{ d }}
            </div>
        </div>

        <!-- Calendar Days Grid -->
        <div class="grid grid-cols-7 gap-1">
            <button v-for="(day, idx) in calendarDays" :key="idx" @click="selectDay(day)"
                :disabled="loading || day.disabled"
                class="h-8 w-8 text-xs rounded-full flex items-center justify-center transition-colors" :class="[
                    day.disabled
                        ? 'text-zinc-300 dark:text-neutral-700 cursor-default'
                        : day.hasData
                            ? 'bg-primary text-white hover:bg-primary/80 font-bold shadow-lg shadow-primary/20'
                            : 'text-zinc-500 dark:text-gray-400 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                ]">
                {{ day.day }}
            </button>
        </div>
    </div>
</template>
