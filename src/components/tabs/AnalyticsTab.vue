<!--
  @file components/tabs/AnalyticsTab.vue
  @brief Admin-only analytics tab for live and historical telemetry insights.
  @description Computes derived metrics from existing telemetry channels:
               race start behavior, throttle histogram, overlap warnings,
               and supply resistance estimation.
-->
<script setup>
import { computed, ref, watch } from 'vue'
import { useTelemetryStore } from '../../stores/telemetry'
import { useSettingsStore } from '../../stores/settings'
import BatterySectionPanel from '../analytics/BatterySectionPanel.vue'
import AnalyticsWindowPickerModal from '../analytics/AnalyticsWindowPickerModal.vue'
import {
  computeThrottleHistogram,
  computeThrottleBrakeOverlap,
  computeStartMetrics,
  computeSupplyResistance,
  computeBatteryWindowMetrics,
  computeSessionStintKpis,
  computeEnergyThermalSummary,
  computeBaselineComparison,
  detectReliabilityEvents,
  buildEventJumpWindow
} from '../../utils/analyticsMetrics'
import { exportEventsAsCsv } from '../../utils/csvExport'
import { METRIC_PRECISION } from '../../utils/metricPrecision'
import {
  formatClockTime,
  computeCapacityDodPercent,
  formatVoltageZoneLabel,
  formatLoadedZoneLabel
} from '../../utils/formatting'
import {
  filterSamplesByWindow,
  clampWindowBounds,
  lapOverlapsWindow,
  resolveLapHistoryBounds
} from '../../utils/analyticsWindow'

const telemetry = useTelemetryStore()
const settings = useSettingsStore()

/** @brief Current analytics mode. */
const mode = ref('live')
/** @brief Window source: lap-derived sessions or user-defined range. */
const windowSource = ref('lap')
/** @brief User-defined window start (ms); session-only, not persisted. */
const userDefinedStartMs = ref(null)
/** @brief User-defined window end (ms); history mode only. */
const userDefinedEndMs = ref(null)
/** @brief User-defined window picker modal visibility. */
const showWindowPickerModal = ref(false)
/** @brief Active analytics sub-tab within the tab panel. */
const activeSubTab = ref('overview')

/** @brief Horizontal sub-tab definitions shown beneath the Analytics header. */
const analyticsSubTabs = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'battery', label: 'Battery' },
  { id: 'events', label: 'Event Log' }
])
/** @brief Selected race key for history mode. */
const selectedRaceKey = ref(null)
/** @brief Optional comparison race key in history mode. */
const selectedComparisonRaceKey = ref(null)
/** @brief Start metrics card open state for auto-collapse behavior. */
const isStartCardOpen = ref(true)
/** @brief Generic metric help modal visibility state. */
const showMetricHelp = ref(false)
/** @brief Currently selected metric id for help modal. */
const activeMetricHelpId = ref(null)
/** @brief Analytics settings with safe defaults. */
const analyticsConfig = computed(() => settings.analyticsSettings || {})

/** @brief IR v2 estimation tuning from analytics settings. */
const irEstimationOptions = computed(() => {
  const config = analyticsConfig.value
  return {
    minSampleCount: 8,
    minCurrentSpread: 5,
    irCurrentDeadbandA: Number.isFinite(config.irCurrentDeadbandA) ? config.irCurrentDeadbandA : 0.5,
    irRcTauSec: Number.isFinite(config.irRcTauSec) ? config.irRcTauSec : 30,
    irRcResistanceScale: Number.isFinite(config.irRcResistanceScale) ? config.irRcResistanceScale : 0.35
  }
})

/** @brief Races sorted newest first. */
const sortedRaces = computed(() =>
  Object.values(telemetry.races).sort((a, b) => b.startTimeMs - a.startTimeMs)
)

watch(sortedRaces, (races) => {
  if (races.length === 0) return
  const selectedStillExists = races.some((race) => String(race.startTimeMs) === selectedRaceKey.value)
  if (!selectedRaceKey.value || !selectedStillExists) {
    selectedRaceKey.value = String(races[0].startTimeMs)
  }
  const comparisonStillExists = races.some((race) => String(race.startTimeMs) === selectedComparisonRaceKey.value)
  if (!selectedComparisonRaceKey.value || !comparisonStillExists || selectedComparisonRaceKey.value === selectedRaceKey.value) {
    const fallback = races.find((race) => String(race.startTimeMs) !== selectedRaceKey.value)
    selectedComparisonRaceKey.value = fallback ? String(fallback.startTimeMs) : null
  }
}, { immediate: true })

/** @brief Most recent packet timestamp available for filtering windows. */
const latestTimestamp = computed(() => {
  const latest = telemetry.history[telemetry.history.length - 1]
  return latest?.timestamp || Date.now()
})

/**
 * @brief True when loaded telemetry is from the current local calendar day.
 * @description Empty buffer is treated as today so Live stays available before the first packet.
 *              Matches DashboardHeader play-button day check against the latest history sample.
 */
const isLoadedDataToday = computed(() => {
  if (telemetry.history.length === 0) return true
  const latest = telemetry.history[telemetry.history.length - 1]
  if (!Number.isFinite(latest?.timestamp)) return true
  return new Date(latest.timestamp).toDateString() === new Date().toDateString()
})

/** @brief Switch to history mode when live is unavailable (e.g. past-day load). */
watch(isLoadedDataToday, (isToday) => {
  if (!isToday && mode.value === 'live') {
    mode.value = 'history'
  }
}, { immediate: true })

/** @brief Oldest packet timestamp in the live display buffer. */
const oldestSampleTimestamp = computed(() => {
  const oldest = telemetry.displayHistory[0]
  return Number.isFinite(oldest?.timestamp) ? oldest.timestamp : null
})

/** @brief Race session start from the newest laps-table race (same source as Laps tab). */
const lapSessionRaceStartMs = computed(() => {
  const newestRace = sortedRaces.value[0]
  return Number.isFinite(newestRace?.startTimeMs) ? newestRace.startTimeMs : null
})

/** @brief Lap-data window bounds for the active live/history mode. */
const lapWindowBounds = computed(() => {
  if (telemetry.displayHistory.length === 0) return null

  if (mode.value === 'live') {
    const endMs = latestTimestamp.value
    const startMs = lapSessionRaceStartMs.value
    if (!Number.isFinite(startMs)) {
      if (!Number.isFinite(oldestSampleTimestamp.value) || !Number.isFinite(endMs)) return null
      return { startMs: oldestSampleTimestamp.value, endMs }
    }
    return { startMs, endMs }
  }

  return resolveLapHistoryBounds(sortedRaces.value, selectedRaceKey.value, latestTimestamp.value)
})

