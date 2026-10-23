// Uzay Modu · gerçek gezegenler. Küre üstünde 3.600 nokta (Fibonacci), her noktanın rengi gerçek yüzey haritasından
// (equirectangular doku: enlem/boylamdan örnek) ya da dokusu olmayanlarda gerçek görünüşe benzeyen prosedürel desenden.
// Çizim: noktalar küçük bir görüntüye derinlik sınamasıyla (z-buffer) basılır, sonra tek parça olarak çizilir.
// Böylece renkler üst üste binip beyazlaşmaz; Dünya'nın kıtaları seçilir.
import { GOVDE, type Govde } from './facts';

export const N_POINTS = 3600;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Birim küre noktaları (gövde çerçevesi: y = kuzey kutbu) ve dağılma yönleri */
const PTS = new Float32Array(N_POINTS * 3);
const LAT = new Float32Array(N_POINTS);
const LON = new Float32Array(N_POINTS);
const JIT = new Float32Array(N_POINTS * 2);
{
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N_POINTS; i++) {
    const y = 1 - (i / (N_POINTS - 1)) * 2, rad = Math.sqrt(1 - y * y), th = ga * i;
    const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
    PTS[i * 3] = x; PTS[i * 3 + 1] = y; PTS[i * 3 + 2] = z;
    LAT[i] = Math.asin(y);
    LON[i] = Math.atan2(z, x);
    const a = Math.random() * TAU, d = 2 + Math.random() * 4;
    JIT[i * 2] = Math.cos(a) * d; JIT[i * 2 + 1] = Math.sin(a) * d;
  }
}

// ------------------------------------------------------------------ Dokular

/** web/public/space altındaki dokular (kaynak ve lisanslar README'de) */
const DOKU: Partial<Record<Govde, string>> = { dunya: 'dunya.jpg', mars: 'mars.jpg', jupiter: 'jupiter.jpg', merkur: 'merkur.jpg', ay: 'ay.jpg' };
const texData = new Map<Govde, ImageData>();
let texLoading: Promise<void> | null = null;

/** Dokuları bir kez yükle (256×128'e küçültülür: her nokta komşularının ortalamasını alır, kumlanma olmaz) */
export function loadTextures(): Promise<void> {
  texLoading ??= Promise.all(
    (Object.entries(DOKU) as [Govde, string][]).map(([g, file]) => new Promise<void>(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, 0, 0, 256, 128);
        texData.set(g, x.getImageData(0, 0, 256, 128));
        colorCache.delete(g);
        resolve();
      };
      img.onerror = () => resolve(); // doku yoksa prosedürel yedek
      img.src = `/space/${file}`;
    })),
  ).then(() => {});
  return texLoading;
}

const mix = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const noise3 = (x: number, y: number, z: number) =>
  Math.sin(x * 3.1 + y * 1.7 + 0.5) * Math.sin(z * 2.3 + y * 4.1) + 0.5 * Math.sin(x * 5.7 - z * 3.3 + y * 2.1);

/** Dokusu olmayan gövdeler: gerçek görünüşe benzeyen desen (enlem, boylam) */
function procedural(g: Govde, lat: number, lon: number, i: number): number[] {
  const x = PTS[i * 3], y = PTS[i * 3 + 1], z = PTS[i * 3 + 2];
  switch (g) {
    case 'saturn': {
      // Soluk sarı bantlar, kutuplara doğru grimsi
      const v = 0.5 + 0.32 * Math.sin(lat * 13) + 0.15 * Math.sin(lat * 31 + 1) + 0.04 * noise3(x * 3, y * 3, z * 3);
      const c = mix([212, 182, 128], [240, 222, 170], clamp(v, 0, 1));
      return Math.abs(lat) > 1.15 ? mix(c, [175, 178, 160], clamp((Math.abs(lat) - 1.15) * 3, 0, 1)) : c;
    }
    case 'venus': {
      // Kalın, sarımsı bulut örtüsü; hafif girdaplı bantlar
      const v = 0.5 + 0.35 * Math.sin(lat * 6 + Math.sin(lon * 2 + lat * 3) * 0.9) + 0.1 * noise3(x * 2, y * 2, z * 2);
      return mix([206, 166, 104], [243, 224, 176], clamp(v, 0, 1));
    }
    case 'uranus': {
      const v = 0.5 + 0.12 * Math.sin(lat * 8) + 0.05 * noise3(x * 2, y * 2, z * 2);
      return mix([150, 210, 220], [196, 236, 240], clamp(v, 0, 1));
    }
    case 'neptun': {
      const v = 0.5 + 0.3 * Math.sin(lat * 9 + 0.6) + 0.1 * noise3(x * 3, y * 3, z * 3);
      let c = mix([46, 78, 196], [104, 146, 238], clamp(v, 0, 1));
      // İnce açık renkli bulut şeritleri
      if (Math.abs(lat + 0.42) < 0.03 || Math.abs(lat - 0.55) < 0.025) c = mix(c, [235, 242, 255], 0.7);
      return c;
    }
    case 'gunes': return [255, 210, 110];
    case 'dunya': return [60, 120, 210];
    case 'mars': return [200, 110, 70];
    case 'jupiter': return [215, 180, 140];
    case 'merkur': return [150, 150, 150];
    case 'ay': return [160, 160, 165];
  }
}

