// Bekçi · dış kaynaklar: alan adı yaşı (RDAP, olmazsa WHOIS), USOM zararlı bağlantı listesi, opsiyonel Google Safe
// Browsing / VirusTotal / urlscan.io. Üçüncü taraflara YALNIZCA URL ya da alan adı gider; mesaj metni, telefon,
// e-posta asla. Her çağrı zaman aşımlı; sonuçlar alan adı bazında önbellekte (6 saat).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERI = process.env.BEKCI_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'bekci');

type F = typeof fetch;

// ---------------------------------------------------------------- Alan adı yaşı

export interface Yas { gun: number | null; tarih: string | null; kaynak: 'rdap' | 'whois' | null; hata?: string }

/** IANA RDAP önyükleme dosyası (TLD → RDAP sunucusu); günde bir yenilenir. rdap.org otomatik istemcileri engelleyebiliyor. */
let rdapHarita: { t: number; s: [string[], string[]][] } | null = null;
async function rdapSunucu(alan: string, f: F, ms: number): Promise<string | null> {
  if (!rdapHarita || Date.now() - rdapHarita.t > 86_400_000) {
    const r = await f('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(ms) });
    if (r.ok) rdapHarita = { t: Date.now(), s: (await r.json() as any).services };
  }
  const parca = alan.toLowerCase().split('.');
  for (let i = 1; i < parca.length; i++) {
    const tld = parca.slice(i).join('.');
    const k = rdapHarita?.s.find(x => x[0].includes(tld));
    if (k) return k[1][0].replace(/\/?$/, '/');
  }
  return null;
}

/** RDAP (IANA önyüklemesiyle doğrudan kayıt kuruluşu). Olmazsa WHOIS (port 43; .tr gibi RDAP'sız uzantılar). */
export async function alanYasi(alan: string, f: F = fetch, sureMs = 4000): Promise<Yas> {
  const bitis = Date.now() + sureMs;
  try {
    const sunucu = await rdapSunucu(alan, f, Math.min(sureMs, 2500));
    if (!sunucu) throw new Error('RDAP yok');
    const r = await f(`${sunucu}domain/${encodeURIComponent(alan)}`, { headers: { Accept: 'application/rdap+json' }, signal: AbortSignal.timeout(Math.max(500, bitis - Date.now())) });
    if (r.ok) {
      const j: any = await r.json();
      const ev = (j.events ?? []).find((e: any) => e.eventAction === 'registration');
      if (ev?.eventDate) return { ...gunHesapla(ev.eventDate), kaynak: 'rdap' };
    }
  } catch { /* WHOIS'e düş */ }
  const kalan = bitis - Date.now();
  if (kalan < 300) return { gun: null, tarih: null, kaynak: null, hata: 'zaman aşımı' };
  try {
    const tld = alan.split('.').slice(-1)[0];
    const iana = await whois('whois.iana.org', tld, Math.min(kalan, 1500));
    const sunucu = /^(?:refer|whois):\s*(\S+)/im.exec(iana)?.[1];
    if (!sunucu) return { gun: null, tarih: null, kaynak: null, hata: 'WHOIS sunucusu yok' };
    const cevap = await whois(sunucu, alan, Math.max(300, bitis - Date.now()));
    const t = /(?:Creation Date|Created On|Created|Registered on|Registration Time|created)\s*\.*:\s*([^\r\n]+)/i.exec(cevap)?.[1]?.trim();
    if (t && !Number.isNaN(Date.parse(t.replace(/\.$/, '')))) return { ...gunHesapla(t.replace(/\.$/, '')), kaynak: 'whois' };
    return { gun: null, tarih: null, kaynak: null, hata: 'kayıt tarihi bulunamadı' };
  } catch (e: any) { return { gun: null, tarih: null, kaynak: null, hata: e?.message || 'WHOIS hatası' }; }
}
const gunHesapla = (t: string) => { const d = new Date(t); return { gun: Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000)), tarih: d.toISOString().slice(0, 10) }; };

function whois(sunucu: string, sorgu: string, ms: number): Promise<string> {
  return new Promise((ok, no) => {
    let veri = '';
    const s = net.connect({ host: sunucu, port: 43, timeout: ms }, () => s.write(sorgu + '\r\n'));
    s.setEncoding('utf8');
    s.on('data', d => { veri += d; if (veri.length > 200_000) s.destroy(); });
    s.on('end', () => ok(veri));
    s.on('close', () => ok(veri));
    s.on('timeout', () => { s.destroy(); no(new Error('WHOIS zaman aşımı')); });
    s.on('error', no);
  });
}

// ---------------------------------------------------------------- USOM (Siber Güvenlik Başkanlığı)
// Eski düz liste (usom.gov.tr/url-list.txt) artık bir API sayfasına yönleniyor; zararlı bağlantılar
// siberguvenlik.gov.tr/api/address/index üzerinden paylaşılıyor (~500 bin kayıt, sayfalı, q ile arama).
// 1) Son 7 günün kayıtları 6 saatte bir topluca alınır (yerel küme; API yavaşken de eşleşir).
// 2) Her alan adı ayrıca canlı sorgulanır (q=alan adı), sonuç 6 saat önbellekte.

