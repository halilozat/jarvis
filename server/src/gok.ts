// Gece Gökyüzü Modu (sunucu): fotoğrafı astrometry.net (nova) ile çözer ve gokyuzu aracını çalıştırır.
//
// KURAL: Yıldızları yapay zekâ tanımaz. Kimlik ve konum astrometry.net çözümünden (WCS) ve katalogdan gelir; bunları
// istemci hesaplar (web/src/sky). Sohbet isteğine ekranın özeti eklenir; gokyuzu aracı yanıtı bu özetten, hazır
// cümlelerle kurar. Model yalnızca bu cümleleri seslendirir: rakam, tarih ya da isim üretmez.
//
// Gizlilik: istemci görüntüyü yeniden kodlar (EXIF/GPS düşer); sunucu da JPEG'in APP1..APP15/COM bölümlerini ve PNG'nin
// metin/eXIf parçalarını siler. Yükleme publicly_visible=n, allow_commercial_use=n, allow_modifications=n.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';

const API = (process.env.ASTROMETRY_URL || 'https://nova.astrometry.net').replace(/\/+$/, '');
const anahtar = () => process.env.ASTROMETRY_API_KEY?.trim() || '';
const ONBELLEK = process.env.GOK_ONBELLEK || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'gok');
/** Bir çözüm en fazla bu kadar beklenir (nova kuyruğu yoğunsa dakikalar sürebilir) */
const ZAMAN_ASIMI = Number(process.env.ASTROMETRY_TIMEOUT_MS || 6 * 60_000);

let notify: (e: object) => void = () => {};
export function initGok(broadcast: (e: object) => void) { notify = broadcast; }

// ---------------------------------------------------------------- Gizlilik: üst veriyi sil

/** JPEG: APP1..APP15 (EXIF, XMP, GPS…) ve COM bölümleri atılır; görüntü verisine dokunulmaz */
export function jpegTemizle(b: Buffer): Buffer {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('JPEG değil');
  const parcalar: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('bozuk JPEG');
    const m = b[i + 1];
    if (m === 0xd9) { parcalar.push(b.subarray(i, i + 2)); i += 2; break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { parcalar.push(b.subarray(i, i + 2)); i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    const son = i + 2 + len;
    if (m === 0xda) { parcalar.push(b.subarray(i)); i = b.length; break; } // SOS: geri kalan sıkıştırılmış veri
    if (!((m >= 0xe1 && m <= 0xef) || m === 0xfe)) parcalar.push(b.subarray(i, son));
    i = son;
  }
  return Buffer.concat(parcalar);
}

/** PNG: tEXt/zTXt/iTXt/eXIf/tIME parçaları atılır */
export function pngTemizle(b: Buffer): Buffer {
  const parcalar: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const tur = b.toString('latin1', i + 4, i + 8);
    const son = i + 12 + len;
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(tur)) parcalar.push(b.subarray(i, son));
    i = son;
    if (tur === 'IEND') break;
  }
  return Buffer.concat(parcalar);
}

/** data URL → temizlenmiş görüntü */
export function goruntuAl(dataUrl: string): { veri: Buffer; tur: 'jpeg' | 'png' } {
  const m = /^data:image\/(jpeg|png);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new Error('JPEG ya da PNG bekleniyor');
  const ham = Buffer.from(m[2], 'base64');
  return m[1] === 'png' ? { veri: pngTemizle(ham), tur: 'png' } : { veri: jpegTemizle(ham), tur: 'jpeg' };
}

// ---------------------------------------------------------------- astrometry.net nova istemcisi

export interface Cozum {
  jobId: number;
  calibration: { ra: number; dec: number; radius: number; pixscale: number; orientation: number; parity: number };
  /** FITS başlığı (wcs_file) */
  wcs: string;
  annotations: { type: string; names: string[]; pixelx: number; pixely: number; radius?: number; vmag?: number }[];
  objects_in_field: string[];
  /** Çözülen görüntünün boyutu (WCS bu piksellerde) */
  w: number;
  h: number;
}

