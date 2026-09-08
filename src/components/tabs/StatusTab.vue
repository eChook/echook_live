<!--
  @file components/tabs/StatusTab.vue
  @brief Car Status homescreen — at-a-glance race health without reading a chart.
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { ExclamationTriangleIcon, LockClosedIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore, DEFAULT_BATTERY_PACK_SETTINGS } from '../../stores/settings'
import { useBatteryStore } from '../../stores/battery'
import { useAuthStore } from '../../stores/auth'
import StatusPanel from '../ui/StatusPanel.vue'
import StatusWindowControl from '../ui/StatusWindowControl.vue'
import AnalyticsWindowPickerModal from '../analytics/AnalyticsWindowPickerModal.vue'
import FitBatteryPicker from './batteries/FitBatteryPicker.vue'
import { formatClockTime } from '../../utils/formatting'
import {
    computeChannelHistogram,
    computeThrottleBrakeOverlap,
    computeSupplyResistance,
    computeBatteryWindowMetrics,
    computeBatterySoC,
    computeEnergyThermalSummary,
    detectReliabilityEvents,
    detectRaceStart,
    integratePeukertNormalizedNetAh,
    buildEventJumpWindow,
    computeValueDistribution,
    findValueBinIndex
} from '../../utils/analyticsMetrics'
import { exportEventsAsCsv } from '../../utils/csvExport'
import { CARD_THRESHOLD_KEYS, evaluateChannelThresholds } from '../../utils/eventThresholds'
import { filterSamplesByWindow, clampWindowBounds } from '../../utils/analyticsWindow'
import {
    selectTopRateOfChangeWarning,
    RATE_WARNING_CHANNELS,
    extractTrailingChannelPoints,
    computeLeastSquaresSlopePerMinute
} from '../../utils/rateOfChangeWarnings'
import {
    computeGapMetrics,
    computePacketRateMetrics,
    computeChannelReporting,
    formatWindowMeta
} from '../../utils/dataQualityMetrics'
import { getCriticalTransitions } from '../../utils/eventThresholds'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()
const battery = useBatteryStore()
const auth = useAuthStore()

/**
 * @brief Window mode: race start→live, custom start→live, or custom range.
 * @type {import('vue').Ref<'race-live'|'from-live'|'range'>}
 */
const windowMode = ref('race-live')
const showWindowPicker = ref(false)
/** @brief True when the picker only sets start (end stays live). */
const pickerLiveMode = ref(true)
const customStartMs = ref(null)
const customEndMs = ref(null)
const previousThresholdState = ref(null)
const showFitPicker = ref(false)
const fitPickerPosition = ref('lower')

/** @brief Demo car cannot use battery store features */
const isDemo = computed(() => auth.user?.id === 'demo-car-1' || auth.user?.isDemo === true)

/** @brief True when neither slot has a battery assigned to this car. */
const noBatteriesFitted = computed(() =>
    !isDemo.value && !battery.currentFitment?.upper && !battery.currentFitment?.lower
)

onMounted(async () => {
    if (isDemo.value || !auth.user?.id) return
    await battery.initializeTab(auth.user.id)
})

/**
 * @brief Open the battery fit picker for a slot.
 * @param {'upper'|'lower'} position - Slot position
 */
function openFitPicker(position) {
    fitPickerPosition.value = position
    showFitPicker.value = true
}

const nowCards = Object.freeze([
    { key: 'speed', label: 'Speed', unitKey: 'speed', description: 'Current wheel speed reported by the car.' },
    { key: 'rpm', label: 'RPM', decimals: 0, description: 'Motor revolutions per minute.' },
    { key: 'voltage', label: 'Pack Voltage', unit: 'V', description: 'Total pack voltage.' },
    { key: 'current', label: 'Current', unit: 'A', description: 'Instantaneous current draw from the pack.' },
    { key: 'temp2', label: 'Motor Temp', unit: '°C', description: 'Peak motor temperature sensor (Temp 2) reading.' },
    { key: 'efficiency', label: 'Efficiency', unitKey: 'efficiency', description: 'Instantaneous distance covered per unit of energy drawn (speed ÷ power).' }
])

const latestTimestamp = computed(() => {
    const latest = telemetry.displayHistory[telemetry.displayHistory.length - 1]
    return latest?.timestamp || Date.now()
})

const oldestTimestamp = computed(() => {
    const oldest = telemetry.displayHistory[0]
    return Number.isFinite(oldest?.timestamp) ? oldest.timestamp : null
})

/** @brief Newest lap-session race start (same source as Analytics / Laps). */
const newestRaceStartMs = computed(() => {
    const races = Object.values(telemetry.races || {})
    if (races.length === 0) return null
    const newest = races.reduce((best, race) =>
        ((Number(race?.startTimeMs) || 0) > (Number(best?.startTimeMs) || 0) ? race : best), null)
    return Number.isFinite(newest?.startTimeMs) ? newest.startTimeMs : null
})

/** @brief Window start for Race → live: lap session, then motion detect, then first sample. */
const raceStartMs = computed(() => {
    if (Number.isFinite(newestRaceStartMs.value)) return newestRaceStartMs.value
    const detected = detectRaceStart(telemetry.displayHistory, {
        speedUnit: settings.unitSettings.speedUnit,
        startCurrentThreshold: analyticsConfig.value.startCurrentThresholdA ?? 10
    })
    if (Number.isFinite(detected.startTimestamp)) return detected.startTimestamp
    return oldestTimestamp.value
})

const windowStartKind = computed(() => (windowMode.value === 'race-live' ? 'race' : 'custom'))
const windowEndKind = computed(() => (windowMode.value === 'range' ? 'custom' : 'live'))

/** @brief Effective analytics window bounds (time-based only) */
const windowBounds = computed(() => {
    if (telemetry.displayHistory.length === 0) return null
    const liveEndMs = latestTimestamp.value
    const startMs = windowMode.value === 'race-live'
        ? raceStartMs.value
        : (customStartMs.value ?? oldestTimestamp.value)
    const endMs = windowMode.value === 'range'
        ? (customEndMs.value ?? liveEndMs)
        : liveEndMs
    return clampWindowBounds(startMs, endMs, oldestTimestamp.value, liveEndMs)
})

const activeSamples = computed(() => {
    const bounds = windowBounds.value
    if (!bounds) return []
    return filterSamplesByWindow(telemetry.displayHistory, bounds.startMs, bounds.endMs)
})

