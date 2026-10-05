import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJarvis } from './agent.js';
import { BRIEF_OPENING, BRIEF_TRIGGER } from './brief.js';
import { buildDashboard } from './dashboard.js';
import { IMG_DIR } from './imagegen.js';
import { MOCK, CHAT_MODEL } from './routellm.js';
import { transcribe, STT_MODEL } from './stt.js';
import {
  BROWSER, DEFAULT_RATE, clampRate, envVoice, isRoutedModel, loadCatalog, preview, synthesize, ttsEnabled, usableVoices, voiceId, warmOpening,
  type VoiceSel,
} from './tts.js';
import { knownImageUrls, type PhotoMode } from './photos.js';
import { DEFAULT_WAKE, greetingPeriod, health, mergeWake, type WakeConfig } from './wake.js';
import type { Device, StoredMessage } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';
const DATA_FILE = path.join(__dirname, '..', 'data', 'state.json');
const DEVICES: Device[] = ['masaustu', 'tablet', 'telefon'];

// ---------- Kalıcı durum (tek konuşma, tüm cihazlarda ortak) ----------
interface State {
  messages: StoredMessage[];
  photoMode: PhotoMode;
  lastClient: string | null;
  lastDevice: Device | null;
  /** Seslendiren: Ayarlar'dan seçilir, tüm cihazlarda ortak. .env yalnızca varsayılan. */
  voice?: VoiceSel;
  /** "Jarvis efekti": sahne geçiş sesi */
  sfx?: boolean;
  /** İki alkışla uyanma ayarları (tüm cihazlarda ortak) */
  wake?: WakeConfig;
}
function loadState(): State {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { messages: [], photoMode: 'haber', lastClient: null, lastDevice: null };
  }
}
const state = loadState();
function saveState() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ ...state, messages: state.messages.slice(-100) }, null, 2));
}

// ---------- Ses seçimi ----------
const env = envVoice();
if (env.warning) console.warn(`[tts] UYARI: ${env.warning}`);
/** Seçili ses kataloğda doğrulanmış mı (ya da tarayıcı sesi mi)? Değilse .env varsayılanına dönülür. */
function validVoice(v: VoiceSel | undefined): v is VoiceSel {
  if (!v || typeof v.model !== 'string' || typeof v.voice !== 'string') return false;
  if (v.model === BROWSER) return true;
  if (isRoutedModel(v.model)) return false;
  const catalog = usableVoices();
  return !catalog.length || catalog.some(c => c.model === v.model && c.voice === v.voice);
}
if (state.voice && !validVoice(state.voice)) {
  console.warn(`[tts] Kayıtlı ses geçersiz (${voiceId(state.voice)}), .env varsayılanına dönülüyor.`);
  delete state.voice;
}
const currentVoice = (): VoiceSel => state.voice ?? env.sel;
const sfx = () => state.sfx ?? true;
const wakeCfg = (): WakeConfig => mergeWake(DEFAULT_WAKE, state.wake ?? {});

/** Karşılama cümleleri seçili sesle önceden üretilip diske yazılır: uyanışta ağ beklemeden çalsın. */
function warmGreetings(v: VoiceSel = currentVoice()) {
  if (!ttsEnabled(v)) return;
  const g = wakeCfg().greetings;
  for (const [period, text] of Object.entries(g)) {
    synthesize(text, v, `karşılama (${period})`, true).catch(() => {});
  }
}

// ---------- SSE: cihazlar arası anlık senkron ----------
interface Client { id: string; device: Device; res: Response }
const clients = new Map<string, Client>();
function broadcast(event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients.values()) c.res.write(data);
}
function presence() {
  return DEVICES.filter(d => [...clients.values()].some(c => c.device === d));
}

const app = express();
app.use(express.json({ limit: '12mb' })); // kamera fotoğrafı (istemci ~1280 px JPEG'e küçültür)

// İsteğe bağlı erişim koruması (tünel/deploy için önerilir)
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (!ACCESS_TOKEN) return next();
  const t = req.header('x-jarvis-token') || (req.query.token as string);
  if (t === ACCESS_TOKEN) return next();
  res.status(401).json({ error: 'yetkisiz' });
});

const asDevice = (d: unknown): Device => (DEVICES.includes(d as Device) ? (d as Device) : 'masaustu');