export type Durum = 'giris' | 'yukleniyor' | 'kuyrukta' | 'cozuluyor' | 'sonuclar' | 'tamam' | 'cozulemedi' | 'hata';
interface Is { id: string; durum: Durum; mesaj: string; basla: number; subid?: number; jobId?: number; cozum?: Cozum; hata?: string }

const isler = new Map<string, Is>();
let oturum: { anahtar: string; session: string; at: number } | null = null;
const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));
const form = (o: object) => new URLSearchParams({ 'request-json': JSON.stringify(o) });

async function jsonAl(url: string, init?: RequestInit, ms = 30_000): Promise<any> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  const t = await r.text();
  if (!r.ok) throw new Error(`astrometry.net HTTP ${r.status}${r.status === 429 ? ' (çok sık istek; biraz bekleyin)' : ''}`);
  try { return JSON.parse(t); } catch { throw new Error('astrometry.net beklenmeyen cevap verdi'); }
}

async function girisYap(): Promise<string> {
  const k = anahtar();
  if (!k) throw new Error('ASTROMETRY_API_KEY tanımlı değil');
  if (oturum && oturum.anahtar === k && Date.now() - oturum.at < 20 * 60_000) return oturum.session;
  const j = await jsonAl(`${API}/api/login`, { method: 'POST', body: form({ apikey: k }) });
  if (j.status !== 'success' || !j.session) throw new Error(j.errormessage === 'bad apikey' ? 'astrometry.net anahtarı geçersiz' : `astrometry.net girişi: ${j.errormessage || j.status}`);
  oturum = { anahtar: k, session: j.session, at: Date.now() };
  return j.session;
}

/** Telefon kameraları: yatay görüş ~20-90° (geniş açı 70-80°, 2x ~ 40°) */
export const OLCEK_VARSAYILAN: [number, number] = [20, 90];

