<!--
  @file components/tabs/SettingsTab.vue
  @brief User settings and account management component.
  @description Comprehensive settings panel with category sidebar navigation for
               account management, display preferences, analytics tuning, and API access.
-->
<script setup>
/**
 * @description Settings Tab component.
 * 
 * Features:
 * - Account profile editing with email verification
 * - Display/unit settings (speed, temperature units)
 * - Graph visibility and dashboard preferences
 * - API credentials display (ID, GET URL, WebSocket URL)
 * - Settings export/import functionality
 * - Public opt-out toggle for telemetry visibility
 * 
 * Account changes require OTP verification via email.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTelemetryStore } from '../../stores/telemetry'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import ConfirmationModal from '../ui/ConfirmationModal.vue'
import { Switch, SwitchGroup, SwitchLabel, Menu, MenuButton, MenuItems, MenuItem, Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from '@headlessui/vue'
import {
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  EllipsisVerticalIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  InformationCircleIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
  PaintBrushIcon,
  ChartBarIcon,
  CodeBracketIcon
} from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const auth = useAuthStore()
const settings = useSettingsStore()
const router = useRouter()

/** @brief File input ref for settings import */
const fileInput = ref(null)

const downloadSettings = () => {
  const data = JSON.stringify(settings.$state, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().split('T')[0]
  link.href = url
  link.download = `${date}.echook_settings`
  link.click()
  URL.revokeObjectURL(url)
}

const triggerFileLoad = () => {
  fileInput.value.click()
}

const handleFileLoad = (event) => {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result)
      const result = settings.importSettings(json)
      if (!result.success) {
        showMessage('Invalid Settings File', result.errors.join(' '), 'error')
        return
      }
      showMessage('Success', 'Settings imported successfully.', 'success')
    } catch (err) {
      console.error('Failed to load settings file', err)
      showMessage('Invalid Settings File', 'Unable to parse the selected file as valid JSON.', 'error')
    } finally {
      event.target.value = ''
    }
  }
  reader.readAsText(file)
}

// Account
// Account Form
const isSaving = ref(false)
const form = ref({
  car: '',
  number: '',
  team: '',
  email: '',
  publicOptOut: false
})

// Initialize form from auth store
import { watchEffect } from 'vue'
watchEffect(() => {
  if (auth.user) {
    form.value.car = auth.user.car || ''
    form.value.number = auth.user.number || ''
    form.value.team = auth.user.team || ''
    form.value.email = auth.user.email || ''
    form.value.publicOptOut = auth.user.publicOptOut || false
  }
})

const saveProfile = async () => {
  isSaving.value = true
  const res = await auth.requestVerificationCode()
  isSaving.value = false

  if (res.success) {
    isVerificationModalOpen.value = true
    verificationError.value = ''
    verificationCode.value = ''
  } else {
    showMessage('Request Failed', 'Failed to request code: ' + res.error, 'error')
  }
}

// Verification Modal
const isVerificationModalOpen = ref(false)
const verificationCode = ref('')
const verificationError = ref('')
const isVerifying = ref(false)

const submitVerification = async () => {
  if (!verificationCode.value || verificationCode.value.length < 6) {
    verificationError.value = 'Please enter a valid 6-digit code.'
    return
  }

  isVerifying.value = true
  const updateData = { ...form.value, code: verificationCode.value }

  const res = await auth.updateProfile(updateData)
  isVerifying.value = false

  if (res.success) {
    isVerificationModalOpen.value = false
    showMessage('Success', 'Profile updated successfully!', 'success')
  } else {
    verificationError.value = res.error
  }
}

// Message Modal
const isMessageModalOpen = ref(false)
const messageTitle = ref('')
const messageBody = ref('')
const messageType = ref('info') // success, error, info

const showMessage = (title, message, type = 'info') => {
  messageTitle.value = title
  messageBody.value = message
  messageType.value = type
  isMessageModalOpen.value = true
}

// Copied states
const copiedId = ref(false)
const copiedGet = ref(false)

const handleCopy = async (text, type) => {
  try {
    await navigator.clipboard.writeText(text)
    if (type === 'id') {
      copiedId.value = true
      setTimeout(() => copiedId.value = false, 2000)
    } else if (type === 'get') {
      copiedGet.value = true
      setTimeout(() => copiedGet.value = false, 2000)
    }
  } catch (err) {
    console.error('Failed to copy keys', err)
  }
}

// URLs
import { API_BASE_URL, WS_URL } from '../../config'
import { getPublicLatestTelemetryPath } from '../../constants/accessPolicy'
const apiUrl = computed(() => `${API_BASE_URL}${getPublicLatestTelemetryPath(auth.user ? auth.user.id : ':id')}`)
const wsUrl = WS_URL

/** @brief Options for the appearance (theme) control. */
const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' }
]

/** @brief Currently selected settings category panel. */
const activeCategory = ref('account')

/** @brief Sidebar category definitions for grouped settings navigation. */
const categories = [
  { id: 'account', label: 'Account', icon: UserCircleIcon },
  { id: 'display', label: 'Display', icon: PaintBrushIcon },
  { id: 'analytics', label: 'Analytics', icon: ChartBarIcon },
  { id: 'api', label: 'API', icon: CodeBracketIcon }
]

/**
 * @brief Shared classes for a category nav button.
 * @param {string} categoryId - Category id to compare against activeCategory
 * @returns {string}
 */
function categoryNavButtonClass(categoryId) {
  const isActive = activeCategory.value === categoryId
  return [
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap',
    'md:w-full md:border-l-2',
    isActive
      ? 'border-primary bg-primary/10 text-primary md:bg-primary/5'
      : 'border-transparent text-zinc-600 dark:text-gray-400 hover:bg-zinc-200/80 dark:hover:bg-neutral-800 hover:text-zinc-900 dark:hover:text-white'
  ].join(' ')
}

/** @brief Shared styling for event-threshold reset icon buttons. */
const eventThresholdResetButtonClass =
  'shrink-0 p-1.5 rounded-md text-zinc-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-zinc-50 dark:focus:ring-offset-neutral-900'

/** @brief Confirmation modal for deleting all server telemetry. */
const isDeleteAllTelemetryModalOpen = ref(false)
const deleteAllTelemetryCode = ref('')
const deleteAllTelemetryError = ref('')

