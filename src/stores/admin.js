/**
 * @file stores/admin.js
 * @brief Admin dashboard state management store.
 * @description Pinia store for managing admin-only functionality including
 *              user management, active car monitoring, email lists, track
 *              management, and server statistics. Requires admin authentication.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'

/**
 * @brief Admin store for managing admin panel state and API calls.
 * @description Provides reactive state for admin data and async actions
 *              for CRUD operations on users, tracks, and fetching server stats.
 */
export const useAdminStore = defineStore('admin', () => {
    // ============================================
    // State
    // ============================================

    /** @brief List of all registered users */
    const users = ref([])

    /** @brief List of currently active/connected cars */
    const activeCars = ref([])

    /** @brief List of registered email addresses */
    const emails = ref([])

    /** @brief List of configured race tracks */
    const tracks = ref([])

    /** @brief Current server statistics snapshot */
    const serverStats = ref(null)

    /** @brief Historical server statistics for graphing */
    const serverStatsHistory = ref([])

    /** @brief Loading state for stats fetch */
    const isStatsLoading = ref(false)

    /** @brief General loading state for admin operations */
    const isLoading = ref(false)

    /** @brief Last error message from failed operations */
    const error = ref(null)

    // Axios instance with credentials for admin API
    const api = axios.create({
        baseURL: API_BASE_URL,
        withCredentials: true
    })

    // ============================================
    // User Management Actions
    // ============================================

    /**
     * @brief Fetch all registered users from the server.
     * @description Populates the users ref with user data.
     * @returns {Promise<void>}
     */
    async function fetchUsers() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/users')
            users.value = res.data
        } catch (e) {
            error.value = e.message
        } finally {
            isLoading.value = false
        }
    }

    /**
     * @brief Fetch list of currently active/connected cars.
     * @returns {Promise<void>}
     */
    async function fetchActiveCars() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/active_cars')
            activeCars.value = res.data
        } catch (e) {
            error.value = e.message
        } finally {
            isLoading.value = false
        }
    }

    /**
     * @brief Fetch list of registered email addresses.
     * @returns {Promise<void>}
     */
    async function fetchEmails() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/emails')
            emails.value = res.data
        } catch (e) {
            error.value = e.message
        } finally {
            isLoading.value = false
        }
    }

    /**
     * @brief Update a user's details.
     * @param {string} id - User ID to update
     * @param {Object} updateData - Object containing fields to update
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function updateUser(id, updateData) {
        try {
            const res = await api.post(`/admin/users/update/${id}`, updateData)
            // Update local state
            const index = users.value.findIndex(u => u.id === id || u._id === id)
            if (index !== -1) {
                users.value[index] = { ...users.value[index], ...res.data }
            }
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Update failed' }
        }
    }

    /**
     * @brief Delete a user account.
     * @param {string} id - User ID to delete
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function deleteUser(id) {
        try {
            await api.delete(`/admin/users/delete/${id}`)
            users.value = users.value.filter(u => u.id !== id && u._id !== id)
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Delete failed' }
        }
    }

    // ============================================
    // Track Management Actions
    // ============================================

    /**
     * @brief Fetch all configured race tracks.
     * @returns {Promise<void>}
     */
    async function fetchTracks() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/tracks')
            tracks.value = res.data
        } catch (e) {
            error.value = e.message
        } finally {
            isLoading.value = false
        }
    }

    /**
     * @brief Add a new race track.
     * @param {Object} trackData - Track configuration object
     * @param {string} trackData.name - Track name
     * @param {Object} trackData.bounds - Bounding box coordinates
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function addTrack(trackData) {
        try {
            await api.post('/admin/tracks/add', trackData)
            await fetchTracks()
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Add track failed' }
        }
    }

    /**
     * @brief Update an existing track's configuration.
     * @param {string} id - Track ID to update
     * @param {Object} trackData - Updated track data
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function updateTrack(id, trackData) {
        try {
            await api.post(`/admin/tracks/update/${id}`, trackData)
            await fetchTracks()
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Update track failed' }
        }
    }

    /**
     * @brief Delete a race track.
     * @param {string} id - Track ID to delete
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function deleteTrack(id) {
        try {
            await api.delete(`/admin/tracks/delete/${id}`)
            tracks.value = tracks.value.filter(t => t._id !== id)
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Delete track failed' }
        }
    }

    // ============================================
    // Data & Stats Actions
    // ============================================

    /**
     * @brief Fetch latest telemetry data for a specific car (JSON view).
     * @param {string} id - Car ID to fetch data for
     * @returns {Promise<Object|null>} Latest telemetry data or null
     */
    async function fetchLatestData(id) {
        try {
            const res = await api.get(`/api/get/${id}`)
            return res.data
        } catch (e) {
            console.error('Fetch latest data failed', e)
            return null
        }
    }

    /**
     * @brief Fetch server statistics and history.
     * @description Gets current stats (activeCars, spectators) and historical
     *              data points for graphing trends.
     * @param {number} [limit=100] - Number of history points to fetch
     * @returns {Promise<void>}
     */
    async function fetchServerStats(limit = 100) {
        isStatsLoading.value = true
        try {
            const res = await api.get('/admin/stats', { params: { limit } })
            const { history, ...rest } = res.data
            serverStats.value = rest
            serverStatsHistory.value = history
        } catch (e) {
            error.value = e.message
            console.error('Fetch server stats failed', e)
        } finally {
            isStatsLoading.value = false
        }
    }

    return {
        // State
        users,
        activeCars,
        emails,
        isLoading,
        error,
        serverStats,
        serverStatsHistory,
        isStatsLoading,
        tracks,

        // Actions
        fetchUsers,
        fetchActiveCars,
        fetchEmails,
        updateUser,
        deleteUser,
        fetchLatestData,
        fetchTracks,
        addTrack,
        updateTrack,
        deleteTrack,
        fetchServerStats
    }
})
