<!--
  @file components/GradientPath.vue
  @brief Gradient-colored polyline path for map display.
  @description Renders a multi-segment polyline on a Leaflet map where each
               segment's color represents a value using a red-to-green HSL
               gradient. Optimizes by merging adjacent similar-colored segments.
-->
<script setup>
/**
 * @description GradientPath component for displaying value-colored trails.
 * 
 * Features:
 * - Renders polyline segments with colors based on value
 * - Red (0) to Green (120) HSL gradient based on min/max range
 * - Optimizes segment count by merging adjacent similar colors
 * - Maintains continuity between color transitions
 * 
 * Props:
 * - points: Array of { lat, lon, value } objects
 * - min: Minimum value for gradient (maps to red)
 * - max: Maximum value for gradient (maps to green)
 */
import { computed } from 'vue'
import { LPolyline } from '@vue-leaflet/vue-leaflet'

/**
 * @brief Component props definition.
 */
const props = defineProps({
    /**
     * @brief Array of points with lat, lon, and value.
     * @type {Array<{lat: number, lon: number, value: number}>}
     */
    points: {
        type: Array,
        required: true
    },
    /** @brief Minimum value for gradient (red) */
    min: {
        type: Number,
        default: 0
    },
    /** @brief Maximum value for gradient (green) */
    max: {
        type: Number,
        default: 100
    }
})

/**
 * @brief Generate optimized polyline segments with gradient colors.
 * @description Groups consecutive points with the same quantized color
 *              into single polylines for rendering efficiency.
 * @type {ComputedRef<Array<{latLngs: Array, color: string}>>}
 */
const segments = computed(() => {
    const segs = []
    if (props.points.length < 2) return segs

    let currentLatLngs = []
    let currentColor = null

    for (let i = 0; i < props.points.length; i++) {
        const p = props.points[i]

        // Calculate normalized value (0 to 1)
        let t = 0
        if (props.max > props.min) {
            t = (p.value - props.min) / (props.max - props.min)
        } else {
            t = 1
        }
        t = Math.max(0, Math.min(1, t))

        // Convert to HSL hue (0=red, 120=green)
        const hue = Math.floor(t * 120)
        const color = `hsl(${hue}, 100%, 50%)`

        if (currentColor === null) {
            // First point
            currentColor = color
            currentLatLngs.push([p.lat, p.lon])
        } else if (color === currentColor) {
            // Same color, extend current segment
            currentLatLngs.push([p.lat, p.lon])
        } else {
            // Color changed - save segment and start new one
            currentLatLngs.push([p.lat, p.lon])
            segs.push({
                latLngs: [...currentLatLngs],
                color: currentColor
            })
            // Start new segment from same point for continuity
            currentLatLngs = [[p.lat, p.lon]]
            currentColor = color
        }
    }

    // Push final segment
    if (currentLatLngs.length > 1) {
        segs.push({
            latLngs: currentLatLngs,
            color: currentColor
        })
    }

    return segs
})
</script>

<template>
    <div style="display: none;">
        <LPolyline v-for="(seg, index) in segments" :key="index" :lat-lngs="seg.latLngs" :color="seg.color" :weight="4"
            :opacity="0.8" />
    </div>
</template>
