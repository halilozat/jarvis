// Toplantı Odası: Jarvis'in yanına ikinci bir yapay zekâ karakteri, Friday. Bir soruyu tartışıp ortak sonuca varırlar
// (Senaryo A); canlı toplantıda kullanıcı sesle katılır (B); bitince tutanak çıkar (C).
// Jarvis seçili sesle konuşur; Friday'in sesi ayrı (FRIDAY_VOICE_ID, yoksa ElevenLabs hesabındaki bir kadın sesi).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { ELEVEN_MODEL, elevenReady, elevenVoices } from '../eleven.js';
import { MOCK, PROVIDER } from '../routellm.js';
import { BROWSER, type VoiceSel } from '../tts.js';
import { modeller, modelOnbellekSifirla } from './modeller.js';
import { ayarOku, Toplanti, type DemoSenaryo, type Olay } from './motor.js';
import { kararSorusuMu } from './oturum.js';
import { eskileriSil, sonKararlarSozu, sonTutanak } from './tutanak.js';

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let yay: (e: object) => void = () => {};
let jarvisSes: () => VoiceSel = () => ({ model: BROWSER, voice: 'tr', speed: 1.08 });
let aktif: Toplanti | null = null;
let fridayId: string | null = null;
export const etkin = () => process.env.MEETING_ENABLED !== 'false';
const kayitModu = () => process.argv.includes('--meeting-record') || process.env.MEETING_RECORD === '1';

/** Friday'in sesi: FRIDAY_VOICE_ID; yoksa hesaptaki Türkçe kadın sesi, yoksa İngilizce kadın sesi (çok dilli model Türkçe konuşur) */
async function fridaySesBul() {
  if (process.env.FRIDAY_VOICE_ID?.trim()) { fridayId = process.env.FRIDAY_VOICE_ID.trim(); return; }
  if (!elevenReady()) return;
  try {
    const v = (await elevenVoices()).filter(x => x.labels?.gender === 'female');
    const tr = v.find(x => (x.labels?.language ?? '').toLowerCase() === 'tr');
    fridayId = (tr ?? v.find(x => x.category === 'premade') ?? v[0])?.voice_id ?? null;
    if (fridayId) console.log(`[toplantı] Friday'in sesi: ${(tr ?? v.find(x => x.voice_id === fridayId))?.name} (FRIDAY_VOICE_ID ile değiştirilebilir)`);
  } catch (e) { console.warn('[toplantı] ElevenLabs sesleri alınamadı:', e instanceof Error ? e.message : e); }
}

/** Friday için ses: ElevenLabs varsa ayrı kadın sesi; yoksa sağlayıcının kadın sesi (OpenAI: nova); o da yoksa tarayıcı sesi */
export function fridaySes(): VoiceSel {
  const hiz = jarvisSes().speed;
  if (fridayId && elevenReady()) return { model: process.env.FRIDAY_VOICE_MODEL?.trim() || ELEVEN_MODEL, voice: fridayId, speed: hiz };
  if (!MOCK && PROVIDER.tts === 'speech' && process.env.TTS_MODEL) return { model: process.env.TTS_MODEL, voice: process.env.FRIDAY_TTS_VOICE || 'nova', speed: hiz };
  return { model: BROWSER, voice: 'tr-kadin', speed: hiz };
}

export function initToplanti(broadcast: (e: object) => void, o: { jarvisSes: () => VoiceSel }) {
  yay = broadcast;
  jarvisSes = o.jarvisSes;
  if (!etkin()) { console.log('[toplantı] kapalı (MEETING_ENABLED=false)'); return; }
  void fridaySesBul();
  eskileriSil(ayarOku().transkript_saklama_gun);
  setInterval(() => eskileriSil(ayarOku().transkript_saklama_gun), 86_400_000).unref();
  if (process.argv.includes('--meeting-demo') || process.env.MEETING_DEMO === '1') setTimeout(() => void baslat({ mod: 'tartisma', demo: true }), 6000);
}

/** Beyin değişince model seçimi yeniden yapılır */
export const toplantiBeyinDegisti = () => modelOnbellekSifirla();

function demoSenaryo(): DemoSenaryo {
  const f = process.env.MEETING_DEMO_FILE?.trim() || path.join(KOK, 'config', 'meeting-demo.json');
  return JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(KOK, f), 'utf8'));
}

export async function baslat(o: { mod: 'tartisma' | 'canli'; konu?: string; demo?: boolean; origin?: string; kaynak?: string }) {
  if (aktif && !aktif.kapali) aktif.kes(null);
  const demo = o.demo ? demoSenaryo() : null;
  const konu = demo && o.mod === 'tartisma' ? demo.konu : (o.konu ?? '').trim();
  // origin: toplantıyı başlatan istemci (sesi yalnızca o çalar; diğer cihazlar sessiz izler)
  const t = new Toplanti(o.mod, konu, (e: Olay) => yay({ type: 'toplanti', toplanti: t.id, origin: o.origin, ...e }), { jarvis: jarvisSes, friday: fridaySes }, demo, kayitModu());
  aktif = t;
  console.log(`[toplantı] başladı · ${o.mod}${demo ? ' · demo' : ''}${o.kaynak ? ` · ${o.kaynak}` : ''}${konu ? ` · ${konu.slice(0, 60)}` : ''}`);
  await t.baslat();
  return t;
}

