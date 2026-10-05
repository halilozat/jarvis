import Parser from 'rss-parser';
import type { NewsItem } from './types.js';

// Farklı yayın çizgilerinden kaynaklar. URL'ler değişebilir; `npm run test` hangilerinin çalıştığını gösterir.
export const FEEDS: { source: string; url: string; category: string }[] = [
  { source: 'BBC Türkçe', url: 'https://feeds.bbci.co.uk/turkce/rss.xml', category: 'gundem' },
  { source: 'DW Türkçe', url: 'https://rss.dw.com/rdf/rss-tur-all', category: 'gundem' },
  { source: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', category: 'gundem' },
  { source: 'TRT Haber', url: 'https://www.trthaber.com/manset_articles.rss', category: 'gundem' },
  { source: 'NTV', url: 'https://www.ntv.com.tr/gundem.rss', category: 'gundem' },
  { source: 'NTV', url: 'https://www.ntv.com.tr/ekonomi.rss', category: 'ekonomi' },
  { source: 'NTV', url: 'https://www.ntv.com.tr/teknoloji.rss', category: 'teknoloji' },
  { source: 'NTV', url: 'https://www.ntv.com.tr/spor.rss', category: 'spor' },
  { source: 'NTV', url: 'https://www.ntv.com.tr/dunya.rss', category: 'dunya' },
  { source: 'NTV', url: 'https://www.ntv.com.tr/saglik.rss', category: 'saglik' },
  { source: 'T24', url: 'https://t24.com.tr/rss', category: 'gundem' },
  { source: 'Sözcü', url: 'https://www.sozcu.com.tr/feeds-rss-category-gundem', category: 'gundem' },
  { source: 'Cumhuriyet', url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml', category: 'gundem' },
  { source: 'Sabah', url: 'https://www.sabah.com.tr/rss/gundem.xml', category: 'gundem' },
  { source: 'Sabah', url: 'https://www.sabah.com.tr/rss/ekonomi.xml', category: 'ekonomi' },
];

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

let cache: { at: number; items: NewsItem[]; scanned: number } | null = null;
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

async function fetchAll(): Promise<{ items: NewsItem[]; scanned: number }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const results = await Promise.allSettled(FEEDS.map(f => parser.parseURL(f.url).then(feed => ({ f, feed }))));
  const items: NewsItem[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { f, feed } = r.value;
    for (const it of feed.items.slice(0, 15)) {
      const title = stripHtml(it.title);
      if (!title) continue;
      items.push({
        id: '',
        title,
        summary: stripHtml(it.contentSnippet || it.content || it.summary || '').slice(0, 400),
        category: f.category,
        source: f.source,
        published_at: new Date(it.isoDate || it.pubDate || Date.now()).toISOString(),
        url: it.link || '',
        image_url: pickImage(it),
      });
    }
  }
  items.sort((a, b) => b.published_at.localeCompare(a.published_at));
  items.forEach((it, i) => (it.id = 'n' + (i + 1)));
  const scanned = new Set(results.map((r, i) => (r.status === 'fulfilled' ? FEEDS[i].source : null)).filter(Boolean)).size;
  // Hiçbir kaynak cevap vermediyse (internet yok) boş sonucu önbelleğe alma; bir sonraki istekte tekrar dene.
  if (scanned === 0) return { items, scanned };
  cache = { at: Date.now(), items, scanned };
  return cache;
}

/** Toplam (farklı) kaynak sayısı: pano "6/8 kaynak" gösterirken kullanır. */
export const SOURCE_COUNT = new Set(FEEDS.map(f => f.source)).size;

/** Son taramanın özeti; tarama hiç yapılmadıysa null (çekme yapmaz). */
export function newsCacheStats(): { scanned: number; at: number; items: number } | null {
  return cache ? { scanned: cache.scanned, at: cache.at, items: cache.items.length } : null;
}

/** Pano için önbellekteki ham haber listesi (10 dk önbellek; boşsa çeker). */
export function newsSnapshot(): Promise<{ items: NewsItem[]; scanned: number }> {
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
  cache = { at: Date.now(), items, scanned: new Set(items.map(i => i.source)).size };
}