const USOM_API = process.env.USOM_API || 'https://siberguvenlik.gov.tr/api/address/index';
let usom: { set: Set<string>; yuklendi: number; satir: number } | null = null;
/** USOM listesinin yüklü satır sayısı (Ultron'un Gözü siber katmanı; liste yüklenmediyse null) */
export const usomSatir = () => (usom && usom.satir > 0 ? usom.satir : null);

/** Kayıt adresini host'a indir: "http://www.a.b/yol" → "a.b" */
export const usomHost = (x: string) => x.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '');

/** API cevabı → host kümesi. JSON değilse (ör. HTML sayfa) hata. */
export function usomAyristir(govde: string): Set<string> {
  let j: any;
  try { j = JSON.parse(govde); } catch { throw new Error('USOM cevabı JSON değil (adres değişmiş olabilir)'); }
  if (!Array.isArray(j?.models)) throw new Error('USOM cevabı beklenen biçimde değil');
  return new Set<string>(j.models.map((m: any) => usomHost(String(m.url ?? ''))).filter(Boolean));
}

/** Son 7 günün kayıtları (6 saatte bir). İndirilemezse diskteki kopyayla devam. */
export async function usomYukle(f: F = fetch, zorla = false): Promise<{ ok: boolean; satir: number; hata?: string }> {
  const dosya = path.join(VERI, 'usom-son7gun.json');
  if (!zorla && usom && Date.now() - usom.yuklendi < 6 * 3600_000) return { ok: true, satir: usom.satir };
  const tarih = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  try {
    const set = new Set<string>();
    for (let sayfa = 0; sayfa < 10; sayfa++) {
      const r = await f(`${USOM_API}?date_gte=${tarih}&per-page=9999&page=${sayfa}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`USOM HTTP ${r.status}`);
      const govde = await r.text();
      for (const h of usomAyristir(govde)) set.add(h);
      const j = JSON.parse(govde);
      if (sayfa + 1 >= (j.pageCount ?? 1)) break;
    }
    fs.mkdirSync(VERI, { recursive: true });
    fs.writeFileSync(dosya, JSON.stringify([...set]));
    usom = { set, yuklendi: Date.now(), satir: set.size };
    return { ok: true, satir: set.size };
  } catch (e: any) {
    try {
      const set = new Set<string>(JSON.parse(fs.readFileSync(dosya, 'utf8')));
      usom = { set, yuklendi: Date.now() - 5 * 3600_000, satir: set.size };
      return { ok: true, satir: set.size, hata: `güncellenemedi, diskteki kopya: ${e?.message}` };
    } catch {
      usom = { set: new Set(), yuklendi: Date.now() - 5.5 * 3600_000, satir: 0 };
      return { ok: false, satir: 0, hata: e?.message || 'USOM indirilemedi' };
    }
  }
}

/** Host ya da üst alan adlarından biri kümede mi (alt alan adı listedeyse üstü sayılmaz: dinamik DNS servisleri) */
export function usomEslesme(host: string, set = usom?.set): string | null {
  if (!set) return null;
  const parca = usomHost(host).split('.');
  for (let i = 0; i < parca.length - 1; i++) { const h = parca.slice(i).join('.'); if (set.has(h)) return h; }
  return null;
}

/** Canlı sorgu: q=kayıtlı alan adı; dönen kayıtlarda host ya da üst alan adı eşleşmesi */
export async function usomSorgu(host: string, alan: string, f: F = fetch, ms = 4000): Promise<{ eslesme: string | null; hata?: string }> {
  try {
    const r = await f(`${USOM_API}?q=${encodeURIComponent(alan)}&per-page=200`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
    if (!r.ok) return { eslesme: null, hata: `USOM HTTP ${r.status}` };
    return { eslesme: usomEslesme(host, usomAyristir(await r.text())) };
  } catch (e: any) { return { eslesme: null, hata: e?.name === 'TimeoutError' ? 'zaman aşımı' : e?.message || 'USOM sorgulanamadı' }; }
}
export const usomHazir = () => !!usom && usom.satir > 0;

// ---------------------------------------------------------------- İtibar servisleri (anahtar varsa)

export async function safeBrowsing(urls: string[], f: F = fetch, ms = 4000): Promise<{ eslesen: string[] } | null> {
  const k = process.env.GSB_API_KEY?.trim();
  if (!k || !urls.length) return null;
  const r = await f(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(k)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({
      client: { clientId: 'jarvis-bekci', clientVersion: '1.0' },
      threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'], platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: urls.map(url => ({ url })) },
    }),
  });
  if (!r.ok) throw new Error(`Safe Browsing HTTP ${r.status}`);
  const j: any = await r.json();
  return { eslesen: [...new Set<string>((j.matches ?? []).map((m: any) => m.threat?.url))] };
}

/** VirusTotal: yalnızca mevcut raporu okur (gönderim yok; ücretsiz katman dakikada 4 istek → sıra) */
let vtSira: Promise<unknown> = Promise.resolve();
let vtSon = 0;
export function virusTotal(url: string, f: F = fetch, ms = 4000): Promise<{ zararli: number; supheli: number; toplam: number } | null> {
  const k = process.env.VT_API_KEY?.trim();
  if (!k) return Promise.resolve(null);
  const is = vtSira.then(async () => {
    const bekle = vtSon + 15_500 - Date.now();
    if (bekle > ms) throw new Error('VirusTotal hız sınırı: sırada');
    if (bekle > 0) await new Promise(r => setTimeout(r, bekle));
    vtSon = Date.now();
    const id = Buffer.from(url).toString('base64url');
    const r = await f(`https://www.virustotal.com/api/v3/urls/${id}`, { headers: { 'x-apikey': k }, signal: AbortSignal.timeout(ms) });
    if (r.status === 404) return { zararli: 0, supheli: 0, toplam: 0 };
    if (!r.ok) throw new Error(`VirusTotal HTTP ${r.status}`);
    const s = (await r.json() as any).data?.attributes?.last_analysis_stats ?? {};
    return { zararli: s.malicious ?? 0, supheli: s.suspicious ?? 0, toplam: Object.values(s).reduce((a: number, b: any) => a + (Number(b) || 0), 0) as number };
  });
  vtSira = is.catch(() => {});
  return is;
}

export interface Sandbox { uuid: string; ekran: string; formAlanlari: string[]; sonUrl?: string; durum: 'bekliyor' | 'tamam' | 'hata'; hata?: string }

/** urlscan.io: "unlisted" tarama. Sonuç 10–40 sn sürer; bulgular (form alanları, ekran görüntüsü) sonradan gelir. */
export async function urlscanBaslat(url: string, f: F = fetch): Promise<{ uuid: string } | null> {
  const k = process.env.URLSCAN_API_KEY?.trim();
  if (!k) return null;
  const r = await f('https://urlscan.io/api/v1/scan/', { method: 'POST', headers: { 'API-Key': k, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, visibility: 'unlisted' }), signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`urlscan HTTP ${r.status}`);
  const j: any = await r.json();
  return j.uuid ? { uuid: j.uuid } : null;
}

/** DOM'daki form alanlarından hassas olanlar (Senaryo D'nin kanıtı) */
export function formAlanlari(dom: string): string[] {
  const bul = new Set<string>();
  for (const m of dom.matchAll(/<(input|select)\b[^>]*>/gi)) {
    const t = m[0].toLowerCase();
    const at = (a: string) => new RegExp(`${a}\\s*=\\s*["']?([^"'\\s>]+)`).exec(t)?.[1] ?? '';
    const s = [at('name'), at('id'), at('autocomplete'), at('placeholder'), at('type'), at('aria-label')].join(' ');
    if (/cc-number|card.?num|kart.?n|cardnumber|pan\b/.test(s)) bul.add('kart numarası');
    else if (/cvv|cvc|cc-csc|guvenlik.?kod|security.?code/.test(s)) bul.add('CVV');
    else if (/cc-exp|expir|son.?kul|skt|exp.?(month|year)/.test(s)) bul.add('son kullanma tarihi');
    else if (/\btc\b|tckn|kimlik|identity/.test(s)) bul.add('TC kimlik numarası');
    else if (/password|sifre|parola/.test(s)) bul.add('şifre');
    else if (/\bsms\b|otp|dogrulama.?kod|one-time-code/.test(s)) bul.add('SMS doğrulama kodu');
  }
  return [...bul];
}

export async function urlscanSonuc(uuid: string, f: F = fetch): Promise<Sandbox> {
  const ekran = `https://urlscan.io/screenshots/${uuid}.png`;
  const r = await f(`https://urlscan.io/api/v1/result/${uuid}/`, { signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return { uuid, ekran, formAlanlari: [], durum: 'bekliyor' };
  if (!r.ok) return { uuid, ekran, formAlanlari: [], durum: 'hata', hata: `HTTP ${r.status}` };
  const j: any = await r.json();
  const d = await f(`https://urlscan.io/dom/${uuid}/`, { signal: AbortSignal.timeout(8000) }).then(x => (x.ok ? x.text() : '')).catch(() => '');
  return { uuid, ekran, formAlanlari: formAlanlari(d), sonUrl: j.page?.url, durum: 'tamam' };
}

// ---------------------------------------------------------------- Önbellek

const onbellek = new Map<string, { t: number; v: unknown }>();
export async function onbellekli<T>(anahtar: string, saat: number, fn: () => Promise<T>): Promise<T> {
  const o = onbellek.get(anahtar);
  if (o && Date.now() - o.t < saat * 3600_000) return o.v as T;
  const v = await fn();
  onbellek.set(anahtar, { t: Date.now(), v });
  return v;
}
