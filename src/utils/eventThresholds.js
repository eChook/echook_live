/**
 * @file eventThresholds.js
 * @brief Shared threshold evaluation helpers for live telemetry and analytics.
 */

/** @brief Fallback threshold values used when settings are missing. */
export const EVENT_THRESHOLD_DEFAULTS = Object.freeze({
    eventUndervoltageWarningV: 18,
    eventUndervoltageCriticalV: 14,
    eventOverTempWarningC: 55,
    eventOverTempCriticalC: 65,
    eventCurrentSpikeWarningA: 40,
    eventCurrentSpikeCriticalA: 120
})

/** @brief Dashboard card key to threshold-channel map. */
export const CARD_THRESHOLD_KEYS = Object.freeze({
    voltage: 'voltage',
    current: 'current',
    temp1: 'temp1',
    temp2: 'temp2'
})

/**
 * @brief Parse a candidate numeric value into a finite number.
 * @param {unknown} value - Candidate numeric value
 * @returns {number|null} Finite number or null
 */
function toFiniteNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * @brief Resolve threshold severity from value against warning/critical bounds.
 * @param {number} value - Measured value
 * @param {number} warningThreshold - Warning threshold
 * @param {number} criticalThreshold - Critical threshold
 * @param {boolean} [higherIsWorse=true] - Threshold direction
 * @returns {'info'|'warning'|'critical'} Severity label
 */
export function resolveThresholdSeverity(value, warningThreshold, criticalThreshold, higherIsWorse = true) {
    if (!Number.isFinite(value)) return 'info'
    if (higherIsWorse) {
        if (Number.isFinite(criticalThreshold) && value >= criticalThreshold) return 'critical'
        if (Number.isFinite(warningThreshold) && value >= warningThreshold) return 'warning'
        return 'info'
    }
    if (Number.isFinite(criticalThreshold) && value <= criticalThreshold) return 'critical'
    if (Number.isFinite(warningThreshold) && value <= warningThreshold) return 'warning'
    return 'info'
}

/**
 * @brief Evaluate event-threshold severities for a single live packet.
 * @param {Object} packet - Telemetry packet (raw units expected)
 * @param {Object} [settings={}] - Analytics threshold settings
 * @returns {Object} Per-channel severity state and metadata
 */
export function evaluateChannelThresholds(packet, settings = {}) {
    const data = packet && typeof packet === 'object' ? packet : {}
    const config = {
        ...EVENT_THRESHOLD_DEFAULTS,
        ...(settings && typeof settings === 'object' ? settings : {})
    }

    const undervoltageWarning = Number(config.eventUndervoltageWarningV)
    const undervoltageCritical = Number(config.eventUndervoltageCriticalV)
    const overTempWarning = Number(config.eventOverTempWarningC)
    const overTempCritical = Number(config.eventOverTempCriticalC)
    const currentWarning = Number(config.eventCurrentSpikeWarningA)
    const currentCritical = Number(config.eventCurrentSpikeCriticalA)

    const voltage = toFiniteNumber(data.voltage)
    const temp1 = toFiniteNumber(data.temp1)
    const temp2 = toFiniteNumber(data.temp2)
    const current = toFiniteNumber(data.current)
    const absCurrent = current === null ? null : Math.abs(current)
    const maxTemp = Math.max(temp1 === null ? -Infinity : temp1, temp2 === null ? -Infinity : temp2)

    return {
        voltage: {
            title: 'Undervoltage',
            value: voltage,
            warningThreshold: undervoltageWarning,
            criticalThreshold: undervoltageCritical,
            unit: 'V',
            severity: resolveThresholdSeverity(voltage, undervoltageWarning, undervoltageCritical, false)
        },
        current: {
            title: 'High Current',
            value: absCurrent,
            warningThreshold: currentWarning,
            criticalThreshold: currentCritical,
            unit: 'A',
            severity: resolveThresholdSeverity(absCurrent, currentWarning, currentCritical, true)
        },
        temp1: {
            title: 'Over Temperature',
            value: temp1,
            warningThreshold: overTempWarning,
            criticalThreshold: overTempCritical,
            unit: 'C',
            severity: resolveThresholdSeverity(temp1, overTempWarning, overTempCritical, true)
        },
        temp2: {
            title: 'Over Temperature',
            value: temp2,
            warningThreshold: overTempWarning,
            criticalThreshold: overTempCritical,
            unit: 'C',
            severity: resolveThresholdSeverity(temp2, overTempWarning, overTempCritical, true)
        },
        temperatureMax: {
            title: 'Over Temperature',
            value: Number.isFinite(maxTemp) ? maxTemp : null,
            warningThreshold: overTempWarning,
            criticalThreshold: overTempCritical,
            unit: 'C',
            severity: resolveThresholdSeverity(maxTemp, overTempWarning, overTempCritical, true)
        }
    }
}

/**
 * @brief Detect newly-entered critical channels between two severity snapshots.
 * @param {Object} previousState - Previous evaluateChannelThresholds output
 * @param {Object} nextState - Next evaluateChannelThresholds output
 * @returns {Array<Object>} Critical transition list
 */
export function getCriticalTransitions(previousState, nextState) {
    const prev = previousState && typeof previousState === 'object' ? previousState : {}
    const next = nextState && typeof nextState === 'object' ? nextState : {}
    const transitions = []

    Object.keys(next).forEach((channelKey) => {
        const nextChannel = next[channelKey] || {}
        const prevChannel = prev[channelKey] || {}
        if (nextChannel.severity !== 'critical' || prevChannel.severity === 'critical') return
        if (!Number.isFinite(nextChannel.value)) return

        transitions.push({
            channel: channelKey,
            title: nextChannel.title || channelKey,
            value: nextChannel.value,
            unit: nextChannel.unit || '',
            threshold: nextChannel.criticalThreshold,
            message: `Critical: ${nextChannel.title || channelKey} reached ${nextChannel.value.toFixed(2)} ${nextChannel.unit || ''}`
        })
    })

    return transitions
}
