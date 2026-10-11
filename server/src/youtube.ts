// YouTube: maç özetleri (resmi kanal akışları, anahtarsız), genel arama (resmi YouTube Data API, YOUTUBE_API_KEY)
// ve kullanıcının verdiği link (oEmbed ile doğrulanır). Video Jarvis'in içinde resmi gömme oynatıcıyla açılır.
// YouTube arama sayfası kazınmaz (kullanım şartlarına aykırı); anahtar yoksa genel arama dürüstçe "yok" der.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface YtVideo {
  video_id: string; baslik: string; kanal: string; tarih: string | null; ozet_mi?: boolean;
  /** Türkçe yayıncı (S Sport, beIN, TRT) */
  turkce?: boolean;
  /** Jarvis içinde oynatılabilir mi; false → "YouTube'da izle" kartı */
  jarvis_icinde?: boolean;
  /** YouTube Shorts (dikey) */
  shorts?: boolean;
}

const YT_KEY = process.env.YOUTUBE_API_KEY || '';
export const youtubeSearchReady = () => !!YT_KEY;

/**
 * Maç özeti için resmi kanallar (yayın hakları ülkeye/lige göre dağınık: Süper Lig beIN'de, La Liga beIN'de değil).
 * Hepsi 11 Ekim 2026'da kontrol edildi: son videoları arasında özet/highlights/resumen vardı.
 * Ek kanal: YOUTUBE_CHANNELS="Ad=UCxxxx,Ad2=UCyyyy"
 */
const CHANNELS: { name: string; id: string; tr?: boolean }[] = [
  // S Sport: La Liga, Serie A, Bundesliga Türkçe özetleri. Videolarında gömme KAPALI (oEmbed 401): Jarvis içinde
  // oynamaz, "YouTube'da izle" kartıyla açılır. Halil Türkçe özeti tercih ediyor.
  { name: 'S Sport', id: 'UCpdSUUHlxMjO0c5824FGcsA', tr: true },
  { name: 'beIN SPORTS Türkiye', id: 'UCPe9vNjHF1kEExT5kHwc7aw', tr: true }, // Süper Lig, Ligue 1
  { name: 'TRT SPOR', id: 'UCfYNqluOf8EbQkL44otydMw', tr: true }, // Şampiyonlar Ligi (Türkiye), milli maçlar
  { name: 'LALIGA EA SPORTS', id: 'UCTv-XvfzLX3i4IGWAm4sbmA' }, // "RESUMEN"
  { name: 'Serie A', id: 'UCBJeMCIeLQos7wacox4hmLQ' }, // "HIGHLIGHTS"
  { name: 'UEFA', id: 'UCyGa1YEx9ST66rYrJTGIKOw' },
  { name: 'Premier League', id: 'UCG5qGWdu8nIRZqJ_GgDwQ-w' },
  { name: 'FC Barcelona', id: 'UC14UlmYlSNiQCBe9Eookf_A' },
  { name: 'Real Madrid', id: 'UCWV3obpZVGgJ3j9FVhEjF2Q' },
  ...(process.env.YOUTUBE_CHANNELS || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const [name, id] = s.split('=');
    return { name: name.trim(), id: (id || '').trim() };
  }).filter(c => /^UC[\w-]{22}$/.test(c.id)),
];

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export const fold = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Barça → barca, Atlético → atletico
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Takma adlar: "Fener maçı" → fenerbahce
// Başlıkta geçebilecek alternatif adlar (ör. LaLiga "FC BARCELONA", kulüp kanalı "Barça")
const ALT: Record<string, string[]> = { barcelona: ['barcelona', 'barca'], 'paris saint germain': ['paris saint germain', 'psg'], 'bayern munih': ['bayern'], 'manchester city': ['man city', 'manchester city'], 'manchester united': ['man united', 'manchester united'] };
const ALIAS: Record<string, string> = { fener: 'fenerbahce', fb: 'fenerbahce', cimbom: 'galatasaray', gs: 'galatasaray', bjk: 'besiktas', 'kara kartal': 'besiktas', ts: 'trabzonspor', 'bordo mavi': 'trabzonspor', psg: 'paris saint germain', real: 'real madrid', barca: 'barcelona', bayern: 'bayern munih', city: 'manchester city', united: 'manchester united' };

