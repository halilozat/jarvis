// Uzay Modu · Güneş sistemi: iki açık elin arasında Güneş ve 8 gezegen, stilize yörüngelerde (iç gezegenler daha hızlı).
// Eller açılıp kapandıkça sistem büyüyüp küçülür. Bir gezegene çimdik → sistemden çekilip alınır, diğerleri döner.
import { GEZEGEN_SIRASI, type Govde } from './facts';
import { Body } from './planets';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Stilize boyutlar (sistem ölçeğine göre) ve yörünge yarıçapları */
const BOY: Partial<Record<Govde, number>> = { merkur: 0.022, venus: 0.032, dunya: 0.034, mars: 0.026, jupiter: 0.07, saturn: 0.06, uranus: 0.044, neptun: 0.043, gunes: 0.11, ay: 0.01 };
const FLAT = 0.34;

interface Slot { govde: Govde; R: number; a: number; w: number; body: Body | null }

export class SolarSystem {
  cx: number; cy: number;
  /** Neptün yörüngesinin yarıçapı (px) */
  scale: number;
  born: number;
  /** Sesle açıldı: eller kapanınca kaybolmaz */
  pinned: boolean;
  fadeAt: number | null = null;
  sun: Body;
  slots: Slot[];

  constructor(cx: number, cy: number, scale: number, now: number, pinned: boolean) {
    this.cx = cx; this.cy = cy; this.scale = scale; this.born = now; this.pinned = pinned;
    this.sun = new Body('gunes', cx, cy, scale * BOY.gunes!, now);
    this.slots = GEZEGEN_SIRASI.map((g, i) => {
      const R = 0.2 + i * 0.115;
      return { govde: g, R, a: Math.random() * Math.PI * 2, w: 1.15 / Math.pow(R / 0.2, 1.5), body: new Body(g, cx, cy, scale * BOY[g]!, now) };
    });
  }

  /** Görünürlük: açılış ve kayboluş */
  alpha(now: number) {
    const a = clamp((now - this.born) / 700, 0, 1);
    return this.fadeAt === null ? a : a * Math.max(0, 1 - (now - this.fadeAt) / 600);
  }
  done(now: number) { return this.fadeAt !== null && now - this.fadeAt > 650; }

  update(dt: number, now: number) {
    const a = this.alpha(now);
    // Açılışta yörüngeler dışarı doğru açılır
    const open = 1 - Math.pow(1 - clamp((now - this.born) / 900, 0, 1), 3);
    const sc = this.scale;
    this.sun.x = this.sun.tx = this.cx; this.sun.y = this.sun.ty = this.cy;
    this.sun.r = this.sun.tr = sc * BOY.gunes!;
    this.sun.form = Math.min(1, this.sun.form + dt * 2);
    this.sun.fade = a;
    this.sun.yaw += this.sun.spin * dt;
    for (const s of this.slots) {
      s.a += s.w * dt;
      const b = s.body;
      if (!b) continue;
      const R = s.R * sc * open;
      b.x = b.tx = this.cx + Math.cos(s.a) * R;
      b.y = b.ty = this.cy + Math.sin(s.a) * R * FLAT;
      b.r = b.tr = sc * BOY[s.govde]!;
      b.form = Math.min(1, b.form + dt * 2);
      b.fade = a;
      b.yaw += b.spin * dt * 2;
    }
  }

  /** Yörünge çizgileri */
  renderOrbits(g: CanvasRenderingContext2D, now: number) {
    const a = this.alpha(now);
    const open = 1 - Math.pow(1 - clamp((now - this.born) / 900, 0, 1), 3);
    g.save();
    g.strokeStyle = `rgba(150,200,255,${0.22 * a})`;
    g.lineWidth = 1;
    for (const s of this.slots) {
      const R = s.R * this.scale * open;
      g.beginPath(); g.ellipse(this.cx, this.cy, R, R * FLAT, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  /** Çizim sırası için gövdeler (Güneş'in arkasında kalanlar önce) */
  bodies(): Body[] {
    const list = this.slots.filter(s => s.body).map(s => s.body!);
    return [...list.filter(b => b.y < this.cy), this.sun, ...list.filter(b => b.y >= this.cy)];
  }

  /** Çimdik noktasına en yakın gezegeni sistemden çekip al */
  pluck(x: number, y: number): Body | null {
    let best: Slot | null = null, bd = Infinity;
    for (const s of this.slots) {
      if (!s.body) continue;
      const d = Math.hypot(s.body.x - x, s.body.y - y);
      const reach = Math.max(22, s.body.r * 2.5);
      if (d < reach && d < bd) { best = s; bd = d; }
    }
    if (!best) return null;
    const b = best.body!;
    best.body = null;
    return b;
  }
}
