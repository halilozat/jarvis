import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saglayici, type Rol, type Saglayici, type SaglayiciId } from './providers.js';

// Beyin ayarı: hangi sağlayıcı, hangi anahtar, hangi modeller. Kaynak sırası:
//   1) server/data/beyin.json (Ayarlar → Beyin'den kaydedilir; gizli, git'e girmez)
//   2) .env: AI_PROVIDER + AI_API_KEY (+ AI_BASE_URL), geriye uyum için ABACUS_API_KEY
//   3) hiçbiri: DEMO modu (hazır cevaplar + ücretsiz gerçek veriler)
// Değerler `export let`: uygulama çalışırken sağlayıcı değişince bütün modüller yeni değeri okur (ESM canlı bağ).

export interface BeyinAyari {
  saglayici: SaglayiciId;
  anahtar: string;
  /** Yalnızca özel sağlayıcıda zorunlu */
  adres?: string;
  modeller?: Partial<Record<Rol, string>>;
}
interface BeyinDosyasi extends Partial<BeyinAyari> { demo?: boolean; guncellendi?: string }

export const BEYIN_DOSYA = process.env.BEYIN_DOSYA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'beyin.json');

export let PROVIDER: Saglayici = saglayici('abacus')!;
export let BASE_URL = '';
export let API_KEY = '';
export let CHAT_MODEL = '';
/** Kamera ve kitaplık taraması */
export let VISION_MODEL = '';
/** Sohbette gönderilen fotoğraf (Abacus'ta varsayılan CHAT_MODEL: route-llm görsel girdiyi kendisi yönlendirir) */
export let PHOTO_MODEL = '';
/** Boş = sunucuda ses tanıma yok (tarayıcının ses tanıması) */
export let STT_MODEL = '';
/** /audio/speech modeli (OpenAI) */
export let TTS_MODEL = '';
/** Temsili görsel üretimi; boş = kapalı */
export let IMAGE_MODEL = '';
export let MOCK = true;
/** Ayar nereden geldi */
export let KAYNAK: 'dosya' | 'env' | 'demo' | 'yok' = 'yok';

const dinleyiciler: (() => void)[] = [];
/** Sağlayıcı değişince (önbellekler sıfırlansın); kayıt anında bir kez de çalışır */
export const beyinDinle = (fn: () => void) => { dinleyiciler.push(fn); fn(); };

function envAyari(): BeyinAyari | null {
  const e = process.env;
  const m = { chat: e.CHAT_MODEL, vision: e.VISION_MODEL, stt: e.STT_MODEL, tts: undefined as string | undefined };
  if (e.AI_API_KEY && (saglayici(e.AI_PROVIDER) || e.AI_BASE_URL)) {
    const id = saglayici(e.AI_PROVIDER)?.id ?? 'ozel';
    // Abacus'ta TTS_MODEL ses kataloğundaki modeldir (tts.ts okur); /audio/speech'te ise modelin kendisi
    if (saglayici(id)?.tts === 'speech') m.tts = e.TTS_MODEL;
    // Eski .env'deki Abacus model adları başka sağlayıcıda çalışmaz
    for (const k of ['chat', 'vision', 'stt'] as const) if (/^route-llm/i.test(m[k] ?? '')) m[k] = undefined;
    return { saglayici: id, anahtar: e.AI_API_KEY, adres: e.AI_BASE_URL, modeller: m };
  }
  if (e.ABACUS_API_KEY) return { saglayici: 'abacus', anahtar: e.ABACUS_API_KEY, adres: e.ROUTELLM_BASE_URL, modeller: m };
  return null;
}

export function beyinDosyasi(): BeyinDosyasi | null {
  try { return JSON.parse(fs.readFileSync(BEYIN_DOSYA, 'utf8')); } catch { return null; }
}

/** Ayarı uygular (null = demo). Model boşsa sağlayıcının varsayılanı. */
export function beyinUygula(cfg: BeyinAyari | null, kaynak: typeof KAYNAK) {
  const s = (cfg && saglayici(cfg.saglayici)) || saglayici('abacus')!;
  const m = cfg?.modeller ?? {};
  const v = s.varsayilan;
  PROVIDER = s;
  API_KEY = cfg?.anahtar?.trim() ?? '';
  BASE_URL = (cfg?.adres?.trim() || s.baseUrl).replace(/\/+$/, '');
  CHAT_MODEL = m.chat || v.chat || '';
  // Sohbet modeli görüntü de anlıyorsa (Gemini, OpenAI, Claude) seçilen sohbet modeli; ayrı görüntü modeli varsa (Groq, Abacus) o
  VISION_MODEL = m.vision || (v.vision && v.vision !== v.chat ? v.vision : CHAT_MODEL);
  PHOTO_MODEL = s.id === 'abacus' ? m.vision || CHAT_MODEL : VISION_MODEL;
  STT_MODEL = s.stt ? m.stt || v.stt || '' : '';
  TTS_MODEL = s.tts === 'speech' ? m.tts || v.tts || '' : '';
  IMAGE_MODEL = s.gorselUretim ? process.env.IMAGE_MODEL ?? s.gorselUretim : '';
  MOCK = process.env.MOCK === '1' || !API_KEY || !BASE_URL || !CHAT_MODEL;
  KAYNAK = MOCK ? (kaynak === 'yok' ? 'yok' : 'demo') : kaynak;
  for (const fn of dinleyiciler) { try { fn(); } catch { /* dinleyici hatası ayarı bozmaz */ } }
}