const feedCache = new Map<string, { at: number; list: YtVideo[] }>();
/** Akışlarda Shorts olarak görülen videolar (oynatıcı dikey açılsın) */
const shortIds = new Set<string>();
export const isShort = (id: string) => shortIds.has(id);
async function channelFeed(ch: { name: string; id: string; tr?: boolean }): Promise<YtVideo[]> {
  const hit = feedCache.get(ch.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.list;
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`YouTube akışı HTTP ${r.status}`);
  const xml = await r.text();
  const list: YtVideo[] = [];
  for (const e of xml.split('<entry>').slice(1)) {
    const id = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(e)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(e)?.[1];
    if (!id || !title) continue;
    // Akışta Shorts'un bağlantısı /shorts/ ile gelir
    const shorts = /<link rel="alternate" href="[^"]*\/shorts\//.test(e);
    if (shorts) shortIds.add(id);
    list.push({ video_id: id, baslik: decode(title), kanal: ch.name, tarih: /<published>([^<]+)<\/published>/.exec(e)?.[1] ?? null, turkce: !!ch.tr, shorts });
  }
  feedCache.set(ch.id, { at: Date.now(), list });
  return list;
}

export type Brans = 'futbol' | 'basketbol' | 'voleybol';
const BRANS_RE: Record<Exclude<Brans, 'futbol'>, RegExp> = { basketbol: /basketbol|euroleague|basketball/, voleybol: /voleybol|sultanlar ligi|efeler ligi|volleyball/ };
const bransOf = (title: string): Brans => {
  const f = fold(title);
  if (BRANS_RE.basketbol.test(f)) return 'basketbol';
  if (BRANS_RE.voleybol.test(f)) return 'voleybol';
  return 'futbol';
};

