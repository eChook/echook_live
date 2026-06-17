<!--
  @file views/PolicyView.vue
  @brief Public legal policy page renderer.
  @description Loads markdown policy documents from docs/legal at build time
               and renders them with shared site styling.
-->
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import bgImage from '../assets/background.jpg'
import PublicHeader from '../components/PublicHeader.vue'
import PublicFooter from '../components/PublicFooter.vue'
import { getPolicyDocument, renderPolicyMarkdown } from '../utils/policyMarkdown'

const route = useRoute()
const router = useRouter()
const markdown = ref('')
const loadError = ref('')
const isLoading = ref(true)

const policyMeta = computed(() => getPolicyDocument(route.params.slug))
const htmlContent = computed(() => (markdown.value ? renderPolicyMarkdown(markdown.value) : ''))

/**
 * @brief Load markdown source for the current policy slug.
 */
async function loadPolicy() {
    isLoading.value = true
    loadError.value = ''
    markdown.value = ''

    const meta = policyMeta.value
    if (!meta) {
        loadError.value = 'Policy not found.'
        isLoading.value = false
        return
    }

    try {
        markdown.value = await meta.source()
    } catch (error) {
        console.error('Failed to load policy document', error)
        loadError.value = 'Unable to load this policy document.'
    } finally {
        isLoading.value = false
    }
}

onMounted(loadPolicy)
watch(() => route.params.slug, loadPolicy)
</script>

<template>
  <div class="relative flex flex-col min-h-screen">
    <!-- Fixed viewport background — does not stretch when policy content scrolls -->
    <div
      class="fixed inset-0 -z-10 bg-zinc-100 dark:bg-neutral-900"
      :style="{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.1)), url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }"
      aria-hidden="true"
    />

    <PublicHeader />

    <main class="flex-1 pt-20 pb-8 px-4">
      <div class="max-w-3xl mx-auto">
        <article
          v-if="!loadError && !isLoading"
          class="bg-white/95 dark:bg-neutral-900/95 backdrop-blur rounded-xl shadow-xl border border-zinc-200 dark:border-neutral-700 px-6 py-8 sm:px-10 sm:py-10 policy-prose"
          v-html="htmlContent"
        />

        <div
          v-else-if="isLoading"
          class="bg-white/95 dark:bg-neutral-900/95 rounded-xl border border-zinc-200 dark:border-neutral-700 p-10 text-center text-zinc-500 dark:text-gray-400"
        >
          Loading…
        </div>

        <div
          v-else
          class="bg-white/95 dark:bg-neutral-900/95 rounded-xl border border-red-300 dark:border-red-800 p-10 text-center"
        >
          <p class="text-red-700 dark:text-red-300">{{ loadError }}</p>
          <div class="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm">
            <button type="button" class="text-primary hover:underline" @click="router.back()">Back</button>
            <router-link to="/login" class="text-primary hover:underline">Return to login</router-link>
          </div>
        </div>
      </div>
    </main>

    <PublicFooter />
  </div>
</template>

<style scoped>
.policy-prose :deep(a) {
  word-break: break-word;
}
</style>
