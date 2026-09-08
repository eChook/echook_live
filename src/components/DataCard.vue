<!--
  @file components/DataCard.vue
  @brief Telemetry data display card component.
  @description A reusable card for displaying a single telemetry value with
               label, unit, and visual feedback for stale data. Supports
               drag-and-drop reordering in the dashboard ribbon.
-->
<script setup>
/**
 * @description DataCard component for displaying formatted telemetry values.
 * 
 * Props:
 * - label: Display name for the data point
 * - dataKey: Raw telemetry key used for formatting/unit rules
 * - value: Raw value to display
 * - unit: Optional unit override
 * - stale: Whether data is stale (reduces opacity)
 * - tooltip: Hover tooltip text
 */
import { computed } from 'vue'
import { formatValue, getUnit } from '../utils/formatting'

/**
 * @brief Component props definition.
 */
const props = defineProps({
  /** @brief Display label for the data point */
  label: String,
  /** @brief Raw telemetry key for formatting and unit inference */
  dataKey: String,
  /** @brief Raw value (formatted for display) */
  value: [String, Number],
  /** @brief Optional unit override (auto-detected if not provided) */
  unit: String,
  /** @brief Whether data should appear stale/dimmed */
  stale: Boolean,
  /** @brief Age in seconds when stale (shown on card) */
  staleAgeSec: { type: Number, default: null },
  /** @brief Threshold status used for warning/critical highlighting */
  thresholdStatus: {
    type: String,
    default: 'normal'
  },
  /** @brief Tooltip text for hover */
  tooltip: String,
  /** @brief Session-seen minimum for the range strip (display units) */
  rangeMin: { type: Number, default: null },
  /** @brief Session-seen maximum for the range strip (display units) */
  rangeMax: { type: Number, default: null },
  /** @brief Warning threshold hairline position (display units) */
  warnThreshold: { type: Number, default: null },
  /** @brief Critical threshold hairline position (display units) */
  criticalThreshold: { type: Number, default: null },
  /** @brief Whether higher values are worse (affects nothing visually, kept for API symmetry) */
  higherIsWorse: { type: Boolean, default: true },
  /** @brief Render as a half-height compact row (label left, value right, no strip) */
  compact: { type: Boolean, default: false }
})

/**
 * @brief Formatted display value using formatting utility.
 * @type {ComputedRef<string>}
 */
const formatKey = computed(() => props.dataKey || props.label || '')
const displayValue = computed(() => formatValue(formatKey.value, props.value))

/**
 * @brief Display unit (uses prop or auto-detects from metric key).
 * @type {ComputedRef<string>}
 */
const displayUnit = computed(() => props.unit || getUnit(formatKey.value))

/** @brief Card border/background classes by threshold status. */
const thresholdCardClass = computed(() => {
  if (props.thresholdStatus === 'critical') {
    return 'border-red-400 dark:border-red-500 bg-red-50/70 dark:bg-red-900/15 hover:border-red-400'
  }
  if (props.thresholdStatus === 'warning') {
    return 'border-amber-400 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-900/15 hover:border-amber-400'
  }
  return 'border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-primary/50'
})

/** @brief Value text classes by stale state and threshold severity. */
const valueClass = computed(() => {
  if (props.stale) return 'text-zinc-400 dark:text-gray-500'
  if (props.thresholdStatus === 'critical') return 'text-red-700 dark:text-red-300'
  if (props.thresholdStatus === 'warning') return 'text-amber-700 dark:text-amber-300'
  return 'text-zinc-900 dark:text-white'
})

/** @brief Whether the range strip has enough data to render (non-compact cards only). */
const hasRangeStrip = computed(() =>
  !props.compact && Number.isFinite(props.rangeMin) && Number.isFinite(props.rangeMax)
)

/**
 * @brief Strip domain [min, max], widened to include any configured threshold so
 *        hairlines outside the session-seen range still land on the track.
 * @type {ComputedRef<{min: number, max: number}|null>}
 */
const stripDomain = computed(() => {
  if (!hasRangeStrip.value) return null
  const candidates = [props.rangeMin, props.rangeMax]
  if (Number.isFinite(props.warnThreshold)) candidates.push(props.warnThreshold)
  if (Number.isFinite(props.criticalThreshold)) candidates.push(props.criticalThreshold)
  const min = Math.min(...candidates)
  const max = Math.max(...candidates)
  return { min, max: max > min ? max : min + 1 }
})

