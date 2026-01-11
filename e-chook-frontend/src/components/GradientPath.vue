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

// Generate segments. Each segment is a line between point[i] and point[i+1].
// Color is determined by point[i].value
const segments = computed(() => {
    const segs = []
    if (props.points.length < 2) return segs

    for (let i = 0; i < props.points.length - 1; i++) {
        const p1 = props.points[i]
        const p2 = props.points[i + 1]

        // Normalize value 0..1
        let t = 0
        if (props.max > props.min) {
            t = (p1.value - props.min) / (props.max - props.min)
        } else {
            t = 1 // Default to max color if flat range
        }
        // Clamp
        t = Math.max(0, Math.min(1, t))

        // Map to Hue: 0 (Red) -> 120 (Green)
        const hue = t * 120
        const color = `hsl(${hue}, 100%, 50%)`

        segs.push({
            latLngs: [[p1.lat, p1.lon], [p2.lat, p2.lon]],
            color
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
