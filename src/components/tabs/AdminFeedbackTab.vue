<!--
  @file components/tabs/AdminFeedbackTab.vue
  @brief Admin panel for viewing user-submitted feedback.
  @description Lists freeform feedback submitted from the Settings tab, along
               with the submitting car account and submission timestamp.
-->
<template>
    <div class="h-full overflow-y-auto p-8 space-y-6">
        <div class="flex justify-between items-center">
            <h3 class="text-lg font-medium text-zinc-900 dark:text-white">
                Feedback ({{ adminStore.feedbackMeta.total }})
            </h3>
            <button type="button" @click="refreshFeedback"
                class="min-h-11 min-w-11 flex items-center justify-center bg-zinc-200 dark:bg-neutral-800 rounded hover:bg-zinc-300 dark:hover:bg-neutral-700 transition"
                title="Refresh feedback" aria-label="Refresh feedback">
                <ArrowPathIcon class="w-5 h-5 text-zinc-500 dark:text-gray-400"
                    :class="{ 'animate-spin': adminStore.isFeedbackLoading }" />
            </button>
        </div>

        <div v-if="!adminStore.isFeedbackLoading && adminStore.feedback.length === 0"
            class="text-zinc-500 dark:text-gray-500 italic">
            No feedback submitted yet.
        </div>

        <div v-else class="space-y-4">
            <div v-for="entry in adminStore.feedback" :key="entry.id || entry._id"
                class="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-zinc-200 dark:border-neutral-700">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <div class="min-w-0">
                        <span class="text-zinc-900 dark:text-white font-bold">{{ entry.carName || entry.car || 'Unknown Car' }}</span>
                        <span v-if="entry.teamName || entry.team" class="text-sm text-zinc-500 dark:text-gray-500 ml-2">{{ entry.teamName || entry.team }}</span>
                        <div class="text-xs text-zinc-500 dark:text-gray-500 font-mono mt-0.5">{{ entry.carId || entry.carID }}</div>
                    </div>
                    <div class="shrink-0 text-xs text-zinc-500 dark:text-gray-500 whitespace-nowrap">
                        {{ formatDate(entry.createdAt || entry.timestamp) }}
                    </div>
                </div>
                <p class="text-sm text-zinc-700 dark:text-gray-300 whitespace-pre-wrap">{{ entry.message }}</p>
            </div>
        </div>

        <div v-if="adminStore.feedbackMeta.total > adminStore.feedback.length" class="flex justify-center pt-2">
            <button type="button" @click="loadMore"
                :disabled="adminStore.isFeedbackLoading"
                class="px-4 py-2 bg-zinc-200 dark:bg-neutral-800 hover:bg-zinc-300 dark:hover:bg-neutral-700 rounded text-sm text-zinc-900 dark:text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
                Load more
            </button>
        </div>
    </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'

const adminStore = useAdminStore()

const refreshFeedback = () => adminStore.fetchFeedback({ limit: adminStore.feedbackMeta.limit || 50, offset: 0 })

const loadMore = () => adminStore.fetchFeedback({
    limit: adminStore.feedbackMeta.limit || 50,
    offset: adminStore.feedback.length
})

const formatDate = (dateValue) => {
    if (!dateValue) return '-'
    return new Date(dateValue).toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    })
}

onMounted(() => {
    refreshFeedback()
})
</script>
