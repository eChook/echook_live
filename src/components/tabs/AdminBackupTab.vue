<!--
  @file components/tabs/AdminBackupTab.vue
  @brief Admin backup, R2, and SQL database management dashboard.
  @description Provides local backup download/restore controls, Cloudflare R2
               configuration and operation logs, plus SQL telemetry database
               size summaries with per-car data point counts.
-->
<template>
    <div class="h-full overflow-y-auto bg-zinc-100 dark:bg-transparent px-8 py-8">
        <div class="max-w-7xl mx-auto space-y-8">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="text-lg font-medium text-zinc-900 dark:text-white">Backup &amp; Database</h3>
                    <p class="text-sm text-zinc-600 dark:text-gray-400">
                        Manage local backups, Cloudflare R2 backup settings, and SQL telemetry storage.
                    </p>
                </div>
                <button @click="refreshAll"
                    class="inline-flex items-center justify-center rounded bg-zinc-200 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-300 dark:bg-neutral-800 dark:text-gray-300 dark:hover:bg-neutral-700">
                    <ArrowPathIcon class="mr-2 h-4 w-4" :class="{ 'animate-spin': isRefreshing }" />
                    Refresh
                </button>
            </div>

            <div v-if="adminStore.backupStatus" class="rounded border px-4 py-3 text-sm"
                :class="adminStore.backupStatus.type === 'success'
                    ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/30 dark:text-green-200'
                    : 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-200'">
                {{ adminStore.backupStatus.message }}
            </div>

            <div v-if="authNotice"
                class="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                {{ authNotice }}
            </div>

            <!-- Local backup and restore -->
            <section class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div class="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                    <div class="mb-4 flex items-start justify-between gap-4">
                        <div>
                            <h4 class="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-gray-300">Local Backup</h4>
                            <p class="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                                Download a ZIP containing MongoDB documents and SQL telemetry rows.
                            </p>
                        </div>
                        <CircleStackIcon class="h-6 w-6 text-primary" />
                    </div>
                    <button @click="adminStore.downloadBackup" :disabled="adminStore.backupLoading.download"
                        class="rounded bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60">
                        {{ adminStore.backupLoading.download ? 'Preparing...' : 'Download Backup' }}
                    </button>
                </div>

                <div class="rounded-lg border border-red-200 bg-white p-5 shadow-sm dark:border-red-900/60 dark:bg-neutral-800">
                    <div class="mb-4">
                        <h4 class="text-sm font-bold uppercase tracking-wider text-red-700 dark:text-red-300">Restore Backup</h4>
                        <p class="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                            Restore replaces database content and puts the server into maintenance mode while it runs.
                        </p>
                    </div>
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <input ref="restoreInput" type="file" accept=".zip,application/zip" @change="handleRestoreFileChange"
                            class="block w-full text-sm text-zinc-700 file:mr-4 file:rounded file:border-0 file:bg-zinc-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-300 dark:text-gray-300 dark:file:bg-neutral-700 dark:file:text-gray-200 dark:hover:file:bg-neutral-600" />
                        <button @click="restoreSelectedBackup" :disabled="!selectedRestoreFile || adminStore.backupLoading.restore"
                            class="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                            {{ adminStore.backupLoading.restore ? 'Restoring...' : 'Restore' }}
                        </button>
                    </div>
                </div>
            </section>

            <!-- R2 settings and actions -->
            <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div class="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 xl:col-span-2">
                    <div class="mb-4 flex items-center justify-between">
                        <div>
                            <h4 class="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-gray-300">R2 Configuration</h4>
                            <p class="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                                Environment values take precedence when the server reports an override.
                            </p>
                        </div>
                        <CloudArrowUpIcon class="h-6 w-6 text-primary" />
                    </div>

                    <div v-if="adminStore.backupLoading.settings && !adminStore.r2Settings" class="text-sm italic text-zinc-500 dark:text-gray-500">
                        Loading R2 settings...
                    </div>

                    <form v-else class="space-y-4" @submit.prevent="saveR2Settings">
                        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label class="space-y-1">
                                <span class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">
                                    Endpoint
                                    <EnvBadge v-if="adminStore.r2Settings?.endpointFromEnv" />
                                </span>
                                <input v-model.trim="r2Form.endpoint" type="url" placeholder="https://account.r2.cloudflarestorage.com"
                                    class="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-primary focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200" />
                            </label>

                            <label class="space-y-1">
                                <span class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">
                                    Bucket
                                    <EnvBadge v-if="adminStore.r2Settings?.bucketFromEnv" />
                                </span>
                                <input v-model.trim="r2Form.bucket" type="text" placeholder="backup-bucket"
                                    class="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-primary focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200" />
                            </label>

                            <label class="space-y-1">
                                <span class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">
                                    Access Key ID
                                    <EnvBadge v-if="adminStore.r2Settings?.accessKeyIdFromEnv" />
                                </span>
                                <input v-model.trim="r2Form.accessKeyId" type="text" :placeholder="adminStore.r2Settings?.accessKeyIdMasked || 'R2 access key ID'"
                                    class="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-primary focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200" />
                            </label>

                            <label class="space-y-1">
                                <span class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">
                                    Schedule Cron
                                    <EnvBadge v-if="adminStore.r2Settings?.scheduleFromEnv" />
                                </span>
                                <input v-model.trim="r2Form.scheduleCron" type="text" placeholder="0 2 * * *"
                                    class="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-primary focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200" />
                            </label>
                        </div>

                        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label class="space-y-1">
                                <span class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">
                                    Secret Access Key
                                    <EnvBadge v-if="adminStore.r2Settings?.secretFromEnv" />
                                </span>
                                <input v-model="r2Form.secretAccessKey" type="password" autocomplete="new-password"
                                    :placeholder="adminStore.r2Settings?.secretAccessKeyConfigured ? 'Configured; leave blank to keep' : 'Not configured'"
                                    class="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-primary focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200" />
                                <p class="text-xs text-zinc-500 dark:text-gray-500">Blank keeps the current secret unless clear is selected.</p>
                            </label>

                            <div class="space-y-3">
                                <label class="flex items-center gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-neutral-700">
                                    <input v-model="r2Form.enabled" type="checkbox"
                                        class="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary" />
                                    <span class="text-sm text-zinc-800 dark:text-gray-200">
                                        Enable scheduled R2 backups
                                        <EnvBadge v-if="adminStore.r2Settings?.enabledFromEnv" class="ml-2" />
                                    </span>
                                </label>
                                <label class="flex items-center gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-neutral-700">
                                    <input v-model="clearStoredSecret" type="checkbox"
                                        class="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-600" />
                                    <span class="text-sm text-zinc-800 dark:text-gray-200">Clear DB-stored secret on save</span>
                                </label>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-3">
                            <button type="submit" :disabled="adminStore.backupLoading.saveSettings"
                                class="rounded bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60">
                                {{ adminStore.backupLoading.saveSettings ? 'Saving...' : 'Save R2 Settings' }}
                            </button>
                            <button type="button" @click="loadR2Settings" :disabled="adminStore.backupLoading.settings"
                                class="rounded bg-zinc-200 px-4 py-2 text-sm text-zinc-800 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-700 dark:text-gray-200 dark:hover:bg-neutral-600">
                                Reload Settings
                            </button>
                        </div>
                    </form>
                </div>

                <div class="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                    <h4 class="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-gray-300">R2 Operations</h4>
                    <p class="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                        Test bucket connectivity or upload a full backup immediately.
                    </p>
                    <div class="mt-5 space-y-3">
                        <button @click="adminStore.testR2Connectivity" :disabled="adminStore.backupLoading.test"
                            class="w-full rounded bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-700 dark:text-gray-200 dark:hover:bg-neutral-600">
                            {{ adminStore.backupLoading.test ? 'Testing...' : 'Test Connectivity' }}
                        </button>
                        <button @click="adminStore.runR2BackupNow" :disabled="adminStore.backupLoading.run"
                            class="w-full rounded bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60">
                            {{ adminStore.backupLoading.run ? 'Running...' : 'Run R2 Backup Now' }}
                        </button>
                    </div>
                </div>
            </section>

            <!-- Database stats -->
            <section class="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-neutral-700">
                    <div>
                        <h4 class="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-gray-300">Database Size</h4>
                        <p class="mt-1 text-sm text-zinc-600 dark:text-gray-400">SQL telemetry storage summary and estimated size per car.</p>
                    </div>
                    <button @click="adminStore.fetchSqlStatsByCar" :disabled="adminStore.backupLoading.sqlStats"
                        class="rounded bg-zinc-200 p-2 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-700 dark:hover:bg-neutral-600">
                        <ArrowPathIcon class="h-4 w-4 text-zinc-600 dark:text-gray-300" :class="{ 'animate-spin': adminStore.backupLoading.sqlStats }" />
                    </button>
                </div>

                <div v-if="adminStore.backupLoading.sqlStats && !adminStore.sqlStats" class="px-5 py-6 text-sm italic text-zinc-500 dark:text-gray-500">
                    Loading database stats...
                </div>

                <div v-else class="p-5">
                    <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
                        <MetricCard label="Dialect" :value="adminStore.sqlStats?.database?.dialect || '-'" />
                        <MetricCard label="Physical Size" :value="adminStore.sqlStats?.database?.physicalSizeHuman || 'Unavailable'" />
                        <MetricCard label="Data Points" :value="formatNumber(adminStore.sqlStats?.database?.totalDataPoints)" />
                        <MetricCard label="Cars" :value="formatNumber(adminStore.sqlStats?.database?.totalCars)" />
                    </div>

                    <div v-if="adminStore.sqlStats?.database?.warning"
                        class="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                        {{ adminStore.sqlStats.database.warning }}
                    </div>

                    <div class="overflow-x-auto rounded border border-zinc-200 dark:border-neutral-700">
                        <table class="min-w-full divide-y divide-zinc-200 dark:divide-neutral-700">
                            <thead class="bg-zinc-100 dark:bg-neutral-900">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Car</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Car ID</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Data Points</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Estimated Size</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Share</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-200 bg-white text-sm dark:divide-neutral-700 dark:bg-neutral-800">
                                <tr v-for="car in adminStore.sqlStats?.cars || []" :key="car.carId">
                                    <td class="px-4 py-3 text-zinc-900 dark:text-white">{{ carLabel(car.carId) }}</td>
                                    <td class="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-gray-400">{{ car.carId }}</td>
                                    <td class="px-4 py-3 text-right font-mono text-zinc-800 dark:text-gray-200">{{ formatNumber(car.dataPoints) }}</td>
                                    <td class="px-4 py-3 text-right font-mono text-zinc-800 dark:text-gray-200">{{ car.estimatedPhysicalSizeHuman || 'Unavailable' }}</td>
                                    <td class="px-4 py-3 text-right font-mono text-zinc-800 dark:text-gray-200">{{ formatPercent(car.shareOfDataPointsPercent) }}</td>
                                </tr>
                                <tr v-if="!adminStore.sqlStats?.cars?.length">
                                    <td colspan="5" class="px-4 py-6 text-center italic text-zinc-500 dark:text-gray-500">No SQL telemetry stats available.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <!-- R2 logs -->
            <section class="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                <div class="flex flex-col gap-3 border-b border-zinc-200 px-5 py-4 dark:border-neutral-700 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h4 class="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-gray-300">R2 Backup Logs</h4>
                        <p class="mt-1 text-sm text-zinc-600 dark:text-gray-400">Scheduled, manual, and connectivity test results.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <select v-model.number="logLimit" @change="goToFirstLogPage"
                            class="rounded border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200">
                            <option :value="25">25</option>
                            <option :value="50">50</option>
                            <option :value="100">100</option>
                        </select>
                        <button @click="loadR2Logs" :disabled="adminStore.backupLoading.logs"
                            class="rounded bg-zinc-200 p-2 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-700 dark:hover:bg-neutral-600">
                            <ArrowPathIcon class="h-4 w-4 text-zinc-600 dark:text-gray-300" :class="{ 'animate-spin': adminStore.backupLoading.logs }" />
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-zinc-200 dark:divide-neutral-700">
                        <thead class="bg-zinc-100 dark:bg-neutral-900">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Source</th>
                                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Status</th>
                                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Object Key</th>
                                <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Uploaded</th>
                                <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-gray-400">Error</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-200 bg-white text-sm dark:divide-neutral-700 dark:bg-neutral-800">
                            <tr v-for="log in adminStore.r2Logs" :key="log.id">
                                <td class="px-4 py-3 whitespace-nowrap text-zinc-700 dark:text-gray-300">{{ formatDate(log.createdAt) }}</td>
                                <td class="px-4 py-3 whitespace-nowrap font-mono text-xs text-zinc-700 dark:text-gray-300">{{ log.source }}</td>
                                <td class="px-4 py-3 whitespace-nowrap">
                                    <span class="rounded-full px-2 py-1 text-xs font-semibold"
                                        :class="log.status === 'success'
                                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'">
                                        {{ log.status }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 max-w-xs truncate font-mono text-xs text-zinc-700 dark:text-gray-300" :title="log.objectKey || '-'">
                                    {{ log.objectKey || '-' }}
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-right font-mono text-zinc-700 dark:text-gray-300">
                                    {{ formatBytes(log.bytesUploaded) }}
                                </td>
                                <td class="px-4 py-3 max-w-sm truncate text-zinc-600 dark:text-gray-400" :title="log.errorMessage || ''">
                                    {{ log.errorMessage || '-' }}
                                </td>
                            </tr>
                            <tr v-if="!adminStore.r2Logs.length">
                                <td colspan="6" class="px-4 py-6 text-center italic text-zinc-500 dark:text-gray-500">No R2 logs available.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="flex items-center justify-between border-t border-zinc-200 px-5 py-4 text-sm text-zinc-600 dark:border-neutral-700 dark:text-gray-400">
                    <span>{{ logRangeLabel }}</span>
                    <div class="flex gap-2">
                        <button @click="previousLogPage" :disabled="logOffset === 0 || adminStore.backupLoading.logs"
                            class="rounded bg-zinc-200 px-3 py-1 text-zinc-800 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-700 dark:text-gray-200 dark:hover:bg-neutral-600">
                            Previous
                        </button>
                        <button @click="nextLogPage" :disabled="!hasNextLogPage || adminStore.backupLoading.logs"
                            class="rounded bg-zinc-200 px-3 py-1 text-zinc-800 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-700 dark:text-gray-200 dark:hover:bg-neutral-600">
                            Next
                        </button>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup>
/**
 * @description Admin backup and database management tab.
 *
 * The component keeps form-only state locally and delegates API calls to the
 * admin store so auth headers, loading flags, and shared admin state stay in
 * one place.
 */
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue'
import {
    ArrowPathIcon,
    CircleStackIcon,
    CloudArrowUpIcon
} from '@heroicons/vue/24/outline'
import { useAdminStore } from '../../stores/admin'

const adminStore = useAdminStore()

/** @brief File selected for local database restore. */
const selectedRestoreFile = ref(null)
/** @brief Restore input reference used to clear the picker after success. */
const restoreInput = ref(null)
/** @brief Current R2 log page size. */
const logLimit = ref(50)
/** @brief Current R2 log offset. */
const logOffset = ref(0)
/** @brief Whether the initial refresh is still in progress. */
const isRefreshing = ref(false)
/** @brief Authentication/session notice for blocked admin fetches. */
const authNotice = ref('')
/** @brief Explicit request to clear the stored R2 secret on save. */
const clearStoredSecret = ref(false)

/** @brief Local editable copy of R2 settings. */
const r2Form = reactive({
    endpoint: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    scheduleCron: '',
    enabled: false
})

/**
 * @brief Small badge shown beside fields controlled by environment variables.
 */
const EnvBadge = defineComponent({
    name: 'EnvBadge',
    setup() {
        return () => h('span', {
            class: 'rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        }, 'Env')
    }
})

/**
 * @brief Reusable metric card for database summary values.
 */
const MetricCard = defineComponent({
    name: 'MetricCard',
    props: {
        label: { type: String, required: true },
        value: { type: [String, Number], required: true }
    },
    setup(props) {
        return () => h('div', {
            class: 'rounded border border-zinc-200 bg-zinc-50 p-4 dark:border-neutral-700 dark:bg-neutral-900'
        }, [
            h('div', {
                class: 'text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400'
            }, props.label),
            h('div', {
                class: 'mt-1 break-words font-mono text-xl text-zinc-900 dark:text-white'
            }, String(props.value))
        ])
    }
})

onMounted(() => {
    refreshAll()
})

watch(() => adminStore.r2Settings, (settings) => {
    if (!settings) return

    r2Form.endpoint = settings.endpoint || ''
    r2Form.bucket = settings.bucket || ''
    r2Form.accessKeyId = ''
    r2Form.secretAccessKey = ''
    r2Form.scheduleCron = settings.scheduleCron || ''
    r2Form.enabled = Boolean(settings.enabled)
    clearStoredSecret.value = false
}, { immediate: true })

/** @brief Map of Mongo user IDs to friendly car labels for SQL-only car IDs. */
const userLabelsById = computed(() => {
    return adminStore.users.reduce((labels, user) => {
        const id = user.id || user._id
        if (!id) return labels

        const number = user.number ? `#${user.number} ` : ''
        const team = user.team ? ` (${user.team})` : ''
        labels[id] = `${number}${user.car || 'Unknown Car'}${team}`
        return labels
    }, {})
})

/** @brief True when another page of R2 logs is available. */
const hasNextLogPage = computed(() => {
    return logOffset.value + logLimit.value < adminStore.r2LogsMeta.total
})

/** @brief Human-readable range label for the current R2 log page. */
const logRangeLabel = computed(() => {
    const total = adminStore.r2LogsMeta.total
    if (!total) return '0 logs'

    const start = logOffset.value + 1
    const end = Math.min(logOffset.value + adminStore.r2Logs.length, total)
    return `${start}-${end} of ${total} logs`
})

/**
 * @brief Refresh all backup and database data required by the tab.
 * @returns {Promise<void>}
 */
async function refreshAll() {
    isRefreshing.value = true
    try {
        authNotice.value = ''
        await Promise.all([
            loadR2Settings(),
            loadR2Logs(),
            adminStore.fetchSqlStatsByCar(),
            adminStore.users.length ? Promise.resolve() : adminStore.fetchUsers()
        ])
    } finally {
        isRefreshing.value = false
    }
}

/**
 * @brief Fetch R2 settings through the admin store.
 * @returns {Promise<void>}
 */
async function loadR2Settings() {
    await adminStore.fetchR2Settings()
}

/**
 * @brief Fetch the current R2 log page.
 * @returns {Promise<void>}
 */
async function loadR2Logs() {
    await adminStore.fetchR2Logs({ limit: logLimit.value, offset: logOffset.value })
}

/**
 * @brief Capture the backup ZIP selected for restore.
 * @param {Event} event - File input change event
 */
function handleRestoreFileChange(event) {
    selectedRestoreFile.value = event.target.files?.[0] || null
}

/**
 * @brief Confirm and restore the selected local backup ZIP.
 * @returns {Promise<void>}
 */
async function restoreSelectedBackup() {
    if (!selectedRestoreFile.value) return

    const confirmed = window.confirm('Restore will replace database content and enable maintenance mode while it runs. Continue?')
    if (!confirmed) return

    const result = await adminStore.restoreBackup(selectedRestoreFile.value)
    if (result.success) {
        selectedRestoreFile.value = null
        if (restoreInput.value) restoreInput.value.value = ''
        await adminStore.fetchSqlStatsByCar()
    }
}

/**
 * @brief Save R2 settings, omitting the secret unless the admin entered or clears it.
 * @returns {Promise<void>}
 */
async function saveR2Settings() {
    const payload = {
        endpoint: r2Form.endpoint,
        bucket: r2Form.bucket,
        scheduleCron: r2Form.scheduleCron,
        enabled: r2Form.enabled
    }

    if (r2Form.accessKeyId) {
        payload.accessKeyId = r2Form.accessKeyId
    }

    // A blank secret normally means "keep current"; only send blank when the
    // admin explicitly asks the server to clear the DB-stored secret.
    if (clearStoredSecret.value) {
        payload.secretAccessKey = ''
    } else if (r2Form.secretAccessKey) {
        payload.secretAccessKey = r2Form.secretAccessKey
    }

    const result = await adminStore.updateR2Settings(payload)
    if (result.success) {
        r2Form.secretAccessKey = ''
        clearStoredSecret.value = false
    }
}

/**
 * @brief Return friendly car label when a SQL car ID maps to a loaded user.
 * @param {string} carId - SQL telemetry car ID
 * @returns {string} Friendly car name or fallback
 */
function carLabel(carId) {
    return userLabelsById.value[carId] || 'Unknown Car'
}

/**
 * @brief Format dates for logs in the local admin timezone.
 * @param {string|number|Date} value - Date-like value
 * @returns {string} Localised date/time or placeholder
 */
function formatDate(value) {
    if (!value) return '-'

    return new Date(value).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    })
}

/**
 * @brief Format byte counts for log rows.
 * @param {number|null|undefined} bytes - Raw byte count
 * @returns {string} Human-readable size
 */
function formatBytes(bytes) {
    if (bytes === undefined || bytes === null || Number.isNaN(Number(bytes))) return '-'
    if (Number(bytes) === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(Math.floor(Math.log(Number(bytes)) / Math.log(k)), sizes.length - 1)
    return `${(Number(bytes) / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
}

/**
 * @brief Format integer-style values with locale separators.
 * @param {number|null|undefined} value - Numeric value
 * @returns {string} Formatted number or placeholder
 */
function formatNumber(value) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return '-'
    return Number(value).toLocaleString()
}

/**
 * @brief Format a numeric percentage.
 * @param {number|null|undefined} value - Percentage value
 * @returns {string} Percentage text
 */
function formatPercent(value) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return '-'
    return `${Number(value).toFixed(1)}%`
}

/**
 * @brief Load the first R2 log page after page-size changes.
 */
function goToFirstLogPage() {
    logOffset.value = 0
    loadR2Logs()
}

/**
 * @brief Move to the previous page of R2 logs.
 */
function previousLogPage() {
    logOffset.value = Math.max(0, logOffset.value - logLimit.value)
    loadR2Logs()
}

/**
 * @brief Move to the next page of R2 logs when available.
 */
function nextLogPage() {
    if (!hasNextLogPage.value) return

    logOffset.value += logLimit.value
    loadR2Logs()
}
</script>
