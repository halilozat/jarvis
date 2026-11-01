// Yapay zekâ sağlayıcıları. Jarvis'in bütün model çağrıları OpenAI uyumlu tek bir kapıdan geçer
// (/chat/completions, /models, /audio/transcriptions, /audio/speech); sağlayıcı = adres + anahtar + model seçimi.
// Model adları zamanla değiştiği için sabit ad yerine TERCİH KALIPLARI tutulur: bağlantı testinde sağlayıcının
// /models listesinden kalıba uyan en yeni model seçilir; liste alınamazsa `varsayilan` kullanılır.
//
// Yetenekler:
//   stt: 'transcriptions' (Whisper türü /audio/transcriptions) · 'chat-audio' (ses girdili sohbet modeli) ·
//        null (sunucuda ses tanıma yok: tarayıcının kendi ses tanıması kullanılır)
//   tts: 'speech' (/audio/speech) · 'chat-audio' (Abacus'un ses çıkışlı modelleri, ses kataloğu) ·
//        null (sağlayıcıda seslendirme yok: ElevenLabs anahtarı varsa o, yoksa tarayıcı sesi)

export type SaglayiciId = 'abacus' | 'openai' | 'gemini' | 'groq' | 'anthropic' | 'openrouter' | 'ozel';
export type Rol = 'chat' | 'vision' | 'stt' | 'tts';

export interface Saglayici {
  id: SaglayiciId;
  ad: string;
  /** Kurulum ekranındaki tek satır */
  aciklama: string;
  /** Kart istemeyen ücretsiz katmanı var */
  ucretsiz: boolean;
  baseUrl: string;
  /** Anahtarın alındığı sayfa */
  anahtarAdresi: string;
  stt: 'transcriptions' | 'chat-audio' | null;
  tts: 'speech' | 'chat-audio' | null;
  /** /models listesinden seçim: her rol için kalıplar, öncelik sırasıyla (aynı kalıbın içinde en yeni ad) */
  tercih: Partial<Record<Rol, RegExp[]>>;
  /** Liste alınamazsa */
  varsayilan: Partial<Record<Rol, string>>;
  /** Seslendirme sesleri (tts: 'speech') */
  sesler?: string[];
  /** Varsayılan ek başlıklar (Anthropic'in OpenAI uyumlu ucu x-api-key de bekler) */
  basliklar?: (anahtar: string) => Record<string, string>;
  /** Kullanıcı adres girer (özel) */
  adresGirilir?: boolean;
  /** Sağlayıcıya özel: görsel üretim modeli (yalnızca Abacus) */
  gorselUretim?: string;
}

