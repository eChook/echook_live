<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'

const router = useRouter()
const auth = useAuthStore()

const formData = ref({
  car: '',
  password: '',
  team: '',
  number: null
})

const error = ref('')
const isLoading = ref(false)

const handleRegister = async () => {
  error.value = ''
  isLoading.value = true
  
  const result = await auth.register(formData.value)
  
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
      <h2 class="text-3xl font-bold mb-6 text-center text-teal-400">Register Car</h2>
      
      <div v-if="error" class="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm text-center">
        {{ error }}
      </div>

      <form @submit.prevent="handleRegister" class="space-y-4">
        <div>
          <label class="block mb-1 text-sm font-medium text-gray-400">Car Name (ID)</label>
          <input v-model="formData.car" type="text" required class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-teal-500 outline-none transition">
        </div>
        <div>
          <label class="block mb-1 text-sm font-medium text-gray-400">Team Name</label>
          <input v-model="formData.team" type="text" required class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-teal-500 outline-none transition">
        </div>
        <div>
          <label class="block mb-1 text-sm font-medium text-gray-400">Car Number</label>
          <input v-model.number="formData.number" type="number" required class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-teal-500 outline-none transition">
        </div>
        <div>
          <label class="block mb-1 text-sm font-medium text-gray-400">Password</label>
          <input v-model="formData.password" type="password" required class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-teal-500 outline-none transition">
        </div>

        <button 
          type="submit" 
          :disabled="isLoading"
          class="w-full mt-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-neutral-900 font-bold py-3 rounded-lg transition"
        >
          {{ isLoading ? 'Registering...' : 'Create Account' }}
        </button>

        <div class="text-center text-sm text-gray-500 mt-4">
          Already have an account? <router-link to="/login" class="text-teal-400 hover:underline">Login</router-link>
        </div>
      </form>
    </div>
  </div>
</template>
