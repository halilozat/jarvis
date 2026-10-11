import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { getRole } from './lib/camera'
import { token } from './lib/api'
import { TokenGate } from './components/TokenGate'
import { registerSW } from 'virtual:pwa-register'

// ---- Yeni sürüm: dakikada bir kontrol. Yeni service worker sayfayı devraldığında, Jarvis boştayken (konuşmuyor,
// düşünmüyor, dinlemiyor, video/kamera yayını yok, yazı yazılmıyor) ya da sekme arka plandayken kendiliğinden yenile.
const busy = () =>
  document.visibilityState === 'visible' &&
  !!document.querySelector('.state-speaking, .state-thinking, .state-listening, .video-panel, .camdev-live, .campanel, input:focus, textarea:focus')
let pending = false
const hadController = !!navigator.serviceWorker?.controller
navigator.serviceWorker?.addEventListener('controllerchange', () => { if (hadController) pending = true })
registerSW({ immediate: true, onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update().catch(() => {}), 60_000) } })
setInterval(() => { if (pending && !busy()) { pending = false; location.reload() } }, 3000)

// Kamera rolündeki cihaz (eski iPhone) Jarvis arayüzünü değil kamera ekranını açar; ayrı parça olarak yüklenir.
const CameraDevice = lazy(() => import('./camera/CameraDevice'))

/** Sunucu anahtar istiyorsa ve bu cihazdaki anahtar yoksa/yanlışsa önce anahtar ekranı */
function Root() {
  const [auth, setAuth] = useState<'?' | 'ok' | 'yok'>('?')
  useEffect(() => {
    fetch('/api/time', { headers: token ? { 'x-jarvis-token': token } : {} })
      .then(r => setAuth(r.status === 401 ? 'yok' : 'ok'))
      .catch(() => setAuth('ok')) // sunucuya ulaşılamıyorsa uygulama kendi hatasını gösterir
  }, [])
  if (auth === '?') return null
  if (auth === 'yok') return <TokenGate wrong={!!token} />
  return getRole() === 'kamera' ? <Suspense fallback={null}><CameraDevice /></Suspense> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
