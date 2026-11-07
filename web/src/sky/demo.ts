// Gece Gökyüzü · internetsiz demo (?gok=demo): repodaki örnek fotoğraf (web/public/gok/ornek.jpg) ve örnek çözüm
// (ornek.json). Çözüm GERÇEK bir astrometry.net işinin (16000502, herkese açık; Akrep–Yay bölgesi, 48°) WCS'i ve
// annotations'ıdır; görüntü ise o WCS ile katalogdan üretilmiş SENTETİK bir fotoğraftır (ekranda "ÖRNEK" yazar).
// Çekim anı, Jüpiter'in Antares'in yanında olduğu bir gece seçildi: 5 Temmuz 2019, 22:30 İstanbul.
import type { Cozum } from './api';
import { gokCisimleri, type Konum } from './gezegen';
import type { Katalog } from './katalog';
import { gokPiksel, wcsOku, wcsOlcekle, type Wcs } from './wcs';

export interface Ornek { cekim: string; konum: Konum; yer: string; not: string; cozum: Cozum }

export async function ornekYukle(): Promise<{ ornek: Ornek; foto: Blob }> {
  const [o, f] = await Promise.all([
    fetch('/gok/ornek.json').then(r => { if (!r.ok) throw new Error('örnek çözüm yok'); return r.json(); }),
    fetch('/gok/ornek.jpg').then(r => { if (!r.ok) throw new Error('örnek fotoğraf yok'); return r.blob(); }),
  ]);
  return { ornek: o, foto: f };
}

// ---------------------------------------------------------------- Örnek fotoğrafı üretme (bir kez; ?gok=ornek-uret)

