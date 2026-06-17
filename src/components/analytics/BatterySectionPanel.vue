<!--

  @file components/analytics/BatterySectionPanel.vue

  @brief Battery analytics section with KPIs and per-battery charts.

-->

<script setup>

import { computed, ref, defineProps, defineEmits } from 'vue'
import { ChartBarIcon } from '@heroicons/vue/24/outline'

import BatteryTimelineChart from './BatteryTimelineChart.vue'

import BatteryResistanceChartsModal from './BatteryResistanceChartsModal.vue'

import BatteryVocChartsModal from './BatteryVocChartsModal.vue'

import { METRIC_PRECISION } from '../../utils/metricPrecision'
import {
  computeCapacityDodPercent,
  formatVoltageZoneLabel,
  formatLoadedZoneLabel
} from '../../utils/formatting'



const props = defineProps({

  title: {

    type: String,

    required: true

  },

  subtitle: {

    type: String,

    default: ''

  },

  /** @brief When false, section is always expanded and not wrapped in details. */

  collapsible: {

    type: Boolean,

    default: true

  },

  open: {

    type: Boolean,

    default: true

  },

  channelMetrics: {

    type: Object,

    default: () => ({})

  },

  resistanceBranch: {

    type: Object,

    default: () => ({})

  },

  resistance: {

    type: Object,

    default: () => ({})

  },

  chartSeries: {

    type: Object,

    default: () => ({})

  },

  scatterBranch: {

    type: String,

    default: 'total'

  },

  timelineVariant: {

    type: String,

    default: 'combined'

  },

  /** @brief Per-battery health metrics (DoD, SoH, Peukert, voltage zone) for upper/lower sections. */

  batteryHealth: {

    type: Object,

    default: null

  },

  /**
   * @brief Pack-level voltage zone (OCV estimate, zones) when health lives outside batteryHealth.
   * Upper/lower sections use batteryHealth.voltageZone instead.
   */
  voltageZone: {

    type: Object,

    default: null

  },

  cutoffVoltage: {

    type: Number,

    default: 9.6

  },

  otherBatteryLabel: {

    type: String,

    default: ''

  },

  otherResistanceBranch: {

    type: Object,

    default: null

  },

  otherChannelMetrics: {

    type: Object,

    default: null

  },

  /**
   * @brief Where the voltage + current timeline sits among card rows.
   * `after-header` — between header summary and KPI row (Battery Pack).
   * `after-kpis` — between KPI row and detailed health cards (Upper/Lower).
   */
  timelinePosition: {

    type: String,

    default: 'after-kpis',

    validator: (value) => value === 'after-header' || value === 'after-kpis'

  }

})



const emit = defineEmits(['help'])

/** @brief KPI row layout for voltage, power, and resistance cards. */
const kpiGridClass = 'grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-zinc-700 dark:text-gray-300'

/** @brief Whether the resistance charts modal is open. */
const showResistanceChartsModal = ref(false)

/** @brief Whether the estimated V_oc trend modal is open. */
const showVocChartsModal = ref(false)

/** @brief Whether upper-vs-lower battery comparison deltas should render. */

const showBatteryComparison = computed(() =>

  Boolean(props.otherBatteryLabel && props.otherChannelMetrics && props.otherResistanceBranch)

)

/** @brief Voltage zone payload for Est. V_oc on the Voltage KPI card. */
const voltageZoneForKpi = computed(() => props.batteryHealth?.voltageZone ?? props.voltageZone)

/**
 * @brief Est. V_oc minus latest terminal voltage (positive = OCV above loaded terminal).
 * @returns {number|null}
 */
const vocDeltaToLatestVoltage = computed(() => {
  const voc = voltageZoneForKpi.value?.estimatedVoc
  const terminal = Number.isFinite(props.channelMetrics?.latestVoltage)
    ? props.channelMetrics.latestVoltage
    : voltageZoneForKpi.value?.latestVoltage
  if (!Number.isFinite(voc) || !Number.isFinite(terminal)) return null
  return voc - terminal
})

