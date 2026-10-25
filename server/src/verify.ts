// Haber Modu · iddia kontrolünde kullanılan resmî ve açık veri kaynakları. Hepsi anahtarsız ve ücretsiz.
// - TCMB gösterge kurları (günlük XML arşivi): tcmb.gov.tr/kurlar/YYYYAA/GGAAYYYY.xml
// - AFAD deprem kataloğu: deprem.afad.gov.tr/apiv2/event/filter
// - Dünya Bankası göstergeleri (yıllık): api.worldbank.org/v2
// - Open-Meteo (model verisi; istasyon ölçümü değildir): geçmiş 7 gün + konum araması
// - Resmî Gazete günlük fihristi: resmigazete.gov.tr/eskiler/YYYY/AA/YYYYAAGG.htm
// - Bağımsız doğrulama kuruluşlarının RSS'i (Teyit, Malumatfuruş): yalnızca ilgili analiz bağlantısı için
import Parser from 'rss-parser';
import { DOGRULAMA_BESLEMELERI } from './newsSources.js';
import { fold, kokBenzerligi, kokler } from './newsCluster.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Jarvis veri okuyucu)' };
const zaman = (ms = 9000) => AbortSignal.timeout(ms);

/** Basit önbellek: aynı sorgu süre dolana kadar tekrar çekilmez */
function onbellek<T>(ms: number, f: (key: string) => Promise<T>) {
  const m = new Map<string, { at: number; p: Promise<T> }>();
  return (key: string) => {
    const v = m.get(key);
    if (v && Date.now() - v.at < ms) return v.p;
    const p = f(key).catch(e => { m.delete(key); throw e; });
    m.set(key, { at: Date.now(), p });
    return p;
  };
}

const gun = (d: Date) => d.toISOString().slice(0, 10);
const geri = (iso: string, n: number) => gun(new Date(new Date(iso + 'T12:00:00Z').getTime() - n * 86400_000));

// ———————————————————— TCMB ————————————————————

export interface KurGun { tarih: string; deger: number; url: string }

const tcmbGun = onbellek(6 * 3600_000, async (iso: string): Promise<{ url: string; xml: string } | null> => {
  const [y, a, g] = iso.split('-');
  const url = `https://www.tcmb.gov.tr/kurlar/${y}${a}/${g}${a}${y}.xml`;
  const r = await fetch(url, { headers: UA, signal: zaman() });
  return r.ok ? { url, xml: await r.text() } : null;
});

/** O gün ya da ondan önceki ilk iş günü (tatil ve hafta sonu) TCMB döviz satış kuru */
export async function tcmbKur(doviz: string, iso: string): Promise<KurGun | null> {
  for (let i = 0; i < 6; i++) {
    const t = geri(iso, i);
    const d = await tcmbGun(t).catch(() => null);
    if (!d) continue;
    const blok = new RegExp(`CurrencyCode="${doviz}"[\\s\\S]*?<ForexSelling>([\\d.]+)<`).exec(d.xml);
    if (blok) return { tarih: t, deger: Number(blok[1]), url: d.url };
  }
  return null;
}

/** Grafik için son n iş günü */
export async function tcmbSeri(doviz: string, iso: string, n = 7): Promise<KurGun[]> {
  const out: KurGun[] = [];
  let t = iso;
  for (let i = 0; i < n * 2 && out.length < n; i++) {
    const k = await tcmbKur(doviz, t);
    if (!k) break;
    if (!out.some(x => x.tarih === k.tarih)) out.unshift(k);
    t = geri(k.tarih, 1);
  }
  return out;
}

// ———————————————————— AFAD ————————————————————

export interface Deprem { tarih: string; il: string; yer: string; buyukluk: number; tip: string }
export const AFAD_SAYFA = 'https://deprem.afad.gov.tr/last-earthquakes';

/** Verilen günün (±1 gün) depremleri, ilde */
export async function afadDepremler(iso: string, il: string): Promise<Deprem[]> {
  const url = `https://deprem.afad.gov.tr/apiv2/event/filter?start=${geri(iso, 1)}T00:00:00&end=${geri(iso, -2)}T00:00:00&minmag=2.5`;
  const r = await fetch(url, { headers: UA, signal: zaman() });
  if (!r.ok) throw new Error(`AFAD ${r.status}`);
  const j = (await r.json()) as { date: string; province: string | null; location: string; magnitude: string; type: string }[];
  const f = fold(il).trim();
  return j.filter(e => fold(e.province ?? '').trim() === f || fold(e.location).includes(f))
    .map(e => ({ tarih: e.date, il: e.province ?? '', yer: e.location, buyukluk: Number(e.magnitude), tip: e.type }));
}

