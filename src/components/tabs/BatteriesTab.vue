<!--
  @file components/tabs/BatteriesTab.vue
  @brief Battery Store tab — fitment, inventory, and team access.
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { PlusIcon, UsersIcon } from '@heroicons/vue/24/outline'
import { useBatteryStore } from '../../stores/battery'
import { useAuthStore } from '../../stores/auth'
import { useTelemetryStore } from '../../stores/telemetry'
import EmptyStoreView from './batteries/EmptyStoreView.vue'
import HeroSection from './batteries/HeroSection.vue'
import BatteryTable from './batteries/BatteryTable.vue'
import StatsFreshnessBar from './batteries/StatsFreshnessBar.vue'
import AddBatteryModal from './batteries/AddBatteryModal.vue'
import AddCarModal from './batteries/AddCarModal.vue'

const battery = useBatteryStore()
const auth = useAuthStore()
const telemetry = useTelemetryStore()

const showAddBatteryModal = ref(false)
const showCarsModal = ref(false)
const batteryTableRef = ref(null)

/** @brief Demo car cannot use battery store features */
const isDemo = computed(() => auth.user?.id === 'demo-car-1' || auth.user?.isDemo === true)

/** @brief Fitment panel only in live mode */
const showFitment = computed(() => !telemetry.isViewingHistoricalDay)

/** @brief Subtitle line: team · pack count · shared cars */
const subtitle = computed(() => {
    const team = battery.storeInfo?.team || auth.user?.team || 'Your team'
    const packCount = battery.batteries.length
    const shared = Math.max(0, (battery.authorisedCars?.length || 1) - 1)
    return `${team} · ${packCount} pack${packCount === 1 ? '' : 's'} · shared with ${shared} car${shared === 1 ? '' : 's'}`
})

onMounted(async () => {
    if (isDemo.value || !auth.user?.id) return
    await battery.initializeTab(auth.user.id)
})

async function handleStoreCreated() {
    if (auth.user?.id) await battery.initializeTab(auth.user.id)
}

/**
 * @brief Expand inventory row from fitment Details link.
 * @param {number} batteryId - Battery id
 */
function handleExpandBattery(batteryId) {
    battery.expandedBatteryId = batteryId
    batteryTableRef.value?.expandBattery?.(batteryId)
}
</script>

<template>
    <div class="h-full overflow-y-auto bg-[color:var(--app-bg)]">
        <div v-if="isDemo" class="flex flex-1 items-center justify-center min-h-[50vh] p-6 text-zinc-500 dark:text-[color:var(--app-muted)] italic">
            Battery Store is not available in demo mode.
        </div>

        <div v-else-if="battery.loading && battery.hasStore === null" class="py-16 text-center text-zinc-500">
            Loading battery store…
        </div>

        <EmptyStoreView v-else-if="battery.hasStore === false" @created="handleStoreCreated" />

        <div v-else-if="battery.hasStore" class="max-w-[1200px] mx-auto px-5 md:px-6 py-5 pb-12 space-y-5">
            <!-- Title block -->
            <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2">
                        <h1 class="text-xl font-bold text-zinc-900 dark:text-white m-0">Battery Store</h1>
                        <span class="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-950">Beta</span>
                    </div>
                    <p class="text-[13px] text-zinc-500 dark:text-[color:var(--app-muted)] mt-1">{{ subtitle }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button"
                        class="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)] px-4 text-sm font-semibold text-zinc-700 dark:text-[color:var(--app-secondary)] hover:bg-zinc-50 dark:hover:bg-[color:var(--app-inset)] transition"
                        @click="showCarsModal = true">
                        <UsersIcon class="h-4 w-4" />
                        Cars & access
                    </button>
                    <button type="button"
                        class="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 transition"
                        @click="showAddBatteryModal = true">
                        <PlusIcon class="h-4 w-4" />
                        Add battery
                    </button>
                </div>
            </div>

            <StatsFreshnessBar />

            <div class="grid gap-5 items-start lg:grid-cols-[minmax(340px,420px)_1fr]">
                <HeroSection v-if="showFitment" @expand-battery="handleExpandBattery" />
                <BatteryTable ref="batteryTableRef" />
            </div>
        </div>

        <AddBatteryModal :is-open="showAddBatteryModal" @close="showAddBatteryModal = false" @created="battery.fetchBatteries()" />
        <AddCarModal :is-open="showCarsModal" @close="showCarsModal = false" />
    </div>
</template>