/** @brief Per-sample V_oc trend for the modal chart. */
const vocTrendSeries = computed(() => props.chartSeries?.vocTrend || [])

/** @brief Whether the V_oc trend chart has plottable samples. */
const hasVocTrendChart = computed(() => vocTrendSeries.value.some((point) => (
  Number.isFinite(point?.timestamp)
  && (Number.isFinite(point?.terminalVoltage) || Number.isFinite(point?.estimatedVoc) || Number.isFinite(point?.current))
)))

/** @brief Resolve IR chart series for the selected x-axis mode. */

const resistanceChartSeries = computed(() => (
  props.chartSeries?.netAh || props.chartSeries?.resistanceVsAh || { points: [] }
))



/**

 * @brief Forward metric help requests to parent tab.

 * @param {string} metricId - Help map key

 */

function requestHelp(metricId) {

  emit('help', metricId)

}

/** @brief Open resistance charts modal from the Resistance KPI card. */
function openResistanceChartsModal() {
  showResistanceChartsModal.value = true
}

/** @brief Close resistance charts modal. */
function closeResistanceChartsModal() {
  showResistanceChartsModal.value = false
}

/** @brief Open estimated V_oc trend modal from the Voltage KPI card. */
function openVocChartsModal() {
  showVocChartsModal.value = true
}

/** @brief Close estimated V_oc trend modal. */
function closeVocChartsModal() {
  showVocChartsModal.value = false
}



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

 * @brief Format numeric diff against the other battery channel.

 * @param {number|null} value - Difference value

 * @param {string} otherLabel - Label of comparison battery

 * @param {number} [digits=3] - Decimal precision

 * @param {string} [unit=''] - Optional unit suffix

 * @returns {string} Formatted bracketed diff text

 */

