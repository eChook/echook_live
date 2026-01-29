import { ref } from 'vue'

const isVisible = ref(false)
const message = ref('')
const type = ref('info') // info, success, warning, error
const timeout = ref(null)

export function useToast() {
    function showToast(msg, toastType = 'info', duration = 3000) {
        message.value = msg
        type.value = toastType
        isVisible.value = true

        if (timeout.value) clearTimeout(timeout.value)

        timeout.value = setTimeout(() => {
            isVisible.value = false
        }, duration)
    }

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
