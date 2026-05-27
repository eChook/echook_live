/**
 * @file useCriticalEventAlerts.js
 * @brief Live critical-threshold toast alerts for telemetry channels.
 */

import { computed, ref, watch } from 'vue'
import { useToast } from './useToast'
import { getCriticalTransitions, evaluateChannelThresholds } from '../utils/eventThresholds'

/** @brief Toast duration for critical alerts. */
const CRITICAL_TOAST_DURATION_MS = 9000
/** @brief Per-channel cooldown to avoid repeated toast spam. */
const CRITICAL_TOAST_COOLDOWN_MS = 45000

/**
 * @brief Enable live critical threshold toasts with edge-triggered dedupe.
 * @param {Object} params - Dependencies for live alert evaluation
 * @param {Object} params.telemetry - Telemetry store instance
 * @param {Object} params.settings - Settings store instance
 * @param {import('vue').ComputedRef<boolean>} [params.isEnabled] - Optional activation guard
 */
export function useCriticalEventAlerts({ telemetry, settings, isEnabled }) {
    const { showToast } = useToast()
    const previousThresholdState = ref({})
    const lastToastByChannel = ref({})

    const alertsEnabled = computed(() => {
        if (!isEnabled) return true
        return !!isEnabled.value
    })

    watch(
        () => ({
            enabled: alertsEnabled.value,
            packet: telemetry.liveData,
            thresholds: settings.analyticsSettings
        }),
        ({ enabled, packet, thresholds }) => {
            if (!enabled) {
                previousThresholdState.value = {}
                return
            }

            const hasPacketData = packet && typeof packet === 'object' && Object.keys(packet).length > 0
            if (!hasPacketData) return

            const nextThresholdState = evaluateChannelThresholds(packet, thresholds)
            const transitions = getCriticalTransitions(previousThresholdState.value, nextThresholdState)
            const now = Date.now()

            transitions.forEach((transition) => {
                const previousToastAt = lastToastByChannel.value[transition.channel] || 0
                if (now - previousToastAt < CRITICAL_TOAST_COOLDOWN_MS) return

                showToast(transition.message, 'error', CRITICAL_TOAST_DURATION_MS)
                lastToastByChannel.value[transition.channel] = now
            })

            previousThresholdState.value = nextThresholdState
        },
        { deep: true }
    )
}