/** @brief Confirmation modal for deleting telemetry within a date range. */
const isDeleteRangeTelemetryModalOpen = ref(false)
const deleteRangeStartDate = ref('')
const deleteRangeEndDate = ref('')
const deleteRangeTelemetryCode = ref('')
const deleteRangeTelemetryError = ref('')

const isDeletingTelemetry = ref(false)
const isRequestingDeleteCode = ref(false)

/** @brief Confirmation modal for deleting the entire account. */
const isDeleteAccountModalOpen = ref(false)
const deleteAccountCode = ref('')
const deleteAccountError = ref('')
const isDeletingAccount = ref(false)

/**
 * @brief Convert inclusive UTC calendar dates (YYYY-MM-DD) to epoch millisecond bounds.
 * @param {string} fromDate - First UTC day to include
 * @param {string} toDate - Last UTC day to include
 * @returns {{ startMs: number, endMs: number }}
 */
function utcDateRangeToMillis(fromDate, toDate) {
  const [startYear, startMonth, startDay] = fromDate.split('-').map(Number)
  const [endYear, endMonth, endDay] = toDate.split('-').map(Number)
  const startMs = Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0)
  const endMs = Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999)
  return { startMs, endMs }
}

/**
 * @brief Whether a verification code looks complete enough to submit.
 * @param {string} code - User-entered OTP
 * @returns {boolean}
 */
function isValidVerificationCode(code) {
  return Boolean(code && code.length >= 6)
}

/**
 * @brief Request an email verification code before opening a destructive-action modal.
 * @returns {Promise<boolean>} True when the code was sent successfully
 */
async function requestDeleteVerificationCode() {
  isRequestingDeleteCode.value = true
  const result = await auth.requestVerificationCode()
  isRequestingDeleteCode.value = false

  if (result.success) {
    return true
  }

  showMessage('Request Failed', `Failed to request verification code: ${result.error}`, 'error')
  return false
}

/**
 * @brief Open delete-all-telemetry confirmation modal.
 */
async function openDeleteAllTelemetryModal() {
  const codeSent = await requestDeleteVerificationCode()
  if (!codeSent) return

  deleteAllTelemetryCode.value = ''
  deleteAllTelemetryError.value = ''
  isDeleteAllTelemetryModalOpen.value = true
}

/**
 * @brief Open delete-range-telemetry confirmation modal.
 */
async function openDeleteRangeTelemetryModal() {
  const codeSent = await requestDeleteVerificationCode()
  if (!codeSent) return

  deleteRangeStartDate.value = ''
  deleteRangeEndDate.value = ''
  deleteRangeTelemetryCode.value = ''
  deleteRangeTelemetryError.value = ''
  isDeleteRangeTelemetryModalOpen.value = true
}

/**
 * @brief Delete all server-stored telemetry for this car.
 */
async function confirmDeleteAllTelemetry() {
  if (!isValidVerificationCode(deleteAllTelemetryCode.value)) {
    deleteAllTelemetryError.value = 'Please enter the 6-digit verification code from your email.'
    return
  }

  isDeletingTelemetry.value = true
  const result = await auth.deleteTelemetry(deleteAllTelemetryCode.value)
  isDeletingTelemetry.value = false

  if (result.success) {
    isDeleteAllTelemetryModalOpen.value = false
    telemetry.clearHistory()
    showMessage('Telemetry Deleted', result.message || 'All server-stored telemetry for your car has been removed.', 'success')
    return
  }

  deleteAllTelemetryError.value = result.error
}

/**
 * @brief Delete server-stored telemetry between two inclusive UTC calendar dates.
 */
async function confirmDeleteRangeTelemetry() {
  if (!deleteRangeStartDate.value || !deleteRangeEndDate.value) {
    deleteRangeTelemetryError.value = 'Choose both a start date and an end date.'
    return
  }

  if (deleteRangeEndDate.value < deleteRangeStartDate.value) {
    deleteRangeTelemetryError.value = 'End date must be on or after the start date.'
    return
  }

  if (!isValidVerificationCode(deleteRangeTelemetryCode.value)) {
    deleteRangeTelemetryError.value = 'Please enter the 6-digit verification code from your email.'
    return
  }

  isDeletingTelemetry.value = true
  const result = await auth.deleteTelemetryRange(
    deleteRangeTelemetryCode.value,
    deleteRangeStartDate.value,
    deleteRangeEndDate.value
  )
  isDeletingTelemetry.value = false

  if (result.success) {
    isDeleteRangeTelemetryModalOpen.value = false
    const { startMs, endMs } = utcDateRangeToMillis(deleteRangeStartDate.value, deleteRangeEndDate.value)
    telemetry.removeHistoryInRange(startMs, endMs)
    showMessage('Telemetry Deleted', result.message || 'Selected telemetry has been removed from the server.', 'success')
    return
  }

  deleteRangeTelemetryError.value = result.error
}

/**
 * @brief Open delete-account confirmation modal.
 */
async function openDeleteAccountModal() {
  const codeSent = await requestDeleteVerificationCode()
  if (!codeSent) return

  deleteAccountCode.value = ''
  deleteAccountError.value = ''
  isDeleteAccountModalOpen.value = true
}

/**
 * @brief Permanently delete account and associated server data.
 */
async function confirmDeleteAccount() {
  if (!isValidVerificationCode(deleteAccountCode.value)) {
    deleteAccountError.value = 'Please enter the 6-digit verification code from your email.'
    return
  }

  isDeletingAccount.value = true
  const result = await auth.deleteAccount(deleteAccountCode.value)
  isDeletingAccount.value = false

  if (result.success) {
    isDeleteAccountModalOpen.value = false
    router.push('/login')
    return
  }

  deleteAccountError.value = result.error
}

</script>

