// Kamera cihazı ve izleyici için ortak yardımcılar: rol, ayarlar, sunucu çağrıları, olay kanalı.
import { clientId, token } from './api';

export interface CameraInfo {
  id: string;
  label: string;
  location: string;
  online: boolean;
  lastSeen: number;
  viewers: number;
  motion: boolean;
  quality: string;
  state: string;
}

export type CameraEvent =
  | { type: 'cameras'; cameras: CameraInfo[] }
  | { type: 'camera_motion'; camId: string; on: boolean }
  | { type: 'camera_frame'; camId: string; at: number }
  | { type: 'camera_look'; camId: string; phase: 'scan' | 'frozen' | 'fail'; at?: number }
  | { type: 'camera_ctl'; camId: string; viewers: number; frames: number }
  | { type: 'camera_snap'; camId: string; reqId: string }
  | { type: 'rtc'; kind: 'request' | 'offer' | 'answer' | 'ice' | 'bye'; camId: string; from: string; data?: any };

/** "Kamera" düğmesi: canlı kamera panelini aç/küçült */
export const toggleCameraPanel = () => cameraBus.dispatchEvent(new Event('toggle-panel'));

export const isCameraEvent = (e: { type: string }): e is CameraEvent => e.type === 'rtc' || e.type.startsWith('camera');

/** App'in SSE akışından gelen kamera olayları buraya düşer; panel ve kamera cihazı dinler. */
export const cameraBus = new EventTarget();
export const emitCamera = (e: CameraEvent) => cameraBus.dispatchEvent(new CustomEvent('evt', { detail: e }));
export function onCamera(fn: (e: CameraEvent) => void): () => void {
  const h = (ev: Event) => fn((ev as CustomEvent<CameraEvent>).detail);
  cameraBus.addEventListener('evt', h);
  return () => cameraBus.removeEventListener('evt', h);
}

// ---------------------------------------------------------------- Rol ve kamera ayarları (bu cihazda saklanır)

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* yok say */ } }

export type Role = 'ekran' | 'kamera';
export const getRole = (): Role => (safeGet('jarvis.role') === 'kamera' ? 'kamera' : 'ekran');
export function setRole(r: Role) { safeSet('jarvis.role', r); location.reload(); }

export interface CamSettings {
  id: string;
  label: string;
  location: string;
  facing: 'environment' | 'user';
  motion: boolean;
  /** Değişen piksel oranı eşiği (0.01–0.2) */
  threshold: number;
  /** Bir kez "Kamerayı başlat"a basıldı mı (sonra otomatik denenir) */
  started: boolean;
}
export function getCamSettings(): CamSettings {
  let s: Partial<CamSettings> = {};
  try { s = JSON.parse(safeGet('jarvis.cam') || '{}'); } catch { /* yok say */ }
  const id = s.id && /^cam-[\w-]{4,40}$/.test(s.id) ? s.id : `cam-${Math.random().toString(36).slice(2, 10)}`;
  const out: CamSettings = {
    id,
    label: s.label || 'CAM-01',
    location: s.location ?? '',
    facing: s.facing === 'user' ? 'user' : 'environment',
    motion: s.motion ?? true,
    threshold: typeof s.threshold === 'number' ? Math.min(0.2, Math.max(0.01, s.threshold)) : 0.04,
    started: !!s.started,
  };
  safeSet('jarvis.cam', JSON.stringify(out));
  return out;
}
export const saveCamSettings = (s: CamSettings) => safeSet('jarvis.cam', JSON.stringify(s));

// ---------------------------------------------------------------- Sunucu

const headers = (json = true): HeadersInit => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'x-jarvis-token': token } : {}) });
const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body), keepalive: true });

export type Ice = RTCIceServer[];
export async function getCameras(): Promise<{ cameras: CameraInfo[]; ice: Ice } | null> {
  try {
    const r = await fetch('/api/cameras', { headers: headers(false) });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}
export async function registerCamera(s: CamSettings): Promise<{ ice: Ice } | null> {
  const r = await post('/api/cameras/register', { camId: s.id, clientId, label: s.label, location: s.location });
  return r.ok ? r.json() : null;
}
export const cameraStatus = (camId: string, body: { quality?: string; state?: string }) => post(`/api/cameras/${camId}/status`, body).catch(() => {});
/** Ekran moduna dönüş: kamera sunucudaki listeden çıkar */
export const forgetCamera = (camId: string) => post(`/api/cameras/${camId}/forget`, {}).catch(() => {});
export const cameraMotion = (camId: string, on: boolean) => post(`/api/cameras/${camId}/motion`, { on }).catch(() => {});
export const watchFrames = (camId: string, on: boolean) => post(`/api/cameras/${camId}/watch`, { clientId, on });
export function postFrame(camId: string, jpeg: Blob, reqId?: string) {
  return fetch(`/api/cameras/${camId}/frame${reqId ? `?req=${encodeURIComponent(reqId)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', ...(token ? { 'x-jarvis-token': token } : {}) }, body: jpeg }).catch(() => {});
}
export const frameUrl = (camId: string, t: number) => `/api/cameras/${camId}/frame.jpg?t=${t}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
/** WebRTC sinyali. Kamera gönderirken `to` izleyicinin clientId'si; izleyici gönderirken sunucu kameraya iletir. */
export const signal = (camId: string, kind: string, data?: unknown, to?: string) => post('/api/rtc/signal', { camId, from: clientId, to, kind, data });

/** Video karesini JPEG'e çevirir (en fazla maxW genişlik). */
export function grabJpeg(video: HTMLVideoElement, maxW: number, quality: number): Promise<Blob | null> {
  const w0 = video.videoWidth, h0 = video.videoHeight;
  if (!w0 || !h0) return Promise.resolve(null);
  const k = Math.min(1, maxW / w0);
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', quality));
}

export const hhmm = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