function formatDiffToOther(value, otherLabel, digits = METRIC_PRECISION.voltage, unit = '') {

  if (!Number.isFinite(value)) return `(Δ vs ${otherLabel}: -)`

  const suffix = unit ? ` ${unit}` : ''

  return `(Δ vs ${otherLabel}: ${formatSigned(value, digits)}${suffix})`

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



</script>



<template>

  <component

    :is="collapsible ? 'details' : 'section'"

    class="battery-section-panel rounded-lg border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"

    :open="collapsible ? open : undefined"

  >

    <component

      :is="collapsible ? 'summary' : 'header'"

      class="sticky top-0 z-10 bg-white dark:bg-neutral-800 border-b border-zinc-200 dark:border-neutral-700 list-none"

    >

      <div class="px-4 pt-4 pb-3" :class="collapsible ? 'cursor-pointer' : ''">

        <div class="text-xs uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">

          {{ title }}

        </div>

        <p v-if="subtitle" class="mt-1 text-[11px] text-zinc-500 dark:text-gray-400">

          {{ subtitle }}

        </p>

      </div>

    </component>



    <div class="space-y-4 px-4 pt-3 pb-4">

      <slot name="header" />

      <BatteryTimelineChart
        v-if="timelinePosition === 'after-header'"
        :series="chartSeries?.timeline || []"
        :cutoff-voltage="cutoffVoltage"
        :variant="timelineVariant"
        @help="requestHelp('battery_voltage_timeline')"
      />

      <div :class="kpiGridClass">

        <div class="battery-kpi-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2">

          <div class="flex items-center justify-between gap-2 mb-1">

            <span class="font-semibold">Voltage</span>

            <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click.prevent="requestHelp('battery_voltage')">?</button>

          </div>

          <div>

            Max: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(channelMetrics?.maxVoltage, METRIC_PRECISION.voltage) }} V</span>

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400">

            {{ formatDiffToOther(channelMetrics?.maxVoltage - otherChannelMetrics?.maxVoltage, otherBatteryLabel, METRIC_PRECISION.voltage, 'V') }}

          </div>

          <div class="mt-1">

            Min: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(channelMetrics?.minVoltage, METRIC_PRECISION.voltage) }} V</span>

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400">

            {{ formatDiffToOther(channelMetrics?.minVoltage - otherChannelMetrics?.minVoltage, otherBatteryLabel, METRIC_PRECISION.voltage, 'V') }}

          </div>

          <div class="mt-1">

            Avg: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(channelMetrics?.avgVoltage, METRIC_PRECISION.voltage) }} V</span>

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400">

            {{ formatDiffToOther(channelMetrics?.avgVoltage - otherChannelMetrics?.avgVoltage, otherBatteryLabel, METRIC_PRECISION.voltage, 'V') }}

          </div>

          <div class="mt-1 pt-1 border-t border-zinc-200/80 dark:border-neutral-600/80 flex items-start justify-between gap-2">

            <div>

              Est. V<sub>oc</sub>:

              <span class="font-mono text-zinc-900 dark:text-white">
                {{ formatMetric(voltageZoneForKpi?.estimatedVoc, METRIC_PRECISION.voltage) }} V<template v-if="vocDeltaToLatestVoltage !== null"> ({{ formatSigned(vocDeltaToLatestVoltage, METRIC_PRECISION.voltage) }} V)</template>
              </span>

            </div>

            <button
              v-if="hasVocTrendChart"
              type="button"
              class="h-5 w-5 shrink-0 flex items-center justify-center rounded-sm border border-zinc-300 dark:border-neutral-600 text-zinc-600 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition"
              title="Open estimated V_oc trend chart"
              aria-label="Open estimated V_oc trend chart"
              @click.prevent="openVocChartsModal"
            >
              <ChartBarIcon class="w-3.5 h-3.5" />
            </button>

          </div>

          <div

            v-if="voltageZoneForKpi?.descriptor?.confidence"

            class="text-[11px]"

            :class="getConfidenceClass(voltageZoneForKpi.descriptor.confidence)"

          >

            Confidence: {{ voltageZoneForKpi.descriptor.confidence }}

          </div>

          <div
            v-if="batteryHealth && (voltageZoneForKpi?.zone || voltageZoneForKpi?.loadedZone)"
            class="mt-1 pt-1 border-t border-zinc-200/80 dark:border-neutral-600/80 space-y-0.5"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold">Battery State</span>
              <button
                type="button"
                class="h-5 w-5 shrink-0 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold"
                @click.prevent="requestHelp('voltage_zone')"
              >
                ?
              </button>
            </div>
            <div>
              Loaded:
              <span class="font-mono text-zinc-900 dark:text-white">{{ formatLoadedZoneLabel(voltageZoneForKpi?.loadedZone) }}</span>
            </div>
            <div>
              Open Circuit:
              <span class="font-mono text-zinc-900 dark:text-white">{{ formatVoltageZoneLabel(voltageZoneForKpi?.zone) }}</span>
            </div>
          </div>

        </div>

        <div class="battery-kpi-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2">

          <div class="flex items-center justify-between gap-2 mb-1">

            <span class="font-semibold">Power</span>

            <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click.prevent="requestHelp('combined_max_power')">?</button>

          </div>

          <div>

            Instantaneous: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(channelMetrics?.instantaneousPowerW, METRIC_PRECISION.powerW) }} W</span>

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400 mt-0.5">

            {{ formatDiffToOther(channelMetrics?.instantaneousPowerW - otherChannelMetrics?.instantaneousPowerW, otherBatteryLabel, METRIC_PRECISION.powerW, 'W') }}

          </div>

          <div class="mt-1">

            Max: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(channelMetrics?.maxPowerW, METRIC_PRECISION.powerW) }} W</span>

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400 mt-0.5">

            {{ formatDiffToOther(channelMetrics?.maxPowerW - otherChannelMetrics?.maxPowerW, otherBatteryLabel, METRIC_PRECISION.powerW, 'W') }}

          </div>

          <div class="mt-1">

            Discharge: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(channelMetrics?.dischargeWh, METRIC_PRECISION.energyWh) }} Wh</span>

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400 mt-0.5">

            {{ formatDiffToOther(channelMetrics?.dischargeWh - otherChannelMetrics?.dischargeWh, otherBatteryLabel, METRIC_PRECISION.energyWh, 'Wh') }}

          </div>

          <div class="mt-1">

            Regen: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(channelMetrics?.regenWh, METRIC_PRECISION.energyWh) }} Wh</span>

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400 mt-0.5">

            {{ formatDiffToOther(channelMetrics?.regenWh - otherChannelMetrics?.regenWh, otherBatteryLabel, METRIC_PRECISION.energyWh, 'Wh') }}

          </div>

        </div>

        <div class="battery-kpi-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2">

          <div class="flex items-center justify-between gap-2 mb-1">

            <span class="font-semibold">Resistance</span>

            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                class="h-5 w-5 flex items-center justify-center rounded-sm border border-zinc-300 dark:border-neutral-600 text-zinc-600 dark:text-gray-300 hover:bg-zinc-100 dark:hover:bg-neutral-700 transition"
                title="Open resistance charts"
                aria-label="Open resistance charts"
                @click.prevent="openResistanceChartsModal"
              >
                <ChartBarIcon class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold"
                :title="scatterBranch === 'total' ? 'How supply resistance is calculated' : 'Battery resistance help'"
                :aria-label="scatterBranch === 'total' ? 'Show supply resistance help' : 'Show battery resistance help'"
                @click.prevent="requestHelp(scatterBranch === 'total' ? 'supply_resistance_total' : 'battery_resistance')"
              >
                ?
              </button>
            </div>

          </div>

          <div class="font-mono text-zinc-900 dark:text-white">

            {{ resistanceBranch?.valid ? `${formatMetric(resistanceBranch.rMilliOhm, METRIC_PRECISION.resistanceMilliOhm)} mΩ` : '-' }}

          </div>

          <div v-if="showBatteryComparison" class="text-[11px] text-zinc-500 dark:text-gray-400 mt-0.5">

            {{ formatDiffToOther(resistanceBranch?.rMilliOhm - otherResistanceBranch?.rMilliOhm, otherBatteryLabel, METRIC_PRECISION.resistanceMilliOhm, 'mΩ') }}

          </div>

          <div class="mt-1">Fit R²: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(resistanceBranch?.fitR2, METRIC_PRECISION.fitR2) }}</span></div>

          <div class="mt-1">

            Confidence:

            <span class="font-mono uppercase" :class="getConfidenceClass(resistanceBranch?.confidence)">

              {{ resistanceBranch?.confidence || '-' }}

            </span>

          </div>

        </div>

      </div>

      <BatteryTimelineChart
        v-if="timelinePosition === 'after-kpis'"
        :series="chartSeries?.timeline || []"
        :cutoff-voltage="cutoffVoltage"
        :variant="timelineVariant"
        @help="requestHelp('battery_voltage_timeline')"
      />

      <slot name="extra-kpis" />



      <div

        v-if="batteryHealth"

        class="rounded border border-zinc-200 dark:border-neutral-700 p-3 space-y-3"

      >

        <div class="text-[11px] uppercase font-bold tracking-wider text-zinc-500 dark:text-gray-400">

          Detailed {{ title }} Metrics

        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-zinc-700 dark:text-gray-300">

          <div class="battery-health-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2">

            <div class="flex items-center justify-between gap-2 mb-1">

              <span class="font-semibold">Depth of Discharge (DoD)</span>

              <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click.prevent="requestHelp('dodPct')">?</button>

            </div>

            <div>Window Discharge: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryHealth.peukert?.windowDischargeAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>

            <div>Normalized C/20 discharge: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryHealth.normalizedC20DischargeAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>

            <div>Percentage against Peukert Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(computeCapacityDodPercent(batteryHealth.peukert?.windowDischargeAh, batteryHealth.peukert?.expectedCapacityAh), METRIC_PRECISION.estimatedPercent) }}%</span></div>

            <div>Percentage against Ideal Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(computeCapacityDodPercent(batteryHealth.peukert?.windowDischargeAh, batteryHealth.peukert?.estimatedActualCapacityAh), METRIC_PRECISION.estimatedPercent) }}%</span></div>

            <div>Percentage against Normalized C/20 (ideal): <span class="font-mono text-zinc-900 dark:text-white">{{ Number.isFinite(batteryHealth.normalizedC20DodPct) ? formatMetric(batteryHealth.normalizedC20DodPct, METRIC_PRECISION.estimatedPercent) + '%' : '—' }}</span></div>

          </div>

          <div class="battery-health-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2">

            <div class="flex items-center justify-between gap-2 mb-1">

              <span class="font-semibold">Estimated State of Health (SoH)</span>

              <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click.prevent="requestHelp('sohPct')">?</button>

            </div>

            <div class="font-mono text-zinc-900 dark:text-white">{{ Number.isFinite(batteryHealth.soh?.value) ? formatMetric(batteryHealth.soh.value, METRIC_PRECISION.estimatedPercent) + '%' : '—' }}</div>

            <div v-if="!Number.isFinite(batteryHealth.soh?.value) && batteryHealth.soh?.reason" class="text-[11px] text-zinc-500 dark:text-gray-400">

              {{ formatSohUnavailableReason(batteryHealth.soh.reason) }}

            </div>

            <div v-if="Number.isFinite(batteryHealth.deltaSoc)" class="text-[11px]">

              ΔSoC: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryHealth.deltaSoc * 100, METRIC_PRECISION.estimatedPercent) }}%</span>

            </div>

            <div v-if="Number.isFinite(batteryHealth.estimatedActualCapacityAh)" class="text-[11px]">

              Estimated capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryHealth.estimatedActualCapacityAh, METRIC_PRECISION.peukertAh) }} Ah</span>

            </div>

            <div v-if="Number.isFinite(batteryHealth.vc20StartV) && Number.isFinite(batteryHealth.vc20EndV)" class="text-[11px]">

              V_C/20: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryHealth.vc20StartV, METRIC_PRECISION.voltage) }} → {{ formatMetric(batteryHealth.vc20EndV, METRIC_PRECISION.voltage) }} V</span>

            </div>

          </div>

        </div>

        <div class="battery-health-card rounded border border-zinc-200 dark:border-neutral-700 bg-[color-mix(in_srgb,#fff_95%,#f4f4f5_5%)] dark:bg-[color-mix(in_srgb,#262626_95%,#fff_5%)] p-2 text-xs text-zinc-700 dark:text-gray-300 max-w-md">

          <div class="flex items-center justify-between gap-2 mb-1">

            <span class="font-semibold">Capacity</span>

            <button type="button" class="h-5 w-5 rounded-full border border-zinc-300 dark:border-neutral-600 text-[11px] font-bold" @click.prevent="requestHelp('peukert_expected_capacity')">?</button>

          </div>

          <div>Peukert Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryHealth.peukert?.expectedCapacityAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>

          <div>Ideal Capacity: <span class="font-mono text-zinc-900 dark:text-white">{{ formatMetric(batteryHealth.peukert?.estimatedActualCapacityAh, METRIC_PRECISION.peukertAh) }} Ah</span></div>

        </div>

      </div>



      <slot name="health" />

    </div>

  </component>

  <BatteryResistanceChartsModal
    :is-open="showResistanceChartsModal"
    :title="title"
    :chart-series="chartSeries"
    :resistance="resistance"
    :scatter-branch="scatterBranch"
    :resistance-chart-series="resistanceChartSeries"
    @close="closeResistanceChartsModal"
    @help="requestHelp"
  />

  <BatteryVocChartsModal
    :is-open="showVocChartsModal"
    :title="title"
    :series="vocTrendSeries"
    :scatter-branch="scatterBranch"
    @close="closeVocChartsModal"
  />

</template>

