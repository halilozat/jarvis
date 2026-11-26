// Ultron'un Gözü · veri katmanları. Her katman ayrı bir servis: ortak arayüz getir() → {updatedAt, items[], summary{}}.
// Zaman aşımı (≤ 5 sn), sınırlı yeniden deneme, önbellek; kaynak çökerse son başarılı veri "eski" etiketiyle, hiç veri
// yoksa "yok" (VERİ YOK). Katmanlar yalnızca istendiğinde (modül açıkken) yenilenir; arka planda sorgu yapılmaz.
// Kaynaklar (2026-11 itibarıyla doğrulandı): USGS GeoJSON özet akışı, AFAD apiv2 (servisnet), Kandilli lst0.asp,
// OpenSky REST states/all (anahtarsız ya da OAuth2 istemci kimliğiyle), NASA FIRMS area CSV (MAP_KEY), CelesTrak gp.php
// TLE, mevcut haber modu (news.ts), Bekçi kayıtları + USOM listesi, Open-Meteo forecast.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newsSnapshot } from '../../news.js';
import { yerBul } from '../../worldPlaces.js';
import { kayitlariOku } from '../../bekci/depo.js';
import { usomSatir } from '../../bekci/kaynaklar.js';
import { BOLGE, icinde, usgsYer } from './cografya.js';

type F = typeof fetch;
export type KatmanAdi = 'deprem_dunya' | 'deprem_tr' | 'ucus' | 'yangin' | 'uydu' | 'haber' | 'siber' | 'hava';
export type Durum = 'ok' | 'eski' | 'yok';
export type Ozet = Record<string, number | string | null>;
export interface KatmanVeri<I = any> {
  ad: KatmanAdi; kaynak: string; updatedAt: string | null; durum: Durum; hata?: string; items: I[]; summary: Ozet;
}
interface Ham<I> { kaynak: string; items: I[]; summary: Ozet }

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const SAHNE = path.join(KOK, 'scenes', 'ultron');
export function ayar(): any {
  try { return JSON.parse(fs.readFileSync(path.join(SAHNE, 'config.json'), 'utf8')); } catch { return { goz: { yenileme_sn: {}, tehlike: { agirlik: {} } }, buyuk_sehirler: [] }; }
}
const zamanAsimi = () => Number(ayar().goz?.zaman_asimi_ms) || 5000;
const tekrar = () => Math.max(0, Math.min(3, Number(ayar().goz?.yeniden_deneme ?? 1)));

/** Zaman aşımlı istek; ağ hatasında ya da 5xx'te sınırlı yeniden deneme */
async function iste(f: F, url: string, init: RequestInit = {}): Promise<Response> {
  let son: unknown;
  for (let i = 0; i <= tekrar(); i++) {
    try {
      const r = await f(url, { ...init, signal: AbortSignal.timeout(zamanAsimi()) });
      if (r.status >= 500 && i < tekrar()) { son = new Error(`HTTP ${r.status}`); continue; }
      return r;
    } catch (e) { son = e; }
  }
  throw son instanceof Error ? son : new Error(String(son));
}

/** Önbellekli katman: TTL dolunca yeniler; hata olursa son başarılı veri "eski", hiç yoksa "yok" */
export class Katman<I = any> {
  private son: KatmanVeri<I> | null = null;
  private zaman = 0;
  private suren: Promise<KatmanVeri<I>> | null = null;
  constructor(readonly ad: KatmanAdi, readonly kaynakAdi: string, private ttl: () => number, private getirFn: (f: F) => Promise<Ham<I>>) {}
  async getir(f: F = fetch, zorla = false): Promise<KatmanVeri<I>> {
    if (!zorla && this.son && Date.now() - this.zaman < this.ttl() * 1000) return this.son;
    if (this.suren) return this.suren;
    this.suren = (async () => {
      try {
        const h = await this.getirFn(f);
        this.son = { ad: this.ad, kaynak: h.kaynak, updatedAt: new Date().toISOString(), durum: 'ok', items: h.items, summary: h.summary };
        this.zaman = Date.now();
        return this.son;
      } catch (e) {
        const hata = (e as Error).message.slice(0, 160);
        console.warn(`[ultron-göz] ${this.ad}: ${hata}`);
        // Eski veri: bir sonraki denemeye kadar kısa bekleme (kaynağı dövmemek için TTL'nin dörtte biri)
        this.zaman = Date.now() - this.ttl() * 750;
        if (this.son) return (this.son = { ...this.son, durum: 'eski', hata });
        return { ad: this.ad, kaynak: this.kaynakAdi, updatedAt: null, durum: 'yok', hata, items: [], summary: {} };
      } finally { this.suren = null; }
    })();
    return this.suren;
  }
  /** Test için: önbelleği boşalt */
  sifirla() { this.son = null; this.zaman = 0; }
}

