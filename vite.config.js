import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills({
      include: ['buffer', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  build: {
    /**
     * Rolldown (Vite 8) no longer accepts object-form `manualChunks`.
     * Use `codeSplitting.groups` for the same vendor chunk split.
     * @see https://vite.dev/guide/migration#rolldown
     * @see https://rolldown.rs/in-depth/manual-code-splitting
     */
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'echarts',
              test: /\/node_modules\/(?:echarts|vue-echarts)\//
            },
            {
              name: 'leaflet',
              test: /\/node_modules\/(?:leaflet|@vue-leaflet)\//
            }
          ]
        }
      }
    }
  }
})
