import { generateImage } from './imagegen.js';
import type { NewsItem, Photo } from './types.js';
import type { WikiResult } from './wiki.js';

export type PhotoMode = 'haber' | 'video';

// Proxy yalnızca haberlerden gelen bilinen fotoğraf adreslerini sunar (açık proxy olmasın).
export const knownImageUrls = new Set<string>();

const stockCache = new Map<string, Photo | null>();

async function searchStock(query: string): Promise<Photo | null> {
  if (stockCache.has(query)) return stockCache.get(query)!;
  let photo: Photo | null = null;
  try {
    if (process.env.PEXELS_API_KEY) {
      const r = await fetch(`https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=${encodeURIComponent(query)}`, {
        headers: { Authorization: process.env.PEXELS_API_KEY },
        signal: AbortSignal.timeout(6000),
      });
      const j: any = await r.json();
      const p = j.photos?.[0];
      if (p) photo = { url: p.src.large2x || p.src.large, credit: `${p.photographer} · Pexels`, kind: 'stok' };
    } else if (process.env.UNSPLASH_ACCESS_KEY) {
      const r = await fetch(`https://api.unsplash.com/search/photos?per_page=1&orientation=landscape&query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
        signal: AbortSignal.timeout(6000),
      });
      const j: any = await r.json();
      const p = j.results?.[0];
      if (p) photo = { url: p.urls.regular, credit: `${p.user?.name} · Unsplash`, kind: 'stok' };
    }
  } catch {
    photo = null;
  }
  stockCache.set(query, photo);
  return photo;
}

export interface PhotoContext {
  mode: PhotoMode;
  news?: NewsItem;
  query?: string;
  wiki?: WikiResult;
  /** Yalnızca sembolik sahneler (ikon/kart/adımlar/liste, haber ya da gerçek varlık değil) yapay zeka görseli alabilir. */
  symbolic: boolean;
}

/**
 * Fotoğraf zincirinin hızlı adımları:
 * 1) haberin kendi fotoğrafı (haber modu) · 2) Wikimedia (lisanslı, gerçek varlıklar) · 3) Pexels/Unsplash stok
 */
export async function resolveFastPhoto(c: PhotoContext): Promise<Photo | null> {
  if (c.mode === 'haber' && c.news?.image_url) {
    knownImageUrls.add(c.news.image_url);
    return { url: `/api/img?u=${encodeURIComponent(c.news.image_url)}`, credit: c.news.source, kind: 'haber' };
  }
  if (c.wiki?.foto) return { url: c.wiki.foto.url, credit: `Wikimedia · ${c.wiki.foto.lisans} · ${c.wiki.foto.yazar}`, kind: 'wiki' };
  if (c.query) return searchStock(c.query);
  return null;
}

/**
 * Yavaş adım (≈8 sn): RouteLLM görsel modeliyle TEMSİLİ görsel. Yalnızca sembolik sahneler; gerçek kişi/olay asla.
 * Hiçbiri yoksa null: istemci sahnenin ikon görselini gösterir (4. adım).
 */
export async function resolveSlowPhoto(c: PhotoContext): Promise<Photo | null> {
  if (!c.symbolic || !c.query || c.news || c.wiki) return null;
  return generateImage(c.query);
}