const colorCache = new Map<Govde, Uint8ClampedArray>();

/** Gövdenin nokta renkleri (bir kez hesaplanır) */
export function colorsOf(g: Govde): Uint8ClampedArray {
  let c = colorCache.get(g);
  if (c) return c;
  c = new Uint8ClampedArray(N_POINTS * 3);
  const tex = texData.get(g);
  for (let i = 0; i < N_POINTS; i++) {
    let rgb: number[];
    if (tex) {
      // Equirectangular: u = boylam, v = enlem (kuzey üstte)
      const u = (LON[i] + Math.PI) / TAU, v = 0.5 - LAT[i] / Math.PI;
      const px = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
      const py = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
      const o = (py * tex.width + px) * 4;
      rgb = [tex.data[o], tex.data[o + 1], tex.data[o + 2]];
      // Dünya: karalar biraz parlak, okyanus koyu mavi (doku zaten öyle; kontrastı hafif artır)
      if (g === 'dunya') {
        const land = rgb[1] > rgb[2] * 0.9 || rgb[0] > 150;
        rgb = land ? rgb.map(v => v * 1.15) : [rgb[0] * 0.75, rgb[1] * 0.85, Math.min(255, rgb[2] * 1.1 + 10)];
      }
    } else rgb = procedural(g, LAT[i], LON[i], i);
    c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2];
  }
  colorCache.set(g, c);
  return c;
}

// ------------------------------------------------------------------ Gövde

let nextId = 1;

export interface Orbit { parent: Body; R: number; ang: number; w: number }

export class Body {
  id = nextId++;
  govde: Govde;
  x: number; y: number; r: number;
  tx: number; ty: number; tr: number;
  vx = 0; vy = 0;
  /** Serbest kalınca (fırlatma, theia) */
  fvx = 0; fvy = 0;
  yaw = Math.random() * TAU;
  spin = 0.35;
  tilt: number;
  /** 0 → 1 oluşma */
  form = 0;
  born: number;
  colors: Uint8ClampedArray;
  morphFrom: Uint8ClampedArray | null = null;
  morphAt = 0;
  /** Çarpışmadan sonra erimiş lav (1) → kendi dokusu (0) */
  heat = 0;
  heldBy: string | null = null;
  /** Bilgi kartı (oluşunca ve dönüşünce) */
  cardAt: number;
  orbit: Orbit | null = null;
  /** Kayboluyor (dağıt, temizle): 1 → 0 */
  fade = 1;
  dying = false;
  /** Theia: çarpınca hız eşiği aranmaz */
  theia = false;
  /** Halkalı gövdelerde halka parçacıkları: [yarıçap, açı, renk/alfa sınıfı] */
  ring: Float32Array | null = null;

  constructor(govde: Govde, x: number, y: number, r: number, now: number) {
    this.govde = govde;
    this.x = this.tx = x; this.y = this.ty = y; this.r = this.tr = r;
    this.born = now; this.cardAt = now;
    this.tilt = (GOVDE[govde].egim * Math.PI) / 180;
    this.colors = colorsOf(govde);
    this.ring = makeRing(govde);
    if (govde === 'gunes') this.spin = 0.12;
    // Dünya ilk bakışta tanınsın: Afrika ve Avrupa bize dönük doğar (boylam L öne gelir: yaw = L - π/2)
    if (govde === 'dunya') this.yaw = (20 * Math.PI) / 180 - Math.PI / 2;
  }

