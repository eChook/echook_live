import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'

export const useAdminStore = defineStore('admin', () => {
    // State
    const users = ref([])
    const activeCars = ref([])
    const emails = ref([])
    const tracks = ref([])
    const serverStats = ref(null)
    const serverStatsHistory = ref([])
    const isStatsLoading = ref(false)
    const isLoading = ref(false)
    const error = ref(null)

    // Axios instance (reuse base but add admin prefix if needed, or just full paths)
    const api = axios.create({
        baseURL: API_BASE_URL,
        withCredentials: true
    })

    // Actions
    async function fetchUsers() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/users')
            users.value = res.data
        } catch (e) {
            error.value = e.message
            // console.error('Fetch users failed', e)
        } finally {
            isLoading.value = false
        }
    }

    async function fetchActiveCars() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/active_cars')
            activeCars.value = res.data
        } catch (e) {
            error.value = e.message
            // console.error('Fetch active cars failed', e)
        } finally {
            isLoading.value = false
        }
    }

    async function fetchEmails() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/emails')
            emails.value = res.data
        } catch (e) {
            error.value = e.message
            // console.error('Fetch emails failed', e)
        } finally {
            isLoading.value = false
        }
    }

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

    async function deleteUser(id) {
        try {
            await api.delete(`/admin/users/delete/${id}`)
            users.value = users.value.filter(u => u.id !== id && u._id !== id)
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Delete failed' }
        }
    }

    // --- Tracks Management ---
    async function fetchTracks() {
        isLoading.value = true
        try {
            const res = await api.get('/admin/tracks')
            tracks.value = res.data
        } catch (e) {
            error.value = e.message
            // console.error('Fetch tracks failed', e)
        } finally {
            isLoading.value = false
        }
    }
    // ... (imports are top level, ensuring replace works)


    async function addTrack(trackData) {
        try {
            const res = await api.post('/admin/tracks/add', trackData)
            // Refresh list or add to local
            await fetchTracks()
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Add track failed' }
        }
    }

    async function updateTrack(id, trackData) {
        try {
            await api.post(`/admin/tracks/update/${id}`, trackData)
            // Refresh list or update local
            await fetchTracks()
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Update track failed' }
        }
    }

    async function deleteTrack(id) {
        try {
            await api.delete(`/admin/tracks/delete/${id}`)
            tracks.value = tracks.value.filter(t => t._id !== id)
            return { success: true }
        } catch (e) {
            return { success: false, error: e.response?.data?.message || 'Delete track failed' }
        }
    }

    // New: Fetch latest data for JSON view
    async function fetchLatestData(id) {
        try {
            const res = await api.get(`/api/get/${id}`)
            return res.data
        } catch (e) {
            console.error('Fetch latest data failed', e)
            return null
        }
    }

    async function fetchServerStats(limit = 100) {
        isStatsLoading.value = true
        try {
            const res = await api.get('/admin/stats', { params: { limit } })
            // console.log('Server Stats Response:', res.data) // Debug log
            // Separate history from current/uptime
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
        users,
        activeCars,
        emails,
        isLoading,
        error,
        serverStats,
        serverStatsHistory,
        isStatsLoading,
        fetchUsers,
        fetchActiveCars,
        fetchEmails,
        updateUser,
        deleteUser,
        fetchLatestData,
        // Tracks
        tracks,
        fetchTracks,
        addTrack,
        updateTrack,
        deleteTrack,
        fetchServerStats
    }
})