app.get('/api/events', (req, res) => {
  const id = String(req.query.client || Math.random());
  const device = asDevice(req.query.device);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': bağlandı\n\n');
  clients.set(id, { id, device, res });
  broadcast({ type: 'presence', online: presence() });
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(id);
    broadcast({ type: 'presence', online: presence() });
  });
});

const settingsEvent = () => ({ type: 'settings', photoMode: state.photoMode, voice: currentVoice(), sfx: sfx(), wake: wakeCfg() });

app.get('/api/state', (_req, res) => {
  res.json({
    messages: state.messages.slice(-50),
    photoMode: state.photoMode,
    lastDevice: state.lastDevice,
    tts: ttsEnabled(currentVoice()),
    voice: currentVoice(),
    sfx: sfx(),
    wake: wakeCfg(),
    mock: MOCK,
    model: CHAT_MODEL,
    online: presence(),
  });
});

// ---------- Sabah panosu ----------
const lastModel = () => [...state.messages].reverse().find(m => m.reply?.model)?.reply?.model ?? CHAT_MODEL;
const dashboard = () => buildDashboard({ devices: presence(), model: lastModel() });

app.get('/api/dashboard', async (_req, res) => {
  try {
    res.json(await dashboard());
  } catch (e: any) {
    console.error('Pano hatası:', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// 5 dakikada bir tüm açık cihazlara taze pano (kaynakların kendi önbellekleri 10 dk).
setInterval(() => {
  if (!clients.size) return;
  dashboard()
    .then(data => broadcast({ type: 'dashboard', data }))
    .catch(e => console.warn('Pano yayınlanamadı:', e));
}, 5 * 60_000).unref();

// ---------- Seslendiren ----------
app.get('/api/voices', (_req, res) => {
  const list = usableVoices().map(({ id, model, voice, label, provider, f0, wpm }) => ({
    id, model, voice, label, provider, wpm,
    f0: f0?.length ? Math.round(f0.reduce((a, b) => a + b, 0) / f0.length) : null,
  }));
  res.json({ voices: list, current: currentVoice(), tested: loadCatalog().length });
});

app.get('/api/voices/preview', async (req, res) => {
  const [model, voice] = String(req.query.id || '').split(':');
  const sel = { model, voice, speed: DEFAULT_RATE };
  if (!model || !voice || model === BROWSER || !validVoice(sel)) return res.status(400).json({ error: 'geçersiz ses' });
  const s = await preview(sel).catch(() => null);
  if (!s) return res.status(502).json({ error: 'önizleme üretilemedi' });
  res.setHeader('Content-Type', s.mime);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.end(s.buf);
});

app.post('/api/settings', (req, res) => {
  if (req.body.photoMode === 'haber' || req.body.photoMode === 'video') state.photoMode = req.body.photoMode;
  if (typeof req.body.sfx === 'boolean') state.sfx = req.body.sfx;
  if (req.body.voice) {
    const v = req.body.voice;
    const sel: VoiceSel = { model: String(v.model ?? ''), voice: String(v.voice ?? ''), speed: clampRate(Number(v.speed ?? currentVoice().speed)) };
    if (!validVoice(sel)) return res.status(400).json({ error: 'Bu ses doğrulanmış listede yok (npm run voices)' });
    const changed = voiceId(sel) !== voiceId(currentVoice());
    state.voice = sel;
    console.log(`[tts] seslendiren: ${voiceId(sel)} · hız ${sel.speed}${changed ? ' (yeni cevaptan itibaren)' : ''}`);
    if (changed) {
      warmOpening(sel).catch(() => {});
      warmGreetings(sel);
    }
  }
  if (req.body.wake) {
    const before = JSON.stringify(wakeCfg().greetings);
    state.wake = mergeWake(wakeCfg(), req.body.wake);
    if (JSON.stringify(state.wake.greetings) !== before) warmGreetings();
  }
  saveState();
  broadcast(settingsEvent());
  res.json({ ok: true, voice: currentVoice(), sfx: sfx() });
});

// ---------- İki alkışla uyanma ----------
// Saat senkronu: istemci gidiş-dönüş süresinin yarısını düşerek sunucu saatine göre ofsetini hesaplar.
app.get('/api/time', (_req, res) => res.json({ now: Date.now() }));

// Açılış sekansındaki sistem kontrolleri: hepsi gerçek ölçüm.
app.get('/api/health', async (_req, res) => res.json(await health(presence())));

// Dinleyici cihaz çift alkışı duydu → tüm cihazlar "dikkat" (ya da süre doldu → geri uykuya)
app.post('/api/attention', (req, res) => {
  const end = req.body?.end === true;
  console.log(`[uyanış] ${end ? 'dikkat bitti' : 'çift alkış → dikkat'}${req.body?.heard ? ` · duyulan: "${String(req.body.heard).slice(0, 60)}"` : ''}`);
  broadcast(end ? { type: 'attention_end' } : { type: 'attention', ms: 4000, by: asDevice(req.body?.device) });
  res.json({ ok: true });
});

// Uyanış: tüm cihazlar açılış sekansını aynı anda (sunucu zamanı + 350 ms) başlatır.
app.post('/api/wake', (req, res) => {
  const cfg = wakeCfg();
  const period = greetingPeriod();
  const at = Date.now() + 350;
  console.log(`[uyanış] ${String(req.body?.via || 'test')} · sekans ${new Date(at).toISOString().slice(11, 23)} · karşılama (${period}) ${cfg.greeter} cihazından${req.body?.heard ? ` · duyulan: "${String(req.body.heard).slice(0, 60)}"` : ''}`);
  broadcast({ type: 'wake', at, greeting: { period, text: cfg.greetings[period] }, greeter: cfg.greeter, brief: cfg.briefOnWake, voice: currentVoice(), via: String(req.body?.via || 'test') });
  res.json({ ok: true, at });
});

app.post('/api/sleep', (_req, res) => {
  console.log('[uyanış] tüm cihazlar uykuya');
  broadcast({ type: 'sleep' });
  res.json({ ok: true });
});

app.post('/api/clear', (_req, res) => {
  state.messages = [];
  state.lastClient = null;
  state.lastDevice = null;
  saveState();
  broadcast({ type: 'cleared' });
  res.json({ ok: true });
});

// ---------- Sohbet: sahneler hazır oldukça akar ----------
let busy = false;
app.post('/api/chat', async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 2000);
  const image = typeof req.body.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(req.body.image) ? req.body.image : undefined;
  const client = String(req.body.client || '');
  const device = asDevice(req.body.device);
  if (!text && !image) return res.status(400).json({ error: 'boş mesaj' });
  if (busy) return res.status(409).json({ error: 'Jarvis şu an başka bir cevabı hazırlıyor' });
  busy = true;
  const t0 = Date.now();

  const prevDevice = state.lastDevice;
  if (state.lastClient && state.lastClient !== client && prevDevice && prevDevice !== device) {
    broadcast({ type: 'handoff', from: prevDevice, to: device, toClient: client });
  }
  state.lastClient = client;
  state.lastDevice = device;

  // Ses bu cevaba sabitlenir: cevap sürerken Ayarlar'dan değişse de bu cevap tek sesle biter.
  const voice = { ...currentVoice() };
  const replyId = randomUUID();
  const userMsg: StoredMessage = { role: 'user', text: image ? `📷 ${text || 'Bu ne?'}` : text, device, at: new Date().toISOString() };
  const history = state.messages.slice();
  state.messages.push(userMsg);
  broadcast({ type: 'user', message: userMsg, origin: client });
  // Açılışın sesi diskte hazır: brifing yazılmayı beklemeden Jarvis hemen cevap versin.
  if (BRIEF_TRIGGER.test(text)) broadcast({ type: 'opening', text: BRIEF_OPENING, voice, origin: client });

  let total = 0;
  let firstTts = false;
  try {
    const reply = await runJarvis({
      text,
      image,
      device,
      prevDevice,
      history,
      photoMode: state.photoMode,
      progress: line => broadcast({ type: 'progress', line, origin: client }),
      onScene: (index, sahne) => {
        total = index + 1;
        broadcast({ type: 'scene', replyId, index, sahne, voice, origin: client });
        // Sesi sahne gelir gelmez üret (aynı anda en fazla 3; istemcinin isteği bu işi paylaşır).
        synthesize(sahne.ses, voice, `sahne ${index + 1}`).then(s => {
          if (s && !firstTts) {
            firstTts = true;
            console.log(`[zaman] ilk TTS hazır · sahne ${index + 1} · ${Date.now() - t0} ms`);
          }
        }).catch(() => {});
      },
      onSceneUpdate: (index, foto) => broadcast({ type: 'scene_update', replyId, index, foto, origin: client }),
      onScenesDone: count => broadcast({ type: 'scene_end', replyId, count, origin: client }),
    });
    const full = { ...reply, id: replyId, voice };
    console.log(`[beyin] ${full.router} → ${full.model} · ${full.sahneler.length} sahne · ${Date.now() - t0} ms`);
    const msg: StoredMessage = { role: 'assistant', text: full.sahneler.map(s => s.ses).join(' '), device, at: full.created_at, reply: full };
    state.messages.push(msg);
    saveState();
    broadcast({ type: 'reply', message: msg, origin: client });
    res.json({ ok: true, scenes: total });
  } catch (e: any) {
    console.error(e);
    broadcast({ type: 'error', error: String(e?.message || e), origin: client });
    res.status(500).json({ error: String(e?.message || e) });
  } finally {
    busy = false;
  }
});

// Sahne sesi. v = cevaba sabitlenmiş ses (model:voice); i/n yalnızca log için.
app.get('/api/tts', async (req, res) => {
  try {
    const [model, voice] = String(req.query.v || '').split(':');
    const sel: VoiceSel = model && voice ? { model, voice, speed: currentVoice().speed } : currentVoice();
    if (!validVoice(sel) || !ttsEnabled(sel)) return res.status(204).end();
    const label = req.query.i ? `sahne ${req.query.i}/${req.query.n ?? '?'}` : 'istek';
    const speech = await synthesize(String(req.query.text || '').slice(0, 1000), sel, label);
    if (!speech) return res.status(503).end(); // istemci bir kez yeniden dener, olmazsa cevabın kalanı tarayıcı sesine geçer
    res.setHeader('Content-Type', speech.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(speech.buf);
  } catch (e) {
    console.error('TTS hatası:', e);
    res.status(503).end();
  }
});

// ---------- Ses tanıma: MediaRecorder kaydı → RouteLLM ----------
app.post('/api/stt', express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '10mb' }), async (req, res) => {
  const mime = String(req.headers['content-type'] || '');
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) return res.status(400).json({ error: 'kayıt boş' });
  try {
    const r = await transcribe(req.body, mime);
    console.log(`[stt] ${r.model} · ${mime.split(';')[0]} · ${Math.round(req.body.length / 1024)} KB · ${r.ms} ms · "${r.text.slice(0, 60)}"`);
    res.json(r);
  } catch (e: any) {
    console.warn(`[stt] ${STT_MODEL} başarısız: ${String(e?.message || e).slice(0, 120)}`);
    res.status(502).json({ error: 'ses yazıya çevrilemedi' });
  }
});

