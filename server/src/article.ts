// Haber Modu · haberin tam metni. Kart açılınca o kümenin haber sayfaları çekilir, ana metin çıkarılır.
// Sıra: 1) sayfadaki yapılandırılmış veri (JSON-LD "articleBody"; Türk haber sitelerinin çoğunda var)
// 2) <article> içindeki paragraflar 3) sayfadaki uzun paragraflar. Bulunamazsa null: RSS özeti kullanılır.
// Metin yalnızca karşılaştırma ve doğrulama için kullanılır; ekranda kısa alıntılar gösterilir.

const MAX_HTML = 2_500_000;
const MAX_METIN = 6000;
const cache = new Map<string, Promise<string | null>>();

const ENT: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ndash: '–', mdash: '—' };
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

const REKLAM = /çerez|cookie|abone ol|tüm hakları|copyright|google (news|haberler|algoritma)|tıkla ve|whatsapp|bildirimleri aç|haberin devamı|takip edin|reklam/i;
const temiz = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** JSON-LD içinden articleBody (NewsArticle / Article) */
function jsonLd(html: string): string | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let j: unknown;
    try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const yigin: unknown[] = [j];
    while (yigin.length) {
      const x = yigin.pop();
      if (Array.isArray(x)) { yigin.push(...x); continue; }
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        if (typeof o.articleBody === 'string' && o.articleBody.length > 200) return temiz(o.articleBody).split(/(?<=[.!?…])\s+/).filter(c => !REKLAM.test(c)).join(' ');
        if (o['@graph']) yigin.push(o['@graph']);
      }
    }
  }
  return null;
}

/** Paragraflardan ana metin: önce <article> içi, yoksa sayfadaki 60+ karakterlik paragraflar */
function paragraflar(html: string): string | null {
  const govde = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const art = /<article[\s\S]*?<\/article>/i.exec(govde)?.[0] ?? /<main[\s\S]*?<\/main>/i.exec(govde)?.[0] ?? govde;
  // Menü, reklam ve abonelik satırları: cümle noktalaması olmayan ya da tanıtım kalıbı taşıyan paragraflar atlanır
  const ps = [...art.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => temiz(m[1]))
    .filter(p => p.length >= 60 && /[.!?…"”]/.test(p) && !REKLAM.test(p));
  const metin = ps.join(' ');
  return metin.length > 200 ? metin : null;
}

export function anaMetin(html: string): string | null {
  const m = jsonLd(html) ?? paragraflar(html);
  return m ? m.slice(0, MAX_METIN) : null;
}

/** Testte sahte sayfa verilir */
export const articleDeps = {
  async fetchHtml(url: string): Promise<string | null> {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'Accept-Language': 'tr-TR,tr;q=0.9' },
      signal: AbortSignal.timeout(9000),
      redirect: 'follow',
    });
    if (!r.ok || !/html/.test(r.headers.get('content-type') || 'text/html')) return null;
    const t = await r.text();
    return t.length > MAX_HTML ? t.slice(0, MAX_HTML) : t;
  },
};

/** Haberin tam metni (önbellekli). Çekilemezse null. */
export function tamMetin(url: string): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = articleDeps.fetchHtml(url).then(h => (h ? anaMetin(h) : null)).catch(() => null);
    cache.set(url, p);
    if (cache.size > 600) cache.delete(cache.keys().next().value!);
  }
  return p;
}