<template>
  <div class="h-full overflow-y-auto bg-zinc-100 text-zinc-700 dark:bg-neutral-900 dark:text-gray-300 p-6">
    <div class="max-w-4xl mx-auto space-y-8">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h2>

        <Menu as="div" class="relative">
          <MenuButton
            class="p-2 hover:bg-zinc-200 dark:hover:bg-neutral-800 rounded-lg transition-colors text-zinc-500 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white">
            <EllipsisVerticalIcon class="w-6 h-6" />
          </MenuButton>

          <Transition enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0" enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in" leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0">
            <MenuItems
              class="absolute right-0 mt-2 w-56 origin-top-right divide-y divide-zinc-200 dark:divide-neutral-700 rounded-xl bg-white dark:bg-neutral-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/5 focus:outline-none z-50">
              <div class="px-1 py-1">
                <MenuItem v-slot="{ active }">
                  <button @click="downloadSettings" :class="[
                    active ? 'bg-primary text-white' : 'text-zinc-700 dark:text-gray-300',
                    'group flex w-full items-center rounded-lg px-3 py-2 text-sm'
                  ]">
                    <ArrowDownTrayIcon class="mr-2 h-5 w-5" />
                    Download Settings
                  </button>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                  <button @click="triggerFileLoad" :class="[
                    active ? 'bg-primary text-white' : 'text-zinc-700 dark:text-gray-300',
                    'group flex w-full items-center rounded-lg px-3 py-2 text-sm'
                  ]">
                    <ArrowUpTrayIcon class="mr-2 h-5 w-5" />
                    Load Settings
                  </button>
                </MenuItem>
              </div>
            </MenuItems>
          </Transition>
        </Menu>

        <!-- Hidden File Input -->
        <input type="file" ref="fileInput" class="hidden" accept=".echook_settings,application/json"
          @change="handleFileLoad" />
      </div>

      <!-- Category sidebar + content panels -->
      <div class="flex flex-col md:flex-row gap-6">
        <nav
          class="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible shrink-0 md:w-44 pb-1 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0"
          aria-label="Settings categories">
          <button v-for="category in categories" :key="category.id" type="button"
            :class="categoryNavButtonClass(category.id)"
            :aria-current="activeCategory === category.id ? 'page' : undefined" @click="activeCategory = category.id">
            <component :is="category.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            {{ category.label }}
          </button>
        </nav>

        <div class="flex-1 min-w-0 space-y-8">
          <!-- Account panel -->
          <div v-show="activeCategory === 'account'" class="space-y-8">

            <!-- Account Section -->
            <section
              class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-zinc-200 dark:border-neutral-700">
              <h3
                class="text-lg font-semibold text-zinc-900 dark:text-white mb-2 border-b border-zinc-200 dark:border-neutral-700 pb-2">
                Account</h3>
              <p class="text-xs text-zinc-500 dark:text-gray-500 mb-4">
                Account and telemetry policies:
                <router-link to="/privacy" class="text-primary hover:underline">Privacy Policy</router-link>,
                <router-link to="/data-management" class="text-primary hover:underline">Data Management
                  Policy</router-link>.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Car Name -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Car
                    Name</label>
                  <input v-model="form.car" type="text"
                    class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Enter car name..." />
                </div>
                <!-- Car Number -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Car
                    Number</label>
                  <input v-model="form.number" type="text"
                    class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Enter car number..." />
                </div>
                <!-- Team Name -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Team
                    Name</label>
                  <input v-model="form.team" type="text"
                    class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Enter team name..." />
                </div>
                <!-- Email -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Email</label>
                  <input v-model="form.email" type="email"
                    class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="Enter email address..." />
                </div>

                <!-- Opt-Out Toggle -->
                <div class="col-span-1 md:col-span-2">
                  <SwitchGroup>
                    <div class="flex items-center justify-between">
                      <div class="flex flex-col">
                        <SwitchLabel class="text-sm font-medium text-zinc-700 dark:text-gray-300">Spectator View Opt-Out
                        </SwitchLabel>
                        <span class="text-sm text-zinc-500 dark:text-gray-500 mt-1">
                          {{ form.publicOptOut ? 'Opted Out :(' : 'Opted In :)' }}
                        </span>
                        <span class="text-xs text-zinc-500 dark:text-gray-500 mt-1 max-w-lg">
                          If there are three or more cars opted in on the same known track, their speed and location
                          will be
                          visible in the public spectator view. This is no more than would be visible to a spectator at
                          the
                          track. (We'd really appreciate it if you don't opt out!)
                        </span>
                      </div>
                      <Switch v-model="form.publicOptOut"
                        :class="form.publicOptOut ? 'bg-red-900 ring-1 ring-red-500' : 'bg-zinc-300 dark:bg-neutral-600'"
                        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-100 dark:focus:ring-offset-neutral-900">
                        <span :class="form.publicOptOut ? 'translate-x-6' : 'translate-x-1'"
                          class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                      </Switch>
                    </div>
                  </SwitchGroup>
                </div>
              </div>

              <!-- Account Actions -->
              <div class="mt-6 flex space-x-4 border-t border-zinc-200 dark:border-neutral-700 pt-4">
                <button @click="saveProfile" :disabled="isSaving"
                  class="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded transition text-sm font-bold flex items-center">
                  <ArrowPathIcon v-if="isSaving" class="mr-2 h-4 w-4 animate-spin" />
                  {{ isSaving ? 'Saving...' : 'Save Changes' }}
                </button>
                <div class="flex-1"></div>
                <button
                  class="px-4 py-2 bg-zinc-200 dark:bg-neutral-700 hover:bg-zinc-300 dark:hover:bg-neutral-600 text-zinc-900 dark:text-white rounded transition text-sm font-medium">
                  Change Password
                </button>
                <button
                  class="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-900 rounded transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="isRequestingDeleteCode || isDeletingAccount" @click="openDeleteAccountModal">
                  Delete Account
                </button>
              </div>
            </section>

            <!-- Server telemetry data -->
            <section class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-red-900/30">
              <h3
                class="text-lg font-semibold text-zinc-900 dark:text-white mb-2 border-b border-zinc-200 dark:border-neutral-700 pb-2">
                Server Telemetry Data
              </h3>
              <p class="text-sm text-zinc-600 dark:text-gray-400">
                Remove telemetry stored on eChook Server for your car. Deletions are permanent and cannot be undone.
              </p>
              <div class="mt-5 pt-5 border-t border-zinc-200 dark:border-neutral-700 flex flex-wrap gap-3">
                <button type="button" @click="openDeleteAllTelemetryModal"
                  :disabled="isRequestingDeleteCode || isDeletingTelemetry"
                  class="px-5 py-2.5 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-900 rounded-lg transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  Delete All Telemetry
                </button>
                <button type="button" @click="openDeleteRangeTelemetryModal"
                  :disabled="isRequestingDeleteCode || isDeletingTelemetry"
                  class="px-5 py-2.5 bg-red-900/30 hover:bg-red-900/60 text-red-200 border border-red-900/70 rounded-lg transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  Delete Date Range
                </button>
              </div>
              <p class="mt-5 pt-4 border-t border-zinc-200 dark:border-neutral-700 text-sm text-zinc-600 dark:text-gray-400">
                See the <router-link to="/data-management" class="text-primary hover:underline">Data Management Policy</router-link>.
              </p>
            </section>

            <!-- Storage Info -->
            <div class="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-start space-x-3">
              <InformationCircleIcon class="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div class="text-xs text-zinc-600 dark:text-gray-400 leading-relaxed">
                <p class="font-bold text-zinc-800 dark:text-gray-300 mb-1 uppercase tracking-wider">Browser Storage</p>
                Unit, visual, and performance settings are saved automatically to your browser's local storage
                for this device.
                Use the menu at the top to download a backup file or load settings on a different machine.
              </div>
            </div>

          </div>

          <!-- Display panel -->
          <div v-show="activeCategory === 'display'" class="space-y-8">

            <!-- Appearance: light / dark / system -->
            <section
              class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-zinc-200 dark:border-neutral-700">
              <h3
                class="text-lg font-semibold text-zinc-900 dark:text-white mb-2 border-b border-zinc-200 dark:border-neutral-700 pb-2">
                Appearance</h3>
              <p class="text-sm text-zinc-600 dark:text-gray-400 mb-4">
                Light, dark, or Auto to follow your device theme.
              </p>
              <div class="flex flex-wrap gap-3" role="group" aria-label="Theme">
                <button v-for="opt in themeOptions" :key="opt.value" type="button"
                  @click="settings.themeMode = opt.value"
                  class="px-4 py-2 rounded-lg border text-sm font-medium transition" :class="settings.themeMode === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 hover:border-primary/50'">
                  {{ opt.label }}
                </button>
              </div>
              <p v-if="settings.themeMode === 'system'" class="text-xs text-zinc-500 dark:text-gray-500 mt-3">
                Currently using <span class="font-semibold">{{ settings.resolvedTheme }}</span> from your system
                preference.
              </p>
            </section>

            <!-- Units -->
            <section
              class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-zinc-200 dark:border-neutral-700">
              <h3
                class="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-200 dark:border-neutral-700 pb-2">
                Units</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Speed -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Speed
                    Unit</label>
                  <select v-model="settings.unitSettings.speedUnit"
                    class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                    <option value="mph">Miles per Hour (mph)</option>
                    <option value="kph">Kilometers per Hour (km/h)</option>
                    <option value="ms">Meters per Second (m/s)</option>
                  </select>
                </div>

                <!-- Temperature -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Temperature
                    Unit</label>
                  <select v-model="settings.unitSettings.tempUnit"
                    class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                    <option value="c">Celsius (°C)</option>
                    <option value="f">Fahrenheit (°F)</option>
                  </select>
                </div>
              </div>
            </section>

            <!-- Performance -->
            <section
              class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-zinc-200 dark:border-neutral-700">
              <h3
                class="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-200 dark:border-neutral-700 pb-2">
                Performance and Visuals</h3>

              <div class="space-y-6">
                <!-- Max History -->
                <div>
                  <div class="flex justify-between mb-2">
                    <label class="text-sm font-medium text-zinc-700 dark:text-gray-300">Max History Points</label>
                    <span class="text-sm font-mono text-primary">{{ settings.maxHistoryPoints.toLocaleString() }}</span>
                  </div>
                  <input type="range" v-model.number="settings.maxHistoryPoints" min="5000" max="50000" step="1000"
                    class="w-full h-2 bg-zinc-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
                  <p class="text-xs text-zinc-500 dark:text-gray-500 mt-1">Lower values improve performance on slower
                    devices. (Default: 50,000)
                  </p>
                </div>



                <!-- Graph Height -->
                <div>
                  <div class="flex justify-between mb-2">
                    <label class="text-sm font-medium text-zinc-700 dark:text-gray-300">Graph Height</label>
                    <span class="text-sm font-mono text-primary">{{ settings.graphSettings.graphHeight }}px</span>
                  </div>
                  <input type="range" v-model.number="settings.graphSettings.graphHeight" min="200" max="800" step="10"
                    class="w-full h-2 bg-zinc-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
                </div>

                <!-- Toggles -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                  <!-- Animations -->
                  <SwitchGroup>
                    <div class="flex items-center">
                      <SwitchLabel class="mr-4 text-sm font-medium text-zinc-700 dark:text-gray-300 w-32">Graph
                        Animations</SwitchLabel>
                      <Switch v-model="settings.graphSettings.showAnimations"
                        :class="settings.graphSettings.showAnimations ? 'bg-primary' : 'bg-zinc-300 dark:bg-neutral-600'"
                        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-100 dark:focus:ring-offset-neutral-900">
                        <span :class="settings.graphSettings.showAnimations ? 'translate-x-6' : 'translate-x-1'"
                          class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                      </Switch>
                    </div>
                  </SwitchGroup>

                  <!-- Lap Highlights -->
                  <SwitchGroup>
                    <div class="flex items-center">
                      <SwitchLabel class="mr-4 text-sm font-medium text-zinc-700 dark:text-gray-300 w-32">Lap Highlights
                      </SwitchLabel>
                      <Switch v-model="settings.graphSettings.showLapHighlights"
                        :class="settings.graphSettings.showLapHighlights ? 'bg-primary' : 'bg-zinc-300 dark:bg-neutral-600'"
                        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-100 dark:focus:ring-offset-neutral-900">
                        <span :class="settings.graphSettings.showLapHighlights ? 'translate-x-6' : 'translate-x-1'"
                          class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                      </Switch>
                    </div>
                  </SwitchGroup>



                  <!-- Grid -->
                  <SwitchGroup>
                    <div class="flex items-center">
                      <SwitchLabel class="mr-4 text-sm font-medium text-zinc-700 dark:text-gray-300 w-32">Show Grid
                      </SwitchLabel>
                      <Switch v-model="settings.graphSettings.showGrid"
                        :class="settings.graphSettings.showGrid ? 'bg-primary' : 'bg-zinc-300 dark:bg-neutral-600'"
                        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-100 dark:focus:ring-offset-neutral-900">
                        <span :class="settings.graphSettings.showGrid ? 'translate-x-6' : 'translate-x-1'"
                          class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                      </Switch>
                    </div>
                  </SwitchGroup>
                </div>

                <!-- Shortcuts Button -->
                <div class="pt-4 border-t border-zinc-200 dark:border-neutral-700 mt-4 flex justify-end">
                  <button @click="settings.showShortcutsModal = true"
                    class="px-4 py-2 bg-zinc-200 dark:bg-neutral-700 hover:bg-zinc-300 dark:hover:bg-neutral-600 text-zinc-900 dark:text-white rounded transition text-sm font-medium flex items-center">
                    <InformationCircleIcon class="w-4 h-4 mr-2" />
                    View Keyboard Shortcuts
                  </button>
                </div>
              </div>
            </section>

          </div>

          <!-- Analytics panel -->
          <div v-show="activeCategory === 'analytics'" class="space-y-8">

            <!-- Event thresholds (all users) -->
            <section
              class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-zinc-200 dark:border-neutral-700">
              <div
                class="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-neutral-700 pb-2 mb-2">
                <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">Event Thresholds</h3>
                <button type="button" :class="eventThresholdResetButtonClass"
                  title="Reset all event thresholds to defaults" aria-label="Reset all event thresholds to defaults"
                  @click="settings.resetAllEventThresholds()">
                  <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                </button>
              </div>
              <p class="text-sm text-zinc-600 dark:text-gray-400 mb-6">
                Warning and critical levels used when detecting analytics events. Grouped by telemetry type.
              </p>
              <div class="space-y-5">
                <!-- Voltage -->
                <div
                  class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50/80 dark:bg-neutral-900/40 p-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Voltage</h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-xs text-zinc-600 dark:text-gray-400">Warning (V)</span>
                        <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                          aria-label="Reset voltage warning to default"
                          @click="settings.resetEventThreshold('eventUndervoltageWarningV')">
                          <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                        </button>
                      </div>
                      <input v-model.number="settings.analyticsSettings.eventUndervoltageWarningV" type="number"
                        step="0.1"
                        class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    <div>
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-xs text-zinc-600 dark:text-gray-400">Critical (V)</span>
                        <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                          aria-label="Reset voltage critical to default"
                          @click="settings.resetEventThreshold('eventUndervoltageCriticalV')">
                          <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                        </button>
                      </div>
                      <input v-model.number="settings.analyticsSettings.eventUndervoltageCriticalV" type="number"
                        step="0.1"
                        class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                  </div>
                </div>

                <!-- Temperature -->
                <div
                  class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50/80 dark:bg-neutral-900/40 p-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Temperature</h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-xs text-zinc-600 dark:text-gray-400">Warning (°C)</span>
                        <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                          aria-label="Reset temperature warning to default"
                          @click="settings.resetEventThreshold('eventOverTempWarningC')">
                          <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                        </button>
                      </div>
                      <input v-model.number="settings.analyticsSettings.eventOverTempWarningC" type="number" step="0.5"
                        class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    <div>
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-xs text-zinc-600 dark:text-gray-400">Critical (°C)</span>
                        <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                          aria-label="Reset temperature critical to default"
                          @click="settings.resetEventThreshold('eventOverTempCriticalC')">
                          <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                        </button>
                      </div>
                      <input v-model.number="settings.analyticsSettings.eventOverTempCriticalC" type="number" step="0.5"
                        class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                  </div>
                </div>

                <!-- Current -->
                <div
                  class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50/80 dark:bg-neutral-900/40 p-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Current</h4>
                  <p class="text-xs text-zinc-500 dark:text-gray-500 mb-3">
                    Uses absolute current draw (|A|), not packet-to-packet current change.
                  </p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-xs text-zinc-600 dark:text-gray-400">High current warning (A)</span>
                        <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                          aria-label="Reset current spike warning to default"
                          @click="settings.resetEventThreshold('eventCurrentSpikeWarningA')">
                          <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                        </button>
                      </div>
                      <input v-model.number="settings.analyticsSettings.eventCurrentSpikeWarningA" type="number"
                        step="1"
                        class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    <div>
                      <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-xs text-zinc-600 dark:text-gray-400">High current critical (A)</span>
                        <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                          aria-label="Reset current spike critical to default"
                          @click="settings.resetEventThreshold('eventCurrentSpikeCriticalA')">
                          <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                        </button>
                      </div>
                      <input v-model.number="settings.analyticsSettings.eventCurrentSpikeCriticalA" type="number"
                        step="1"
                        class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                  </div>
                </div>

                <!-- Telemetry dropout -->
                <div
                  class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50/80 dark:bg-neutral-900/40 p-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Telemetry dropout</h4>
                  <div>
                    <div class="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <span class="text-xs text-zinc-600 dark:text-gray-400">Gap threshold (s)</span>
                        <span class="block text-zinc-500 dark:text-gray-500 font-normal mt-0.5">Alert when no packets
                          arrive for this long between samples</span>
                      </div>
                      <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                        aria-label="Reset telemetry dropout threshold to default"
                        @click="settings.resetEventThreshold('eventDropoutWarningSec')">
                        <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                      </button>
                    </div>
                    <input v-model.number="settings.analyticsSettings.eventDropoutWarningSec" type="number" step="1"
                      class="w-full max-w-xs bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                </div>

                <!-- Driver input -->
                <div
                  class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-zinc-50/80 dark:bg-neutral-900/40 p-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Throttle and brake overlap
                  </h4>
                  <div>
                    <div class="flex items-center justify-between gap-2 mb-1">
                      <span class="text-xs text-zinc-600 dark:text-gray-400">Minimum overlap duration (s)</span>
                      <button type="button" :class="eventThresholdResetButtonClass" title="Reset to default"
                        aria-label="Reset throttle and brake overlap duration to default"
                        @click="settings.resetEventThreshold('eventOverlapWarningSec')">
                        <ArrowPathIcon class="h-4 w-4 -scale-x-100" aria-hidden="true" />
                      </button>
                    </div>
                    <input v-model.number="settings.analyticsSettings.eventOverlapWarningSec" type="number" step="0.1"
                      class="w-full max-w-xs bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                </div>
              </div>
            </section>

            <!-- Analytics controls (admin only) -->
            <section v-if="auth.isAdmin"
              class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-zinc-200 dark:border-neutral-700">
              <h3
                class="text-lg font-semibold text-zinc-900 dark:text-white mb-2 border-b border-zinc-200 dark:border-neutral-700 pb-2">
                Analytics Controls</h3>
              <p class="text-sm text-zinc-600 dark:text-gray-400 mb-6">
                Advanced analytics configuration. Visible to administrators only while the Analytics tab is in preview.
              </p>
              <div class="space-y-6">
                <div>
                  <div class="flex justify-between mb-2">
                    <label class="text-sm font-medium text-zinc-700 dark:text-gray-300">Live Window</label>
                    <span class="text-sm font-mono text-primary">{{ settings.analyticsSettings.liveWindowMinutes }}
                      min</span>
                  </div>
                  <input type="range" v-model.number="settings.analyticsSettings.liveWindowMinutes" min="1" max="120"
                    step="1"
                    class="w-full h-2 bg-zinc-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
                  <p class="text-xs text-zinc-500 dark:text-gray-500 mt-1">
                    Legacy setting kept for import compatibility. Live Analytics uses the current laps race session
                    start instead.
                  </p>
                </div>

                <div>
                  <div class="flex justify-between mb-2">
                    <label class="text-sm font-medium text-zinc-700 dark:text-gray-300">Throttle Overlap
                      Threshold</label>
                    <span class="text-sm font-mono text-primary">{{
                      settings.analyticsSettings.throttleOverlapThresholdPct.toFixed(1) }}%</span>
                  </div>
                  <input type="range" v-model.number="settings.analyticsSettings.throttleOverlapThresholdPct" min="0"
                    max="100" step="0.5"
                    class="w-full h-2 bg-zinc-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
                  <p class="text-xs text-zinc-500 dark:text-gray-500 mt-1">
                    Minimum throttle level used when detecting throttle + brake overlap events.
                  </p>
                </div>

                <div>
                  <div class="flex justify-between mb-2">
                    <label class="text-sm font-medium text-zinc-700 dark:text-gray-300">Race Start Current
                      Threshold</label>
                    <span class="text-sm font-mono text-primary">{{
                      settings.analyticsSettings.startCurrentThresholdA.toFixed(1) }} A</span>
                  </div>
                  <input type="range" v-model.number="settings.analyticsSettings.startCurrentThresholdA" min="0"
                    max="200" step="1"
                    class="w-full h-2 bg-zinc-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
                  <p class="text-xs text-zinc-500 dark:text-gray-500 mt-1">
                    Current level that can trigger race-start detection when speed packets are sparse.
                  </p>
                </div>

                <div class="border-t border-zinc-200 dark:border-neutral-700 pt-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Battery Pack (Analytics)</h4>
                  <p class="text-xs text-zinc-500 dark:text-gray-500 mb-3">
                    Nominal and ideal pack ratings used for depth-of-discharge, Peukert, and state-of-health on the
                    Battery tab. Set ideal capacity below your measured or aged pack rating when it differs from
                    nominal.
                  </p>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Pack nominal capacity (Ah)
                      <input v-model.number="settings.analyticsSettings.packNominalCapacityAh" type="number" min="1"
                        step="0.5"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Pack ideal capacity (Ah)
                      <input v-model.number="settings.analyticsSettings.packActualCapacityAh" type="number" min="1"
                        step="0.5"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                      <span class="block mt-1 text-[11px] text-zinc-500 dark:text-gray-500">Ideal capacity for pack and
                        per-battery DoD/SoH (series string: same Ah as pack).</span>
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Pack nominal series voltage (V)
                      <input v-model.number="settings.analyticsSettings.packNominalSeriesVoltage" type="number" min="6"
                        step="0.5"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Peukert exponent
                      <input v-model.number="settings.analyticsSettings.peukertExponent" type="number" min="1" max="2.5"
                        step="0.001"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                  </div>
                </div>

                <div class="border-t border-zinc-200 dark:border-neutral-700 pt-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Internal Resistance (IR v2)
                  </h4>
                  <p class="text-xs text-zinc-500 dark:text-gray-500 mb-3">
                    Controls resistance fit segmentation and RC polarization correction. IR charts use Net Ah on the
                    x-axis.
                  </p>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Current deadband (A)
                      <input v-model.number="settings.analyticsSettings.irCurrentDeadbandA" type="number" min="0"
                        max="20" step="0.1"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      RC polarization tau (s)
                      <input v-model.number="settings.analyticsSettings.irRcTauSec" type="number" min="1" max="600"
                        step="1"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      RC resistance scale (0–1)
                      <input v-model.number="settings.analyticsSettings.irRcResistanceScale" type="number" min="0"
                        max="1" step="0.05"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                  </div>
                </div>

                <div class="border-t border-zinc-200 dark:border-neutral-700 pt-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Lap Confidence and Filtering
                  </h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Confidence Min Lap Time (s)
                      <input v-model.number="settings.analyticsSettings.lapConfidenceMinTimeSec" type="number" min="1"
                        step="0.5"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Confidence Max Lap Time (s)
                      <input v-model.number="settings.analyticsSettings.lapConfidenceMaxTimeSec" type="number" min="1"
                        step="1"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">
                      Minimum Included Lap Time (s)
                      <input v-model.number="settings.analyticsSettings.minimumLapTimeSec" type="number" min="0"
                        step="0.1"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <div class="text-xs text-zinc-600 dark:text-gray-400 space-y-2">
                      <label class="flex items-center gap-2">
                        <input v-model="settings.analyticsSettings.hideSuspectLaps" type="checkbox"
                          class="rounded border-zinc-300 dark:border-neutral-700" />
                        Hide suspect laps
                      </label>
                      <label class="flex items-center gap-2">
                        <input v-model="settings.analyticsSettings.hideInvalidLaps" type="checkbox"
                          class="rounded border-zinc-300 dark:border-neutral-700" />
                        Hide invalid laps
                      </label>
                      <label class="flex items-center gap-2">
                        <input v-model="settings.analyticsSettings.excludeFirstLap" type="checkbox"
                          class="rounded border-zinc-300 dark:border-neutral-700" />
                        Exclude first lap
                      </label>
                    </div>
                  </div>
                </div>

                <div class="border-t border-zinc-200 dark:border-neutral-700 pt-4">
                  <h4 class="text-sm font-semibold text-zinc-800 dark:text-gray-200 mb-3">Analytics UX</h4>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label class="text-xs text-zinc-600 dark:text-gray-400">Manual Start Offset (s)
                      <input v-model.number="settings.analyticsSettings.manualStartOffsetSec" type="number" min="0"
                        step="1"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <label class="text-xs text-zinc-600 dark:text-gray-400">Auto-collapse Start Card (s)
                      <input v-model.number="settings.analyticsSettings.autoCollapseStartCardSec" type="number" min="0"
                        step="1"
                        class="mt-1 w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                    </label>
                    <div class="text-xs text-zinc-600 dark:text-gray-400 space-y-2 mt-1">
                      <label class="flex items-center gap-2">
                        <input v-model="settings.analyticsSettings.enableSideBySideHistoryCompare" type="checkbox"
                          class="rounded border-zinc-300 dark:border-neutral-700" />
                        Enable side-by-side history compare
                      </label>
                      <label class="flex items-center gap-2">
                        <input v-model="settings.analyticsSettings.baselineRequireTrackMatch" type="checkbox"
                          class="rounded border-zinc-300 dark:border-neutral-700" />
                        Prefer same-track baseline
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </div>

          <!-- API panel -->
          <div v-show="activeCategory === 'api'" class="space-y-8">

            <!-- API Section -->
            <section
              class="bg-white/90 dark:bg-neutral-800/50 rounded-lg p-6 border border-zinc-200 dark:border-neutral-700">
              <h3
                class="text-lg font-semibold text-zinc-900 dark:text-white mb-4 border-b border-zinc-200 dark:border-neutral-700 pb-2">
                API Access</h3>

              <div class="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                <ExclamationTriangleIcon class="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p class="text-sm text-zinc-700 dark:text-gray-300 leading-relaxed">
                  Anyone with your Car ID can access live telemetry through the API. Only share it with people on your team who need it, and treat it like a credential.
                </p>
              </div>

              <div class="space-y-6">
                <!-- Car ID -->
                <div v-if="auth.user?.id">
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Car ID</label>
                  <div class="flex space-x-2">
                    <input type="text" readonly :value="auth.user.id"
                      class="flex-1 bg-zinc-100 dark:bg-neutral-900 text-zinc-600 dark:text-gray-400 font-mono text-sm px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:outline-none" />
                    <button @click="handleCopy(auth.user.id, 'id')"
                      class="px-3 py-2 bg-zinc-200 dark:bg-neutral-700 hover:bg-zinc-300 dark:hover:bg-neutral-600 rounded text-zinc-900 dark:text-white transition flex items-center">
                      <ClipboardDocumentCheckIcon v-if="copiedId" class="w-5 h-5 text-green-400" />
                      <ClipboardDocumentIcon v-else class="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <!-- GET API -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Get Live Data
                    (Polling)</label>
                  <p class="text-xs text-zinc-600 dark:text-gray-400 mb-2">GET API to retrieve the latest live data
                    packet.</p>
                  <div class="flex space-x-2">
                    <input type="text" readonly :value="apiUrl"
                      class="flex-1 bg-zinc-100 dark:bg-neutral-900 text-primary font-mono text-sm px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:outline-none" />
                    <button @click="handleCopy(apiUrl, 'get')"
                      class="px-3 py-2 bg-zinc-200 dark:bg-neutral-700 hover:bg-zinc-300 dark:hover:bg-neutral-600 rounded text-zinc-900 dark:text-white transition flex items-center">
                      <ClipboardDocumentCheckIcon v-if="copiedGet" class="w-5 h-5 text-green-400" />
                      <ClipboardDocumentIcon v-else class="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <!-- WebSocket Guide -->
                <div>
                  <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Get Live Data
                    (WebSockets)</label>
                  <p class="text-xs text-zinc-600 dark:text-gray-400 mb-2">Example for Node.js using Socket.io.</p>
                  <div
                    class="bg-zinc-100 dark:bg-neutral-900 rounded border border-zinc-300 dark:border-neutral-700 p-4 text-sm font-mono text-zinc-700 dark:text-gray-300 overflow-x-auto space-y-4">
                    <div>
                      <span class="text-zinc-500 dark:text-gray-500">// 1. Connect and Join Room</span><br />
                      <span class="text-purple-400">const</span> socket = <span class="text-blue-400">io</span>(<span
                        class="text-green-400">'{{ wsUrl }}'</span>);<br />
                      socket.<span class="text-blue-400">emit</span>(<span class="text-green-400">'join'</span>, <span
                        class="text-green-400">'{{ auth.user?.id || "YOUR_CAR_ID" }}'</span>);
                    </div>
                    <div>
                      <span class="text-zinc-500 dark:text-gray-500">// 2. Listen for Data</span><br />
                      socket.<span class="text-blue-400">on</span>(<span class="text-green-400">'data'</span>, (packet)
                      =>
                      {<br />
                      &nbsp;&nbsp;<span class="text-blue-400">console</span>.log(packet); <br />
                      });
                    </div>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>

    </div>

    <!-- Verification Modal -->
    <TransitionRoot appear :show="isVerificationModalOpen" as="template">
      <Dialog as="div" @close="isVerificationModalOpen = false" class="relative z-50">
        <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0" enter-to="opacity-100"
          leave="duration-200 ease-in" leave-from="opacity-100" leave-to="opacity-0">
          <div class="fixed inset-0 bg-black/75" />
        </TransitionChild>

        <div class="fixed inset-0 overflow-y-auto">
          <div class="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0 scale-95"
              enter-to="opacity-100 scale-100" leave="duration-200 ease-in" leave-from="opacity-100 scale-100"
              leave-to="opacity-0 scale-95">
              <DialogPanel
                class="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-neutral-800 p-6 text-left align-middle shadow-xl transition-all border border-zinc-200 dark:border-neutral-700">
                <DialogTitle as="h3" class="text-lg font-medium leading-6 text-zinc-900 dark:text-white mb-2">
                  Verify Account Update
                </DialogTitle>
                <div class="mt-2">
                  <p class="text-sm text-zinc-700 dark:text-gray-300 mb-4">
                    A 6-digit verification code has been sent to your email address. Please enter it below to confirm
                    your
                    changes. This code is valid for 10 minutes.
                  </p>

                  <div class="space-y-4">
                    <div>
                      <label
                        class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">Verification
                        Code</label>
                      <input v-model="verificationCode" type="text" maxlength="6"
                        class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none tracking-widest text-center text-lg font-mono"
                        placeholder="000000" />
                    </div>
                    <p v-if="verificationError" class="text-sm text-red-400 font-medium animate-pulse">
                      {{ verificationError }}
                    </p>
                  </div>
                </div>

                <div class="mt-6 flex justify-end space-x-3">
                  <button type="button"
                    class="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-gray-300 hover:text-zinc-900 dark:hover:text-white transition"
                    @click="isVerificationModalOpen = false">
                    Cancel
                  </button>
                  <button type="button"
                    class="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded transition text-sm font-bold flex items-center"
                    @click="submitVerification" :disabled="isVerifying">
                    <ArrowPathIcon v-if="isVerifying" class="mr-2 h-4 w-4 animate-spin" />
                    {{ isVerifying ? 'Verifying...' : 'Submit' }}
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </TransitionRoot>

    <!-- Message Modal -->
    <TransitionRoot appear :show="isMessageModalOpen" as="template">
      <Dialog as="div" @close="isMessageModalOpen = false" class="relative z-50">
        <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0" enter-to="opacity-100"
          leave="duration-200 ease-in" leave-from="opacity-100" leave-to="opacity-0">
          <div class="fixed inset-0 bg-black/75" />
        </TransitionChild>

        <div class="fixed inset-0 overflow-y-auto">
          <div class="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild as="template" enter="duration-300 ease-out" enter-from="opacity-0 scale-95"
              enter-to="opacity-100 scale-100" leave="duration-200 ease-in" leave-from="opacity-100 scale-100"
              leave-to="opacity-0 scale-95">
              <DialogPanel
                class="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white dark:bg-neutral-800 p-6 text-left align-middle shadow-xl transition-all border border-zinc-200 dark:border-neutral-700">
                <div class="flex items-center space-x-3 mb-4">
                  <div v-if="messageType === 'success'" class="p-2 bg-green-500/20 rounded-full">
                    <CheckCircleIcon class="w-6 h-6 text-green-500" />
                  </div>
                  <div v-else-if="messageType === 'error'" class="p-2 bg-red-500/20 rounded-full">
                    <XCircleIcon class="w-6 h-6 text-red-500" />
                  </div>
                  <div v-else class="p-2 bg-primary/20 rounded-full">
                    <InformationCircleIcon class="w-6 h-6 text-primary" />
                  </div>
                  <DialogTitle as="h3" class="text-lg font-medium leading-6 text-zinc-900 dark:text-white">
                    {{ messageTitle }}
                  </DialogTitle>
                </div>

                <div class="mt-2">
                  <p class="text-sm text-zinc-700 dark:text-gray-300">
                    {{ messageBody }}
                  </p>
                </div>

                <div class="mt-6 flex justify-end">
                  <button type="button"
                    class="px-4 py-2 bg-zinc-200 dark:bg-neutral-700 hover:bg-zinc-300 dark:hover:bg-neutral-600 text-zinc-900 dark:text-white rounded transition text-sm font-medium"
                    @click="isMessageModalOpen = false">
                    Close
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </TransitionRoot>

    <ConfirmationModal :is-open="isDeleteAllTelemetryModalOpen" title="Delete All Telemetry"
      message="A 6-digit verification code has been sent to your email. Enter it below to permanently remove all telemetry stored on eChook Server for your car. Your account will remain active."
      confirm-text="Delete All Telemetry" cancel-text="Cancel" confirm-button-class="bg-red-700 hover:bg-red-600"
      @close="isDeleteAllTelemetryModalOpen = false" @confirm="confirmDeleteAllTelemetry">
      <template #body>
        <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">
          Verification code
        </label>
        <input v-model="deleteAllTelemetryCode" type="text" maxlength="6" inputmode="numeric"
          autocomplete="one-time-code"
          class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary outline-none tracking-widest text-center font-mono"
          :disabled="isDeletingTelemetry" />
        <p v-if="deleteAllTelemetryError" class="mt-2 text-sm text-red-400 font-medium">
          {{ deleteAllTelemetryError }}
        </p>
      </template>
    </ConfirmationModal>

    <ConfirmationModal :is-open="isDeleteRangeTelemetryModalOpen" title="Delete Telemetry Date Range"
      message="A 6-digit verification code has been sent to your email. Choose UTC calendar dates (inclusive) and enter the code to permanently remove matching server telemetry. Your account will remain active."
      confirm-text="Delete Date Range" cancel-text="Cancel" confirm-button-class="bg-red-700 hover:bg-red-600"
      @close="isDeleteRangeTelemetryModalOpen = false" @confirm="confirmDeleteRangeTelemetry">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">
                From date (UTC)
              </label>
              <input v-model="deleteRangeStartDate" type="date"
                class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary outline-none"
                :disabled="isDeletingTelemetry" />
            </div>
            <div>
              <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">
                To date (UTC)
              </label>
              <input v-model="deleteRangeEndDate" type="date"
                class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary outline-none"
                :disabled="isDeletingTelemetry" />
            </div>
          </div>
          <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">
            Verification code
          </label>
          <input v-model="deleteRangeTelemetryCode" type="text" maxlength="6" inputmode="numeric"
            autocomplete="one-time-code"
            class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary outline-none tracking-widest text-center font-mono"
            :disabled="isDeletingTelemetry" />
          <p v-if="deleteRangeTelemetryError" class="text-sm text-red-400 font-medium">
            {{ deleteRangeTelemetryError }}
          </p>
        </div>
      </template>
    </ConfirmationModal>

    <ConfirmationModal :is-open="isDeleteAccountModalOpen" title="Delete Account"
      message="A 6-digit verification code has been sent to your email. Enter it below to permanently delete your account and all associated server data. This cannot be undone."
      confirm-text="Delete Account" cancel-text="Cancel" confirm-button-class="bg-red-700 hover:bg-red-600"
      @close="isDeleteAccountModalOpen = false" @confirm="confirmDeleteAccount">
      <template #body>
        <label class="block text-xs font-bold uppercase text-zinc-500 dark:text-gray-500 mb-1">
          Verification code
        </label>
        <input v-model="deleteAccountCode" type="text" maxlength="6" inputmode="numeric" autocomplete="one-time-code"
          class="w-full bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white px-3 py-2 rounded border border-zinc-300 dark:border-neutral-700 focus:border-primary outline-none tracking-widest text-center font-mono"
          :disabled="isDeletingAccount" />
        <p v-if="deleteAccountError" class="mt-2 text-sm text-red-400 font-medium">
          {{ deleteAccountError }}
        </p>
      </template>
    </ConfirmationModal>
  </div>
</template>