// ---------------------------------------------------------------- Sohbet aracı

export function toplantiArac(args: { istek?: string; konu?: string }): string {
  const istek = String(args.istek ?? '');
  if (istek === 'son_kararlar') {
    const t = sonTutanak();
    return JSON.stringify({ ok: !!t, tutanak: t, soyle: sonKararlarSozu(t) });
  }
  if (istek === 'tartis' || istek === 'baslat') {
    if (!etkin()) return JSON.stringify({ hata: 'Toplantı Odası kapalı (MEETING_ENABLED=false)' });
    void baslat({ mod: istek === 'baslat' ? 'canli' : 'tartisma', konu: args.konu });
    return JSON.stringify({ ok: true, soyle: istek === 'baslat' ? 'Toplantı odasını açıyorum efendim. Friday de burada.' : 'Bunu Friday ile tartışalım efendim.' });
  }
  return JSON.stringify({ hata: 'istek: tartis | baslat | son_kararlar' });
}

/** Beyin yokken ("son toplantının kararları neydi") doğrudan */
export function toplantiNiyet(t: string): { istek: string } | null {
  const k = t.toLocaleLowerCase('tr');
  if (/son toplant[ıi].*(karar|ne konu|neydi|özet)/.test(k)) return { istek: 'son_kararlar' };
  return null;
}

// ---------------------------------------------------------------- HTTP

export function toplantiRouter() {
  const r = Router();
  r.get('/api/toplanti/durum', async (_req, res) => {
    const m = await modeller().catch(() => null);
    res.json({ etkin: etkin(), aktif: aktif && !aktif.kapali ? { id: aktif.id, mod: aktif.mod, durum: aktif.oturum.state, konu: aktif.oturum.topic } : null, modeller: m, sesler: { jarvis: jarvisSes(), friday: fridaySes() }, karakterler: ayarOku().karakterler, otomatik: ayarOku().otomatik_tartisma, vadMs: Number(process.env.VAD_SILENCE_MS) || 700, son: sonTutanak() });
  });
  r.post('/api/toplanti/baslat', async (req, res) => {
    if (!etkin()) return res.status(403).json({ hata: 'Toplantı Odası kapalı (MEETING_ENABLED=false)' });
    const mod = req.body?.mod === 'canli' ? 'canli' : 'tartisma';
    const konu = String(req.body?.konu ?? '').slice(0, 2000);
    if (mod === 'tartisma' && !konu.trim() && !req.body?.demo) return res.status(400).json({ hata: 'konu boş' });
    const t = await baslat({ mod, konu, demo: !!req.body?.demo, origin: typeof req.body?.origin === 'string' ? req.body.origin : undefined, kaynak: 'panel/komut' });
    res.json({ id: t.id });
  });
  // Teşhis: panelin dinleme/çalma olayları sunucu konsoluna (yalnızca yerel geliştirme kaydı; dosyaya yazılmaz)
  r.post('/api/toplanti/iz', (req, res) => {
    const satirlar = Array.isArray(req.body?.satirlar) ? req.body.satirlar.slice(0, 50) : [];
    for (const s of satirlar) console.log(`[panel] ${String(s).slice(0, 200)}`);
    res.json({ ok: true });
  });
  r.post('/api/toplanti/soz', async (req, res) => {
    const metin = String(req.body?.metin ?? '').slice(0, 2000);
    // Açık toplantı varsa söz ona gider; yoksa (ilk söz ya da toplantı bitmişse) canlı toplantı burada açılır.
    // Karar istemcide değil sunucuda: istemcinin eski/boş durumu toplantıyı sıfırlayamaz.
    let yeni = false;
    if (!aktif || aktif.kapali) {
      try { await baslat({ mod: 'canli', origin: typeof req.body?.origin === 'string' ? req.body.origin : undefined, kaynak: 'ilk söz' }); }
      catch (e) { return res.status(500).json({ hata: (e as Error).message }); }
      yeni = true;
    }
    console.log(`[toplantı] söz (${metin.length} karakter)${yeni ? ' · yeni toplantı' : ''}`);
    aktif!.soz(metin);
    res.json({ ok: true, yeni });
  });
  r.post('/api/toplanti/kes', (req, res) => {
    const id = Number(req.body?.id), sira = Number(req.body?.sira);
    aktif?.kes(Number.isFinite(id) && Number.isFinite(sira) ? { id, sira } : null);
    res.json({ ok: true });
  });
  r.post('/api/toplanti/bitir', async (_req, res) => {
    if (!aktif) return res.status(409).json({ hata: 'açık toplantı yok' });
    const t = await aktif.bitir();
    res.json({ tutanak: t });
  });
  r.get('/api/toplanti/son', (_req, res) => res.json(sonTutanak()));
  return r;
}

export { kararSorusuMu };

/** Normal sohbette karar sorusu → Toplantı Odası (Senaryo A). Basit sorular (Senaryo E) normal Jarvis'e gider. */
export const otomatikTartisma = (metin: string) => etkin() && ayarOku().otomatik_tartisma && kararSorusuMu(metin) && !(aktif && !aktif.kapali && aktif.mod === 'canli');
