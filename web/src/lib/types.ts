export type Device = 'masaustu' | 'tablet' | 'telefon';

export interface Photo { url: string; credit: string; kind: 'haber' | 'stok' | 'temsili' | 'wiki' }

export type Gorsel = (
  | { tip: 'yok' }
  | { tip: 'baslik'; kategori?: string; metin: string; kaynaklar?: string[] }
  | { tip: 'sayi'; deger: number; birim?: string; etiket: string; yon?: 'yukari' | 'asagi' | 'sabit'; kaynak?: string }
  | { tip: 'grafik'; baslik: string; seri: { etiket: string; deger: number }[]; birim?: string; kaynak?: string }
  | { tip: 'harita'; sehirler: string[]; etiket: string; noktalar?: { ad: string; lat: number; lon: number }[] }
  | { tip: 'karsilastirma'; olay: string; taraflar: { kaynak: string; ozet: string }[] }
  | { tip: 'zaman'; olaylar: { zaman: string; metin: string }[] }
  | { tip: 'liste'; baslik: string; maddeler: string[] }
  | { tip: 'ikon'; ikon: string; baslik: string; alt?: string }
  | { tip: 'kart'; baslik: string; maddeler: { ikon: string; metin: string }[] }
  | { tip: 'adimlar'; baslik: string; adimlar: string[] }
  | { tip: 'alinti'; metin: string; kaynak: string }
  | { tip: 'kisi_yer'; baslik: string; ozet: string }
) & { haber_id?: string; foto_arama?: string; wiki?: string; foto?: Photo | null };

/** Seslendiren. model 'browser' = tarayıcının kendi sesi (çevrimdışı yedek). */
export interface VoiceSel { model: string; voice: string; speed: number }
export interface VoiceOption { id: string; model: string; voice: string; label: string; provider: string; wpm: number | null; f0: number | null }

export interface Sahne { ses: string; gorsel: Gorsel }

export interface JarvisReply {
  id: string;
  sahneler: Sahne[];
  detay: string;
  model: string | null;
  tool_log: string[];
  device: Device;
  created_at: string;
  /** Cevaba sabitlenen ses */
  voice?: VoiceSel;
  /** İstekte kullanılan model (route-llm ya da Jarvis router'ı); `model` gerçekten çalışan alt model */
  router?: string;
}

export interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  device: Device;
  at: string;
  reply?: JarvisReply;
}

export type CoreState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type ServerEvent =
  | { type: 'presence'; online: Device[] }
  | { type: 'user'; message: StoredMessage; origin: string }
  | { type: 'progress'; line: string; origin: string }
  | { type: 'opening'; text: string; voice: VoiceSel; origin: string }
  | { type: 'scene'; replyId: string; index: number; sahne: Sahne; voice: VoiceSel; origin: string }
  | { type: 'scene_update'; replyId: string; index: number; foto: Photo; origin: string }
  | { type: 'scene_end'; replyId: string; count: number; origin: string }
  | { type: 'reply'; message: StoredMessage; origin: string }
  | { type: 'error'; error: string; origin: string }
  | { type: 'handoff'; from: Device | null; to: Device; toClient: string }
  | { type: 'settings'; photoMode: 'haber' | 'video'; voice: VoiceSel; sfx: boolean; wake: WakeConfig }
  | { type: 'attention'; ms: number; by: Device }
  | { type: 'attention_end' }
  | { type: 'wake'; at: number; greeting: { period: GreetingPeriod; text: string }; greeter: Device; brief: boolean; voice: VoiceSel; via: string }
  | { type: 'sleep' }
  | { type: 'dashboard'; data: Dashboard }
  | { type: 'cleared' };

// ---------- İki alkışla uyanma (server/src/wake.ts ile aynı şekil) ----------
export type WakeMode = 'clap+voice' | 'clap' | 'voice';
export type GreetingPeriod = 'sabah' | 'gun' | 'aksam';
export interface WakeConfig {
  enabled: boolean;
  mode: WakeMode;
  listener: Device;
  greeter: Device;
  sens: number;
  rhythm: number[] | null;
  rhythmOn: boolean;
  greetings: Record<GreetingPeriod, string>;
  briefOnWake: boolean;
  idleMinutes: number;
}
export interface Health {
  routellm: { ok: boolean; ms: number | null };
  sources: { ok: number; total: number; known: boolean };
  devices: { online: Device[]; total: number };
}

// ---------- Sabah panosu (server/src/dashboard.ts ile aynı şekil) ----------
export type WeatherIcon = 'acik' | 'parcali' | 'bulutlu' | 'sis' | 'cisenti' | 'yagmur' | 'kar' | 'saganak' | 'firtina';

export interface Weather {
  city: string;
  temp: number;
  feels_like: number;
  code: number;
  description: string;
  icon: WeatherIcon;
  wind: number;
  today: { max: number; min: number; rain_prob: number | null; code: number };
  updated_at: string;
}

export type CurrencyCode = 'USD' | 'EUR' | 'GBP';
export interface MarketItem {
  code: CurrencyCode;
  name: string;
  value: number;
  change_pct: number | null;
  history: { date: string; value: number }[];
}
export interface Markets { items: MarketItem[]; date: string; source: 'TCMB' | 'demo' }

export interface NewsStats {
  total: number;
  sources_ok: number;
  sources_total: number;
  by_category: { category: string; count: number }[];
  headlines: { title: string; source: string; category: string }[];
}

export interface SystemStats { routellm_ms: number | null; routellm_ok: boolean; devices_online: Device[]; model: string }

export interface Dashboard {
  weather: Weather | null;
  markets: Markets | null;
  news: NewsStats;
  system: SystemStats;
  updated_at: string;
  demo: boolean;
}

export const CATEGORY_LABEL: Record<string, string> = {
  gundem: 'Gündem',
  ekonomi: 'Ekonomi',
  dunya: 'Dünya',
  teknoloji: 'Teknoloji',
  spor: 'Spor',
  saglik: 'Sağlık',
  bilim: 'Bilim',
  'kultur-sanat': 'Kültür',
};

export const DEVICE_LABEL: Record<Device, string> = { masaustu: 'Masaüstü', tablet: 'Tablet', telefon: 'Telefon' };
