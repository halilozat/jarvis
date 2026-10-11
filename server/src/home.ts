// Akıllı ev: Türk kahve makinesi, filtre kahve makinesi, salon ışığı, çalışma odası ışığı.
// Varsayılan SİMÜLASYON: durum sunucuda tutulur, kahve makineleri gerçekçi sürede ilerler.
// Home Assistant bağlanırsa (HOME_ASSISTANT_URL + HOME_ASSISTANT_TOKEN + HA_ENTITIES) ışıklar ve prizler gerçekten
// açılır/kapanır. Not: HA köprüsü gerçek cihazla denenmedi (11 Ekim 2026).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DeviceId = 'turk_kahve' | 'filtre_kahve' | 'salon_isik' | 'calisma_isik';
export type Kopuk = 'az' | 'orta' | 'bol';
export type Seker = 'sade' | 'az' | 'orta' | 'sekerli';
export type IsikTon = 'sicak' | 'notr' | 'soguk';

interface Base { id: DeviceId; ad: string; oda: string; updated: number }
export interface Light extends Base { tur: 'isik'; acik: boolean; parlaklik: number; ton: IsikTon }
export interface TurkishCoffee extends Base {
  tur: 'turk_kahve';
  durum: 'beklemede' | 'hazirlaniyor' | 'hazir';
  kopuk: Kopuk; seker: Seker;
  /** Hazırlık başlangıcı ve süresi (ms): istemci ilerlemeyi kendisi hesaplar */
  basladi: number | null; sure: number;
}
export interface FilterCoffee extends Base {
  tur: 'filtre_kahve';
  durum: 'beklemede' | 'demleniyor' | 'sicak_tutuyor';
  fincan: number;
  basladi: number | null; sure: number;
}
export type HomeDevice = Light | TurkishCoffee | FilterCoffee;

const TURK_MS = 75_000; // gerçek Türk kahve makineleri ~1,5-2 dk
const FILTRE_MS_PER_CUP = 40_000;

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'home.json');

// ---------------------------------------------------------------- Home Assistant köprüsü (isteğe bağlı)

const HA_URL = (process.env.HOME_ASSISTANT_URL || '').replace(/\/$/, '');
const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN || '';
/** HA_ENTITIES="salon_isik=light.salon,calisma_isik=light.calisma,turk_kahve=switch.kahve_priz,filtre_kahve=switch.filtre_priz" */
const HA_MAP: Partial<Record<DeviceId, string>> = Object.fromEntries(
  (process.env.HA_ENTITIES || '').split(',').map(x => x.trim().split('=')).filter(p => p.length === 2 && p[1].includes('.')),
);
export const homeMode = (): 'simulasyon' | 'homeassistant' => (HA_URL && HA_TOKEN && Object.keys(HA_MAP).length ? 'homeassistant' : 'simulasyon');
export const isReal = (id: DeviceId) => homeMode() === 'homeassistant' && !!HA_MAP[id];

async function ha(domainService: string, data: object): Promise<void> {
  const r = await fetch(`${HA_URL}/api/services/${domainService}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Home Assistant HTTP ${r.status}`);
}
const KELVIN: Record<IsikTon, number> = { sicak: 2700, notr: 4000, soguk: 6000 };
async function pushReal(d: HomeDevice) {
  const entity = HA_MAP[d.id];
  if (!entity || homeMode() !== 'homeassistant') return;
  const domain = entity.split('.')[0];
  if (d.tur === 'isik') {
    if (d.acik && domain === 'light') await ha('light/turn_on', { entity_id: entity, brightness_pct: d.parlaklik, color_temp_kelvin: KELVIN[d.ton] });
    else await ha(`${domain}/${d.acik ? 'turn_on' : 'turn_off'}`, { entity_id: entity });
  } else {
    // Kahve makineleri akıllı prizle: hazırlanırken/demlenirken/sıcak tutarken açık
    const on = d.durum === 'hazirlaniyor' || d.durum === 'demleniyor' || d.durum === 'sicak_tutuyor';
    await ha(`${domain}/${on ? 'turn_on' : 'turn_off'}`, { entity_id: entity });
  }
}

// ---------------------------------------------------------------- Durum

const now = () => Date.now();
function defaults(): Record<DeviceId, HomeDevice> {
  return {
    salon_isik: { id: 'salon_isik', ad: 'Salon ışığı', oda: 'Salon', tur: 'isik', acik: false, parlaklik: 80, ton: 'sicak', updated: now() },
    calisma_isik: { id: 'calisma_isik', ad: 'Çalışma odası ışığı', oda: 'Çalışma odası', tur: 'isik', acik: false, parlaklik: 100, ton: 'notr', updated: now() },
    turk_kahve: { id: 'turk_kahve', ad: 'Türk kahve makinesi', oda: 'Mutfak', tur: 'turk_kahve', durum: 'beklemede', kopuk: 'bol', seker: 'sade', basladi: null, sure: TURK_MS, updated: now() },
    filtre_kahve: { id: 'filtre_kahve', ad: 'Filtre kahve makinesi', oda: 'Mutfak', tur: 'filtre_kahve', durum: 'beklemede', fincan: 2, basladi: null, sure: 2 * FILTRE_MS_PER_CUP, updated: now() },
  };
}
const devices: Record<DeviceId, HomeDevice> = (() => {
  const d = defaults();
  try {
    const saved = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    for (const k of Object.keys(d) as DeviceId[]) if (saved[k]?.tur === d[k].tur) d[k] = { ...d[k], ...saved[k] };
  } catch { /* ilk açılış */ }
  // Sunucu kapanırken yarım kalan hazırlık: beklemeye dön
  for (const x of Object.values(d)) if (x.tur !== 'isik' && x.basladi && now() - x.basladi > x.sure * 2) Object.assign(x, { durum: 'beklemede', basladi: null });
  return d;
})();
const save = () => { try { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(devices, null, 2)); } catch { /* yok say */ } };

