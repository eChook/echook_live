<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'
import bgImage from '../assets/background.jpg'
import PublicHeader from '../components/PublicHeader.vue'
import { useSpectatorStore } from '../stores/spectator'
import { onMounted, onUnmounted } from 'vue'

const spectatorStore = useSpectatorStore()

onMounted(() => {
  spectatorStore.connectPublic()
})

onUnmounted(() => {
  spectatorStore.disconnectPublic()
})

const goToSpectate = (trackName) => {
  router.push(`/spectate/${encodeURIComponent(trackName)}`)
}

const car = ref('')
const password = ref('')
const error = ref('')
const isLoading = ref(false)
const auth = useAuthStore()
const router = useRouter()

const handleLogin = async () => {
  error.value = ''
  isLoading.value = true

  const result = await auth.login({
    car: car.value,
    password: password.value
  })

  isLoading.value = false

  if (result.success) {
    router.push('/')
  } else {
    error.value = result.error
  }
}

// Cookie Notice Logic
const showCookieNotice = ref(false)

onMounted(() => {
  spectatorStore.connectPublic()
  if (!localStorage.getItem('cookie_notice_accepted')) {
    showCookieNotice.value = true
  }
})

const acceptCookies = () => {
  localStorage.setItem('cookie_notice_accepted', 'true')
  showCookieNotice.value = false
}
</script>

<template>
  <div class="flex flex-col min-h-screen bg-neutral-900" :style="{
    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.1)), url(${bgImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }">
    <PublicHeader />
    <div class="flex-1 flex flex-col items-center justify-center pt-16 px-4">

      <!-- Welcome Card -->
      <div class="bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700 p-8 w-full max-w-4xl mb-8 text-center">
        <h2 class="text-2xl font-bold text-white mb-4">Welcome to the new eChook Live Telemetry Portal</h2>
        <p class="text-gray-300 mb-6 max-w-2xl mx-auto">
          This service is in beta and we hope to iron out any bugs before the season start. To that end, if you have any
          feedback, positive or negative, we'd really appreciate it.
        </p>
        <a href="https://forms.gle/gdL29NHoqkQCFUPw8" target="_blank"
          class="inline-block px-6 py-3 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white font-medium rounded-lg transition transform active:scale-95 text-sm">
          Give Feedback
        </a>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">

        <!-- Login Panel -->
        <div class="bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700 p-8">
          <h2 class="text-3xl font-bold mb-6 text-center text-primary">Login</h2>

          <div v-if="error"
            class="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm text-center">
            {{ error }}
          </div>

          <div v-if="auth.isAuthenticated" class="text-center py-8">
            <p class="text-gray-300 mb-6">
              You are currently logged in as <span class="text-primary font-bold">{{ auth.user?.carName ||
                auth.user?.car || 'Unknown' }}</span>.
            </p>
            <router-link to="/"
              class="inline-block w-full bg-primary hover:opacity-90 text-white font-bold py-3 rounded-lg transition transform active:scale-95">
              View Data
            </router-link>
            <button @click="auth.logout()" class="mt-4 text-sm text-gray-500 hover:text-white transition">
              Log Out
            </button>
          </div>

          <form v-else @submit.prevent="handleLogin" class="space-y-5">
            <div>
              <label class="block mb-2 text-sm font-medium text-gray-400">Car Name</label>
              <input v-model="car" type="text" required
                class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                placeholder="Enter your Car Name">
            </div>
            <div>
              <label class="block mb-2 text-sm font-medium text-gray-400">Password</label>
              <input v-model="password" type="password" required
                class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                placeholder="••••••••">
            </div>

            <button type="submit" :disabled="isLoading"
              class="w-full bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition transform active:scale-95">
              {{ isLoading ? 'Authenticating...' : 'Enter Dashboard' }}
            </button>

            <div class="text-center text-sm text-gray-500 mt-4">
              New in Town? <router-link to="/register" class="text-primary hover:underline">Register New
                Car</router-link>
            </div>
          </form>
        </div>

        <!-- Spectator Panel -->
        <div class="bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700 p-8 flex flex-col">
          <h2 class="text-3xl font-bold mb-6 text-center text-blue-400">Spectate</h2>
          <p class="text-gray-400 text-center mb-6 text-sm">A Birdseye View.</p>

          <div class="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            <div v-if="spectatorStore.activeTracks.length === 0"
              class="text-center py-10 text-gray-500 border-2 border-dashed border-neutral-700 rounded-lg">
              No races ongoing
            </div>

            <button v-for="track in spectatorStore.activeTracks" :key="track" @click="goToSpectate(track)"
              class="w-full p-4 bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-left transition flex justify-between items-center group">
              <span class="font-bold text-white group-hover:text-blue-400 transition">{{ track }}</span>
              <span class="text-xs px-2 py-1 bg-green-900 text-green-200 rounded-full animate-pulse">LIVE</span>
            </button>
          </div>

          <div class="mt-4 pt-4 border-t border-neutral-700 text-xs text-gray-500 text-center leading-relaxed">
            Spectate is available if 3 or more cars are at the same track, and shows competitors location and speed. Opt
            out is available in the settings tab.
          </div>
        </div>

      </div>

      <!-- What's New Section -->
      <div class="mt-8 bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700 p-8 w-full max-w-4xl">
        <h2 class="text-2xl font-bold text-white mb-6 border-b border-neutral-700 pb-4">What's New?</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-300 text-sm">
          <ul class="space-y-3">
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Completely rewritten UI</strong> and data management for better analysis.</span>
            </li>
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Data Retention</strong> - Your car data is stored by the server and history can be
                retrieved.</span>
            </li>
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Multiple synced graphs</strong> - Select and view multiple data points
                simultaneously.</span>
            </li>
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Lap Table</strong> - Detailed breakdown of each lap.</span>
            </li>
          </ul>
          <ul class="space-y-3">
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Map View</strong> - Live tracking with gradient trails showing a selectable metric.</span>
            </li>
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Settings</strong> - customizable UI and account settings.</span>
            </li>
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Status Monitoring</strong> - Real-time connection status for car and server.</span>
            </li>
            <li class="flex items-start">
              <span class="text-primary mr-2">+</span>
              <span><strong>Spectator Mode</strong> - Share a public Birdseye view of the race.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Cookie Notice -->
    <div v-if="showCookieNotice"
      class="fixed bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur border-t border-neutral-700 p-4 z-50 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl transition-all duration-300">
      <div class="text-sm text-gray-300 text-center md:text-left">
        <p>This website uses the bare minimum cookies required for functionality. No ads, no tracking.</p>
      </div>
      <button @click="acceptCookies"
        class="bg-primary hover:bg-primary/90 text-white font-bold py-2 px-6 rounded-lg text-sm transition transform active:scale-95 whitespace-nowrap">
        OK
      </button>
    </div>
  </div>
</template>
