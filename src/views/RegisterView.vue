<!--
  @file views/RegisterView.vue
  @brief User registration page view component.
  @description Provides a registration form for new car accounts including
               car name, email, team name, and password with confirmation.
               Validates password match before submission.
-->
<script setup>
/**
 * @description Vue script setup for RegisterView.
 * 
 * Features:
 * - Form validation with password confirmation
 * - Visual feedback for password match/mismatch
 * - Auto-redirect to dashboard on successful registration
 * - Error display for registration failures
 */
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'
import bgImage from '../assets/background.jpg'
import PublicHeader from '../components/PublicHeader.vue'

const router = useRouter()
const auth = useAuthStore()

/**
 * @brief Form data for registration.
 * @type {Ref<Object>}
 */
const formData = ref({
  car: '',
  email: '',
  password: '',
  confirmPassword: '',
  team: '',
  number: 0
})

const error = ref('')
const isLoading = ref(false)

/**
 * @brief Check if both password fields match and are filled.
 * @type {ComputedRef<boolean>}
 */
const passwordsMatch = computed(() => {
  return formData.value.confirmPassword && formData.value.password === formData.value.confirmPassword
})

/**
 * @brief Check if password confirmation doesn't match.
 * @type {ComputedRef<boolean>}
 */
const passwordMismatch = computed(() => {
  return formData.value.confirmPassword && formData.value.password !== formData.value.confirmPassword
})

/**
 * @brief Handle registration form submission.
 * @description Validates passwords match, then submits to auth store.
 *              Redirects to dashboard on success, shows error on failure.
 */
const handleRegister = async () => {
  error.value = ''

  if (formData.value.password !== formData.value.confirmPassword) {
    error.value = "Passwords do not match"
    return
  }

  isLoading.value = true

  // Exclude confirmPassword from API call
  const { confirmPassword, ...dataToSend } = formData.value
  const result = await auth.register(dataToSend)

  isLoading.value = false

  if (result.success) {
    router.push('/')
  } else {
    error.value = result.error
  }
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
    <div class="flex-1 flex items-center justify-center pt-16">
      <div class="w-full max-w-md p-8 bg-neutral-800 rounded-xl shadow-2xl border border-neutral-700">
        <h2 class="text-3xl font-bold mb-6 text-center text-primary">Register Car</h2>

        <div v-if="error" class="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm text-center">
          {{ error }}
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-400">Car Name </label>
            <input v-model="formData.car" type="text" required
              class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary outline-none transition">
            <p class="text-xs text-gray-500">Only letters, numbers, spaces, underscores, and hyphens are allowed.
            </p>
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-400">Email</label>
            <input v-model="formData.email" type="email" required
              class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary outline-none transition">
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-400">Team Name</label>
            <input v-model="formData.team" type="text" required
              class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary outline-none transition">
            <p class="text-xs text-gray-500">Only letters, numbers, spaces, underscores, and hyphens are allowed.
            </p>
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-400">Password</label>
            <input v-model="formData.password" type="password" required
              class="w-full bg-neutral-900 border border-neutral-600 rounded-lg p-3 text-white focus:border-primary outline-none transition">
            <p class="text-xs text-gray-500">Tip: Make this something you can share with your team</p>
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium text-gray-400">Confirm Password</label>
            <input v-model="formData.confirmPassword" type="password" required
              class="w-full bg-neutral-900 border rounded-lg p-3 text-white outline-none transition" :class="{
                'border-green-500 focus:border-green-500': passwordsMatch,
                'border-red-500 focus:border-red-500': passwordMismatch,
                'border-neutral-600 focus:border-primary': !formData.confirmPassword
              }">
            <p v-if="passwordMismatch" class="text-red-500 text-xs mt-1">Passwords do not match</p>
          </div>

          <button type="submit" :disabled="isLoading"
            class="w-full mt-2 bg-primary hover:opacity-90 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition">
            {{ isLoading ? 'Registering...' : 'Create Account' }}
          </button>

          <div class="text-center text-sm text-gray-500 mt-4">
            Already have an account? <router-link to="/login" class="text-primary hover:underline">Login</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