/** @brief Effective analytics window bounds for the active mode and source. */
const analyticsWindowBounds = computed(() => {
  if (telemetry.displayHistory.length === 0) return null

  if (windowSource.value === 'lap') {
    return lapWindowBounds.value
  }

  if (mode.value === 'live') {
    const endMs = latestTimestamp.value
    let startMs = userDefinedStartMs.value
    if (!Number.isFinite(startMs)) {
      startMs = lapWindowBounds.value?.startMs ?? oldestSampleTimestamp.value
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
    return clampWindowBounds(startMs, endMs, oldestSampleTimestamp.value, latestTimestamp.value)
  }

  let startMs = userDefinedStartMs.value
  let endMs = userDefinedEndMs.value
  const lapSeed = lapWindowBounds.value
  if (!Number.isFinite(startMs) && lapSeed) startMs = lapSeed.startMs
  if (!Number.isFinite(endMs) && lapSeed) endMs = lapSeed.endMs
  if (!Number.isFinite(startMs)) startMs = oldestSampleTimestamp.value
  if (!Number.isFinite(endMs)) endMs = latestTimestamp.value
  return clampWindowBounds(startMs, endMs, oldestSampleTimestamp.value, latestTimestamp.value)
})

/** @brief Samples currently used for analytics calculations. */
const activeSamples = computed(() => {
  const bounds = analyticsWindowBounds.value
  if (!bounds) return []
  return filterSamplesByWindow(telemetry.displayHistory, bounds.startMs, bounds.endMs)
})

/** @brief History samples for optional second race comparison (lap source only). */
const comparisonHistorySamples = computed(() => {
  if (mode.value !== 'history' || windowSource.value !== 'lap') return []
  if (sortedRaces.value.length === 0 || telemetry.displayHistory.length === 0 || !selectedComparisonRaceKey.value) return []

  const raceStart = Number(selectedComparisonRaceKey.value)
  const selectedIndex = sortedRaces.value.findIndex((race) => race.startTimeMs === raceStart)
  if (selectedIndex < 0) return []
  const race = sortedRaces.value[selectedIndex]
  const nextNewerRace = sortedRaces.value[selectedIndex - 1]
  const end = nextNewerRace ? nextNewerRace.startTimeMs : latestTimestamp.value
  return filterSamplesByWindow(
    telemetry.displayHistory,
    race.startTimeMs,
    end
  )
})

/** @brief All laps from every calculated session, sorted by lap number. */
const allLapsSorted = computed(() => {
  const laps = []
  Object.values(telemetry.races).forEach((race) => {
    Object.values(race.laps || {}).forEach((lap) => laps.push(lap))
  })
  return laps.sort((a, b) => (a.lapNumber || 0) - (b.lapNumber || 0))
})

/** @brief Lap summaries for active mode (for session KPI parity with Laps tab). */
const activeLaps = computed(() => {
  if (sortedRaces.value.length === 0) return []

  let laps = []
  if (windowSource.value === 'user') {
    laps = allLapsSorted.value
  } else if (mode.value === 'history') {
    const race = sortedRaces.value.find((entry) => String(entry.startTimeMs) === selectedRaceKey.value)
    laps = race ? Object.values(race.laps || {}).sort((a, b) => a.lapNumber - b.lapNumber) : []
  } else {
    const newestRace = sortedRaces.value[0]
    laps = newestRace ? Object.values(newestRace.laps || {}).sort((a, b) => a.lapNumber - b.lapNumber) : []
  }

  if (windowSource.value !== 'user') return laps

  const bounds = analyticsWindowBounds.value
  if (!bounds) return []
  return laps.filter((lap) => lapOverlapsWindow(lap, bounds.startMs, bounds.endMs))
})

/** @brief Laps for optional baseline race in history comparison. */
const comparisonLaps = computed(() => {
  if (mode.value !== 'history' || !selectedComparisonRaceKey.value) return []
  const race = sortedRaces.value.find((entry) => String(entry.startTimeMs) === selectedComparisonRaceKey.value)
  return race ? Object.values(race.laps || {}).sort((a, b) => a.lapNumber - b.lapNumber) : []
})

/** @brief Histogram metrics for current window. */
const throttleHistogram = computed(() =>
  computeThrottleHistogram(activeSamples.value, {
    maxDtMs: 10000
  })
)

/** @brief Overlap metrics for current window. */
const overlapMetrics = computed(() =>
  computeThrottleBrakeOverlap(activeSamples.value, {
    maxDtMs: 10000,
    throttleThresholdPct: Number.isFinite(analyticsConfig.value.throttleOverlapThresholdPct)
      ? analyticsConfig.value.throttleOverlapThresholdPct
      : 5
  })
)

/** @brief Start-phase metrics for current window. */
const startMetrics = computed(() => {
  const manualStartTimestamp = mode.value === 'live'
    ? (windowSource.value === 'user'
        ? analyticsWindowBounds.value?.startMs
        : lapSessionRaceStartMs.value)
    : (Number.isFinite(analyticsConfig.value.manualStartOffsetSec)
        ? ((activeSamples.value[0]?.timestamp || 0) + (analyticsConfig.value.manualStartOffsetSec * 1000))
        : null)

  return computeStartMetrics(activeSamples.value, {
    speedUnit: telemetry.unitSettings.speedUnit,
    startCurrentThreshold: Number.isFinite(analyticsConfig.value.startCurrentThresholdA)
      ? analyticsConfig.value.startCurrentThresholdA
      : 10,
    startWindowMs: 30000,
    manualStartTimestamp: Number.isFinite(manualStartTimestamp) ? manualStartTimestamp : null
  })
})

/** @brief Supply resistance estimate for current window. */
const resistanceMetrics = computed(() =>
  computeSupplyResistance(activeSamples.value, irEstimationOptions.value)
)

/** @brief Session/stint KPI summary aligned with Laps tab. */
const sessionKpis = computed(() => computeSessionStintKpis(activeLaps.value, activeSamples.value, { lastNLaps: 5 }))

/** @brief Energy and thermal summary cards for current mode window. */
const energyThermal = computed(() =>
  computeEnergyThermalSummary(activeSamples.value, {
    speedUnit: telemetry.unitSettings.speedUnit,
    maxDtMs: 10000
  })
)

/**
 * @brief Resolve pack C_actual (Ah) from settings with legacy fallback.
 * @param {Object} config - analyticsSettings snapshot
 * @returns {number} Positive pack actual capacity in Ah
 */
function resolvePackActualCapacityAh(config) {
  if (Number.isFinite(config.packActualCapacityAh) && config.packActualCapacityAh > 0) {
    return config.packActualCapacityAh
  }
  if (Number.isFinite(config.packNominalCapacityAh) && config.packNominalCapacityAh > 0) {
    return config.packNominalCapacityAh
  }
  return 36
}

/** @brief Battery pack parameters from analytics settings with safe defaults. */
const batteryPackSettings = computed(() => {
  const config = analyticsConfig.value
  const nominalCapacityAh = Number.isFinite(config.packNominalCapacityAh) ? config.packNominalCapacityAh : 36
  return {
    nominalCapacityAh,
    actualCapacityAh: resolvePackActualCapacityAh(config),
    nominalSeriesVoltage: Number.isFinite(config.packNominalSeriesVoltage) ? config.packNominalSeriesVoltage : 24,
    peukertExponent: Number.isFinite(config.peukertExponent) ? config.peukertExponent : 1.16
  }
})

/** @brief Per-battery power/energy/voltage summary for the active window. */
const batteryMetrics = computed(() =>
  computeBatteryWindowMetrics(activeSamples.value, {
    maxDtMs: 10000,
    ...batteryPackSettings.value,
    ...irEstimationOptions.value,
    supplyResistance: resistanceMetrics.value
  })
)

/**
 * @brief Battery metric help metadata keyed by metric id.
 */
const BATTERY_METRIC_HELP = Object.freeze({
  supply_resistance_total: {
    title: 'Supply Resistance (pack total path)',
    metricType: 'model_derived_measured',
    whatItShows: 'How much the whole power path (the batteries plus the wiring) resists the flow of current, measured in milliohms (mΩ). Lower is better.',
    howToUse: 'Compare this value between runs. If it rises, more energy is being lost as heat in the cells or wiring, so check the batteries and connections.',
    caveats: [
      'Includes harness and path resistance, not only internal cell resistance.',
      'Requires enough current spread and sample count for a stable fit.',
      'Shows "-" when the fit is invalid for the active window.'
    ],
    confidenceInterpretation: 'Confidence is driven by sample count, current spread, and fit quality (R²).',
    formula: 'R (Ω) = −(slope) from least-squares fit V vs I; R (mΩ) = 1000 × R (Ω). Fit uses V_terminal ≈ V_oc − I×R on RC-corrected samples (V_oc = intercept).',
    inputs: 'combined voltage, current',
    updateCadence: 'Recomputed from active live/history window.'
  },
  resistance_delta: {
    title: 'Resistance mismatch (upper vs lower)',
    metricType: 'model_derived_measured',
    whatItShows: 'The gap between the upper and lower battery resistance. A small number means both sides are behaving the same.',
    howToUse: 'A large gap points to one side being weaker or having a poor connection. Investigate the battery with the higher resistance.',
    caveats: [
      'Only meaningful when both upper and lower V–I fits are valid.',
      'Reflects battery-path mismatch, not strict per-cell internal resistance difference.'
    ],
    confidenceInterpretation: 'Degrades when either upper or lower branch fit is invalid.',
    formula: '|R_upper - R_lower|',
    inputs: 'voltageLower, voltageHigh, current',
    updateCadence: 'Recomputed from active live/history window.'
  },
  battery_pack_summary: {
    title: 'Battery path summary (pack / upper / lower)',
    metricType: 'measured',
    whatItShows: 'A quick snapshot of each path (whole pack, upper, lower): the latest voltage, the lowest voltage, and the resistance.',
    howToUse: 'Glance here first. The upper and lower batteries should look similar, so a big difference between them is worth a closer look.',
    caveats: [
      'Summary Voltage is the latest terminal reading in the active window, not the average.',
      'Resistance shows "-" when that branch fit is invalid.',
      'Pack resistance uses the combined (total) supply-path fit.'
    ],
    confidenceInterpretation: 'Voltage extrema are measured; resistance confidence follows the corresponding branch fit.',
    formula: 'latest/min voltage over window; R from V = V_oc - I×R per branch',
    inputs: 'voltage or voltageLower/voltageHigh, current',
    updateCadence: 'Updates with the active live/history window.'
  },
  combined_max_power: {
    title: 'Power (instantaneous, peak, and energy)',
    metricType: 'measured',
    whatItShows: 'How much electrical power (volts times amps) the battery is giving right now, the highest it reached, and the total energy used and recovered, in watt-hours (Wh).',
    howToUse: 'Use the live power to see the load on the car, the peak for the hardest moments, and the energy totals to compare how much was used between runs.',
    caveats: [
      'Instantaneous power follows the most recent sample with valid voltage and current in the window.',
      'Energy integration skips intervals with large timestamp gaps.',
      'Peak power is sensitive to sampling cadence and short spikes.'
    ],
    confidenceInterpretation: 'Measured values; confidence is implicit in sample coverage and signal continuity.',
    formula: 'P = V×I; discharge Wh = ∫ max(P,0) dt; regen Wh = ∫ |min(P,0)| dt',
    inputs: 'voltage (pack, voltageLower, or voltageHigh per section), current, timestamp',
    updateCadence: 'Updates with the active live/history window.'
  },
  combined_discharge_energy: {
    title: 'Combined Discharge Energy',
    metricType: 'measured',
    whatItShows: 'The total energy taken out of the pack during this time window, in watt-hours (Wh).',
    howToUse: 'Compare different parts of a race to find where the most energy is being used.',
    caveats: ['Intervals with large timestamp gaps are excluded from integration.'],
    confidenceInterpretation: 'Confidence depends on interval continuity and sample coverage.',
    formula: 'Integral of max(V*I, 0) over time',
    inputs: 'voltage, current, timestamp',
    updateCadence: 'Updates with active window.'
  },
  combined_regen_energy: {
    title: 'Combined Regen Energy',
    metricType: 'measured',
    whatItShows: 'The energy put back into the pack from braking or coasting (regen), in watt-hours (Wh).',
    howToUse: 'A higher number means more energy is being recovered. Use it to check how well regen is working.',
    caveats: ['Depends on sign and quality of current signal.'],
    confidenceInterpretation: 'Confidence follows sample coverage and signal continuity.',
    formula: 'Integral of abs(min(V*I, 0)) over time',
    inputs: 'voltage, current, timestamp',
    updateCadence: 'Updates with active window.'
  },
  combined_min_voltage: {
    title: 'Combined Minimum Voltage',
    metricType: 'measured',
    whatItShows: 'The lowest pack voltage seen during this time window.',
    howToUse: 'Watch this under heavy load. If it drops close to the cutoff, the pack is being pushed hard.',
    caveats: ['A short transient dip can dominate this value.'],
    confidenceInterpretation: 'Confidence is high when the window has dense valid voltage samples.',
    formula: 'min(voltage)',
    inputs: 'voltage',
    updateCadence: 'Updates with active window.'
  },
  dodPct: {
    title: 'Depth of Discharge (Estimated)',
    metricType: 'estimated',
    whatItShows: 'Window discharge (Ah), Peukert-normalized C/20 cycle discharge (Ah), and DoD percentages against Peukert capacity, ideal capacity, and normalized C/20 vs ideal.',
    howToUse: 'Compare window vs normalized C/20 discharge: both cover the full active window, but normalized C/20 applies Peukert weighting per sample so high-rate discharge counts as more equivalent Ah than raw coulomb counting. V_C/20 voltage on charts is separate—it emulates terminal voltage at C/20 current and does not drive normalized Ah.',
    caveats: [
      'Peukert capacity depends on average discharge current in the active window.',
      'Normalized C/20 discharge integrates I × (I/I_C20)^(k−1) over the full window; it is not tied to V_C/20 voltage.',
      'At average current below C/20 (1.8 A for 36 Ah), normalized Ah can be lower than window discharge even though V_C/20 reads higher than terminal voltage.',
      'Ideal capacity comes from Settings or a near-full discharge inference.',
      'Prefers cumulative ampH delta when it aligns with current integration.'
    ],
    confidenceInterpretation: 'Primary DoD metric uses Peukert capacity when available.',
    formula: 'Window DoD% = (windowDischargeAh / capacity) × 100; Ah_norm = ∫ I × (I/I_C20)^(k−1) dt over window; normalized DoD% = (Ah_norm / C_ideal) × 100',
    inputs: 'current or ampH, timestamp, Peukert exponent, nominal and ideal capacity',
    updateCadence: 'Updates with active window.'
  },
  sohPct: {
    title: 'State of Health (Estimated)',
    metricType: 'estimated',
    whatItShows: 'Estimated actual capacity from the active-window ΔAh/ΔSoC method, compared with ideal capacity from Settings.',
    howToUse: 'Use windows that cover a meaningful discharge. SoH appears once the emulated C/20 voltage lookup shows at least 25% SoC drop.',
    caveats: [
      'SoH % is the estimated usable capacity compared with the ideal capacity setting; above 100% means the estimate is higher than the current ideal value.',
      'ΔSoC is how much the battery appears to have emptied over the selected window; it must be at least 25% before SoH is trusted.',
      'Estimated capacity is the calculated Ah size of the battery from this window, before converting it to a percentage.',
      'V_C/20 start → end is the voltage translated to a gentle C/20 load at the beginning and end of the window; this is used to estimate SoC.',
      'SoH uses active window boundaries, not the deepest point or an endpoint cutoff.',
      'V_C/20 is emulated from terminal voltage, RC polarization, current, and valid rolling IR.',
      'ΔSoC must be at least 25%; smaller windows are too sensitive to lookup and voltage noise.',
      'Values are not capped; a high estimate can display above 100%.',
      'The Yuasa C/20 voltage-to-SoC curve is a built-in approximation until a calibrated curve is available.'
    ],
    confidenceInterpretation: 'Unavailable until the window has valid V_C/20 boundaries, enough ΔSoC, and sufficient integration coverage.',
    formula: 'ΔAh_norm = ∫I_eff dt; ΔSoC = SoC(V_C20,start) − SoC(V_C20,end); SoH% = 100 × ΔAh_norm / (ΔSoC × C_ideal)',
    inputs: 'voltage, current, rolling IR, RC polarization, Peukert exponent, Yuasa C/20 SoC lookup, ideal capacity',
    updateCadence: 'Updates with active window.'
  },
  peukert_expected_capacity: {
    title: 'Capacity',
    metricType: 'estimated',
    whatItShows: 'Peukert capacity (rate-adjusted deliverable Ah) and ideal capacity (configured or inferred pack rating).',
    howToUse: 'Compare Peukert capacity and ideal capacity for SoH context. Window discharge is shown on the DoD card.',
    caveats: ['Peukert capacity uses configured exponent and C/20 reference current.', 'Ideal capacity comes from Settings or a near-full discharge inference.'],
    confidenceInterpretation: 'Peukert confidence increases with deeper, cleaner discharge windows.',
    formula: 'Peukert: C(I)=Cp/I^(k-1); window discharge integrated from positive current (or ampH when aligned)',
    inputs: 'window discharge, ideal/nominal capacity, Peukert exponent, average discharge current',
    updateCadence: 'Updates with active window.'
  },
  voltage_zone: {
    title: 'Battery State',
    metricType: 'estimated',
    whatItShows: 'Two health labels: one from the resting voltage (how full the battery is) and one from the voltage right now under load (how close it is to sagging too low).',
    howToUse: 'Use the resting (OCV) zone to judge state of charge, and the loaded zone to spot if the battery is sagging dangerously under load.',
    caveats: [
      'Pack section (24 V combined): High >= 25.0 V; Medium 24.0–24.99 V; Low 22.4–23.99 V; near_cutoff 19.2–22.39 V; deep_discharge < 19.2 V.',
      'Per-battery sections use equivalent half-pack baselines: 12.5 V, 12.0 V, 11.2 V, and 9.6 V cutoff.',
      'Loaded voltage has its own classification and should not be merged with OCV zone.',
      'V_oc estimate requires a valid combined V-I resistance fit in the active window.',
      'Tracks the latest battery sample received in the active window.'
    ],
    confidenceInterpretation: 'Confidence follows combined resistance fit quality (sample count, current spread, and R²).',
    formula: 'V_oc ≈ V_terminal + Vp(t) + I(t)×R(t); rolling R(t), RC Vp(t); report OCV zone and loaded-voltage zone separately',
    inputs: 'voltage, current (latest sample), rolling + branch resistance, nominal series voltage',
    updateCadence: 'Updates on each new sample in the active live/history window.'
  },
  battery_resistance: {
    title: 'Battery resistance (upper or lower path)',
    metricType: 'model_derived_measured',
    whatItShows: 'The resistance of one battery path (upper or lower), measured in milliohms (mΩ). Lower is better.',
    howToUse: 'Compare the upper and lower batteries. If one is much higher, that battery or its wiring may need attention.',
    caveats: [
      'Includes harness and path effects, not cell-only Ri.',
      'Shows "-" when the branch fit is invalid.',
      'Upper voltage is derived from telemetry; quality depends on channel calibration.'
    ],
    confidenceInterpretation: 'Confidence follows branch fit quality, sample count, and current spread.',
    formula: 'R (Ω) = −(slope) from least-squares fit V vs I on that branch; R (mΩ) = 1000 × R (Ω). Model: V_battery ≈ V_oc − I×R on RC-corrected samples.',
    inputs: 'voltageLower or voltageHigh, current',
    updateCadence: 'Updates with active window.'
  },
  battery_voltage: {
    title: 'Voltage (window statistics)',
    metricType: 'measured',
    whatItShows: 'The highest, lowest, and average voltage for this battery over the chosen time window.',
    howToUse: 'Use the minimum to see how close you came to the cutoff, and the average for the typical level.',
    caveats: [
      'Window extrema can be dominated by brief transients.',
      'Summary row at the top of Battery Pack uses latest voltage as "Voltage" and min as "Min Voltage" — not the same as this card\'s max/min/avg trio.',
      'Derived upper voltage may inherit noise from pack and lower channels.'
    ],
    confidenceInterpretation: 'High when the window has dense valid samples on that voltage channel.',
    formula: 'max(V), min(V), avg(V) over valid samples in window',
    inputs: 'voltage, voltageLower, or voltageHigh',
    updateCadence: 'Updates with active window.'
  },
  battery_voltage_timeline: {
    title: 'Voltage + current timeline',
    metricType: 'measured',
    whatItShows: 'A graph of voltage and current over time for this battery or the whole pack, with smoothed estimated open-circuit voltage when a valid resistance fit exists.',
    howToUse: 'Line up dips in voltage with spikes in current to see how much the battery sags when the car draws power. Use Smoothed Est. V_oc for a load-stripped SOC-style trend.',
    caveats: [
      'Combined view may show a loaded-voltage cutoff reference line at the configured pack threshold (terminal V under load, not OCV).',
      'Gaps in telemetry appear as breaks in the lines.',
      'Current and voltage share time axis but use separate Y scales.',
      'Smoothed Est. V_oc requires a valid branch V–I resistance fit in the active window.'
    ],
    confidenceInterpretation: 'Terminal V and I are measured; smoothed V_oc confidence follows the branch resistance fit used for that section.',
    formula: 'V(t), I(t); smoothed V_oc from EMA of V_terminal + Vp(t) + I(t)×R(t)',
    inputs: 'voltage, voltageLower, voltageHigh, current, timestamp, rolling resistance fit',
    updateCadence: 'Updates with active window.'
  },
  resistance_vi_scatter: {
    title: 'Voltage vs current (resistance fit)',
    metricType: 'model_derived_measured',
    whatItShows: 'A scatter of voltage against current, with a best-fit line through the points. The slope of that line gives the resistance.',
    howToUse: 'A clear, straight trend means a trustworthy resistance value. Scattered or bunched-up points mean the estimate is less reliable.',
    caveats: [
      'Fit line matches the branch shown in this section (total / lower / upper).',
      'Sparse or collinear points produce invalid or low-confidence fits.',
      'Includes path resistance, not isolated cell Ri.'
    ],
    confidenceInterpretation: 'Same branch confidence as the Resistance KPI (sample count, spread, R²).',
    formula: 'R (Ω) = −(slope) from least-squares fit V vs I; dashed line is V_oc − I×R using that R.',
    inputs: 'voltage channel for branch, current',
    updateCadence: 'Recomputed from active window.'
  },
  resistance_vs_ah: {
    title: 'Internal Resistance vs Energy State',
    metricType: 'model_derived_measured',
    whatItShows: 'How the battery internal resistance changes as it empties, plotted against net amp-hours used in the active window.',
    howToUse: 'Watch for resistance rising as the battery drains, and compare the upper and lower batteries to spot one ageing faster than the other.',
    caveats: [
      'Each point uses a rolling V–I fit with charge/discharge segregation and RC polarization correction.',
      'Net Ah integrates signed current (discharge positive, regen negative), not the ampH telemetry channel.',
      'Trendline confidence is overlap-adjusted for rolling-window autocorrelation.'
    ],
    confidenceInterpretation: 'Series confidence reflects overlap-adjusted effective sample count, fit R², mode purity, and excitation quality.',
    formula: 'R from RC-corrected V = V_oc - I*R; Net Ah = ∫ I dt',
    inputs: 'voltage (battery), current, rolling resistance windows, nominal capacity',
    updateCadence: 'Recomputed from active live/history window.'
  }
})

/** @brief Active metric help payload resolved from selected id. */
const activeMetricHelp = computed(() => {
  if (!activeMetricHelpId.value) return null
  return BATTERY_METRIC_HELP[activeMetricHelpId.value] || null
})

/** @brief Reliability event stream for current mode window. */
const reliabilityEvents = computed(() => detectReliabilityEvents(activeSamples.value, {
  throttleOverlapThresholdPct: Number.isFinite(analyticsConfig.value.throttleOverlapThresholdPct)
    ? analyticsConfig.value.throttleOverlapThresholdPct
    : 5,
  undervoltageWarningV: analyticsConfig.value.eventUndervoltageWarningV,
  undervoltageCriticalV: analyticsConfig.value.eventUndervoltageCriticalV,
  overTempWarningC: analyticsConfig.value.eventOverTempWarningC,
  overTempCriticalC: analyticsConfig.value.eventOverTempCriticalC,
  currentSpikeWarningA: analyticsConfig.value.eventCurrentSpikeWarningA,
  currentSpikeCriticalA: analyticsConfig.value.eventCurrentSpikeCriticalA,
  dropoutWarningSec: analyticsConfig.value.eventDropoutWarningSec,
  overlapWarningSec: analyticsConfig.value.eventOverlapWarningSec
}))

/** @brief Optional baseline race comparison for history mode. */
const baselineComparison = computed(() => {
  if (mode.value !== 'history' || windowSource.value !== 'lap') return null
  if (!analyticsConfig.value.enableSideBySideHistoryCompare) return null
  if (activeLaps.value.length === 0 || comparisonLaps.value.length === 0) return null
  return computeBaselineComparison(
    activeLaps.value,
    comparisonLaps.value,
    activeSamples.value,
    comparisonHistorySamples.value
  )
})

/** @brief Open user-defined window picker modal. */
function openWindowPicker() {
  showWindowPickerModal.value = true
}

/**
 * @brief Commit user-defined window from picker modal.
 * @param {{startMs: number, endMs: number}} payload - Applied window bounds
 */
function handleWindowPickerApply({ startMs, endMs }) {
  userDefinedStartMs.value = startMs
  if (mode.value === 'history') {
    userDefinedEndMs.value = endMs
  }
}

watch([mode, startMetrics, analyticsConfig], () => {
  if (mode.value !== 'live') {
    isStartCardOpen.value = true
    return
  }
  const autoCollapseSec = Number.isFinite(analyticsConfig.value.autoCollapseStartCardSec)
    ? analyticsConfig.value.autoCollapseStartCardSec
    : 60
  const startTs = startMetrics.value?.startTimestamp
  if (!Number.isFinite(startTs) || autoCollapseSec <= 0) return
  const elapsedSec = (latestTimestamp.value - startTs) / 1000
  if (elapsedSec >= autoCollapseSec) {
    isStartCardOpen.value = false
  }
}, { immediate: true, deep: true })

/**
 * @brief Format metric value for display with fallback.
 * @param {number|null} value - Numeric value
 * @param {number} [digits=2] - Decimal digits
 * @returns {string} Formatted value
 */
function formatMetric(value, digits = 2) {
  if (!Number.isFinite(value)) return '-'
  return Number(value).toFixed(digits)
}

/** @brief Human-readable copy when SoH cannot be computed. */
const SOH_UNAVAILABLE_REASONS = Object.freeze({
  no_discharge_cycle: 'No completed discharge cycle in window',
  insufficient_cycle_depth: 'Cycle too shallow for SoH',
  insufficient_ideal_capacity: 'Ideal capacity not configured',
  insufficient_samples: 'Insufficient samples in window',
  insufficient_normalization: 'Could not normalize discharge to C/20 rate',
  missing_vc20_boundary: 'Missing valid V_C/20 at window boundary',
  missing_valid_resistance_fit: 'Missing valid resistance fit for V_C/20',
  insufficient_delta_soc: 'Window ΔSoC below 25%',
  non_positive_normalized_delta_ah: 'Normalized window Ah is not positive',
  insufficient_window_coverage: 'Insufficient valid window coverage',
  invalid_soc_lookup: 'Could not map V_C/20 to SoC'
})

/**
 * @brief Map SoH reason code to display text.
 * @param {string|null|undefined} reason - SoH reason code from health metrics
 * @returns {string} Display label
 */
function formatSohUnavailableReason(reason) {
  if (!reason) return 'SoH unavailable'
  return SOH_UNAVAILABLE_REASONS[reason] || reason.replace(/_/g, ' ')
}

/**
 * @brief Format signed values with explicit +/- prefix.
 * @param {number|null} value - Numeric value
 * @param {number} [digits=2] - Decimal digits
 * @returns {string} Signed value
 */
function formatSigned(value, digits = 2) {
  if (!Number.isFinite(value)) return '-'
  return `${value > 0 ? '+' : ''}${Number(value).toFixed(digits)}`
}

/**
 * @brief Create sparkline SVG path from numeric series.
 * @param {number[]} values - Numeric values
 * @param {number} [width=128] - SVG width
 * @param {number} [height=40] - SVG height
 * @returns {string} SVG path string
 */
function buildSparklinePath(values, width = 128, height = 40) {
  if (!Array.isArray(values) || values.length === 0) return ''
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return ''
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * width : width / 2
      const y = height - (((value - min) / range) * height)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

/**
 * @brief Format timestamp as local date-time string.
 * @param {number} timestampMs - Timestamp in ms
 * @returns {string} Local date/time text
 */
function formatDateTime(timestampMs) {
  if (!Number.isFinite(timestampMs)) return 'Unknown'
  return new Date(timestampMs).toLocaleString()
}

/**
 * @brief Event severity badge class map.
 * @param {'info'|'warning'|'critical'} severity - Severity string
 * @returns {string} Utility class list
 */
function getEventSeverityClass(severity) {
  if (severity === 'critical') return 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/20'
  if (severity === 'warning') return 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/20'
  return 'text-zinc-700 dark:text-gray-300 bg-zinc-200 dark:bg-neutral-700'
}

/**
 * @brief Open metric help modal for selected metric id.
 * @param {string} metricId - Metric identifier in battery help map
 */
function openMetricHelp(metricId) {
  if (!metricId || !BATTERY_METRIC_HELP[metricId]) return
  activeMetricHelpId.value = metricId
  showMetricHelp.value = true
}

/**
 * @brief Close metric help modal and clear selected metric id.
 */
function closeMetricHelp() {
  showMetricHelp.value = false
  activeMetricHelpId.value = null
}

/**
 * @brief Resolve metric type badge classes for battery cards.
 * @param {'measured'|'model_derived_measured'|'estimated'} metricType - Metric class
 * @returns {string} Utility class list
 */
function getMetricTypeBadgeClass(metricType) {
  if (metricType === 'estimated') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (metricType === 'model_derived_measured') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
}

/**
 * @brief Resolve confidence text color utility classes.
 * @param {'high'|'medium'|'low'|null|undefined} confidence - Confidence label
 * @returns {string} Utility class list
 */
function getConfidenceClass(confidence) {
  if (confidence === 'high') return 'text-emerald-600 dark:text-emerald-300'
  if (confidence === 'medium') return 'text-amber-600 dark:text-amber-300'
  if (confidence === 'low') return 'text-red-600 dark:text-red-300'
  return 'text-zinc-500 dark:text-gray-400'
}

/**
 * @brief Jump graph view to event-centric window.
 * @param {Object} event - Event item with timestamp bounds
 */
function jumpToEvent(event) {
  const window = buildEventJumpWindow(event, { paddingBeforeMs: 15000, paddingAfterMs: 15000 })
  if (!window) return
  telemetry.requestChartZoom?.(window.start, window.end)
  if (!telemetry.isPaused && typeof telemetry.togglePause === 'function') telemetry.togglePause()
  settings.activeTabId = 'graph'
}

/**
 * @brief Export reliability event list as CSV.
 */
function handleExportEventsCsv() {
  exportEventsAsCsv(reliabilityEvents.value, { filenamePrefix: 'eChook-events' })
}
</script>

<template>
  <div class="h-full flex flex-col p-3 md:p-6 space-y-4 overflow-hidden">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4 w-full">
      <h2 class="text-lg md:text-xl font-bold text-zinc-900 dark:text-white shrink-0">
        Analytics
      </h2>

      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:ml-auto lg:gap-5 min-w-0">
        <div class="flex items-center gap-2 shrink-0 sm:justify-end">
          <span class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">Mode:</span>
          <div
            class="analytics-mode-toggle inline-flex rounded-md border border-zinc-300 dark:border-neutral-700 overflow-hidden"
            role="group"
            aria-label="Analytics mode"
          >
            <button
              type="button"
              class="analytics-mode-toggle-btn px-3 text-xs font-semibold border-r border-zinc-300 dark:border-neutral-700 transition"
              :class="mode === 'live'
                ? 'bg-primary/20 text-primary'
                : 'bg-white dark:bg-neutral-800 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700'"
              :disabled="!isLoadedDataToday"
              :title="isLoadedDataToday ? undefined : 'Live mode is only available for telemetry loaded from today.'"
              @click="mode = 'live'"
            >
              Live
            </button>
            <button
              type="button"
              class="analytics-mode-toggle-btn px-3 text-xs font-semibold transition"
              :class="mode === 'history'
                ? 'bg-primary/20 text-primary'
                : 'bg-white dark:bg-neutral-800 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700'"
              @click="mode = 'history'"
            >
              History
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 sm:justify-end">
          <span class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400">Window:</span>
          <div
            class="analytics-mode-toggle inline-flex rounded-md border border-zinc-300 dark:border-neutral-700 overflow-hidden"
            role="group"
            aria-label="Analytics window source"
          >
            <button
              type="button"
              class="analytics-mode-toggle-btn px-3 text-xs font-semibold border-r border-zinc-300 dark:border-neutral-700 transition"
              :class="windowSource === 'lap'
                ? 'bg-primary/20 text-primary'
                : 'bg-white dark:bg-neutral-800 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700'"
              @click="windowSource = 'lap'"
            >
              Lap Data
            </button>
            <button
              type="button"
              class="analytics-mode-toggle-btn px-3 text-xs font-semibold transition"
              :class="windowSource === 'user'
                ? 'bg-primary/20 text-primary'
                : 'bg-white dark:bg-neutral-800 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700'"
              @click="windowSource = 'user'"
            >
              User Defined
            </button>
          </div>
        </div>

        <div
          v-if="windowSource === 'lap' && mode === 'live'"
          class="flex flex-wrap items-center gap-2 min-h-[2.125rem] sm:justify-end min-w-0"
        >
          <span class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400 shrink-0">
            Session start
          </span>
          <span class="font-mono text-xs text-zinc-800 dark:text-gray-200">
            {{ lapSessionRaceStartMs ? formatClockTime(lapSessionRaceStartMs) : '-' }}
          </span>
          <span
            v-if="!lapSessionRaceStartMs"
            class="text-xs text-amber-700 dark:text-amber-300"
          >
            No race session yet
          </span>
        </div>

        <div
          v-if="windowSource === 'lap' && mode === 'history'"
          class="flex flex-wrap items-center gap-2 min-h-[2.125rem] sm:justify-end min-w-0"
        >
          <label for="analytics-race" class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400 shrink-0">Session</label>
          <select
            id="analytics-race"
            v-model="selectedRaceKey"
            class="analytics-race-control bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-3 py-1.5 text-xs text-zinc-800 dark:text-gray-200 focus:border-primary outline-none min-w-[12rem]"
          >
            <option v-for="race in sortedRaces" :key="race.startTimeMs" :value="String(race.startTimeMs)">
              {{ race.trackName || 'Unknown Track' }} - {{ formatDateTime(race.startTimeMs) }}
            </option>
          </select>
          <label v-if="analyticsConfig.enableSideBySideHistoryCompare" for="analytics-race-compare" class="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-gray-400 shrink-0">Compare</label>
          <select
            v-if="analyticsConfig.enableSideBySideHistoryCompare"
            id="analytics-race-compare"
            v-model="selectedComparisonRaceKey"
            class="analytics-race-control bg-white dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded px-3 py-1.5 text-xs text-zinc-800 dark:text-gray-200 focus:border-primary outline-none min-w-[12rem]"
          >
            <option v-for="race in sortedRaces.filter((entry) => String(entry.startTimeMs) !== selectedRaceKey)" :key="race.startTimeMs" :value="String(race.startTimeMs)">
              {{ race.trackName || 'Unknown Track' }} - {{ formatDateTime(race.startTimeMs) }}
            </option>
          </select>
        </div>

        <div
          v-if="windowSource === 'user'"
          class="flex flex-wrap items-center gap-2 min-h-[2.125rem] sm:justify-end min-w-0"
        >
          <span class="text-xs text-zinc-600 dark:text-gray-400 font-mono">
            Start {{ formatClockTime(analyticsWindowBounds?.startMs) }}
            <span class="mx-1">·</span>
            <template v-if="mode === 'live'">End Live ({{ formatClockTime(latestTimestamp) }})</template>
            <template v-else>End {{ formatClockTime(analyticsWindowBounds?.endMs) }}</template>
          </span>
          <button
            type="button"
            class="analytics-race-control px-3 py-1.5 rounded text-xs font-semibold border border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition"
            @click="openWindowPicker"
          >
            Set window…
          </button>
        </div>
      </div>
    </div>

    <nav
      v-if="activeSamples.length > 0"
      class="flex w-full border-b border-zinc-200 dark:border-neutral-700 shrink-0"
      role="tablist"
      aria-label="Analytics sections"
    >
      <button
        v-for="tab in analyticsSubTabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeSubTab === tab.id"
        class="flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition"
        :class="activeSubTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-zinc-500 dark:text-gray-400 hover:text-zinc-800 dark:hover:text-gray-200'"
        @click="activeSubTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div v-if="activeSamples.length === 0" class="flex-1 flex items-center justify-center text-zinc-500 dark:text-gray-500 italic">
      No telemetry samples available for this view.
    </div>

    <div v-else class="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
      <div v-if="activeSubTab === 'overview'" class="space-y-4">
      <details class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4" open>
        <summary class="cursor-pointer text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
          Session KPI Summary
        </summary>
        <div class="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm text-zinc-700 dark:text-gray-300">
          <div>Best Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.bestLapTimeSec) }} s</span></div>
          <div>Median Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.medianLapTimeSec) }} s</span></div>
          <div>Consistency: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.lapConsistencyStdDevSec) }} s</span></div>
          <div>Total Laps: <span class="font-mono text-zinc-900 dark:text-white">{{ sessionKpis.totalLaps }}</span></div>
          <div>Total Ah: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.totalAh) }} Ah</span></div>
          <div>Avg Eff: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.averageEfficiency) }}</span></div>
          <div>Max Temp: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.maxTemp) }} °</span></div>
          <div>Max Imbalance: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(sessionKpis.maxImbalance, METRIC_PRECISION.voltage) }} V</span></div>
          <div class="md:col-span-2">
            Last 5 Lap Trend:
            <span class="font-mono text-zinc-900 dark:text-white">{{ sessionKpis.lastNLaps.length > 0 ? sessionKpis.lastNLaps.map((value) => Number(value).toFixed(2)).join(' / ') : '-' }}</span>
            <div class="text-[11px] text-zinc-500 dark:text-gray-400">Slope {{ formatSigned(sessionKpis.lastNTrendSlopeSecPerLap, 3) }} s/lap</div>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="rounded border border-zinc-200 dark:border-neutral-700 p-2">
            <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">LL_Time degradation</div>
            <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
              <path :d="buildSparklinePath(sessionKpis.degradation.lapTime.sparkline)" fill="none" stroke="currentColor" class="text-primary" stroke-width="2" />
            </svg>
          </div>
          <div class="rounded border border-zinc-200 dark:border-neutral-700 p-2">
            <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">LL_Ah degradation</div>
            <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
              <path :d="buildSparklinePath(sessionKpis.degradation.lapAh.sparkline)" fill="none" stroke="currentColor" class="text-amber-500" stroke-width="2" />
            </svg>
          </div>
          <div class="rounded border border-zinc-200 dark:border-neutral-700 p-2">
            <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">LL_Eff degradation</div>
            <svg class="w-full h-10 mt-2" viewBox="0 0 128 40" preserveAspectRatio="none">
              <path :d="buildSparklinePath(sessionKpis.degradation.lapEfficiency.sparkline)" fill="none" stroke="currentColor" class="text-emerald-500" stroke-width="2" />
            </svg>
          </div>
        </div>
      </details>

      <details
        v-if="baselineComparison"
        class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4"
        open
      >
        <summary class="cursor-pointer text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">
          Baseline Comparison
        </summary>
        <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-zinc-700 dark:text-gray-300">
          <div>Δ Best Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.bestLapTimeSec, 2) }} s</span></div>
          <div>Δ Median Lap: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.medianLapTimeSec, 2) }} s</span></div>
          <div>Δ Total Ah: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.totalAh, METRIC_PRECISION.current) }} Ah</span></div>
          <div>Δ Avg Efficiency: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(baselineComparison.deltas.averageEfficiency, METRIC_PRECISION.voltage) }}</span></div>
        </div>
      </details>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">Energy</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Total: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.totalWh, METRIC_PRECISION.energyWh) }} Wh</span></div>
            <div>Wh/Mile: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.whPerMile, METRIC_PRECISION.energyWh) }}</span></div>
            <div>Distance: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.distanceMiles, METRIC_PRECISION.distanceMiles) }} mi</span></div>
          </div>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">Power</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Average: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.avgPowerW, METRIC_PRECISION.powerW) }} W</span></div>
            <div>Peak: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.peakPowerW, METRIC_PRECISION.powerW) }} W</span></div>
            <div>Avg Current: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.avgCurrent, METRIC_PRECISION.current) }} A</span></div>
          </div>
        </div>
        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-2">Thermal</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Max Temp: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(energyThermal.maxTemp, 1) }} °</span></div>
            <div>Rise Rate: <span class="font-mono text-zinc-900 dark:text-white">{{ formatSigned(energyThermal.tempRisePerMin, 2) }} °/min</span></div>
            <div>Mode: <span class="font-mono text-zinc-900 dark:text-white uppercase">{{ mode }}</span></div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <details class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4" :open="isStartCardOpen">
          <summary class="cursor-pointer text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">Race Start</summary>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300 mt-3">
            <div>Peak Current (30s): <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.peakCurrentFirst30sA, 1) }} A</span></div>
            <div>Wh First 30s: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.whFirst30s, METRIC_PRECISION.energyWh) }} Wh</span></div>
            <div>0-10 mph: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.time0to10mphSec, 2) }} s</span></div>
            <div>0-20 mph: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(startMetrics.time0to20mphSec, 2) }} s</span></div>
          </div>
          <p class="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
            {{ startMetrics.disclaimer }}
          </p>
        </details>

        <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">Throttle + Brake Overlap</div>
          <div class="space-y-1 text-sm text-zinc-700 dark:text-gray-300">
            <div>Events: <span class="font-mono text-zinc-900 dark:text-white">{{ overlapMetrics.eventCount }}</span></div>
            <div>Total Duration: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(overlapMetrics.totalDurationSec, 2) }} s</span></div>
            <div>Longest Event: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(overlapMetrics.maxDurationSec, 2) }} s</span></div>
            <div>Overlap Energy: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(overlapMetrics.overlapWh, METRIC_PRECISION.energyWh) }} Wh</span></div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
        <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-3">
          Throttle Histogram (Time / Energy)
        </div>

        <div class="space-y-3">
          <div v-for="bin in throttleHistogram.bins" :key="bin.id" class="space-y-1">
            <div class="flex items-center justify-between text-xs text-zinc-600 dark:text-gray-400">
              <span class="font-semibold text-zinc-800 dark:text-gray-200">{{ bin.label }}</span>
              <span class="font-mono">
                {{ formatMetric(bin.timePct, 1) }}% time / {{ formatMetric(bin.whPct, 1) }}% Wh
              </span>
            </div>
            <div class="h-2 w-full bg-zinc-200 dark:bg-neutral-700 rounded overflow-hidden">
              <div class="h-full bg-primary/70 rounded" :style="{ width: `${Math.max(0, Math.min(100, bin.timePct))}%` }"></div>
            </div>
            <div class="h-2 w-full bg-zinc-200 dark:bg-neutral-700 rounded overflow-hidden">
              <div class="h-full bg-emerald-500/70 rounded" :style="{ width: `${Math.max(0, Math.min(100, bin.whPct))}%` }"></div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div v-if="activeSubTab === 'battery'" class="space-y-4">
        <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">Battery</div>

        <BatterySectionPanel
          title="Battery Pack"
          :open="true"
          timeline-position="after-header"
          :channel-metrics="batteryMetrics.combined"
          :resistance-branch="resistanceMetrics.branches?.total"
          :resistance="resistanceMetrics"
          :chart-series="batteryMetrics.chartSeries?.combined"
          scatter-branch="total"
          timeline-variant="combined"
          :cutoff-voltage="batteryMetrics.health?.voltageZone?.thresholds?.cutoffMin || 9.6"
          :voltage-zone="batteryMetrics.health?.voltageZone"
          @help="openMetricHelp"
        >
          <template #header>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="battery-kpi-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-3 text-xs text-zinc-700 dark:text-gray-300 space-y-1">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">Battery Pack</div>
                  <button type="button" class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('battery_pack_summary')">?</button>
                </div>
                <div>Voltage: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.combined.latestVoltage, METRIC_PRECISION.voltage) }} V</span></div>
                <div>Min Voltage: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.combined.minVoltage, METRIC_PRECISION.voltage) }} V</span></div>
                <div>Resistance: <span class="font-mono text-zinc-900 dark:text-white">{{ resistanceMetrics.branches?.total?.valid ? `${formatMetric(resistanceMetrics.branches.total.rMilliOhm, METRIC_PRECISION.resistanceMilliOhm)} mΩ` : '-' }}</span></div>
                <div class="mt-1 pt-1 border-t border-zinc-200/80 dark:border-neutral-600/80 space-y-0.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold">Battery State</span>
                    <button type="button" class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('voltage_zone')">?</button>
                  </div>
                  <div>Loaded: <span class="font-mono text-zinc-900 dark:text-white">{{ formatLoadedZoneLabel(batteryMetrics.health?.voltageZone?.loadedZone) }}</span></div>
                  <div>Open Circuit: <span class="font-mono text-zinc-900 dark:text-white">{{ formatVoltageZoneLabel(batteryMetrics.health?.voltageZone?.zone) }}</span></div>
                </div>
              </div>
              <div class="battery-kpi-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-3 text-xs text-zinc-700 dark:text-gray-300 space-y-1">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">Upper Battery</div>
                  <button type="button" class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('battery_pack_summary')">?</button>
                </div>
                <div>Voltage: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.upper.latestVoltage, METRIC_PRECISION.voltage) }} V</span></div>
                <div>Min Voltage: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.upper.minVoltage, METRIC_PRECISION.voltage) }} V</span></div>
                <div>Resistance: <span class="font-mono text-zinc-900 dark:text-white">{{ resistanceMetrics.branches?.upper?.valid ? `${formatMetric(resistanceMetrics.branches.upper.rMilliOhm, METRIC_PRECISION.resistanceMilliOhm)} mΩ` : '-' }}</span></div>
                <div class="mt-1 pt-1 border-t border-zinc-200/80 dark:border-neutral-600/80 space-y-0.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold">Battery State</span>
                    <button type="button" class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('voltage_zone')">?</button>
                  </div>
                  <div>Loaded: <span class="font-mono text-zinc-900 dark:text-white">{{ formatLoadedZoneLabel(batteryMetrics.batteryHealth?.upper?.voltageZone?.loadedZone) }}</span></div>
                  <div>Open Circuit: <span class="font-mono text-zinc-900 dark:text-white">{{ formatVoltageZoneLabel(batteryMetrics.batteryHealth?.upper?.voltageZone?.zone) }}</span></div>
                </div>
              </div>
              <div class="battery-kpi-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-3 text-xs text-zinc-700 dark:text-gray-300 space-y-1">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">Lower Battery</div>
                  <button type="button" class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('battery_pack_summary')">?</button>
                </div>
                <div>Voltage: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.lower.latestVoltage, METRIC_PRECISION.voltage) }} V</span></div>
                <div>Min Voltage: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.lower.minVoltage, METRIC_PRECISION.voltage) }} V</span></div>
                <div>Resistance: <span class="font-mono text-zinc-900 dark:text-white">{{ resistanceMetrics.branches?.lower?.valid ? `${formatMetric(resistanceMetrics.branches.lower.rMilliOhm, METRIC_PRECISION.resistanceMilliOhm)} mΩ` : '-' }}</span></div>
                <div class="mt-1 pt-1 border-t border-zinc-200/80 dark:border-neutral-600/80 space-y-0.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold">Battery State</span>
                    <button type="button" class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('voltage_zone')">?</button>
                  </div>
                  <div>Loaded: <span class="font-mono text-zinc-900 dark:text-white">{{ formatLoadedZoneLabel(batteryMetrics.batteryHealth?.lower?.voltageZone?.loadedZone) }}</span></div>
                  <div>Open Circuit: <span class="font-mono text-zinc-900 dark:text-white">{{ formatVoltageZoneLabel(batteryMetrics.batteryHealth?.lower?.voltageZone?.zone) }}</span></div>
                </div>
              </div>
            </div>
          </template>

          <template #health>
            <div class="rounded border border-zinc-200 dark:border-neutral-700 p-3 space-y-3">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">Estimated Capacity Metrics</div>
                <span class="text-[11px] font-normal normal-case tracking-normal text-zinc-500 dark:text-gray-400">Performance VS Yuasa REC36-12I datasheet</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-zinc-700 dark:text-gray-300">
                <div class="battery-health-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2">
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold">Depth of Discharge (DoD)</span>
                    <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('dodPct')">?</button>
                  </div>
                  <div>Window Discharge: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.health?.peukert?.windowDischargeAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>
                  <div>Normalized C/20 discharge: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.health?.normalizedC20DischargeAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>
                  <div>Percentage against Peukert Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(computeCapacityDodPercent(batteryMetrics.health?.peukert?.windowDischargeAh, batteryMetrics.health?.peukert?.expectedCapacityAh), METRIC_PRECISION.estimatedPercent) }}%</span></div>
                  <div>Percentage against Ideal Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(computeCapacityDodPercent(batteryMetrics.health?.peukert?.windowDischargeAh, batteryMetrics.health?.peukert?.estimatedActualCapacityAh), METRIC_PRECISION.estimatedPercent) }}%</span></div>
                  <div>Percentage against Normalized C/20 (ideal): <span class="font-mono text-zinc-900 dark:text-white">{{ Number.isFinite(batteryMetrics.health?.normalizedC20DodPct) ? formatMetric(batteryMetrics.health.normalizedC20DodPct, METRIC_PRECISION.estimatedPercent) + '%' : '—' }}</span></div>
                </div>
                <div class="battery-health-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2">
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="font-semibold">Estimated State of Health (SoH)</span>
                    <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('sohPct')">?</button>
                  </div>
                  <div class="font-mono text-zinc-900 dark:text-white">{{ Number.isFinite(batteryMetrics.health?.soh?.value) ? formatMetric(batteryMetrics.health.soh.value, METRIC_PRECISION.estimatedPercent) + '%' : '—' }}</div>
                  <div v-if="!Number.isFinite(batteryMetrics.health?.soh?.value) && batteryMetrics.health?.soh?.reason" class="text-[11px] text-zinc-500 dark:text-gray-400">{{ formatSohUnavailableReason(batteryMetrics.health.soh.reason) }}</div>
                  <div v-if="Number.isFinite(batteryMetrics.health?.deltaSoc)" class="text-[11px]">ΔSoC: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.health.deltaSoc * 100, METRIC_PRECISION.estimatedPercent) }}%</span></div>
                  <div v-if="Number.isFinite(batteryMetrics.health?.estimatedActualCapacityAh)" class="text-[11px]">Estimated capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.health.estimatedActualCapacityAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>
                  <div v-if="Number.isFinite(batteryMetrics.health?.vc20StartV) && Number.isFinite(batteryMetrics.health?.vc20EndV)" class="text-[11px]">V_C/20: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.health.vc20StartV, METRIC_PRECISION.voltage) }} → {{ formatMetric(batteryMetrics.health.vc20EndV, METRIC_PRECISION.voltage) }} V</span></div>
                </div>
              </div>
              <div class="battery-health-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2 text-xs text-zinc-700 dark:text-gray-300 max-w-md">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-semibold">Capacity</span>
                  <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click="openMetricHelp('peukert_expected_capacity')">?</button>
                </div>
                <div>Peukert Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.health?.peukert?.expectedCapacityAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>
                <div>Ideal Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryMetrics.health?.peukert?.estimatedActualCapacityAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>
              </div>
            </div>
          </template>
        </BatterySectionPanel>

        <BatterySectionPanel
          title="Upper Battery"
          :collapsible="false"
          :battery-health="batteryMetrics.batteryHealth?.upper"
          :channel-metrics="batteryMetrics.upper"
          :resistance-branch="resistanceMetrics.branches?.upper"
          :other-resistance-branch="resistanceMetrics.branches?.lower"
          :other-channel-metrics="batteryMetrics.lower"
          other-battery-label="Lower Battery"
          :resistance="resistanceMetrics"
          :chart-series="batteryMetrics.chartSeries?.upper"
          scatter-branch="upper"
          timeline-variant="upper"
          :cutoff-voltage="batteryMetrics.health?.voltageZone?.thresholds?.cutoffMin || 9.6"
          @help="openMetricHelp"
        />

        <BatterySectionPanel
          title="Lower Battery"
          :collapsible="false"
          :battery-health="batteryMetrics.batteryHealth?.lower"
          :channel-metrics="batteryMetrics.lower"
          :resistance-branch="resistanceMetrics.branches?.lower"
          :other-resistance-branch="resistanceMetrics.branches?.upper"
          :other-channel-metrics="batteryMetrics.upper"
          other-battery-label="Upper Battery"
          :resistance="resistanceMetrics"
          :chart-series="batteryMetrics.chartSeries?.lower"
          scatter-branch="lower"
          timeline-variant="lower"
          :cutoff-voltage="batteryMetrics.health?.voltageZone?.thresholds?.cutoffMin || 9.6"
          @help="openMetricHelp"
        />
      </div>

      <div v-if="activeSubTab === 'events'" class="space-y-4">
      <div class="rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">Reliability Event Log</div>
          <button
            @click="handleExportEventsCsv"
            class="px-2.5 py-1 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-700 border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300"
          >
            Export Events CSV
          </button>
        </div>
        <div v-if="reliabilityEvents.length === 0" class="text-sm text-zinc-500 dark:text-gray-400 italic">
          No reliability events triggered in current window.
        </div>
        <div v-else class="space-y-2 max-h-72 overflow-y-auto pr-1">
          <div
            v-for="event in reliabilityEvents"
            :key="event.id"
            class="border border-zinc-200 dark:border-neutral-700 rounded p-2.5 bg-zinc-50 dark:bg-neutral-900/40"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="px-2 py-0.5 rounded uppercase tracking-wider font-semibold" :class="getEventSeverityClass(event.severity)">{{ event.severity }}</span>
              <span class="font-semibold text-zinc-800 dark:text-gray-200">{{ event.title }}</span>
              <span class="font-mono text-zinc-500 dark:text-gray-400">{{ formatDateTime(event.timestamp) }}</span>
              <button
                @click="jumpToEvent(event)"
                class="ml-auto px-2 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition"
              >
                Jump to Graph
              </button>
            </div>
            <p class="text-xs text-zinc-600 dark:text-gray-400 mt-1">{{ event.message }}</p>
          </div>
        </div>
      </div>
      </div>
    </div>

    <div
      v-if="showMetricHelp && activeMetricHelp"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="closeMetricHelp"
      role="dialog"
      aria-modal="true"
      :aria-label="`${activeMetricHelp.title} help`"
    >
      <div class="w-full max-w-2xl rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 md:p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm md:text-base font-semibold text-zinc-900 dark:text-white">{{ activeMetricHelp.title }}</h3>
            <span class="inline-flex mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" :class="getMetricTypeBadgeClass(activeMetricHelp.metricType)">
              {{ activeMetricHelp.metricType.replace(/_/g, ' ') }}
            </span>
          </div>
          <button
            @click="closeMetricHelp"
            class="px-2 py-1 rounded text-xs font-semibold border transition bg-zinc-200 dark:bg-neutral-700 border-zinc-300 dark:border-neutral-600 text-zinc-700 dark:text-gray-300"
          >
            Close
          </button>
        </div>

        <div class="mt-3 space-y-3 text-sm text-zinc-700 dark:text-gray-300">
          <div>
            <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-1">What this shows</div>
            <p>{{ activeMetricHelp.whatItShows }}</p>
          </div>
          <div>
            <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-1">How to use it</div>
            <p>{{ activeMetricHelp.howToUse }}</p>
          </div>
          <div>
            <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-1">Caveats and assumptions</div>
            <ul class="list-disc pl-5 space-y-1">
              <li v-for="entry in (activeMetricHelp.caveats || [])" :key="entry">{{ entry }}</li>
            </ul>
          </div>
          <div>
            <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-1">Confidence interpretation</div>
            <p>{{ activeMetricHelp.confidenceInterpretation }}</p>
          </div>
          <div v-if="activeMetricHelp.formula || activeMetricHelp.inputs || activeMetricHelp.updateCadence">
            <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400 mb-1">Formula and inputs</div>
            <p v-if="activeMetricHelp.formula"><span class="font-semibold text-zinc-900 dark:text-white">Formula:</span> <span class="font-mono">{{ activeMetricHelp.formula }}</span></p>
            <p v-if="activeMetricHelp.inputs"><span class="font-semibold text-zinc-900 dark:text-white">Inputs:</span> {{ activeMetricHelp.inputs }}</p>
            <p v-if="activeMetricHelp.updateCadence"><span class="font-semibold text-zinc-900 dark:text-white">Update cadence:</span> {{ activeMetricHelp.updateCadence }}</p>
          </div>
        </div>
      </div>
    </div>

    <AnalyticsWindowPickerModal
      :is-open="showWindowPickerModal"
      :is-live-mode="mode === 'live'"
      :samples="telemetry.displayHistory"
      :start-ms="userDefinedStartMs"
      :end-ms="userDefinedEndMs"
      :latest-ms="latestTimestamp"
      :oldest-ms="oldestSampleTimestamp"
      @close="showWindowPickerModal = false"
      @apply="handleWindowPickerApply"
    />
  </div>
</template>

<style scoped>
/* Align datetime-local, select, action button, and mode toggle row height. */
.analytics-race-control,
.analytics-mode-toggle {
  box-sizing: border-box;
  height: 2.125rem;
  min-height: 2.125rem;
  line-height: 1.25rem;
}

.analytics-mode-toggle-btn {
  box-sizing: border-box;
  height: 100%;
  min-height: 2.125rem;
  line-height: 1.25rem;
}

.analytics-mode-toggle-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
