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
    /**
     * @brief Trusted admin flag from live server-authenticated responses.
     * @description This is intentionally non-persisted to avoid privilege trust
     *              from local storage hydration.
     */
    const trustedIsAdmin = ref(false)

    /**
     * @brief Sanitize user profile data for client-side state usage.
     * @param {Object|null} rawUser - Raw user object from backend response
     * @returns {Object|null} Sanitized profile without privileged fields
     */
    function sanitizeUser(rawUser) {
        if (!rawUser || typeof rawUser !== 'object') return null
        const sanitized = { ...rawUser }
        delete sanitized.isAdmin
        delete sanitized.role
        delete sanitized.roles
        delete sanitized.permissions
        return sanitized
    }

    /**
     * @brief Apply user payload from trusted auth responses.
     * @param {Object|null} rawUser - User payload from authenticated endpoint
     */
    function applyTrustedUser(rawUser) {
        user.value = sanitizeUser(rawUser)
        trustedIsAdmin.value = !!rawUser?.isAdmin
    }

    // Strip any privileged fields if store is hydrated from persisted storage.
    if (user.value) {
        user.value = sanitizeUser(user.value)
        trustedIsAdmin.value = false
    }

    // ============================================
    // Computed Properties
    // ============================================

    /**
     * @brief Check if user is currently authenticated.
     * @returns {boolean} True if user is logged in
     */
    const isAuthenticated = computed(() => !!user.value)
    /** @brief Normalized user identifier for mixed backend id fields. */
    const userId = computed(() => user.value?.id || user.value?._id || null)
    /** @brief Whether user has trusted admin role in current runtime session. */
    const isAdmin = computed(() => trustedIsAdmin.value)

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
            const body = response?.data || {}
            if (body.success && body.user) {
                applyTrustedUser(body.user)
                return { success: true }
            }
            return { success: false, error: body.message || 'Login failed' }
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
            const body = response?.data || {}
            if (body.success) {
                if (body.user) {
                    applyTrustedUser(body.user)
                }
                return { success: true }
            }
            return { success: false, error: body.message || 'Registration failed' }
        } catch (error) {
            return { success: false, error: error.response?.data?.message || 'Registration failed' }
        }
    }

    /**
     * @brief Verify the current session is still valid.
     * @description Calls the server to check if the session cookie is valid.
     *              Logs out the user only for confirmed auth failures.
     *              Transient network/API failures preserve local auth state.
     * @returns {Promise<{success: boolean, transient?: boolean, error?: string}>}
     */
    async function checkSession() {
        try {
            const response = await authApi.post('/getid')
            const body = response?.data || {}
            if (body.id) {
                return { success: true }
            }
            logout()
            return { success: false, error: 'Session expired' }
        } catch (e) {
            const status = e?.response?.status
            const message = e?.response?.data?.message || 'Session check failed'
            const isAuthFailure = status === 401 || status === 403

            if (isAuthFailure) {
                logout()
                return { success: false, error: message }
            }

            return { success: false, transient: true, error: message }
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
                applyTrustedUser(response.data.user)
                return { success: true }
            }
            return { success: false, error: response.data.message || 'Update failed' }
        } catch (error) {
            console.error('Update profile failed', error)
            return { success: false, error: error.response?.data?.message || 'Update failed' }
        }
    }

    /**
     * @brief Start a demo session with simulated telemetry data.
     * @description Authenticates as a demo user without credentials.
     *              Demo data is generated server-side and shared across all demo users.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function startDemo() {
        try {
            const response = await authApi.get('/demo')
            if (response.data.success) {
                applyTrustedUser(response.data.user)
                return { success: true }
            }
            return { success: false, error: response.data.message || 'Failed to start demo' }
        } catch (error) {
            return { success: false, error: error.response?.data?.message || 'Demo unavailable' }
        }
    }

    /**
     * @brief Log out the current user.
     * @description Clears the local user state. Server-side session is
     *              invalidated via cookie expiration.
     */
    function logout() {
        user.value = null
        trustedIsAdmin.value = false
    }

    return {
        // State
        user,
        isAuthenticated,
        userId,
        isAdmin,

        // Actions
        login,
        register,
        logout,
        checkSession,
        updateProfile,
        requestVerificationCode,
        startDemo
    }
}, {
    persist: {
        pick: ['user']
    }
})
