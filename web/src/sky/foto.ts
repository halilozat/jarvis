// Gece Gökyüzü · fotoğraf girişi: EXIF'ten çekim zamanı, konum ve odak uzaklığı (exifr), küçültme ve yeniden kodlama.
// Yeniden kodlanan JPEG'de EXIF/GPS kalmaz; sunucu yine de üst veriyi siler (server/src/gok.ts).
import exifr from 'exifr';
import { CITIES } from '../data/cities';
import type { Konum } from './gezegen';

/** astrometry.net'e giden görüntünün uzun kenarı */
export const UZUN_KENAR = 2000;

export interface Fotograf {
  /** Sunucuya gidecek JPEG (data URL, EXIF'siz) */
  resim: string;
  /** Ekranda gösterilecek (aynı görüntü, object URL) */
  url: string;
  w: number;
  h: number;
  /** EXIF DateTimeOriginal (saat dilimi biliniyorsa onunla) */
  cekim: Date | null;
  saatDilimi: 'exif' | 'tarayici' | null;
  /** EXIF GPS */
  konum: Konum | null;
  /** 35 mm eşdeğeri odak uzaklığından yatay görüş aralığı (derece), yoksa null */
  olcek: [number, number] | null;
  odak35: number | null;
}

/** "2026:11:02 21:15:03" + "+03:00" → Date */
function exifTarih(s: unknown, ofset: unknown): { t: Date; dilim: Fotograf['saatDilimi'] } | null {
  if (s instanceof Date) return { t: s, dilim: 'tarayici' };
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s ?? ''));
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const o = /^[+-]\d{2}:\d{2}$/.test(String(ofset ?? '')) ? String(ofset) : null;
  const t = new Date(o ? iso + o : iso); // ofset yoksa tarayıcının saat dilimi
  return Number.isNaN(t.getTime()) ? null : { t, dilim: o ? 'exif' : 'tarayici' };
}

/** 35 mm eşdeğeri odak (köşegen 43,27 mm'ye göre) → görüntü GENİŞLİĞİNİN gördüğü açı */
export function genislikAcisi(odak35: number, w: number, h: number): number {
  const genMm = (43.27 * w) / Math.hypot(w, h);
  return (2 * Math.atan(genMm / (2 * odak35)) * 180) / Math.PI;
}

export async function fotografHazirla(dosya: Blob): Promise<Fotograf> {
  let ex: Record<string, any> | undefined;
  try {
    ex = await exifr.parse(dosya, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false, reviveValues: false, translateValues: false });
  } catch { ex = undefined; }
  const tarih = exifTarih(ex?.DateTimeOriginal ?? ex?.CreateDate, ex?.OffsetTimeOriginal ?? ex?.OffsetTime);
  // exifr gps: true iken latitude/longitude ondalık derece olarak hesaplanır
  let gps: Konum | null = null;
  try {
    const g = await exifr.gps(dosya);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude) && !(g.latitude === 0 && g.longitude === 0)) gps = { lat: g.latitude, lon: g.longitude };
  } catch { /* GPS yok */ }

  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(dosya, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Bu fotoğraf biçimi tarayıcıda açılamadı (HEIC ise JPEG olarak paylaşın ya da kamerayla doğrudan çekin).'); }
  const k = Math.min(1, UZUN_KENAR / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('görüntü kodlanamadı'))), 'image/jpeg', 0.92));
  const resim = await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });

  const odak35 = Number(ex?.FocalLengthIn35mmFormat) || null;
  let olcek: Fotograf['olcek'] = null;
  if (odak35 && odak35 > 8 && odak35 < 400) {
    const a = genislikAcisi(odak35, w, h);
    olcek = [Math.max(1, a * 0.7), Math.min(170, a * 1.3)];
  }
  return { resim, url: URL.createObjectURL(blob), w, h, cekim: tarih?.t ?? null, saatDilimi: tarih?.dilim ?? null, konum: gps, olcek, odak35 };
}

/** Tarayıcı konumu (izin gerekir); 8 sn içinde gelmezse null */
export function tarayiciKonumu(): Promise<Konum | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise(ok => {
    const t = setTimeout(() => ok(null), 8000);
    navigator.geolocation.getCurrentPosition(
      p => { clearTimeout(t); ok({ lat: p.coords.latitude, lon: p.coords.longitude, yukseklik: p.coords.altitude ?? 0 }); },
      () => { clearTimeout(t); ok(null); },
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 7500 },
    );
  });
}

/** Elle şehir seçimi (il merkezleri) */
export const SEHIRLER = Object.entries(CITIES)
  .filter(([ad]) => !['ısparta', 'izmit', 'urfa', 'bodrum'].includes(ad))
  .map(([ad, [lon, lat]]) => ({ ad: ad.charAt(0).toLocaleUpperCase('tr') + ad.slice(1), konum: { lat, lon } as Konum }))
  .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

/** En yakın il merkezi (konumu insanca yazmak için) */
export function yakinSehir(k: Konum): string {
  let en = SEHIRLER[0], d = Infinity;
  for (const s of SEHIRLER) { const x = (s.konum.lat - k.lat) ** 2 + ((s.konum.lon - k.lon) * Math.cos((k.lat * Math.PI) / 180)) ** 2; if (x < d) { d = x; en = s; } }
  return Math.sqrt(d) < 1.2 ? en.ad : `${k.lat.toFixed(2)}°, ${k.lon.toFixed(2)}°`;
}
