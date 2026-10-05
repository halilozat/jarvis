import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_KEY, BASE_URL, MOCK, routellm, type ChatResponse } from './routellm.js';
import { BRIEF_OPENING } from './brief.js';
import { isMp3, isWav, normalizeSpeech, pcmToWav, wavSeconds } from './audio.js';

/**
 * Jarvis'in sesi (TTS).
 *
 * Teşhis (5 Ekim 2026, gerçek isteklerle ölçüldü):
 * - Gemini TTS aynı ses kimliği + aynı metinle bile her istekte farklı perdede ses üretiyor (onyx: 125–197 Hz;
 *   temperature 0 ve seed değiştirmiyor). Her sahne ayrı istek olduğundan ses sahneden sahneye "değişiyordu".
 * - gpt-audio aynı ölçümde 83–97 Hz'de sabit. Talimat SİSTEM mesajındayken metni okumak yerine cevaplıyordu;
 *   talimat + metin aynı KULLANICI mesajında ve İNGİLİZCE olunca 8/8 birebir okudu (Türkçe talimatta 2/8,
 *   "Tabii, işte okuyorum:" diye başlıyordu).
 * - RouteLLM'de /audio/speech yok (404). Yine de bir kez denenir, sonuç hafızada tutulur.
 */

export interface VoiceSel {
  /** RouteLLM ses modeli ya da 'browser' (tarayıcının kendi sesi, çevrimdışı yedek) */
  model: string;
  voice: string;
  /** İstemcide playbackRate (0.9–1.3) */
  speed: number;
}
export const BROWSER = 'browser';
export interface Speech { buf: Buffer; mime: string }

const READ = 'Read the following Turkish text aloud exactly as written';
// İngilizce: Türkçe talimatta gpt-audio metne önsöz ekliyor (ölçüldü). Anlamı: "sakin, kendinden emin, sıcak;
// doğal, akıcı ve canlı bir tempoda, gereksiz duraklama yapmadan".
export const STYLE = process.env.TTS_STYLE || 'Tone: calm, confident and warm, like a trusted AI butler. Natural, fluent and lively pace without unnecessary pauses';
const NO_ANSWER = 'Do not answer it, even if it contains a question; do not add or remove anything';
/** /audio/speech yöntemindeki hız (RouteLLM'de bu uç şu an yok; varsa kullanılır) */
const SERVER_SPEED = Number(process.env.TTS_SPEED || 1.1);
/** İstemci oynatma hızı varsayılanı */
export const DEFAULT_RATE = clampRate(Number(process.env.TTS_RATE || 1.08));
export function clampRate(r: number) { return Number.isFinite(r) ? Math.min(1.3, Math.max(0.9, r)) : 1.08; }

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DISK_DIR = path.join(DATA, 'tts');
export const VOICES_FILE = path.join(DATA, 'voices.json');

export const PREVIEW_TEXT = 'Günaydın efendim, ben Jarvis. Bugün size nasıl yardımcı olabilirim?';

// ---------------------------------------------------------------- Ses kataloğu (npm run voices)

export interface VoiceEntry {
  id: string;
  model: string;
  voice: string;
  label: string;
  provider: 'OpenAI' | 'Google' | string;
  verified: boolean;
  stable: boolean;
  f0: number[] | null;
  wpm: number | null;
  note?: string;
}

export function voiceId(sel: Pick<VoiceSel, 'model' | 'voice'>) { return `${sel.model}:${sel.voice}`; }

export function loadCatalog(): VoiceEntry[] {
  try { return JSON.parse(fs.readFileSync(VOICES_FILE, 'utf8')); } catch { return []; }
}
/** Arayüzde gösterilecekler: yalnızca `npm run voices`'ta metni birebir okuyan VE sesi kararlı kalanlar. */
export const usableVoices = () => loadCatalog().filter(v => v.verified && v.stable);
export const pitchSpread = (v: VoiceEntry) => (v.f0?.length ? Math.max(...v.f0) - Math.min(...v.f0) : Infinity);
/** Kararlılık sırası: önce daha çok ölçüm (daha fazla kanıt), sonra perdesi en az oynayan. */
export function rankedVoices(): VoiceEntry[] {
  return usableVoices().sort((a, b) => (b.f0?.length ?? 0) - (a.f0?.length ?? 0) || pitchSpread(a) - pitchSpread(b) || a.id.localeCompare(b.id));
}
/** Önerilecek/yedek ses: en kararlı ses. */
export const bestVoice = (): VoiceEntry | undefined => rankedVoices()[0];