/** Kanalda arama (resmi API, anahtar varsa): akışın son 15 videosuyla sınırlı kalmaz */
async function searchChannel(channelId: string, channelName: string, q: string, tr = false): Promise<YtVideo[]> {
  const p = new URLSearchParams({ part: 'snippet', type: 'video', channelId, q, order: 'date', maxResults: '15', key: YT_KEY });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${p}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`YouTube kanal araması HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.items ?? []).filter((it: any) => it.id?.videoId).map((it: any) => ({ video_id: it.id.videoId, baslik: decode(it.snippet?.title ?? ''), kanal: channelName, tarih: it.snippet?.publishedAt ?? null, turkce: tr }));
}

/**
 * Takımın en yeni maç özeti (resmi kanallardan). Varsayılan branş futbol: "Fener maçı" kadın basketbol özetini açmasın.
 * Anahtar varsa kanalda arama yapılır; yoksa ücretsiz akış (yalnızca son 15 video).
 */
export async function findHighlights(takim: string, brans: Brans = 'futbol'): Promise<{ videolar: YtVideo[]; taranan: string[]; kaynak: string; brans: Brans; diger_brans?: YtVideo[] }> {
  let t = fold(takim).replace(/\b(mac|maci|macinin|ozet|ozeti|spor kulubu)\b/g, ' ').replace(/\s+/g, ' ').trim();
  t = ALIAS[t] ?? t;
  const lists = await Promise.allSettled(CHANNELS.map(c => (YT_KEY ? searchChannel(c.id, c.name, `${takim} özet`, !!c.tr).catch(() => channelFeed(c)) : channelFeed(c))));
  const all = lists.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  const names = ALT[t] ?? [t];
  // Aynı video birden çok yerden gelebilir (kulüp + lig kanalı aynı özeti yüklemez ama emniyet)
  const seen = new Set<string>();
  const matching = all.filter(v => t && names.some(n => fold(v.baslik).includes(n)) && !seen.has(v.video_id) && seen.add(v.video_id));
  const other = matching.filter(v => bransOf(v.baslik) !== brans);
  const cands = matching.filter(v => bransOf(v.baslik) === brans).map(v => {
    const shorts = /#/.test(v.baslik); // #shorts, #laligahighlights: dikey kısa video, maç özeti değil
    // Türkçe, İngilizce, İspanyolca, İtalyanca, Fransızca özet adları
    // S Sport Bundesliga özetlerinde "özet" yazmıyor: "FC Augsburg - Bayern Münih | Bundesliga 2026/27"
    const matchup = /^[^|#]+ - [^|#]+\|\s*(Bundesliga|LaLiga|Serie A|Ligue 1|Premier Lig)/i.test(v.baslik);
    const ozet = !shorts && (matchup || /\b(ozet|ozeti|goller|highlights?|resumen|sintesi|resume|extended highlights)\b/.test(fold(v.baslik)));
    return { ...v, ozet_mi: ozet, shorts };
  });
  // Gömülebilirlik (önbellekli oEmbed + oynatırken yakalanan engeller)
  await Promise.all(cands.slice(0, 12).map(v => checkVideo(v.video_id).catch(() => null)));
  const playable = (v: YtVideo) => !blockedChannels.has(v.kanal) && embedState.get(v.video_id) !== false;
  // Aynı maç haftası: en yeni özetten 36 saat içindekiler. Onların arasında önce Türkçe yayıncı, sonra Jarvis
  // içinde oynayan. Böylece eski bir Türkçe özet yeni maçın önüne geçmez.
  const time = (v: YtVideo) => (v.tarih ? Date.parse(v.tarih) : 0);
  const newest = Math.max(0, ...cands.filter(v => v.ozet_mi).map(time));
  const score = (v: typeof cands[number]) =>
    (v.ozet_mi ? 100 : 0) + (v.ozet_mi && newest - time(v) < 36 * 3600_000 ? 50 : 0) + (v.turkce ? 4 : 0) + (playable(v) ? 2 : 0) - (v.shorts ? 200 : 0);
  const sorted = cands.sort((a, b) => score(b) - score(a) || time(b) - time(a));
  return {
    videolar: sorted.slice(0, 5).map(({ shorts: _s, ...v }) => ({ ...v, jarvis_icinde: playable(v) })),
    taranan: CHANNELS.map(c => c.name),
    kaynak: YT_KEY ? 'kanal araması' : 'kanal akışı (her kanalın son 15 videosu)',
    brans,
    ...(other.length ? { diger_brans: other.slice(0, 3) } : {}),
  };
}

// ---------------------------------------------------------------- Kanalın son videosu

/**
 * Kullanıcının kendi kanalı ve favori kanallar. YOUTUBE_OWN_CHANNEL=UC… (kendi kanalı),
 * YOUTUBE_FAVORITES="Ad=UC…,Ad2=UC…". Maç özeti kanalları da adıyla aranabilir ("S Sport'un son videosu").
 */
const OWN = process.env.YOUTUBE_OWN_CHANNEL || '';
/** Kendi kanalına verilen adlar: USER_NAME + YOUTUBE_OWN_ALIASES (virgülle; ör. "ad soyad,kullanici_adi") */
const OWN_ALIASES = [
  ...(process.env.YOUTUBE_OWN_ALIASES || '').split(','),
  process.env.USER_NAME || '',
  'benim', 'kendi kanalim', 'kanalim', 'ben',
].map(a => fold(a)).filter(Boolean);
const FAVORITES: { name: string; id: string }[] = (process.env.YOUTUBE_FAVORITES || '').split(',').map(x => x.trim()).filter(Boolean)
  .map(x => { const [name, id] = x.split('='); return { name: name.trim(), id: (id || '').trim() }; }).filter(c => /^UC[\w-]{22}$/.test(c.id));

export type VideoTur = 'shorts' | 'video' | 'hepsi';

export async function latestFromChannel(kanal: string, tur?: VideoTur): Promise<{ videolar: YtVideo[]; kanal: string; tur: VideoTur } | { hata: string }> {
  const k = fold(kanal).replace(/\b(kanali|kanalinin|youtube|in|un|nin|nun)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const own = OWN_ALIASES.some(a => k === a || k.includes(a));
  let ch: { name: string; id: string; tr?: boolean } | undefined;
  if (own) {
    if (!OWN) return { hata: 'Kendi kanalınız henüz tanımlı değil (YOUTUBE_OWN_CHANNEL). Kullanıcıdan kanal bağlantısını iste.' };
    ch = { name: process.env.YOUTUBE_OWN_NAME || process.env.USER_NAME || 'Kendi kanalım', id: OWN };
  } else {
    ch = [...FAVORITES, ...CHANNELS].find(c => fold(c.name).includes(k) || k.includes(fold(c.name)));
  }
  if (!ch) return { hata: `"${kanal}" tanımlı kanallar arasında yok. Tanımlı kanallar: kullanıcının kendi kanalı, ${[...FAVORITES, ...CHANNELS].map(c => c.name).join(', ')}. Genel arama için youtube_ara kullan.` };
  // Kendi kanalında "son video" varsayılanı Shorts (Halil'in isteği); diğer kanallarda hepsi
  const want: VideoTur = tur ?? (own ? 'shorts' : 'hepsi');
  const list = await channelFeed(ch);
  const pick = list.filter(v => want === 'hepsi' || (want === 'shorts' ? v.shorts : !v.shorts)).slice(0, 5);
  await Promise.all(pick.map(v => checkVideo(v.video_id).catch(() => null)));
  return { kanal: ch.name, tur: want, videolar: pick.map(v => ({ ...v, jarvis_icinde: isEmbeddable(v.video_id) !== false })) };
}

/** Genel video araması: resmi YouTube Data API (gömülebilir videolar, Türkiye). Anahtar yoksa null. */
export async function searchVideos(q: string): Promise<YtVideo[] | null> {
  if (!YT_KEY) return null;
  const p = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '5', regionCode: 'TR', relevanceLanguage: 'tr', safeSearch: 'moderate', q, key: YT_KEY });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${p}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`YouTube arama HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const j: any = await r.json();
  return (j.items ?? [])
    .filter((it: any) => it.id?.videoId)
    .map((it: any) => ({ video_id: it.id.videoId, baslik: decode(it.snippet?.title ?? ''), kanal: decode(it.snippet?.channelTitle ?? ''), tarih: it.snippet?.publishedAt ?? null }));
}

