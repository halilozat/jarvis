// "İki alkışla uyanma": uyanış ayarları (tüm cihazlarda ortak), karşılama metni ve gerçek sistem kontrolleri.
import { API_KEY, BASE_URL, MOCK } from './routellm.js';
import { SOURCE_COUNT, newsCacheStats, newsSnapshot } from './news.js';
import type { Device } from './types.js';

export type WakeMode = 'clap+voice' | 'clap' | 'voice';
export type GreetingPeriod = 'sabah' | 'gun' | 'aksam';

export interface WakeConfig {
  /** Alkışla uyandır */
  enabled: boolean;
  mode: WakeMode;
  /** Mikrofonun açık olduğu tek cihaz */
  listener: Device;
  /** Karşılamayı seslendiren tek cihaz (yankı olmasın) */
  greeter: Device;
  /** Alkış eşiği: ortam seviyesinin kaç katı (3–20) */
  sens: number;
  /** Öğrenilmiş gizli ritim: alkışlar arası süreler (ms) */
  rhythm: number[] | null;
  rhythmOn: boolean;
  greetings: Record<GreetingPeriod, string>;
  briefOnWake: boolean;
  /** İşlem olmazsa kaç dakikada uykuya geçsin (0 = kapalı) */
  idleMinutes: number;
}

export const DEFAULT_WAKE: WakeConfig = {
  enabled: true,
  mode: 'clap+voice',
  listener: 'masaustu',
  greeter: 'masaustu',
  sens: 7,
  rhythm: null,
  rhythmOn: false,
  greetings: { sabah: 'Günaydın efendim.', gun: 'İyi günler efendim.', aksam: 'İyi akşamlar efendim.' },
  briefOnWake: false,
  idleMinutes: 5,
};

const DEVICES: Device[] = ['masaustu', 'tablet', 'telefon'];
const MODES: WakeMode[] = ['clap+voice', 'clap', 'voice'];
const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);
const text = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : d);

/** Gelen kısmi ayarı doğrular ve öncekiyle birleştirir; tanınmayan değer öncekini korur. */
export function mergeWake(prev: WakeConfig, p: any): WakeConfig {
  if (!p || typeof p !== 'object') return prev;
  const rhythm = Array.isArray(p.rhythm) && p.rhythm.length >= 1 && p.rhythm.length <= 6 && p.rhythm.every((x: unknown) => typeof x === 'number' && x >= 120 && x <= 2000)
    ? p.rhythm.map((x: number) => Math.round(x))
    : p.rhythm === null ? null : prev.rhythm;
  return {
    enabled: typeof p.enabled === 'boolean' ? p.enabled : prev.enabled,
    mode: MODES.includes(p.mode) ? p.mode : prev.mode,
    listener: DEVICES.includes(p.listener) ? p.listener : prev.listener,
    greeter: DEVICES.includes(p.greeter) ? p.greeter : prev.greeter,
    sens: 'sens' in p ? clamp(p.sens, 3, 20, prev.sens) : prev.sens,
    rhythm,
    rhythmOn: typeof p.rhythmOn === 'boolean' ? p.rhythmOn && !!rhythm : prev.rhythmOn && !!rhythm,
    greetings: {
      sabah: text(p.greetings?.sabah, prev.greetings.sabah),
      gun: text(p.greetings?.gun, prev.greetings.gun),
      aksam: text(p.greetings?.aksam, prev.greetings.aksam),
    },
    briefOnWake: typeof p.briefOnWake === 'boolean' ? p.briefOnWake : prev.briefOnWake,
    idleMinutes: 'idleMinutes' in p ? Math.round(clamp(p.idleMinutes, 0, 120, prev.idleMinutes)) : prev.idleMinutes,
  };
}

/** 05–12 günaydın, 12–18 iyi günler, 18–05 iyi akşamlar (İstanbul saatiyle). */
export function greetingPeriod(d = new Date()): GreetingPeriod {
  const h = Number(d.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' }));
  return h >= 5 && h < 12 ? 'sabah' : h >= 12 && h < 18 ? 'gun' : 'aksam';
}

// ---------------------------------------------------------------- Gerçek sistem kontrolleri

export interface Health {
  routellm: { ok: boolean; ms: number | null };
  sources: { ok: number; total: number; known: boolean };
  devices: { online: Device[]; total: number };
}

/** RouteLLM'e kısa ve taze bir istek (önbelleksiz): gerçek gecikme. */
async function pingRouteLLM(): Promise<{ ok: boolean; ms: number | null }> {
  if (MOCK || !API_KEY) return { ok: false, ms: null };
  const t0 = performance.now();
  try {
    const r = await fetch(`${BASE_URL}/models`, { headers: { Authorization: `Bearer ${API_KEY}` }, signal: AbortSignal.timeout(4000) });
    await r.arrayBuffer();
    return { ok: r.ok, ms: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, ms: null };
  }
}

export async function health(online: Device[]): Promise<Health> {
  // Haber kaynakları: son taramanın sonucu. Hiç tarama yoksa en fazla 2 sn bekle, gelmezse "bilinmiyor".
  let stats = newsCacheStats();
  if (!stats) {
    await Promise.race([newsSnapshot().catch(() => null), new Promise(r => setTimeout(r, 2000))]);
    stats = newsCacheStats();
  }
  return {
    routellm: await pingRouteLLM(),
    sources: { ok: stats?.scanned ?? 0, total: SOURCE_COUNT, known: !!stats },
    devices: { online, total: DEVICES.length },
  };
}