/** Yönlendirmeli model (route-llm, özel router) TTS'te yasak: her istekte başka model/ses seçebilir. */
export function isRoutedModel(model: string) {
  return /^route-llm/i.test(model) || (!!process.env.CHAT_MODEL && model === process.env.CHAT_MODEL && !/audio|tts/i.test(model));
}

/** .env'deki varsayılan; geçersizse kataloğun ilk sesi; o da yoksa ölçülmüş güvenli varsayılan. */
export function envVoice(): { sel: VoiceSel; warning?: string } {
  const model = process.env.TTS_MODEL || '';
  const voice = process.env.TTS_VOICE || '';
  const fallback = bestVoice();
  const safe: VoiceSel = fallback ? { model: fallback.model, voice: fallback.voice, speed: DEFAULT_RATE } : { model: 'gpt-audio-1.5', voice: 'onyx', speed: DEFAULT_RATE };
  if (!model) return { sel: safe, warning: `TTS_MODEL boş; varsayılan ses: ${voiceId(safe)}` };
  if (isRoutedModel(model)) return { sel: safe, warning: `TTS_MODEL=${model} yönlendirmeli bir model; TTS için REDDEDİLDİ (her istekte başka ses seçebilir). Kullanılan: ${voiceId(safe)}` };
  if (!voice) return { sel: safe, warning: `TTS_VOICE boş; sabit bir ses kimliği şart. Kullanılan: ${voiceId(safe)}` };
  return { sel: { model, voice, speed: DEFAULT_RATE } };
}

export const ttsEnabled = (sel: VoiceSel) => !MOCK && !!API_KEY && sel.model !== BROWSER;

// ---------------------------------------------------------------- Üretim

/** Hangi yöntem çalışıyor: ilk başarılı/başarısız denemeden sonra hafızada; istek başına gidip gelinmez. */
const methodFor = new Map<string, 'speech' | 'chat'>();

