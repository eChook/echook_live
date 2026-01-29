<!--
  @file components/tabs/AdminTab.vue
  @brief Admin dashboard with user and car management.
  @description Comprehensive admin panel with sub-tabs for managing
               active cars, all users, email lists, maps, and server stats.
               Provides CRUD operations for users and car data viewing.
-->
<template>
    <div class="h-full flex overflow-hidden bg-neutral-900 text-gray-300">

        <!-- Vertical Sidebar for Admin Tabs -->
        <div class="w-48 bg-neutral-800/50 border-r border-neutral-700 flex flex-col pt-6">
            <div class="px-4 mb-6">
                <h2 class="text-xl font-bold text-white">Admin</h2>
            </div>
            <nav class="space-y-1 px-2">
                <button v-for="tab in tabs" :key="tab.id" @click="currentTab = tab.id"
                    class="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
                    :class="currentTab === tab.id ? 'bg-primary/20 text-white' : 'text-gray-400 hover:bg-neutral-700 hover:text-white'">
                    <component :is="tab.icon" class="mr-3 flex-shrink-0 h-5 w-5"
                        :class="currentTab === tab.id ? 'text-primary' : 'text-gray-500'" aria-hidden="true" />
                    {{ tab.name }}
                </button>
            </nav>
        </div>

        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col overflow-hidden relative">
            <!-- Active Cars Panel -->
            <div v-if="currentTab === 'cars'" class="flex-1 overflow-y-auto p-8 space-y-6">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-medium text-white">Active Cars ({{ adminStore.activeCars.length }})</h3>
                    <button @click="refreshCars" class="p-2 bg-neutral-800 rounded hover:bg-neutral-700 transition">
                        <ArrowPathIcon class="w-5 h-5 text-gray-400"
                            :class="{ 'animate-spin': adminStore.isLoading }" />
                    </button>
                </div>

                <div v-if="adminStore.activeCars.length === 0" class="text-gray-500 italic">No active cars found.</div>

                <div class="grid gap-4">
                    <div v-for="car in adminStore.activeCars" :key="car.carID || car.id"
                        class="bg-neutral-800 rounded-lg p-4 border border-neutral-700 shadow-sm">
                        <div class="flex items-center justify-between mb-2">
                            <div>
                                <div class="text-white font-bold text-lg">{{ car.carName || 'Unknown Car' }}</div>
                                <div class="text-sm text-gray-400">{{ car.teamName || 'Unknown Team' }}</div>
                                <div class="text-xs text-gray-500 font-mono mt-1">{{ car.carID }}</div>
                            </div>
                            <div class="flex space-x-2">
                                <!-- JSON View -->
                                <button @click="toggleJson(car.carID)"
                                    class="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-xs text-white">
                                    JSON
                                </button>
                                <!-- Edit -->
                                <button @click="editUser(car)"
                                    class="px-3 py-1 bg-blue-900/50 hover:bg-blue-900 border border-blue-900 rounded text-xs text-blue-200">
                                    Edit
                                </button>
                                <!-- View Telemetry -->
                                <button @click="viewCar(car)"
                                    class="px-3 py-1 bg-primary hover:bg-primary/80 rounded text-xs text-white font-bold flex items-center">
                                    <EyeIcon class="w-4 h-4 mr-1" /> View
                                </button>
                            </div>
                        </div>

                        <!-- JSON Disclosure -->
                        <div v-if="jsonState[car.carID]"
                            class="mt-4 bg-neutral-900 rounded p-4 border border-neutral-700 overflow-x-auto">
                            <pre
                                class="text-xs text-green-400 font-mono">{{ jsonData[car.carID] || 'Loading...' }}</pre>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Users Panel -->
            <div v-else-if="currentTab === 'users'" class="flex-1 overflow-y-auto p-8 space-y-6">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-medium text-white">All Users ({{ adminStore.users.length }})</h3>
                    <button @click="refreshUsers" class="p-2 bg-neutral-800 rounded hover:bg-neutral-700 transition">
                        <ArrowPathIcon class="w-5 h-5 text-gray-400"
                            :class="{ 'animate-spin': adminStore.isLoading }" />
                    </button>
                </div>

                <div class="overflow-x-auto rounded-lg border border-neutral-700">
                    <table class="min-w-full divide-y divide-neutral-700 bg-neutral-800">
                        <thead class="bg-neutral-900">
                            <tr>
                                <th @click="sortUsers('number')"
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white">
                                    Number
                                    <span v-if="sortKey === 'number'">{{ sortAsc ? '↑' : '↓' }}</span>
                                </th>
                                <th @click="sortUsers('car')"
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white">
                                    Car
                                    <span v-if="sortKey === 'car'">{{ sortAsc ? '↑' : '↓' }}</span>
                                </th>
                                <th @click="sortUsers('team')"
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white">
                                    Team
                                    <span v-if="sortKey === 'team'">{{ sortAsc ? '↑' : '↓' }}</span>
                                </th>
                                <th @click="sortUsers('lastLogin')"
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white">
                                    Last Login
                                    <span v-if="sortKey === 'lastLogin'">{{ sortAsc ? '↑' : '↓' }}</span>
                                </th>
                                <th @click="sortUsers('created')"
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white">
                                    Created
                                    <span v-if="sortKey === 'created'">{{ sortAsc ? '↑' : '↓' }}</span>
                                </th>
                                <th @click="sortUsers('isAdmin')"
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white">
                                    Role
                                    <span v-if="sortKey === 'isAdmin'">{{ sortAsc ? '↑' : '↓' }}</span>
                                </th>
                                <th
                                    class="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-neutral-700">
                            <tr v-for="user in sortedUsers" :key="user.id || user._id">
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{{ user.number
                                }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{{ user.car }}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{{ user.team }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{{
                                    formatDate(user.lastLogin) }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{{
                                    formatDate(user.created) }}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm">
                                    <span v-if="user.isAdmin"
                                        class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-900 text-purple-200">Admin</span>
                                    <span v-else
                                        class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900 text-green-200">User</span>
                                </td>
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end space-x-2">
                                    <button @click="viewCar(user)" class="text-gray-400 hover:text-green-500 transition"
                                        title="View Telemetry">
                                        <EyeIcon class="w-5 h-5" />
                                    </button>
                                    <button @click="editUser(user)" class="text-gray-400 hover:text-blue-400 transition"
                                        title="Edit User">
                                        <PencilSquareIcon class="w-5 h-5" />
                                    </button>
                                    <button @click="confirmDelete(user)"
                                        class="text-gray-400 hover:text-red-500 transition" title="Delete User">
                                        <TrashIcon class="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Emails Panel -->
            <div v-else-if="currentTab === 'emails'" class="flex-1 overflow-y-auto p-8 space-y-6">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-medium text-white">Unique Emails</h3>
                    <button @click="refreshEmails" class="p-2 bg-neutral-800 rounded hover:bg-neutral-700 transition">
                        <ArrowPathIcon class="w-5 h-5 text-gray-400"
                            :class="{ 'animate-spin': adminStore.isLoading }" />
                    </button>
                </div>

                <div class="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
                    <div class="flex justify-between mb-2">
                        <span class="text-sm text-gray-500">Comma separated list</span>
                        <button @click="copyEmails" class="text-xs text-primary hover:underline">Copy All</button>
                    </div>
                    <div class="bg-neutral-900 p-4 rounded text-sm text-gray-300 font-mono break-all leading-loose">
                        {{ adminStore.emails.join(', ') }}
                    </div>
                </div>
            </div>

            <!-- Maps Panel -->
            <div v-else-if="currentTab === 'maps'" class="flex-1 h-full overflow-hidden">
                <!-- Using h-full because MapsTab manages its own scrolling/layout -->
                <AdminMapsTab />
            </div>

            <!-- Server Stats Panel -->
            <div v-else-if="currentTab === 'stats'" class="flex-1 h-full overflow-hidden">
                <ServerStatsTab />
            </div>
        </div>

        <!-- Edit Modal -->
        <UserEditModal v-model="showEditModal" :user="userToEdit" @save="handleSaveUser" />

        <!-- Delete Confirmation -->
        <ConfirmationModal :is-open="showDeleteModal" title="Delete User"
            :message="`Are you sure you want to delete ${userToDelete?.car || 'this user'}? This action cannot be undone.`"
            :confirm-text="'Delete'" :cancel-text="'Cancel'" :confirm-classes="'bg-red-600 hover:bg-red-700 text-white'"
            @close="showDeleteModal = false" @confirm="handleDeleteUser" />

    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { useTelemetryStore } from '../../stores/telemetry'
import {
    UsersIcon,
    TruckIcon,
    EnvelopeIcon,
    ArrowPathIcon,
    EyeIcon,
    PencilSquareIcon,
    TrashIcon,
    MapIcon,
    ChartBarIcon
} from '@heroicons/vue/24/outline'
import UserEditModal from '../UserEditModal.vue'
import ConfirmationModal from '../ui/ConfirmationModal.vue'
import AdminMapsTab from './AdminMapsTab.vue'
import ServerStatsTab from './ServerStatsTab.vue'

const adminStore = useAdminStore()
const telemetry = useTelemetryStore()

// Tabs
const tabs = [
    { id: 'cars', name: 'Active Cars', icon: TruckIcon },
    { id: 'users', name: 'Users', icon: UsersIcon },
    { id: 'emails', name: 'Emails', icon: EnvelopeIcon },
    { id: 'maps', name: 'Maps', icon: MapIcon },
    { id: 'stats', name: 'Server Stats', icon: ChartBarIcon },
]
const currentTab = ref('cars')

// Fetch Initial Data
onMounted(() => {
    refreshCars()
    refreshUsers()
    refreshEmails()
})

const refreshCars = () => adminStore.fetchActiveCars()
const refreshUsers = () => adminStore.fetchUsers()
const refreshEmails = () => adminStore.fetchEmails()

// JSON View Logic
const jsonState = ref({})
const jsonData = ref({}) // Cache loaded data

// Date Helper
const formatDate = (dateValue) => {
    if (!dateValue) return '-'
    return new Date(dateValue).toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    })
}

// Sorting
const sortKey = ref('lastLogin')
const sortAsc = ref(false)

const sortUsers = (key) => {
    if (sortKey.value === key) {
        sortAsc.value = !sortAsc.value
    } else {
        sortKey.value = key
        sortAsc.value = true
    }
}

import { computed } from 'vue' // Ensure imported or assume auto-import context if Nuxt (but this is Vue+Vite)

const sortedUsers = computed(() => {
    const users = [...adminStore.users]
    return users.sort((a, b) => {
        let valA = a[sortKey.value]
        let valB = b[sortKey.value]

        // Handle nulls
        if (valA === undefined || valA === null) valA = ''
        if (valB === undefined || valB === null) valB = ''

        // Special handling for date columns
        if (sortKey.value === 'lastLogin' || sortKey.value === 'created') {
            const dateA = valA ? new Date(valA).getTime() : 0
            const dateB = valB ? new Date(valB).getTime() : 0
            valA = dateA
            valB = dateB
        }
        // Handle purely numeric strings (e.g. car numbers) but NOT generic strings containing numbers
        else if (!isNaN(Number(valA)) && !isNaN(Number(valB)) && valA !== '' && valB !== '') {
            valA = Number(valA)
            valB = Number(valB)
        } else {
            // String compare
            valA = String(valA).toLowerCase()
            valB = String(valB).toLowerCase()
        }

        if (valA < valB) return sortAsc.value ? -1 : 1
        if (valA > valB) return sortAsc.value ? 1 : -1
        return 0
    })
})

const toggleJson = async (carId) => {
    // Toggle state
    jsonState.value[carId] = !jsonState.value[carId]

    // Fetch if opening and not loaded (or reload?)
    if (jsonState.value[carId]) {
        jsonData.value[carId] = 'Loading...'
        const data = await adminStore.fetchLatestData(carId)
        jsonData.value[carId] = data ? JSON.stringify(data, null, 2) : 'No data available'
    }
}

// View Telemetry Logic
const viewCar = async (item) => {
    // Normalize input (can be Active Car object or User object)
    const carId = item.carID || item.id || item._id

    if (!carId) return

    const carDetails = {
        id: carId,
        carName: item.carName || item.car || 'Unknown Car',
        teamName: item.teamName || item.team || 'Unknown Team',
        number: item.number
    }

    // Join room for this car, passing full details for header display
    telemetry.joinRoom(carId, carDetails)
    // Clear history and load recent for this car
    await telemetry.resetToLive(carId)
}

// Edit Logic
const showEditModal = ref(false)
const userToEdit = ref(null)

const editUser = (user) => {
    // Attempt to find full user details from the loaded users list
    // Active cars list only provides subset of data (missing isAdmin, number etc)
    const id = user.id || user._id || user.carID
    const fullUser = adminStore.users.find(u => u._id === id || u.id === id)

    if (fullUser) {
        userToEdit.value = fullUser
    } else {
        // Fallback if not found (e.g. users list load failed), though ideally we should fetch
        console.warn('Full user details not found for edit, using partial data')
        userToEdit.value = user
    }

    showEditModal.value = true
}

const handleSaveUser = async (updatedUser) => {
    const id = updatedUser.id || updatedUser._id || updatedUser.carID // Handle active car ID mismatch?
    // Active cars endpoint returns carID, users returns _id/id. store update needs real ID.
    // If we only have carID (from active cars list), we might not be able to update user DB if ID is missing.
    // But usually active cars might include DB ID? If not, we can only edit from Users list strictly speaking, 
    // OR we assume we can fetch by carName. 
    // Let's assume for now edit works best on Users tab. If on Active Cars, ideally we have the ID.

    if (id) {
        await adminStore.updateUser(id, updatedUser)
        refreshUsers() // Refresh lists
        refreshCars()
    } else {
        console.error("Cannot update user without ID", updatedUser)
    }
}

// Delete Logic
const showDeleteModal = ref(false)
const userToDelete = ref(null)

const confirmDelete = (user) => {
    userToDelete.value = user
    showDeleteModal.value = true
}

const handleDeleteUser = async () => {
    if (userToDelete.value) {
        const id = userToDelete.value.id || userToDelete.value._id
        if (id) {
            await adminStore.deleteUser(id)
            showDeleteModal.value = false
            userToDelete.value = null
        }
    }
}

// Emails
const copyEmails = () => {
    navigator.clipboard.writeText(adminStore.emails.join(', '))
}

</script>
