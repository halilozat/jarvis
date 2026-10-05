import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Jarvis',
        short_name: 'Jarvis',
        description: 'Kişisel yapay zeka asistanı',
        theme_color: '#04070c',
        background_color: '#04070c',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
  server: {
    host: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
})