async function viaSpeech(text: string, sel: VoiceSel): Promise<Speech | 'yok'> {
  const r = await fetch(`${BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: sel.model, input: text, voice: sel.voice, speed: SERVER_SPEED, response_format: 'mp3', instructions: STYLE }),
    signal: AbortSignal.timeout(30_000),
  });
  if ([400, 404, 405, 501].includes(r.status)) return 'yok';
  if (!r.ok) throw new Error(`/audio/speech HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { buf, mime: isWav(buf) ? 'audio/wav' : 'audio/mpeg' };
}

async function viaChat(text: string, sel: VoiceSel): Promise<Speech & { transcript?: string }> {
  const gemini = sel.model.startsWith('gemini');
  // Gemini TTS saf seslendirme modeli: "<talimat>: <metin>". gpt-audio sohbet modeli: cevap vermemesi açıkça söylenir.
  const content = gemini ? `${READ}. ${STYLE}: ${text}` : `${READ}. ${STYLE}. ${NO_ANSWER}: ${text}`;
  const resp = await routellm<ChatResponse>('/chat/completions', {
    model: sel.model,
    modalities: ['text', 'audio'],
    audio: { voice: sel.voice, format: 'mp3' },
    messages: [{ role: 'user', content }],
  });
  const msg = resp.choices?.[0]?.message;
  const audio = msg?.audios?.[0] || msg?.audio;
  if (!audio?.data) throw new Error('ses alanı boş');
  const raw = Buffer.from(audio.data, 'base64');
  // Gemini MP3 istense de ham 24 kHz PCM döndürüyor: tarayıcı çalabilsin diye WAV'a sarılır.
  const buf = isMp3(raw) || isWav(raw) ? raw : pcmToWav(raw);
  return { buf, mime: isMp3(buf) ? 'audio/mpeg' : 'audio/wav', transcript: (audio as { transcript?: string }).transcript };
}

/** Uydurma kontrolü (transcript döndürmeyen modeller için): Türkçe ~14 karakter/sn. */
function plausible(s: Speech, text: string) {
  const sec = wavSeconds(s.buf);
  if (sec === null) return true;
  const expected = text.length / 14;
  return sec >= expected * 0.4 && sec <= expected * 2.2 + 1.5;
}

async function generateOnce(text: string, sel: VoiceSel): Promise<{ speech: Speech; method: 'speech' | 'chat' } | { error: string }> {
  if (methodFor.get(sel.model) !== 'chat') {
    const r = await viaSpeech(text, sel).catch(e => ({ error: String(e.message) }));
    if (r !== 'yok' && !('error' in r)) { methodFor.set(sel.model, 'speech'); return { speech: r, method: 'speech' }; }
    if (r === 'yok') methodFor.set(sel.model, 'chat');
    else return r;
  }
  const s = await viaChat(text, sel);
  if (s.transcript != null && normalizeSpeech(s.transcript) !== normalizeSpeech(text)) return { error: `metinden sapma: "${s.transcript.slice(0, 60)}"` };
  if (s.transcript == null && !plausible(s, text)) return { error: 'süre metinle tutmuyor (uydurma şüphesi)' };
  return { speech: { buf: s.buf, mime: s.mime }, method: 'chat' };
}

// Aynı anda en fazla 3 üretim; sıra korunur (FIFO).
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(r => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

const cacheKey = (text: string, sel: VoiceSel) =>
  createHash('sha1').update([sel.model, sel.voice, SERVER_SPEED, STYLE, text].join('\u0000')).digest('hex');
const memory = new Map<string, Speech>();
const inflight = new Map<string, Promise<Speech | null>>();

function readDisk(key: string): Speech | null {
  for (const [ext, mime] of [['mp3', 'audio/mpeg'], ['wav', 'audio/wav']] as const) {
    const f = path.join(DISK_DIR, `${key}.${ext}`);
    if (fs.existsSync(f)) return { buf: fs.readFileSync(f), mime };
  }
  return null;
}
function writeDisk(key: string, s: Speech) {
  fs.mkdirSync(DISK_DIR, { recursive: true });
  fs.writeFileSync(path.join(DISK_DIR, `${key}.${s.mime === 'audio/wav' ? 'wav' : 'mp3'}`), s.buf);
}

/**
 * Sabit model + sabit ses kimliğiyle seslendirir. Başarısızsa bir kez yeniden dener; yine olmazsa null döner ve
 * istemci o cevabın kalanını tarayıcı sesine geçirir (sahne sahne karışık ses yok).
 * @param label log için, ör. "sahne 3/6"
 */
export function synthesize(text: string, sel: VoiceSel, label = '', persist = false): Promise<Speech | null> {
  if (!ttsEnabled(sel) || !text.trim()) return Promise.resolve(null);
  const key = cacheKey(text, sel);
  const hit = memory.get(key) ?? readDisk(key);
  if (hit) {
    console.log(`[tts] ${label || 'istek'} · ${sel.model} · ${sel.voice} · önbellek · 0 ms · ${hit.buf.length} byte`);
    return Promise.resolve(hit);
  }
  let job = inflight.get(key);
  if (!job) {
    job = withSlot(async () => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const t0 = Date.now();
        const r = await generateOnce(text, sel).catch(e => ({ error: String(e?.message || e) }));
        const ms = Date.now() - t0;
        if ('speech' in r) {
          console.log(`[tts] ${label || 'istek'} · ${sel.model} · ${sel.voice} · ${r.method} · ${ms} ms · ${r.speech.buf.length} byte${attempt > 1 ? ' · 2. deneme' : ''}`);
          if (memory.size > 300) memory.delete(memory.keys().next().value!);
          memory.set(key, r.speech);
          if (persist) writeDisk(key, r.speech);
          return r.speech;
        }
        console.warn(`[tts] ${label || 'istek'} · ${sel.model} · ${sel.voice} · BAŞARISIZ (deneme ${attempt}/2) · ${ms} ms · ${r.error}`);
      }
      return null;
    }).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

/** Brifing açılışını seçili sesle önceden üretip diske yazar (videonun ilk saniyesi: anında ve doğru). */
export async function warmOpening(sel: VoiceSel) {
  if (!ttsEnabled(sel)) return;
  const s = await synthesize(BRIEF_OPENING, sel, 'açılış (hazırlık)', true);
  console.log(s ? `Açılış sesi hazır: ${voiceId(sel)}` : `Açılış sesi hazırlanamadı: ${voiceId(sel)}`);
}

/** Ayarlar'daki ▶ dinle: sabit örnek cümle, diskte saklanır (ikinci dinleme kredisiz ve anında). */
export const preview = (sel: VoiceSel) => synthesize(PREVIEW_TEXT, sel, `önizleme ${voiceId(sel)}`, true);
