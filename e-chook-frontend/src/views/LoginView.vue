<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'

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
</script>

<template>
  <div class="flex items-center justify-center min-h-screen bg-neutral-900">
    <div class="w-full max-w-md p-8 bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700">
      <h2 class="text-3xl font-bold mb-6 text-center text-primary">Login</h2>
      
      <div v-if="error" class="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm text-center">
        {{ error }}
      </div>

      <form @submit.prevent="handleLogin" class="space-y-5">
        <div>
          <label class="block mb-2 text-sm font-medium text-gray-400">Car Name</label>
          <input 
            v-model="car" 
            type="text" 
            required
            class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition" 
            placeholder="Enter your Car Name"
          >
        </div>
        <div>
          <label class="block mb-2 text-sm font-medium text-gray-400">Password</label>
          <input 
            v-model="password" 
            type="password" 
            required
            class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
            placeholder="••••••••"
          >
        </div>
        
        <button 
          type="submit" 
          :disabled="isLoading"
          class="w-full bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition transform active:scale-95"
        >
          {{ isLoading ? 'Authenticating...' : 'Enter Dashboard' }}
        </button>

        <div class="text-center text-sm text-gray-500 mt-4">
          Need a vehicle? <router-link to="/register" class="text-primary hover:underline">Register New Car</router-link>
        </div>
      </form>
    </div>
  </div>
</template>
