<script setup>
import { computed, ref } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { Switch, SwitchGroup, SwitchLabel, Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue'
import {
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  EllipsisVerticalIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  InformationCircleIcon
} from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const auth = useAuthStore()
const settings = useSettingsStore()

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
      settings.importSettings(json)
    } catch (err) {
      console.error('Failed to load settings file', err)
    }
  }
  reader.readAsText(file)
}

// Account
const carName = computed(() => auth.user ? auth.user.car : 'Guest')
// Mock car number for now, or link to auth store if avail
const carNumber = computed({
  get: () => auth.user ? auth.user.number : '00',
  set: (val) => { /* No-op for now unless we add update endpoint */ }
})

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
const apiUrl = computed(() => `http://localhost:3000/api/get/${auth.user ? auth.user.id : ':id'}`)
const wsUrl = 'ws://localhost:3000'

</script>

<template>
  <div class="h-full overflow-y-auto bg-neutral-900 text-gray-300 p-6">
    <div class="max-w-4xl mx-auto space-y-8">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-white">Settings</h2>

        <Menu as="div" class="relative">
          <MenuButton class="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-gray-400 hover:text-white">
            <EllipsisVerticalIcon class="w-6 h-6" />
          </MenuButton>

          <Transition enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0" enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in" leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0">
            <MenuItems
              class="absolute right-0 mt-2 w-56 origin-top-right divide-y divide-neutral-700 rounded-xl bg-neutral-800 shadow-2xl ring-1 ring-white/5 focus:outline-none z-50">
              <div class="px-1 py-1">
                <MenuItem v-slot="{ active }">
                <button @click="downloadSettings" :class="[
                  active ? 'bg-primary text-white' : 'text-gray-300',
                  'group flex w-full items-center rounded-lg px-3 py-2 text-sm'
                ]">
                  <ArrowDownTrayIcon class="mr-2 h-5 w-5" />
                  Download Settings
                </button>
                </MenuItem>
                <MenuItem v-slot="{ active }">
                <button @click="triggerFileLoad" :class="[
                  active ? 'bg-primary text-white' : 'text-gray-300',
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

      <!-- Account Section -->
      <section class="bg-neutral-800/50 rounded-lg p-6 border border-neutral-700">
        <h3 class="text-lg font-semibold text-white mb-4 border-b border-neutral-700 pb-2">Account</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Car Name</label>
            <div
              class="text-white font-mono bg-neutral-900 px-3 py-2 rounded border border-neutral-700 opacity-75 cursor-not-allowed">
              {{ carName }}
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Car Number</label>
            <input v-model="carNumber" type="text"
              class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="Enter car number..." />
          </div>
        </div>

        <!-- Account Actions -->
        <div class="mt-6 flex space-x-4">
          <button
            class="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded transition text-sm font-medium">
            Change Password
          </button>
          <button
            class="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-900 rounded transition text-sm font-medium">
            Delete Account
          </button>
        </div>
      </section>

      <!-- Storage Info -->
      <div class="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-start space-x-3">
        <InformationCircleIcon class="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div class="text-xs text-gray-400 leading-relaxed">
          <p class="font-bold text-gray-300 mb-1 uppercase tracking-wider">Browser Storage</p>
          Unit, visual, and performance settings are saved automatically to your browser's local storage for this
          device.
          Use the menu at the top to download a backup file or load settings on a different machine.
        </div>
      </div>

      <!-- Units -->
      <section class="bg-neutral-800/50 rounded-lg p-6 border border-neutral-700">
        <h3 class="text-lg font-semibold text-white mb-4 border-b border-neutral-700 pb-2">Units</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Speed -->
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Speed Unit</label>
            <select v-model="settings.unitSettings.speedUnit"
              class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none">
              <option value="mph">Miles per Hour (mph)</option>
              <option value="kph">Kilometers per Hour (km/h)</option>
              <option value="ms">Meters per Second (m/s)</option>
            </select>
          </div>

          <!-- Temperature -->
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Temperature Unit</label>
            <select v-model="settings.unitSettings.tempUnit"
              class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none">
              <option value="c">Celsius (°C)</option>
              <option value="f">Fahrenheit (°F)</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Performance -->
      <section class="bg-neutral-800/50 rounded-lg p-6 border border-neutral-700">
        <h3 class="text-lg font-semibold text-white mb-4 border-b border-neutral-700 pb-2">Performance</h3>

        <div class="space-y-6">
          <!-- Max History -->
          <div>
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-300">Max History Points</label>
              <span class="text-sm font-mono text-primary">{{ settings.maxHistoryPoints.toLocaleString() }}</span>
            </div>
            <input type="range" v-model.number="settings.maxHistoryPoints" min="5000" max="50000" step="1000"
              class="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
            <p class="text-xs text-gray-500 mt-1">Lower values improve performance on slower devices. (Default: 50,000)
            </p>
          </div>

          <!-- Update Frequency -->
          <div>
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-300">Chart Update Frequency</label>
              <span class="text-sm font-mono text-primary">{{ settings.graphSettings.chartUpdateFreq }} Hz</span>
            </div>
            <input type="range" v-model.number="settings.graphSettings.chartUpdateFreq" min="0.1" max="5" step="0.1"
              class="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
            <p class="text-xs text-gray-500 mt-1">Controls how often the graphs redraw. Lower values (e.g. 1Hz)
              significantly reduce CPU usage. (Default: 5Hz)</p>
          </div>
        </div>
      </section>

      <!-- Graph Settings -->
      <section class="bg-neutral-800/50 rounded-lg p-6 border border-neutral-700">
        <h3 class="text-lg font-semibold text-white mb-4 border-b border-neutral-700 pb-2">Visuals</h3>

        <div class="space-y-6">
          <!-- Graph Height -->
          <div>
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-300">Graph Height</label>
              <span class="text-sm font-mono text-primary">{{ settings.graphSettings.graphHeight }}px</span>
            </div>
            <input type="range" v-model.number="settings.graphSettings.graphHeight" min="200" max="800" step="10"
              class="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
          </div>

          <!-- Toggles -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <!-- Animations -->
            <SwitchGroup>
              <div class="flex items-center">
                <SwitchLabel class="mr-4 text-sm font-medium text-gray-300 w-32">Graph Animations</SwitchLabel>
                <Switch v-model="settings.graphSettings.showAnimations"
                  :class="settings.graphSettings.showAnimations ? 'bg-primary' : 'bg-neutral-600'"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <span :class="settings.graphSettings.showAnimations ? 'translate-x-6' : 'translate-x-1'"
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                </Switch>
              </div>
            </SwitchGroup>

            <!-- Lap Highlights -->
            <SwitchGroup>
              <div class="flex items-center">
                <SwitchLabel class="mr-4 text-sm font-medium text-gray-300 w-32">Lap Highlights</SwitchLabel>
                <Switch v-model="settings.graphSettings.showLapHighlights"
                  :class="settings.graphSettings.showLapHighlights ? 'bg-primary' : 'bg-neutral-600'"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <span :class="settings.graphSettings.showLapHighlights ? 'translate-x-6' : 'translate-x-1'"
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                </Switch>
              </div>
            </SwitchGroup>

            <!-- Grid -->
            <SwitchGroup>
              <div class="flex items-center">
                <SwitchLabel class="mr-4 text-sm font-medium text-gray-300 w-32">Show Grid</SwitchLabel>
                <Switch v-model="settings.graphSettings.showGrid"
                  :class="settings.graphSettings.showGrid ? 'bg-primary' : 'bg-neutral-600'"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <span :class="settings.graphSettings.showGrid ? 'translate-x-6' : 'translate-x-1'"
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                </Switch>
              </div>
            </SwitchGroup>
          </div>
        </div>
      </section>



      <!-- API Section -->
      <section class="bg-neutral-800/50 rounded-lg p-6 border border-neutral-700">
        <h3 class="text-lg font-semibold text-white mb-4 border-b border-neutral-700 pb-2">API Access</h3>

        <div class="space-y-6">
          <!-- Car ID -->
          <div v-if="auth.user?.id">
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Car ID</label>
            <div class="flex space-x-2">
              <input type="text" readonly :value="auth.user.id"
                class="flex-1 bg-neutral-900 text-gray-400 font-mono text-sm px-3 py-2 rounded border border-neutral-700 focus:outline-none" />
              <button @click="handleCopy(auth.user.id, 'id')"
                class="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-white transition flex items-center">
                <ClipboardDocumentCheckIcon v-if="copiedId" class="w-5 h-5 text-green-400" />
                <ClipboardDocumentIcon v-else class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- GET API -->
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Get Live Data (Polling)</label>
            <p class="text-xs text-gray-400 mb-2">GET API to retrieve the latest live data packet.</p>
            <div class="flex space-x-2">
              <input type="text" readonly :value="apiUrl"
                class="flex-1 bg-neutral-900 text-primary font-mono text-sm px-3 py-2 rounded border border-neutral-700 focus:outline-none" />
              <button @click="handleCopy(apiUrl, 'get')"
                class="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-white transition flex items-center">
                <ClipboardDocumentCheckIcon v-if="copiedGet" class="w-5 h-5 text-green-400" />
                <ClipboardDocumentIcon v-else class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- WebSocket Guide -->
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Get Live Data (WebSockets)</label>
            <p class="text-xs text-gray-400 mb-2">Example for Node.js using Socket.io.</p>
            <div
              class="bg-neutral-900 rounded border border-neutral-700 p-4 text-sm font-mono text-gray-300 overflow-x-auto space-y-4">
              <div>
                <span class="text-gray-500">// 1. Connect and Join Room</span><br />
                <span class="text-purple-400">const</span> socket = <span class="text-blue-400">io</span>(<span
                  class="text-green-400">'{{ wsUrl }}'</span>);<br />
                socket.<span class="text-blue-400">emit</span>(<span class="text-green-400">'join'</span>, <span
                  class="text-green-400">'{{ auth.user?.id || "YOUR_CAR_ID" }}'</span>);
              </div>
              <div>
                <span class="text-gray-500">// 2. Listen for Data</span><br />
                socket.<span class="text-blue-400">on</span>(<span class="text-green-400">'data'</span>, (packet) =>
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
</template>
