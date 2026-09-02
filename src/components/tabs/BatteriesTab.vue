<!--
  @file components/tabs/BatteriesTab.vue
  @brief Battery Store tab for team inventory, fitment, and lifetime statistics.
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useBatteryStore } from '../../stores/battery'
import { useAuthStore } from '../../stores/auth'
import { useTelemetryStore } from '../../stores/telemetry'
import EmptyStoreView from './batteries/EmptyStoreView.vue'
import TabTopBar from './batteries/TabTopBar.vue'
import HeroSection from './batteries/HeroSection.vue'
import BatteryTable from './batteries/BatteryTable.vue'
import AddCarModal from './batteries/AddCarModal.vue'
import StatCalculationModal from './batteries/StatCalculationModal.vue'

const battery = useBatteryStore()
const auth = useAuthStore()
const telemetry = useTelemetryStore()

const showAddCarModal = ref(false)
const showStatModal = ref(false)

/** @brief Demo car cannot use battery store features. */
const isDemo = computed(() => auth.user?.id === 'demo-car-1' || auth.user?.isDemo === true)

/** @brief Hero section only appears in live mode (not viewing a historical day). */
const showHero = computed(() => !telemetry.isViewingHistoricalDay)

/**
 * @brief Initialise store data when the tab mounts.
 */
onMounted(async () => {
    if (isDemo.value || !auth.user?.id) return
    await battery.initializeTab(auth.user.id)
})

/**
 * @brief Reload store state after creation.
 */
async function handleStoreCreated() {
    if (auth.user?.id) {
        await battery.initializeTab(auth.user.id)
    }
}
</script>

<template>
    <div class="h-full overflow-y-auto bg-[color:var(--app-bg)] p-4 md:p-6">
        <div v-if="isDemo"
            class="flex flex-1 items-center justify-center min-h-[50vh] text-zinc-500 dark:text-gray-500 italic">
            Battery Store is not available in demo mode.
        </div>

        <div v-else-if="battery.loading && battery.hasStore === null" class="py-16 text-center text-zinc-500">
            Loading battery store…
        </div>

        <EmptyStoreView v-else-if="battery.hasStore === false" @created="handleStoreCreated" />

        <div v-else-if="battery.hasStore" class="space-y-6 max-w-6xl mx-auto">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h2 class="text-2xl font-bold text-zinc-900 dark:text-white">Batteries</h2>
                    <p class="text-sm text-zinc-500 dark:text-gray-400">Team battery inventory and fitment</p>
                </div>
                <TabTopBar @calculate-stats="showStatModal = true" @add-car="showAddCarModal = true" />
            </div>

            <HeroSection v-if="showHero" />
            <BatteryTable />
        </div>

        <AddCarModal :is-open="showAddCarModal" @close="showAddCarModal = false" />
        <StatCalculationModal :is-open="showStatModal" @close="showStatModal = false" />
    </div>
</template>
