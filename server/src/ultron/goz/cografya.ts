// Ultron'un Gözü · coğrafya yardımcıları: mesafe (haversine), kara/deniz ayrımı (Natural Earth kıyı halkaları),
// bir noktanın Türkçe adı (en yakın bilinen yer ya da okyanus), bölge kutuları ve şehir koordinatı (Open-Meteo geocoding).
import { LAND } from '../../../../web/src/data/world';
import { yerListesi } from '../../worldPlaces.js';

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;

/** İki nokta arası büyük daire mesafesi (km) */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Kutu { ad: string; lamin: number; lamax: number; lomin: number; lomax: number }
export const icinde = (k: Kutu, lat: number, lon: number) => lat >= k.lamin && lat <= k.lamax && lon >= k.lomin && lon <= k.lomax;

/** Sabit bölgeler: Türkiye (hava sahası ve kara, kaba kutu) ve Amazon havzası */
export const BOLGE: Record<'turkiye' | 'amazon', Kutu> = {
  turkiye: { ad: 'Türkiye', lamin: 35.8, lamax: 42.2, lomin: 25.6, lomax: 44.9 },
  amazon: { ad: 'Amazon', lamin: -17, lamax: 5.5, lomin: -79, lomax: -44 },
};

// ---------------------------------------------------------------- Kara / deniz

/** Kıyı halkaları: [lon, lat, lon, lat, ...] (derece) + sınırlayıcı kutu (hızlı eleme için) */
const HALKALAR = LAND.map(s => {
  const p = s.split(',').map(Number);
  let lomin = 180, lomax = -180, lamin = 90, lamax = -90;
  for (let i = 0; i < p.length; i += 2) { lomin = Math.min(lomin, p[i]); lomax = Math.max(lomax, p[i]); lamin = Math.min(lamin, p[i + 1]); lamax = Math.max(lamax, p[i + 1]); }
  return { p, lomin, lomax, lamin, lamax };
});

/** Nokta karada mı (çift-tek kuralı; 110 m ölçekli kıyı, ~0,5° hassasiyet) */
export function karadaMi(lat: number, lon: number): boolean {
  let ic = false;
  for (const h of HALKALAR) {
    if (lon < h.lomin || lon > h.lomax || lat < h.lamin || lat > h.lamax) continue;
    const p = h.p;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ic = !ic;
    }
  }
  return ic;
}

/** Denizdeki bir noktanın okyanus/deniz adı (kaba kutular) */
export function denizAdi(lat: number, lon: number): string {
  if (lat > 66) return 'Kuzey Buz Denizi';
  if (lat < -60) return 'Güney Okyanusu';
  if (lat >= 30 && lat <= 46 && lon >= -6 && lon <= 36.5) return 'Akdeniz';
  if (lat >= 40.5 && lat <= 47 && lon >= 27 && lon <= 42) return 'Karadeniz';
  if (lat >= 12 && lat <= 30 && lon >= 32 && lon <= 44) return 'Kızıldeniz';
  if (lon >= 20 && lon <= 120 && lat < 25) return 'Hint Okyanusu';
  if (lon > -70 && lon < 20) return 'Atlas Okyanusu';
  if (lon >= -100 && lon <= -70 && lat > 8 && lat < 32) return 'Karayipler ve Meksika Körfezi';
  return 'Büyük Okyanus';
}

const TR_SEHIR: { ad: string; lat: number; lon: number }[] = [
  { ad: 'İstanbul', lat: 41.01, lon: 28.97 }, { ad: 'Ankara', lat: 39.93, lon: 32.86 }, { ad: 'İzmir', lat: 38.42, lon: 27.14 },
  { ad: 'Antalya', lat: 36.9, lon: 30.7 }, { ad: 'Van', lat: 38.5, lon: 43.38 }, { ad: 'Erzurum', lat: 39.9, lon: 41.27 },
  { ad: 'Trabzon', lat: 41.0, lon: 39.72 }, { ad: 'Adana', lat: 37.0, lon: 35.32 }, { ad: 'Konya', lat: 37.87, lon: 32.48 },
];

/** Bir noktanın Türkçe adı: karadaysa en yakın bilinen yer, denizdeyse okyanus/deniz */
export function noktaAdi(lat: number, lon: number): { ad: string; kara: boolean; km: number | null } {
  if (!karadaMi(lat, lon)) return { ad: denizAdi(lat, lon), kara: false, km: null };
  let en: { ad: string; km: number } | null = null;
  for (const y of [...yerListesi(), ...TR_SEHIR]) {
    const km = haversine(lat, lon, y.lat, y.lon);
    if (!en || km < en.km) en = { ad: y.ad, km };
  }
  return en ? { ad: en.ad, kara: true, km: Math.round(en.km) } : { ad: 'kara', kara: true, km: null };
}

// ---------------------------------------------------------------- Şehir koordinatı

