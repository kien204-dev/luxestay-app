import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Code splitting follows the lazy() route imports in src/App.jsx: the guest
// pages are the entry bundle, and each signed-in/admin page (with whatever
// only it uses, such as the charting library) becomes its own chunk.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
})