// İstemcinin ölçtüğü süreler (ilk ses çalmaya başladı vb.) sunucu loguna düşsün.
app.post('/api/metrics', (req, res) => {
  const { event, ms, detail } = req.body ?? {};
  if (typeof event === 'string' && typeof ms === 'number') console.log(`[zaman] istemci · ${event} · ${Math.round(ms)} ms${detail ? ' · ' + String(detail).slice(0, 80) : ''}`);
  res.json({ ok: true });
});

// Yapay zekayla üretilmiş temsili görseller
app.get('/api/genimg/:file', (req, res) => {
  const file = path.basename(req.params.file);
  if (!/^[0-9a-f]{20}\.png$/.test(file)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  res.sendFile(path.join(IMG_DIR, file), err => err && res.status(404).end());
});

// Haber fotoğrafları için proxy (bazı siteler başka sitelerden gösterimi engelliyor)
app.get('/api/img', async (req, res) => {
  const u = String(req.query.u || '');
  if (!knownImageUrls.has(u)) return res.status(404).end();
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return res.status(502).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).end();
  }
});

// Üretim: derlenmiş arayüzü aynı porttan sun (tek tünel yeterli)
const dist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  const v = currentVoice();
  console.log(`Jarvis sunucusu: http://localhost:${PORT}  ${MOCK ? '(DEMO MODU — API anahtarı yok)' : `(beyin: ${CHAT_MODEL})`}`);
  console.log(`[tts] seslendiren: ${voiceId(v)} · STT: ${STT_MODEL}`);
  if (!usableVoices().length) console.warn('[tts] Doğrulanmış ses kataloğu yok: `npm run voices` çalıştırın.');
  warmOpening(v).catch(e => console.warn('Açılış sesi hazırlanamadı:', e));
  warmGreetings(v);
});
