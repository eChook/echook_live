/**
 * @file composables/useToast.js
 * @brief Toast notification composable.
 * @description Provides a global toast notification system using Vue's Composition API.
 *              State is shared across all components using this composable, enabling
 *              any component to trigger toast notifications.
 */

import { ref } from 'vue'

// ============================================
// Shared State (Module-level singletons)
// ============================================

/** @brief Whether the toast is currently visible */
const isVisible = ref(false)

/** @brief Current toast message text */
const message = ref('')

/** @brief Toast type for styling: 'info', 'success', 'warning', 'error' */
const type = ref('info')

/** @brief Timeout ID for auto-hide behavior */
const timeout = ref(null)

/**
 * @brief Toast notification composable.
 * @description Returns shared state and methods for displaying toast notifications.
 *              Multiple components can import this and share the same toast state.
 * 
 * @returns {Object} Toast composable API
 * @returns {Ref<boolean>} isVisible - Whether toast is shown
 * @returns {Ref<string>} message - Toast message text
 * @returns {Ref<string>} type - Toast type ('info', 'success', 'warning', 'error')
 * @returns {Function} showToast - Display a toast notification
 * @returns {Function} hideToast - Manually hide the toast
 * 
 * @example
 * const { showToast } = useToast()
 * showToast('Operation successful!', 'success', 3000)
 */
export function useToast() {
    /**
     * @brief Display a toast notification.
     * @param {string} msg - Message to display
     * @param {string} [toastType='info'] - Toast type: 'info', 'success', 'warning', 'error'
     * @param {number} [duration=3000] - Auto-hide duration in milliseconds
     */
    function showToast(msg, toastType = 'info', duration = 3000) {
        message.value = msg
        type.value = toastType
        isVisible.value = true

        if (timeout.value) clearTimeout(timeout.value)

        timeout.value = setTimeout(() => {
            isVisible.value = false
        }, duration)
    }

    /**
     * @brief Manually hide the current toast.
     */
    function hideToast() {
        isVisible.value = false
        if (timeout.value) clearTimeout(timeout.value)
    }

    return {
        isVisible,
        message,
        type,
        showToast,
        hideToast
    }
}
