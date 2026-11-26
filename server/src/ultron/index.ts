// Ultron Paketi · sunucu. A: Savaş Modu (replikler, ses önbelleği scenes/ultron/audio/). B: Ultron'un Gözü (gerçek veri
// katmanları, özet, anlatım, sorular). Kayıt modu: tarayıcının ürettiği kareleri ve sesi server/data/ultron-kayit/'a yazar.
// Ultron'un sesi: ULTRON_VOICE_ID; yoksa ElevenLabs hesabındaki derin bir Türkçe erkek sesi (Jarvis'inkinden farklı).
// Klonlanmış ya da bir oyuncuyu taklit eden ses kullanılmaz.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import { ELEVEN_MODEL, elevenReady, elevenSpeak, elevenVoices } from '../eleven.js';
import { MOCK, routellmStream } from '../routellm.js';
import { BROWSER, synthesize, ttsEnabled, type VoiceSel } from '../tts.js';
import { modeller } from '../toplanti/modeller.js';
import { anlat, niyet, type Konu, type LlmCagri } from './goz/anlatim.js';
import { BOLGE, sehirBul } from './goz/cografya.js';
import { ayar, evSehriAyarla, KATMAN, KATMAN_ADLARI, SAHNE, type Deprem, type KatmanAdi, type KatmanVeri, type Uydu } from './goz/katmanlar.js';
import { cevreOzeti, dunyaOzeti, enTehlikeliYer, turkiyeOzeti, uyduAdi, uyduKonumu, type Ev, type Katmanlar } from './goz/ozet.js';

const SES_DIZIN = path.join(SAHNE, 'audio');
const KAYIT_DIZIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'ultron-kayit');
const acik = (k: string, v = true) => (process.env[k] ?? String(v)).trim().toLowerCase() !== 'false';

let jarvisSes: () => VoiceSel = () => ({ model: BROWSER, voice: 'tr', speed: 1.08 });
let ultronId: string | null = null;
let ultronAd = '';

/** Ultron'un sesi: ULTRON_VOICE_ID; yoksa hesaptaki derin/güçlü Türkçe erkek sesi (Jarvis'in sesi hariç) */
async function ultronSesBul() {
  if (process.env.ULTRON_VOICE_ID?.trim()) { ultronId = process.env.ULTRON_VOICE_ID.trim(); ultronAd = 'ULTRON_VOICE_ID'; return; }
  if (!elevenReady()) return;
  try {
    const j = jarvisSes().voice;
    const v = (await elevenVoices()).filter(x => x.labels?.gender === 'male' && x.voice_id !== j);
    const tr = v.filter(x => x.labels?.language === 'tr');
    const derin = (x: { name: string; labels?: Record<string, string> }) => /epic|deep|powerful|dark|derin|güçlü/i.test(`${x.name} ${x.labels?.descriptive ?? ''}`);
    const sec = tr.find(derin) ?? tr[0] ?? v.find(derin) ?? v[0];
    if (sec) { ultronId = sec.voice_id; ultronAd = sec.name; console.log(`[ultron] Ultron'un sesi: ${sec.name} (ULTRON_VOICE_ID ile değiştirilebilir)`); }
  } catch (e) { console.warn('[ultron] ses listesi alınamadı:', (e as Error).message); }
}
const ultronSes = (): VoiceSel | null => (ultronId && elevenReady() ? { model: process.env.ULTRON_VOICE_MODEL?.trim() || ELEVEN_MODEL, voice: ultronId, speed: 0.94 } : null);

// ---------------------------------------------------------------- A · Savaş Modu

interface Satir { id: string; vurus: number; kim: 'ultron' | 'jarvis'; ton: string; metin: string; final?: 'A' | 'B' }
const oku = (ad: string) => JSON.parse(fs.readFileSync(path.join(SAHNE, ad), 'utf8'));
const adli = (m: string) => {
  const ad = process.env.USER_NAME?.trim().split(/\s+/)[0];
  return ad ? m.replace(/\{ad\}/g, ad) : m.replace(/\s*\{ad\}/g, '').replace(/\s+\./g, '.');
};
function satirlar(): Satir[] { return (oku('script.tr.json').satirlar as Satir[]).map(s => ({ ...s, metin: adli(s.metin) })); }
const sesSecimi = (kim: Satir['kim']) => (kim === 'ultron' ? ultronSes() : ttsEnabled(jarvisSes()) && jarvisSes().model !== BROWSER ? jarvisSes() : null);
const sesAnahtari = (s: Satir, v: VoiceSel) => crypto.createHash('sha1').update(`${s.metin}|${v.model}|${v.voice}|${v.speed}`).digest('hex').slice(0, 10);