const windowMeta = computed(() => formatWindowMeta(activeSamples.value))

const analyticsConfig = computed(() => settings.analyticsSettings || {})

const irOptions = computed(() => ({
    irCurrentDeadbandA: analyticsConfig.value.irCurrentDeadbandA ?? 0.5,
    irRcTauSec: analyticsConfig.value.irRcTauSec ?? 30,
    irRcResistanceScale: analyticsConfig.value.irRcResistanceScale ?? 0.35
}))

const energySummary = computed(() => computeEnergyThermalSummary(activeSamples.value, {
    speedUnit: settings.unitSettings.speedUnit,
    eventOverTempWarningC: analyticsConfig.value.eventOverTempWarningC,
    eventOverTempCriticalC: analyticsConfig.value.eventOverTempCriticalC
}))

const peukertIntegration = computed(() => integratePeukertNormalizedNetAh(activeSamples.value, {
    peukertExponent: analyticsConfig.value.peukertExponent ?? 1.16,
    nominalCapacityAh: analyticsConfig.value.packNominalCapacityAh
}))

const supplyResistance = computed(() => computeSupplyResistance(activeSamples.value, irOptions.value))

const batteryMetrics = computed(() => computeBatteryWindowMetrics(activeSamples.value, {
    ...irOptions.value,
    packNominalCapacityAh: analyticsConfig.value.packNominalCapacityAh,
    packActualCapacityAh: analyticsConfig.value.packActualCapacityAh
}))

/** @brief Per-battery C/20-curve SoC using each branch's own voltage + resistance fit. */
function branchSoc(voltageKey, resistanceBranch) {
    return computeBatterySoC(activeSamples.value, {
        method: 'c20',
        actualCapacityAh: analyticsConfig.value.packActualCapacityAh,
        nominalCapacityAh: analyticsConfig.value.packNominalCapacityAh,
        peukertExponent: analyticsConfig.value.peukertExponent,
        nominalSeriesVoltage: 12,
        voltageKey,
        supplyResistance: resistanceBranch,
        irCurrentDeadbandA: irOptions.value.irCurrentDeadbandA
    })
}

const batteryConditionCards = computed(() => {
    const branches = supplyResistance.value.branches || {}
    return [
        { label: 'A', soc: branchSoc('voltageHigh', branches.upper), ir: branches.upper },
        { label: 'B', soc: branchSoc('voltageLower', branches.lower), ir: branches.lower }
    ]
})

/** @brief IR divergence between the two branches, mirroring supplyResistance.absDeltaMilliOhm. */
const irDiverges = computed(() => {
    const branches = supplyResistance.value.branches || {}
    const delta = supplyResistance.value.absDeltaMilliOhm
    const avg = branches.upper?.valid && branches.lower?.valid
        ? (branches.upper.rMilliOhm + branches.lower.rMilliOhm) / 2
        : null
    return Number.isFinite(delta) && Number.isFinite(avg) && avg > 0 && delta > avg * 0.15
})

/** @brief Raw discharge Ah for the active window (from battery health metrics or Peukert integration). */
const windowDischargeAh = computed(() => {
    const fromHealth = batteryMetrics.value.health?.peukert?.windowDischargeAh
    if (Number.isFinite(fromHealth)) return fromHealth
    return peukertIntegration.value.normalizedDischargeAh ?? null
})

const windowDurationMin = computed(() => {
    const bounds = windowBounds.value
    if (!bounds) return null
    return Math.max((bounds.endMs - bounds.startMs) / 60000, 0.1)
})

/** @brief Standard pack capacity (Ah) used as a last-resort reference — the Greenpower-spec Ursa pack. */
const STANDARD_URSA_PACK_AH = DEFAULT_BATTERY_PACK_SETTINGS.packNominalCapacityAh

/** @brief Capacity (Ah) of each currently-assigned battery, resolved from the store's fitment + roster. */
const assignedBatteryCapacitiesAh = computed(() => {
    if (isDemo.value) return []
    const ids = [battery.currentFitment?.upper?.id, battery.currentFitment?.lower?.id].filter(Boolean)
    return ids
        .map((id) => battery.batteries.find((row) => row.id === id))
        .map((row) => Number(row?.actualCapacity) || Number(row?.originalCapacity))
        .filter((value) => Number.isFinite(value) && value > 0)
})

/**
 * @brief Reference pack capacity (Ah) for the Energy delivered panel and its source.
 * @description Priority: a team-entered figure from Settings, then the weakest assigned
 *              battery's capacity (series string is limited by the smaller pack), then the
 *              standard Ursa pack spec as a labelled default.
 */
const energyReferenceInfo = computed(() => {
    const manual = analyticsConfig.value.energyReferenceAh
    if (Number.isFinite(manual) && manual > 0) return { ah: manual, source: 'manual' }

    const caps = assignedBatteryCapacitiesAh.value
    if (caps.length > 0) return { ah: Math.min(...caps), source: 'battery' }

    return { ah: STANDARD_URSA_PACK_AH, source: 'default' }
})

const energyReference = computed(() => energyReferenceInfo.value.ah)
const energyUsedPct = computed(() => {
    if (!energyReference.value || energyReference.value <= 0) return null
    const discharge = windowDischargeAh.value
    if (!Number.isFinite(discharge)) return null
    return (discharge / energyReference.value) * 100
})

/** @brief Energy panel headline metrics for the template. */
const energyPanelMetrics = computed(() => {
    const discharge = windowDischargeAh.value
    const durationMin = windowDurationMin.value
    const rate = Number.isFinite(discharge) && Number.isFinite(durationMin)
        ? discharge / durationMin
        : null
    return [
        { label: 'Charge out', value: formatNum(discharge, 2), unit: 'Ah', description: 'Total charge drawn from the pack in this window.' },
        { label: 'Energy out', value: formatNum(energySummary.value.totalWh, 1), unit: 'Wh', description: 'Total energy delivered in this window.' },
        { label: 'Rate', value: formatNum(rate, 2), unit: 'Ah/min', description: 'Average discharge rate over this window.' },
        { label: 'Peukert-norm.', value: formatNum(peukertIntegration.value.normalizedNetAh, 2), unit: 'Ah', description: "Discharge normalized for the Peukert effect, which reduces a battery's usable capacity at high current." }
    ]
})

