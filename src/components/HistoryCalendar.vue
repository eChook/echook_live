<script setup>
import { ref, computed } from 'vue'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
    availableDays: {
        type: Object, // Set or Array
        default: () => new Set()
    }
})

const emit = defineEmits(['select-day'])

const currentDate = ref(new Date())

const displayMonth = computed(() => {
    return currentDate.value.toLocaleString('default', { month: 'long', year: 'numeric' })
})

const calendarDays = computed(() => {
    const year = currentDate.value.getFullYear()
    const month = currentDate.value.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)

    const daysInMonth = lastDayOfMonth.getDate()
    const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7 // 0=Mon, 6=Sun (Adjusted for Mon start)

    const days = []

    // Padding days
    for (let i = 0; i < startingDayOfWeek; i++) {
        days.push({ day: '', dateString: null, disabled: true })
    }

    // Real days
    for (let i = 1; i <= daysInMonth; i++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        const hasData = props.availableDays.has(dateString)

        // Check if day is in future (prevent forward scrolling beyond data?)
        // Actually, user requirement: "The user should not be able to scroll months back in time past the last available day with data"
        // Wait, usually it's "don't scroll forward into future". 
        // Requirement said: "User should not be able to scroll months BACK in time past the last available day with data"
        // This implies we should restrict navigation based on min/max of availableDays.

        days.push({
            day: i,
            dateString,
            hasData,
            disabled: !hasData
        })
    }

    return days
})

const minDate = computed(() => {
    if (props.availableDays.size === 0) return new Date()
    const dates = Array.from(props.availableDays).sort()
    return new Date(dates[0])
})


const maxDate = computed(() => {
    // Current date is max navigation
    return new Date()
})


const canPrev = computed(() => {
    // Prevent scrolling back past the month containing the earliest data
    if (props.availableDays.size === 0) return true // Allow if empty to see empty

    const displayed = currentDate.value
    const min = minDate.value

    // If displayed month is > min month (considering year), we can go back
    return (displayed.getFullYear() > min.getFullYear()) ||
        (displayed.getFullYear() === min.getFullYear() && displayed.getMonth() > min.getMonth())
})

const canNext = computed(() => {
    const displayed = currentDate.value
    const max = maxDate.value

    return (displayed.getFullYear() < max.getFullYear()) ||
        (displayed.getFullYear() === max.getFullYear() && displayed.getMonth() < max.getMonth())
})

const prevMonth = () => {
    if (!canPrev.value) return
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
}

const nextMonth = () => {
    if (!canNext.value) return
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
}

const selectDay = (day) => {
    if (day.hasData) {
        emit('select-day', day.dateString)
    }
}
</script>

<template>
    <div class="calendar w-64 bg-neutral-900 border border-neutral-700 rounded-lg p-4">
        <div class="header flex justify-between items-center mb-4">
            <button @click="prevMonth" :disabled="!canPrev"
                class="p-1 hover:bg-neutral-800 rounded disabled:opacity-30">
                <ChevronLeftIcon class="w-5 h-5 text-gray-400" />
            </button>
            <span class="text-sm font-bold text-gray-200">{{ displayMonth }}</span>
            <button @click="nextMonth" :disabled="!canNext"
                class="p-1 hover:bg-neutral-800 rounded disabled:opacity-30">
                <ChevronRightIcon class="w-5 h-5 text-gray-400" />
            </button>
        </div>

        <div class="grid grid-cols-7 gap-1 text-center mb-2">
            <div v-for="d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="d" class="text-xs font-bold text-gray-500">
                {{ d }}
            </div>
        </div>

        <div class="grid grid-cols-7 gap-1">
            <button v-for="(day, idx) in calendarDays" :key="idx" @click="selectDay(day)"
                class="h-8 w-8 text-xs rounded-full flex items-center justify-center transition-colors" :class="[
                    day.disabled
                        ? 'text-neutral-700 cursor-default'
                        : day.hasData
                            ? 'bg-primary text-white hover:bg-primary/80 font-bold shadow-lg shadow-primary/20'
                            : 'text-gray-400 hover:bg-neutral-800'
                ]" :disabled="day.disabled">
                {{ day.day }}
            </button>
        </div>
    </div>
</template>
