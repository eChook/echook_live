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
</script>

<template>
    <div>
        <label class="block text-sm font-medium text-zinc-700 dark:text-gray-300 mb-1">Manufacture Date</label>
        <div class="grid grid-cols-2 gap-2">
            <select v-model="selectedMonth"
                class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                <option disabled value="">Month</option>
                <option v-for="month in BATTERY_MANUFACTURE_MONTHS" :key="month.value" :value="month.value">
                    {{ month.label }}
                </option>
            </select>
            <select v-model="selectedYear"
                class="w-full rounded-lg border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                <option disabled value="">Year</option>
                <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option>
            </select>
        </div>
    </div>
</template>