/** @brief Max motor (temp2) and ambient (temp1) readings in the window. */
const thermalSummary = computed(() => {
    let maxMotor = null
    let maxAmbient = null
    for (const sample of activeSamples.value) {
        const temp1 = Number(sample?.temp1)
        const temp2 = Number(sample?.temp2)
        if (Number.isFinite(temp2)) {
            maxMotor = maxMotor === null ? temp2 : Math.max(maxMotor, temp2)
        }
        if (Number.isFinite(temp1)) {
            maxAmbient = maxAmbient === null ? temp1 : Math.max(maxAmbient, temp1)
        }
    }
    return { maxMotor, maxAmbient }
})

/** @brief Time-in-band segments for motor temp2 using configured warning/critical thresholds. */
const motorBandSegments = computed(() => {
    const warningC = analyticsConfig.value.eventOverTempWarningC ?? 65
    const criticalC = analyticsConfig.value.eventOverTempCriticalC ?? 70
    const samples = activeSamples.value
    if (samples.length < 2) return []

    let belowMs = 0
    let warnMs = 0
    let criticalMs = 0
    let totalMs = 0
    const maxDtMs = 10000

    for (let index = 0; index < samples.length - 1; index += 1) {
        const ts = Number(samples[index]?.timestamp)
        const nextTs = Number(samples[index + 1]?.timestamp)
        if (!Number.isFinite(ts) || !Number.isFinite(nextTs)) continue
        const dtMs = nextTs - ts
        if (dtMs <= 0 || dtMs > maxDtMs) continue

        const temp = Number(samples[index]?.temp2)
        if (!Number.isFinite(temp)) continue

        totalMs += dtMs
        if (temp >= criticalC) criticalMs += dtMs
        else if (temp >= warningC) warnMs += dtMs
        else belowMs += dtMs
    }

    if (totalMs <= 0) return []
    return [
        { pct: (belowMs / totalMs) * 100 },
        { pct: (warnMs / totalMs) * 100 },
        { pct: (criticalMs / totalMs) * 100 }
    ]
})

/** @brief Largest voltage sag from a preceding local high, with the current drawn at that point. */
const peakSag = computed(() => {
    let runningMaxV = null
    let bestSagV = null
    let bestCurrentA = null
    for (const sample of activeSamples.value) {
        const voltage = Number(sample?.voltage)
        if (!Number.isFinite(voltage)) continue
        if (runningMaxV === null || voltage > runningMaxV) runningMaxV = voltage
        const sag = runningMaxV - voltage
        if (bestSagV === null || sag > bestSagV) {
            bestSagV = sag
            const current = Number(sample?.current)
            bestCurrentA = Number.isFinite(current) ? current : null
        }
    }
    return { sagV: bestSagV, currentA: bestCurrentA }
})

/** @brief Largest A/B branch voltage divergence while under meaningful load. */
const batteryVoltageSpread = computed(() => {
    let maxDiff = null
    for (const sample of activeSamples.value) {
        const vHigh = Number(sample?.voltageHigh)
        const vLow = Number(sample?.voltageLower)
        const current = Number(sample?.current)
        if (!Number.isFinite(vHigh) || !Number.isFinite(vLow)) continue
        if (!Number.isFinite(current) || Math.abs(current) < 5) continue
        const diff = Math.abs(vHigh - vLow)
        if (maxDiff === null || diff > maxDiff) maxDiff = diff
    }
    return maxDiff
})

const throttleHist = computed(() => computeChannelHistogram(activeSamples.value, 'throttle'))
const throttleOverlap = computed(() => computeThrottleBrakeOverlap(activeSamples.value, {
    throttleThresholdPct: analyticsConfig.value.throttleOverlapThresholdPct ?? 5
}))

const dataQuality = computed(() => {
    const gaps = computeGapMetrics(activeSamples.value)
    const packets = computePacketRateMetrics(activeSamples.value, telemetry.lastPacketTime)
    const channels = computeChannelReporting(activeSamples.value, telemetry.availableKeys)
    return { gaps, packets, channels }
})

/** @brief Fraction of window time spent above 90% throttle. */
const throttleAbove90Pct = computed(() => {
    const samples = activeSamples.value
    if (samples.length < 2) return null

    let aboveMs = 0
    let totalMs = 0
    const maxDtMs = 10000

    for (let index = 0; index < samples.length - 1; index += 1) {
        const ts = Number(samples[index]?.timestamp)
        const nextTs = Number(samples[index + 1]?.timestamp)
        if (!Number.isFinite(ts) || !Number.isFinite(nextTs)) continue
        const dtMs = nextTs - ts
        if (dtMs <= 0 || dtMs > maxDtMs) continue

        const throttle = Number(samples[index]?.throttle)
        if (!Number.isFinite(throttle)) continue

        totalMs += dtMs
        if (throttle > 90) aboveMs += dtMs
    }

    return totalMs > 0 ? (aboveMs / totalMs) * 100 : null
})

/** @brief Max bin timePct in throttle histogram for bar scaling. */
const throttleHistMaxTimePct = computed(() => {
    const bins = throttleHist.value.bins || []
    if (bins.length === 0) return 1
    return Math.max(...bins.map((bin) => bin.timePct || 0), 1)
})

const reliabilityEvents = computed(() => detectReliabilityEvents(activeSamples.value, analyticsConfig.value))

const thresholdEvents = computed(() => {
    const transitions = []
    let prev = previousThresholdState.value
    for (const sample of activeSamples.value) {
        const next = evaluateChannelThresholds(sample, analyticsConfig.value)
        transitions.push(...getCriticalTransitions(prev, next))
        prev = next
    }
    previousThresholdState.value = prev
    return transitions
})

const detectedEvents = computed(() => [...reliabilityEvents.value, ...thresholdEvents.value]
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)))

const rateWarning = computed(() =>
    selectTopRateOfChangeWarning(telemetry.history, analyticsConfig.value, latestTimestamp.value)
)

const liveThresholdStatus = computed(() =>
    evaluateChannelThresholds(telemetry.liveData, analyticsConfig.value)
)

const staleAgeSec = computed(() => {
    if (!telemetry.lastPacketTime) return null
    return Math.max(0, Math.floor((Date.now() - telemetry.lastPacketTime) / 1000))
})

