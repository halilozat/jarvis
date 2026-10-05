// Bekleme ekranındaki sabah panosu: hava (Open-Meteo), döviz (TCMB), haber istatistiği, sistem durumu.
// Kural: uydurma veri yok. Bir kaynak çökerse yalnızca o alan null döner; panel "veri alınamadı" der.
import { API_KEY, BASE_URL, MOCK } from './routellm.js';
import { SOURCE_COUNT, newsSnapshot } from './news.js';
import type { Device } from './types.js';

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
export interface Markets {
  items: MarketItem[];
  date: string;
  source: 'TCMB' | 'demo';
}

export interface NewsStats {
  total: number;
  sources_ok: number;
  sources_total: number;
  by_category: { category: string; count: number }[];
  headlines: { title: string; source: string; category: string }[];
}

export interface SystemStats {
  routellm_ms: number | null;
  routellm_ok: boolean;
  devices_online: Device[];
  model: string;
}

export interface Dashboard {
  weather: Weather | null;
  markets: Markets | null;
  news: NewsStats;
  system: SystemStats;
  updated_at: string;
  demo: boolean;
}

const TEN_MIN = 10 * 60_000;
const FETCH_TIMEOUT = 8000;

/**
 * Basit önbellek: başarılı sonucu `okMs`, başarısızlığı `failMs` boyunca tutar (kaynak çökükken her istekte
 * yeniden denenmesin). Aynı anda gelen istekler tek yüklemeyi paylaşır.
 */
function cached<T>(okMs: number, failMs: number, label: string, load: () => Promise<T | null>) {
  let at = 0;
  let value: T | null = null;
  let inflight: Promise<T | null> | null = null;
  return (): Promise<T | null> => {
    if (at && Date.now() - at < (value === null ? failMs : okMs)) return Promise.resolve(value);
    inflight ??= load()
      .catch(e => {
        console.warn(`Pano: ${label} alınamadı:`, e instanceof Error ? e.message : e);
        return null;
      })
      .then(v => {
        value = v;
        at = Date.now();
        inflight = null;
        return v;
      });
    return inflight;
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------- Hava: Open-Meteo (anahtarsız) ----------

// WMO hava kodu → Türkçe açıklama + ikon türü
const WMO: Record<number, [string, WeatherIcon]> = {
  0: ['Açık', 'acik'],
  1: ['Çoğunlukla açık', 'parcali'],
  2: ['Parçalı bulutlu', 'parcali'],
  3: ['Bulutlu', 'bulutlu'],
  45: ['Sisli', 'sis'],
  48: ['Kırağılı sis', 'sis'],
  51: ['Hafif çisenti', 'cisenti'],
  53: ['Çisenti', 'cisenti'],
  55: ['Yoğun çisenti', 'cisenti'],
  56: ['Dondurucu çisenti', 'cisenti'],
  57: ['Yoğun dondurucu çisenti', 'cisenti'],
  61: ['Hafif yağmur', 'yagmur'],
  63: ['Yağmurlu', 'yagmur'],
  65: ['Şiddetli yağmur', 'yagmur'],
  66: ['Dondurucu yağmur', 'yagmur'],
  67: ['Şiddetli dondurucu yağmur', 'yagmur'],
  71: ['Hafif kar', 'kar'],
  73: ['Karlı', 'kar'],
  75: ['Yoğun kar', 'kar'],
  77: ['Kar taneleri', 'kar'],
  80: ['Hafif sağanak', 'saganak'],
  81: ['Sağanak', 'saganak'],
  82: ['Şiddetli sağanak', 'saganak'],
  85: ['Kar sağanağı', 'kar'],
  86: ['Yoğun kar sağanağı', 'kar'],
  95: ['Gök gürültülü fırtına', 'firtina'],
  96: ['Dolulu fırtına', 'firtina'],
  99: ['Şiddetli dolulu fırtına', 'firtina'],
};
export const describeWeather = (code: number): [string, WeatherIcon] => WMO[code] ?? ['Bilinmiyor', 'bulutlu'];

export const getWeather = cached<Weather>(TEN_MIN, 60_000, 'hava', async () => {
  const city = process.env.WEATHER_CITY || 'İstanbul';
  const lat = Number(process.env.WEATHER_LAT || 41.01);
  const lon = Number(process.env.WEATHER_LON || 28.98);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
    '&timezone=Europe/Istanbul&forecast_days=1';
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  const j: any = await r.json();
  const c = j.current ?? {};
  const d = j.daily ?? {};
  const temp = num(c.temperature_2m), feels = num(c.apparent_temperature), code = num(c.weather_code), wind = num(c.wind_speed_10m);
  const max = num(d.temperature_2m_max?.[0]), min = num(d.temperature_2m_min?.[0]), dayCode = num(d.weather_code?.[0]);
  // Eksik alanı tahminle doldurmuyoruz: temel değerlerden biri yoksa panel "veri alınamadı" der.
  if (temp === null || feels === null || code === null || wind === null || max === null || min === null || dayCode === null) {
    throw new Error('Open-Meteo cevabında eksik alan');
  }
  const [description, icon] = describeWeather(code);
  return {
    city,
    temp,
    feels_like: feels,
    code,
    description,
    icon,
    wind,
    today: { max, min, rain_prob: num(d.precipitation_probability_max?.[0]), code: dayCode },
    updated_at: String(c.time ?? new Date().toISOString()),
  };
});

// ---------- Döviz: TCMB (anahtarsız) ----------

const CODES: CurrencyCode[] = ['USD', 'EUR', 'GBP'];
const NAMES: Record<CurrencyCode, string> = { USD: 'ABD Doları', EUR: 'Euro', GBP: 'İngiliz Sterlini' };
type Rates = Partial<Record<CurrencyCode, number>>;

/** TCMB XML'inden bülten tarihini (YYYY-MM-DD) ve döviz satış kurlarını okur. */
function parseTcmb(xml: string): { date: string; rates: Rates } | null {
  const t = /<Tarih_Date[^>]*\bTarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!t) return null;
  const rates: Rates = {};
  for (const code of CODES) {
    const block = new RegExp(`<Currency[^>]*\\bKod="${code}"[^>]*>([\\s\\S]*?)</Currency>`).exec(xml);
    const v = block && /<ForexSelling>\s*([\d.]+)\s*<\/ForexSelling>/.exec(block[1]);
    if (v) rates[code] = Number(v[1]);
  }
  return { date: `${t[3]}-${t[2]}-${t[1]}`, rates };
}

async function fetchTcmb(url: string): Promise<{ date: string; rates: Rates } | 'yok'> {
  const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: { 'User-Agent': 'Mozilla/5.0 (Jarvis)' } });
  if (r.status === 404) return 'yok'; // hafta sonu / resmi tatil: bülten yok
  if (!r.ok) throw new Error(`TCMB HTTP ${r.status}`);
  const parsed = parseTcmb(await r.text());
  if (!parsed) throw new Error('TCMB XML okunamadı');
  return parsed;
}

