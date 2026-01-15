<script setup>
import { computed, ref } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useAuthStore } from '../../stores/auth'
import { Switch, SwitchGroup, SwitchLabel } from '@headlessui/vue'
import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline'

const telemetry = useTelemetryStore()
const auth = useAuthStore()

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
      <div>
        <h2 class="text-2xl font-bold text-white mb-2">Settings</h2>
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

      <!-- Units -->
      <section class="bg-neutral-800/50 rounded-lg p-6 border border-neutral-700">
        <h3 class="text-lg font-semibold text-white mb-4 border-b border-neutral-700 pb-2">Units</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Speed -->
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Speed Unit</label>
            <select v-model="telemetry.unitSettings.speedUnit"
              class="w-full bg-neutral-900 text-white px-3 py-2 rounded border border-neutral-700 focus:border-primary focus:ring-1 focus:ring-primary outline-none">
              <option value="mph">Miles per Hour (mph)</option>
              <option value="kph">Kilometers per Hour (km/h)</option>
              <option value="ms">Meters per Second (m/s)</option>
            </select>
          </div>

          <!-- Temperature -->
          <div>
            <label class="block text-xs font-bold uppercase text-gray-500 mb-1">Temperature Unit</label>
            <select v-model="telemetry.unitSettings.tempUnit"
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
              <span class="text-sm font-mono text-primary">{{ telemetry.maxHistoryPoints.toLocaleString() }}</span>
            </div>
            <input type="range" v-model.number="telemetry.maxHistoryPoints" min="5000" max="50000" step="1000"
              class="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
            <p class="text-xs text-gray-500 mt-1">Lower values improve performance on slower devices. (Default: 50,000)
            </p>
          </div>

          <!-- Update Frequency -->
          <div>
            <div class="flex justify-between mb-2">
              <label class="text-sm font-medium text-gray-300">Chart Update Frequency</label>
              <span class="text-sm font-mono text-primary">{{ telemetry.graphSettings.chartUpdateFreq }} Hz</span>
            </div>
            <input type="range" v-model.number="telemetry.graphSettings.chartUpdateFreq" min="0.1" max="5" step="0.1"
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
              <span class="text-sm font-mono text-primary">{{ telemetry.graphSettings.graphHeight }}px</span>
            </div>
            <input type="range" v-model.number="telemetry.graphSettings.graphHeight" min="200" max="800" step="10"
              class="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary" />
          </div>

          <!-- Toggles -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <!-- Animations -->
            <SwitchGroup>
              <div class="flex items-center">
                <SwitchLabel class="mr-4 text-sm font-medium text-gray-300 w-32">Graph Animations</SwitchLabel>
                <Switch v-model="telemetry.graphSettings.showAnimations"
                  :class="telemetry.graphSettings.showAnimations ? 'bg-primary' : 'bg-neutral-600'"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <span :class="telemetry.graphSettings.showAnimations ? 'translate-x-6' : 'translate-x-1'"
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                </Switch>
              </div>
            </SwitchGroup>

            <!-- Lap Highlights -->
            <SwitchGroup>
              <div class="flex items-center">
                <SwitchLabel class="mr-4 text-sm font-medium text-gray-300 w-32">Lap Highlights</SwitchLabel>
                <Switch v-model="telemetry.graphSettings.showLapHighlights"
                  :class="telemetry.graphSettings.showLapHighlights ? 'bg-primary' : 'bg-neutral-600'"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <span :class="telemetry.graphSettings.showLapHighlights ? 'translate-x-6' : 'translate-x-1'"
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition" />
                </Switch>
              </div>
            </SwitchGroup>

            <!-- Grid -->
            <SwitchGroup>
              <div class="flex items-center">
                <SwitchLabel class="mr-4 text-sm font-medium text-gray-300 w-32">Show Grid</SwitchLabel>
                <Switch v-model="telemetry.graphSettings.showGrid"
                  :class="telemetry.graphSettings.showGrid ? 'bg-primary' : 'bg-neutral-600'"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-neutral-900">
                  <span :class="telemetry.graphSettings.showGrid ? 'translate-x-6' : 'translate-x-1'"
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