async function cozumCalistir(is: Is, g: { veri: Buffer; tur: 'jpeg' | 'png' }, olcek: [number, number], boyut: { w: number; h: number }) {
  const durum = (d: Durum, mesaj: string) => { is.durum = d; is.mesaj = mesaj; };
  try {
    durum('giris', 'astrometry.net bağlantısı kuruluyor');
    const session = await girisYap();
    durum('yukleniyor', 'fotoğraf gönderiliyor');
    const fd = new FormData();
    fd.append('request-json', new Blob([JSON.stringify({
      session, publicly_visible: 'n', allow_commercial_use: 'n', allow_modifications: 'n',
      scale_units: 'degwidth', scale_type: 'ul', scale_lower: olcek[0], scale_upper: olcek[1],
      downsample_factor: 2, crpix_center: true, tweak_order: 2,
    })], { type: 'text/plain' }));
    fd.append('file', new Blob([new Uint8Array(g.veri)], { type: 'application/octet-stream' }), `gok.${g.tur === 'png' ? 'png' : 'jpg'}`);
    const up = await jsonAl(`${API}/api/upload`, { method: 'POST', body: fd }, 90_000);
    if (up.status !== 'success' || !up.subid) throw new Error(`yükleme reddedildi: ${up.errormessage || up.status}`);
    is.subid = up.subid;
    durum('kuyrukta', 'sırada bekliyor');

    let jobId: number | undefined;
    while (Date.now() - is.basla < ZAMAN_ASIMI) {
      await bekle(jobId ? 3000 : 4000);
      if (!jobId) {
        const s = await jsonAl(`${API}/api/submissions/${is.subid}`).catch(() => null);
        const j = s?.jobs?.find((x: number | null) => x);
        if (j) { jobId = j; is.jobId = j; durum('cozuluyor', 'yıldızlar eşleştiriliyor'); }
        continue;
      }
      const st = await jsonAl(`${API}/api/jobs/${jobId}`).catch(() => null);
      if (st?.status === 'success') break;
      if (st?.status === 'failure') { durum('cozulemedi', 'Yıldız deseni bulunamadı (bulut, ışık kirliliği ya da çok az yıldız)'); return; }
    }
    if (!jobId || is.durum !== 'cozuluyor') { durum('cozulemedi', 'Zaman aşımı: astrometry.net çözemedi'); return; }
    // Son kontrol (döngü süre dolduğu için çıkmış olabilir)
    const son = await jsonAl(`${API}/api/jobs/${jobId}`);
    if (son.status !== 'success') { durum('cozulemedi', 'Zaman aşımı: astrometry.net çözemedi'); return; }

    durum('sonuclar', 'çözüm indiriliyor');
    const [cal, an, obj, wcsR] = await Promise.all([
      jsonAl(`${API}/api/jobs/${jobId}/calibration/`),
      jsonAl(`${API}/api/jobs/${jobId}/annotations/`).catch(() => ({ annotations: [] })),
      jsonAl(`${API}/api/jobs/${jobId}/objects_in_field/`).catch(() => ({ objects_in_field: [] })),
      fetch(`${API}/wcs_file/${jobId}`, { signal: AbortSignal.timeout(30_000) }),
    ]);
    const wcs = wcsR.ok ? Buffer.from(await wcsR.arrayBuffer()).toString('latin1') : '';
    const cozum: Cozum = {
      jobId, calibration: cal, wcs: wcsBasligi(wcs), annotations: an.annotations ?? [], objects_in_field: obj.objects_in_field ?? [],
      w: boyut.w, h: boyut.h,
    };
    is.cozum = cozum;
    onbellekYaz(hash(g.veri), cozum);
    durum('tamam', 'çözüldü');
    console.log(`[gök] çözüldü · iş ${jobId} · RA ${cal.ra.toFixed(2)} Dec ${cal.dec.toFixed(2)} · ${(cal.pixscale * boyut.w / 3600).toFixed(1)}° · ${Math.round((Date.now() - is.basla) / 1000)} sn`);
  } catch (e: any) {
    is.durum = 'hata';
    is.hata = String(e?.message || e);
    is.mesaj = is.hata;
    console.warn('[gök] çözüm hatası:', is.hata);
  }
}

/** FITS başlığını satırlara böl (80 karakter), yalnızca anahtar kartları */
const wcsBasligi = (fits: string) => (fits.match(/.{80}/g) ?? []).filter(l => /^[A-Z0-9_-]{1,8}\s*=/.test(l)).map(l => l.trimEnd()).join('\n');

const hash = (b: Buffer) => createHash('sha1').update(b).digest('hex');
function onbellekOku(h: string): Cozum | null {
  try { return JSON.parse(fs.readFileSync(path.join(ONBELLEK, `${h}.json`), 'utf8')); } catch { return null; }
}
function onbellekYaz(h: string, c: Cozum) {
  try { fs.mkdirSync(ONBELLEK, { recursive: true }); fs.writeFileSync(path.join(ONBELLEK, `${h}.json`), JSON.stringify(c)); } catch (e) { console.warn('[gök] önbellek yazılamadı', e); }
}

// ---------------------------------------------------------------- HTTP