// Geçmiş günlerin bülteni değişmez: hem kurlar hem "bülten yok" sonucu kalıcı önbelleğe girer.
const archive = new Map<string, Rates | 'yok'>();

async function archiveDay(isoDate: string): Promise<Rates | 'yok' | null> {
  const hit = archive.get(isoDate);
  if (hit) return hit;
  const [y, m, d] = isoDate.split('-');
  try {
    const res = await fetchTcmb(`https://www.tcmb.gov.tr/kurlar/${y}${m}/${d}${m}${y}.xml`);
    const value = res === 'yok' ? 'yok' : res.rates;
    archive.set(isoDate, value);
    return value;
  } catch {
    return null; // ağ hatası: önbelleğe yazma, bir dahaki sefere tekrar dene
  }
}

const shiftDay = (iso: string, days: number) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

export const getMarkets = cached<Markets>(TEN_MIN, 60_000, 'TCMB kurları', async () => {
  const today = await fetchTcmb('https://www.tcmb.gov.tr/kurlar/today.xml');
  if (today === 'yok') throw new Error('TCMB today.xml bulunamadı');
  // Son 7 iş günü: bültenin tarihinden geriye en fazla 12 gün tara (paralel).
  const days = Array.from({ length: 12 }, (_, i) => shiftDay(today.date, -(i + 1)));
  const past = await Promise.all(days.map(async date => ({ date, rates: await archiveDay(date) })));
  const businessDays = past.filter((p): p is { date: string; rates: Rates } => !!p.rates && p.rates !== 'yok').slice(0, 6);

  const items: MarketItem[] = [];
  for (const code of CODES) {
    const value = today.rates[code];
    if (value === undefined) continue;
    const history = [
      ...businessDays
        .filter(p => p.rates[code] !== undefined)
        .map(p => ({ date: p.date, value: p.rates[code]! }))
        .reverse(),
      { date: today.date, value },
    ];
    const prev = history.length >= 2 ? history[history.length - 2].value : null;
    const change_pct = prev ? Math.round(((value - prev) / prev) * 10000) / 100 : null;
    items.push({ code, name: NAMES[code], value, change_pct, history });
  }
  if (!items.length) throw new Error('TCMB bülteninde USD/EUR/GBP yok');
  return { items, date: today.date, source: 'TCMB' };
});