const sn = (k: string, varsayilan: number) => () => Number(ayar().goz?.yenileme_sn?.[k]) || varsayilan;
const yuvarla = (x: number, b = 1) => Math.round(x * 10 ** b) / 10 ** b;

// ---------------------------------------------------------------- 🌋 Depremler (dünya) · USGS

export interface Deprem { id: string; lat: number; lon: number; mag: number; yer: string; t: number; derinlik: number; tr?: boolean }
export const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

export function usgsAyristir(j: any, simdi = Date.now()): Ham<Deprem> {
  if (!Array.isArray(j?.features)) throw new Error('USGS cevabı beklenen biçimde değil');
  const items: Deprem[] = [];
  for (const ft of j.features) {
    const p = ft.properties ?? {}, c = ft.geometry?.coordinates;
    if (typeof p.mag !== 'number' || !Array.isArray(c)) continue;
    items.push({ id: String(ft.id), lon: c[0], lat: c[1], derinlik: c[2] ?? 0, mag: p.mag, yer: usgsYer(String(p.place ?? '')), t: Number(p.time) });
  }
  const gun = items.filter(d => simdi - d.t <= 86_400_000);
  const saat = gun.filter(d => simdi - d.t <= 3_600_000);
  const en = gun.reduce<Deprem | null>((a, d) => (!a || d.mag > a.mag ? d : a), null);
  return {
    kaynak: 'USGS', items: gun.sort((a, b) => b.mag - a.mag),
    summary: { quakes_1h: saat.length, quakes_24h: gun.length, quakes_24h_m45: gun.filter(d => d.mag >= 4.5).length, max_mag_24h: en ? yuvarla(en.mag) : null, max_place_24h: en?.yer ?? null, max_lat: en?.lat ?? null, max_lon: en?.lon ?? null },
  };
}

// ---------------------------------------------------------------- 🌋 Depremler (Türkiye) · AFAD, yedek Kandilli

const iso = (d: Date) => d.toISOString().slice(0, 19);
export const afadUrl = (simdi = Date.now()) => `https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter?start=${iso(new Date(simdi - 86_400_000))}&end=${iso(new Date(simdi + 600_000))}&minmag=1`;
export const KANDILLI_URL = 'http://www.koeri.boun.edu.tr/scripts/lst0.asp';

/** AFAD apiv2: tarih alanı UTC (bölge eki yok) */
export function afadAyristir(j: any): Deprem[] {
  if (!Array.isArray(j)) throw new Error('AFAD cevabı beklenen biçimde değil');
  return j.map((e: any) => ({
    id: 'afad-' + e.eventID, lat: Number(e.latitude), lon: Number(e.longitude), derinlik: Number(e.depth), mag: Number(e.magnitude),
    yer: String(e.location ?? ''), t: Date.parse(String(e.date) + 'Z'), tr: (e.country ?? 'Türkiye') === 'Türkiye',
  })).filter((d: Deprem) => Number.isFinite(d.lat) && Number.isFinite(d.mag) && Number.isFinite(d.t));
}

/** Kandilli son 500 deprem listesi (<pre> içinde sabit sütunlar; saat Türkiye saati, UTC+3) */
export function kandilliAyristir(metin: string): Deprem[] {
  const out: Deprem[] = [];
  for (const s of metin.split('\n')) {
    const m = s.match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s{2,}/);
    if (!m) continue;
    const [, y, mo, d, h, mi, se, la, lo, de, md, ml, mw, yer] = m;
    const mag = [ml, mw, md].map(Number).find(x => Number.isFinite(x) && x > 0);
    if (mag == null) continue;
    out.push({ id: `kandilli-${y}${mo}${d}${h}${mi}${se}`, lat: Number(la), lon: Number(lo), derinlik: Number(de), mag, yer: yer.trim(), t: Date.UTC(+y, +mo - 1, +d, +h - 3, +mi, +se), tr: true });
  }
  return out;
}