export function gokRouter() {
  const r = Router();
  r.get('/api/gok/durum', (_req, res) => res.json({ astrometry: !!anahtar(), servis: API }));

  // { resim: data URL, w, h, olcek?: [alt, üst] derece (yatay görüş) } → { id } ya da önbellekten { durum: 'tamam', cozum }
  r.post('/api/gok/coz', (req, res) => {
    let g: ReturnType<typeof goruntuAl>;
    try { g = goruntuAl(String(req.body?.resim ?? '')); } catch (e: any) { return res.status(400).json({ hata: e.message }); }
    const w = Math.round(Number(req.body?.w)), h = Math.round(Number(req.body?.h));
    if (!(w > 100 && h > 100 && w <= 6000 && h <= 6000)) return res.status(400).json({ hata: 'görüntü boyutu geçersiz' });
    const k = hash(g.veri);
    const eski = onbellekOku(k);
    if (eski && eski.w === w && eski.h === h) return res.json({ durum: 'tamam', mesaj: 'önbellekten', cozum: eski, onbellek: true });
    if (!anahtar()) return res.status(503).json({ hata: 'ASTROMETRY_API_KEY tanımlı değil: fotoğraf çözülemez. Simülasyon modu kullanılabilir.', anahtarYok: true });
    const o = Array.isArray(req.body?.olcek) ? req.body.olcek.map(Number) : OLCEK_VARSAYILAN;
    const olcek: [number, number] = [Math.max(1, Math.min(o[0], o[1]) || 20), Math.min(180, Math.max(o[0], o[1]) || 90)];
    const is: Is = { id: randomUUID(), durum: 'giris', mesaj: 'başlıyor', basla: Date.now() };
    isler.set(is.id, is);
    // Eski işler bir saat sonra unutulur
    for (const [id, x] of isler) if (Date.now() - x.basla > 60 * 60_000) isler.delete(id);
    void cozumCalistir(is, g, olcek, { w, h });
    res.json({ id: is.id, durum: is.durum, mesaj: is.mesaj });
  });

  r.get('/api/gok/coz/:id', (req, res) => {
    const is = isler.get(req.params.id);
    if (!is) return res.status(404).json({ hata: 'iş bulunamadı' });
    res.json({ durum: is.durum, mesaj: is.mesaj, sure: Math.round((Date.now() - is.basla) / 1000), jobId: is.jobId, ...(is.cozum ? { cozum: is.cozum } : {}), ...(is.hata ? { hata: is.hata } : {}) });
  });
  return r;
}

// ---------------------------------------------------------------- Sohbet bağlamı ve gokyuzu aracı

/** İstemcinin gönderdiği ekran özeti (web/src/sky/baglam.ts) */
export interface GokBaglam {
  kaynak: 'fotograf' | 'simulasyon' | 'ornek';
  cekim: string;
  yer: string;
  alan?: string;
  /** uzaklik ve yolaCikis sesli okunacak biçimde ("25 ışık yılı", "2001 yılında"); aralik yalnızca belirsizlerde */
  yildizlar: { hip: number; ad: string; tk: string; kadir: number; uzaklik: string; uzaklikIy: number | null; aralik: string | null; yaklasik: boolean; yolaCikis: string; olay: string; olayKisa: string }[];
  takimyildizlar: string[];
  gezegenler: { id: string; ad: string; irtifa: number; yon: string; kadir: number; kadrajda: boolean }[];
  secili: number | string | null;
}

let cur: { ctx: GokBaglam; client: string } | null = null;
export function setGokRequest(r: { ctx: GokBaglam; client: string } | null) { cur = r; }
export const gokAcik = () => !!cur;

const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
/** Yön → bulunma hâli: güney → güneyde, güneydoğu → güneydoğuda */
const bulunma = (yon: string) => `${yon}${/[eiöü][^aeıioöuü]*$/.test(yon) ? 'de' : 'da'}`;
const kadirYaz = (k: number) => k.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).replace('-', '−');
const kaynakNotu = (c: GokBaglam) => (c.kaynak === 'simulasyon' ? ' (simülasyon)' : c.kaynak === 'ornek' ? ' (örnek fotoğraf)' : '');

export type GokIstek = 'tara' | 'gezegenler' | 'en_parlak' | 'yildiz' | 'en_uzak';

