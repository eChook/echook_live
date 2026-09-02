/**
 * @file stores/battery.js
 * @brief Battery Store state management for team battery inventory and fitment.
 * @description Pinia store for the Battery Store API: store lifecycle, battery CRUD,
 *              fitment assignments, access management, and overnight stats backfill
 *              requests. Lifetime stats are server-owned. Not persisted.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'

/**
 * @brief Axios client for battery store JSON endpoints with session cookies.
 */
const batteryApi = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
        Accept: 'application/json'
    }
})

/**
 * @brief Extract error message from an Axios error response.
 * @param {unknown} error - Axios error object
 * @param {string} fallback - Default message when none is available
 * @returns {string} Human-readable error message
 */
function extractErrorMessage(error, fallback) {
    return error?.response?.data?.error
        || error?.response?.data?.message
        || error?.message
        || fallback
}

export const useBatteryStore = defineStore('battery', () => {
    /** @brief Whether the caller has a battery store (null = not yet fetched). */
    const hasStore = ref(null)

    /** @brief Store metadata when the caller is a member. */
    const storeInfo = ref(null)

    /** @brief All batteries in the store, including retired. */
    const batteries = ref([])

    /** @brief Current upper/lower fitment for the active car. */
    const currentFitment = ref(null)

    /** @brief Authorised cars in the store. */
    const authorisedCars = ref([])

    /** @brief General loading flag for store-level operations. */
    const loading = ref(false)

    /** @brief Last error message from a failed operation. */
    const error = ref(null)

    /** @brief Active batteries suitable for assignment pickers. */
    const activeBatteries = computed(() =>
        batteries.value.filter((battery) => battery.status === 'active')
    )

    /**
     * @brief Fetch store membership status for the authenticated car.
     * @returns {Promise<boolean>} True when the caller has a store
     */
    async function fetchStore() {
        loading.value = true
        error.value = null
        try {
            const response = await batteryApi.get('/batteries/store')
            const body = response.data || {}
            hasStore.value = !!body.hasStore
            storeInfo.value = body.store || null
            return hasStore.value
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to load battery store')
            hasStore.value = false
            storeInfo.value = null
            return false
        } finally {
            loading.value = false
        }
    }

    /**
     * @brief Create a new battery store with the caller as sole member.
     * @returns {Promise<boolean>} True on success
     */
    async function createStore() {
        loading.value = true
        error.value = null
        try {
            const response = await batteryApi.post('/batteries/store')
            const body = response.data || {}
            hasStore.value = true
            storeInfo.value = body.store || (body.storeId ? { id: body.storeId } : null)
            return true
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to create battery store')
            return false
        } finally {
            loading.value = false
        }
    }

    /**
     * @brief List all batteries in the caller's store.
     * @returns {Promise<Array<Object>>} Battery list
     */
    async function fetchBatteries() {
        error.value = null
        try {
            const response = await batteryApi.get('/batteries')
            batteries.value = Array.isArray(response.data) ? response.data : []
            return batteries.value
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to load batteries')
            batteries.value = []
            return []
        }
    }

    /**
     * @brief Create a new battery in the store.
     * @param {Object} payload - Battery create body
     * @returns {Promise<Object|null>} Created battery or null on failure
     */
    async function createBattery(payload) {
        error.value = null
        try {
            const response = await batteryApi.post('/batteries', payload)
            const created = response.data
            if (created?.id) {
                if (!created.dateStamp && payload.dateStamp) {
                    created.dateStamp = payload.dateStamp
                }
                batteries.value = [...batteries.value, created]
            }
            return created
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to create battery')
            return null
        }
    }

    /**
     * @brief Update an existing battery.
     * @param {number} id - Battery id
     * @param {Object} patch - Fields to update
     * @returns {Promise<Object|null>} Updated battery or null on failure
     */
    async function updateBattery(id, patch) {
        error.value = null
        try {
            const response = await batteryApi.patch(`/batteries/${id}`, patch)
            const existing = batteries.value.find((battery) => battery.id === id)
            const updated = response.data
                ? { ...(existing || {}), ...response.data }
                : null

            if (updated) {
                for (const [key, value] of Object.entries(patch)) {
                    if (value !== undefined && value !== null && value !== ''
                        && (updated[key] === undefined || updated[key] === null || updated[key] === '')) {
                        updated[key] = value
                    }
                }
            }

            const index = batteries.value.findIndex((battery) => battery.id === id)
            if (index >= 0 && updated) {
                batteries.value[index] = updated
                batteries.value = [...batteries.value]
            }
            return updated
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to update battery')
            return null
        }
    }

    /**
     * @brief Fetch full details for one battery including current assignment.
     * @param {number} id - Battery id
     * @returns {Promise<Object|null>} Battery details
     */
    async function fetchBattery(id) {
        error.value = null
        try {
            const response = await batteryApi.get(`/batteries/${id}`)
            return response.data
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to load battery details')
            return null
        }
    }

    /**
     * @brief Fetch current upper/lower fitment for a car.
     * @param {string} carId - Mongo car id
     * @returns {Promise<Object|null>} Fitment object
     */
    async function fetchCurrentFitment(carId) {
        if (!carId) return null
        error.value = null
        try {
            const response = await batteryApi.get(`/cars/${carId}/batteries/current`)
            currentFitment.value = response.data || { upper: null, lower: null }
            return currentFitment.value
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to load current fitment')
            currentFitment.value = null
            return null
        }
    }

    /**
     * @brief Assign one or both batteries to a car atomically.
     * @param {Object} payload - Assign body { carId, upper?, lower? }
     * @returns {Promise<boolean>} True on success
     */
    async function assignBatteries(payload) {
        error.value = null
        try {
            await batteryApi.post('/batteries/assign', payload)
            await fetchCurrentFitment(payload.carId)
            return true
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to assign batteries')
            return false
        }
    }

    /**
     * @brief Unassign a position on a car.
     * @param {Object} payload - Unassign body { carId, position, endedAt? }
     * @returns {Promise<boolean>} True on success
     */
    async function unassignBattery(payload) {
        error.value = null
        try {
            await batteryApi.post('/batteries/unassign', payload)
            await fetchCurrentFitment(payload.carId)
            return true
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to unassign battery')
            return false
        }
    }

    /**
     * @brief List authorised cars in the store.
     * @returns {Promise<Array<Object>>} Authorised car list
     */
    async function fetchAuthorisedCars() {
        error.value = null
        try {
            const response = await batteryApi.get('/batteries/store/cars')
            authorisedCars.value = Array.isArray(response.data) ? response.data : []
            return authorisedCars.value
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to load authorised cars')
            authorisedCars.value = []
            return []
        }
    }

    /**
     * @brief Queue overnight stats rebuild for selected (or all active) batteries.
     * @param {number[]|null} [batteryIds] - Optional subset of battery ids
     * @returns {Promise<object|null>} API response body or null on failure
     */
    async function requestStatsBackfill(batteryIds = null) {
        error.value = null
        try {
            const body = Array.isArray(batteryIds) && batteryIds.length > 0
                ? { batteryIds }
                : {}
            const response = await batteryApi.post('/batteries/stats/backfill', body)
            return response.data || null
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to queue overnight stats recalculation')
            return null
        }
    }

    /**
     * @brief Fetch overnight backfill queue status for the store.
     * @returns {Promise<object|null>}
     */
    async function fetchStatsBackfillStatus() {
        error.value = null
        try {
            const response = await batteryApi.get('/batteries/stats/backfill')
            return response.data || null
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to load stats backfill status')
            return null
        }
    }

    /**
     * @brief Request OTP to grant another car access to the store.
     * @param {string} targetCarId - Target car Mongo id
     * @returns {Promise<boolean>} True when OTP was sent
     */
    async function requestGrantAccess(targetCarId) {
        error.value = null
        try {
            await batteryApi.post('/batteries/store/access/grant/request', { targetCarId })
            return true
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to send verification code')
            return false
        }
    }

    /**
     * @brief Confirm OTP and grant store access to another car.
     * @param {string} targetCarId - Target car Mongo id
     * @param {string} code - 6-digit OTP
     * @returns {Promise<boolean>} True on success
     */
    async function confirmGrantAccess(targetCarId, code) {
        error.value = null
        try {
            await batteryApi.post('/batteries/store/access/grant/confirm', { targetCarId, code })
            await fetchAuthorisedCars()
            return true
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to grant access')
            return false
        }
    }

    /**
     * @brief Resolve a car name + password to a Mongo car id via auth API.
     * @param {string} car - Car name
     * @param {string} password - Car password
     * @returns {Promise<{id: string, car?: string}|null>} Resolved car identity
     */
    async function resolveCarId(car, password) {
        error.value = null
        try {
            const response = await batteryApi.post('/auth/getid', { car, password })
            const body = response.data || {}
            if (body.id) {
                return { id: body.id, car: body.car || car }
            }
            return null
        } catch (err) {
            error.value = extractErrorMessage(err, 'Failed to look up car')
            return null
        }
    }

    /**
     * @brief Load store, batteries, fitment, and authorised cars in one pass.
     * @param {string} carId - Current car id for fitment lookup
     * @returns {Promise<void>}
     */
    async function initializeTab(carId) {
        loading.value = true
        try {
            const member = await fetchStore()
            if (member) {
                await Promise.all([
                    fetchBatteries(),
                    fetchAuthorisedCars(),
                    fetchCurrentFitment(carId)
                ])
            }
        } finally {
            loading.value = false
        }
    }

    return {
        hasStore,
        storeInfo,
        batteries,
        currentFitment,
        authorisedCars,
        loading,
        error,
        activeBatteries,
        fetchStore,
        createStore,
        fetchBatteries,
        createBattery,
        updateBattery,
        fetchBattery,
        fetchCurrentFitment,
        assignBatteries,
        unassignBattery,
        fetchAuthorisedCars,
        requestStatsBackfill,
        fetchStatsBackfillStatus,
        requestGrantAccess,
        confirmGrantAccess,
        resolveCarId,
        initializeTab
    }
})