/** Replik sesi: önbellekte yoksa üretilir; metin ya da ses değişmedikçe yeniden üretilmez */
async function replikSesi(s: Satir): Promise<Buffer | null> {
  const v = sesSecimi(s.kim);
  if (!v) return null;
  const dosya = path.join(SES_DIZIN, `${s.id}-${sesAnahtari(s, v)}.mp3`);
  if (fs.existsSync(dosya)) return fs.readFileSync(dosya);
  fs.mkdirSync(SES_DIZIN, { recursive: true });
  let buf: Buffer | null = null;
  if (s.kim === 'ultron') buf = await elevenSpeak(s.metin, v.voice, v.model, v.speed);
  else buf = (await synthesize(s.metin, v, `ultron sahnesi ${s.id}`))?.buf ?? null;
  if (!buf) return null;
  for (const f of fs.readdirSync(SES_DIZIN)) if (f.startsWith(`${s.id}-`)) fs.rmSync(path.join(SES_DIZIN, f)); // eski sürüm
  fs.writeFileSync(dosya, buf);
  console.log(`[ultron] replik sesi üretildi: ${s.id} (${s.kim}, ${buf.length} bayt)`);
  return buf;
}

// ---------------------------------------------------------------- B · Ultron'un Gözü

let ev: Ev | null = null;
async function evBul(): Promise<Ev | null> {
  if (ev) return ev;
  const ad = process.env.ULTRON_HOME_CITY?.trim();
  if (!ad) return null;
  const s = await sehirBul(ad);
  if (s) { ev = s; evSehriAyarla(s); }
  return ev;
}

/** Kayıt için sabitlenmiş veri (snapshot.json): aynı snapshot'la her denemede aynı rakamlar */
function snapshotOku(ad: string | undefined): { katmanlar: Katmanlar; zaman: string } | null {
  if (!ad || !/^[\w-]+$/.test(ad)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(KAYIT_DIZIN, ad, 'snapshot.json'), 'utf8')); } catch { return null; }
}

async function tumKatmanlar(zorla = false): Promise<Katmanlar> {
  await evBul();
  const v = await Promise.all(KATMAN_ADLARI.map(a => KATMAN[a].getir(fetch, zorla)));
  return Object.fromEntries(v.map(x => [x.ad, x])) as Katmanlar;
}

let llmModel: string | null = null;
const llm: LlmCagri = async (sistem, kullanici) => {
  llmModel ??= process.env.ULTRON_MODEL?.trim() || (await modeller()).jarvis;
  const r = await routellmStream({ model: llmModel, temperature: 0.6, max_tokens: 220, messages: [{ role: 'system', content: sistem }, { role: 'user', content: kullanici }] }, undefined, AbortSignal.timeout(12_000));
  return r.content;
};
const llmVarMi = () => !MOCK;

