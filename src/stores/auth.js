import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios' // Added axios import

export const useAuthStore = defineStore('auth', () => {
    const user = ref(null)

    /* Axios instance with base URL */
    const api = axios.create({
        baseURL: 'http://localhost:3000/auth',
        withCredentials: true // Important for cookies
    })

    // Computed
    const isAuthenticated = computed(() => !!user.value)

    // Actions
    async function login(credentials) {
        try {
            const response = await api.post('/login', credentials)
            if (response.data.success) {
                user.value = response.data.user
                return { success: true }
            }
        } catch (error) {
            console.error('Login failed', error)
            return { success: false, error: error.response?.data?.message || 'Login failed' }
        }
    }

    async function register(data) {
        try {
            const response = await api.post('/register', data)
            if (response.data.success) {
                // Auto login after register or just redirect? API doc implies success returns user? 
                // Doc says register response unknown, let's assume we need to login or it returns user.
                // Usually safe to ask user to login, but let's try to set user if returned.
                if (response.data.user) {
                    user.value = response.data.user
                }
                return { success: true }
            }
        } catch (error) {
            return { success: false, error: error.response?.data?.message || 'Registration failed' }
        }
    }

    async function checkSession() {
        try {
            const response = await api.post('/getid')
            // If successful, we might not get the full user object, but we know we are logged in.
            // Ideally we would fetch full profile. For now, we trust the persisted state or minimal update.
            if (response.data.id) {
                // We are valid.
            }
        } catch (e) {
            logout()
        }
    }

    function logout() {
        user.value = null
        // optional: call backend logout if exists
    }

    return { user, isAuthenticated, login, register, logout, checkSession }
}, {
    persist: true
})
