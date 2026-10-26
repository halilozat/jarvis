// Haber Modu · dünya basını. Türk basınındaki bir olayın dünya basınında nasıl verildiği.
// - Kaynaklar (anahtarsız RSS): İngiltere, ABD, Almanya, Fransa, AB ve Orta Doğu'dan 10 yayın, İngilizce servisleri.
//   Türkçe kümelemeye girmez (kökler Türkçe); ayrı önbellekte durur.
// - Adaylar: önce olay için İngilizce bir arama sorgusu hazırlanır; sorguyla Bing News'te aranır (gerçek makale
//   adresleri: Reuters, AP, NYT, WSJ, CBS … yüzlerce yayın) ve 10 yayının son 4 günlük başlıklarıyla birleştirilir.
//   Model aynı olayı anlatanların numaralarını seçer (numaralar kodla denetlenir). Metni okunabilen yayınlar öne alınır;
//   MSN'de yayımlanan haberlerin (WSJ, USA Today …) metni MSN'in içerik servisinden okunur. Google News İngilizce'de
//   bulunan diğer yayınlar başlık düzeyinde listelenir.
// - Karşılaştırma: Türk basınının ve eşleşen dünya yayınlarının tam metinleri modele verilir. Her alıntı kendi
//   metninde BİREBİR geçmeli (kodla denetlenir); Türkçe çeviriler "çeviri" diye işaretlenir. Değerlendirici dil
//   ("propaganda", "taraflı" …) atılır. Model yoksa dürüst bir "yapılamadı" döner, uydurma yok.
import Parser from 'rss-parser';
import { tamMetin } from './article.js';
import { birebir, cumleler, temizMi, type KaynakMetin } from './newsAnalysis.js';
import type { Kume } from './newsCluster.js';
import { CHAT_MODEL, MOCK, routellm, type ChatResponse } from './routellm.js';
import type { NewsItem } from './types.js';

export interface DunyaKaynak { ad: string; ulke: string; url: string; konum: [number, number] }
export const DUNYA_KAYNAKLARI: DunyaKaynak[] = [
  { ad: 'BBC', ulke: 'İngiltere', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', konum: [51.51, -0.14] },
  { ad: 'The Guardian', ulke: 'İngiltere', url: 'https://www.theguardian.com/world/rss', konum: [51.53, -0.12] },
  { ad: 'The New York Times', ulke: 'ABD', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', konum: [40.76, -73.99] },
  { ad: 'NPR', ulke: 'ABD', url: 'https://feeds.npr.org/1004/rss.xml', konum: [38.9, -77.01] },
  { ad: 'DW', ulke: 'Almanya', url: 'https://rss.dw.com/rdf/rss-en-all', konum: [50.72, 7.12] },
  { ad: 'Der Spiegel', ulke: 'Almanya', url: 'https://www.spiegel.de/international/index.rss', konum: [53.54, 10.0] },
  { ad: 'France 24', ulke: 'Fransa', url: 'https://www.france24.com/en/rss', konum: [48.83, 2.27] },
  { ad: 'Le Monde', ulke: 'Fransa', url: 'https://www.lemonde.fr/en/international/rss_full.xml', konum: [48.84, 2.32] },
  { ad: 'Euronews', ulke: 'AB', url: 'https://www.euronews.com/rss?level=theme&name=news', konum: [45.76, 4.84] },
  { ad: 'Al Jazeera', ulke: 'Katar', url: 'https://www.aljazeera.com/xml/rss/all.xml', konum: [25.29, 51.53] },
];

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (Jarvis RSS okuyucu)' },
  customFields: { item: [['media:content', 'mediaContent', { keepArray: true }], ['media:thumbnail', 'mediaThumbnail'], ['source', 'kaynakEtiketi']] },
});
const temizle = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const resim = (it: any): string | null => it.mediaContent?.find?.((m: any) => m?.$?.url)?.$?.url ?? it.mediaThumbnail?.$?.url ?? (it.enclosure?.url && /image/.test(it.enclosure.type || 'image') ? it.enclosure.url : null);