interface Odak { lat: number; lon: number; zoom: number }
/** Bir konu için: özet JSON, kameranın odağı ve öne çıkan katman */
function konuOzeti(konu: Konu, k: Katmanlar, evv: Ev | null, simdi = new Date()): { ozet: Record<string, any>; odak: Odak | null; katman?: string } {
  const genel = dunyaOzeti(k, evv, simdi);
  switch (konu) {
    case 'turkiye': return { ozet: turkiyeOzeti(k), odak: { lat: 39, lon: 35, zoom: 2.6 } };
    case 'cevre': return evv ? { ozet: cevreOzeti(k, evv, 300, simdi), odak: { lat: evv.lat, lon: evv.lon, zoom: 3.4 } } : { ozet: {}, odak: null };
    case 'deprem': return { ozet: pick(genel, ['max_mag_24h', 'max_place_24h', 'quakes_24h']), odak: k.deprem_dunya?.summary.max_lat != null ? { lat: k.deprem_dunya.summary.max_lat as number, lon: k.deprem_dunya.summary.max_lon as number, zoom: 2.4 } : null, katman: 'deprem' };
    case 'iss': return { ozet: pick(genel, ['iss_over', 'iss_km']), odak: genel.iss_lat != null ? { lat: genel.iss_lat as number, lon: genel.iss_lon as number, zoom: 2 } : null, katman: 'uydu' };
    case 'turksat': {
      const turk = ((k.uydu?.items as Uydu[]) ?? []).filter(u => u.grup === 'turk').map(u => uyduKonumu(u, simdi)).filter(Boolean);
      const liste = turk.map(p => `${uyduAdi(p!.ad)} ${Math.round(p!.lon)}° ${p!.lon >= 0 ? 'doğu' : 'batı'}`).slice(0, 6).join(', ');
      return { ozet: { ...(k.uydu && k.uydu.durum !== 'yok' ? { turk_uydu: turk.length } : {}), ...(liste ? { turk_list: liste } : {}) }, odak: { lat: 20, lon: 42, zoom: 1.4 }, katman: 'uydu' };
    }
    case 'ucus': return { ozet: pick(genel, ['flights_now', 'tr_flights']), odak: { lat: 45, lon: 15, zoom: 1.6 }, katman: 'ucus' };
    case 'siber': return { ozet: { ...pick(genel, ['malicious_links_today', 'usom_list_size']), ...(k.siber?.durum !== 'yok' ? pick(k.siber!.summary as any, ['malicious_messages_today']) : {}) }, odak: { lat: 39, lon: 35, zoom: 2.2 }, katman: 'siber' };
    case 'yangin': return { ozet: pick(genel, ['fires_24h', 'fires_24h_amazon']), odak: { lat: -5, lon: -60, zoom: 2 }, katman: 'yangin' };
    case 'hava': return { ozet: pick(turkiyeOzeti(k), ['weather_alerts', 'hottest_city', 'hottest_temp', 'coldest_city', 'coldest_temp']), odak: { lat: 39, lon: 35, zoom: 2.6 }, katman: 'hava' };
    case 'tehlike': {
      const t = enTehlikeliYer(k, ayar().goz?.tehlike ?? {});
      if (!t) return { ozet: {}, odak: null };
      const o: Record<string, any> = { danger_place: t.ad, danger_score: t.skor };
      if (t.gerekce.deprem) { o.danger_quakes = t.gerekce.deprem; if (t.gerekce.en_buyuk != null) o.danger_max_mag = t.gerekce.en_buyuk; }
      if (t.gerekce.yangin) o.danger_fires = t.gerekce.yangin;
      if (t.gerekce.haber) o.danger_news = t.gerekce.haber;
      if (t.gerekce.hava_uyari) o.danger_weather = t.gerekce.hava_uyari;
      return { ozet: o, odak: { lat: t.lat, lon: t.lon, zoom: 2.6 } };
    }
    default: return { ozet: genel, odak: null };
  }
}
const pick = (o: Record<string, any>, a: string[]) => Object.fromEntries(a.filter(x => o[x] != null).map(x => [x, o[x]]));

/** İstemciye giden katman (büyük listeler kırpılmış) */
const disari = (v: KatmanVeri) => ({ ...v, items: v.ad === 'deprem_tr' || v.ad === 'deprem_dunya' ? (v.items as Deprem[]).slice(0, 1500) : v.items });

// ---------------------------------------------------------------- Router

export function initUltron(o: { jarvisSes: () => VoiceSel }) {
  jarvisSes = o.jarvisSes;
  void ultronSesBul();
}

