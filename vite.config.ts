import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.MYTHOPHONE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.MYTHOPHONE_API_PROXY_TARGET || 'http://127.0.0.1:8787',
    },
  },
})
