import type { Dashboard, Device, Health, ServerEvent, StoredMessage, VoiceOption, VoiceSel, WakeConfig } from './types';

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* yok say */ } }

// ?token=... bir kez açılınca saklanır
const urlToken = new URLSearchParams(location.search).get('token');
if (urlToken) {
  safeSet('jarvis.token', urlToken);
  history.replaceState(null, '', location.pathname);
}
export const token = safeGet('jarvis.token') || '';

export const clientId = (() => {
  let id = sessionStorage.getItem('jarvis.client');
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('jarvis.client', id);
  }
  return id;
})();

export function detectDevice(): Device {
  const saved = safeGet('jarvis.device') as Device | null;
  if (saved) return saved;
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 1;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
  if (/iPhone|Android.*Mobile|Mobile/.test(ua) || Math.min(innerWidth, innerHeight) < 500) return 'telefon';
  return 'masaustu';
}
export function saveDevice(d: Device) { safeSet('jarvis.device', d); }

const headers = (): HeadersInit => ({ 'Content-Type': 'application/json', ...(token ? { 'x-jarvis-token': token } : {}) });

export interface AppState {
  messages: StoredMessage[];
  photoMode: 'haber' | 'video';
  lastDevice: Device | null;
  tts: boolean;
  voice: VoiceSel;
  sfx: boolean;
  wake: WakeConfig;
  mock: boolean;
  model: string;
  online: Device[];
}

export async function getState(): Promise<AppState> {
  const r = await fetch('/api/state', { headers: headers() });
  if (!r.ok) throw new Error(r.status === 401 ? 'yetkisiz — adresi ?token=... ile aç' : 'sunucuya ulaşılamadı');
  return r.json();
}

/** image: kamera/fotoğraf (data URL). Cevap SSE ile sahne sahne gelir. */
export async function sendChat(text: string, device: Device, image?: string) {
  const r = await fetch('/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ text, device, client: clientId, image }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'hata');
}

export async function getVoices(): Promise<{ voices: VoiceOption[]; current: VoiceSel; tested: number }> {
  const r = await fetch('/api/voices', { headers: headers() });
  if (!r.ok) throw new Error('ses listesi alınamadı');
  return r.json();
}
export const previewUrl = (id: string) => `/api/voices/preview?id=${encodeURIComponent(id)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

/** Ses seçimi tüm cihazlarda ortaktır: sunucuda saklanır ve SSE ile herkese yayılır. */
export async function saveSettings(patch: { voice?: VoiceSel; sfx?: boolean; wake?: Partial<WakeConfig> }) {
  const r = await fetch('/api/settings', { method: 'POST', headers: headers(), body: JSON.stringify(patch) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'kaydedilemedi');
}

/** Mikrofon kaydını RouteLLM ile yazıya çevirir. */
export async function stt(audio: Blob): Promise<string> {
  const r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm', ...(token ? { 'x-jarvis-token': token } : {}) }, body: audio });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'ses yazıya çevrilemedi');
  return (await r.json()).text ?? '';
}

/** İstemcide ölçülen süreler sunucu loguna düşsün (ör. ilk sesin çalmaya başlaması). */
export function metric(event: string, ms: number, detail?: string) {
  fetch('/api/metrics', { method: 'POST', headers: headers(), body: JSON.stringify({ event, ms, detail }), keepalive: true }).catch(() => {});
}

// ---------- İki alkışla uyanma ----------
const post = (url: string, body: object = {}) => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(r => r.ok);
/** Dinleyici çift alkışı duydu (tüm cihazlar "dikkat"); end: komut gelmedi, uykuya dön. heard: sunucu loguna */
export const postAttention = (device: Device, end = false, heard?: string) => post('/api/attention', { device, end, heard });
/** Tüm cihazlarda senkron uyanış. via: "alkış + ses", "test (W)"… */
export const postWake = (via: string, heard?: string) => post('/api/wake', { via, heard });
export const postSleep = () => post('/api/sleep');
export async function getHealth(): Promise<Health | null> {
  try {
    const r = await fetch('/api/health', { headers: headers() });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}
export async function serverTime(): Promise<number> {
  const r = await fetch('/api/time', { headers: headers(), cache: 'no-store' });
  return (await r.json()).now;
}

export async function getDashboard(): Promise<Dashboard> {
  const r = await fetch('/api/dashboard', { headers: headers() });
  if (!r.ok) throw new Error('pano alınamadı');
  return r.json();
}

export async function setPhotoMode(photoMode: 'haber' | 'video') {
  await fetch('/api/settings', { method: 'POST', headers: headers(), body: JSON.stringify({ photoMode }) });
}

export async function clearConversation() {
  await fetch('/api/clear', { method: 'POST', headers: headers() });
}

/** v: cevaba sabitlenmiş ses; i/n yalnızca sunucu logu için ("sahne 3/6"). */
export function ttsUrl(text: string, voice?: VoiceSel, i?: number, n?: number) {
  const q = new URLSearchParams({ text });
  if (voice) q.set('v', `${voice.model}:${voice.voice}`);
  if (i !== undefined) q.set('i', String(i));
  if (n !== undefined) q.set('n', String(n));
  if (token) q.set('token', token);
  return `/api/tts?${q}`;
}

export function subscribe(device: Device, onEvent: (e: ServerEvent) => void, onStatus: (ok: boolean) => void) {
  let es: EventSource | null = null;
  let closed = false;
  const open = () => {
    es = new EventSource(`/api/events?client=${clientId}&device=${device}${token ? `&token=${encodeURIComponent(token)}` : ''}`);
    es.onopen = () => onStatus(true);
    es.onmessage = m => { try { onEvent(JSON.parse(m.data)); } catch { /* yok say */ } };
    es.onerror = () => {
      onStatus(false);
      es?.close();
      if (!closed) setTimeout(open, 1500);
    };
  };
  open();
  return () => { closed = true; es?.close(); };
}
