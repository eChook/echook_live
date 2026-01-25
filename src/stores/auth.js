import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, api } from '../utils/msgpack'

export const useAuthStore = defineStore('auth', () => {
    const user = ref(null)

    // Computed
    const isAuthenticated = computed(() => !!user.value)

    // Actions
    async function login(credentials) {
        try {
            const response = await authApi.post('/login', credentials)
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
            const response = await authApi.post('/register', data)
            if (response.data.success) {
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
            const response = await authApi.post('/getid')
            if (response.data.id) {
                // Session valid
            }
        } catch (e) {
            logout()
        }
    }

    async function requestVerificationCode() {
        try {
            const response = await api.post('/account/request-code', null, { withCredentials: true })
            if (response.data.success) {
                return { success: true, message: response.data.message }
            }
            return { success: false, error: response.data.message || 'Failed to request code' }
        } catch (error) {
            return { success: false, error: error.response?.data?.message || 'Request failed' }
        }
    }

    async function updateProfile(data) {
        try {
            const response = await api.post('/account/update', data, { withCredentials: true })
            if (response.data.success && response.data.user) {
                user.value = response.data.user
                return { success: true }
            }
            return { success: false, error: response.data.message || 'Update failed' }
        } catch (error) {
            console.error('Update profile failed', error)
            return { success: false, error: error.response?.data?.message || 'Update failed' }
        }
    }

    function logout() {
        user.value = null
    }

    return { user, isAuthenticated, login, register, logout, checkSession, updateProfile, requestVerificationCode }
}, {
    persist: true
})