/** Testte sahte besleme verilir */
export const worldDeps = {
  rss: (url: string) => parser.parseURL(url),
  async chat(prompt: string): Promise<string> {
    if (MOCK) return '';
    const r = await routellm<ChatResponse>('/chat/completions', { model: CHAT_MODEL, messages: [{ role: 'user', content: prompt }] });
    return String(r.choices?.[0]?.message?.content ?? '');
  },
  /** Makale metni: MSN'deki haberler MSN içerik servisinden, diğerleri sayfadan (article.ts) */
  async metin(url: string): Promise<string | null> {
    const msn = /msn\.com\/.*\/ar-([A-Za-z0-9]+)/.exec(url)?.[1];
    if (!msn) return tamMetin(url);
    const r = await fetch(`https://assets.msn.com/content/view/v2/Detail/en-us/${msn}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const j = await r.json() as { body?: string };
    const m = temizle(j.body ?? '');
    return m.length > 200 ? m.slice(0, 6000) : null;
  },
  /** Bing News arama beslemesi (anahtarsız). Bağlantıdaki "url=" gerçek makale adresidir. */
  async bing(q: string): Promise<string> {
    const r = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en-US&cc=US`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(9000) });
    return r.ok ? r.text() : '';
  },
  /** Model var mı (yoksa eşleştirme ve karşılaştırma yapılmaz; dürüst "model-yok") */
  modelVar: () => !MOCK,
};

// ———————————————————— Beslemeler ————————————————————

let onbellek: { at: number; items: NewsItem[]; calisan: string[] } | null = null;
const ONBELLEK_MS = 15 * 60_000;

/** Dünya yayınlarının son haberleri (15 dk önbellek). Haber kimliği "w" ile başlar. */
export async function dunyaHaberleri(): Promise<{ items: NewsItem[]; calisan: string[] }> {
  if (onbellek && Date.now() - onbellek.at < ONBELLEK_MS) return onbellek;
  const sonuc = await Promise.allSettled(DUNYA_KAYNAKLARI.map(k => worldDeps.rss(k.url).then(f => ({ k, f }))));
  const items: NewsItem[] = [];
  const calisan: string[] = [];
  for (const r of sonuc) {
    if (r.status !== 'fulfilled') continue;
    const { k, f } = r.value;
    calisan.push(k.ad);
    for (const it of (f.items ?? []).slice(0, 40)) {
      const title = temizle(it.title);
      const url = (it.link || '').trim();
      if (!title || !url || items.some(x => x.url === url)) continue;
      items.push({ id: '', title, summary: temizle(it.contentSnippet || it.content || it.summary || '').slice(0, 400), category: 'dunya', source: k.ad, published_at: new Date(it.isoDate || it.pubDate || Date.now()).toISOString(), url, image_url: resim(it) });
    }
  }
  items.sort((a, b) => b.published_at.localeCompare(a.published_at));
  items.forEach((it, i) => (it.id = `w${i + 1}`));
  const sonucu = { at: Date.now(), items, calisan };
  if (calisan.length) onbellek = sonucu;
  return sonucu;
}

// ———————————————————— Google News arama ————————————————————

export interface GoogleHaber { baslik: string; kaynak: string; url: string; saat: string; dil: 'tr' | 'en' }

