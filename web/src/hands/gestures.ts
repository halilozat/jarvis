// El Kontrolü · jest tanıma. Saf fonksiyonlar: kamera ya da tarayıcı gerektirmez, test edilebilir.
// Noktalar EKRAN pikselinde gelir (ayna çevrilmiş, kırpılmış). MediaPipe el noktaları:
//  0 bilek · başparmak 1-4 · işaret 5-8 · orta 9-12 · yüzük 13-16 · serçe 17-20 (MCP, PIP, DIP, uç)

export interface P { x: number; y: number; z?: number }

export type Gesture =
  | 'acik' // ✋ dört parmak + başparmak açık
  | 'yumruk' // ✊
  | 'cimdik' // 🤏 başparmak ile işaret ucu birleşik
  | 'isaret' // ☝️ yalnızca işaret
  | 'zafer' // ✌️ işaret + orta
  | 'basparmak' // 👍
  | 'diger';

export const GESTURE_LABEL: Record<Gesture, string> = {
  acik: 'açık el', yumruk: 'yumruk', cimdik: 'çimdik', isaret: 'işaret', zafer: 'zafer', basparmak: 'başparmak', diger: '—',
};

export interface HandShape {
  /** Bileğin orta parmak köküne uzaklığı: elin ekrandaki büyüklüğü (px) */
  size: number;
  /** Avuç merkezi */
  palm: P;
  /** Başparmak ve işaret uçlarının ortası */
  pinchPt: P;
  /** Çimdik açıklığı / el büyüklüğü (0 = uçlar birleşik) */
  pinch: number;
  /** Elin dönüşü (radyan): bilekten orta parmak köküne yön, yukarı = 0 */
  roll: number;
  /** Avucun ne kadar kameraya döndüğü 0..1 (yandan bakınca küçülür) */
  face: number;
  /** [başparmak, işaret, orta, yüzük, serçe] açık mı */
  fingers: [boolean, boolean, boolean, boolean, boolean];
  gesture: Gesture;
}

const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Parmak açık mı: ucun bileğe uzaklığı orta ekleminkinden belirgin büyükse. Dönüşten bağımsız. */
function extended(p: P[], mcp: number, pip: number, tip: number): boolean {
  const w = p[0];
  return d(p[tip], w) > d(p[pip], w) * 1.12 && d(p[tip], w) > d(p[mcp], w) * 1.25;
}

export function analyze(p: P[]): HandShape {
  const size = Math.max(1, d(p[0], p[9]));
  const palm: P = {
    x: (p[0].x + p[5].x + p[9].x + p[13].x + p[17].x) / 5,
    y: (p[0].y + p[5].y + p[9].y + p[13].y + p[17].y) / 5,
  };
  const idx = extended(p, 5, 6, 8);
  const midF = extended(p, 9, 10, 12);
  const ring = extended(p, 13, 14, 16);
  const pinky = extended(p, 17, 18, 20);
  // Başparmak: ucu serçe kökünden ve işaret kökünden uzaksa açık
  const thumb = d(p[4], p[17]) > d(p[3], p[17]) * 1.08 && d(p[4], p[5]) > size * 0.42;
  const pinch = d(p[4], p[8]) / size;
  const roll = Math.atan2(p[9].x - p[0].x, -(p[9].y - p[0].y));
  const face = Math.min(1, d(p[5], p[17]) / (size * 0.78));
  const fingers: HandShape['fingers'] = [thumb, idx, midF, ring, pinky];

  let gesture: Gesture = 'diger';
  const folded4 = !idx && !midF && !ring && !pinky;
  // 👍: dört parmak kapalı, başparmak açık ve elin en üst noktası, yukarı bakıyor
  const tv = { x: p[4].x - p[2].x, y: p[4].y - p[2].y };
  const thumbUp = folded4 && thumb && -tv.y / Math.max(1, Math.hypot(tv.x, tv.y)) > 0.6 &&
    p[4].y < Math.min(p[5].y, p[9].y, p[13].y, p[17].y) - size * 0.2;
  // 🤏: uçlar birleşik ve işaret ucu avuca kıvrılmamış (yumrukta başparmak işaretin üstüne yatar)
  const pinching = pinch < 0.3 && d(p[8], p[0]) > size * 0.95;
  if (thumbUp) gesture = 'basparmak';
  else if (pinching) gesture = 'cimdik';
  else if (idx && midF && ring && pinky) gesture = 'acik';
  else if (idx && midF && !ring && !pinky) gesture = 'zafer';
  else if (idx && !midF && !ring && !pinky) gesture = 'isaret';
  else if (folded4) gesture = 'yumruk';

  return { size, palm, pinchPt: mid(p[4], p[8]), pinch, roll, face, fingers, gesture };
}