export function ultronRouter() {
  const r = Router();
  // Modül anahtarları: SAVAS_MODU_ENABLED=false → sahne kapalı; ULTRON_EYE_ENABLED=false → Göz kapalı
  r.use('/api/ultron/sahne', (_q, res, next) => (acik('SAVAS_MODU_ENABLED') ? next() : res.status(403).json({ error: 'Savaş Modu kapalı (SAVAS_MODU_ENABLED=false)' })));
  r.use('/api/ultron/goz', (_q, res, next) => (acik('ULTRON_EYE_ENABLED') ? next() : res.status(403).json({ error: "Ultron'un Gözü kapalı (ULTRON_EYE_ENABLED=false)" })));

  r.get('/api/ultron/durum', async (_req, res) => {
    res.json({
      savas: acik('SAVAS_MODU_ENABLED'), goz: acik('ULTRON_EYE_ENABLED'), final: (process.env.ULTRON_FINAL || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A',
      parola: process.env.ULTRON_KILL_PHRASE?.trim() || 'Protokol Friday', canli: process.env.SAVAS_MODU_LIVE === 'true', oran: (process.env.ULTRON_ASPECT || '16:9').trim(),
      ses: { ultron: !!ultronSes(), ultronAd, jarvis: !!sesSecimi('jarvis') }, ev: (await evBul())?.ad ?? null,
      anahtar: { opensky: !!process.env.OPENSKY_CLIENT_ID?.trim(), firms: !!process.env.NASA_FIRMS_MAP_KEY?.trim() },
    });
  });

  r.get('/api/ultron/sahne', (_req, res) => {
    try {
      res.json({ satirlar: satirlar().map(s => ({ ...s, ses: sesSecimi(s.kim) ? `/api/ultron/ses/${s.id}?h=${sesAnahtari(s, sesSecimi(s.kim)!)}` : null })), zaman: oku('timeline.json'), ayar: oku('config.json') });
    } catch (e) { res.status(500).json({ error: `Sahne dosyaları okunamadı: ${(e as Error).message}` }); }
  });

  r.get('/api/ultron/ses/:id', async (req, res) => {
    const s = satirlar().find(x => x.id === req.params.id);
    if (!s) return res.status(404).end();
    try {
      const b = await replikSesi(s);
      if (!b) return res.status(204).end();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // ?h= metin ve ses değişince değişir
      res.end(b);
    } catch (e) { console.warn('[ultron] replik sesi üretilemedi:', (e as Error).message); res.status(503).end(); }
  });

  /** Ultron'un anlık konuşması (Göz anlatımı): yalnızca Ultron'un sesiyle; ses yoksa 204 (istemci yazıyla gösterir) */
  r.get('/api/ultron/konus', async (req, res) => {
    const v = ultronSes();
    const metin = String(req.query.metin ?? '').slice(0, 600);
    if (!v || !metin) return res.status(204).end();
    try {
      const sp = await synthesize(metin, v, 'ultron');
      if (!sp) return res.status(204).end();
      res.setHeader('Content-Type', sp.mime);
      res.end(sp.buf);
    } catch { res.status(503).end(); }
  });

  r.get('/api/ultron/goz/katmanlar', async (req, res) => {
    const sn = snapshotOku(String(req.query.snapshot ?? ''));
    const k = sn?.katmanlar ?? (await tumKatmanlar(req.query.zorla === '1'));
    res.json({ zaman: sn?.zaman ?? new Date().toISOString(), ev: ev ?? null, katmanlar: Object.fromEntries(Object.entries(k).map(([a, v]) => [a, disari(v!)])), turkiye: BOLGE.turkiye });
  });

  r.get('/api/ultron/goz/katman/:ad', async (req, res) => {
    const a = req.params.ad as KatmanAdi;
    if (!KATMAN_ADLARI.includes(a)) return res.status(404).end();
    res.json(disari(await KATMAN[a].getir(fetch, req.query.zorla === '1')));
  });

  /** Açılış anlatımı (B1) ya da bir soru (B2–B5) */
  r.post('/api/ultron/goz/sor', express.json(), async (req, res) => {
    const metin = String(req.body?.metin ?? '').slice(0, 300);
    const sn = snapshotOku(req.body?.snapshot);
    const k = sn?.katmanlar ?? (await tumKatmanlar());
    const simdi = sn ? new Date(sn.zaman) : new Date();
    // Kullanıcı konumunu yalnızca izin verirse gönderir; yalnızca bu istekte kullanılır, saklanmaz ve dışarı gitmez
    const konum = req.body?.konum && Number.isFinite(req.body.konum.lat) ? { ad: 'bulunduğunuz yer', lat: Number(req.body.konum.lat), lon: Number(req.body.konum.lon) } : null;
    const evv = konum ?? (await evBul());
    const n = metin ? niyet(metin) : { tip: 'konu' as const, konu: 'acilis' as Konu };
    if (n.tip !== 'konu') return res.json({ niyet: n });
    if (n.konu === 'cevre' && !evv) return res.json({ niyet: n, metin: 'Şehrini bilmiyorum. ULTRON_HOME_CITY ayarını yap ya da konum izni ver.', kaynak: 'sablon', ozet: {}, odak: null });
    // Kayıt: aynı snapshot'la açılış anlatımı da aynı kalsın (snapshot klasörüne yazılır)
    const anlatimDosya = sn && !metin ? path.join(KAYIT_DIZIN, String(req.body.snapshot), 'anlatim.json') : null;
    if (anlatimDosya && fs.existsSync(anlatimDosya)) return res.json(JSON.parse(fs.readFileSync(anlatimDosya, 'utf8')));
    const { ozet, odak, katman } = n.konu === 'acilis' ? { ozet: dunyaOzeti(k, evv, simdi), odak: null, katman: undefined } : konuOzeti(n.konu, k, evv, simdi);
    const a = await anlat(n.konu, ozet, llmVarMi() && !req.body?.sablon ? llm : null, metin || undefined);
    if (a.red) console.log(`[ultron-göz] LLM anlatımı reddedildi (${a.red}); şablon kullanıldı`);
    const cevap = { niyet: n, metin: a.metin, kaynak: a.kaynak, ozet, odak, katman };
    if (anlatimDosya) fs.writeFileSync(anlatimDosya, JSON.stringify(cevap));
    res.json(cevap);
  });

  // ---------------------------------------------------------------- Kayıt modu

  r.post('/api/ultron/kayit/basla', express.json(), async (req, res) => {
    const mod = ['war', 'eye', 'full'].includes(req.body?.mod) ? req.body.mod : 'war';
    const oran = req.body?.oran === '9:16' ? '9x16' : '16x9';
    const ad = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${mod}-${oran}`;
    const d = path.join(KAYIT_DIZIN, ad);
    fs.mkdirSync(path.join(d, 'kareler'), { recursive: true });
    // Göz kaydı: o anki gerçek veriler snapshot.json'a yazılır; aynı snapshot'la kayıt tekrarlanabilir
    if (mod !== 'war') {
      const eski = snapshotOku(req.body?.snapshot);
      fs.writeFileSync(path.join(d, 'snapshot.json'), JSON.stringify(eski ?? { zaman: new Date().toISOString(), katmanlar: await tumKatmanlar() }));
    }
    console.log(`[ultron] kayıt başladı: ${ad}`);
    res.json({ ad, snapshot: mod !== 'war' ? ad : null });
  });
  const kayitYolu = (ad: string) => (/^[\w-]+$/.test(ad) ? path.join(KAYIT_DIZIN, ad) : null);
  r.post('/api/ultron/kayit/kare/:ad/:no', express.raw({ type: '*/*', limit: '40mb' }), (req, res) => {
    const d = kayitYolu(req.params.ad);
    const no = Number(req.params.no);
    if (!d || !fs.existsSync(d) || !Number.isInteger(no)) return res.status(400).end();
    fs.writeFileSync(path.join(d, 'kareler', `kare_${String(no).padStart(5, '0')}.png`), req.body as Buffer);
    res.json({ ok: true });
  });
  r.post('/api/ultron/kayit/ses/:ad/:dosya', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
    const d = kayitYolu(req.params.ad);
    if (!d || !fs.existsSync(d) || !/^[\w-]+\.wav$/.test(req.params.dosya)) return res.status(400).end();
    fs.writeFileSync(path.join(d, req.params.dosya), req.body as Buffer);
    res.json({ ok: true });
  });
  r.post('/api/ultron/kayit/bitir/:ad', express.json(), (req, res) => {
    const d = kayitYolu(req.params.ad);
    if (!d || !fs.existsSync(d)) return res.status(400).end();
    const fps = Number(req.body?.fps) || 30;
    fs.writeFileSync(path.join(d, 'kayit.json'), JSON.stringify({ ...req.body, bitti: new Date().toISOString() }, null, 2));
    // ffmpeg varsa MP4 (kareler + karışım); yoksa PNG + WAV yeterli
    let mp4: string | null = null;
    if (spawnSync('ffmpeg', ['-version']).status === 0) {
      const ses = fs.existsSync(path.join(d, 'karisim.wav')) ? ['-i', path.join(d, 'karisim.wav')] : [];
      const p = spawnSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(d, 'kareler', 'kare_%05d.png'), ...ses, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', ...(ses.length ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []), path.join(d, 'ultron.mp4')], { stdio: 'ignore' });
      if (p.status === 0) mp4 = path.join(d, 'ultron.mp4');
    }
    console.log(`[ultron] kayıt bitti: ${d}${mp4 ? ' · MP4 hazır' : ' · (ffmpeg yok: PNG + WAV)'}`);
    res.json({ ok: true, klasor: d, mp4 });
  });
  r.get('/api/ultron/kayit/son', (_req, res) => {
    if (!fs.existsSync(KAYIT_DIZIN)) return res.json({ son: null });
    const d = fs.readdirSync(KAYIT_DIZIN).sort().at(-1);
    const bilgi = d && fs.existsSync(path.join(KAYIT_DIZIN, d, 'kayit.json')) ? JSON.parse(fs.readFileSync(path.join(KAYIT_DIZIN, d, 'kayit.json'), 'utf8')) : null;
    res.json({ son: d ?? null, bitti: !!bilgi, bilgi });
  });

  return r;
}
