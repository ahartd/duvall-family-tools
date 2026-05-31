import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds into ../../dist/dashboard/ and is served by Django + WhiteNoise under
// /static/dashboard/. In dev, Vite serves at "/" and proxies the API to Django.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/static/dashboard/' : '/',
  build: {
    outDir: '../../dist/dashboard',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
}))