/** Dosya → env → demo */
export function beyinYukle() {
  const d = beyinDosyasi();
  if (d?.demo) return beyinUygula(null, 'demo');
  if (d?.saglayici && d.anahtar) return beyinUygula(d as BeyinAyari, 'dosya');
  const e = envAyari();
  beyinUygula(e, e ? 'env' : 'yok');
}

/** Ayarı kaydeder ve hemen uygular. `null` = demoyu seç (anahtar silinir). */
export function beyinKaydet(cfg: BeyinAyari | null) {
  fs.mkdirSync(path.dirname(BEYIN_DOSYA), { recursive: true });
  const veri: BeyinDosyasi = cfg ? { ...cfg, guncellendi: new Date().toISOString() } : { demo: true, guncellendi: new Date().toISOString() };
  fs.writeFileSync(BEYIN_DOSYA, JSON.stringify(veri, null, 2), { mode: 0o600 });
  beyinYukle();
}

/** Kurulum ekranındaki ayarı siler: .env'e döner */
export function beyinSifirla() {
  fs.rmSync(BEYIN_DOSYA, { force: true });
  beyinYukle();
}

/** Sağlayıcının istediği başlıklar (Anthropic: x-api-key + sürüm) */
export const yetki = (anahtar = API_KEY, s = PROVIDER): Record<string, string> => ({ Authorization: `Bearer ${anahtar}`, ...s.basliklar?.(anahtar) });

beyinYukle();

export class RouteLLMError extends Error {
  constructor(public status: number, public body: string) {
    super(`Model servisi ${status}: ${body.slice(0, 300)}`);
  }
}

export async function routellm<T = any>(path: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { ...yetki(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new RouteLLMError(res.status, text);
  return JSON.parse(text) as T;
}

export interface StreamResult {
  content: string;
  tool_calls: NonNullable<ChatMessage['tool_calls']>;
  model: string | null;
  /** İsteğin gönderilmesinden ilk içerik/araç parçasına kadar geçen süre */
  firstTokenMs: number | null;
  totalMs: number;
}

/**
 * Akışlı sohbet isteği (`stream: true`). İçerik geldikçe `onContent` çağrılır; araç çağrıları parçalardan birleştirilir.
 * Sahne JSON'u bu sayede tamamı bitmeden okunmaya başlar (ilk sahne hazır olunca TTS'i başlar).
 */
export async function routellmStream(body: object, onContent?: (delta: string, full: string) => void, signal?: AbortSignal): Promise<StreamResult> {
  const t0 = performance.now();
  const res = await fetch(BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: { ...yetki(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
    signal, // Toplantı Odası: kullanıcı araya girince üretim iptal edilir
  });
  if (!res.ok || !res.body) throw new RouteLLMError(res.status, await res.text());
  const dec = new TextDecoder();
  let buf = '';
  let content = '';
  let model: string | null = null;
  let firstTokenMs: number | null = null;
  const calls: { id: string; name: string; args: string }[] = [];
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j: any;
      try { j = JSON.parse(data); } catch { continue; }
      model ??= j.model ?? null;
      const d = j.choices?.[0]?.delta ?? {};
      if ((d.content || d.tool_calls) && firstTokenMs === null) firstTokenMs = Math.round(performance.now() - t0);
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? 0;
        calls[i] ??= { id: '', name: '', args: '' };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
      if (typeof d.content === 'string' && d.content) {
        content += d.content;
        onContent?.(d.content, content);
      }
    }
  }
  return {
    content,
    tool_calls: calls.filter(Boolean).map((c, i) => ({ id: c.id || `call_${i}`, type: 'function' as const, function: { name: c.name, arguments: c.args } })),
    model,
    firstTokenMs,
    totalMs: Math.round(performance.now() - t0),
  };
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | ContentPart[];
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ChatResponse {
  model?: string;
  choices: {
    message: ChatMessage & {
      audio?: { data: string };
      audios?: { id: string; data: string; expires_at: number; transcript: string }[];
    };
    finish_reason: string;
  }[];
}