let notify: (e: object) => void = () => {};
export function initHome(broadcast: (e: object) => void) { notify = broadcast; resumeTimers(); }

export const homeState = () => ({ mode: homeMode(), devices: Object.values(devices), real: Object.keys(HA_MAP) });
const timers = new Map<DeviceId, ReturnType<typeof setTimeout>>();

function changed(d: HomeDevice, ozet: string) {
  d.updated = now();
  save();
  notify({ type: 'home', ...homeState(), last: { id: d.id, ozet } });
  pushReal(d).catch(e => console.warn(`[ev] Home Assistant: ${d.ad} gönderilemedi · ${(e as Error).message}`));
  console.log(`[ev] ${d.ad} · ${ozet}${isReal(d.id) ? ' (Home Assistant)' : ' (simülasyon)'}`);
}

function schedule(d: TurkishCoffee | FilterCoffee) {
  clearTimeout(timers.get(d.id));
  if (!d.basladi) return;
  const left = Math.max(0, d.basladi + d.sure - now());
  timers.set(d.id, setTimeout(() => {
    if (d.tur === 'turk_kahve') { d.durum = 'hazir'; changed(d, 'kahve hazır'); }
    else { d.durum = 'sicak_tutuyor'; changed(d, 'demleme bitti, sıcak tutuyor'); }
  }, left));
}
function resumeTimers() { for (const d of Object.values(devices)) if (d.tur !== 'isik' && (d.durum === 'hazirlaniyor' || d.durum === 'demleniyor')) schedule(d); }

// ---------------------------------------------------------------- İşlemler

export interface HomeAction {
  islem: 'ac' | 'kapat' | 'ayarla' | 'pisir' | 'demle' | 'durum';
  parlaklik?: number; ton?: IsikTon; kopuk?: Kopuk; seker?: Seker; fincan?: number;
}

const clampInt = (n: unknown, lo: number, hi: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : undefined);
const TON_AD: Record<IsikTon, string> = { sicak: 'sıcak', notr: 'nötr', soguk: 'soğuk' };

/** Tek cihaza işlem. Hata varsa { hata } döner. */
export function control(id: DeviceId, a: HomeAction): { cihaz: HomeDevice; ozet: string } | { hata: string } {
  const d = devices[id];
  if (!d) return { hata: 'böyle bir cihaz yok' };
  if (a.islem === 'durum') return { cihaz: d, ozet: 'durum' };
  if (d.tur === 'isik') {
    const p = clampInt(a.parlaklik, 1, 100);
    if (a.islem === 'kapat') d.acik = false;
    else { d.acik = true; if (p) d.parlaklik = p; if (a.ton && TON_AD[a.ton]) d.ton = a.ton; }
    const ozet = d.acik ? `açık · %${d.parlaklik} · ${TON_AD[d.ton]}` : 'kapalı';
    changed(d, ozet);
    return { cihaz: d, ozet };
  }
  if (d.tur === 'turk_kahve') {
    if (a.kopuk && ['az', 'orta', 'bol'].includes(a.kopuk)) d.kopuk = a.kopuk;
    if (a.seker && ['sade', 'az', 'orta', 'sekerli'].includes(a.seker)) d.seker = a.seker;
    if (a.islem === 'kapat') { Object.assign(d, { durum: 'beklemede', basladi: null }); clearTimeout(timers.get(id)); }
    else if (a.islem === 'pisir' || a.islem === 'ac') {
      if (d.durum === 'hazirlaniyor') return { cihaz: d, ozet: 'zaten hazırlanıyor' };
      Object.assign(d, { durum: 'hazirlaniyor', basladi: now(), sure: TURK_MS });
      schedule(d);
    }
    const ozet = d.durum === 'hazirlaniyor' ? `hazırlanıyor · ${d.kopuk} köpüklü · ${d.seker === 'sekerli' ? 'şekerli' : d.seker}` : d.durum === 'hazir' ? 'kahve hazır' : 'beklemede';
    changed(d, ozet);
    return { cihaz: d, ozet };
  }
  // Filtre kahve
  const f = clampInt(a.fincan, 1, 4);
  if (f) d.fincan = f;
  if (a.islem === 'kapat') { Object.assign(d, { durum: 'beklemede', basladi: null }); clearTimeout(timers.get(id)); }
  else if (a.islem === 'demle' || a.islem === 'ac' || a.islem === 'pisir') {
    if (d.durum === 'demleniyor') return { cihaz: d, ozet: 'zaten demleniyor' };
    Object.assign(d, { durum: 'demleniyor', basladi: now(), sure: d.fincan * FILTRE_MS_PER_CUP });
    schedule(d);
  }
  const ozet = d.durum === 'demleniyor' ? `demleniyor · ${d.fincan} fincan` : d.durum === 'sicak_tutuyor' ? 'sıcak tutuyor' : 'beklemede';
  changed(d, ozet);
  return { cihaz: d, ozet };
}

/** "salon ışığı", "çalışma odası", "türk kahvesi", "filtre" → cihaz */
export function resolveDevice(s: string): DeviceId | null {
  const t = s.toLocaleLowerCase('tr');
  if (/çalışma|calisma|ofis|oda/.test(t) && /ışı|isi|lamba|oda|çalışma/.test(t) && !/salon/.test(t)) return 'calisma_isik';
  if (/salon|oturma/.test(t)) return 'salon_isik';
  if (/filtre/.test(t)) return 'filtre_kahve';
  if (/türk|turk|kahve/.test(t)) return 'turk_kahve';
  return null;
}
