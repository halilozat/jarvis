// Toplantı Odası · model seçimi. .env'de JARVIS_MODEL / FRIDAY_MODEL / JUDGE_MODEL varsa onlar. Yoksa beynin model
// listesinden: Jarvis'e hızlı bir sohbet modeli, Friday'e MÜMKÜNSE BAŞKA BİR AİLEDEN bir model (aynı model kendisiyle
// tartışınca hızla uzlaşır), hakeme ucuz/hızlı bir model. Sağlayıcıdan bağımsız (OpenAI uyumlu her API).
import { CHAT_MODEL, MOCK, routellm } from '../routellm.js';

export interface Modeller { jarvis: string; friday: string; hakem: string; ayniAile: boolean; kaynak: 'env' | 'otomatik' | 'demo' }

/** Model adından aile: claude, gpt, gemini, grok, llama, deepseek, qwen, mistral, kimi, glm */
export function aile(m: string): string {
  const k = m.toLowerCase();
  for (const a of ['claude', 'gpt', 'gemini', 'gemma', 'grok', 'llama', 'deepseek', 'qwen', 'mistral', 'kimi', 'glm', 'command']) if (k.includes(a)) return a === 'gemma' ? 'gemini' : a;
  if (/^o\d/.test(k)) return 'gpt';
  return k.split(/[-/:]/)[0];
}

/** Sürüm numarası (karşılaştırma için): "claude-sonnet-5-5" → [5,5]; tarih ekleri yok sayılır */
const surum = (m: string) => (m.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(n => n < 1000);
const yeni = (a: string, b: string) => { const x = surum(a), y = surum(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; } return b.length - a.length; };

/** Sohbete uygun olmayanlar */
const UYGUNSUZ = /image|audio|tts|transcribe|whisper|realtime|embed|vision-only|codex|-code|nano-banana|imagine|search|preview-tts|decision|custom_|router|route-llm|moderation|dall|sora|veo|grok/i;

/** Tercih kalıpları sırayla denenir; her kalıpta en yeni sürüm */
function sec(liste: string[], kaliplar: RegExp[], haric: (m: string) => boolean = () => false): string | null {
  const aday = liste.filter(m => !UYGUNSUZ.test(m) && !haric(m));
  for (const k of kaliplar) {
    const e = aday.filter(m => k.test(m)).sort((a, b) => yeni(b, a));
    if (e.length) return e[0];
  }
  return null;
}

// Canlı toplantıda ilk ses ≤ 1,5 sn hedefi: hızlı ilk token veren modeller önce (ölçüm: Abacus üzerinden gpt-*-luna,
// *-mini, flash-lite ≈ 1–1,3 sn ilk cümle; büyük modeller 2–3 sn, grok 6+ sn). Kalite isteyen .env'den büyük model seçer.
const JARVIS_TERCIH = [/gpt-\d+(\.\d+)?-luna$/i, /gpt-[\d.]+-mini$/i, /claude-haiku/i, /gemini-[\d.]+-flash$/i, /llama.*(70b|versatile)/i, /claude-sonnet/i, /gpt-\d+(\.\d+)?$/i, /deepseek.*v\d/i, /llama/i, /./];
const FRIDAY_TERCIH = [/deepseek.*flash/i, /claude-haiku/i, /gemini-[\d.]+-flash$/i, /gpt-[\d.]+-mini$/i, /qwen/i, /llama.*(70b|versatile)/i, /deepseek.*v\d/i, /claude-sonnet/i, /kimi/i, /llama/i, /./];
const HAKEM_TERCIH = [/flash-lite/i, /-nano$/i, /-mini$/i, /claude-haiku/i, /gemini-[\d.]+-flash$/i, /instant|8b|small/i];

export function modelleriSec(liste: string[], env: { jarvis?: string; friday?: string; hakem?: string } = {}, varsayilanSohbet = CHAT_MODEL): Modeller {
  const jarvis = env.jarvis || sec(liste, JARVIS_TERCIH) || varsayilanSohbet;
  const friday = env.friday || sec(liste, FRIDAY_TERCIH, m => aile(m) === aile(jarvis)) || sec(liste, [/./], m => m === jarvis) || jarvis;
  const hakem = env.hakem || sec(liste, HAKEM_TERCIH) || friday;
  return { jarvis, friday, hakem, ayniAile: aile(jarvis) === aile(friday), kaynak: env.jarvis && env.friday ? 'env' : 'otomatik' };
}

let onbellek: { t: number; m: Modeller } | null = null;
/** Beynin model listesini okuyup seçer (10 dk önbellek). Beyin yoksa demo. */
export async function modeller(): Promise<Modeller> {
  const env = { jarvis: process.env.JARVIS_MODEL?.trim(), friday: process.env.FRIDAY_MODEL?.trim(), hakem: process.env.JUDGE_MODEL?.trim() };
  if (MOCK) return { jarvis: 'demo', friday: 'demo', hakem: 'demo', ayniAile: false, kaynak: 'demo' };
  if (onbellek && Date.now() - onbellek.t < 600_000) return onbellek.m;
  let liste: string[] = [];
  if (!env.jarvis || !env.friday || !env.hakem) {
    try { const j = await routellm<any>('/models'); liste = (j.data ?? j).map((x: any) => String(x.id ?? x).replace(/^models\//, '')); } catch { /* liste yoksa sohbet modeli */ }
  }
  const tamEnv = !!(env.jarvis && env.friday && env.hakem);
  if (!liste.length && !tamEnv) {
    // Liste alınamadı (ağ hatası): son başarılı seçim korunur; yoksa yedek model. Kısa süre sonra yeniden denenir
    // (yedek seçim 10 dakika kalıcı olmasın: yavaş/yanlış modelle konuşmaya devam edilmesin)
    const m = sonIyi ?? modelleriSec(liste, env);
    console.warn(`[toplantı] model listesi alınamadı; ${sonIyi ? 'son seçim' : 'yedek model'} kullanılıyor, 30 sn sonra yeniden denenecek`);
    onbellek = { t: Date.now() - 570_000, m };
    return m;
  }
  const m = modelleriSec(liste, env);
  onbellek = { t: Date.now(), m };
  sonIyi = m;
  return m;
}
let sonIyi: Modeller | null = null;
export const modelOnbellekSifirla = () => { onbellek = null; sonIyi = null; };