/**
 * @brief Format a numeric metric for display, or em dash when missing.
 * @param {number|null|undefined} value - Metric value
 * @param {number} [decimals=1] - Decimal places
 * @returns {string}
 */
function formatNum(value, decimals = 1) {
    if (!Number.isFinite(Number(value))) return '—'
    return Number(value).toFixed(decimals)
}

/**
 * @brief Instantaneous distance-per-energy value for a sample (speed ÷ power).
 * @description Undefined (null) below a small power floor, where the ratio is noisy or
 *              the car is coasting/regenerating rather than drawing meaningful power.
 * @param {Object} sample - Telemetry sample (display units)
 * @returns {number|null} Distance-unit per kWh, or null when not meaningful
 */
function efficiencyValue(sample) {
    const speed = Number(sample?.speed)
    const powerW = Number(sample?.powerW)
    if (!Number.isFinite(speed) || !Number.isFinite(powerW) || powerW < 50) return null
    return speed / (powerW / 1000)
}

/**
 * @brief Smoothed "now" efficiency: distance ÷ energy over a short trailing window.
 * @description A single live packet's speed÷power ratio is too noisy to display as a
 *              headline number — it blanks out on every low-power instant (coasting,
 *              a throttle lift, regen) even while the car is clearly still moving and
 *              using energy. Integrating distance and energy over the last few seconds
 *              gives a stable figure that only goes blank when the car is genuinely
 *              stationary/idle for that whole window.
 * @returns {number|null} Distance-unit per kWh, or null when too little energy was drawn to be meaningful
 */
const liveEfficiencyValue = computed(() => {
    const history = telemetry.displayHistory
    if (history.length < 2) return null
    const trailingWindowMs = 15000
    const maxDtMs = 10000
    /** @brief Minimum *average* power over the window to trust the ratio — well below the car's typical draw, just enough to reject true idle. */
    const minAveragePowerW = 20
    const whFloor = minAveragePowerW * (trailingWindowMs / 3600000)
    const latestTs = Number(history[history.length - 1]?.timestamp)
    if (!Number.isFinite(latestTs)) return null
    const cutoffTs = latestTs - trailingWindowMs

    let distance = 0
    let wh = 0
    for (let i = history.length - 2; i >= 0; i -= 1) {
        const current = history[i]
        const next = history[i + 1]
        const ts = Number(current?.timestamp)
        const nextTs = Number(next?.timestamp)
        if (!Number.isFinite(ts) || !Number.isFinite(nextTs)) continue
        if (nextTs < cutoffTs) break

        const dtMs = nextTs - ts
        if (!(dtMs > 0 && dtMs <= maxDtMs)) continue

        const speed = Number(current?.speed)
        const powerW = Number(current?.powerW)
        if (!Number.isFinite(speed) || !Number.isFinite(powerW)) continue

        const dtH = dtMs / 3600000
        distance += speed * dtH
        wh += Math.max(0, powerW) * dtH
    }

    if (wh < whFloor) return null
    return distance / (wh / 1000)
})

/**
 * @brief Resolve a now-card's numeric value from a sample, routing derived cards through their accessor.
 * @param {Object} sample - Telemetry sample (display units)
 * @param {string} key - Card key
 * @returns {number|null}
 */
function cardValue(sample, key) {
    if (key === 'efficiency') return efficiencyValue(sample)
    const raw = Number(sample?.[key])
    return Number.isFinite(raw) ? raw : null
}

/**
 * @brief Resolve a now-card's live headline value, smoothing derived cards that are too noisy pointwise.
 * @param {string} key - Card key
 * @returns {number|null}
 */
function liveCardValue(key) {
    if (key === 'efficiency') return liveEfficiencyValue.value
    return cardValue(telemetry.displayLiveData, key)
}

/**
 * @brief Time-weighted "time spent at this value" histogram per now-card, over the active window.
 * @type {import('vue').ComputedRef<Object.<string, Object>>}
 */
const cardHistograms = computed(() => {
    const map = {}
    for (const card of nowCards) {
        map[card.key] = computeValueDistribution(activeSamples.value, {
            getValue: (s) => cardValue(s, card.key),
            binCount: 14
        })
    }
    return map
})

/**
 * @brief Index of the bin the car's current live value falls into, for highlighting.
 * @param {string} key - Card key
 * @returns {number} Bin index, or -1 when no live value or window data is available
 */
function currentBinIndex(key) {
    const hist = cardHistograms.value[key]
    if (!hist || hist.bins.length === 0) return -1
    const value = liveCardValue(key)
    if (value === null) return -1
    return findValueBinIndex(hist.bins, value)
}

/**
 * @brief Max bin timePct for a card, used to scale bar heights within the histogram.
 * @param {string} key - Card key
 * @returns {number}
 */
function cardHistMaxPct(key) {
    const bins = cardHistograms.value[key]?.bins || []
    if (bins.length === 0) return 1
    return Math.max(...bins.map((b) => b.timePct || 0), 1)
}

/**
 * @brief Card footer stats from window samples.
 * @param {string} key - Telemetry key
 * @returns {{left: string, right: string}}
 */
function cardFooter(key) {
    const values = activeSamples.value.map((s) => cardValue(s, key)).filter((v) => Number.isFinite(v))
    if (values.length === 0) return { left: '—', right: '—' }
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const max = Math.max(...values)
    const min = Math.min(...values)

    if (cardSeverity(key) !== 'normal') {
        const channel = CARD_THRESHOLD_KEYS[key]
        const warningThreshold = liveThresholdStatus.value?.[channel]?.warningThreshold
        return {
            left: Number.isFinite(warningThreshold) ? `your warn ${warningThreshold.toFixed(0)}` : '—',
            right: `max ${max.toFixed(1)}`
        }
    }

    if (key === 'voltage') return { left: `min ${min.toFixed(1)}`, right: `max ${max.toFixed(1)}` }
    if (key === 'current') return { left: `mean ${mean.toFixed(1)}`, right: `peak ${max.toFixed(1)}` }
    return { left: `mean ${mean.toFixed(1)}`, right: `max ${max.toFixed(1)}` }
}