  /** Başka gövdeye dönüş: noktalar dağılıp yeni renkleriyle yeniden toplanır */
  morph(govde: Govde, now: number) {
    if (govde === this.govde) return;
    this.morphFrom = this.colors;
    this.morphAt = now;
    this.govde = govde;
    this.colors = colorsOf(govde);
    this.tilt = (GOVDE[govde].egim * Math.PI) / 180;
    this.ring = makeRing(govde);
    this.cardAt = now;
  }
}

function makeRing(g: Govde): Float32Array | null {
  if (g !== 'saturn' && g !== 'uranus') return null;
  const n = g === 'saturn' ? 1800 : 500;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let R: number, cls: number;
    if (g === 'saturn') {
      const u = Math.random();
      // C halkası (soluk), B halkası (parlak), Cassini boşluğu, A halkası
      if (u < 0.15) { R = 1.24 + Math.random() * 0.28; cls = 0; }
      else if (u < 0.7) { R = 1.53 + Math.random() * 0.42; cls = 2; }
      else { R = 2.03 + Math.random() * 0.24; cls = 1; }
    } else {
      // Uranüs: birkaç ince, soluk halka
      const rings = [1.64, 1.72, 1.79, 1.86, 2.0];
      R = rings[Math.floor(Math.random() * rings.length)] + (Math.random() - 0.5) * 0.012; cls = 3;
    }
    a[i * 3] = R; a[i * 3 + 1] = Math.random() * TAU; a[i * 3 + 2] = cls;
  }
  return a;
}

const RING_STYLE = [
  'rgba(200,180,140,0.22)', // C
  'rgba(225,205,160,0.55)', // A
  'rgba(240,222,180,0.85)', // B
  'rgba(190,225,235,0.4)', // Uranüs
];

// ------------------------------------------------------------------ Çizim

/** Görüş: hafif yukarıdan; ışık sol üstten */
const PITCH = 0.32;
const L = (() => { const v = [-0.55, 0.42, 0.72]; const n = Math.hypot(v[0], v[1], v[2]); return v.map(x => x / n); })();

/** Gövde çerçevesinden görüş çerçevesine: dönüş (yaw, y ekseni), eksen eğikliği (z), bakış eğimi (x) */
function rotator(b: Body) {
  const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
  const ct = Math.cos(b.tilt), st = Math.sin(b.tilt);
  const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  return (x: number, y: number, z: number, out: number[]) => {
    // yaw
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    // eğiklik (z ekseni)
    const x2 = x1 * ct - y * st, y2 = x1 * st + y * ct;
    // bakış eğimi (x ekseni): kuzey kutbu biraz bize doğru
    const y3 = y2 * cp - z1 * sp, z3 = y2 * sp + z1 * cp;
    out[0] = x2; out[1] = y3; out[2] = z3;
  };
}

const lavaRGB = (n: number) => mix([255, 70, 10], [255, 214, 90], clamp(n, 0, 1));

interface Scratch { c: HTMLCanvasElement; g: CanvasRenderingContext2D; img: ImageData | null; z: Float32Array | null; S: number }

/** Gövdeleri çizen sınıf: her gövde için bir küçük çalışma tuvali */
export class BodyRenderer {
  private scratch = new Map<number, Scratch>();
  private v = [0, 0, 0];

  private scratchOf(id: number, S: number): Scratch {
    let s = this.scratch.get(id);
    if (!s) { const c = document.createElement('canvas'); s = { c, g: c.getContext('2d')!, img: null, z: null, S: 0 }; this.scratch.set(id, s); }
    if (s.S !== S) {
      s.c.width = s.c.height = S;
      s.img = s.g.createImageData(S, S);
      s.z = new Float32Array(S * S);
      s.S = S;
    }
    return s;
  }

  forget(id: number) { this.scratch.delete(id); }