const sehirOnbellek = new Map<string, { ad: string; lat: number; lon: number }>();
/** Şehir adından koordinat (Open-Meteo geocoding; anahtarsız). Kişisel veri gönderilmez: yalnızca şehir adı. */
export async function sehirBul(ad: string, f: typeof fetch = fetch): Promise<{ ad: string; lat: number; lon: number } | null> {
  const k = ad.trim().toLocaleLowerCase('tr');
  if (!k) return null;
  if (sehirOnbellek.has(k)) return sehirOnbellek.get(k)!;
  try {
    const r = await f(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ad.trim())}&count=1&language=tr`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { name: string; latitude: number; longitude: number }[] };
    const x = j.results?.[0];
    if (!x) return null;
    const s = { ad: x.name, lat: x.latitude, lon: x.longitude };
    sehirOnbellek.set(k, s);
    return s;
  } catch { return null; }
}

// ---------------------------------------------------------------- USGS yer adları → Türkçe

const ULKE: Record<string, string> = {
  Indonesia: 'Endonezya', Japan: 'Japonya', Chile: 'Şili', Peru: 'Peru', Mexico: 'Meksika', Philippines: 'Filipinler', 'New Zealand': 'Yeni Zelanda',
  'Papua New Guinea': 'Papua Yeni Gine', Tonga: 'Tonga', Fiji: 'Fiji', Vanuatu: 'Vanuatu', Alaska: 'Alaska', California: 'Kaliforniya', Greece: 'Yunanistan',
  Italy: 'İtalya', Iran: 'İran', Turkey: 'Türkiye', 'Türkiye': 'Türkiye', China: 'Çin', Taiwan: 'Tayvan', Russia: 'Rusya', Argentina: 'Arjantin', Colombia: 'Kolombiya',
  Ecuador: 'Ekvador', Guatemala: 'Guatemala', Hawaii: 'Hawaii', 'Puerto Rico': 'Porto Riko', Nevada: 'Nevada', Afghanistan: 'Afganistan', Pakistan: 'Pakistan',
  India: 'Hindistan', Nepal: 'Nepal', 'Solomon Islands': 'Solomon Adaları', 'Kermadec Islands': 'Kermadec Adaları', 'Aleutian Islands': 'Aleut Adaları',
  Bolivia: 'Bolivya', Myanmar: 'Myanmar', Iceland: 'İzlanda', Canada: 'Kanada', 'El Salvador': 'El Salvador', Nicaragua: 'Nikaragua', 'Costa Rica': 'Kosta Rika',
  Panama: 'Panama', Venezuela: 'Venezuela', 'Dominican Republic': 'Dominik Cumhuriyeti', Haiti: 'Haiti', Cuba: 'Küba', Albania: 'Arnavutluk', Romania: 'Romanya',
  Cyprus: 'Kıbrıs', Syria: 'Suriye', Iraq: 'Irak', Tajikistan: 'Tacikistan', Kyrgyzstan: 'Kırgızistan', Kazakhstan: 'Kazakistan', Uzbekistan: 'Özbekistan',
  'Northern Mariana Islands': 'Kuzey Mariana Adaları', Guam: 'Guam', Samoa: 'Samoa', 'American Samoa': 'Amerikan Samoası', 'Wallis and Futuna': 'Wallis ve Futuna',
  'South Sandwich Islands': 'Güney Sandwich Adaları', Oregon: 'Oregon', Washington: 'Washington', Utah: 'Utah', Texas: 'Teksas', Oklahoma: 'Oklahoma', Montana: 'Montana',
  Idaho: 'Idaho', Wyoming: 'Wyoming', 'New Mexico': 'New Mexico', Arizona: 'Arizona', Kansas: 'Kansas', 'Mid-Atlantic Ridge': 'Orta Atlantik Sırtı', CA: 'Kaliforniya', NV: 'Nevada', AK: 'Alaska', HI: 'Hawaii',
};
const YON: Record<string, string> = { N: 'kuzeyinde', S: 'güneyinde', E: 'doğusunda', W: 'batısında', NE: 'kuzeydoğusunda', NW: 'kuzeybatısında', SE: 'güneydoğusunda', SW: 'güneybatısında' };
const SESLI = 'aeıioöuü';
/** Özel ada ilgi eki: Taliwang → Taliwang'ın, Hicks Bay → Hicks Bay'in, Kobe → Kobe'nin */
export function ilgiEki(ad: string): string {
  const k = ad.toLocaleLowerCase('tr');
  const v = [...k].reverse().find(c => SESLI.includes(c)) ?? 'e';
  const ek = ({ a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' } as Record<string, string>)[v];
  return `${ad}'${SESLI.includes(k.at(-1) ?? '') ? 'n' : ''}${ek}`;
}
/** "204 km S of Taliwang, Indonesia" → "Endonezya'da, Taliwang'ın 204 km güneyinde". Bilinmeyen biçim olduğu gibi kalır. */
export function usgsYer(p: string): string {
  const ulke = (u: string) => ULKE[u.trim()] ?? u.trim();
  const m = p.match(/^(\d+) km ([NSEW]{1,3}) of (.+?)(?:, (.+))?$/);
  if (m) {
    const yon = YON[m[2].length === 3 ? m[2].slice(1) : m[2]] ?? 'yakınında';
    const u = m[4] ? ulke(m[4]) : null;
    return `${u ? `${u}, ` : ''}${ilgiEki(m[3])} ${m[1]} km ${yon}`;
  }
  return p.replace(/^(south|north|east|west) of (the )?/i, '').replace(/ region$/i, ' bölgesi').split(', ').map(ulke).join(', ');
}