export const SAGLAYICILAR: Saglayici[] = [
  {
    id: 'gemini', ad: 'Google Gemini', ucretsiz: true,
    aciklama: 'Ücretsiz anahtar (kart istemez). Türkçe, görüntü ve ses tanıma güçlü; seslendirme tarayıcıdan.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    anahtarAdresi: 'https://aistudio.google.com/apikey',
    stt: 'chat-audio', tts: null,
    tercih: { chat: [/^gemini-\d+(\.\d+)?-flash$/], vision: [/^gemini-\d+(\.\d+)?-flash$/], stt: [/^gemini-\d+(\.\d+)?-flash$/] },
    varsayilan: { chat: 'gemini-2.5-flash', vision: 'gemini-2.5-flash', stt: 'gemini-2.5-flash' },
  },
  {
    id: 'groq', ad: 'Groq', ucretsiz: true,
    aciklama: 'Ücretsiz anahtar, çok hızlı cevap ve ücretsiz ses tanıma (Whisper); seslendirme tarayıcıdan.',
    baseUrl: 'https://api.groq.com/openai/v1',
    anahtarAdresi: 'https://console.groq.com/keys',
    stt: 'transcriptions', tts: null,
    tercih: {
      chat: [/^openai\/gpt-oss-120b$/, /^llama-3\.3-70b-versatile$/, /llama.*70b/],
      vision: [/llama-4-maverick/, /llama-4-scout/],
      stt: [/^whisper-large-v3-turbo$/, /^whisper-large-v3$/],
    },
    varsayilan: { chat: 'llama-3.3-70b-versatile', vision: 'meta-llama/llama-4-scout-17b-16e-instruct', stt: 'whisper-large-v3-turbo' },
  },
  {
    id: 'openai', ad: 'OpenAI', ucretsiz: false,
    aciklama: 'Ücretli. Sohbet, görüntü, ses tanıma ve doğal seslendirme tek anahtarla.',
    baseUrl: 'https://api.openai.com/v1',
    anahtarAdresi: 'https://platform.openai.com/api-keys',
    stt: 'transcriptions', tts: 'speech',
    tercih: {
      chat: [/^gpt-5(\.\d+)?-mini$/, /^gpt-4\.1-mini$/, /^gpt-4o-mini$/],
      vision: [/^gpt-5(\.\d+)?-mini$/, /^gpt-4\.1-mini$/, /^gpt-4o-mini$/],
      stt: [/^gpt-4o-mini-transcribe$/, /^whisper-1$/],
      tts: [/^gpt-4o-mini-tts$/, /^tts-1$/],
    },
    varsayilan: { chat: 'gpt-4o-mini', vision: 'gpt-4o-mini', stt: 'whisper-1', tts: 'gpt-4o-mini-tts' },
    sesler: ['onyx', 'ash', 'echo', 'fable', 'alloy', 'nova', 'coral', 'sage', 'shimmer'],
  },
  {
    id: 'anthropic', ad: 'Anthropic Claude', ucretsiz: false,
    aciklama: 'Ücretli. Güçlü sohbet ve görüntü; ses tanıma ve seslendirme tarayıcıdan.',
    baseUrl: 'https://api.anthropic.com/v1',
    anahtarAdresi: 'https://console.anthropic.com/settings/keys',
    stt: null, tts: null,
    tercih: { chat: [/^claude-sonnet-\d/, /^claude-.*sonnet/, /^claude-haiku-\d/, /^claude-.*haiku/], vision: [/^claude-sonnet-\d/, /^claude-.*sonnet/] },
    varsayilan: { chat: 'claude-sonnet-5-5', vision: 'claude-sonnet-5-5' },
    basliklar: anahtar => ({ 'x-api-key': anahtar, 'anthropic-version': '2023-06-01' }),
  },
  {
    id: 'openrouter', ad: 'OpenRouter', ucretsiz: false,
    aciklama: 'Tek anahtarla yüzlerce model (bazıları ücretsiz). Seslendirme tarayıcıdan.',
    baseUrl: 'https://openrouter.ai/api/v1',
    anahtarAdresi: 'https://openrouter.ai/keys',
    stt: null, tts: null,
    tercih: {},
    varsayilan: { chat: 'openrouter/auto', vision: 'openrouter/auto' },
    basliklar: () => ({ 'HTTP-Referer': 'https://github.com/halilozat/jarvis', 'X-Title': 'Jarvis' }),
  },
  {
    id: 'abacus', ad: 'Abacus.AI RouteLLM', ucretsiz: false,
    aciklama: 'Ücretli (ChatLLM aboneliği). Her soruyu en uygun modele yönlendirir; ses modelleri ve görsel üretim dahil.',
    baseUrl: 'https://routellm.abacus.ai/v1',
    anahtarAdresi: 'https://apps.abacus.ai/chatllm/admin/profile',
    stt: 'chat-audio', tts: 'chat-audio',
    tercih: {},
    varsayilan: { chat: 'route-llm', vision: 'gemini-3.8-flash', stt: 'gemini-2.5-flash' },
    gorselUretim: 'flux2',
  },
  {
    id: 'ozel', ad: 'Özel (OpenAI uyumlu)', ucretsiz: false,
    aciklama: 'OpenAI uyumlu herhangi bir servis (DeepSeek, Mistral, Together, yerel Ollama …): adres ve model elle.',
    baseUrl: '', anahtarAdresi: '', adresGirilir: true,
    stt: null, tts: null,
    tercih: {},
    varsayilan: {},
  },
];

export const saglayici = (id: string | undefined | null): Saglayici | undefined => SAGLAYICILAR.find(s => s.id === id);

/**
 * /models listesinden rol için model: kalıplar öncelik sırasıyla; aynı kalıba uyanlardan sürümü en yeni olan
 * (adın sayıları büyükten küçüğe karşılaştırılır: gemini-3.5-flash > gemini-2.5-flash). Uyan yoksa varsayılan.
 */
export function modelSec(s: Saglayici, rol: Rol, liste: string[]): string | undefined {
  // Tarih ekleri (20250929) sürüm sayılmaz: claude-sonnet-4-5-… > claude-sonnet-4-…
  const sayilar = (m: string) => (m.match(/\d+(\.\d+)?/g) ?? []).map(Number).filter(n => n < 1000);
  const yeni = (a: string, b: string) => {
    const x = sayilar(a), y = sayilar(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    return a.length - b.length;
  };
  // Sohbet/görüntü için deneme, hafif ve ses türevleri elenir; ses rollerinde kalıp zaten ses modelini adlandırır
  const sesRolu = rol === 'stt' || rol === 'tts';
  for (const re of s.tercih[rol] ?? []) {
    const uyan = liste.filter(m => re.test(m) && (sesRolu || !/preview|exp|lite|nano|audio|realtime|search|tts|transcribe/i.test(m))).sort(yeni);
    if (uyan.length) return uyan[0];
  }
  return s.varsayilan[rol];
}

/** /models cevabından model kimlikleri (Gemini "models/gemini-…" yazar: önek atılır) */
export const modelKimlikleri = (j: unknown): string[] => {
  const d = (j as { data?: { id?: unknown }[] })?.data ?? (j as { models?: { id?: unknown; name?: unknown }[] })?.models ?? [];
  return [...new Set(d.map(m => String((m as { id?: unknown }).id ?? (m as { name?: unknown }).name ?? '').replace(/^models\//, '')).filter(Boolean))];
};