/** Araç çıktısı: veri + söylenecek hazır cümle. Model bu cümleyi aynen kullanır. */
export function gokyuzuArac(args: { istek?: string; ad?: string }): string {
  const istek = String(args.istek ?? '') as GokIstek;
  if (istek === 'tara') {
    notify({ type: 'gok_cmd', cmd: { tip: 'tara' }, origin: cur?.client });
    return JSON.stringify({ ok: true, soyle: cur ? 'Gökyüzünü yeniden tarıyorum efendim.' : 'Gece Gökyüzü Modu\'nu açıyorum efendim. Bir gece fotoğrafı seçin ya da çekin.' });
  }
  const c = cur?.ctx;
  if (!c) return JSON.stringify({ hata: 'Gece Gökyüzü Modu açık değil. Kullanıcı önce "gökyüzünü tara" demeli.' });
  const vurgula = (hedef: number | string) => notify({ type: 'gok_cmd', cmd: { tip: 'vurgula', hedef }, origin: cur?.client });

  if (istek === 'gezegenler') {
    const ust = c.gezegenler.filter(g => g.irtifa > 0);
    if (!ust.length) return JSON.stringify({ ok: true, gezegenler: [], soyle: 'Şu an ufkun üstünde çıplak gözle görülen bir gezegen yok efendim.' });
    const liste = ust.map(g => `${g.ad} ${bulunma(g.yon)}, ufkun ${Math.round(g.irtifa)} derece üstünde`);
    const kadrajda = ust.filter(g => g.kadrajda);
    const ilk = kadrajda[0] ?? ust[0];
    vurgula(ilk.id);
    return JSON.stringify({
      ok: true, gezegenler: ust,
      soyle: `Çekim anında ufkun üstünde: ${liste.join('; ')}.${kadrajda.length ? ` Fotoğrafta ${kadrajda.map(g => g.ad).join(' ve ')} var; ${kadrajda.length > 1 ? 'renkli halkalarla' : 'renkli halkayla'} işaretledim.` : ' Hiçbiri fotoğrafın kadrajında değil.'}`,
    });
  }

  if (istek === 'en_parlak') {
    const g = c.gezegenler.filter(x => x.kadrajda).sort((a, b) => a.kadir - b.kadir)[0];
    const y = [...c.yildizlar].sort((a, b) => a.kadir - b.kadir)[0];
    if (!g && !y) return JSON.stringify({ hata: 'Fotoğrafta tanınan yıldız yok' });
    if (g && (!y || g.kadir < y.kadir)) {
      vurgula(g.id);
      return JSON.stringify({ ok: true, en_parlak: g, en_parlak_yildiz: y ?? null, soyle: `Fotoğraftaki en parlak nokta bir yıldız değil, ${g.ad}; parlaklığı kadir ${kadirYaz(g.kadir)}.${y ? ` Yıldızların en parlağı ${y.ad}, ${y.tk} takımyıldızında.` : ''}` });
    }
    vurgula(y.hip);
    return JSON.stringify({ ok: true, en_parlak: y, soyle: `Fotoğraftaki en parlak yıldız ${y.ad}, ${y.tk} takımyıldızında; parlaklığı kadir ${kadirYaz(y.kadir)}, uzaklığı ${y.uzaklik}.` });
  }

  if (istek === 'en_uzak') {
    const y = c.yildizlar.filter(x => x.uzaklikIy !== null).sort((a, b) => (b.uzaklikIy ?? 0) - (a.uzaklikIy ?? 0))[0];
    if (!y) return JSON.stringify({ hata: 'Uzaklığı bilinen yıldız yok' });
    vurgula(y.hip);
    return JSON.stringify({ ok: true, yildiz: y, soyle: `Fotoğraftaki en uzak yıldız ${y.ad}, ${y.tk} takımyıldızında: ${y.uzaklik} uzakta. Gördüğünüz ışık ${y.yolaCikis} yola çıktı. ${y.olayKisa}${y.yaklasik ? ` Bu kadar uzak yıldızlarda paralaks ölçümü belirsiz; uzaklık ${y.aralik ?? 'geniş bir aralıkta'} olabilir.` : ''}` });
  }

  if (istek === 'yildiz') {
    const ad = fold(String(args.ad ?? ''));
    const gosterge = !ad || /^(su|bu|o|suyildiz|buyildiz|secili|isaretli|gosterdigim)/.test(ad);
    const y = gosterge
      ? c.yildizlar.find(x => x.hip === c.secili) ?? null
      : c.yildizlar.find(x => fold(x.ad) === ad) ?? c.yildizlar.find(x => ad.length >= 4 && fold(x.ad).startsWith(ad.slice(0, 5))) ?? null;
    if (!y) {
      const g = !gosterge ? c.gezegenler.find(x => fold(x.ad) === ad) : typeof c.secili === 'string' ? c.gezegenler.find(x => x.id === c.secili) : undefined;
      if (g) { vurgula(g.id); return JSON.stringify({ ok: true, gezegen: g, soyle: `${g.ad} bir gezegen; ışığı yıldızlar gibi yüzyıllar değil, yalnızca dakikalar önce yola çıktı.` }); }
      return JSON.stringify({ hata: gosterge ? 'Seçili yıldız yok: kullanıcı bir yıldıza dokunmalı ya da parmağıyla göstermeli' : 'Bu yıldız fotoğrafta tanınmadı', fotograftakiler: c.yildizlar.slice(0, 15).map(x => x.ad) });
    }
    vurgula(y.hip);
    return JSON.stringify({ ok: true, yildiz: y, soyle: `${y.ad}, ${y.tk} takımyıldızında; ${y.uzaklik} uzakta. Gördüğünüz ışık ${y.yolaCikis} yola çıktı. ${y.olayKisa}` });
  }
  return JSON.stringify({ hata: 'istek: tara | gezegenler | en_parlak | yildiz | en_uzak' });
}

