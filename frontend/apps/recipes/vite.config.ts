import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Each micro-app builds into ../../dist/<app>/ and is served by Django + WhiteNoise
// under /static/<app>/. In dev, Vite serves at "/" and proxies the API to Django,
// so the React app can call relative "/api/..." URLs in both dev and production.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/static/recipes/' : '/',
  build: {
    outDir: '../../dist/recipes',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
}))