/** Linkten video kimliği: youtu.be/ID · watch?v=ID · shorts/ID · embed/ID · çıplak 11 karakter */
export function videoIdFrom(s: string): string | null {
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(s) ?? /^([\w-]{11})$/.exec(s.trim());
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- Gömülebilirlik

const BLOCKED_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'yt-blocked.json');
/** video_id → Jarvis içinde oynar mı. oEmbed'in göremediği engeller (LaLiga: "iş ortağı bu sitede engelledi")
 *  oynatıcıdan bildirilir ve diske yazılır. */
const saved: { ids: string[]; kanallar: string[] } = (() => {
  try { const j = JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8')); return Array.isArray(j) ? { ids: j, kanallar: [] } : j; } catch { return { ids: [], kanallar: [] }; }
})();
const embedState = new Map<string, boolean>(saved.ids.map(id => [id, false] as [string, boolean]));
/** Oynatıcıda engel çıkan kanallar: lig hakları tüm videolara uygulanıyor (LaLiga), tek tek denemeye gerek yok */
const blockedChannels = new Set<string>(saved.kanallar);
const channelOf = (id: string) => [...feedCache.values()].flatMap(c => c.list).find(v => v.video_id === id)?.kanal;
export function isEmbeddable(id: string): boolean | undefined {
  const ch = channelOf(id);
  if (ch && blockedChannels.has(ch)) return false;
  return embedState.get(id);
}
export function markBlocked(id: string) {
  if (!/^[\w-]{11}$/.test(id)) return;
  embedState.set(id, false);
  const ch = channelOf(id);
  if (ch) blockedChannels.add(ch);
  const ids = [...embedState].filter(([, ok]) => !ok).map(([k]) => k).slice(-500);
  try {
    fs.mkdirSync(path.dirname(BLOCKED_FILE), { recursive: true });
    fs.writeFileSync(BLOCKED_FILE, JSON.stringify({ ids, kanallar: [...blockedChannels] }));
  } catch { /* yok say */ }
}

/** Video var mı, gömülebilir mi (oEmbed: 401/403 = sahibi gömmeyi kapatmış, 404 = yok) */
export async function checkVideo(id: string): Promise<YtVideo | { hata: string }> {
  if (embedState.get(id) === false) return { hata: 'Video sahibi başka sitelerde oynatılmasını kapatmış.' };
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(10_000) });
  if (r.status === 401 || r.status === 403) { embedState.set(id, false); return { hata: 'Video sahibi başka sitelerde oynatılmasını kapatmış.' }; }
  if (!r.ok) return { hata: 'Video bulunamadı.' };
  if (!embedState.has(id)) embedState.set(id, true);
  const j: any = await r.json();
  return { video_id: id, baslik: String(j.title ?? ''), kanal: String(j.author_name ?? ''), tarih: null, jarvis_icinde: true };
}
