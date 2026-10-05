// wiki_lookup: Türkçe Wikipedia (bulunamazsa İngilizce) özeti, lisanslı fotoğraf ve koordinat.
// Kişi/yer/kurum sorularında gerçek fotoğraf gösterilir; sayı görselleri özet metniyle doğrulanır.

const UA = { 'User-Agent': 'JarvisAsistan/1.0 (kisisel kullanim)' };
const TIMEOUT = 8000;

export interface WikiPhoto { url: string; lisans: string; yazar: string; dosya: string }
export interface WikiResult {
  baslik: string;
  dil: 'tr' | 'en';
  aciklama: string;
  ozet: string;
  sayfa: string;
  foto: WikiPhoto | null;
  koordinat: { lat: number; lon: number } | null;
}

const cache = new Map<string, WikiResult | null>();
/** Bu süreçte bulunan sonuçlar: fotoğraf zinciri ve kisi_yer kartı buradan okur (modelin URL yazması gerekmez). */
export const wikiByTitle = new Map<string, WikiResult>();

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function getJson(url: string): Promise<any | null> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Wikipedia HTTP ${r.status}`);
  return r.json();
}

/** Başlık tam tutmazsa arama ile en yakın sayfayı bulur. */
async function resolveTitle(lang: string, q: string): Promise<string | null> {
  const s = await getJson(`https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=1`);
  return s?.pages?.[0]?.key ?? null;
}

/** Fotoğrafın lisansı ve yazarı (Commons ya da yerel vikide). */
async function photoInfo(lang: string, thumb: string): Promise<WikiPhoto | null> {
  // .../wikipedia/commons/thumb/2/28/Dosya_adi.jpg/330px-Dosya_adi.jpg → "Dosya_adi.jpg"
  const m = /\/wikipedia\/(commons|[a-z]+)\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//.exec(thumb);
  if (!m) return null;
  const host = m[1] === 'commons' ? 'commons.wikimedia.org' : `${lang}.wikipedia.org`;
  const file = decodeURIComponent(m[2]);
  const j = await getJson(`https://${host}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName|Artist&titles=${encodeURIComponent('File:' + file)}`).catch(() => null);
  const meta = j ? (Object.values(j.query?.pages ?? {})[0] as any)?.imageinfo?.[0]?.extmetadata : null;
  const lisans = strip(meta?.LicenseShortName?.value ?? '');
  if (!lisans) return null; // lisansı bilinmeyen fotoğrafı göstermiyoruz
  // Daha net bir boyut (Wikimedia standart küçük resim boyutu), izleme parametreleri atılır.
  const url = thumb.split('?')[0].replace(/\/\d+px-/, '/960px-');
  return { url, lisans, yazar: strip(meta?.Artist?.value ?? '').slice(0, 80) || 'Wikimedia', dosya: file };
}

async function summary(lang: 'tr' | 'en', q: string): Promise<WikiResult | null> {
  let s = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.replace(/ /g, '_'))}`);
  if (!s || s.type === 'disambiguation') {
    const key = await resolveTitle(lang, q);
    if (!key) return null;
    s = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`);
    if (!s || s.type === 'disambiguation') return null;
  }
  const thumb: string | undefined = s.thumbnail?.source;
  return {
    baslik: s.title,
    dil: lang,
    aciklama: s.description ?? '',
    ozet: s.extract ?? '',
    sayfa: s.content_urls?.desktop?.page ?? '',
    foto: thumb ? await photoInfo(lang, thumb) : null,
    koordinat: typeof s.coordinates?.lat === 'number' ? { lat: s.coordinates.lat, lon: s.coordinates.lon } : null,
  };
}

export async function wikiLookup(baslik: string): Promise<WikiResult | null> {
  const q = baslik.trim();
  if (!q) return null;
  if (cache.has(q)) return cache.get(q)!;
  const r = (await summary('tr', q).catch(() => null)) ?? (await summary('en', q).catch(() => null));
  cache.set(q, r);
  if (r) {
    wikiByTitle.set(r.baslik.toLocaleLowerCase('tr'), r);
    wikiByTitle.set(q.toLocaleLowerCase('tr'), r);
  }
  return r;
}

export const findWiki = (title: string | undefined) => (title ? wikiByTitle.get(title.trim().toLocaleLowerCase('tr')) : undefined);
