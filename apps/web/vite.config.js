import path from 'node:path'
import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Code splitting follows the lazy() route imports in src/App.jsx: the guest
// pages are the entry bundle, and each signed-in/admin page (with whatever
// only it uses, such as the charting library) becomes its own chunk.
//
// E2E_GOOGLE_STUB=1 (the browser tests' build only, see test-e2e/stack.mjs)
// swaps Google's popup for test-e2e/firebase-auth-stub.mjs, so the tests can
// press the real "Continue with Google" button.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: process.env.E2E_GOOGLE_STUB === '1'
    ? { alias: { 'firebase/auth': path.resolve(import.meta.dirname, 'test-e2e/firebase-auth-stub.mjs') } }
    : {},
  server: {
    port: 5173,
    strictPort: true,
  },
})