/** @brief Rate-of-change badge label for a warning-state card (e.g. "+2.1/min"), or null. */
function cardRateBadge(key) {
    if (cardSeverity(key) === 'normal') return null
    const channel = RATE_WARNING_CHANNELS.find((c) => c.sampleKey === key)
    if (!channel) return null
    const points = extractTrailingChannelPoints(telemetry.history, channel.sampleKey, latestTimestamp.value, 3 * 60 * 1000, channel.useAbs)
    const slope = computeLeastSquaresSlopePerMinute(points)
    if (!Number.isFinite(slope)) return null
    const sign = slope >= 0 ? '+' : ''
    return `${sign}${slope.toFixed(1)}/min`
}

/** @brief Sparkline bar colour for a warning-state card, climbing #57534e → #f59e0b → #fcd34d with bar height. */
function sparklineBarColor(heightPct) {
    if (heightPct >= 75) return '#fcd34d'
    if (heightPct >= 40) return '#f59e0b'
    return '#57534e'
}

/**
 * @brief Display value for a now card.
 * @param {string} key - Telemetry key
 * @returns {string}
 */
function nowValue(key) {
    const value = liveCardValue(key)
    if (value === null) return '—'
    const decimals = nowCards.find((card) => card.key === key)?.decimals ?? 1
    return value.toFixed(decimals)
}

/**
 * @brief Unit suffix for speed card.
 * @returns {string}
 */
function speedUnit() {
    return settings.unitSettings.speedUnit === 'kph' ? 'km/h' : 'mph'
}

/**
 * @brief Unit suffix for efficiency card (distance unit per kWh, matching the speed unit setting).
 * @returns {string}
 */
function efficiencyUnit() {
    if (settings.unitSettings.speedUnit === 'kph') return 'km/kWh'
    if (settings.unitSettings.speedUnit === 'ms') return 'm/kJ'
    return 'mi/kWh'
}

/**
 * @brief Threshold severity for a card.
 * @param {string} key - Card key
 * @returns {'normal'|'warning'|'critical'}
 */
function cardSeverity(key) {
    const channel = CARD_THRESHOLD_KEYS[key]
    if (!channel) return 'normal'
    const sev = liveThresholdStatus.value?.[channel]?.severity
    return sev === 'warning' || sev === 'critical' ? sev : 'normal'
}

/**
 * @brief Open graph tab on a channel from warning banner.
 * @param {string} channelKey - Channel key
 */
function openInGraph(channelKey) {
    const map = { temp1: 'temp1', temp2: 'temp2', current: 'current', voltage: 'voltage' }
    const key = map[channelKey] || channelKey
    if (!settings.selectedDashboardKeys.includes(key)) {
        settings.selectedDashboardKeys = [...settings.selectedDashboardKeys, key]
    }
    settings.activeTabId = 'graph'
}

/** @brief Return chart to live scroll */
function returnToLive() {
    telemetry.requestChartUnlock()
}

/** @brief Export detected events CSV */
function exportCsv() {
    exportEventsAsCsv(detectedEvents.value, { filenamePrefix: 'eChook-events' })
}

/**
 * @brief Jump to event in graph.
 * @param {Object} event - Event row
 */
function jumpToEvent(event) {
    const window = buildEventJumpWindow(event, { paddingBeforeMs: 15000, paddingAfterMs: 15000 })
    if (window) {
        telemetry.requestChartZoom(window.start, window.end, 'EVENT')
        settings.activeTabId = 'graph'
    }
}

/**
 * @brief Open the voltage timeline picker.
 * @param {boolean} liveEnd - When true, only the start marker is chosen
 */
function openWindowPicker(liveEnd) {
    pickerLiveMode.value = liveEnd
    showWindowPicker.value = true
}

/** @brief Use race start through live packets. */
function selectRaceStart() {
    windowMode.value = 'race-live'
}

/** @brief Pick a custom start; end stays live. */
function pickCustomStart() {
    windowMode.value = 'from-live'
    openWindowPicker(true)
}

/** @brief Keep the current start and follow live. */
function selectLiveEnd() {
    if (windowMode.value === 'range') {
        windowMode.value = 'from-live'
        customEndMs.value = null
        return
    }
    if (windowMode.value === 'race-live') return
    windowMode.value = 'from-live'
}

/** @brief Pick both start and end on the timeline. */
function pickCustomEnd() {
    if (windowMode.value === 'race-live') return
    windowMode.value = 'range'
    openWindowPicker(false)
}

/**
 * @brief Apply custom window from picker modal.
 * @param {{startMs: number, endMs: number}} bounds - Selected bounds
 */
function applyCustomWindow(bounds) {
    customStartMs.value = bounds.startMs
    if (pickerLiveMode.value) {
        customEndMs.value = null
        windowMode.value = 'from-live'
    } else {
        customEndMs.value = bounds.endMs
        windowMode.value = 'range'
    }
    showWindowPicker.value = false
}

/**
 * @brief Close picker; revert if the chosen mode has no times yet.
 */
function closeWindowPicker() {
    showWindowPicker.value = false
    if (windowMode.value === 'from-live' && !Number.isFinite(customStartMs.value)) {
        windowMode.value = 'race-live'
    }
    if (windowMode.value === 'range' && (!Number.isFinite(customStartMs.value) || !Number.isFinite(customEndMs.value))) {
        windowMode.value = Number.isFinite(customStartMs.value) ? 'from-live' : 'race-live'
    }
}
</script>