// ------------------------------------------------------------------ Titreşim süzgeci (One Euro)

class LowPass {
  y: number | null = null;
  run(x: number, a: number) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
}
const alpha = (cutoff: number, dt: number) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };

/** Yavaşken titremeyi alır, hızlıyken gecikme yapmaz. */
export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  constructor(minCutoff = 1.4, beta = 0.012, dCutoff = 1.0) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; }
  filter(v: number, dt: number) {
    if (dt <= 0) dt = 1 / 60;
    const prev = this.x.y;
    const dv = prev === null ? 0 : (v - prev) / dt;
    const edv = this.dx.run(dv, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edv);
    return this.x.run(v, alpha(cutoff, dt));
  }
  reset() { this.x = new LowPass(); this.dx = new LowPass(); }
}

// ------------------------------------------------------------------ Takip edilen el

/** Bir el için kararlı durum: süzülmüş noktalar, kararlı jest, hız ve basılı tutma sayaçları. */
export class TrackedHand {
  pts: P[] = [];
  shape!: HandShape;
  /** Ekranda kararlı kabul edilen jest (birkaç kare üst üste görülünce değişir) */
  gesture: Gesture = 'diger';
  /** Kararlı jestin başladığı an (ms) */
  since = 0;
  prevGesture: Gesture = 'diger';
  /** Son yumruk anı (yumruk → açık = patlat) */
  lastFist = -1e9;
  /** Yumruğun başladığı an */
  fistSince?: number;
  vel: P = { x: 0, y: 0 };
  lastSeen = 0;
  private cand: Gesture = 'diger';
  private candN = 0;
  private filters: OneEuro[] = [];
  private prevPalm: P | null = null;

  id: string;
  constructor(id: string) { this.id = id; }

  update(raw: P[], now: number, dt: number): { changed: boolean } {
    if (!this.filters.length) this.filters = Array.from({ length: raw.length * 2 }, () => new OneEuro());
    this.pts = raw.map((q, i) => ({ x: this.filters[i * 2].filter(q.x, dt), y: this.filters[i * 2 + 1].filter(q.y, dt), z: q.z }));
    this.shape = analyze(this.pts);
    const pp = this.shape.palm;
    if (this.prevPalm && dt > 0) {
      const k = 0.35;
      this.vel = { x: this.vel.x * (1 - k) + ((pp.x - this.prevPalm.x) / dt) * k, y: this.vel.y * (1 - k) + ((pp.y - this.prevPalm.y) / dt) * k };
    }
    this.prevPalm = pp;
    this.lastSeen = now;
    // Kararlılık: yeni jest 3 kare üst üste görülmeli (yaklaşık 100 ms)
    const g = this.shape.gesture;
    if (g === this.cand) this.candN++;
    else { this.cand = g; this.candN = 1; }
    const need = this.gesture === 'diger' ? 2 : 3;
    if (this.cand !== this.gesture && this.candN >= need) {
      if (this.gesture === 'yumruk') this.lastFist = now;
      this.prevGesture = this.gesture;
      this.gesture = this.cand;
      this.since = now;
      return { changed: true };
    }
    return { changed: false };
  }

  reset() { this.filters = []; this.prevPalm = null; this.vel = { x: 0, y: 0 }; this.gesture = 'diger'; this.cand = 'diger'; this.candN = 0; }
}
