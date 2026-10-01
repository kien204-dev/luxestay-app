import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('chart.js') || id.includes('react-chartjs-2') || id.includes('recharts')) {
            return 'vendor-charts'
          }
          if (id.includes('react-router-dom')) return 'vendor-router'
          if (id.includes('react') || id.includes('react-dom')) return 'vendor-react'

          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
