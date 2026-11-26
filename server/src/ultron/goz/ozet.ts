// Ultron'un Gözü · katmanlardan yapılandırılmış özet. Anlatımdaki BÜTÜN rakamlar buradan gelir (LLM'den değil).
// Ayrıca: uydu konumları (satellite.js, SGP4), kullanıcıya en yakın deprem, Türkiye ve "çevrem" özetleri,
// "en tehlikeli yer" skoru (açık ve ayarlanabilir; config.json → goz.tehlike).
import * as sat from 'satellite.js';
import { BOLGE, haversine, icinde, noktaAdi } from './cografya.js';
import type { Deprem, HaberNoktasi, HavaNoktasi, KatmanAdi, KatmanVeri, Ozet, Uydu, Yangin } from './katmanlar.js';

export type Katmanlar = Partial<Record<KatmanAdi, KatmanVeri>>;
const var_ = (k?: KatmanVeri) => !!k && k.durum !== 'yok';
const yuvarla = (x: number, b = 1) => Math.round(x * 10 ** b) / 10 ** b;

// ---------------------------------------------------------------- Uydular

export interface UyduKonum { ad: string; lat: number; lon: number; km: number; grup: Uydu['grup'] }
/** TLE + zaman → yer altı noktası (enlem, boylam) ve irtifa. Çözülemeyen (bozulmuş) TLE atlanır. */
export function uyduKonumu(u: Pick<Uydu, 'ad' | 'tle1' | 'tle2' | 'grup'>, t = new Date()): UyduKonum | null {
  try {
    const rec = sat.twoline2satrec(u.tle1, u.tle2);
    const pv = sat.propagate(rec, t);
    if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
    const g = sat.eciToGeodetic(pv.position, sat.gstime(t));
    return { ad: u.ad, lat: sat.degreesLat(g.latitude), lon: sat.degreesLong(g.longitude), km: g.height, grup: u.grup };
  } catch { return null; }
}

/** "ISS (ZARYA)" → "ISS"; "TURKSAT 5A" → "Türksat 5A" */
export const uyduAdi = (ad: string) => ad.replace(/ \(.*\)$/, '').replace(/^TURKSAT/, 'Türksat').replace(/^GOKTURK/, 'Göktürk').replace(/^IMECE/, 'İMECE');

// ---------------------------------------------------------------- Dünya özeti (açılış anlatımı)

export interface Ev { ad: string; lat: number; lon: number }

/** En yakın deprem (son 24 saat; Türkiye listesi + dünya listesi) */
export function enYakinDeprem(k: Katmanlar, ev: Ev): (Deprem & { km: number }) | null {
  const liste = [...((k.deprem_tr?.items as Deprem[]) ?? []), ...((k.deprem_dunya?.items as Deprem[]) ?? [])];
  let en: (Deprem & { km: number }) | null = null;
  for (const d of liste) {
    const km = haversine(ev.lat, ev.lon, d.lat, d.lon);
    if (!en || km < en.km) en = { ...d, km };
  }
  return en;
}

/** Anlatıma giren düz özet. Yalnızca verisi olan katmanların anahtarları bulunur (VERİ YOK → anahtar yok). */
export function dunyaOzeti(k: Katmanlar, ev: Ev | null, simdi = new Date()): Ozet {
  const o: Ozet = {};
  if (var_(k.ucus)) Object.assign(o, pick(k.ucus!.summary, ['flights_now', 'tr_flights']));
  if (var_(k.deprem_dunya)) Object.assign(o, pick(k.deprem_dunya!.summary, ['quakes_1h', 'quakes_24h', 'quakes_24h_m45', 'max_mag_24h', 'max_place_24h']));
  if (var_(k.deprem_tr)) Object.assign(o, pick(k.deprem_tr!.summary, ['tr_quakes_24h', 'tr_quakes_1h', 'tr_max_mag', 'tr_max_place']));
  if (ev && (var_(k.deprem_tr) || var_(k.deprem_dunya))) {
    const d = enYakinDeprem(k, ev);
    if (d) { o.nearest_quake_km = Math.round(d.km); o.nearest_quake_mag = yuvarla(d.mag); o.nearest_quake_place = d.yer; o.home_city = ev.ad; }
  }
  if (var_(k.yangin)) Object.assign(o, pick(k.yangin!.summary, ['fires_24h', 'fires_24h_amazon', 'fires_24h_tr']));
  if (var_(k.siber)) Object.assign(o, pick(k.siber!.summary, ['malicious_links_today', 'malicious_messages_today', 'usom_list_size']));
  if (var_(k.haber)) Object.assign(o, pick(k.haber!.summary, ['breaking_now', 'headlines_3h']));
  if (var_(k.hava)) Object.assign(o, pick(k.hava!.summary, ['weather_alerts', 'home_temp']));
  if (var_(k.uydu)) {
    const iss = (k.uydu!.items as Uydu[]).find(u => u.ad.startsWith('ISS'));
    const p = iss && uyduKonumu(iss, simdi);
    if (p) { const y = noktaAdi(p.lat, p.lon); o.iss_over = y.ad; o.iss_lat = yuvarla(p.lat); o.iss_lon = yuvarla(p.lon); o.iss_km = Math.round(p.km); }
    o.turk_uydu = k.uydu!.summary.turk_uydu ?? null;
  }
  for (const a of Object.keys(o)) if (o[a] == null) delete o[a];
  return o;
}
function pick(s: Ozet, anahtarlar: string[]): Ozet {
  const o: Ozet = {};
  for (const a of anahtarlar) if (s[a] != null) o[a] = s[a];
  return o;
}

