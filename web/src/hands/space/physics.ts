// Uzay Laboratuvarı · fizik. Saf fonksiyonlar ve tarayıcısız sınıflar; physics.test.ts ile denenir.
//
// Birimler: uzunluk AU, zaman yıl, kütle Güneş kütlesi. Bu birimlerde G = 4π² (Kepler'in 3. yasası: a³ = P²).
// Simülasyon gerçek birimlerle çalışır; yalnızca ekrana çizim ölçeklenir (scale.ts).
//
// Entegratör: leapfrog (kick-drift-kick, "velocity Verlet"). Zamanda simetriktir: enerji uzun sürede kaymaz,
// zaman geri akıtılınca gezegenler aynı yoldan geri döner. Bir cisim Güneş'e çok yaklaşınca adım kısalır.
import { AU_ISIK_SN, GUNES_T, GUNES_YARICAP_AU } from './data';

export const G = 4 * Math.PI * Math.PI;
export const YIL_GUN = 365.25;
/** Varsayılan adım: çeyrek gün (Merkür'ün bir turu ≈ 350 adım) */
export const ADIM = 0.25 / YIL_GUN;
/** Yerel yörünge süresinin en az bu kadar adıma bölünmesi gerekir */
const ADIM_BOLU = 150;
/** Güneş'in merkezine bu kadar yaklaşan cisim Güneş'e düşmüş sayılır (Güneş yarıçapının 2 katı) */
export const DUSME_AU = GUNES_YARICAP_AU * 2;

export class Sim {
  n: number;
  m: Float64Array;
  x: Float64Array; y: Float64Array; z: Float64Array;
  vx: Float64Array; vy: Float64Array; vz: Float64Array;
  ax: Float64Array; ay: Float64Array; az: Float64Array;
  /** 0: simülasyonda; 1: elde tutuluyor (konumu dışarıdan, kendisi hareket etmez ama çeker) */
  held: Uint8Array;
  /** Simülasyondan çıktı (Güneş'e düştü, kaçtı, çarpıştı) */
  gone: Uint8Array;
  /** İvmeler güncel değil (konum dışarıdan değişti) */
  dirty = true;

  constructor(n: number) {
    this.n = n;
    this.m = new Float64Array(n);
    this.x = new Float64Array(n); this.y = new Float64Array(n); this.z = new Float64Array(n);
    this.vx = new Float64Array(n); this.vy = new Float64Array(n); this.vz = new Float64Array(n);
    this.ax = new Float64Array(n); this.ay = new Float64Array(n); this.az = new Float64Array(n);
    this.held = new Uint8Array(n);
    this.gone = new Uint8Array(n);
  }

  clone(): Sim {
    const s = new Sim(this.n);
    s.m.set(this.m); s.x.set(this.x); s.y.set(this.y); s.z.set(this.z);
    s.vx.set(this.vx); s.vy.set(this.vy); s.vz.set(this.vz);
    s.ax.set(this.ax); s.ay.set(this.ay); s.az.set(this.az);
    s.held.set(this.held); s.gone.set(this.gone); s.dirty = this.dirty;
    return s;
  }

