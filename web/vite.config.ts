import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** El Kontrolü: MediaPipe wasm dosyalarını node_modules'tan /mediapipe/wasm altında sunar (geliştirmede ve derlemede). */
function mediapipeWasm(): Plugin {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'node_modules/@mediapipe/tasks-vision/wasm')
  const route = '/mediapipe/wasm/'
  return {
    name: 'jarvis-mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use(route, (req, res, next) => {
        const file = path.join(src, path.basename((req.url || '').split('?')[0]))
        if (!file.startsWith(src) || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        fs.createReadStream(file).pipe(res)
      })
    },
    writeBundle(opts) {
      const out = path.join(opts.dir || 'dist', 'mediapipe/wasm')
      fs.mkdirSync(out, { recursive: true })
      for (const f of fs.readdirSync(src)) if (f.startsWith('vision_wasm_internal') || f.startsWith('vision_wasm_nosimd')) fs.copyFileSync(path.join(src, f), path.join(out, f))
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    mediapipeWasm(),
    VitePWA({
      // Yeni service worker hemen devreye girer (skipWaiting + clientsClaim); sayfayı main.tsx Jarvis boştayken yeniler.
      // Eskiden yeni sürüm ancak ikinci yenilemede geliyordu; tablet eski sürümde kalıyordu.
      registerType: 'autoUpdate',
      injectRegister: false,
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
      workbox: { globIgnores: ['mediapipe/**', 'models/**', 'space/**'], navigateFallbackDenylist: [/^\/api/, /^\/mediapipe/, /^\/models/, /^\/space/], skipWaiting: true, clientsClaim: true },
    }),
  ],
  server: {
    host: true,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
})
