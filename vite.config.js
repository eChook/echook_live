import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'echarts': ['echarts', 'vue-echarts'],
          'leaflet': ['leaflet', '@vue-leaflet/vue-leaflet'],
        }
      }
    }
  }
})