/** Google News arama beslemesi (anahtarsız). Başlıktaki " - Kaynak" eki ayrılır. Bağlantı Google'ın yönlendirmesidir. */
export async function googleHaber(q: string, dil: 'tr' | 'en', n = 60): Promise<GoogleHaber[]> {
  const yer = dil === 'tr' ? 'hl=tr&gl=TR&ceid=TR:tr' : 'hl=en-US&gl=US&ceid=US:en';
  const f = await worldDeps.rss(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${yer}`);
  const out: GoogleHaber[] = [];
  for (const it of (f.items ?? []).slice(0, n)) {
    const ham = temizle(it.title);
    const etiket = (it as any).kaynakEtiketi;
    const kaynak = temizle(typeof etiket === 'string' ? etiket : etiket?._ ?? '') || (/ - ([^-]+)$/.exec(ham)?.[1] ?? '').trim();
    const baslik = kaynak && ham.endsWith(` - ${kaynak}`) ? ham.slice(0, -(kaynak.length + 3)).trim() : ham;
    if (!baslik || !it.link) continue;
    out.push({ baslik, kaynak: kaynak || 'Google News', url: it.link, saat: new Date(it.isoDate || it.pubDate || Date.now()).toISOString(), dil });
  }
  return out.sort((a, b) => b.saat.localeCompare(a.saat));
}

/** Bing News'te İngilizce arama: gerçek makale adresleriyle (yayın adındaki " on MSN" eki atılır) */
export async function bingHaber(q: string, n = 30): Promise<NewsItem[]> {
  const xml = await worldDeps.bing(q);
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = m[1];
    const al = (etiket: string) => temizle((new RegExp(`<${etiket}>([\\s\\S]*?)</${etiket}>`, 'i').exec(x)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, ''));
    const link = al('link').replace(/&amp;/g, '&');
    let url = '';
    try { url = decodeURIComponent(/[?&]url=([^&]+)/.exec(link)?.[1] ?? ''); } catch { url = ''; }
    const title = al('title'), source = al('News:Source').replace(/\s+on MSN$/i, '');
    if (!url || !title || out.some(o => o.url === url)) continue;
    const t = new Date(al('pubDate'));
    out.push({ id: `b${out.length + 1}`, title, summary: al('description').slice(0, 400), category: 'dunya', source: source || alanAdiOf(url), published_at: (isNaN(t.getTime()) ? new Date() : t).toISOString(), url, image_url: null });
    if (out.length >= n) break;
  }
  return out;
}
const alanAdiOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Yaygın yayınların ülkesi (kartta gösterilir); bilinmeyen boş kalır */
const ULKE: [RegExp, string][] = [
  [/reuters|bbc|guardian|financial times|ft\.com|independent|sky news|telegraph|economist|times of london/i, 'İngiltere'],
  [/new york times|nytimes|washington post|wall street journal|wsj|cnn|cbs|nbc|abc news|npr|ap news|associated press|apnews|usa today|bloomberg|politico|axios|fox|newsday|yahoo|the hill|time/i, 'ABD'],
  [/\bdw\b|spiegel|deutsche welle|zeit|faz/i, 'Almanya'],
  [/france ?24|le monde|afp|rfi/i, 'Fransa'],
  [/euronews/i, 'AB'],
  [/al jazeera/i, 'Katar'],
  [/times of israel|jerusalem post|haaretz/i, 'İsrail'],
  [/times of india|ndtv|hindustan/i, 'Hindistan'],
  [/south china morning post|scmp/i, 'Hong Kong'],
  [/middle east eye|al-monitor|the national/i, 'Orta Doğu'],
];
const ulkeBul = (ad: string) => DUNYA_KAYNAKLARI.find(x => x.ad === ad)?.ulke ?? ULKE.find(([re]) => re.test(ad))?.[1] ?? '';

/** Olayı İngilizce haberlerde bulmak için arama sorgusu (model; yoksa boş) */
export const sorguIstemi = (baslik: string, ozet: string) =>
  `Bu Türkçe haberi İngilizce haberlerde bulmak için 3-6 kelimelik bir arama sorgusu yaz (özel adlar İngilizce yazımıyla, tırnak ve açıklama yok).\nBaşlık: ${baslik}${ozet ? `\nÖzet: ${ozet.slice(0, 240)}` : ''}\nYalnızca sorgu:`;

// ———————————————————— Eşleştirme ————————————————————

function jsonAl(s: string): any {
  const m = /\{[\s\S]*\}/.exec(String(s).replace(/```json|```/g, ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export const eslestirIstemi = (baslik: string, ozet: string, adaylar: NewsItem[]) =>
  `Türk basınında şu olay var: "${baslik}"${ozet ? `\nÖzet: ${ozet.slice(0, 300)}` : ''}
Aşağıda dünya basınının son başlıkları numaralı. AYNI OLAYI anlatanların numaralarını ver (yalnızca aynı olay; aynı ülke ya da konu yetmez).
Yalnızca JSON: {"esler": [3, 17]}
${adaylar.map((a, i) => `[${i}] ${a.source}: ${a.title}`).join('\n')}`;

/** Model cevabı → geçerli numaralar (aday sayısı içinde, tekil, en çok 8) ve sorgu */
export function eslesmeleriAyikla(text: string, n: number): { esler: number[]; sorgu: string } {
  const j = jsonAl(text);
  const esler = Array.isArray(j?.esler) ? [...new Set((j.esler as unknown[]).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < n))].slice(0, 8) : [];
  const sorgu = typeof j?.sorgu === 'string' ? j.sorgu.replace(/[^\p{L}\p{N} '"-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return { esler, sorgu };
}

// ———————————————————— Karşılaştırma ————————————————————

export interface DunyaAlinti { kaynak: string; metin: string; ceviri?: string }
export interface DunyaYayin { kaynak: string; ulke: string; baslik: string; baslikTr: string | null; url: string; saat: string; vurgu: string | null; alinti: DunyaAlinti | null; tam: boolean }
export interface DunyaMadde { baslik: string; tr: DunyaAlinti | null; en: DunyaAlinti | null }
export interface DunyaBasini {
  durum: 'bulundu' | 'yok' | 'model-yok';
  taranan: { yayin: number; haber: number; google: number };
  yayinlar: DunyaYayin[];
  /** Google News'te bulunan diğer yayınlar (yalnızca başlık; metin okunmadı) */
  basliklar: { kaynak: string; baslik: string; url: string; saat: string }[];
  ortak: DunyaMadde[];
  cerceve: DunyaMadde[];
  yalnizDunya: DunyaMadde[];
  yalnizTurk: DunyaMadde[];
  sorgu: string;
  at: string;
}

export const karsilastirIstemi = (baslik: string, tr: KaynakMetin[], en: { kaynak: string; metin: string }[]) =>
  `Aynı olayı Türk basını ve dünya basını nasıl verdi? Olay: "${baslik}".
Görevin TARAFSIZ bir karşılaştırma: yorum yapma, taraf tutma, hiçbir yayını ya da kişiyi değerlendirme.
"Propaganda", "yalan", "manipülasyon", "taraflı", "doğru/yanlış söylüyor" gibi ifadeler YASAK. Metinlerde olmayan bilgi ekleme.
Her "alinti" ilgili yayının metninden BİREBİR (kendi dilinde, değiştirmeden) kopyalanmış 8-220 karakterlik bir parça olmalı.
İngilizce alıntıların "ceviri" alanına sadık bir Türkçe çevirisini yaz. Açıklamalar Türkçe, kısa ve olgusal.
Yalnızca şu JSON:
{
 "yayinlar": [{"kaynak": "dünya yayınının adı", "baslik_tr": "başlığın Türkçe çevirisi", "vurgu": "bu yayının haberde öne çıkardığı olgu (tek kısa cümle)", "alinti": "birebir", "ceviri": "..."}],
 "ortak": [{"bilgi": "iki tarafta da geçen olgu", "tr": {"kaynak": "", "alinti": ""}, "en": {"kaynak": "", "alinti": "", "ceviri": ""}}],
 "cerceve": [{"konu": "aynı olgunun iki tarafta farklı ifade edilişi", "tr": {"kaynak": "", "alinti": ""}, "en": {"kaynak": "", "alinti": "", "ceviri": ""}}],
 "yalniz_dunya": [{"bilgi": "yalnızca dünya basınında geçen bilgi", "en": {"kaynak": "", "alinti": "", "ceviri": ""}}],
 "yalniz_turk": [{"bilgi": "yalnızca Türk basınında geçen bilgi", "tr": {"kaynak": "", "alinti": ""}}]
}
Her listede en fazla 3 madde ("yayinlar" her dünya yayını için bir).

## TÜRK BASINI
${tr.map(k => `### ${k.kaynak}\n${k.metin.slice(0, 1200)}`).join('\n\n')}

## DÜNYA BASINI
${en.map(k => `### ${k.kaynak}\n${k.metin.slice(0, 1600)}`).join('\n\n')}`;

/** Alıntı kendi yayınının metninde birebir geçiyorsa; çeviri değerlendirici dil taşıyorsa atılır */
function alintiAl(x: any, metinler: Map<string, string>): DunyaAlinti | null {
  if (!x || typeof x !== 'object') return null;
  const kaynak = String(x.kaynak ?? ''), metin = String(x.alinti ?? '').trim();
  const govde = metinler.get(kaynak);
  if (!govde || metin.length > 260 || !birebir(metin, govde)) return null;
  const ceviri = typeof x.ceviri === 'string' && x.ceviri.trim() && temizMi(x.ceviri) ? x.ceviri.trim().slice(0, 300) : undefined;
  return { kaynak, metin, ...(ceviri ? { ceviri } : {}) };
}

/** Model cevabını süz: alıntılar birebir, açıklamalar tarafsız; geçmeyen madde atılır */
export function karsilastirmaSuz(ham: any, tr: KaynakMetin[], en: { kaynak: string; metin: string }[]) {
  const trM = new Map(tr.map(k => [k.kaynak, k.metin]));
  const enM = new Map(en.map(k => [k.kaynak, k.metin]));
  const metin = (s: unknown, n = 200) => (typeof s === 'string' && s.trim() && temizMi(s) ? s.trim().slice(0, n) : null);
  const liste = (x: unknown) => (Array.isArray(x) ? x.slice(0, 3) : []);
  const ortak = liste(ham?.ortak).map((m: any) => ({ baslik: metin(m?.bilgi), tr: alintiAl(m?.tr, trM), en: alintiAl(m?.en, enM) })).filter((m: any) => m.baslik && m.tr && m.en) as DunyaMadde[];
  const cerceve = liste(ham?.cerceve).map((m: any) => ({ baslik: metin(m?.konu), tr: alintiAl(m?.tr, trM), en: alintiAl(m?.en, enM) })).filter((m: any) => m.baslik && m.tr && m.en) as DunyaMadde[];
  const yalnizDunya = liste(ham?.yalniz_dunya).map((m: any) => ({ baslik: metin(m?.bilgi), tr: null, en: alintiAl(m?.en, enM) })).filter((m: any) => m.baslik && m.en) as DunyaMadde[];
  const yalnizTurk = liste(ham?.yalniz_turk).map((m: any) => ({ baslik: metin(m?.bilgi), tr: alintiAl(m?.tr, trM), en: null })).filter((m: any) => m.baslik && m.tr) as DunyaMadde[];
  const yayin = new Map<string, { baslikTr: string | null; vurgu: string | null; alinti: DunyaAlinti | null }>();
  for (const y of Array.isArray(ham?.yayinlar) ? ham.yayinlar : []) {
    const k = String(y?.kaynak ?? '');
    if (!enM.has(k) || yayin.has(k)) continue;
    yayin.set(k, { baslikTr: metin(y?.baslik_tr, 220), vurgu: metin(y?.vurgu, 220), alinti: alintiAl({ kaynak: k, alinti: y?.alinti, ceviri: y?.ceviri }, enM) });
  }
  return { ortak, cerceve, yalnizDunya, yalnizTurk, yayin };
}

const sonuclar = new Map<string, { at: number; p: Promise<DunyaBasini> }>();
const SONUC_MS = 3 * 3600_000;

/**
 * Kümenin dünya basınındaki karşılığı. tr: Türk basınının metinleri (analizden). Sonuç 3 saat bellekte tutulur.
 */
export function dunyaBasini(k: Kume, tr: KaynakMetin[]): Promise<DunyaBasini> {
  const v = sonuclar.get(k.id);
  if (v && Date.now() - v.at < SONUC_MS) return v.p;
  const p = hesapla(k, tr).catch(e => { sonuclar.delete(k.id); throw e; });
  sonuclar.set(k.id, { at: Date.now(), p });
  return p;
}

async function hesapla(k: Kume, tr: KaynakMetin[]): Promise<DunyaBasini> {
  const bos = (durum: DunyaBasini['durum'], taranan: DunyaBasini['taranan'], sorgu = ''): DunyaBasini =>
    ({ durum, taranan, yayinlar: [], basliklar: [], ortak: [], cerceve: [], yalnizDunya: [], yalnizTurk: [], sorgu, at: new Date().toISOString() });
  const { items, calisan } = await dunyaHaberleri();
  // Olayın saatine göre ±4 gün içindeki dünya başlıkları (en yeniler)
  const t = new Date(k.son).getTime();
  const besleme = items.filter(i => Math.abs(new Date(i.published_at).getTime() - t) < 4 * 86400_000).slice(0, 160);
  const taranan = { yayin: calisan.length, haber: besleme.length, google: 0 };
  if (!worldDeps.modelVar()) return bos('model-yok', taranan);
  const ozet = tr[0]?.ilkCumle ?? k.haberler[0]?.summary ?? '';
  // 1) İngilizce sorgu → Bing News (gerçek adresler) ve Google News (başlık düzeyi)
  const sorgu = (await worldDeps.chat(sorguIstemi(k.baslik, ozet)).catch(() => '')).replace(/["“”]/g, '').split('\n')[0].replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const [bing, google] = sorgu ? await Promise.all([bingHaber(sorgu, 30).catch(() => []), googleHaber(sorgu, 'en', 40).catch(() => [])]) : [[], []];
  taranan.google = google.length;
  // 2) Adaylar: Bing sonuçları ve beslemeler (aynı adres bir kez); model aynı olayı anlatanları seçer
  const adaylar = [...bing, ...besleme].filter((a, i, l) => l.findIndex(x => x.url === a.url) === i).slice(0, 220);
  taranan.yayin = new Set(adaylar.map(a => a.source)).size;
  taranan.haber = adaylar.length;
  const { esler } = eslesmeleriAyikla(await worldDeps.chat(eslestirIstemi(k.baslik, ozet, adaylar)), adaylar.length);
  // Yayın başına bir haber
  const secili = new Map<string, NewsItem>();
  for (const i of esler) { const a = adaylar[i]; if (!secili.has(a.source)) secili.set(a.source, a); }
  // 3) Metinler: eşleşenlerin hepsi denenir, metni okunabilenler öne alınır (en çok 6)
  const denenen = await Promise.all([...secili.values()].slice(0, 10).map(async y => {
    const m = await worldDeps.metin(y.url).catch(() => null);
    const tam = !!m && m.length > 400;
    return { y, tam, metin: tam ? `${y.title}. ${m}` : `${y.title}. ${y.summary}` };
  }));
  const secilen = [...denenen.filter(d => d.tam), ...denenen.filter(d => !d.tam)].slice(0, 6);
  const yayinlar = secilen.map(d => d.y);
  const metinler = secilen.map(d => ({ kaynak: d.y.source, metin: d.metin, tam: d.tam }));
  const ad = new Set(yayinlar.map(y => y.source.toLowerCase()));
  const basliklar = google.filter(g => ![...ad].some(a => g.kaynak.toLowerCase().includes(a) || a.includes(g.kaynak.toLowerCase())))
    .filter((g, i, l) => l.findIndex(x => x.kaynak === g.kaynak) === i).slice(0, 12)
    .map(g => ({ kaynak: g.kaynak, baslik: g.baslik, url: g.url, saat: g.saat }));
  if (!yayinlar.length) return { ...bos(basliklar.length ? 'bulundu' : 'yok', taranan, sorgu), basliklar };
  let ham: any = null;
  try { ham = jsonAl(await worldDeps.chat(karsilastirIstemi(k.baslik, tr.slice(0, 4), metinler))); } catch (e) { console.warn('Dünya basını (model):', e instanceof Error ? e.message : e); }
  const s = karsilastirmaSuz(ham, tr, metinler);
  console.log(`[haber] dünya basını · "${sorgu}" · ${adaylar.length} aday · ${yayinlar.length} eşleşti (${metinler.filter(m => m.tam).length} tam metin)`);
  return {
    durum: 'bulundu', taranan, sorgu, basliklar, ortak: s.ortak, cerceve: s.cerceve, yalnizDunya: s.yalnizDunya, yalnizTurk: s.yalnizTurk, at: new Date().toISOString(),
    yayinlar: yayinlar.map((y, i) => ({
      kaynak: y.source, ulke: ulkeBul(y.source), baslik: y.title, url: y.url, saat: y.published_at, tam: metinler[i].tam,
      baslikTr: s.yayin.get(y.source)?.baslikTr ?? null, vurgu: s.yayin.get(y.source)?.vurgu ?? null,
      // Model alıntı vermediyse metnin ilk cümlesi (birebir, çevirisiz)
      alinti: s.yayin.get(y.source)?.alinti ?? { kaynak: y.source, metin: cumleler(metinler[i].metin)[1]?.slice(0, 220) ?? y.summary.slice(0, 220) },
    })),
  };
}