/** Tekrarlanabilir rastgele (mulberry32) */
function rastgele(tohum: number) {
  return () => { tohum |= 0; tohum = (tohum + 0x6d2b79f5) | 0; let t = Math.imul(tohum ^ (tohum >>> 15), 1 | tohum); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const RAD = Math.PI / 180;
/** Galaktik (l, b) → ekvatoral J2000 (derece) */
function galaktiktenEkv(l: number, b: number): [number, number] {
  const aN = 192.85948 * RAD, dN = 27.12825 * RAD, lN = 122.93192 * RAD;
  const L = l * RAD, B = b * RAD;
  const sd = Math.sin(B) * Math.sin(dN) + Math.cos(B) * Math.cos(dN) * Math.cos(lN - L);
  const ra = aN + Math.atan2(Math.cos(B) * Math.sin(lN - L), Math.sin(B) * Math.cos(dN) - Math.cos(B) * Math.sin(dN) * Math.cos(lN - L));
  return [((ra / RAD) % 360 + 360) % 360, Math.asin(sd) / RAD];
}

/** Sentetik gece fotoğrafı: katalog yıldızları + Jüpiter gerçek konumlarında; sönük yıldızlar ve Samanyolu süs */
export function ornekUret(k: Katalog, ham: Wcs, cekim: Date, konum: Konum, W = 2000): HTMLCanvasElement {
  const H = Math.round((W * ham.h) / ham.w);
  const wcs = wcsOlcekle(ham, W, H);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const r = rastgele(16000502);
  // Gökyüzü: üstte koyu, ufka doğru şehir ışığı
  const z = x.createLinearGradient(0, 0, 0, H);
  z.addColorStop(0, '#03050c'); z.addColorStop(0.65, '#0a0f1c'); z.addColorStop(1, '#2a2421');
  x.fillStyle = z; x.fillRect(0, 0, W, H);
  // Samanyolu: galaktik ekvator boyunca bulanık parlaklık ve toz şeridi
  const hat = (bb: number) => { const p: { x: number; y: number }[] = []; for (let l = -80; l <= 80; l += 1) { const [ra, dec] = galaktiktenEkv((l + 360) % 360, bb); const q = gokPiksel(wcs, ra, dec); if (q) p.push(q); } return p; };
  x.save();
  x.filter = 'blur(60px)';
  x.globalAlpha = 0.5;
  x.strokeStyle = '#3a4560'; x.lineWidth = W * 0.16; x.lineCap = 'round';
  const merkez = hat(0); x.beginPath(); merkez.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.stroke();
  x.filter = 'blur(24px)'; x.globalAlpha = 0.35; x.strokeStyle = '#5a6380'; x.lineWidth = W * 0.06; x.stroke();
  x.filter = 'blur(18px)'; x.globalAlpha = 0.5; x.strokeStyle = '#06080e'; x.lineWidth = W * 0.018;
  const toz = hat(1.5); x.beginPath(); toz.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.stroke();
  x.restore();
  // Sönük yıldızlar (süs; tanınmaz): Samanyolu'na yakın daha yoğun
  for (let i = 0; i < 9000; i++) {
    const px = r() * W, py = r() * H;
    let d = Infinity; for (let j = 0; j < merkez.length; j += 6) d = Math.min(d, Math.hypot(merkez[j].x - px, merkez[j].y - py));
    if (r() > 0.18 + 0.82 * Math.exp(-((d / (W * 0.12)) ** 2))) continue;
    const a = 0.12 + r() ** 3 * 0.55;
    x.fillStyle = `rgba(${200 + r() * 55 | 0}, ${205 + r() * 50 | 0}, 255, ${a})`;
    x.fillRect(px, py, r() < 0.85 ? 1 : 1.6, r() < 0.85 ? 1 : 1.6);
  }
  // Katalog yıldızları gerçek konumlarında (parlaklığa göre büyüklük, renge göre ton)
  const renk = (bv: number | null) => { const t = Math.max(-0.3, Math.min(1.8, bv ?? 0.6)); return t < 0.2 ? [190, 210, 255] : t < 0.6 ? [245, 245, 255] : t < 1.1 ? [255, 228, 190] : [255, 196, 150]; };
  const nokta = (px: number, py: number, kadir: number, rgb: number[]) => {
    const rr = Math.max(1.2, 6.5 - kadir * 1.15);
    const g = x.createRadialGradient(px, py, 0, px, py, rr * 3.2);
    g.addColorStop(0, `rgba(255,255,255,1)`); g.addColorStop(0.18, `rgba(${rgb.join(',')},0.95)`); g.addColorStop(0.45, `rgba(${rgb.join(',')},0.25)`); g.addColorStop(1, `rgba(${rgb.join(',')},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rr * 3.2, 0, Math.PI * 2); x.fill();
  };
  for (const y of k.yildizlar) { const p = gokPiksel(wcs, y.ra, y.dec); if (p && p.x > -10 && p.y > -10 && p.x < W + 10 && p.y < H + 10) nokta(p.x + 0.5, p.y + 0.5, y.kadir, renk(y.renk)); }
  for (const g of gokCisimleri(cekim, konum)) {
    if (g.irtifa <= 0 || g.id === 'ay') continue;
    const p = gokPiksel(wcs, g.ra, g.dec);
    if (p && p.x > 0 && p.y > 0 && p.x < W && p.y < H) nokta(p.x + 0.5, p.y + 0.5, g.kadir, [255, 240, 215]);
  }
  // Ön plan: alçak tepe silueti
  x.fillStyle = '#020303';
  x.beginPath(); x.moveTo(0, H);
  for (let px = 0; px <= W; px += 8) x.lineTo(px, H - H * (0.025 + 0.02 * Math.sin(px / 210) + 0.012 * Math.sin(px / 57) + 0.006 * r()));
  x.lineTo(W, H); x.closePath(); x.fill();
  // Sensör gürültüsü
  const im = x.getImageData(0, 0, W, H);
  for (let i = 0; i < im.data.length; i += 4) { const n = (r() - 0.5) * 7; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n * 1.2; }
  x.putImageData(im, 0, 0);
  return c;
}

/** Örnek çözüm dosyası (ornek.json) gerçek işin fixture'ından */
export function ornekCozum(fixture: { wcs: string; annotations: Cozum['annotations']; calibration: Cozum['calibration'] }, W: number, H: number): Cozum {
  return { jobId: 16000502, calibration: fixture.calibration, wcs: fixture.wcs, annotations: fixture.annotations, objects_in_field: [], w: W, h: H };
}

export const ORNEK = { cekim: '2019-07-05T19:30:00Z', konum: { lat: 41.0082, lon: 28.9784 }, yer: 'İstanbul' };
export { wcsOku };
