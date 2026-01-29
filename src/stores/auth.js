/**
 * @file stores/auth.js
 * @brief Authentication state management store.
 * @description Pinia store for managing user authentication state including
 *              login, registration, session management, and profile updates.
 *              Uses persistent storage to maintain session across page reloads.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, api } from '../utils/msgpack'

/**
 * @brief Authentication store for user session management.
 * @description Manages user authentication lifecycle with persistent state.
 *              Communicates with the auth API using MessagePack encoding.
 */
export const useAuthStore = defineStore('auth', () => {
    // ============================================
    // State
    // ============================================

    /** @brief Current authenticated user object or null if not logged in */
    const user = ref(null)

    // ============================================
    // Computed Properties
    // ============================================

    /**
     * @brief Check if user is currently authenticated.
     * @returns {boolean} True if user is logged in
     */
    const isAuthenticated = computed(() => !!user.value)

    // ============================================
    // Authentication Actions
    // ============================================

    /**
     * @brief Attempt to log in with credentials.
     * @param {Object} credentials - Login credentials
     * @param {string} credentials.email - User email address
     * @param {string} credentials.password - User password
     * @returns {Promise<{success: boolean, error?: string}>}
     */
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

    /**
     * @brief Register a new user account.
     * @param {Object} data - Registration data
     * @param {string} data.email - User email address
     * @param {string} data.password - User password
     * @param {string} data.name - Display name
     * @returns {Promise<{success: boolean, error?: string}>}
     */
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

    /**
     * @brief Verify the current session is still valid.
     * @description Calls the server to check if the session cookie is valid.
     *              Logs out the user if the session has expired.
     * @returns {Promise<void>}
     */
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

    /**
     * @brief Request a verification code for account updates.
     * @description Sends a one-time password to the user's email for
     *              verifying sensitive account changes.
     * @returns {Promise<{success: boolean, message?: string, error?: string}>}
     */
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

    /**
     * @brief Update user profile information.
     * @description Updates user account details. May require verification code
     *              for sensitive changes like email or password.
     * @param {Object} data - Profile update data
     * @param {string} [data.name] - New display name
     * @param {string} [data.email] - New email address
     * @param {string} [data.password] - New password
     * @param {string} [data.code] - Verification code for sensitive changes
     * @returns {Promise<{success: boolean, error?: string}>}
     */
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

    /**
     * @brief Log out the current user.
     * @description Clears the local user state. Server-side session is
     *              invalidated via cookie expiration.
     */
    function logout() {
        user.value = null
    }

    return {
        // State
        user,
        isAuthenticated,

        // Actions
        login,
        register,
        logout,
        checkSession,
        updateProfile,
        requestVerificationCode
    }
}, {
    persist: true
})