/**
 * @brief Map a value onto the strip's 0-100% domain.
 * @param {number} value - Value to position
 * @returns {number|null} Percentage (0-100) or null if not positionable
 */
function toStripPct(value) {
  const domain = stripDomain.value
  if (!domain || !Number.isFinite(value)) return null
  const pct = ((value - domain.min) / (domain.max - domain.min)) * 100
  return Math.min(100, Math.max(0, pct))
}

/** @brief Positions (0-100%) for the strip's band, tick and threshold hairlines. */
const stripGeometry = computed(() => {
  if (!hasRangeStrip.value) return null
  return {
    bandLeft: toStripPct(props.rangeMin),
    bandRight: toStripPct(props.rangeMax),
    tick: toStripPct(Number(props.value)),
    warn: Number.isFinite(props.warnThreshold) ? toStripPct(props.warnThreshold) : null,
    critical: Number.isFinite(props.criticalThreshold) ? toStripPct(props.criticalThreshold) : null
  }
})

/** @brief Root element classes — single root so the drag wrapper always targets a real element. */
const rootClass = computed(() => [
  'group cursor-grab active:cursor-grabbing transition-all duration-200 border',
  thresholdCardClass.value,
  props.stale ? 'opacity-50 grayscale' : 'opacity-100',
  props.compact
    ? 'h-[calc(50%-3px)] min-w-24 md:min-w-28 flex-shrink-0 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md hover:border-primary/50'
    : 'h-full flex-shrink-0 min-w-20 md:min-w-32 p-2 md:p-3 rounded-lg shadow flex flex-col items-center justify-center space-y-0.5 md:space-y-1 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5'
])
</script>

<template>
  <div :class="rootClass" :title="tooltip">
    <!-- Compact half-height row: label left, value right, no strip -->
    <template v-if="compact">
      <span class="text-[8.5px] uppercase text-zinc-500 dark:text-gray-400 font-bold tracking-wider truncate whitespace-nowrap">{{ label
      }} <span v-if="displayUnit" class="text-zinc-400 dark:text-gray-500 font-normal">({{ displayUnit }})</span></span>
      <span :class="['text-[15px] font-mono font-bold whitespace-nowrap transition-colors duration-500', valueClass]">{{
        displayValue }}<span v-if="stale && staleAgeSec !== null" class="text-[10px] font-normal ml-1 text-zinc-400 dark:text-[color:var(--app-muted)]">· {{ staleAgeSec }}s</span></span>
    </template>

    <!-- Headline card: label, value, and (when data allows) a session range strip -->
    <template v-else>
      <span class="text-[10px] md:text-xs uppercase text-zinc-500 dark:text-gray-400 font-bold tracking-wider truncate max-w-full">{{ label
      }} <span v-if="displayUnit" class="text-zinc-400 dark:text-gray-500 font-normal">({{ displayUnit }})</span></span>
      <span
        :class="['text-lg md:text-2xl font-mono font-bold transition-colors duration-500', valueClass]">{{
          displayValue }}<span v-if="stale && staleAgeSec !== null" class="text-[10px] md:text-xs font-normal ml-1 text-zinc-400 dark:text-[color:var(--app-muted)]">· {{ staleAgeSec }}s</span></span>

      <div v-if="hasRangeStrip" class="relative w-full mt-0.5 h-[5px] rounded-[3px] bg-zinc-100 dark:bg-[#171717]">
        <div class="absolute top-0 bottom-0 rounded-[3px] bg-zinc-300 dark:bg-[#3f3f46]"
          :style="{ left: stripGeometry.bandLeft + '%', width: Math.max(0, stripGeometry.bandRight - stripGeometry.bandLeft) + '%' }"></div>
        <div v-if="stripGeometry.tick !== null" class="absolute -top-0.5 -bottom-0.5 w-[2px] rounded-sm bg-zinc-900 dark:bg-[#fafafa]"
          :style="{ left: stripGeometry.tick + '%' }"></div>
        <div v-if="stripGeometry.warn !== null" class="absolute -top-px -bottom-px w-px bg-[#f59e0b]"
          :style="{ left: stripGeometry.warn + '%' }"></div>
        <div v-if="stripGeometry.critical !== null" class="absolute -top-px -bottom-px w-px bg-[#ef4444]"
          :style="{ left: stripGeometry.critical + '%' }"></div>
      </div>
    </template>
  </div>
</template>
