import Parser from 'rss-parser';
import type { NewsItem } from './types.js';

// Kaynak listesi tek dosyada: newsSources.ts (elle düzenlenir)
import { FEEDS, type Kategori } from './newsSources.js';
export { FEEDS };

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (Jarvis RSS okuyucu)' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
    ],
  },
});

/**
 * "gundem" beslemelerindeki haberin kategorisi: bağlantı adresindeki bölüm adından ("/ekonomi/", "/dunya-haberleri/").
 * Bulunamazsa beslemenin kategorisi kalır.
 */
export function kategoriTahmin(url: string, besleme: Kategori): Kategori {
  if (besleme !== 'gundem') return besleme;
  const yol = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ''; } })();
  if (/\/(ekonomi|finans|piyasa|borsa|para)\b|ekonomi-haber/.test(yol)) return 'ekonomi';
  if (/\/(dunya|world)\b|dunya-haber/.test(yol)) return 'dunya';
  if (/\/(spor|futbol|basketbol)\b|spor-haber/.test(yol)) return 'spor';
  if (/\/(teknoloji|bilim-teknoloji|tekno)\b|teknoloji-haber/.test(yol)) return 'teknoloji';
  if (/\/(bilim|saglik|uzay)\b|saglik-haber|bilim-haber/.test(yol)) return 'bilim';
  return 'gundem';
}

/** Son taramada her kaynağın baş haberi (ilk beslemesinin ilk haberi; çoğu sitede ana sayfa manşeti) */
let mansetler = new Map<string, NewsItem>();
export const kaynakMansetleri = () => mansetler;

/** Tazelenen tarama dinleyicileri (haber arşivi) */
const dinleyiciler: ((items: NewsItem[]) => void)[] = [];
export const onNewsRefresh = (f: (items: NewsItem[]) => void) => { dinleyiciler.push(f); };

/** Kaynak bazında son tarama: o kaynağın en az bir beslemesi cevap verdi mi, kaç haber geldi */
export interface SourceStatus { name: string; ok: boolean; count: number }
let cache: { at: number; items: NewsItem[]; scanned: number; sources: SourceStatus[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

function stripHtml(s = ''): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function pickImage(it: any): string | null {
  const mc = it.mediaContent?.find?.((m: any) => m?.$?.url)?.$?.url;
  if (mc) return mc;
  if (it.mediaThumbnail?.$?.url) return it.mediaThumbnail.$.url;
  if (it.enclosure?.url && /image/.test(it.enclosure.type || 'image')) return it.enclosure.url;
  const html = it['content:encoded'] || it.content || '';
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m ? m[1] : null;
}

const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9 ]/g, '').split(' ').filter(w => w.length > 3);
function similar(a: string, b: string): boolean {
  const A = new Set(norm(a)), B = norm(b);
  if (!A.size || !B.length) return false;
  const hit = B.filter(w => A.has(w)).length;
  return hit / Math.min(A.size, B.length) >= 0.6;
}

let tazeleniyor: Promise<{ items: NewsItem[]; scanned: number; sources: SourceStatus[] }> | null = null;

/** Önbellek süresi dolduysa eskisi hemen verilir, tarama arka planda tazelenir (bekleyen ekran olmasın) */
async function fetchAll(): Promise<{ items: NewsItem[]; scanned: number; sources: SourceStatus[] }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  tazeleniyor ??= tara().finally(() => { tazeleniyor = null; });
  // Çok eski (1 saatten fazla) önbellek verilmez: tazesi beklenir
  if (cache && Date.now() - cache.at < 6 * CACHE_MS) return cache;
  return tazeleniyor;
}

