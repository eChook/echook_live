<!--
  @file components/tabs/batteries/BatteryManufactureDateFields.vue
  @brief Month and year dropdowns bound to a YY-MM date stamp string.
-->
<script setup>
import { computed, onMounted } from 'vue'
import {
    BATTERY_MANUFACTURE_MONTHS,
    defaultManufactureDateStamp,
    formatDateStamp,
    getBatteryManufactureYears,
    getCurrentManufactureYear,
    parseDateStamp
} from '../../../utils/batteryFormatters'

defineProps({
    /** @brief When false, the parent supplies the Manufactured label. */
    showLabel: { type: Boolean, default: true }
})

/** @brief Stored date stamp in YY-MM format (v-model). */
const dateStamp = defineModel({ type: String, default: '' })

/** @brief Selectable four-digit years, newest first (recomputed from runtime clock). */
const yearOptions = computed(() => getBatteryManufactureYears())

/** @brief Default year shown when no stamp is stored yet. */
const defaultYear = computed(() => getCurrentManufactureYear())

/** @brief Selected month (1–12) derived from the date stamp. */
const selectedMonth = computed({
    get: () => parseDateStamp(dateStamp.value)?.month ?? '',
    set: (month) => {
        const year = parseDateStamp(dateStamp.value)?.year ?? defaultYear.value
        dateStamp.value = formatDateStamp(month, year)
    }
})

/** @brief Selected year derived from the date stamp. */
const selectedYear = computed({
    get: () => parseDateStamp(dateStamp.value)?.year ?? '',
    set: (year) => {
        const month = parseDateStamp(dateStamp.value)?.month ?? ''
        dateStamp.value = formatDateStamp(month, year)
    }
})

/**
 * @brief Ensure empty or legacy invalid stamps default to the current month/year.
 */
onMounted(() => {
    if (!parseDateStamp(dateStamp.value)) {
        dateStamp.value = defaultManufactureDateStamp()
    }
})

/** @brief Shared select chrome matching Battery Store forms. */
const selectClass =
    'box-border rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-[color:var(--app-bg)] px-3 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary'
</script>

<template>
    <div>
        <label v-if="showLabel" class="block mb-1.5 text-xs font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)]">
            Manufactured
        </label>
        <div class="flex gap-2">
            <select v-model="selectedMonth" :class="[selectClass, 'flex-1 min-w-0']">
                <option disabled value="">Month</option>
                <option v-for="month in BATTERY_MANUFACTURE_MONTHS" :key="month.value" :value="month.value">
                    {{ month.label }}
                </option>
            </select>
            <select v-model="selectedYear" :class="[selectClass, 'w-[104px] shrink-0 font-mono']">
                <option disabled value="">Year</option>
                <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
            </select>
        </div>
        <p class="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-[color:var(--app-muted)]">
            Month and year only — it's what's stamped on the case.
        </p>
    </div>
</template>
