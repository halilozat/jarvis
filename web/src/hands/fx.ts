// El Kontrolü · efekt motoru (Canvas 2D, toplamalı karışım). Tüm çizimler özgün ve prosedüreldir.
//  · Ateş eli       : parmak uçlarından ve avuçtan yükselen alev + kıvılcım arkları
//  · Mühür halkası  : katmanları ters yönlerde dönen, rün halkalı turuncu daire
//  · Gezegen        : noktalı küre + halka; oluşma, taşınma, gerilme ve patlama
//  · Şimşek         : iki işaret parmağı arasında elektrik
//  · İz             : tek işaret parmağının ışık izi
import type { P } from './gestures';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeBack = (t: number) => { t = clamp(t, 0, 1); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

type Pal = 'fire' | 'gold' | 'cyan' | 'white' | 'ember';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number;
  pal: Pal; drag: number; rise: number; wobble: number;
  /** Paletin yerine özel renk (gezegen enkazı kendi renginde dağılır) */
  spr?: HTMLCanvasElement;
}

interface Bolt { pts: P[]; life: number; max: number; color: string; width: number }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; width: number }

// ------------------------------------------------------------------ Hazır parlama sprite'ları

function glowSprite(rgb: [number, number, number], core = 0.18, px = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  const [r, gg, b] = rgb;
  gr.addColorStop(0, `rgba(255,255,255,1)`);
  gr.addColorStop(core, `rgba(${r},${gg},${b},0.95)`);
  gr.addColorStop(0.45, `rgba(${r},${gg},${b},0.32)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, px, px);
  return c;
}

/** Beyaz merkezsiz renkli nokta: gezegen yüzeyinde renkler birbirine karışıp beyaza dönmesin (kıta, bant seçilsin) */
function colorDot(rgb: [number, number, number], px = 32): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  const [r, gg, b] = rgb;
  gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  gr.addColorStop(0.35, `rgba(${r},${gg},${b},0.85)`);
  gr.addColorStop(0.7, `rgba(${r},${gg},${b},0.18)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, px, px);
  return c;
}

const FIRE_RAMP: [number, number, number][] = [
  [255, 250, 225], [255, 232, 150], [255, 200, 80], [255, 158, 40], [255, 112, 24], [220, 66, 16], [150, 36, 10], [70, 16, 6],
];

// ------------------------------------------------------------------ Mühür halkası katmanları

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Rün benzeri özgün işaret: 3x3 ızgarada rastgele çizgiler */
function glyph(g: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pts.push([x + (i - 1) * s * 0.5, y + (j - 1) * s * 0.5]);
  g.beginPath();
  const n = 2 + Math.floor(r() * 3);
  let a = pts[Math.floor(r() * 9)];
  g.moveTo(a[0], a[1]);
  for (let k = 0; k < n; k++) {
    const b = pts[Math.floor(r() * 9)];
    if (r() < 0.3) g.moveTo(b[0], b[1]); else g.lineTo(b[0], b[1]);
    a = b;
  }
  g.stroke();
  if (r() < 0.35) { g.beginPath(); g.arc(a[0], a[1], s * 0.12, 0, TAU); g.stroke(); }
}

