<script setup>
import { computed } from 'vue'
import { LPolyline } from '@vue-leaflet/vue-leaflet'

const props = defineProps({
    points: {
        type: Array, // Array of { lat, lon, value }
        required: true
    },
    min: {
        type: Number,
        default: 0
    },
    max: {
        type: Number,
        default: 100
    }
})

// Generate segments. Each segment is a line between points.
// Optimized: Merges adjacent points with similar colors into a single polyline.
const segments = computed(() => {
    const segs = []
    if (props.points.length < 2) return segs

    let currentLatLngs = []
    let currentColor = null

    for (let i = 0; i < props.points.length; i++) {
        const p = props.points[i]

        // Calculate color for this point
        let t = 0
        if (props.max > props.min) {
            t = (p.value - props.min) / (props.max - props.min)
        } else {
            t = 1
        }
        t = Math.max(0, Math.min(1, t))
        const hue = Math.floor(t * 120) // Quantize hue to improve merging
        const color = `hsl(${hue}, 100%, 50%)`

        if (currentColor === null) {
            currentColor = color
            currentLatLngs.push([p.lat, p.lon])
        } else if (color === currentColor) {
            currentLatLngs.push([p.lat, p.lon])
        } else {
            // Color changed. Save previous segment and start new one.
            // Segment must include the current point to be continuous
            currentLatLngs.push([p.lat, p.lon])
            segs.push({
                latLngs: [...currentLatLngs],
                color: currentColor
            })
            // Start new segment from the same point to maintain continuity
            currentLatLngs = [[p.lat, p.lon]]
            currentColor = color
        }
    }

    // Push last segment
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