// ---------- Haber istatistiği: news.ts önbelleğinden ----------

async function getNewsStats(): Promise<NewsStats> {
  try {
    const { items, scanned } = await newsSnapshot();
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    const seen = new Set<string>();
    const headlines: NewsStats['headlines'] = [];
    for (const it of items) {
      if (seen.has(it.title)) continue;
      seen.add(it.title);
      headlines.push({ title: it.title, source: it.source, category: it.category });
      if (headlines.length >= 15) break;
    }
    return {
      total: items.length,
      sources_ok: scanned,
      sources_total: SOURCE_COUNT,
      by_category: [...counts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      headlines,
    };
  } catch (e) {
    console.warn('Pano: haber istatistiği alınamadı:', e instanceof Error ? e.message : e);
    return { total: 0, sources_ok: 0, sources_total: SOURCE_COUNT, by_category: [], headlines: [] };
  }
}

// ---------- Sistem: RouteLLM gecikmesi ----------

const pingRouteLLM = cached<{ ms: number; ok: boolean }>(60_000, 60_000, 'RouteLLM gecikmesi', async () => {
  if (!API_KEY) return { ms: 0, ok: false };
  const t0 = performance.now();
  const r = await fetch(`${BASE_URL}/models`, { headers: { Authorization: `Bearer ${API_KEY}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  await r.arrayBuffer();
  return { ms: Math.round(performance.now() - t0), ok: r.ok };
});

// ---------- Demo modu: açıkça "demo" etiketli örnek veri ----------

function demoDashboard(devices: Device[]): Dashboard {
  const days = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  const series = (start: number, step: number) => days.map((date, i) => ({ date, value: Math.round((start + i * step) * 10000) / 10000 }));
  const item = (code: CurrencyCode, start: number, step: number): MarketItem => {
    const history = series(start, step);
    const [prev, last] = history.slice(-2).map(p => p.value);
    return { code, name: NAMES[code], value: last, change_pct: Math.round(((last - prev) / prev) * 10000) / 100, history };
  };
  const [description, icon] = describeWeather(2);
  return {
    demo: true,
    updated_at: new Date().toISOString(),
    weather: { city: 'Demo şehir', temp: 21, feels_like: 19, code: 2, description, icon, wind: 12, today: { max: 23, min: 15, rain_prob: 10, code: 2 }, updated_at: new Date().toISOString() },
    markets: { source: 'demo', date: days[days.length - 1], items: [item('USD', 41.6, 0.04), item('EUR', 48.9, 0.03), item('GBP', 55.8, -0.02)] },
    news: {
      total: 5,
      sources_ok: 4,
      sources_total: 4,
      by_category: [{ category: 'gundem', count: 2 }, { category: 'ekonomi', count: 2 }, { category: 'spor', count: 1 }],
      headlines: [
        { title: 'Demo: Merkez Bankası faiz kararını açıkladı', source: 'Demo Ajans', category: 'ekonomi' },
        { title: 'Demo: Dolar/TL haftayı yatay kapattı', source: 'Demo Finans', category: 'ekonomi' },
        { title: "Demo: İzmir'de 4,6 büyüklüğünde deprem", source: 'Demo Ajans', category: 'gundem' },
        { title: 'Demo: Milli takım kadrosu açıklandı', source: 'Demo Spor', category: 'spor' },
      ],
    },
    system: { routellm_ms: null, routellm_ok: false, devices_online: devices, model: 'demo' },
  };
}

export async function buildDashboard(opts: { devices: Device[]; model: string }): Promise<Dashboard> {
  if (MOCK) return demoDashboard(opts.devices);
  const [weather, markets, news, ping] = await Promise.all([getWeather(), getMarkets(), getNewsStats(), pingRouteLLM()]);
  return {
    demo: false,
    updated_at: new Date().toISOString(),
    weather,
    markets,
    news,
    system: { routellm_ms: ping?.ok ? ping.ms : null, routellm_ok: !!ping?.ok, devices_online: opts.devices, model: opts.model },
  };
}