// ———————————————————— Dünya Bankası ————————————————————

export const WB_GOSTERGE: Record<string, { kod: string; ad: string; birim: string }> = {
  enflasyon: { kod: 'FP.CPI.TOTL.ZG', ad: 'Enflasyon (TÜFE, yıllık ortalama değişim)', birim: '%' },
  buyume: { kod: 'NY.GDP.MKTP.KD.ZG', ad: 'GSYH büyümesi (yıllık)', birim: '%' },
  issizlik: { kod: 'SL.UEM.TOTL.NE.ZS', ad: 'İşsizlik oranı (ulusal tahmin)', birim: '%' },
  nufus: { kod: 'SP.POP.TOTL', ad: 'Nüfus', birim: 'kişi' },
};

export const wbSeri = onbellek(24 * 3600_000, async (gosterge: string): Promise<{ yil: number; deger: number }[]> => {
  const g = WB_GOSTERGE[gosterge];
  if (!g) return [];
  const r = await fetch(`https://api.worldbank.org/v2/country/TR/indicator/${g.kod}?format=json&per_page=12`, { headers: UA, signal: zaman() });
  const j = (await r.json()) as [unknown, { date: string; value: number | null }[]];
  return (j[1] ?? []).filter(x => x.value !== null).map(x => ({ yil: Number(x.date), deger: x.value as number })).sort((a, b) => a.yil - b.yil);
});
export const wbSayfa = (gosterge: string) => `https://data.worldbank.org/indicator/${WB_GOSTERGE[gosterge]?.kod}?locations=TR`;

// ———————————————————— Open-Meteo ————————————————————

const konum = onbellek(30 * 86400_000, async (il: string) => {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(il)}&count=1&language=tr&countryCode=TR`, { signal: zaman() });
  const j = (await r.json()) as { results?: { latitude: number; longitude: number }[] };
  return j.results?.[0] ?? null;
});

/** İlin son 7 gününün günlük en yüksek ve en düşük sıcaklığı (model verisi) */
export async function havaGecmis(il: string): Promise<{ tarih: string; max: number; min: number }[]> {
  const k = await konum(il);
  if (!k) return [];
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${k.latitude}&longitude=${k.longitude}&daily=temperature_2m_max,temperature_2m_min&past_days=7&forecast_days=1&timezone=Europe%2FIstanbul`, { signal: zaman() });
  const j = (await r.json()) as { daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[] } };
  const d = j.daily;
  return d ? d.time.map((t, i) => ({ tarih: t, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i] })) : [];
}
export const OPEN_METEO_SAYFA = 'https://open-meteo.com/';

// ———————————————————— Resmî Gazete ————————————————————

export const rgSayfa = (iso: string) => { const [y, a, g] = iso.split('-'); return `https://www.resmigazete.gov.tr/eskiler/${y}/${a}/${y}${a}${g}.htm`; };

/** O günün Resmî Gazete fihrist metni (sadeleştirilmiş) */
export const resmiGazete = onbellek(12 * 3600_000, async (iso: string): Promise<string | null> => {
  const r = await fetch(rgSayfa(iso), { headers: UA, signal: zaman() });
  if (!r.ok) return null;
  const html = new TextDecoder('windows-1254').decode(await r.arrayBuffer());
  return fold(html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
});

// ———————————————————— Bağımsız doğrulama kuruluşları ————————————————————

export interface DogrulamaYazisi { ad: string; baslik: string; url: string; tarih: string }
const parser = new Parser({ timeout: 8000, headers: UA });
const dogrulamaListesi = onbellek(3600_000, async () => {
  const out: DogrulamaYazisi[] = [];
  await Promise.all(DOGRULAMA_BESLEMELERI.map(async b => {
    try {
      const f = await parser.parseURL(b.url);
      for (const it of f.items.slice(0, 40)) out.push({ ad: b.ad, baslik: (it.title ?? '').trim(), url: it.link ?? '', tarih: (it.isoDate ?? it.pubDate ?? '').slice(0, 10) });
    } catch { /* kaynak cevap vermedi */ }
  }));
  return out;
});

/** İddiayla ilgili yayımlanmış doğrulama analizleri (başlık benzerliğiyle) */
export async function ilgiliDogrulamalar(metin: string): Promise<DogrulamaYazisi[]> {
  const k = kokler(metin);
  const liste = await dogrulamaListesi('').catch(() => []);
  return liste.filter(x => kokBenzerligi(k, kokler(x.baslik)) >= 0.5).slice(0, 2);
}

/** Testte sahte veri verilir */
export const verifyDeps = { tcmbKur, tcmbSeri, afadDepremler, wbSeri, havaGecmis, resmiGazete, ilgiliDogrulamalar };