// ---------------------------------------------------------------- Türkiye ve çevrem

export function turkiyeOzeti(k: Katmanlar): Ozet {
  const o: Ozet = {};
  if (var_(k.deprem_tr)) Object.assign(o, pick(k.deprem_tr!.summary, ['tr_quakes_24h', 'tr_quakes_24h_m3', 'tr_max_mag', 'tr_max_place']));
  if (var_(k.ucus)) Object.assign(o, pick(k.ucus!.summary, ['tr_flights']));
  if (var_(k.yangin)) Object.assign(o, pick(k.yangin!.summary, ['fires_24h_tr']));
  if (var_(k.haber)) { o.tr_headlines = (k.haber!.items as HaberNoktasi[]).filter(h => !h.yer || h.yer === 'Türkiye').length; o.breaking_now = k.haber!.summary.breaking_now ?? null; }
  if (var_(k.hava)) {
    const h = k.hava!.items as HavaNoktasi[];
    const sicak = h.reduce<HavaNoktasi | null>((a, x) => (!a || x.sicaklik > a.sicaklik ? x : a), null);
    const soguk = h.reduce<HavaNoktasi | null>((a, x) => (!a || x.sicaklik < a.sicaklik ? x : a), null);
    if (sicak) { o.hottest_city = sicak.ad; o.hottest_temp = sicak.sicaklik; }
    if (soguk) { o.coldest_city = soguk.ad; o.coldest_temp = soguk.sicaklik; }
    o.weather_alerts = k.hava!.summary.weather_alerts ?? 0;
  }
  if (var_(k.siber)) Object.assign(o, pick(k.siber!.summary, ['malicious_links_today', 'usom_list_size']));
  for (const a of Object.keys(o)) if (o[a] == null) delete o[a];
  return o;
}

/** Kullanıcının çevresi (varsayılan: ayarlardaki şehir). Yarıçap km. */
export function cevreOzeti(k: Katmanlar, ev: Ev, yaricap = 300, simdi = new Date()): Ozet {
  const o: Ozet = { home_city: ev.ad, radius_km: yaricap };
  if (var_(k.deprem_tr) || var_(k.deprem_dunya)) {
    const liste = [...((k.deprem_tr?.items as Deprem[]) ?? []), ...((k.deprem_dunya?.items as Deprem[]) ?? [])].map(d => ({ ...d, km: haversine(ev.lat, ev.lon, d.lat, d.lon) }));
    const yakin = liste.filter(d => d.km <= yaricap);
    o.near_quakes_24h = yakin.length;
    const en = liste.reduce<(typeof liste)[number] | null>((a, d) => (!a || d.km < a.km ? d : a), null);
    if (en) { o.nearest_quake_km = Math.round(en.km); o.nearest_quake_mag = yuvarla(en.mag); o.nearest_quake_place = en.yer; }
  }
  if (var_(k.ucus)) o.flights_overhead = (k.ucus!.items as [number, number][]).filter(u => haversine(ev.lat, ev.lon, u[0], u[1]) <= 100).length;
  if (var_(k.yangin)) o.near_fires = (k.yangin!.items as Yangin[]).filter(y => haversine(ev.lat, ev.lon, y[0], y[1]) <= yaricap).length;
  if (var_(k.hava)) {
    const h = (k.hava!.items as HavaNoktasi[]).find(x => x.ev);
    if (h) { o.home_temp = h.sicaklik; o.home_gust = h.hamle; o.home_alerts = h.uyarilar.length ? h.uyarilar.join(', ') : 'yok'; }
  }
  if (var_(k.uydu)) {
    const iss = (k.uydu!.items as Uydu[]).find(u => u.ad.startsWith('ISS'));
    const p = iss && uyduKonumu(iss, simdi);
    if (p) o.iss_km_from_home = Math.round(haversine(ev.lat, ev.lon, p.lat, p.lon));
  }
  return o;
}

// ---------------------------------------------------------------- En tehlikeli yer

