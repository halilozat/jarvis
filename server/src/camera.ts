// Kamera cihazları: eski bir iPhone Jarvis'in "gözü" olur.
// - Canlı görüntü kamera ile izleyici arasında doğrudan WebRTC ile akar; sunucu yalnızca sinyal taşır.
// - WebRTC kurulamazsa aralıklı kare modu: kamera saniyede 1 JPEG gönderir, sunucu yalnızca SON kareyi bellekte tutar.
// - kameraya_bak: Jarvis anlık bir kare ister ve RouteLLM görüntü modeline sorar.
// Gizlilik: hiçbir kare diske ya da loga yazılmaz; kamera çevrimdışı olunca son kare silinir.
// ACCESS_TOKEN yoksa özelliğin tamamı kapalıdır (uç noktalar 403 döner).
import 'dotenv/config';
import express, { type Request, type Response, Router } from 'express';
import { randomUUID } from 'node:crypto';
import { routellm, type ChatResponse } from './routellm.js';

export const CAMERA_ENABLED = !!process.env.ACCESS_TOKEN;
/** Görüntü anlama modeli (kameraya_bak). npm run models: input_modalities içinde "image" olanlar. */
export const VISION_MODEL = process.env.VISION_MODEL || 'gemini-3.8-flash';
const MAX_VIEWERS = 3;
const SNAP_TIMEOUT_MS = 5000;

export interface CameraPublic {
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

interface Cam {
  id: string;
  label: string;
  location: string;
  clientId: string;
  online: boolean;
  lastSeen: number;
  /** WebRTC izleyicileri (clientId) */
  viewers: Set<string>;
  /** Aralıklı kare izleyicileri */
  frameViewers: Set<string>;
  frame: { buf: Buffer; at: number } | null;
  motion: boolean;
  quality: string;
  state: string;
}

const cams = new Map<string, Cam>();
const pendingSnaps = new Map<string, { camId: string; resolve(f: { buf: Buffer; at: number } | null): void }>();

let io: { broadcast(e: object): void; sendTo(clientId: string, e: object): boolean } = { broadcast() {}, sendTo: () => false };
/** index.ts SSE yayınını bağlar */
export function initCameras(x: typeof io) { io = x; }

const pub = (c: Cam): CameraPublic => ({
  id: c.id, label: c.label, location: c.location, online: c.online, lastSeen: c.lastSeen,
  viewers: c.viewers.size + c.frameViewers.size, motion: c.motion, quality: c.quality, state: c.state,
});
export const cameraList = () => [...cams.values()].map(pub).sort((a, b) => a.label.localeCompare(b.label));
const announce = () => io.broadcast({ type: 'cameras', cameras: cameraList() });
/** Kameraya izleyici sayılarını bildir: WebRTC'ye göre çözünürlük, kare izleyicisine göre kare gönderimi */
const ctl = (c: Cam) => io.sendTo(c.clientId, { type: 'camera_ctl', camId: c.id, viewers: c.viewers.size, frames: c.frameViewers.size });

const hhmm = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, ch => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[ch] ?? ch).replace(/[^a-z0-9]+/g, ' ').trim();

function setOffline(c: Cam) {
  c.online = false;
  c.lastSeen = Date.now();
  c.frame = null; // gizlilik: çevrimdışı kameranın karesi bellekte kalmaz
  c.motion = false;
  for (const v of [...c.viewers, ...c.frameViewers]) io.sendTo(v, { type: 'rtc', kind: 'bye', camId: c.id, from: c.clientId });
  c.viewers.clear();
  c.frameViewers.clear();
  for (const [id, p] of pendingSnaps) if (p.camId === c.id) { pendingSnaps.delete(id); p.resolve(null); }
}

/** Bir SSE istemcisi koptu: kameraysa çevrimdışı, izleyiciyse bağlantıları temizlenir */
export function onClientClosed(clientId: string) {
  let changed = false;
  for (const c of cams.values()) {
    if (c.clientId === clientId && c.online) {
      setOffline(c);
      console.log(`[kamera] ${c.label} çevrimdışı`);
      changed = true;
    }
    if (c.viewers.delete(clientId) || c.frameViewers.delete(clientId)) {
      io.sendTo(c.clientId, { type: 'rtc', kind: 'bye', camId: c.id, from: clientId });
      ctl(c);
      changed = true;
    }
  }
  if (changed) announce();
}

export function iceServers() {
  const list: { urls: string | string[]; username?: string; credential?: string }[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) list.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return list;
}

// ---------------------------------------------------------------- HTTP

