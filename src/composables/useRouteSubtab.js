/**
 * @file composables/useRouteSubtab.js
 * @brief Sync a tab's internal sub-panel selection with the `subtab` route param.
 */
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * @brief Create a get/set ref-like binding between a sub-panel id and the
 *        dashboard route's `subtab` param, scoped to one main tab.
 * @description Keeps the URL normalized: while the dashboard's `tab` param
 *              matches `tabId`, an invalid or missing `subtab` is replaced
 *              with `defaultId` so every visible sub-panel has its own URL.
 * @param {string} tabId - The main dashboard tab this sub-panel belongs to (e.g. 'settings')
 * @param {string[]} validIds - Allowed sub-panel ids
 * @param {string} defaultId - Sub-panel id to fall back to
 * @returns {import('vue').WritableComputedRef<string>}
 */
export function useRouteSubtab(tabId, validIds, defaultId) {
    const route = useRoute()
    const router = useRouter()

    watchEffect(() => {
        if (route.name === 'dashboard' && route.params.tab === tabId && !validIds.includes(route.params.subtab)) {
            router.replace({ name: 'dashboard', params: { tab: tabId, subtab: defaultId } })
        }
    })

    return computed({
        get: () => (validIds.includes(route.params.subtab) ? route.params.subtab : defaultId),
        set: (val) => {
            if (validIds.includes(val) && route.params.subtab !== val) {
                router.replace({ name: 'dashboard', params: { tab: tabId, subtab: val } })
            }
        }
    })
}