  /**
   * Gövdeyi çiz: ışıltı, arka halka, noktalar (z-buffer), ön halka. t: saniye. scatter: ek dağılma (0..1).
   * Dönüş: hiçbir şey; gövdenin ekrandaki yerini değiştirmez.
   */
  draw(g: CanvasRenderingContext2D, b: Body, now: number, dprIn: number) {
    const t = now / 1000;
    const r = b.r;
    if (r < 1.5) return;
    const sun = b.govde === 'gunes';
    // Doku gövde oluştuktan sonra yüklendiyse renkleri yenile
    if (!b.morphFrom) { const cur = colorsOf(b.govde); if (cur !== b.colors) b.colors = cur; }
    const formE = 1 - Math.pow(1 - clamp(b.form, 0, 1), 3);
    const mt = b.morphFrom ? (now - b.morphAt) / 900 : 1;
    if (mt >= 1) b.morphFrom = null;
    const scatter = (1 - formE) + (b.morphFrom ? Math.sin(Math.PI * mt) * 0.55 : 0);
    const cols = b.morphFrom && mt < 0.5 ? b.morphFrom : b.colors;
    const alpha = b.fade * Math.min(1, formE * 1.5 + 0.05);

    // Işıltı (Güneş: güçlü taç; Dünya: ince mavi atmosfer)
    g.save();
    g.globalAlpha = alpha;
    if (sun) {
      const gr = g.createRadialGradient(b.x, b.y, r * 0.8, b.x, b.y, r * 2.6);
      gr.addColorStop(0, 'rgba(255,190,80,0.75)'); gr.addColorStop(0.35, 'rgba(255,140,40,0.25)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr; g.fillRect(b.x - r * 2.6, b.y - r * 2.6, r * 5.2, r * 5.2);
    } else if (b.heat > 0.05) {
      const gr = g.createRadialGradient(b.x, b.y, r * 0.9, b.x, b.y, r * 1.8);
      gr.addColorStop(0, `rgba(255,120,30,${0.6 * b.heat})`); gr.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = gr; g.fillRect(b.x - r * 1.8, b.y - r * 1.8, r * 3.6, r * 3.6);
    }
    g.restore();

    const rot = rotator(b);
    const v = this.v;
    // Arka halka parçaları (gezegenin arkasında kalanlar)
    if (b.ring && formE > 0.3) this.drawRing(g, b, rot, false, alpha * formE);

    // Noktaları küçük tuvale bas
    const dpr = Math.min(dprIn, 1.25);
    const ext = 1 + scatter * 6;
    const S = Math.min(1400, Math.ceil(r * 2 * ext * dpr) + 8);
    const sc = this.scratchOf(b.id, S);
    const img = sc.img!, data = img.data, zb = sc.z!;
    data.fill(0);
    zb.fill(-9);
    const half = S / 2;
    const R = r * dpr;
    // Nokta büyüklüğü: komşular neredeyse değsin (noktalı görünüm kalsın)
    const rd = Math.max(0.9, R * 0.03);
    const rdc = Math.ceil(rd), rd2 = rd * rd;
    // Küçük gövdelerde daha az nokta yeter
    const step = R < 25 ? 6 : R < 50 ? 3 : R < 90 ? 2 : 1;
    const lavaK = b.heat;
    for (let i = 0; i < N_POINTS; i += step) {
      rot(PTS[i * 3], PTS[i * 3 + 1], PTS[i * 3 + 2], v);
      let x = v[0], y = v[1];
      const z = v[2];
      if (scatter > 0.001) { x += JIT[i * 2] * scatter; y += JIT[i * 2 + 1] * scatter; }
      else if (z < -0.05) continue; // arka yüz
      const px = half + x * R, py = half - y * R;
      if (px < -rdc || py < -rdc || px > S + rdc || py > S + rdc) continue;
      // Renk ve ışık
      let cr = cols[i * 3], cg = cols[i * 3 + 1], cb = cols[i * 3 + 2];
      let shade: number;
      if (sun) {
        // Kaynayan yüzey: zamanla değişen gürültü, kenar kararması
        const n = noise3(PTS[i * 3] * 2.2, PTS[i * 3 + 1] * 2.2 + t * 0.35, PTS[i * 3 + 2] * 2.2) * 0.5 + 0.5 + 0.15 * Math.sin(t * 2.3 + i);
        const c = n > 0.75 ? [255, 246, 214] : n > 0.5 ? [255, 214, 110] : n > 0.28 ? [255, 160, 50] : [235, 96, 24];
        cr = c[0]; cg = c[1]; cb = c[2];
        shade = 0.55 + 0.45 * Math.max(0, z);
      } else {
        const lam = Math.max(0, v[0] * L[0] + v[1] * L[1] + v[2] * L[2]);
        shade = 0.13 + 0.87 * Math.pow(lam, 0.85);
        if (lavaK > 0.01) {
          const n = noise3(PTS[i * 3] * 3 + t * 0.6, PTS[i * 3 + 1] * 3, PTS[i * 3 + 2] * 3 - t * 0.4) * 0.5 + 0.5;
          const lv = lavaRGB(n);
          // Lav kendi ışığıyla parlar (gölgeden bağımsız)
          cr = cr * shade * (1 - lavaK) + lv[0] * lavaK; cg = cg * shade * (1 - lavaK) + lv[1] * lavaK; cb = cb * shade * (1 - lavaK) + lv[2] * lavaK;
          shade = 1;
        }
      }
      // Dünya: kenarda ince mavi atmosfer
      if (b.govde === 'dunya' && z < 0.35 && z > -0.05) {
        const k = (0.35 - z) / 0.4;
        cr = cr * (1 - k * 0.5) + 90 * k * 0.5; cg = cg * (1 - k * 0.5) + 160 * k * 0.5; cb = cb * (1 - k * 0.5) + 255 * k * 0.5;
      }
      const R8 = clamp(cr * shade, 0, 255), G8 = clamp(cg * shade, 0, 255), B8 = clamp(cb * shade, 0, 255);
      const cx = Math.round(px), cy = Math.round(py);
      for (let dy = -rdc; dy <= rdc; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= S) continue;
        for (let dx = -rdc; dx <= rdc; dx++) {
          if (dx * dx + dy * dy > rd2) continue;
          const xx = cx + dx;
          if (xx < 0 || xx >= S) continue;
          const k = yy * S + xx;
          if (z <= zb[k]) continue;
          zb[k] = z;
          const o = k * 4;
          data[o] = R8; data[o + 1] = G8; data[o + 2] = B8; data[o + 3] = 255;
        }
      }
    }
    sc.g.putImageData(img, 0, 0);
    g.save();
    g.globalAlpha = alpha;
    g.drawImage(sc.c, b.x - half / dpr, b.y - half / dpr, S / dpr, S / dpr);
    g.restore();

    // Ön halka parçaları
    if (b.ring && formE > 0.3) this.drawRing(g, b, rot, true, alpha * formE);
  }