const SIGIL_PX = 640;
function sigilLayers(): HTMLCanvasElement[] {
  const make = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = c.height = SIGIL_PX;
    const g = c.getContext('2d')!;
    g.translate(SIGIL_PX / 2, SIGIL_PX / 2);
    g.strokeStyle = 'rgba(255,170,60,0.95)';
    g.fillStyle = 'rgba(255,170,60,0.95)';
    g.shadowColor = 'rgba(255,110,20,1)';
    g.shadowBlur = 10;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    draw(g);
    return c;
  };
  const circle = (g: CanvasRenderingContext2D, r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  const R = SIGIL_PX / 2 - 16;
  // Dış katman: çift çember, rün kuşağı, ölçek çizgileri
  const outer = make(g => {
    const r = seeded(7);
    circle(g, R, 4); circle(g, R - 10, 1.6); circle(g, R - 44, 2.4);
    g.lineWidth = 2;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      g.save(); g.rotate(a); glyph(g, 0, -(R - 27), 15, r); g.restore();
    }
    g.lineWidth = 1.4;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, l = i % 5 === 0 ? 10 : 5;
      g.beginPath(); g.moveTo(Math.sin(a) * (R - 44), -Math.cos(a) * (R - 44)); g.lineTo(Math.sin(a) * (R - 44 - l), -Math.cos(a) * (R - 44 - l)); g.stroke();
    }
  });
  // Orta katman: iç içe iki kare (sekiz köşeli yıldız), köşelerde küçük halkalar
  const middle = make(g => {
    const r = R - 60;
    g.lineWidth = 2.6;
    for (const off of [0, Math.PI / 4]) {
      g.beginPath();
      for (let i = 0; i <= 4; i++) { const a = off + (i / 4) * TAU; const x = Math.sin(a) * r, y = -Math.cos(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    circle(g, r * 0.71, 2);
    g.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.arc(Math.sin(a) * r, -Math.cos(a) * r, 9, 0, TAU); g.stroke(); }
  });
  // İç katman: küçük rün kuşağı, altıgen yıldız, merkez
  const inner = make(g => {
    const r = seeded(21);
    const ri = (R - 60) * 0.66;
    circle(g, ri, 2.2); circle(g, ri - 26, 1.6);
    g.lineWidth = 1.6;
    for (let i = 0; i < 24; i++) { g.save(); g.rotate((i / 24) * TAU); glyph(g, 0, -(ri - 13), 10, r); g.restore(); }
    const h = ri - 34;
    g.lineWidth = 2.2;
    for (const off of [0, Math.PI / 3]) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const a = off + (i / 3) * TAU; const x = Math.sin(a) * h, y = -Math.cos(a) * h; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    circle(g, h * 0.42, 2); circle(g, h * 0.18, 3);
  });
  return [outer, middle, inner];
}

// ------------------------------------------------------------------ Gezegen

const SPHERE_N = 900;
const RING_N = 1500;

// ------------------------------------------------------------------ Gezegen türleri

export type GezegenTur = 'saturn' | 'dunya' | 'mars' | 'jupiter' | 'ay' | 'gunes';
export const GEZEGENLER: { tur: GezegenTur; ad: string }[] = [
  { tur: 'saturn', ad: 'Satürn' }, { tur: 'dunya', ad: 'Dünya' }, { tur: 'mars', ad: 'Mars' },
  { tur: 'jupiter', ad: 'Jüpiter' }, { tur: 'ay', ad: 'Ay' }, { tur: 'gunes', ad: 'Güneş' },
];

type RGB = [number, number, number];
/** Yüzey deseni için basit, tekrarlanabilir "gürültü" (küre üstündeki birim vektörden) */
const noise = (x: number, y: number, z: number) =>
  Math.sin(x * 3.1 + y * 1.7 + 0.5) * Math.sin(z * 2.3 + y * 4.1) + 0.5 * Math.sin(x * 5.7 - z * 3.3 + y * 2.1);
const near = (x: number, y: number, z: number, c: [number, number, number], r: number) => Math.hypot(x - c[0], y - c[1], z - c[2]) < r;

/** Her tür: yüzey renkleri, parıltı rengi, halka, ve her yüzey noktasının hangi renkte olacağı */
const LOOK: Record<GezegenTur, { colors: RGB[]; glow: RGB; ring: boolean; paint(x: number, y: number, z: number): number }> = {
  saturn: { colors: [[255, 196, 92], [255, 244, 220]], glow: [255, 196, 92], ring: true, paint: () => 0 },
  dunya: {
    // okyanus, kara, buz, bulut
    colors: [[40, 120, 255], [70, 205, 105], [235, 245, 255], [255, 255, 255]], glow: [110, 190, 255], ring: false,
    paint: (x, y, z) => (Math.abs(y) > 0.82 ? 2 : Math.sin(x * 7 + z * 5) * Math.sin(y * 6 - x * 3) > 0.55 ? 3 : noise(x, y, z) > 0.3 ? 1 : 0),
  },
  mars: {
    colors: [[235, 110, 55], [150, 60, 35], [250, 236, 226]], glow: [255, 120, 60], ring: false,
    paint: (x, y, z) => (Math.abs(y) > 0.86 ? 2 : noise(x * 1.3, y, z * 1.3) > 0.4 ? 1 : 0),
  },
  jupiter: {
    // krem, turuncu, kahve bantlar ve Büyük Kırmızı Leke
    colors: [[250, 232, 195], [232, 135, 60], [140, 72, 40], [235, 60, 45]], glow: [240, 170, 100], ring: false,
    paint: (x, y, z) => {
      if (near(x, y, z, [0.62, 0.32, 0.72], 0.24)) return 3;
      const b = Math.sin(y * 10 + 0.5 * Math.sin(x * 3 + z * 2));
      return b > 0.35 ? 0 : b < -0.45 ? 2 : 1;
    },
  },
  ay: {
    colors: [[170, 170, 182], [70, 70, 85]], glow: [200, 205, 225], ring: false,
    paint: (x, y, z) => ([[0.5, 0.4, 0.77], [-0.6, -0.2, 0.77], [0.1, -0.7, 0.7], [-0.3, 0.6, 0.74], [0.8, -0.3, 0.5], [0, 0.1, -1]] as [number, number, number][])
      .some((c, i) => near(x, y, z, c, 0.16 + (i % 3) * 0.07)) || noise(x * 2, y * 2, z * 2) > 0.85 ? 1 : 0,
  },
  gunes: { colors: [[255, 245, 200], [255, 210, 90], [255, 150, 40], [240, 90, 20]], glow: [255, 170, 60], ring: false, paint: () => 0 },
};

export class Planet {
  x: number; y: number; r: number;
  tx: number; ty: number; tr: number;
  born: number;
  /** 0 → 1 oluşma */
  form = 0;
  yaw = 0; pitch = 0.35; roll = -0.25;
  spin = 0.6;
  held = false;
  sphere = new Float32Array(SPHERE_N * 3);
  ring = new Float32Array(RING_N * 3); // yarıçap, açı, kalınlık
  scatter = new Float32Array((SPHERE_N + RING_N) * 2);
  /** Son çizimdeki ekran konumları (patlamada kullanılır) */
  screen = new Float32Array((SPHERE_N + RING_N) * 2);
  tur: GezegenTur = 'saturn';
  /** Her yüzey noktasının rengi (LOOK[tur].colors içindeki sıra) */
  tex = new Uint8Array(SPHERE_N);
  /** Adının ekranda göründüğü an (oluşunca ve dönüşünce) */
  labelAt = 0;

  constructor(x: number, y: number, r: number, now: number, tur: GezegenTur = 'saturn') {
    this.x = this.tx = x; this.y = this.ty = y; this.r = this.tr = r; this.born = now;
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < SPHERE_N; i++) {
      const yy = 1 - (i / (SPHERE_N - 1)) * 2, rad = Math.sqrt(1 - yy * yy), th = ga * i;
      this.sphere[i * 3] = Math.cos(th) * rad; this.sphere[i * 3 + 1] = yy; this.sphere[i * 3 + 2] = Math.sin(th) * rad;
    }
    for (let i = 0; i < RING_N; i++) {
      const band = Math.random();
      this.ring[i * 3] = band < 0.6 ? rnd(1.4, 1.85) : band < 0.66 ? rnd(1.88, 1.92) : rnd(1.98, 2.35);
      this.ring[i * 3 + 1] = Math.random() * TAU;
      this.ring[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    for (let i = 0; i < SPHERE_N + RING_N; i++) {
      const a = Math.random() * TAU, d = rnd(2.5, 6);
      this.scatter[i * 2] = Math.cos(a) * d; this.scatter[i * 2 + 1] = Math.sin(a) * d;
    }
    this.setTur(tur, now, false);
  }

  /** Türü değiştir: elde tutulan gezegen parçacıklarına dağılıp yeni haliyle yeniden toplanır */
  setTur(tur: GezegenTur, now: number, morph = true) {
    this.tur = tur;
    const look = LOOK[tur];
    for (let i = 0; i < SPHERE_N; i++) this.tex[i] = look.paint(this.sphere[i * 3], this.sphere[i * 3 + 1], this.sphere[i * 3 + 2]);
    this.screen.fill(0, SPHERE_N * 2); // halkasız türde eski halka konumları patlamaya karışmasın
    this.labelAt = now;
    if (morph) this.form = Math.min(this.form, 0.35);
  }
}

// ------------------------------------------------------------------ Motor

export interface SigilState { x: number; y: number; r: number; roll: number; squash: number; k: number }
export interface HoldState { x: number; y: number; r: number; p: number; label: string; done: number }

export class Fx {
  private ctx: CanvasRenderingContext2D;
  W = 0; H = 0; dpr = 1;
  parts: Particle[] = [];
  bolts: Bolt[] = [];
  rings: Ring[] = [];
  planet: Planet | null = null;
  flash = 0;
  shake = 0;
  private fire: HTMLCanvasElement[];
  private pal: Record<Exclude<Pal, 'fire'>, HTMLCanvasElement>;
  private sigil: HTMLCanvasElement[];
  private soft: HTMLCanvasElement;
  private halos: { x: number; y: number; r: number; a: number }[] = [];
  private trails = new Map<string, { pts: (P & { t: number })[] }>();
  readonly MAX = 7000;
  private sprCache = new Map<string, HTMLCanvasElement>();
  /** Renkli parlama sprite'ı (parıltılar), bir kez üretilir; core < 0: beyaz merkezsiz yüzey noktası */
  private sprite(c: RGB, core = 0.16): HTMLCanvasElement {
    const k = `${c.join(',')}:${core}`;
    let s = this.sprCache.get(k);
    if (!s) { s = core < 0 ? colorDot(c) : glowSprite(c, core); this.sprCache.set(k, s); }
    return s;
  }
  /** Gezegenin o noktasının sprite'ı (Güneş: yüzey zamanla kaynar) */
  private surface(pl: Planet, i: number, t: number): HTMLCanvasElement {
    const look = LOOK[pl.tur];
    if (pl.tur === 'gunes') {
      const n = noise(pl.sphere[i * 3] * 2, pl.sphere[i * 3 + 1] * 2 + t * 0.4, pl.sphere[i * 3 + 2] * 2);
      return this.sprite(look.colors[Math.max(0, Math.min(3, Math.floor((n + 1.5) / 3 * 4 + Math.sin(t * 3 + i) * 0.5)))], 0.22);
    }
    return this.sprite(look.colors[pl.tex[i]], -1);
  }

  private canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.fire = FIRE_RAMP.map(c => glowSprite(c, 0.12));
    this.pal = { gold: glowSprite([255, 196, 92], 0.14), cyan: glowSprite([110, 220, 255], 0.16), white: glowSprite([255, 244, 220], 0.3), ember: glowSprite([255, 120, 30], 0.08) };
    this.sigil = sigilLayers();
    this.soft = glowSprite([255, 140, 40], 0.02, 256);
  }

  resize(W: number, H: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
  }

  private add(p: Particle) { if (this.parts.length < this.MAX) this.parts.push(p); }

  // ---------------------------------------------------------------- yayıcılar

  /** Açık avuçta alev: parmak uçlarından ve avuç çevresinden */
  fireHand(pts: P[], size: number, k: number, dt: number, vel: P) {
    if (k <= 0) return;
    const s = size / 100;
    const sources = [4, 8, 12, 16, 20, 0, 5, 9, 13, 17, 2, 6, 10, 14, 18];
    // Avucu saran sıcak hale
    this.halos.push({ x: pts[9].x * 0.6 + pts[0].x * 0.4, y: pts[9].y * 0.6 + pts[0].y * 0.4, r: size * 1.9, a: 0.5 * k });
    const rate = 2200 * k * dt; // saniyede ~2200 parçacık
    for (let n = 0; n < rate; n++) {
      const i = sources[Math.floor(Math.random() * sources.length)];
      const a = pts[i];
      const tip = i % 4 === 0 && i > 0;
      this.add({
        x: a.x + rnd(-8, 8) * s, y: a.y + rnd(-8, 8) * s,
        vx: rnd(-40, 40) * s + vel.x * 0.25, vy: rnd(-260, -90) * s * (tip ? 1.25 : 0.8) + vel.y * 0.25,
        life: 0, max: rnd(0.3, 0.75) * (tip ? 1.15 : 0.8), size: rnd(14, 28) * s * (0.6 + k * 0.4),
        pal: 'fire', drag: 0.9, rise: -320 * s, wobble: rnd(2, 6),
      });
    }
    // Kıvılcım arkları: parmak uçları ve avuç arasında kısa, titrek elektrik
    if (Math.random() < 14 * k * dt) {
      const ends = [4, 8, 12, 16, 20, 0];
      const a = pts[ends[Math.floor(Math.random() * ends.length)]];
      const b = pts[ends[Math.floor(Math.random() * ends.length)]];
      if (a !== b) this.bolts.push({ pts: this.jag(a, b, 4, Math.hypot(a.x - b.x, a.y - b.y) * 0.18), life: 0, max: rnd(0.06, 0.13), color: '255,214,140', width: rnd(1, 2) });
    }
    if (Math.random() < 10 * k * dt) {
      const a = pts[[8, 12, 16][Math.floor(Math.random() * 3)]];
      const end = { x: a.x + rnd(-40, 40) * s, y: a.y - rnd(60, 140) * s };
      this.bolts.push({ pts: this.jag(a, end, 4, 22 * s), life: 0, max: rnd(0.05, 0.1), color: '255,226,170', width: 1.2 });
    }
  }

  /** Ateş sönünce kor ve duman kıvılcımları */
  douse(pts: P[], size: number) {
    const s = size / 100;
    for (let n = 0; n < 160; n++) {
      const a = pts[Math.floor(Math.random() * 21)];
      this.add({ x: a.x, y: a.y, vx: rnd(-90, 90) * s, vy: rnd(-200, -40) * s, life: 0, max: rnd(0.4, 1.1), size: rnd(4, 9) * s, pal: 'ember', drag: 1.5, rise: -60 * s, wobble: rnd(3, 8) });
    }
  }

  /** Mühür halkasının çevresinden kıvılcımlar */
  sigilSparks(st: SigilState, dt: number) {
    const rate = 260 * st.k * dt;
    for (let n = 0; n < rate; n++) {
      const a = Math.random() * TAU;
      const rr = st.r * rnd(0.92, 1.02);
      const lx = Math.cos(a) * rr * st.squash, ly = Math.sin(a) * rr;
      const c = Math.cos(st.roll), sn = Math.sin(st.roll);
      const x = st.x + lx * c - ly * sn, y = st.y + lx * sn + ly * c;
      const tx = -Math.sin(a), ty = Math.cos(a);
      const sp = rnd(40, 140) * (st.r / 150);
      this.add({ x, y, vx: (tx * c - ty * sn) * sp, vy: (tx * sn + ty * c) * sp, life: 0, max: rnd(0.25, 0.6), size: rnd(5, 11) * (st.r / 150), pal: Math.random() < 0.3 ? 'white' : 'ember', drag: 2.2, rise: 30, wobble: 0 });
    }
  }

  /** İşaret parmağı ucu ışık izi */
  trail(id: string, p: P | null, now: number) {
    let t = this.trails.get(id);
    if (!t) { t = { pts: [] }; this.trails.set(id, t); }
    if (p) t.pts.push({ ...p, t: now });
    while (t.pts.length && now - t.pts[0].t > 450) t.pts.shift();
  }

  /** İki nokta arasında şimşek (her kare yeniden) */
  lightning(a: P, b: P, k: number) {
    const L = Math.hypot(a.x - b.x, a.y - b.y);
    const main = this.jag(a, b, 7, L * 0.12);
    this.bolts.push({ pts: main, life: 0, max: 0.05, color: '170,225,255', width: 2.4 * k });
    if (Math.random() < 0.9) this.bolts.push({ pts: this.jag(a, b, 6, L * 0.16), life: 0, max: 0.04, color: '120,190,255', width: 1.2 });
    // Dallar
    for (let i = 0; i < 2; i++) {
      if (Math.random() > 0.55) continue;
      const s = main[Math.floor(rnd(0.2, 0.8) * main.length)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + rnd(-1.2, 1.2);
      const len = L * rnd(0.08, 0.22);
      this.bolts.push({ pts: this.jag(s, { x: s.x + Math.cos(ang) * len, y: s.y + Math.sin(ang) * len }, 4, len * 0.25), life: 0, max: 0.05, color: '150,210,255', width: 1 });
    }
    for (const e of [a, b]) for (let n = 0; n < 3; n++) this.add({ x: e.x, y: e.y, vx: rnd(-160, 160), vy: rnd(-160, 160), life: 0, max: rnd(0.15, 0.35), size: rnd(5, 10), pal: 'cyan', drag: 3, rise: 0, wobble: 0 });
  }

  /** Gezegen patlar: her nokta bir parçacığa dönüşür */
  explode(now: number) {
    const pl = this.planet;
    if (!pl) return;
    const n = SPHERE_N + RING_N;
    const sc = pl.r / 100;
    for (let i = 0; i < n; i++) {
      const x = pl.screen[i * 2], y = pl.screen[i * 2 + 1];
      if (!x && !y) continue;
      const dx = x - pl.x, dy = y - pl.y, dl = Math.hypot(dx, dy) || 1;
      const sp = rnd(250, 950) * sc * (i < SPHERE_N ? 1 : 0.7);
      const own = i < SPHERE_N && pl.tur !== 'saturn' && Math.random() > 0.12 ? this.surface(pl, i, now / 1000) : undefined;
      this.add({ x, y, vx: (dx / dl) * sp + rnd(-60, 60), vy: (dy / dl) * sp + rnd(-60, 60), life: 0, max: rnd(0.9, 2.2), size: rnd(4, 9) * Math.max(0.7, sc), pal: Math.random() < 0.15 ? 'white' : 'gold', drag: 1.6, rise: 0, wobble: 0, spr: own });
    }
    this.shockwave(pl.x, pl.y, pl.r, LOOK[pl.tur].glow.join(','));
    this.planet = null;
    void now;
  }

  /** Patlama dalgası ve parlama (gezegen yokken de yumruk → açık) */
  shockwave(x: number, y: number, r: number, color = '255,200,110') {
    this.rings.push({ x, y, r0: r * 0.3, r1: r * 5.5, life: 0, max: 0.75, color, width: 10 });
    this.rings.push({ x, y, r0: r * 0.2, r1: r * 3.2, life: 0, max: 0.5, color: '255,255,255', width: 4 });
    for (let n = 0; n < 260; n++) {
      const a = Math.random() * TAU, sp = rnd(300, 1100) * (r / 100);
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.4, 1.1), size: rnd(6, 14) * Math.max(0.7, r / 100), pal: Math.random() < 0.5 ? 'fire' : 'white', drag: 2.4, rise: 0, wobble: 0 });
    }
    this.flash = 1;
    this.shake = 1;
  }

  /**
   * Uzay modu: renkli enkaz patlaması (gezegen kendi renklerinde dağılır). points: [x, y, r, g, b] (gezegenin yüzey
   * noktaları) ya da renk listesi + merkez. speed: px/sn ölçeği.
   */
  colorBurst(points: number[][], cx: number, cy: number, speed: number, size = 4) {
    for (const p of points) {
      const dx = p[0] - cx, dy = p[1] - cy, dl = Math.hypot(dx, dy) || 1;
      const sp = rnd(0.4, 1.2) * speed;
      const c: RGB = [p[2] | 0, p[3] | 0, p[4] | 0];
      this.add({ x: p[0], y: p[1], vx: (dx / dl) * sp + rnd(-40, 40), vy: (dy / dl) * sp + rnd(-40, 40), life: 0, max: rnd(0.9, 2.2), size: rnd(0.7, 1.4) * size, pal: 'gold', drag: 1.4, rise: 0, wobble: 0, spr: this.sprite(c, -1) });
    }
  }

  /** Basılı tutma tamamlandı */
  confirmBurst(x: number, y: number, r: number) {
    this.rings.push({ x, y, r0: r, r1: r * 2.6, life: 0, max: 0.55, color: '95,242,255', width: 5 });
    for (let n = 0; n < 90; n++) {
      const a = Math.random() * TAU, sp = rnd(200, 520);
      this.add({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.3, 0.7), size: rnd(5, 10), pal: 'cyan', drag: 3, rise: 0, wobble: 0 });
    }
  }

  /** Kitaplık: uçan kitabın arkasında toz ve kıvılcım, tarama çizgisinden dökülen ışık */
  bookDust(x: number, y: number, n: number, spread: number, pal: 'gold' | 'cyan' | 'white' = 'gold') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(15, 90);
      this.add({ x: x + rnd(-spread, spread), y: y + rnd(-spread, spread), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.45, 1.1), size: rnd(2.5, 6), pal: Math.random() < 0.2 ? 'white' : pal, drag: 1.6, rise: 25, wobble: rnd(0, 1) });
    }
  }

  /** Gezegenin etrafında süzülen altın toz */
  dust(dt: number) {
    const pl = this.planet;
    if (!pl) return;
    const rate = 70 * dt * pl.form;
    for (let n = 0; n < rate; n++) {
      const a = Math.random() * TAU, d = pl.r * rnd(1.2, 5);
      this.add({ x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d * 0.7, vx: rnd(-12, 12), vy: rnd(-18, 4), life: 0, max: rnd(1.2, 2.6), size: rnd(2.5, 6), pal: Math.random() < 0.3 ? 'white' : 'gold', drag: 0.2, rise: 0, wobble: rnd(0.5, 2) });
    }
  }

  private jag(a: P, b: P, depth: number, disp: number): P[] {
    let pts: P[] = [a, b];
    let dd = disp;
    for (let k = 0; k < depth; k++) {
      const out: P[] = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
        const o = rnd(-dd, dd);
        out.push({ x: mx + (nx / nl) * o, y: my + (ny / nl) * o }, q);
      }
      pts = out;
      dd *= 0.55;
    }
    return pts;
  }

  // ---------------------------------------------------------------- çizim

  render(dt: number, now: number, sigils: SigilState[], holds: HoldState[]) {
    const g = this.ctx;
    const { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // Sarsıntı
    let ox = 0, oy = 0;
    if (this.shake > 0) {
      const m = this.shake * 14;
      ox = rnd(-m, m); oy = rnd(-m, m);
      g.translate(ox, oy);
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    g.globalCompositeOperation = 'lighter';

    // Mühür halkaları (arkada)
    for (const s of sigils) this.drawSigil(g, s, now);

    // Gezegen
    if (this.planet) this.drawPlanet(g, this.planet, dt, now);

    // Ateşli avuçların hâlesi
    for (const h of this.halos) {
      g.globalAlpha = h.a * (0.85 + Math.random() * 0.15);
      g.drawImage(this.soft, h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
    }
    this.halos.length = 0;

    // Parçacıklar
    const parts = this.parts;
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      const f = Math.exp(-p.drag * dt);
      p.vx *= f; p.vy = p.vy * f + p.rise * dt;
      if (p.wobble) p.vx += Math.sin(now * 0.008 * p.wobble + p.y * 0.03) * 220 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const u = p.life / p.max;
      let spr: HTMLCanvasElement, a: number, sz: number;
      if (p.pal === 'fire') {
        spr = this.fire[Math.min(7, Math.floor(u * 8))];
        a = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
        sz = p.size * (1 - u * 0.55);
      } else {
        spr = p.spr ?? this.pal[p.pal];
        a = u < 0.1 ? u / 0.1 : 1 - u;
        sz = p.size * (1 - u * 0.3);
      }
      g.globalAlpha = clamp(a, 0, 1) * (p.pal === 'fire' ? 0.6 : 0.9);
      if (p.pal === 'fire') {
        // Alev dili: hız yönünde uzatılmış parlama
        const sp = Math.hypot(p.vx, p.vy);
        const st = Math.min(3.2, 1 + sp / 160);
        const ang = Math.atan2(p.vy, p.vx) + Math.PI / 2;
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        g.translate(p.x + ox, p.y + oy);
        g.rotate(ang);
        g.drawImage(spr, -sz / 2 / Math.sqrt(st), -sz * st / 2, sz / Math.sqrt(st), sz * st);
        g.setTransform(this.dpr, 0, 0, this.dpr, ox * this.dpr, oy * this.dpr);
      } else g.drawImage(spr, p.x - sz / 2, p.y - sz / 2, sz, sz);
      parts[w++] = p;
    }
    parts.length = w;

    // Işık izleri
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [, t] of this.trails) {
      if (t.pts.length < 2) continue;
      for (let i = 1; i < t.pts.length; i++) {
        const a = t.pts[i - 1], b = t.pts[i];
        const k = 1 - (now - b.t) / 450;
        g.globalAlpha = clamp(k, 0, 1) * 0.9;
        g.strokeStyle = 'rgba(120,230,255,1)';
        g.lineWidth = 2 + k * 7;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      const h = t.pts[t.pts.length - 1];
      if (now - h.t < 120) { g.globalAlpha = 1; g.drawImage(this.pal.cyan, h.x - 22, h.y - 22, 44, 44); }
    }

    // Şimşekler
    let bw = 0;
    for (const b of this.bolts) {
      // Önce çiz sonra yaşlandır: düşük kare hızında da her şimşek en az bir kez görünür
      if (b.life >= b.max) continue;
      const k = 1 - (b.life / b.max) * 0.6;
      b.life += dt;
      for (const [wd, al] of [[b.width * 5, 0.18], [b.width * 2, 0.45], [b.width, 1]] as const) {
        g.globalAlpha = al * k;
        g.strokeStyle = al === 1 ? 'rgba(255,255,255,1)' : `rgba(${b.color},1)`;
        g.lineWidth = wd;
        g.beginPath();
        b.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.stroke();
      }
      this.bolts[bw++] = b;
    }
    this.bolts.length = bw;

    // Dalgalar
    let rw = 0;
    for (const r of this.rings) {
      r.life += dt;
      if (r.life >= r.max) continue;
      const u = r.life / r.max, e = ease(u);
      g.globalAlpha = (1 - u) * 0.9;
      g.strokeStyle = `rgba(${r.color},1)`;
      g.lineWidth = r.width * (1 - u) + 1;
      g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); g.stroke();
      this.rings[rw++] = r;
    }
    this.rings.length = rw;

    // Basılı tutma halkaları (HUD rengi)
    g.globalCompositeOperation = 'source-over';
    for (const h of holds) this.drawHold(g, h);

    // Parlama
    if (this.flash > 0) {
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = this.flash * 0.28;
      g.fillStyle = 'rgb(255,214,150)';
      g.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - dt * 4.5);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawSigil(g: CanvasRenderingContext2D, s: SigilState, now: number) {
    if (s.k <= 0.01) return;
    const t = now / 1000;
    const sc = (s.r / (SIGIL_PX / 2)) * easeBack(s.k);
    g.save();
    g.translate(s.x, s.y);
    // Arkadaki sıcak hale
    g.globalAlpha = 0.55 * s.k;
    const hr = s.r * 2.1;
    g.drawImage(this.soft, -hr, -hr, hr * 2, hr * 2);
    g.rotate(s.roll);
    g.scale(s.squash, 1);
    const flick = 0.85 + Math.sin(t * 23) * 0.05 + Math.sin(t * 37) * 0.04;
    const layers: [number, number][] = [[t * 0.35, 1], [-t * 0.6, 0.95], [t * 1.1, 1]];
    layers.forEach(([rot, a], i) => {
      g.save();
      g.rotate(rot);
      g.scale(sc, sc);
      g.globalAlpha = s.k * a * flick;
      g.drawImage(this.sigil[i], -SIGIL_PX / 2, -SIGIL_PX / 2);
      // ikinci geçiş: toplamalı karışımda daha parlak çizgiler
      if (i !== 1) { g.globalAlpha = s.k * 0.45; g.drawImage(this.sigil[i], -SIGIL_PX / 2, -SIGIL_PX / 2); }
      g.restore();
    });
    g.restore();
  }

  private drawPlanet(g: CanvasRenderingContext2D, pl: Planet, dt: number, now: number) {
    const t = now / 1000;
    // Hedefe yumuşak takip
    const k = 1 - Math.exp(-dt * (pl.held ? 18 : 4));
    pl.x += (pl.tx - pl.x) * k; pl.y += (pl.ty - pl.y) * k; pl.r += (pl.tr - pl.r) * (1 - Math.exp(-dt * 10));
    if (!pl.held) pl.y += Math.sin(t * 1.6) * 0.25; // süzülme
    pl.form = Math.min(1, pl.form + dt / 1.1);
    pl.yaw += pl.spin * dt;
    const e = ease(pl.form);
    const { x: cx, y: cy, r } = pl;
    const look = LOOK[pl.tur];
    const sun = pl.tur === 'gunes';
    // Çekirdek ışığı (türün renginde; Güneş çok daha parlak, Dünya'da ince mavi atmosfer)
    g.globalAlpha = (sun ? 0.95 : 0.5) * e;
    const gs = r * (sun ? 2.1 : 1.3);
    g.drawImage(this.sprite(look.glow, 0.05), cx - gs, cy - gs, gs * 2, gs * 2);
    if (pl.tur === 'dunya') { g.globalAlpha = 0.35 * e; g.drawImage(this.pal.cyan, cx - r * 1.18, cy - r * 1.18, r * 2.36, r * 2.36); }
    // Güneş tacı: kenardan dışarı savrulan közler
    if (sun && e > 0.5) {
      for (let n = 0; n < dt * 90; n++) {
        const a = Math.random() * TAU, sp0 = rnd(30, 120) * (r / 100);
        this.add({ x: cx + Math.cos(a) * r * 0.95, y: cy + Math.sin(a) * r * 0.95, vx: Math.cos(a) * sp0, vy: Math.sin(a) * sp0, life: 0, max: rnd(0.4, 1.0), size: rnd(4, 9) * (r / 100), pal: 'ember', drag: 1.2, rise: -10, wobble: 0.5 });
      }
    }
    const cy_ = Math.cos(pl.yaw), sy = Math.sin(pl.yaw), cp = Math.cos(pl.pitch), sp = Math.sin(pl.pitch);
    const spr = this.pal.gold, wspr = this.pal.white;
    const saturn = pl.tur === 'saturn';
    const ps = Math.max(2.2, r * 0.045);
    // Küre
    for (let i = 0; i < SPHERE_N; i++) {
      let x = this.sx(pl, i, 0), y = this.sx(pl, i, 1), z = this.sx(pl, i, 2);
      const x1 = x * cy_ + z * sy, z1 = -x * sy + z * cy_;
      const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      x = x1; y = y1; z = z2;
      const f = 1 / (1 - z * 0.18);
      let X = cx + x * r * f, Y = cy + y * r * f;
      if (e < 1) { X = cx + (pl.scatter[i * 2] * r) * (1 - e) + (X - cx) * e; Y = cy + (pl.scatter[i * 2 + 1] * r) * (1 - e) + (Y - cy) * e; }
      pl.screen[i * 2] = X; pl.screen[i * 2 + 1] = Y;
      const a = z > 0 ? 0.35 + 0.65 * z : 0.08 + 0.25 * (1 + z);
      g.globalAlpha = a * e;
      if (!saturn && !sun) g.globalAlpha = a * e * 0.85;
      const s = ps * (0.7 + 0.5 * f) * (z > 0.6 ? 1.3 : 1) * (sun ? 1.25 : saturn ? 1 : 1.35);
      g.drawImage(saturn ? (z > 0.75 ? wspr : spr) : this.surface(pl, i, t), X - s / 2, Y - s / 2, s, s);
    }
    // Halka (yalnızca Satürn)
    const cr = Math.cos(pl.roll), sr = Math.sin(pl.roll);
    if (look.ring) {
      const tilt = 0.34, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i < RING_N; i++) {
        const R = pl.ring[i * 3];
        const th = pl.ring[i * 3 + 1] + t * (0.9 / (R * R));
        let x = Math.cos(th) * R, y = pl.ring[i * 3 + 2], z = Math.sin(th) * R;
        // halka düzlemini eğ
        const y1 = y * ct - z * st, z1 = y * st + z * ct;
        y = y1; z = z1;
        const x2 = x * cr - y * sr, y2 = x * sr + y * cr;
        x = x2; y = y2;
        const f = 1 / (1 - (z / 2.4) * 0.18);
        let X = cx + x * r * f, Y = cy + y * r * f;
        const j = SPHERE_N + i;
        if (e < 1) { X = cx + (pl.scatter[j * 2] * r) * (1 - e) + (X - cx) * e; Y = cy + (pl.scatter[j * 2 + 1] * r) * (1 - e) + (Y - cy) * e; }
        pl.screen[j * 2] = X; pl.screen[j * 2 + 1] = Y;
        // kürenin arkasında kalan halka parçası sönük
        const behind = z < 0 && Math.hypot(x, y) < 1;
        g.globalAlpha = (behind ? 0.06 : 0.55) * e;
        const s = ps * 0.75 * f;
        g.drawImage(R > 1.86 && R < 1.94 ? wspr : spr, X - s / 2, Y - s / 2, s, s);
      }
    }
    // Adı: oluşunca ve dönüşünce kısa bir süre altında
    const la = (now - pl.labelAt) / 1800;
    if (la < 1) {
      const name = GEZEGENLER.find(p => p.tur === pl.tur)!.ad.toLocaleUpperCase('tr');
      g.save();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = Math.min(1, (1 - la) * 2.5) * e;
      g.font = `700 ${Math.max(14, r * 0.22)}px Rajdhani, sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = `rgb(${look.glow.join(',')})`;
      g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 8;
      g.fillText(`◉ ${name}`, cx, cy + r * (look.ring ? 2.1 : 1.45) + 10);
      g.restore();
    }
    // Tutulurken merkezde parlak enerji yıldızı
    if (pl.held) {
      const pulse = 0.8 + Math.sin(t * 9) * 0.2;
      g.globalAlpha = e * pulse;
      const s = r * 0.9;
      g.drawImage(this.pal.cyan, cx - s / 2, cy - s / 2, s, s);
      g.drawImage(wspr, cx - s / 4, cy - s / 4, s / 2, s / 2);
    }
  }

  private sx(pl: Planet, i: number, k: number) { return pl.sphere[i * 3 + k]; }

  private drawHold(g: CanvasRenderingContext2D, h: HoldState) {
    const show = Math.min(1, h.p * 3);
    g.save();
    g.globalAlpha = show * (1 - h.done);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(95,242,255,0.22)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(95,242,255,1)';
    g.shadowColor = 'rgba(95,242,255,0.9)';
    g.shadowBlur = 14;
    g.lineWidth = 5;
    g.beginPath(); g.arc(h.x, h.y, h.r, -Math.PI / 2, -Math.PI / 2 + TAU * h.p); g.stroke();
    // ölçek çizgileri
    g.lineWidth = 1.5;
    g.shadowBlur = 0;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const r0 = h.r + 9, r1 = h.r + (i % 3 === 0 ? 17 : 13);
      g.strokeStyle = i / 36 <= h.p ? 'rgba(95,242,255,0.9)' : 'rgba(95,242,255,0.25)';
      g.beginPath(); g.moveTo(h.x + Math.sin(a) * r0, h.y - Math.cos(a) * r0); g.lineTo(h.x + Math.sin(a) * r1, h.y - Math.cos(a) * r1); g.stroke();
    }
    g.font = '600 15px "Rajdhani", "Inter", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(210,250,255,1)';
    g.shadowColor = 'rgba(0,0,0,0.8)';
    g.shadowBlur = 6;
    g.fillText(h.label, h.x, h.y + h.r + 38);
    g.font = '500 12px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(95,242,255,0.95)';
    g.fillText(`${Math.round(h.p * 100)}%`, h.x, h.y + h.r + 56);
    g.restore();
  }

  /** Hata ayıklama: iskelet (D tuşu) */
  skeleton(pts: P[], label: string) {
    const g = this.ctx;
    const B = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
    g.save();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.strokeStyle = 'rgba(95,242,255,0.75)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const [a, b] of B) { g.moveTo(pts[a].x, pts[a].y); g.lineTo(pts[b].x, pts[b].y); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const p of pts) { g.beginPath(); g.arc(p.x, p.y, 2.5, 0, TAU); g.fill(); }
    g.font = '600 12px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(95,242,255,1)';
    g.fillText(label, pts[0].x + 10, pts[0].y + 20);
    g.restore();
  }
}
