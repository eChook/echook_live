import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devServerTarget = env.VITE_DEV_PROXY_TARGET || env.VITE_API_BASE_URL || 'http://localhost:3000'

  return {
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
          target: devServerTarget,
          changeOrigin: true
        },
        '/api': {
          target: devServerTarget,
          changeOrigin: true
        },
        '/admin': {
          target: devServerTarget,
          changeOrigin: true
        },
        '/account': {
          target: devServerTarget,
          changeOrigin: true
        },
        '/socket.io': {
          target: devServerTarget,
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
  }
})
