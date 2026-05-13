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
import { getPublicLatestTelemetryPath } from '../constants/accessPolicy'

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

    /** @brief Cloudflare R2 backup settings from the server */
    const r2Settings = ref(null)

    /** @brief Recent Cloudflare R2 backup/test log rows */
    const r2Logs = ref([])

    /** @brief Pagination metadata for Cloudflare R2 logs */
    const r2LogsMeta = ref({
        total: 0,
        limit: 50,
        offset: 0
    })

    /** @brief SQL telemetry database statistics and per-car sizes */
    const sqlStats = ref(null)

    /** @brief Loading state for stats fetch */
    const isStatsLoading = ref(false)

    /** @brief Loading state for backup, R2, and SQL stats operations */
    const backupLoading = ref({
        download: false,
        restore: false,
        settings: false,
        saveSettings: false,
        test: false,
        run: false,
        logs: false,
        sqlStats: false
    })

    /** @brief Last backup/R2/SQL operation result shown in the admin UI */
    const backupStatus = ref(null)

    /** @brief General loading state for admin operations */
    const isLoading = ref(false)

    /** @brief Last error message from failed operations */
    const error = ref(null)

    // Axios instance with credentials for admin API
    const api = axios.create({
        baseURL: API_BASE_URL,
        withCredentials: true,
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
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
            users.value = Array.isArray(res.data) ? res.data : []
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
            activeCars.value = Array.isArray(res.data) ? res.data : []
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
            emails.value = Array.isArray(res.data) ? res.data : []
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
            tracks.value = Array.isArray(res.data) ? res.data : []
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
            const res = await api.get(getPublicLatestTelemetryPath(id))
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
            serverStatsHistory.value = Array.isArray(history) ? history : []
        } catch (e) {
            error.value = e.message
            console.error('Fetch server stats failed', e)
        } finally {
            isStatsLoading.value = false
        }
    }

    // ============================================
    // Backup, R2, and SQL Database Actions
    // ============================================

    /**
     * @brief Extract a useful filename from a Content-Disposition header.
     * @param {string|undefined} disposition - Response Content-Disposition header
     * @returns {string} Backup filename for the downloaded blob
     */
    function getDownloadFilename(disposition) {
        if (!disposition) return `echook-backup-${new Date().toISOString().slice(0, 10)}.zip`

        const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i)
        return filenameMatch ? decodeURIComponent(filenameMatch[1]) : `echook-backup-${new Date().toISOString().slice(0, 10)}.zip`
    }

    /**
     * @brief Download a full local database backup ZIP.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function downloadBackup() {
        backupLoading.value.download = true
        backupStatus.value = null
        try {
            const res = await api.get('/admin/backup/download', { responseType: 'blob' })
            const filename = getDownloadFilename(res.headers?.['content-disposition'])
            const url = window.URL.createObjectURL(new Blob([res.data], { type: res.headers?.['content-type'] || 'application/zip' }))
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)

            backupStatus.value = { type: 'success', message: `Downloaded ${filename}` }
            return { success: true }
        } catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message || 'Backup download failed'
            backupStatus.value = { type: 'error', message }
            return { success: false, error: message }
        } finally {
            backupLoading.value.download = false
        }
    }

    /**
     * @brief Restore a database backup ZIP using the server-required `backup` form field.
     * @param {File} file - Backup ZIP selected by the admin
     * @returns {Promise<{success: boolean, message?: string, error?: string}>}
     */
    async function restoreBackup(file) {
        backupLoading.value.restore = true
        backupStatus.value = null
        try {
            const formData = new FormData()
            formData.append('backup', file)

            const res = await api.post('/admin/backup/restore', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })
            const message = res.data?.message || 'Restore completed successfully'
            backupStatus.value = { type: 'success', message }
            return { success: true, message }
        } catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message || 'Restore failed'
            backupStatus.value = { type: 'error', message }
            return { success: false, error: message }
        } finally {
            backupLoading.value.restore = false
        }
    }

    /**
     * @brief Fetch effective Cloudflare R2 backup settings.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function fetchR2Settings() {
        backupLoading.value.settings = true
        try {
            const res = await api.get('/admin/backup/r2/settings')
            r2Settings.value = res.data || null
            return { success: true }
        } catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message || 'Fetch R2 settings failed'
            backupStatus.value = { type: 'error', message }
            return { success: false, error: message }
        } finally {
            backupLoading.value.settings = false
        }
    }

    /**
     * @brief Update Cloudflare R2 backup settings and refresh effective values.
     * @param {Object} payload - Partial R2 settings update
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function updateR2Settings(payload) {
        backupLoading.value.saveSettings = true
        backupStatus.value = null
        try {
            await api.put('/admin/backup/r2/settings', payload)
            await fetchR2Settings()
            backupStatus.value = { type: 'success', message: 'R2 settings saved' }
            return { success: true }
        } catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message || 'Save R2 settings failed'
            backupStatus.value = { type: 'error', message }
            return { success: false, error: message }
        } finally {
            backupLoading.value.saveSettings = false
        }
    }

    /**
     * @brief Run an R2 HeadBucket connectivity test.
     * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
     */
    async function testR2Connectivity() {
        backupLoading.value.test = true
        backupStatus.value = null
        try {
            const res = await api.post('/admin/backup/r2/test')
            const data = res.data || {}
            backupStatus.value = {
                type: data.ok ? 'success' : 'error',
                message: data.ok ? `R2 connectivity test passed (log ${data.logId})` : `R2 connectivity test failed: ${data.error || 'Unknown error'}`
            }
            await fetchR2Logs({ limit: r2LogsMeta.value.limit, offset: 0 })
            return { success: Boolean(data.ok), data, error: data.ok ? undefined : data.error }
        } catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message || 'R2 connectivity test failed'
            backupStatus.value = { type: 'error', message }
            return { success: false, error: message }
        } finally {
            backupLoading.value.test = false
        }
    }

    /**
     * @brief Trigger an immediate R2 backup run.
     * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
     */
    async function runR2BackupNow() {
        backupLoading.value.run = true
        backupStatus.value = null
        try {
            const res = await api.post('/admin/backup/r2/run')
            const data = res.data || {}
            backupStatus.value = {
                type: 'success',
                message: `R2 backup uploaded${data.objectKey ? `: ${data.objectKey}` : ''}`
            }
            await fetchR2Logs({ limit: r2LogsMeta.value.limit, offset: 0 })
            return { success: true, data }
        } catch (e) {
            const message = e.response?.status === 409
                ? 'Another R2 backup is already in progress'
                : e.response?.data?.message || e.response?.data?.error || e.message || 'R2 backup failed'
            backupStatus.value = { type: 'error', message }
            await fetchR2Logs({ limit: r2LogsMeta.value.limit, offset: 0 })
            return { success: false, error: message }
        } finally {
            backupLoading.value.run = false
        }
    }

    /**
     * @brief Fetch paginated R2 backup/test logs.
     * @param {Object} options - Pagination options
     * @param {number} [options.limit=50] - Number of logs to fetch
     * @param {number} [options.offset=0] - Offset into log list
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function fetchR2Logs({ limit = 50, offset = 0 } = {}) {
        backupLoading.value.logs = true
        try {
            const res = await api.get('/admin/backup/r2/logs', { params: { limit, offset } })
            r2Logs.value = Array.isArray(res.data?.items) ? res.data.items : []
            r2LogsMeta.value = {
                total: Number(res.data?.total || 0),
                limit: Number(res.data?.limit || limit),
                offset: Number(res.data?.offset || offset)
            }
            return { success: true }
        } catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message || 'Fetch R2 logs failed'
            backupStatus.value = { type: 'error', message }
            return { success: false, error: message }
        } finally {
            backupLoading.value.logs = false
        }
    }

    /**
     * @brief Fetch SQL telemetry database size and per-car row statistics.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function fetchSqlStatsByCar() {
        backupLoading.value.sqlStats = true
        try {
            const res = await api.get('/admin/sql/stats/cars')
            sqlStats.value = res.data || null
            return { success: true }
        } catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message || 'Fetch SQL database stats failed'
            backupStatus.value = { type: 'error', message }
            return { success: false, error: message }
        } finally {
            backupLoading.value.sqlStats = false
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
        r2Settings,
        r2Logs,
        r2LogsMeta,
        sqlStats,
        backupLoading,
        backupStatus,

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
        fetchServerStats,
        downloadBackup,
        restoreBackup,
        fetchR2Settings,
        updateR2Settings,
        testR2Connectivity,
        runR2BackupNow,
        fetchR2Logs,
        fetchSqlStatsByCar
    }
})