  /** Çiftler arası kütle çekimi (her çift bir kez) */
  accel() {
    const { n, m, x, y, z, ax, ay, az, gone } = this;
    ax.fill(0); ay.fill(0); az.fill(0);
    for (let i = 0; i < n; i++) {
      if (gone[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (gone[j]) continue;
        const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
        const r2 = dx * dx + dy * dy + dz * dz + 1e-12;
        const inv = 1 / (r2 * Math.sqrt(r2));
        const fi = G * m[j] * inv, fj = G * m[i] * inv;
        ax[i] += dx * fi; ay[i] += dy * fi; az[i] += dz * fi;
        ax[j] -= dx * fj; ay[j] -= dy * fj; az[j] -= dz * fj;
      }
    }
    this.dirty = false;
  }

  /** Tek leapfrog adımı (h yıl; eksi olabilir: zaman geri akar) */
  step(h: number) {
    if (this.dirty) this.accel();
    const { n, x, y, z, vx, vy, vz, ax, ay, az, held, gone } = this;
    const k = h / 2;
    for (let i = 0; i < n; i++) {
      if (gone[i] || held[i]) continue;
      vx[i] += ax[i] * k; vy[i] += ay[i] * k; vz[i] += az[i] * k;
      x[i] += vx[i] * h; y[i] += vy[i] * h; z[i] += vz[i] * h;
    }
    this.accel();
    for (let i = 0; i < n; i++) {
      if (gone[i] || held[i]) continue;
      vx[i] += ax[i] * k; vy[i] += ay[i] * k; vz[i] += az[i] * k;
    }
  }

  /** Güneş'e (0) göre uzaklık */
  rSun(i: number) { return Math.hypot(this.x[i] - this.x[0], this.y[i] - this.y[0], this.z[i] - this.z[0]); }

  /** Bu andaki güvenli adım: en hızlı değişen yörüngenin yerel süresinin 1/150'si, en fazla `max` */
  safeStep(max: number) {
    let h = max;
    for (let i = 1; i < this.n; i++) {
      if (this.gone[i] || this.held[i]) continue;
      const r = this.rSun(i);
      const loc = (2 * Math.PI * Math.sqrt((r * r * r) / (G * this.m[0]))) / ADIM_BOLU;
      if (loc < h) h = loc;
    }
    return Math.max(h, 1e-7);
  }

  /**
   * T yıl ilerlet (eksi: geri). Adım gerekirse kısalır; kare başına en fazla maxSteps adım (sim yetişemezse yavaşlar).
   * Güneş'e düşen cisimler Güneş'le birleşir (kütle ve momentum korunur). Dönüş: düşenlerin indeksleri ve kalan süre.
   */
  advance(T: number, hMax = ADIM, maxSteps = 4000): { fell: number[]; left: number } {
    const fell: number[] = [];
    const sign = Math.sign(T);
    let left = Math.abs(T), steps = 0;
    while (left > 1e-12 && steps < maxSteps) {
      const h = Math.min(left, this.safeStep(hMax));
      this.step(sign * h);
      left -= h;
      steps++;
      for (let i = 1; i < this.n; i++) {
        if (!this.gone[i] && !this.held[i] && this.rSun(i) < DUSME_AU) { this.absorb(0, i); fell.push(i); }
      }
    }
    return { fell, left: sign * left };
  }

  /** j, i'ye karışır: kütle toplanır, momentum korunur, kütle merkezinde birleşirler */
  absorb(i: number, j: number) {
    const { m, x, y, z, vx, vy, vz } = this;
    const M = m[i] + m[j];
    x[i] = (x[i] * m[i] + x[j] * m[j]) / M; y[i] = (y[i] * m[i] + y[j] * m[j]) / M; z[i] = (z[i] * m[i] + z[j] * m[j]) / M;
    vx[i] = (vx[i] * m[i] + vx[j] * m[j]) / M; vy[i] = (vy[i] * m[i] + vy[j] * m[j]) / M; vz[i] = (vz[i] * m[i] + vz[j] * m[j]) / M;
    m[i] = M;
    this.gone[j] = 1;
    this.held[j] = 0;
    this.dirty = true;
  }

  /** Toplam enerji (kinetik + çekim potansiyeli) */
  energy(): number {
    const { n, m, x, y, z, vx, vy, vz, gone } = this;
    let E = 0;
    for (let i = 0; i < n; i++) {
      if (gone[i]) continue;
      E += 0.5 * m[i] * (vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      for (let j = i + 1; j < n; j++) {
        if (gone[j]) continue;
        E -= (G * m[i] * m[j]) / Math.hypot(x[j] - x[i], y[j] - y[i], z[j] - z[i]);
      }
    }
    return E;
  }

  /** Kütle merkezini başlangıca al, toplam momentumu sıfırla */
  toBarycenter() {
    const { n, m, x, y, z, vx, vy, vz, gone } = this;
    let M = 0, cx = 0, cy = 0, cz = 0, px = 0, py = 0, pz = 0;
    for (let i = 0; i < n; i++) {
      if (gone[i]) continue;
      M += m[i]; cx += m[i] * x[i]; cy += m[i] * y[i]; cz += m[i] * z[i];
      px += m[i] * vx[i]; py += m[i] * vy[i]; pz += m[i] * vz[i];
    }
    for (let i = 0; i < n; i++) {
      x[i] -= cx / M; y[i] -= cy / M; z[i] -= cz / M;
      vx[i] -= px / M; vy[i] -= py / M; vz[i] -= pz / M;
    }
    this.dirty = true;
  }

  /** i'nin Güneş'e göre yörünge elemanları (ekliptik düzleminde) */
  elements(i: number): Elements {
    const { x, y, vx, vy, m } = this;
    return elements(x[i] - x[0], y[i] - y[0], vx[i] - vx[0], vy[i] - vy[0], G * (m[0] + m[i]));
  }
}

// ------------------------------------------------------------------ Yörünge elemanları

export interface Elements {
  /** Yarı büyük eksen (AU); kaçışta eksi */
  a: number;
  /** Basıklık (dışmerkezlik) */
  e: number;
  /** Günberi ve günöte (AU); kaçışta günöte sonsuz */
  q: number; Q: number;
  /** Günberinin yönü (radyan) */
  w: number;
  /** Dönem (yıl); kaçışta sonsuz */
  P: number;
  /** Birim kütle başına enerji (AU²/yıl²): ≥ 0 ise kaçış */
  eps: number;
  bound: boolean;
}

/** Düzlemde iki cisim yörünge elemanları (göreli konum ve hız, μ = G(M+m)) */
export function elements(rx: number, ry: number, vx: number, vy: number, mu = G): Elements {
  const r = Math.hypot(rx, ry), v2 = vx * vx + vy * vy;
  const eps = v2 / 2 - mu / r;
  const rv = rx * vx + ry * vy;
  const ex = ((v2 - mu / r) * rx - rv * vx) / mu, ey = ((v2 - mu / r) * ry - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const h = rx * vy - ry * vx;
  const p = (h * h) / mu;
  const q = p / (1 + e);
  const bound = eps < 0;
  const a = -mu / (2 * eps);
  return { a, e, q, Q: bound ? a * (1 + e) : Infinity, w: Math.atan2(ey, ex), P: bound ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity, eps, bound };
}

/** Dairesel yörünge hızı (AU/yıl) */
export const daireselHiz = (r: number, mu = G) => Math.sqrt(mu / r);
/** Kaçış hızı (AU/yıl) */
export const kacisHizi = (r: number, mu = G) => Math.sqrt((2 * mu) / r);
/** AU/yıl → km/s */
export const kmS = (v: number) => (v * 149_597_870.7) / (YIL_GUN * 86400);

/** Hohmann transferi: r1'den r2'ye yarım elips yolculuğun süresi (gün) */
export function hohmannGun(r1: number, r2: number, mu = G): number {
  const at = (r1 + r2) / 2;
  return Math.PI * Math.sqrt((at * at * at) / mu) * YIL_GUN;
}

/** Işığın d AU'yu geçme süresi (s) */
export const isikSn = (d: number) => d * AU_ISIK_SN;

/**
 * Denge sıcaklığı (K): hızlı dönen, ısıyı her yere dağıtan gezegen. T = T☉ · √(R☉ / 2r) · (1 − A)^¼
 * (Dünya için A = 0,306, r = 1 AU → ≈ 254 K)
 */
export const dengeT = (r: number, albedo: number) => GUNES_T * Math.sqrt(GUNES_YARICAP_AU / (2 * r)) * Math.pow(1 - albedo, 0.25);

/** Kelvin → °C */
export const C = (K: number) => K - 273.15;

// ------------------------------------------------------------------ Tahmin

export type Sonuc = 'dustu' | 'kacti' | 'yorunge';

export interface Tahmin {
  /** Güneş'e göre konumlar (AU): x0, y0, x1, y1… */
  pts: Float32Array;
  sonuc: Sonuc;
  el: Elements;
}

/** Bu uzaklığı geçen cisim Güneş sisteminden kaçmış sayılır (AU) */
export const KACIS_AU = 45;

/**
 * Cisim i şu hızla bırakılırsa nereye gider? Simülasyonun bir kopyasını (bütün gezegenlerle) ileri sarar.
 * Bağlı yörüngede bir tur (en çok 40 yıl), kaçışta 45 AU'ya kadar, düşüşte Güneş'e kadar.
 */
export function tahmin(sim: Sim, i: number, vx: number, vy: number, nokta = 220): Tahmin {
  const s = sim.clone();
  s.held.fill(0);
  for (let j = 0; j < s.n; j++) if (sim.held[j] && j !== i) s.gone[j] = 1; // başka elde tutulan cisimler tahmine karışmaz
  s.vx[i] = s.vx[0] + vx; s.vy[i] = s.vy[0] + vy; s.vz[i] = s.vz[0];
  s.z[i] = s.z[0];
  s.dirty = true;
  const el = s.elements(i);
  const horizon = el.bound ? Math.min(40, el.P * 1.02) : 60;
  const out: number[] = [];
  const every = horizon / nokta;
  let t = 0, next = 0, sonuc: Sonuc = el.bound ? 'yorunge' : 'kacti';
  let steps = 0;
  while (t < horizon && steps < 6000) {
    if (t >= next) { out.push(s.x[i] - s.x[0], s.y[i] - s.y[0]); next += every; }
    const h = Math.min(s.safeStep(2 / YIL_GUN), horizon - t);
    s.step(h);
    t += h; steps++;
    const r = s.rSun(i);
    if (r < DUSME_AU) { sonuc = 'dustu'; out.push(s.x[i] - s.x[0], s.y[i] - s.y[0]); break; }
    if (r > KACIS_AU) { sonuc = 'kacti'; break; }
  }
  if (sonuc !== 'dustu' && el.bound && el.q < DUSME_AU) sonuc = 'dustu';
  return { pts: new Float32Array(out), sonuc, el };
}