async function tara(): Promise<{ items: NewsItem[]; scanned: number; sources: SourceStatus[] }> {
  const results = await Promise.allSettled(FEEDS.map(f => parser.parseURL(f.url).then(feed => ({ f, feed }))));
  const items: NewsItem[] = [];
  // Kaynağın baş haberi: listedeki ilk beslemesinin (gündem/manşet) ilk haberi (basın özeti)
  const onde = new Map<string, NewsItem>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { f, feed } = r.value;
    for (const [sira, it] of feed.items.slice(0, 25).entries()) {
      const title = stripHtml(it.title);
      if (!title) continue;
      // Aynı kaynağın iki beslemesinde (gündem + ekonomi) aynı haber: bir kez
      const link = (it.link || '').trim();
      if (link && items.some(x => x.url === link)) continue;
      items.push({
        id: '',
        title,
        summary: stripHtml(it.contentSnippet || it.content || it.summary || '').slice(0, 400),
        category: kategoriTahmin(link, f.category),
        source: f.source,
        published_at: new Date(it.isoDate || it.pubDate || Date.now()).toISOString(),
        url: link,
        image_url: pickImage(it),
      });
      if (sira === 0 && !onde.has(f.source) && FEEDS.find(x => x.source === f.source) === f) onde.set(f.source, items[items.length - 1]);
    }
  }
  items.sort((a, b) => b.published_at.localeCompare(a.published_at));
  items.forEach((it, i) => (it.id = 'n' + (i + 1)));
  const scanned = new Set(results.map((r, i) => (r.status === 'fulfilled' ? FEEDS[i].source : null)).filter(Boolean)).size;
  const sources: SourceStatus[] = [...new Set(FEEDS.map(f => f.source))].map(name => ({
    name,
    ok: results.some((r, i) => FEEDS[i].source === name && r.status === 'fulfilled'),
    count: items.filter(it => it.source === name).length,
  }));
  // Hiçbir kaynak cevap vermediyse (internet yok) boş sonucu önbelleğe alma; bir sonraki istekte tekrar dene.
  if (scanned === 0) return { items, scanned, sources };
  mansetler = onde;
  cache = { at: Date.now(), items, scanned, sources };
  for (const f of dinleyiciler) { try { f(items); } catch (e) { console.warn('Haber dinleyicisi:', e); } }
  return cache;
}

/** Toplam (farklı) kaynak sayısı: pano "6/8 kaynak" gösterirken kullanır. */
export const SOURCE_COUNT = new Set(FEEDS.map(f => f.source)).size;

/** Son taramanın özeti; tarama hiç yapılmadıysa null (çekme yapmaz). */
export function newsCacheStats(): { scanned: number; at: number; items: number } | null {
  return cache ? { scanned: cache.scanned, at: cache.at, items: cache.items.length } : null;
}

/** Pano için önbellekteki ham haber listesi (10 dk önbellek; boşsa çeker). */
export function newsSnapshot(): Promise<{ items: NewsItem[]; scanned: number; sources: SourceStatus[] }> {
  return fetchAll();
}

export interface GetNewsArgs {
  categories?: string[];
  exclude_categories?: string[];
  since_hours?: number;
  limit?: number;
}

export async function getNews(args: GetNewsArgs = {}) {
  const { items, scanned } = await fetchAll();
  const since = Date.now() - (args.since_hours ?? 18) * 3600_000;
  const limit = Math.min(args.limit ?? 30, 50);
  const filtered = items.filter(it => {
    if (new Date(it.published_at).getTime() < since) return false;
    if (args.categories?.length && !args.categories.includes(it.category)) return false;
    if (args.exclude_categories?.includes(it.category)) return false;
    return true;
  });
  // Aynı olayı anlatan haberleri grupla: modele "diğer kaynaklar" bilgisi ver.
  const out: (NewsItem & { other_sources: string[] })[] = [];
  for (const it of filtered) {
    const dup = out.find(o => similar(o.title, it.title));
    if (dup) {
      if (dup.source !== it.source && !dup.other_sources.includes(it.source)) dup.other_sources.push(it.source);
      if (!dup.image_url && it.image_url) dup.image_url = it.image_url;
      continue;
    }
    out.push({ ...it, other_sources: [] });
    if (out.length >= limit) break;
  }
  return { fetched_at: new Date().toISOString(), sources_scanned: scanned, items: out };
}

export function findNewsById(id: string): NewsItem | undefined {
  return cache?.items.find(i => i.id === id);
}

// Test ve demo için
export function __setCacheForTest(items: NewsItem[]) {
  const names = [...new Set(items.map(i => i.source))];
  cache = { at: Date.now(), items, scanned: names.length, sources: names.map(name => ({ name, ok: true, count: items.filter(i => i.source === name).length })) };
}
