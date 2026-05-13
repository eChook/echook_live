import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const DEV_SERVER_TARGET = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000'

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
  server: {
    proxy: {
      '/auth': {
        target: DEV_SERVER_TARGET,
        changeOrigin: true
      },
      '/api': {
        target: DEV_SERVER_TARGET,
        changeOrigin: true
      },
      '/admin': {
        target: DEV_SERVER_TARGET,
        changeOrigin: true
      },
      '/account': {
        target: DEV_SERVER_TARGET,
        changeOrigin: true
      },
      '/socket.io': {
        target: DEV_SERVER_TARGET,
        changeOrigin: true,
        ws: true
      }
    }
  },
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
