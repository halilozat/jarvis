import { randomUUID } from 'node:crypto';
import { buildSystemPrompt } from './prompt.js';
import { CHAT_MODEL, MOCK, RouteLLMError, routellmStream, type ChatMessage, type ContentPart } from './routellm.js';
import { TOOLS, runTool, type ToolProgress } from './tools.js';
import { findNewsById } from './news.js';
import { resolveFastPhoto, resolveSlowPhoto, type PhotoMode } from './photos.js';
import { findWiki } from './wiki.js';
import { mockReply } from './mock.js';
import { BRIEF_OPENING, BRIEF_TRIGGER } from './brief.js';
import type { Device, Gorsel, GorselWithPhoto, JarvisReply, Photo, Sahne, StoredMessage } from './types.js';

const MAX_ROUNDS = 5;
/** Görsel girdi için model: boşsa CHAT_MODEL (Jarvis router'ı görsel isteği kendisi yönlendirir). */
const VISION_MODEL = process.env.VISION_MODEL || CHAT_MODEL;

const normalizeTr = (s: string) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isOpening = (s: Sahne) => normalizeTr(s.ses).startsWith(normalizeTr(BRIEF_OPENING));

function contextVars(device: Device, prevDevice: Device | null) {
  const now = new Date();
  const tz = 'Europe/Istanbul';
  return {
    tarih: now.toLocaleDateString('tr-TR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }),
    gun: now.toLocaleDateString('tr-TR', { timeZone: tz, weekday: 'long' }),
    saat: now.toLocaleTimeString('tr-TR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }),
    cihaz: device,
    onceki_cihaz: prevDevice ?? device,
    kullanici: process.env.USER_NAME || 'Halil',
    kullanici_hakkinda: process.env.USER_ABOUT || "Türkiye'de yaşıyor, yazılımcı ve içerik üreticisi.",
  };
}

export function extractJson(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Akıştan sahne ayıklama

/** `start`taki { ya da [ ile eşleşen kapanışın konumu; henüz gelmediyse -1. Dizgi içindeki parantezleri sayma. */
function matchClose(s: string, start: number): number {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Model JSON'u yazarken "sahneler" dizisindeki nesneleri kapandıkları anda çıkarır. Böylece ilk sahnenin sesi,
 * cevabın geri kalanı yazılırken üretilmeye başlar.
 */
export class SceneStream {
  private pos = -1;
  count = 0;
  push(full: string): any[] {
    if (this.pos < 0) {
      const m = /"sahneler"\s*:\s*\[/.exec(full);
      if (!m) return [];
      this.pos = m.index + m[0].length;
    }
    const out: any[] = [];
    let i = this.pos;
    for (;;) {
      while (i < full.length && /[\s,]/.test(full[i])) i++;
      if (i >= full.length || full[i] !== '{') break;
      const end = matchClose(full, i);
      if (end < 0) break;
      try { out.push(JSON.parse(full.slice(i, end + 1))); } catch { /* bozuk nesne: atla */ }
      i = end + 1;
      this.pos = i;
    }
    this.count += out.length;
    return out;
  }
}

// ---------------------------------------------------------------- Sahne doğrulama

const TIPLER = new Set(['yok', 'baslik', 'sayi', 'grafik', 'harita', 'karsilastirma', 'zaman', 'liste', 'ikon', 'kart', 'adimlar', 'alinti', 'kisi_yer']);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Eksik ya da bozuk alanlı görseli "yok"a indirger (istemci asla yarım görsel çizmesin). */
function normalizeGorsel(g: any): GorselWithPhoto {
  if (!g || typeof g !== 'object' || !TIPLER.has(g.tip)) return { tip: 'yok' };
  const meta = { haber_id: str(g.haber_id) || undefined, foto_arama: str(g.foto_arama) || undefined, wiki: str(g.wiki) || undefined };
  switch (g.tip) {
    case 'ikon': return str(g.baslik) ? { tip: 'ikon', ikon: str(g.ikon) || 'sparkles', baslik: str(g.baslik), alt: str(g.alt) || undefined, ...meta } : { tip: 'yok' };
    case 'kart': {
      const maddeler = Array.isArray(g.maddeler) ? g.maddeler.filter((m: any) => str(m?.metin)).map((m: any) => ({ ikon: str(m.ikon) || 'sparkles', metin: str(m.metin) })) : [];
      return str(g.baslik) && maddeler.length ? { tip: 'kart', baslik: str(g.baslik), maddeler: maddeler.slice(0, 5), ...meta } : { tip: 'yok' };
    }
    case 'adimlar': {
      const adimlar = Array.isArray(g.adimlar) ? g.adimlar.map(str).filter(Boolean) : [];
      return str(g.baslik) && adimlar.length ? { tip: 'adimlar', baslik: str(g.baslik), adimlar: adimlar.slice(0, 7), ...meta } : { tip: 'yok' };
    }
    case 'alinti': return str(g.metin) ? { tip: 'alinti', metin: str(g.metin), kaynak: str(g.kaynak), ...meta } : { tip: 'yok' };
    case 'kisi_yer': return str(g.baslik) ? { tip: 'kisi_yer', baslik: str(g.baslik), ozet: str(g.ozet), ...meta } : { tip: 'yok' };
    default: return { ...g, ...meta };
  }
}

export function normalizeScene(s: any): Sahne | null {
  if (!s || typeof s.ses !== 'string' || !s.ses.trim()) return null;
  return { ses: s.ses.trim(), gorsel: normalizeGorsel(s.gorsel) };
}

/**
 * Sayının metinde geçebileceği yazımlar: 49.0582 · 49,0582 · 5910320 · 5.910.320 · 5,910,320 · 8.848,86 · 8,848.86.
 * Wikipedia nüfusu "5.910.320", Everest'i "8.848,86" diye yazıyor; eski kontrol bunları bulamayıp doğru sayıyı da reddediyordu.
 */
export function numberVariants(n: number): string[] {
  const s = String(n);
  const v = new Set([s, s.replace('.', ',')]);
  if (Math.abs(n) >= 1000) {
    const opt = { maximumFractionDigits: 10 };
    v.add(n.toLocaleString('tr-TR', opt));
    v.add(n.toLocaleString('en-US', opt));
    v.add(n.toLocaleString('tr-TR', opt).replace(/\./g, ' '));
  }
  return [...v];
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Sayı metinde TAM sayı olarak geçiyor mu? Alt dizi yetmez: "8.848" → "8.848,86" içinde, "2.07" → "12.07" içinde
 * bulunurdu ve yuvarlanmış/yanlış sayı doğrulamadan geçerdi. Önünde/arkasında rakam ya da ondalık devamı olmamalı.
 */
export function hasNumber(text: string, n: number): boolean {
  return numberVariants(n).some(v => new RegExp(`(?<![\\d.,])${escapeRe(v)}(?!\\d|[.,]\\d)`).test(text));
}
const squash = (s: string) => s.replace(/[“”«»"']/g, '').replace(/\s+/g, ' ').toLocaleLowerCase('tr');
const numbersIn = (s: string) => (s.match(/\d[\d.,]*\d|\d/g) ?? []);

/**
 * Görsel doğruluk: sayı, grafik, harita ve alıntı verisi araç çıktısında (haber, piyasa, hava, Wikipedia) birebir
 * geçmeli; geçmiyorsa görsel başlığa düşer. Kişi/yer kartı yalnızca gerçek bir wiki_lookup sonucuyla çizilir.
 */
export function verifyVisual(g: GorselWithPhoto, toolText: string): GorselWithPhoto {
  const lower = toolText.toLocaleLowerCase('tr');
  const has = (n: number) => hasNumber(toolText, n);
  const downgrade = (metin: string): GorselWithPhoto => ({ tip: 'baslik', metin, haber_id: g.haber_id, foto_arama: g.foto_arama, wiki: g.wiki });
  switch (g.tip) {
    case 'sayi':
      return typeof g.deger === 'number' && has(g.deger) ? g : downgrade(g.etiket || '');
    case 'grafik':
      return Array.isArray(g.seri) && g.seri.length >= 3 && g.seri.every(p => typeof p.deger === 'number' && has(p.deger)) ? g : downgrade(g.baslik || '');
    case 'harita': {
      const sehirler = Array.isArray(g.sehirler) ? g.sehirler.filter(c => lower.includes(c.toLocaleLowerCase('tr'))) : [];
      const noktalar = Array.isArray(g.noktalar) ? g.noktalar.filter(p => typeof p.lat === 'number' && typeof p.lon === 'number' && has(p.lat) && has(p.lon)) : [];
      const okCities = Array.isArray(g.sehirler) && g.sehirler.length > 0 && sehirler.length === g.sehirler.length;
      if (!okCities && !noktalar.length) return downgrade(g.etiket || '');
      return { ...g, sehirler: okCities ? sehirler : [], noktalar };
    }
    case 'alinti':
      return toolText && squash(toolText).includes(squash(g.metin)) ? g : downgrade(g.kaynak || 'Alıntı');
    case 'kisi_yer': {
      const w = findWiki(g.wiki) ?? findWiki(g.baslik);
      if (!w || !toolText.includes(w.baslik)) return downgrade(g.baslik);
      // Özetteki her sayı kaynakta geçmeli; geçmiyorsa özet Wikipedia'nın kendi cümleleriyle değiştirilir.
      const ozetOk = !!g.ozet && numbersIn(g.ozet).every(x => toolText.includes(x));
      const ozet = ozetOk ? g.ozet : w.ozet.split(/(?<=\.)\s+/).slice(0, 2).join(' ');
      return { ...g, baslik: w.baslik, ozet, wiki: w.baslik };
    }
    default:
      return g;
  }
}

// ---------------------------------------------------------------- Çalıştırma

export interface RunOptions {
  text: string;
  device: Device;
  prevDevice: Device | null;
  history: StoredMessage[];
  photoMode: PhotoMode;
  progress: ToolProgress;
  /** Kamera/fotoğraf: data URL. Varsa görsel girdi destekli modele sorulur. */
  image?: string;
  /** Her sahne hazır olur olmaz (sırayla) */
  onScene?: (index: number, sahne: Sahne) => void;
  /** Yapay zeka görseli sonradan hazır olunca */
  onSceneUpdate?: (index: number, foto: Photo) => void;
  /** Model son sahneyi yazınca (detay ve geç görseller henüz gelmemiş olabilir) */
  onScenesDone?: (count: number) => void;
}

// Yapay zeka görseli yalnızca kart/adımlar/liste sahnelerine: "ikon" sahnesinde ikonun kendisi görsel ve tek sahnelik
// sohbette ~9 sn'lik görsel, Jarvis konuşmayı bitirdikten sonra geliyordu (ölçüldü) — görünmeyen görsele kredi harcanmasın.
const SYMBOLIC = new Set(['kart', 'adimlar', 'liste']);

export async function runJarvis(opts: RunOptions): Promise<JarvisReply> {
  const { text, device, prevDevice, history, photoMode, progress } = opts;
  const t0 = Date.now();
  const since = () => `${Date.now() - t0} ms`;
  const isBrief = BRIEF_TRIGGER.test(text);

  const toolLog: string[] = [];
  const log: ToolProgress = line => {
    toolLog.push(line);
    progress(line);
  };
  let toolText = '';
  let modelUsed: string | null = null;

  // ---- Sahne yayını: sırayı koruyan zincir; yavaş görseller arkadan gelir ----
  const emitted: Sahne[] = [];
  const slow: Promise<void>[] = [];
  let chain = Promise.resolve();
  let firstScene = true;
  const emit = (s: Sahne) => {
    const index = emitted.length;
    emitted.push(s);
    if (index === 0 || (isBrief && index === 1)) console.log(`[zaman] sahne ${index + 1} hazır · ${since()}`);
    opts.onScene?.(index, s);
  };
  const enqueue = (raw: any) => {
    chain = chain.then(async () => {
      const sc = normalizeScene(raw);
      if (!sc) return;
      // Brifing her zaman sabit açılışla başlar; model yazmadıysa önüne eklenir.
      if (isBrief && firstScene && !isOpening(sc)) emit({ ses: BRIEF_OPENING, gorsel: { tip: 'yok' } });
      firstScene = false;
      const g = verifyVisual(sc.gorsel, toolText);
      const news = g.haber_id ? findNewsById(g.haber_id) : undefined;
      const wiki = findWiki(g.wiki) ?? (g.tip === 'kisi_yer' ? findWiki(g.baslik) : undefined);
      const ctx = { mode: photoMode, news, query: g.foto_arama, wiki, symbolic: SYMBOLIC.has(g.tip) };
      const foto = g.tip === 'yok' && !g.haber_id ? null : await resolveFastPhoto(ctx).catch(() => null);
      const index = emitted.length;
      emit({ ses: sc.ses, gorsel: { ...(g as Gorsel), haber_id: g.haber_id, foto_arama: g.foto_arama, wiki: g.wiki, foto } });
      if (!foto && g.tip !== 'yok') {
        slow.push(resolveSlowPhoto(ctx).then(p => {
          if (!p) return;
          emitted[index] = { ...emitted[index], gorsel: { ...emitted[index].gorsel, foto: p } };
          opts.onSceneUpdate?.(index, p);
        }).catch(() => {}));
      }
    });
  };
  const finish = async (detay: string): Promise<JarvisReply> => {
    await chain;
    opts.onScenesDone?.(emitted.length);
    console.log(`[zaman] tüm sahneler · ${emitted.length} sahne · ${since()}`);
    // Geç gelen yapay zeka görselleri kaydedilen cevaba da girsin (en fazla 15 sn beklenir; çalma bunu beklemez).
    await Promise.race([Promise.all(slow), new Promise(r => setTimeout(r, 15_000))]);
    return {
      id: randomUUID(),
      sahneler: emitted.slice(),
      detay,
      model: modelUsed,
      router: CHAT_MODEL,
      tool_log: toolLog,
      device,
      created_at: new Date().toISOString(),
    };
  };

  if (MOCK) {
    const m = await mockReply(text, device, progress);
    toolText = m.toolText;
    modelUsed = 'demo';
    m.sahneler.forEach(enqueue);
    const r = await finish(m.detay);
    return { ...r, router: 'demo' };
  }

  // Sistem prompt'u: değişmeyen kısım başta, tarih/saat/cihaz sonda (RouteLLM prompt önbelleği her turda tutsun).
  const userContent: string | ContentPart[] = opts.image
    ? [{ type: 'text', text: text || 'Bu ne?' }, { type: 'image_url', image_url: { url: opts.image } }]
    : isBrief
      ? `${text}\n\n[Sistem notu: Bu, gündem brifingi komutu. Gündem özeti protokolünü uygula.]`
      : text;
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(contextVars(device, prevDevice)) },
    ...history.slice(-12).map(m => ({ role: m.role, content: m.text }) as ChatMessage),
    { role: 'user', content: userContent },
  ];
  const model = opts.image ? VISION_MODEL : CHAT_MODEL;

  // Komut yoksa haber aracı hiç sunulmaz: Jarvis kendiliğinden gündem anlatamaz. Diğer araçlar her zaman açık.
  // Her aracın çıktısı toolText'e eklenir; verifyVisual sayı/grafik/harita/alıntı görsellerini bu gerçek veriyle doğrular.
  const tools = isBrief ? TOOLS : TOOLS.filter(t => t.function.name !== 'get_news');
  let forceNews = isBrief;
  let retriedJson = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body: any = { model, messages, tools, tool_choice: forceNews ? { type: 'function', function: { name: 'get_news' } } : 'auto' };
    log(round === 0 ? 'düşünüyor' : 'cevabı hazırlıyor');

    const parser = new SceneStream();
    let res;
    try {
      res = await routellmStream(body, (_d, full) => parser.push(full).forEach(enqueue));
    } catch (e) {
      if (forceNews && e instanceof RouteLLMError && e.status === 400) {
        forceNews = false; // sağlayıcı zorunlu tool_choice'u desteklemiyorsa 'auto' ile tekrar dene
        round--;
        continue;
      }
      throw e;
    }
    forceNews = false;
    if (res.model && res.model !== modelUsed) console.log(`[beyin] istenen: ${model} → çalışan: ${res.model}`);
    modelUsed = res.model ?? modelUsed;
    console.log(`[zaman] tur ${round + 1} · ilk token ${res.firstTokenMs ?? '—'} ms · bitiş ${res.totalMs} ms · ${res.tool_calls.length ? 'araç: ' + res.tool_calls.map(c => c.function.name).join(', ') : res.content.length + ' karakter'}`);

    if (res.tool_calls.length) {
      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.tool_calls });
      // Aynı turdaki araçlar birbirinden bağımsız: paralel çalışır, sonuçlar sırayla eklenir.
      const outs = await Promise.all(res.tool_calls.map(async call => {
        const ts = Date.now();
        const out = await runTool(call.function.name, call.function.arguments, log);
        console.log(`[zaman] araç ${call.function.name} · ${Date.now() - ts} ms`);
        return out;
      }));
      res.tool_calls.forEach((call, i) => {
        toolText += '\n' + outs[i];
        messages.push({ role: 'tool', tool_call_id: call.id, content: outs[i] });
      });
      continue;
    }

    const content = res.content;
    const parsed = extractJson(content);

    // Bilinen sorun: bazı modeller araç çağrısını düz metin olarak yazıyor.
    if (isBrief && !toolText && !parser.count && /get_news/.test(content) && !parsed?.sahneler) {
      const out = await runTool('get_news', '{}', log);
      toolText += '\n' + out;
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `get_news aracının sonucu:\n${out}\n\nŞimdi bu verilere dayanarak cevabını şemaya uygun JSON olarak ver.` });
      continue;
    }

    // Akışta kaçan sahne kaldıysa (ör. nesne bölünmüş geldiyse) tam JSON'dan tamamla.
    const all: any[] = Array.isArray(parsed?.sahneler) ? parsed.sahneler : [];
    all.slice(parser.count).forEach(enqueue);

    if (!parser.count && !all.length) {
      if (!retriedJson) {
        retriedJson = true;
        console.warn(`JSON alınamadı, yeniden isteniyor: ${content.slice(0, 160).replace(/\s+/g, ' ')}`);
        messages.push({ role: 'assistant', content });
        // Model bu düzeltmeye "haklısınız, bundan sonra JSON vereceğim" diye cevap verip onu seslendiriyordu.
        messages.push({
          role: 'user',
          content: '[Sistem notu: Önceki cevabın şemaya uygun JSON değildi. Aynı cevabı, içeriğini değiştirmeden, yalnızca şemaya uygun JSON olarak yeniden yaz. Bu düzeltmeden, formattan ya da JSON\'dan hiç bahsetme; özür dileme.]',
        });
        continue;
      }
      // Son çare: düz metni tek sahne olarak göster.
      enqueue({ ses: content.slice(0, 400), gorsel: { tip: 'ikon', ikon: 'sparkles', baslik: 'Jarvis' } });
      return finish(content);
    }
    return finish(typeof parsed?.detay === 'string' ? parsed.detay : '');
  }
  throw new Error('Çok fazla tur; cevap üretilemedi');
}