export function cameraRouter(): Router {
  const r = Router();
  // Token yoksa kamera uç noktalarının hiçbiri çalışmaz (genel /api koruması token'ı zaten doğrular)
  r.use(['/api/cameras', '/api/rtc'], (_req, res, next) => (CAMERA_ENABLED ? next() : res.status(403).json({ error: 'Kamera özelliği kapalı: ACCESS_TOKEN tanımlı değil.' })));

  const cam = (req: Request, res: Response): Cam | null => {
    const c = cams.get(String(req.params.id));
    if (!c) { res.status(404).json({ error: 'kamera yok' }); return null; }
    return c;
  };

  r.get('/api/cameras', (_req, res) => res.json({ cameras: cameraList(), ice: iceServers(), maxViewers: MAX_VIEWERS }));

  r.post('/api/cameras/register', (req, res) => {
    const id = String(req.body?.camId || '');
    const clientId = String(req.body?.clientId || '');
    if (!/^cam-[\w-]{4,40}$/.test(id) || !clientId) return res.status(400).json({ error: 'geçersiz kamera' });
    const label = String(req.body?.label || 'CAM-01').slice(0, 24).toLocaleUpperCase('tr');
    const location = String(req.body?.location || '').slice(0, 24).toLocaleUpperCase('tr');
    let c = cams.get(id);
    if (!c) {
      c = { id, label, location, clientId, online: true, lastSeen: Date.now(), viewers: new Set(), frameViewers: new Set(), frame: null, motion: false, quality: '', state: 'hazır' };
      cams.set(id, c);
    }
    Object.assign(c, { label, location, clientId, online: true, lastSeen: Date.now() });
    console.log(`[kamera] ${label}${location ? ` · ${location}` : ''} çevrimiçi`);
    announce();
    ctl(c);
    res.json({ ok: true, ice: iceServers() });
  });

  // Cihaz ekran moduna döndü: kamera listeden tamamen çıkar (son karesiyle birlikte)
  r.post('/api/cameras/:id/forget', (req, res) => {
    const c = cam(req, res);
    if (!c) return;
    setOffline(c);
    cams.delete(c.id);
    console.log(`[kamera] ${c.label} listeden çıkarıldı`);
    announce();
    res.json({ ok: true });
  });

  r.post('/api/cameras/:id/status', (req, res) => {
    const c = cam(req, res);
    if (!c) return;
    c.lastSeen = Date.now();
    if (typeof req.body?.quality === 'string') c.quality = req.body.quality.slice(0, 32);
    if (typeof req.body?.state === 'string') c.state = req.body.state.slice(0, 32);
    announce();
    res.json({ ok: true });
  });

  r.post('/api/cameras/:id/motion', (req, res) => {
    const c = cam(req, res);
    if (!c) return;
    c.motion = !!req.body?.on;
    c.lastSeen = Date.now();
    io.broadcast({ type: 'camera_motion', camId: c.id, on: c.motion });
    announce();
    res.json({ ok: true });
  });

  // Kare: aralıklı kare modu ya da Jarvis'in istediği anlık kare (?req=). Yalnızca bellekte, yalnızca son kare.
  r.post('/api/cameras/:id/frame', express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '4mb' }), (req, res) => {
    const c = cam(req, res);
    if (!c) return;
    if (!Buffer.isBuffer(req.body) || req.body.length < 500) return res.status(400).json({ error: 'kare boş' });
    c.frame = { buf: req.body, at: Date.now() };
    c.lastSeen = c.frame.at;
    const reqId = String(req.query.req || '');
    const p = reqId ? pendingSnaps.get(reqId) : undefined;
    if (p) { pendingSnaps.delete(reqId); p.resolve(c.frame); }
    else io.broadcast({ type: 'camera_frame', camId: c.id, at: c.frame.at });
    res.json({ ok: true });
  });

  r.get('/api/cameras/:id/frame.jpg', (req, res) => {
    const c = cam(req, res);
    if (!c) return;
    if (!c.online || !c.frame) return res.status(404).json({ error: 'kare yok' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-At', String(c.frame.at));
    res.end(c.frame.buf);
  });

  // Aralıklı kare izleyicisi ekle/çıkar
  r.post('/api/cameras/:id/watch', (req, res) => {
    const c = cam(req, res);
    if (!c) return;
    const viewer = String(req.body?.clientId || '');
    if (!viewer) return res.status(400).json({ error: 'izleyici yok' });
    if (req.body?.on) {
      if (!c.frameViewers.has(viewer) && c.viewers.size + c.frameViewers.size >= MAX_VIEWERS) return res.status(409).json({ error: `en fazla ${MAX_VIEWERS} izleyici` });
      c.frameViewers.add(viewer);
    } else c.frameViewers.delete(viewer);
    ctl(c);
    announce();
    res.json({ ok: true });
  });

  // WebRTC sinyali: offer/answer/ICE yalnızca hedef cihaza iletilir
  r.post('/api/rtc/signal', (req, res) => {
    const { camId, from, kind, data } = req.body ?? {};
    const c = cams.get(String(camId));
    if (!c || !c.online) return res.status(404).json({ error: 'kamera çevrimdışı' });
    if (!['request', 'offer', 'answer', 'ice', 'bye'].includes(kind) || typeof from !== 'string') return res.status(400).json({ error: 'geçersiz sinyal' });
    const fromCamera = from === c.clientId;
    if (kind === 'request') {
      if (!c.viewers.has(from) && c.viewers.size + c.frameViewers.size >= MAX_VIEWERS) return res.status(409).json({ error: `en fazla ${MAX_VIEWERS} izleyici` });
      c.viewers.add(from);
      c.frameViewers.delete(from);
      ctl(c);
      announce();
    }
    if (kind === 'bye' && !fromCamera) {
      c.viewers.delete(from);
      ctl(c);
      announce();
    }
    const to = fromCamera ? String(req.body?.to || '') : c.clientId;
    const ok = io.sendTo(to, { type: 'rtc', kind, camId: c.id, from, data });
    res.status(ok ? 200 : 404).json({ ok });
  });

  return r;
}

// ---------------------------------------------------------------- Jarvis kameraya bakar

/** kameraya_bak aracı: anlık kare → RouteLLM görüntü modeli. Çıktı modele gider (veri, talimat değil). */
export async function lookAtCamera(kamera: string, soru: string): Promise<object> {
  if (!CAMERA_ENABLED) return { hata: 'Kamera özelliği kapalı (ACCESS_TOKEN tanımlı değil). Bunu söyle.' };
  const all = [...cams.values()];
  if (!all.length) return { hata: 'Tanımlı kamera yok. Bir cihazda Ayarlar → Bu cihazın rolü → Kamera seçilmeli.' };
  const q = fold(kamera || '');
  const match = (c: Cam) => !q || fold(c.label).includes(q) || fold(c.location).includes(q) || q.includes(fold(c.location) || '\u0000') || q.includes(fold(c.label));
  const named = all.filter(match);
  const pool = named.length ? named : q ? [] : all;
  if (!pool.length) return { hata: `"${kamera}" adında ya da konumunda kamera yok. Kameralar: ${all.map(c => `${c.label}${c.location ? ` (${c.location})` : ''}`).join(', ')}.` };
  const c = pool.find(x => x.online && x.state !== 'durduruldu');
  if (!c && pool.some(x => x.online)) {
    const st = pool.find(x => x.online)!;
    return { hata: `${st.label} kamera cihazında durdurulmuş; görüntü yok. Bunu söyle, uydurma.` };
  }
  if (!c) {
    const off = pool[0];
    return { hata: `${off.label} çevrimdışı · son görülme ${hhmm(off.lastSeen)}. Görüntü yok; uydurma.` };
  }

  // İzleyiciler: panel öne gelsin, tarama başlasın
  io.broadcast({ type: 'camera_look', camId: c.id, phase: 'scan' });
  const reqId = randomUUID();
  const frame = await new Promise<{ buf: Buffer; at: number } | null>(resolve => {
    pendingSnaps.set(reqId, { camId: c.id, resolve });
    if (!io.sendTo(c.clientId, { type: 'camera_snap', camId: c.id, reqId })) { pendingSnaps.delete(reqId); resolve(null); }
    setTimeout(() => { if (pendingSnaps.delete(reqId)) resolve(null); }, SNAP_TIMEOUT_MS);
  });
  if (!frame) {
    io.broadcast({ type: 'camera_look', camId: c.id, phase: 'fail' });
    return { hata: `${c.label} kamera yanıt vermedi (5 sn içinde kare gelmedi). Görüntü yok; uydurma.` };
  }
  io.broadcast({ type: 'camera_look', camId: c.id, phase: 'frozen', at: frame.at });
  console.log(`[kamera] ${c.label} · Jarvis baktı · ${Math.round(frame.buf.length / 1024)} KB · ${VISION_MODEL}`);

  const prompt =
    `Bu, bir ev kamerasından az önce alınmış tek bir kare${c.location ? ` (konum: ${c.location})` : ''}. Soru: ${soru || 'Karede ne var?'}\n` +
    'Kurallar: Yalnızca karede gerçekten görünen şeyleri söyle. Emin olmadığın bir şey için "net göremiyorum" de. ' +
    'Kişilerin kim olduğunu tahmin etme, isim verme; yalnızca "bir kişi" gibi tarif et. Metin okunuyorsa aynen aktar. Türkçe, en fazla 4 kısa cümle.';
  try {
    const r = await routellm<ChatResponse>('/chat/completions', {
      model: VISION_MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frame.buf.toString('base64')}` } }] }],
    });
    const text = String(r.choices?.[0]?.message?.content ?? '').trim();
    if (!text) return { hata: 'Görüntü modeli boş cevap verdi. Görüntü hakkında bir şey söyleme.' };
    return { kamera: c.label, konum: c.location || null, saat: hhmm(frame.at), model: VISION_MODEL, gorunen: text };
  } catch (e) {
    return { hata: `Görüntü yorumlanamadı (${String((e as Error).message).slice(0, 80)}). Görüntü hakkında bir şey söyleme.` };
  }
}