  /** Halka: gezegenin ekvator düzleminde; arkada kalan yarı önce, öndeki yarı sonra çizilir */
  private drawRing(g: CanvasRenderingContext2D, b: Body, rot: ReturnType<typeof rotator>, front: boolean, alpha: number) {
    const ring = b.ring!;
    const v = this.v;
    const n = ring.length / 3;
    const sz = Math.max(1, b.r * 0.012);
    g.save();
    g.globalAlpha = alpha;
    for (let cls = 0; cls < 4; cls++) {
      g.fillStyle = RING_STYLE[cls];
      g.beginPath();
      let any = false;
      for (let i = 0; i < n; i++) {
        if (ring[i * 3 + 2] !== cls) continue;
        const R = ring[i * 3], a = ring[i * 3 + 1] + b.yaw * 0.3;
        rot(Math.cos(a) * R, 0, Math.sin(a) * R, v);
        const isFront = v[2] >= 0;
        if (isFront !== front) continue;
        // Gezegenin arkasındaysa ve diskle örtüşüyorsa çizme
        if (!front && v[0] * v[0] + v[1] * v[1] < 1) continue;
        g.rect(b.x + v[0] * b.r - sz / 2, b.y - v[1] * b.r - sz / 2, sz, sz);
        any = true;
      }
      if (any) g.fill();
    }
    g.restore();
  }
}

/**
 * Gövdenin ekrandaki görünen noktaları (kara delik spagettileşmesi ve patlama enkazı için): [x, y, r, g, b] dizisi.
 * every: kaç noktada bir.
 */
export function projectPoints(b: Body, every = 4): number[][] {
  const rot = rotator(b);
  const v = [0, 0, 0];
  const out: number[][] = [];
  for (let i = 0; i < N_POINTS; i += every) {
    rot(PTS[i * 3], PTS[i * 3 + 1], PTS[i * 3 + 2], v);
    if (v[2] < -0.2) continue;
    out.push([b.x + v[0] * b.r, b.y - v[1] * b.r, b.colors[i * 3], b.colors[i * 3 + 1], b.colors[i * 3 + 2]]);
  }
  return out;
}