export function trOzet(items: Deprem[], kaynak: string, simdi = Date.now()): Ham<Deprem> {
  const gun = items.filter(d => simdi - d.t <= 86_400_000 && simdi - d.t >= -600_000);
  const en = gun.reduce<Deprem | null>((a, d) => (!a || d.mag > a.mag ? d : a), null);
  return {
    kaynak, items: gun.sort((a, b) => b.t - a.t),
    summary: { tr_quakes_24h: gun.length, tr_quakes_1h: gun.filter(d => simdi - d.t <= 3_600_000).length, tr_quakes_24h_m3: gun.filter(d => d.mag >= 3).length, tr_max_mag: en ? yuvarla(en.mag) : null, tr_max_place: en?.yer ?? null, tr_max_lat: en?.lat ?? null, tr_max_lon: en?.lon ?? null },
  };
}

// ---------------------------------------------------------------- ✈️ Uçuşlar · OpenSky

/** [lat, lon, yön (derece), irtifa (m), çağrı kodu, ülke] */
export type Ucak = [number, number, number, number, string, string];
let openskyToken: { deger: string; bitis: number } | null = null;
async function openskyBaslik(f: F): Promise<Record<string, string>> {
  const id = process.env.OPENSKY_CLIENT_ID?.trim(), sir = process.env.OPENSKY_CLIENT_SECRET?.trim();
  if (!id || !sir) return {};
  if (!openskyToken || Date.now() > openskyToken.bitis) {
    const r = await iste(f, 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: sir }).toString(),
    });
    if (!r.ok) throw new Error(`OpenSky kimlik doğrulama HTTP ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    openskyToken = { deger: j.access_token, bitis: Date.now() + (j.expires_in - 60) * 1000 };
  }
  return { Authorization: `Bearer ${openskyToken.deger}` };
}
export const openskyAnahtarli = () => !!(process.env.OPENSKY_CLIENT_ID?.trim() && process.env.OPENSKY_CLIENT_SECRET?.trim());

export function openskyAyristir(j: any, enFazla = 5000): Ham<Ucak> {
  if (!j || !('states' in j)) throw new Error('OpenSky cevabı beklenen biçimde değil');
  const havada: Ucak[] = [];
  for (const s of j.states ?? []) {
    if (s[8] === true || typeof s[6] !== 'number' || typeof s[5] !== 'number') continue; // yerde ya da konumsuz
    havada.push([s[6], s[5], Number(s[10]) || 0, Math.round(Number(s[13] ?? s[7]) || 0), String(s[1] ?? '').trim(), String(s[2] ?? '')]);
  }
  const tr = havada.filter(u => icinde(BOLGE.turkiye, u[0], u[1])).length;
  // Dünya görünümü: eşit adımlı örnekleme (deterministik); Türkiye'dekiler her zaman kalır
  let items = havada;
  if (havada.length > enFazla) {
    const trU = havada.filter(u => icinde(BOLGE.turkiye, u[0], u[1]));
    const diger = havada.filter(u => !icinde(BOLGE.turkiye, u[0], u[1]));
    const adim = diger.length / Math.max(1, enFazla - trU.length);
    items = [...trU, ...Array.from({ length: Math.max(0, enFazla - trU.length) }, (_, i) => diger[Math.floor(i * adim)]).filter(Boolean)];
  }
  return { kaynak: 'OpenSky', items, summary: { flights_now: havada.length, tr_flights: tr, ornek: items.length } };
}

// ---------------------------------------------------------------- 🔥 Yangınlar · NASA FIRMS

/** [lat, lon, frp (MW)] */
export type Yangin = [number, number, number];
export const firmsUrl = (anahtar: string, uydu = 'VIIRS_SNPP_NRT') => `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(anahtar)}/${uydu}/world/1`;

export function firmsAyristir(csv: string, enFazla = 6000): Ham<Yangin> {
  const satir = csv.trim().split('\n');
  const bas = satir.shift()?.split(',') ?? [];
  const iLat = bas.indexOf('latitude'), iLon = bas.indexOf('longitude'), iGuven = bas.indexOf('confidence'), iFrp = bas.indexOf('frp');
  if (iLat < 0 || iLon < 0) throw new Error(csv.length < 200 ? `FIRMS: ${csv.trim().slice(0, 80)}` : 'FIRMS CSV başlığı beklenen biçimde değil');
  const hepsi: Yangin[] = [];
  for (const s of satir) {
    const c = s.split(',');
    const g = iGuven >= 0 ? c[iGuven] : 'n';
    if (g === 'l' || (Number.isFinite(Number(g)) && Number(g) < 30)) continue; // düşük güvenli tespitler sayılmaz
    const lat = Number(c[iLat]), lon = Number(c[iLon]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) hepsi.push([lat, lon, iFrp >= 0 ? Number(c[iFrp]) || 0 : 0]);
  }
  const adim = hepsi.length / enFazla;
  const items = hepsi.length > enFazla ? Array.from({ length: enFazla }, (_, i) => hepsi[Math.floor(i * adim)]) : hepsi;
  return {
    kaynak: 'NASA FIRMS',
    items,
    summary: { fires_24h: hepsi.length, fires_24h_amazon: hepsi.filter(y => icinde(BOLGE.amazon, y[0], y[1])).length, fires_24h_tr: hepsi.filter(y => icinde(BOLGE.turkiye, y[0], y[1])).length },
  };
}

// ---------------------------------------------------------------- 🛰️ Uydular · CelesTrak TLE

export interface Uydu { ad: string; tle1: string; tle2: string; grup: 'istasyon' | 'turk' }
const TURK_ADLAR = ['TURKSAT', 'GOKTURK', 'IMECE', 'RASAT'];
const ESKI_TURK = /TURKSAT 1B|TURKSAT 1C|TURKSAT 2A|3USAT/; // görevini bitirmiş (mezarlık yörüngesi) ya da küçük deneme uyduları
export function tleAyristir(metin: string, grup: Uydu['grup']): Uydu[] {
  const s = metin.split(/\r?\n/).map(x => x.trimEnd()).filter(Boolean);
  const out: Uydu[] = [];
  for (let i = 0; i < s.length - 2; i++) {
    if (s[i + 1]?.startsWith('1 ') && s[i + 2]?.startsWith('2 ')) { out.push({ ad: s[i].trim(), tle1: s[i + 1], tle2: s[i + 2], grup }); i += 2; }
  }
  return out;
}

// ---------------------------------------------------------------- 📰 Haberler · mevcut haber modu servisi

export interface HaberNoktasi { baslik: string; kaynak: string; zaman: string; yer: string | null; lat: number | null; lon: number | null; sonDakika: boolean }
export function haberAyristir(items: { title: string; source: string; published_at: string; category?: string }[], simdi = Date.now()): Ham<HaberNoktasi> {
  const son3 = items.filter(i => simdi - Date.parse(i.published_at) <= 3 * 3_600_000);
  const nokta: HaberNoktasi[] = son3.map(i => {
    const y = yerBul(i.title);
    return { baslik: i.title, kaynak: i.source, zaman: i.published_at, yer: y?.yer ?? null, lat: y?.konum[0] ?? null, lon: y?.konum[1] ?? null, sonDakika: /son dak[iı]ka|fla[şs] haber|^flaş/i.test(i.title) }; // bazı beslemelerin saati kaymış: süreye değil başlığa bakılır
  });
  return {
    kaynak: 'Haber modu',
    items: nokta.sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman)),
    summary: { headlines_3h: nokta.length, breaking_now: nokta.filter(n => n.sonDakika).length, placed: nokta.filter(n => n.yer).length, tr_headlines: nokta.filter(n => !n.yer).length },
  };
}

// ---------------------------------------------------------------- ⚡ Siber · Bekçi + USOM (+ isteğe bağlı URLhaus)

/** Yalnızca sayılar: mesaj içeriği, gönderen ve link adresi asla çıkmaz */
export function siberOzet(kayitlar: { zaman: string; seviye: string; linkler?: unknown[]; demo?: boolean }[], usom: number | null, urlhaus: number | null, simdi = new Date()): Ham<never> {
  const bugun = simdi.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const b = kayitlar.filter(k => !k.demo && new Date(k.zaman).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }) === bugun && k.seviye !== 'temiz');
  return {
    kaynak: urlhaus != null ? 'Bekçi · USOM · URLhaus' : 'Bekçi · USOM',
    items: [],
    summary: { malicious_messages_today: b.length, dangerous_today: b.filter(k => k.seviye === 'tehlikeli').length, malicious_links_today: b.reduce((a, k) => a + (k.linkler?.length ?? 0), 0), usom_list_size: usom, urlhaus_recent: urlhaus },
  };
}

// ---------------------------------------------------------------- 🌦️ Hava · Open-Meteo

export interface HavaNoktasi { ad: string; lat: number; lon: number; sicaklik: number; hamle: number; yagis: number; kod: number; uyarilar: string[]; ev?: boolean }
export function havaUyarilari(h: { sicaklik: number; hamle: number; yagis: number; kod: number }): string[] {
  const u: string[] = [];
  if (h.kod >= 95) u.push('gök gürültülü fırtına');
  else if (h.hamle >= 60) u.push('fırtına');
  if (h.sicaklik >= 38) u.push('aşırı sıcak');
  if (h.sicaklik <= -10) u.push('aşırı soğuk');
  if (h.yagis >= 7) u.push('yoğun yağış');
  return u;
}
export function havaAyristir(j: any, sehirler: { ad: string; lat: number; lon: number; ev?: boolean }[]): Ham<HavaNoktasi> {
  const liste = Array.isArray(j) ? j : [j];
  if (!liste[0]?.current) throw new Error('Open-Meteo cevabı beklenen biçimde değil');
  const items: HavaNoktasi[] = liste.map((x: any, i: number) => {
    const c = x.current;
    const h = { sicaklik: yuvarla(c.temperature_2m), hamle: Math.round(c.wind_gusts_10m ?? c.wind_speed_10m ?? 0), yagis: yuvarla(c.precipitation ?? 0), kod: Number(c.weather_code ?? 0) };
    return { ad: sehirler[i].ad, lat: sehirler[i].lat, lon: sehirler[i].lon, ...h, uyarilar: havaUyarilari(h), ev: sehirler[i].ev };
  });
  const ev = items.find(i => i.ev);
  return { kaynak: 'Open-Meteo', items, summary: { weather_alerts: items.reduce((a, i) => a + i.uyarilar.length, 0), home_temp: ev?.sicaklik ?? null, home_city: ev?.ad ?? null } };
}

// ---------------------------------------------------------------- Katmanlar

let evSehri: { ad: string; lat: number; lon: number } | null = null;
export const evSehriAyarla = (s: { ad: string; lat: number; lon: number } | null) => { evSehri = s; KATMAN.hava.sifirla(); };

export const KATMAN = {
  deprem_dunya: new Katman<Deprem>('deprem_dunya', 'USGS', sn('deprem_dunya', 60), async f => {
    const r = await iste(f, USGS_URL);
    if (!r.ok) throw new Error(`USGS HTTP ${r.status}`);
    return usgsAyristir(await r.json());
  }),
  deprem_tr: new Katman<Deprem>('deprem_tr', 'AFAD', sn('deprem_tr', 60), async f => {
    try {
      const r = await iste(f, afadUrl(), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`AFAD HTTP ${r.status}`);
      return trOzet(afadAyristir(await r.json()), 'AFAD');
    } catch (e) {
      console.warn(`[ultron-göz] AFAD alınamadı (${(e as Error).message}); Kandilli deneniyor`);
      const r = await iste(f, KANDILLI_URL);
      if (!r.ok) throw new Error(`Kandilli HTTP ${r.status}`);
      return trOzet(kandilliAyristir(new TextDecoder('windows-1254').decode(await r.arrayBuffer())), 'Kandilli');
    }
  }),
  ucus: new Katman<Ucak>('ucus', 'OpenSky', () => (openskyAnahtarli() ? sn('ucus', 30)() : sn('ucus_anahtarsiz', 90)()), async f => {
    const r = await iste(f, 'https://opensky-network.org/api/states/all', { headers: await openskyBaslik(f) });
    if (r.status === 429) throw new Error('OpenSky günlük kotası doldu (429)');
    if (!r.ok) throw new Error(`OpenSky HTTP ${r.status}`);
    return openskyAyristir(await r.json(), Number(ayar().goz?.en_fazla_ucak) || 5000);
  }),
  yangin: new Katman<Yangin>('yangin', 'NASA FIRMS', sn('yangin', 900), async f => {
    const k = process.env.NASA_FIRMS_MAP_KEY?.trim();
    if (!k) throw new Error('NASA_FIRMS_MAP_KEY yok (.env)');
    const r = await f(firmsUrl(k), { signal: AbortSignal.timeout(Math.max(zamanAsimi(), 15_000)) }); // dünya CSV'si birkaç MB
    if (!r.ok) throw new Error(`FIRMS HTTP ${r.status}`);
    return firmsAyristir(await r.text(), Number(ayar().goz?.en_fazla_yangin) || 6000);
  }),
  uydu: new Katman<Uydu>('uydu', 'CelesTrak', sn('uydu_tle', 21600), async f => {
    const al = async (q: string, grup: Uydu['grup']) => {
      const r = await iste(f, `https://celestrak.org/NORAD/elements/gp.php?${q}&FORMAT=tle`);
      if (!r.ok) throw new Error(`CelesTrak HTTP ${r.status}`);
      return tleAyristir(await r.text(), grup);
    };
    const ist = (await al('GROUP=stations', 'istasyon')).filter(u => /^ISS \(ZARYA\)|^CSS \(TIANHE\)/.test(u.ad));
    const turk = (await Promise.all(TURK_ADLAR.map(n => al(`NAME=${n}`, 'turk').catch(() => [] as Uydu[])))).flat().filter(u => !ESKI_TURK.test(u.ad) && !/ELARASAT/.test(u.ad));
    if (!ist.length && !turk.length) throw new Error('CelesTrak boş döndü');
    return { kaynak: 'CelesTrak', items: [...ist, ...turk], summary: { uydu_sayisi: ist.length + turk.length, turk_uydu: turk.length } };
  }),
  haber: new Katman<HaberNoktasi>('haber', 'Haber modu', sn('haber', 300), async () => {
    const s = await newsSnapshot();
    if (!s.items.length) throw new Error('haber modunda manşet yok');
    return haberAyristir(s.items);
  }),
  siber: new Katman<never>('siber', 'Bekçi · USOM', sn('siber', 900), async f => {
    let urlhaus: number | null = null;
    const k = process.env.URLHAUS_AUTH_KEY?.trim();
    if (process.env.URLHAUS_ENABLED === 'true' && k) {
      try {
        const r = await iste(f, 'https://urlhaus-api.abuse.ch/v1/urls/recent/limit/1000/', { headers: { 'Auth-Key': k } });
        if (r.ok) { const j = (await r.json()) as { urls?: { date_added: string }[] }; urlhaus = (j.urls ?? []).filter(u => Date.now() - Date.parse(u.date_added.replace(' UTC', 'Z').replace(' ', 'T')) <= 86_400_000).length; }
      } catch { /* isteğe bağlı kaynak: yoksa sayılmaz */ }
    }
    return siberOzet(kayitlariOku(), usomSatir(), urlhaus);
  }),
  hava: new Katman<HavaNoktasi>('hava', 'Open-Meteo', sn('hava', 1800), async f => {
    const sehirler: { ad: string; lat: number; lon: number; ev?: boolean }[] = [...(ayar().buyuk_sehirler ?? [])];
    if (evSehri && !sehirler.some(s => s.ad === evSehri!.ad)) sehirler.push({ ...evSehri, ev: true });
    else if (evSehri) sehirler.find(s => s.ad === evSehri!.ad)!.ev = true;
    const r = await iste(f, `https://api.open-meteo.com/v1/forecast?latitude=${sehirler.map(s => s.lat).join(',')}&longitude=${sehirler.map(s => s.lon).join(',')}&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation&timezone=auto`);
    if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
    return havaAyristir(await r.json(), sehirler);
  }),
};
export const KATMAN_ADLARI = Object.keys(KATMAN) as KatmanAdi[];