/** Sohbet isteğine eklenen not: veri değil, kural (veri araçtan gelir) */
export function gokNote(): string | undefined {
  if (!cur) return undefined;
  const c = cur.ctx;
  return `\n\n[Sistem notu: Gece Gökyüzü Modu açık${kaynakNotu(c)}: ekranda ${c.yildizlar.length} yıldız, ${c.takimyildizlar.length} takımyıldız işaretli. Gökyüzü, yıldız, gezegen, ışık ya da uzaklıkla ilgili her soruda ÖNCE gokyuzu aracını çağır. Cevabındaki her isim, sayı ve yıl aracın 'soyle' alanından AYNEN gelsin; kendi bilginden yıldız adı, uzaklık, tarih ya da olay EKLEME, yuvarlama, değiştirme. Araç hata verirse bunu kısaca söyle. Soru gökyüzüyle ilgili değilse bu notu yok say.]`;
}

/** Sesli istek → araç isteği (demo modu ve istemcinin hızlı yolu için) */
export function gokNiyet(t: string): { istek: GokIstek; ad?: string } | null {
  const s = t.toLocaleLowerCase('tr');
  if (/g[öo]ky[üu]z[üu]n[üu] tara|g[öo]ky[üu]z[üu] modu|gece g[öo]ky[üu]z[üu]/.test(s)) return { istek: 'tara' };
  if (/gezegen/.test(s)) return { istek: 'gezegenler' };
  if (/en parlak/.test(s)) return { istek: 'en_parlak' };
  if (/en uzak/.test(s)) return { istek: 'en_uzak' };
  const m = /(?:^|\s)([\p{L}]+(?:\s[\p{L}]+)?)\s+yıldızı(?:nın)?\s/u.exec(s);
  if (/ışığı|ne zaman yola|ne kadar uzak|uzaklığı/.test(s)) {
    const ad = m && !/^(şu|bu|o)$/.test(m[1]) ? m[1] : '';
    return { istek: 'yildiz', ad };
  }
  return null;
}