<template>
    <div class="h-full overflow-y-auto bg-[color:var(--app-bg)]">
        <div class="px-5 md:px-6 pt-5 pb-12 max-w-[1400px] mx-auto space-y-4">
            <!-- Title row -->
            <div class="flex flex-wrap items-center gap-3">
                <h1 class="text-xl font-bold text-zinc-900 dark:text-white m-0">Car Status</h1>
                <StatusWindowControl
                    :start-kind="windowStartKind"
                    :end-kind="windowEndKind"
                    :start-time-label="Number.isFinite(customStartMs) ? formatClockTime(customStartMs) : ''"
                    :end-time-label="Number.isFinite(customEndMs) ? formatClockTime(customEndMs) : ''"
                    :race-start-label="Number.isFinite(newestRaceStartMs) ? formatClockTime(newestRaceStartMs) : ''"
                    @select-race="selectRaceStart"
                    @pick-start="pickCustomStart"
                    @select-live="selectLiveEnd"
                    @pick-end="pickCustomEnd" />
                <span class="font-mono text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">{{ windowMeta }}</span>
                <div class="ml-auto">
                    <button v-if="telemetry.isChartZoomLocked" type="button"
                        class="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-900/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200"
                        @click="returnToLive">
                        <LockClosedIcon class="h-3.5 w-3.5" />
                        LOCKED · {{ telemetry.chartZoomLockLabel || 'CUSTOM' }}
                        <span class="font-normal normal-case underline ml-1">Return to live (L)</span>
                    </button>
                    <span v-else
                        class="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-pink-700 dark:text-pink-300">
                        <span class="h-2 w-2 rounded-full bg-primary echook-status-pulse" aria-hidden="true" />
                        FOLLOWING LIVE
                    </span>
                </div>
            </div>

            <!-- Predictive warning (max one) -->
            <div v-if="rateWarning"
                class="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500 bg-amber-900/15 px-4 py-3">
                <ExclamationTriangleIcon class="h-5 w-5 shrink-0 text-amber-300" />
                <span class="text-sm font-semibold text-amber-100 flex-1">{{ rateWarning.message }}</span>
                <button type="button" class="text-xs text-amber-300 underline shrink-0"
                    @click="openInGraph(rateWarning.channelKey)">Open in Graph</button>
            </div>

            <!-- Now cards -->
            <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(212px,1fr))]">
                <article v-for="card in nowCards" :key="card.key"
                    class="flex flex-col gap-2 rounded-lg border p-4 transition"
                    :class="[
                        cardSeverity(card.key) !== 'normal'
                            ? 'border-amber-500 bg-amber-900/15'
                            : 'border-zinc-200 dark:border-[color:var(--app-border)] bg-white dark:bg-[color:var(--app-surface)]',
                        telemetry.isDataStale ? 'opacity-50 grayscale' : ''
                    ]">
                    <div class="flex items-start justify-between">
                        <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-[color:var(--app-muted)] cursor-help"
                            :title="card.description">
                            {{ card.label }}
                            <span v-if="card.unitKey || card.unit" class="font-normal">({{ card.unitKey === 'speed' ? speedUnit() : card.unitKey === 'efficiency' ? efficiencyUnit() : card.unit }})</span>
                        </span>
                        <span v-if="cardRateBadge(card.key)"
                            class="font-mono text-[11px] font-bold text-amber-300">{{ cardRateBadge(card.key) }}</span>
                        <span v-else-if="staleAgeSec !== null && telemetry.isDataStale"
                            class="font-mono text-[11px] text-zinc-400">{{ staleAgeSec }}s</span>
                    </div>
                    <span class="font-mono text-[40px] font-bold leading-none"
                        :class="cardSeverity(card.key) !== 'normal' ? 'text-amber-300' : 'text-zinc-900 dark:text-white'">
                        {{ nowValue(card.key) }}
                    </span>
                    <div class="flex h-6 items-end gap-0.5" :title="`Time spent at each ${card.label.toLowerCase()} value in this window`">
                        <div v-for="(bin, i) in cardHistograms[card.key].bins" :key="i" class="flex-1 rounded-sm min-h-[4px]"
                            :class="cardSeverity(card.key) === 'normal' ? (i === currentBinIndex(card.key) ? 'bg-primary' : 'bg-zinc-300 dark:bg-neutral-600') : ''"
                            :style="{
                                height: `${Math.max(8, (bin.timePct / cardHistMaxPct(card.key)) * 100)}%`,
                                backgroundColor: cardSeverity(card.key) !== 'normal' ? sparklineBarColor((bin.timePct / cardHistMaxPct(card.key)) * 100) : undefined,
                                opacity: cardSeverity(card.key) !== 'normal' && i === currentBinIndex(card.key) ? 1 : (cardSeverity(card.key) !== 'normal' ? 0.55 : undefined)
                            }" />
                    </div>
                    <div class="flex justify-between border-t border-zinc-200 dark:border-[color:var(--app-hairline)] pt-1 font-mono text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                        <span>{{ cardFooter(card.key).left }}</span>
                        <span>{{ cardFooter(card.key).right }}</span>
                    </div>
                </article>
            </div>

            <!-- Two-up: Energy + Battery -->
            <div class="grid gap-4 lg:grid-cols-2">
                <StatusPanel title="Energy delivered" note="this window">
                    <div class="flex flex-wrap gap-6 mb-4">
                        <div v-for="item in energyPanelMetrics" :key="item.label">
                            <div class="text-[10px] font-bold uppercase text-zinc-500 dark:text-[color:var(--app-muted)] cursor-help" :title="item.description">{{ item.label }}</div>
                            <div class="font-mono text-[28px] font-bold text-zinc-900 dark:text-white leading-tight">
                                {{ item.value }}<span class="text-sm font-normal text-zinc-500 dark:text-[color:var(--app-muted)] ml-1">{{ item.unit }}</span>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <p class="text-xs text-zinc-600 dark:text-[color:var(--app-secondary)]">
                            Against <strong>{{ energyReferenceInfo.source === 'default' ? 'a default' : 'your' }}</strong> reference: {{ formatNum(energyReference, 1) }} Ah · {{ formatNum(energyUsedPct, 1) }}% used
                        </p>
                        <div class="h-3 rounded-md border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-100 dark:bg-[color:var(--app-bg)] overflow-hidden">
                            <div class="h-full rounded-md" :class="energyReferenceInfo.source === 'default' ? 'bg-amber-400' : 'bg-primary'" :style="{ width: `${Math.min(100, energyUsedPct || 0)}%` }" />
                        </div>
                        <p v-if="energyReferenceInfo.source === 'manual'" class="text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                            Reference is the figure your team entered in Settings. eChook does not know your pack's real capacity.
                        </p>
                        <p v-else-if="energyReferenceInfo.source === 'battery'" class="text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)]">
                            Reference is the measured capacity of your assigned pack (weaker of Batt A/B).
                            <button type="button" class="text-primary dark:text-[color:var(--app-link)] underline ml-1"
                                @click="settings.activeTabId = 'settings'">Set your own</button>
                        </p>
                        <p v-else class="flex items-center gap-1.5 text-[11px] font-semibold text-amber-500 dark:text-amber-400">
                            <ExclamationTriangleIcon class="h-3.5 w-3.5 shrink-0" />
                            Using a default reference — standard Ursa pack, {{ STANDARD_URSA_PACK_AH }} Ah. No batteries assigned and no team figure set.
                            <button type="button" class="text-primary dark:text-[color:var(--app-link)] underline"
                                @click="settings.activeTabId = 'settings'">Set your own</button>
                        </p>
                    </div>
                </StatusPanel>

                <StatusPanel title="Battery condition" note="from voltage & current only">
                    <template #header-extra>
                        <span class="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-950">Estimate</span>
                    </template>
                    <div v-if="noBatteriesFitted"
                        class="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-zinc-400 dark:border-neutral-600 bg-zinc-50 dark:bg-[color:var(--app-bg)] px-3 py-2.5 mb-4">
                        <span class="text-xs text-zinc-600 dark:text-[color:var(--app-secondary)] flex-1">
                            No batteries assigned to this car — condition figures below are unavailable until packs are fitted.
                        </span>
                        <button type="button"
                            class="inline-flex h-8 items-center justify-center rounded-md border border-primary bg-white dark:bg-[color:var(--app-surface)] px-3 text-xs font-semibold text-pink-700 dark:text-pink-300 hover:bg-primary/5 transition"
                            @click="openFitPicker('upper')">
                            Assign Batt A
                        </button>
                        <button type="button"
                            class="inline-flex h-8 items-center justify-center rounded-md border border-primary bg-white dark:bg-[color:var(--app-surface)] px-3 text-xs font-semibold text-pink-700 dark:text-pink-300 hover:bg-primary/5 transition"
                            @click="openFitPicker('lower')">
                            Assign Batt B
                        </button>
                    </div>
                    <div class="space-y-3 mb-4">
                        <div v-for="card in batteryConditionCards" :key="card.label" class="flex items-center gap-3">
                            <span class="w-16 font-mono text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)] cursor-help" title="Estimated state of charge for this branch, from the Yuasa C20 curve at estimated rest voltage.">Batt {{ card.label }}</span>
                            <div class="flex-1 h-[26px] rounded-md border border-zinc-200 dark:border-[color:var(--app-border)] bg-zinc-100 dark:bg-[color:var(--app-bg)] relative overflow-hidden">
                                <div class="absolute inset-y-0 left-0 bg-primary/55 rounded-md"
                                    :style="{ width: `${Math.max(0, Math.min(100, card.soc.socPct ?? 0))}%` }" />
                                <div class="absolute inset-y-0 bg-primary/25 rounded-md"
                                    :style="{ left: `${Math.max(0, (card.soc.socPct ?? 0) - 6)}%`, width: '12%' }" />
                            </div>
                            <span class="font-mono text-base font-bold text-zinc-900 dark:text-white w-16 text-right">
                                {{ formatNum(card.soc.socPct, 0) }}<span class="text-[11px] font-normal text-zinc-500"> ±6%</span>
                            </span>
                        </div>
                    </div>
                    <p class="text-[11px] text-zinc-500 dark:text-[color:var(--app-muted)] mb-4">
                        State of charge inferred from the Yuasa C20 curve at estimated rest voltage. Confidence <strong>medium</strong> — shaded band is the uncertainty. Not a fuel gauge; treat as a trend.
                    </p>
                    <div class="grid gap-3 sm:grid-cols-2 border-t border-zinc-200 dark:border-[color:var(--app-border)] pt-4 text-xs">
                        <div>
                            <div class="flex justify-between"><span class="uppercase font-bold text-zinc-500 cursor-help" title="Estimated internal resistance of branch A, from voltage sag under load.">IR est. A</span><span class="font-mono font-bold" :class="irDiverges ? 'text-amber-400' : ''">{{ formatNum(batteryConditionCards[0].ir?.rMilliOhm, 1) }} mΩ</span></div>
                        </div>
                        <div>
                            <div class="flex justify-between"><span class="uppercase font-bold text-zinc-500 cursor-help" title="Estimated internal resistance of branch B, from voltage sag under load.">IR est. B</span><span class="font-mono font-bold" :class="irDiverges ? 'text-amber-400' : ''">{{ formatNum(batteryConditionCards[1].ir?.rMilliOhm, 1) }} mΩ</span></div>
                        </div>
                        <div>
                            <div class="flex justify-between"><span class="uppercase font-bold text-zinc-500 cursor-help" title="Largest voltage drop from a preceding local high, and the current drawn at that moment.">Sag @ peak</span><span class="font-mono font-bold">{{ formatNum(peakSag.sagV, 2) }} V</span></div>
                            <div class="font-mono text-[10px] text-zinc-500 dark:text-[color:var(--app-muted)]">at {{ formatNum(peakSag.currentA, 1) }} A</div>
                        </div>
                        <div>
                            <div class="flex justify-between"><span class="uppercase font-bold text-zinc-500 cursor-help" title="Largest voltage difference between the A and B branches while under meaningful load.">A–B spread</span><span class="font-mono font-bold">{{ formatNum(batteryVoltageSpread, 2) }} V</span></div>
                            <div class="font-mono text-[10px] text-zinc-500 dark:text-[color:var(--app-muted)]">under load</div>
                        </div>
                    </div>
                </StatusPanel>
            </div>

            <!-- Three-up -->
            <div class="grid gap-4 lg:grid-cols-3">
                <StatusPanel title="Thermal">
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between"><span class="text-zinc-500 cursor-help" title="Peak motor temperature (Temp 2) in this window.">Motor</span><span class="font-mono font-bold">{{ formatNum(thermalSummary.maxMotor, 0) }} °C</span></div>
                        <div class="flex justify-between"><span class="text-zinc-500 cursor-help" title="Peak ambient temperature (Temp 1) in this window.">Ambient</span><span class="font-mono font-bold">{{ formatNum(thermalSummary.maxAmbient, 0) }} °C</span></div>
                        <div class="flex justify-between"><span class="text-zinc-500 cursor-help" title="Difference between motor and ambient temperature — indicates motor-specific heating.">Δ Motor − Ambient</span><span class="font-mono font-bold">{{ formatNum((thermalSummary.maxMotor ?? 0) - (thermalSummary.maxAmbient ?? 0), 0) }} °C</span></div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-zinc-200 dark:border-[color:var(--app-border)]">
                        <p class="text-[10px] font-bold uppercase text-zinc-500 mb-2 cursor-help" title="Share of window time the motor spent below, at, and above the configured temperature thresholds.">Time in band · motor</p>
                        <div class="flex h-5 rounded overflow-hidden border border-zinc-200 dark:border-[color:var(--app-border)]">
                            <div v-for="(seg, i) in motorBandSegments" :key="i" :style="{ width: `${seg.pct}%` }"
                                :class="i === 0 ? 'bg-neutral-600' : i === 1 ? 'bg-amber-500' : 'bg-amber-300'" />
                        </div>
                        <p class="text-[10px] text-zinc-500 dark:text-[color:var(--app-muted)] mt-1">Bands come from the thresholds your team set.</p>
                    </div>
                </StatusPanel>

                <StatusPanel title="Driver inputs">
                    <div class="flex h-16 items-end gap-0.5 mb-2">
                        <div v-for="(bin, i) in (throttleHist.bins || [])" :key="i" class="flex-1 rounded-t-sm bg-zinc-300 dark:bg-neutral-600"
                            :class="i === (throttleHist.bins?.length || 0) - 1 ? '!bg-primary' : ''"
                            :style="{ height: `${Math.max(8, ((bin.timePct || 0) / throttleHistMaxTimePct) * 100)}%` }" />
                    </div>
                    <div class="flex justify-between font-mono text-[10px] text-zinc-500 mb-3"><span>0%</span><span>throttle</span><span>100%</span></div>
                    <div class="space-y-2 text-sm border-t border-zinc-200 dark:border-[color:var(--app-border)] pt-3">
                        <div class="flex justify-between"><span class="cursor-help" title="Share of window time spent above 90% throttle.">Time at &gt;90% throttle</span><span class="font-mono font-bold">{{ formatNum(throttleAbove90Pct, 0) }}%</span></div>
                        <div class="flex justify-between"><span class="cursor-help" title="Number of times throttle and brake were applied together.">Throttle + brake overlap</span><span class="font-mono font-bold" :class="(throttleOverlap.eventCount ?? 0) > 0 ? 'text-amber-400' : ''">{{ throttleOverlap.eventCount ?? 0 }} events</span></div>
                        <div class="flex justify-between"><span class="cursor-help" title="Longest continuous throttle-and-brake overlap event in this window.">Longest overlap</span><span class="font-mono font-bold">{{ formatNum(throttleOverlap.maxDurationSec, 1) }} s</span></div>
                    </div>
                </StatusPanel>

                <StatusPanel title="Data quality" note="be suspicious of gaps">
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between"><span class="cursor-help" title="Telemetry packets received per second.">Packet rate</span><span class="font-mono font-bold">{{ formatNum(dataQuality.packets.packetRatePerSec, 1) }} /s</span></div>
                        <div class="flex justify-between"><span class="cursor-help" title="Time since the most recent telemetry packet was received.">Last packet</span><span class="font-mono font-bold">{{ formatNum(dataQuality.packets.lastPacketAgeSec, 1) }} s ago</span></div>
                        <div class="flex justify-between"><span class="cursor-help" title="Count and duration of the largest gaps in telemetry reception in this window.">Gaps in window</span><span class="font-mono font-bold text-amber-400">{{ dataQuality.gaps.gapCount }} · max {{ formatNum(dataQuality.gaps.maxGapSec, 1) }} s</span></div>
                        <div class="flex justify-between"><span class="cursor-help" title="Number of telemetry channels currently reporting data, out of the total expected.">Channels reporting</span><span class="font-mono font-bold">{{ dataQuality.channels.reporting }} / {{ dataQuality.channels.total }}</span></div>
                    </div>
                </StatusPanel>
            </div>

            <!-- Events table -->
            <StatusPanel title="Detected events">
                <template #header-extra>
                    <button type="button" class="ml-auto text-xs text-primary dark:text-[color:var(--app-link)] hover:underline inline-flex items-center gap-1"
                        @click="exportCsv">
                        <ArrowDownTrayIcon class="h-3.5 w-3.5" /> Export CSV
                    </button>
                </template>
                <p class="text-xs text-zinc-500 dark:text-[color:var(--app-muted)] mb-3">Threshold crossings and signal anomalies in this window</p>
                <div class="overflow-x-auto -mx-5">
                    <table class="min-w-full text-sm">
                        <thead class="bg-zinc-50 dark:bg-[color:var(--app-inset)] text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            <tr>
                                <th class="px-5 py-2 text-left">Time</th>
                                <th class="px-3 py-2 text-left">Channel</th>
                                <th class="px-3 py-2 text-left">Event</th>
                                <th class="px-3 py-2 text-right">Value</th>
                                <th class="px-5 py-2 text-right">Jump</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(event, idx) in detectedEvents.slice(0, 50)" :key="idx"
                                class="border-t border-zinc-100 dark:border-[color:var(--app-hairline)] hover:bg-zinc-50 dark:hover:bg-[#2d2d2d]">
                                <td class="px-5 py-2.5 font-mono text-xs">{{ event.timeLabel || '—' }}</td>
                                <td class="px-3 py-2.5">{{ event.channel || event.label || '—' }}</td>
                                <td class="px-3 py-2.5">{{ event.event || event.type || '—' }}</td>
                                <td class="px-3 py-2.5 font-mono font-bold text-right">{{ event.value ?? '—' }}</td>
                                <td class="px-5 py-2.5 text-right">
                                    <button type="button" class="text-primary dark:text-[color:var(--app-link)] underline text-xs"
                                        @click="jumpToEvent(event)">Jump</button>
                                </td>
                            </tr>
                            <tr v-if="detectedEvents.length === 0">
                                <td colspan="5" class="px-5 py-8 text-center text-zinc-500 italic">No events in this window.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </StatusPanel>

            <p class="text-xs text-zinc-500 dark:text-[color:var(--app-muted)] max-w-[88ch] leading-relaxed">
                Every figure on this screen is measured or derived from telemetry in the selected time window.
                Estimates carry confidence bands; reference values are entered by your team.
            </p>
        </div>

        <AnalyticsWindowPickerModal
            :is-open="showWindowPicker"
            :is-live-mode="pickerLiveMode"
            :samples="telemetry.displayHistory"
            :start-ms="customStartMs"
            :end-ms="customEndMs"
            :oldest-ms="oldestTimestamp"
            :latest-ms="latestTimestamp"
            @close="closeWindowPicker"
            @apply="applyCustomWindow" />

        <FitBatteryPicker
            :is-open="showFitPicker"
            :position="fitPickerPosition"
            @close="showFitPicker = false"
            @fitted="battery.refreshStoreWideFitment(auth.user?.id)" />
    </div>
</template>
