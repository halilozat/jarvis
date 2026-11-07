// Bekçi · link katmanı: çıkarma, normalleştirme, kayıtlı alan adı (Public Suffix List · tldts), homograf/punycode,
// görünen metin ↔ href farkı, kısaltılmış linklerin güvenli çözülmesi (çerezsiz, JS yok, gövde yok, özel ağa gitmez).
import dns from 'node:dns/promises';
import net from 'node:net';
import { domainToUnicode } from 'node:url';
import { parse as tldParse } from 'tldts';

export interface Link {
  /** Metinde görüldüğü gibi (şemasız olabilir) */
  ham: string;
  /** https:// eklenmiş, sondaki noktalama temizlenmiş */
  url: string;
  host: string;
  /** Kayıtlı alan adı (eTLD+1), IP ise IP */
  alan: string;
  ip: boolean;
  /** Unicode hâli (punycode ise) */
  unicode: string;
  /** E-postada <a> etiketinin görünen metni */
  gorunen?: string;
  /** QR koddan geldi */
  qr?: boolean;
}

const SON_NOKTALAMA = /[.,;:!?)\]}'"»”’…]+$/;

/** Metinden linkler: şemalı, www. ile başlayan ve şemasız (ptt-ornek.xyz/odeme) alan adları */
export function linkleriCikar(metin: string): Link[] {
  const out: Link[] = [];
  const gor = new Set<string>();
  const re = /\b(?:https?:\/\/[^\s<>"'`]+|(?:www\.)?(?:[a-z0-9¡-￿](?:[a-z0-9¡-￿-]{0,61}[a-z0-9¡-￿])?\.)+(?:xn--[a-z0-9-]{2,59}|[a-z¡-￿]{2,24})(?::\d{2,5})?(?:[/?#][^\s<>"'`]*)?)/giu;
  for (const m of metin.matchAll(re)) {
    const once = metin[m.index! - 1];
    if (once === '@' || once === '.' || /[\w-]/.test(once ?? '')) continue; // e-posta ya da kelime içi
    const ham = m[0].replace(SON_NOKTALAMA, '');
    const l = linkKur(ham);
    if (!l || gor.has(l.url)) continue;
    // Şemasız ve bilinmeyen uzantılı ("v1.2", "örn.vb") alan adı değildir
    if (!/^https?:\/\//i.test(ham) && !l.ip && !tldParse(l.host).isIcann) continue;
    gor.add(l.url);
    out.push(l);
  }
  return out;
}

export function linkKur(ham: string, gorunen?: string): Link | null {
  const url = /^https?:\/\//i.test(ham) ? ham : `https://${ham}`;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/\.$/, '').toLowerCase();
  const ip = net.isIP(host.replace(/^\[|\]$/g, '')) !== 0;
  const p = tldParse(host);
  const alan = ip ? host : p.domain ?? host;
  return { ham, url: u.toString(), host, alan, ip, unicode: domainToUnicode(host) || host, ...(gorunen ? { gorunen } : {}) };
}

/** HTML gövdeden <a href> hedefleri ve görünen metinleri */
export function htmlLinkleri(html: string): Link[] {
  const out: Link[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim();
    if (!/^https?:\/\//i.test(href)) continue;
    const gorunen = m[4].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const l = linkKur(href, gorunen || undefined);
    if (l) out.push(l);
  }
  return out;
}

/** HTML → düz metin (analiz ve LLM için) */
export function htmlMetin(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(+d))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/** Görünen metin bir alan adına benziyor ama gerçek hedef başka bir alan adına gidiyorsa */
export function gorunenFarkli(l: Link): string | null {
  if (!l.gorunen) return null;
  const g = linkleriCikar(l.gorunen)[0];
  if (!g || g.alan === l.alan) return null;
  return g.alan;
}

// ---------------------------------------------------------------- Homograf

/** Latin'e benzeyen Kiril/Yunan harfleri ve rakam/harf karışıklıkları → "iskelet" */
const BENZER: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', һ: 'h', ԁ: 'd', ɡ: 'g', ո: 'n', ս: 'u',
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', τ: 't', ι: 'i', κ: 'k', ε: 'e',
  '0': 'o', '1': 'l', ı: 'i',
};
export function iskelet(s: string): string {
  return [...s.toLowerCase()].map(c => BENZER[c] ?? c).join('').replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd');
}

/**
 * Homograf şüphesi: bir etikette Latin ile Kiril/Yunan karışık, ya da etiket tamamen Latin'e benzeyen Kiril/Yunan
 * harflerden oluşuyor ("аррӏе" gibi; iskeleti tamamen ASCII'ye dönüşür).
 */
export function karisikYazi(host: string): boolean {
  const u = domainToUnicode(host) || host;
  return u.split('.').some(et => {
    const latin = /[a-z]/i.test(et), kiril = /\p{Script=Cyrillic}/u.test(et), yunan = /\p{Script=Greek}/u.test(et);
    if (latin && (kiril || yunan)) return true;
    return (kiril || yunan) && /^[a-z0-9-]+$/.test(iskelet(et));
  });
}

// ---------------------------------------------------------------- Kısaltılmış linkleri çözme (SSRF korumalı)

/** Özel/ayrılmış adresler: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, 0/8, ::1, fc00::/7, fe80::/10 */
export function ozelAdres(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return ozelAdres(x.slice(7));
  return x === '::1' || x === '::' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
}

async function guvenliHost(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, '');
  if (net.isIP(h)) return !ozelAdres(h);
  if (/^localhost$|\.local$|\.internal$/i.test(h)) return false;
  const adresler = await dns.lookup(h, { all: true }).catch(() => []);
  return adresler.length > 0 && adresler.every(a => !ozelAdres(a.address));
}

/**
 * Yönlendirmeleri izle: en fazla 5 adım, yalnızca http/https, çerez yok (fetch çerez tutmaz), gövde okunmaz,
 * her adımda hedef özel ağdaysa durur. Dönüş: son URL ve zincir.
 */
export async function yonlendirmeCoz(url: string, f: typeof fetch = fetch, sureMs = 3500): Promise<{ son: string; zincir: string[]; hata?: string }> {
  const zincir = [url];
  let simdi = url;
  const bitis = Date.now() + sureMs;
  for (let i = 0; i < 5; i++) {
    let u: URL;
    try { u = new URL(simdi); } catch { return { son: simdi, zincir, hata: 'geçersiz adres' }; }
    if (!/^https?:$/.test(u.protocol)) return { son: simdi, zincir, hata: 'http dışı yönlendirme' };
    if (!(await guvenliHost(u.hostname))) return { son: simdi, zincir, hata: 'özel ağ adresine yönlendirme engellendi' };
    const kalan = bitis - Date.now();
    if (kalan <= 0) return { son: simdi, zincir, hata: 'zaman aşımı' };
    let r: Response;
    try {
      r = await f(simdi, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(kalan), headers: { 'User-Agent': 'Mozilla/5.0 (Bekci link denetimi)' } });
      if (r.status === 405 || r.status === 501) {
        const ac = new AbortController();
        r = await f(simdi, { method: 'GET', redirect: 'manual', signal: AbortSignal.any([ac.signal, AbortSignal.timeout(kalan)]) });
        ac.abort(); // gövdeyi indirme
      }
    } catch (e: any) { return { son: simdi, zincir, hata: e?.name === 'TimeoutError' ? 'zaman aşımı' : 'bağlanılamadı' }; }
    const yer = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && yer) {
      simdi = new URL(yer, simdi).toString();
      zincir.push(simdi);
      continue;
    }
    return { son: simdi, zincir };
  }
  return { son: simdi, zincir, hata: 'çok fazla yönlendirme' };
}
