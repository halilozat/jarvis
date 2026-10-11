import 'dotenv/config';
// ElevenLabs seslendirme (isteğe bağlı). Beyin RouteLLM'de kalır; yalnızca ses ElevenLabs'ten gelir.
// Anahtar: server/.env → ELEVENLABS_API_KEY. Model: ELEVENLABS_MODEL (varsayılan eleven_v4_turbo).
//
// Neden daha doğal:
//  - Türkçe destekli modeller; Türkçe anadilli sesler seçilebilir (gpt-audio'nun sesleri İngilizce kökenli).
//  - previous_text / next_text: her cümle ayrı istek olsa da model önceki ve sonraki cümleyi bilir, tonlama
//    cümleden cümleye kopmaz (gpt-audio'da her sahne ayrı "anons" gibi okunuyordu).
//  - Hız sunucuda (voice_settings.speed) ayarlanır; tarayıcıda playbackRate ile esnetme (metalik iz) yok.

export const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || '';
export const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v4_turbo';
const API = 'https://api.elevenlabs.io/v1';

/** VoiceSel.model ElevenLabs modeli mi (ör. eleven_v4_turbo, eleven_multilingual_v2) */
export const isEleven = (model: string) => model.startsWith('eleven_');
export const elevenReady = () => !!ELEVEN_KEY;

const headers = () => ({ 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' });

/** Model, previous_text/next_text ya da language_code'u reddederse bir daha gönderilmez (model başına hafıza). */
const unsupported = new Map<string, Set<string>>();

export interface ElevenCtx { prev?: string; next?: string }

/** Hız: ElevenLabs 0,7–1,2 kabul eder. */
const clampSpeed = (s: number) => (Number.isFinite(s) ? Math.min(1.2, Math.max(0.7, s)) : 1);

export async function elevenSpeak(text: string, voiceId: string, model: string, speed: number, ctx: ElevenCtx = {}): Promise<Buffer> {
  const skip = unsupported.get(model) ?? new Set<string>();
  const body: Record<string, unknown> = {
    text,
    model_id: model,
    voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: clampSpeed(speed) },
  };
  if (!skip.has('language_code')) body.language_code = 'tr';
  if (!skip.has('context')) {
    if (ctx.prev) body.previous_text = ctx.prev.slice(-500);
    if (ctx.next) body.next_text = ctx.next.slice(0, 500);
  }
  const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (r.ok) return Buffer.from(await r.arrayBuffer());
  const err = await r.text().catch(() => '');
  // Desteklenmeyen alan: bir kez daha onsuz dene ve hatırla
  if (r.status === 400 || r.status === 422) {
    const field = /language_code/i.test(err) ? 'language_code' : /previous_text|next_text|context/i.test(err) ? 'context' : null;
    if (field && !skip.has(field)) {
      skip.add(field);
      unsupported.set(model, skip);
      console.warn(`[tts] ElevenLabs ${model}: ${field} desteklenmiyor, onsuz devam`);
      return elevenSpeak(text, voiceId, model, speed, ctx);
    }
  }
  throw new Error(`ElevenLabs HTTP ${r.status}: ${err.slice(0, 160)}`);
}

// ---------------------------------------------------------------- Sesler ve kullanım

export interface ElevenVoice { voice_id: string; name: string; labels?: Record<string, string>; category?: string; preview_url?: string }

let voiceCache: { at: number; list: ElevenVoice[] } | null = null;
/** Hesaptaki sesler ("My Voices"): Ayarlar'da listelenir. 5 dk önbellek. */
export async function elevenVoices(): Promise<ElevenVoice[]> {
  if (!ELEVEN_KEY) return [];
  if (voiceCache && Date.now() - voiceCache.at < 300_000) return voiceCache.list;
  try {
    const r = await fetch(`${API}/voices`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = ((await r.json()).voices ?? []) as ElevenVoice[];
    voiceCache = { at: Date.now(), list };
    return list;
  } catch (e) {
    console.warn('[tts] ElevenLabs ses listesi alınamadı:', e instanceof Error ? e.message : e);
    return voiceCache?.list ?? [];
  }
}

export interface ElevenUsage { used: number; limit: number; resetAt: string | null; tier: string }
/** Bu ayki karakter kullanımı (gerçek, ElevenLabs hesabından) */
export async function elevenUsage(): Promise<ElevenUsage | null> {
  if (!ELEVEN_KEY) return null;
  try {
    const r = await fetch(`${API}/user/subscription`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return {
      used: Number(j.character_count ?? 0),
      limit: Number(j.character_limit ?? 0),
      resetAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
      tier: String(j.tier ?? ''),
    };
  } catch {
    return null;
  }
}

/** Ses kütüphanesinde Türkçe sesler (npm run eleven) */
export async function elevenSearchTurkish(gender = 'male'): Promise<any[]> {
  const q = new URLSearchParams({ language: 'tr', gender, page_size: '30', sort: 'usage_character_count_1y' });
  const r = await fetch(`${API}/shared-voices?${q}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).voices ?? [];
}

/** Kütüphanedeki bir sesi hesaba ekler (API ile kullanılabilmesi için gerekli) */
export async function elevenAddShared(publicUserId: string, voiceId: string, name: string): Promise<string> {
  const r = await fetch(`${API}/voices/add/${encodeURIComponent(publicUserId)}/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ new_name: name }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  voiceCache = null;
  return (await r.json()).voice_id;
}

export const ELEVEN_MODEL_LABEL: Record<string, string> = {
  eleven_v4: 'ElevenLabs v4',
  eleven_v4_turbo: 'ElevenLabs v4 Turbo',
  eleven_v3: 'ElevenLabs v3',
  eleven_multilingual_v2: 'ElevenLabs Multilingual v2',
  eleven_flash_v2_5: 'ElevenLabs Flash',
};