export interface TehlikeAyari { hucre_derece: number; agirlik: { deprem: number; yangin: number; haber: number; hava: number }; min_buyukluk: number }
export interface Tehlike { lat: number; lon: number; ad: string; skor: number; gerekce: { deprem: number; en_buyuk: number | null; deprem_yeri: string | null; yangin: number; haber: number; hava_uyari: number }; parcalar: Record<string, number> }

/**
 * Dünya hücrelere bölünür; her hücrenin skoru:
 *   deprem·Σ(M−3)² (son 24 saat, M ≥ min_buyukluk) + yangin·(yangın/100) + haber·(yerli son dakika manşeti) + hava·(uyarı)
 * En yüksek skorlu hücre seçilir; yer adı en güçlü katkıdan (en büyük deprem, haber yeri) ya da hücre merkezinden.
 */
export function enTehlikeliYer(k: Katmanlar, a: TehlikeAyari): Tehlike | null {
  const h = a.hucre_derece || 15;
  const w = Object.assign({ deprem: 1, yangin: 0.6, haber: 0.8, hava: 1.5 }, a.agirlik);
  type Hucre = { deprem: number; depremSayi: number; enBuyuk: Deprem | null; yangin: number; haber: number; haberYer: string | null; hava: number };
  const hucreler = new Map<string, Hucre>();
  const al = (lat: number, lon: number) => {
    const key = `${Math.floor((lat + 90) / h)}:${Math.floor((((lon + 180) % 360) + 360) % 360 / h)}`;
    if (!hucreler.has(key)) hucreler.set(key, { deprem: 0, depremSayi: 0, enBuyuk: null, yangin: 0, haber: 0, haberYer: null, hava: 0 });
    return hucreler.get(key)!;
  };
  const gorulen = new Set<string>();
  for (const d of [...((k.deprem_dunya?.items as Deprem[]) ?? []), ...((k.deprem_tr?.items as Deprem[]) ?? [])]) {
    if (d.mag < (a.min_buyukluk ?? 4)) continue;
    const imza = `${d.lat.toFixed(1)}:${d.lon.toFixed(1)}:${Math.round(d.t / 120_000)}`; // USGS ve AFAD aynı depremi iki kez saymasın
    if (gorulen.has(imza)) continue;
    gorulen.add(imza);
    const c = al(d.lat, d.lon);
    c.deprem += (d.mag - 3) ** 2; c.depremSayi++;
    if (!c.enBuyuk || d.mag > c.enBuyuk.mag) c.enBuyuk = d;
  }
  for (const y of (k.yangin?.items as Yangin[]) ?? []) al(y[0], y[1]).yangin++;
  for (const n of (k.haber?.items as HaberNoktasi[]) ?? []) if (n.lat != null && n.lon != null && n.sonDakika) { const c = al(n.lat, n.lon); c.haber++; c.haberYer ??= n.yer; }
  for (const x of (k.hava?.items as HavaNoktasi[]) ?? []) if (x.uyarilar.length) al(x.lat, x.lon).hava += x.uyarilar.length;
  let en: { key: string; c: Hucre; skor: number; parcalar: Record<string, number> } | null = null;
  for (const [key, c] of hucreler) {
    const parcalar = { deprem: w.deprem * c.deprem, yangin: w.yangin * (c.yangin / 100), haber: w.haber * c.haber, hava: w.hava * c.hava };
    const skor = parcalar.deprem + parcalar.yangin + parcalar.haber + parcalar.hava;
    if (!en || skor > en.skor) en = { key, c, skor, parcalar };
  }
  if (!en || en.skor <= 0) return null;
  const [i, j] = en.key.split(':').map(Number);
  let lat = i * h - 90 + h / 2, lon = j * h - 180 + h / 2;
  let ad: string;
  if (en.c.enBuyuk && en.parcalar.deprem >= en.parcalar.haber) { lat = en.c.enBuyuk.lat; lon = en.c.enBuyuk.lon; ad = en.c.enBuyuk.yer || noktaAdi(lat, lon).ad; }
  else if (en.c.haberYer) ad = en.c.haberYer;
  else ad = noktaAdi(lat, lon).ad;
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    lat, lon, ad, skor: r(en.skor),
    gerekce: { deprem: en.c.depremSayi, en_buyuk: en.c.enBuyuk ? yuvarla(en.c.enBuyuk.mag) : null, deprem_yeri: en.c.enBuyuk?.yer ?? null, yangin: en.c.yangin, haber: en.c.haber, hava_uyari: en.c.hava },
    parcalar: Object.fromEntries(Object.entries(en.parcalar).map(([a, b]) => [a, r(b)])),
  };
}

/** Türkiye kutusundaki uçak sayısı (bölgesel istek yoksa örneklemden değil, özetten) */
export const turkiyede = (lat: number, lon: number) => icinde(BOLGE.turkiye, lat, lon);
