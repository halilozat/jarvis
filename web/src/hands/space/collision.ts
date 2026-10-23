// Uzay Modu · çarpışma sonrası enkaz diski ve Ay'ın doğuşu (dev çarpışma / Theia).
// Küçük gezegenin parçaları ve kopan malzeme, büyük gezegenin çevresinde dönen basık bir diske dağılır; disk 3,5 sn içinde
// tek bir noktada toplanıp küçük, gri, noktalı bir Ay'a dönüşür ve Ay yörüngede dönmeye başlar.
import type { Body } from './planets';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeInOut = (t: number) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

interface Debris { a: number; R: number; w: number; c: string; s: number; dz: number }

/** Disk düzleminin basıklığı ve hafif eğimi */
export const ORBIT_FLAT = 0.3;
export const ORBIT_TILT = -0.18;

export class DebrisDisk {
  parent: Body;
  start: number;
  /** Toplanma süresi (ms) */
  dur = 3600;
  /** Ay'ın doğacağı yer: disk dönerken o da döner */
  moonA: number;
  moonR = 2.3;
  moonW = 0.9;
  private parts: Debris[] = [];
  done = false;

  constructor(parent: Body, colors: string[], impactAngle: number, now: number) {
    this.parent = parent;
    this.start = now;
    this.moonA = impactAngle + Math.PI * 0.6;
    for (let i = 0; i < 1100; i++) {
      const R = rnd(1.35, 3.1);
      this.parts.push({
        // Çarpma yönünden yayılan enkaz: açıları çarpma noktası çevresinde yoğun başlar, disk dönünce yayılır
        a: impactAngle + (Math.random() - 0.5) * (Math.random() < 0.7 ? 1.6 : TAU),
        R, w: 1.6 / Math.pow(R, 1.5) + rnd(-0.1, 0.1),
        c: colors[Math.floor(Math.random() * colors.length)],
        s: rnd(1.2, 2.8),
        dz: rnd(-0.06, 0.06),
      });
    }
  }

  /** İlerleme 0..1 (1: Ay doğdu) */
  progress(now: number) { return clamp((now - this.start) / this.dur, 0, 1); }

  update(dt: number, now: number) {
    this.moonA += this.moonW * dt;
    const p = this.progress(now);
    // İlk saniye enkaz serbestçe döner (disk oluşur), sonra Ay'ın doğacağı yere doğru toplanır
    const pull = easeInOut((p - 0.25) / 0.75);
    for (const d of this.parts) {
      d.a += d.w * dt;
      if (pull > 0) {
        let da = this.moonA - d.a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        d.a += da * Math.min(1, pull * dt * 6);
        d.R += (this.moonR - d.R) * Math.min(1, pull * dt * 5);
      }
    }
    if (p >= 1) this.done = true;
  }

  /** Disk parçalarını çiz. front: gezegenin önünde kalanlar (sin > 0) */
  render(g: CanvasRenderingContext2D, now: number, front: boolean) {
    const P = this.parent, r = P.r;
    const p = this.progress(now);
    const ct = Math.cos(ORBIT_TILT), st = Math.sin(ORBIT_TILT);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const d of this.parts) {
      const sn = Math.sin(d.a);
      if ((sn >= 0) !== front) continue;
      const ox = Math.cos(d.a) * d.R * r, oy = (sn * ORBIT_FLAT + d.dz) * d.R * r;
      const x = P.x + ox * ct - oy * st, y = P.y + ox * st + oy * ct;
      // Gezegenin arkasındaki parçalar diskle örtüşüyorsa görünmez
      if (!front && Math.hypot(x - P.x, y - P.y) < r) continue;
      g.fillStyle = d.c;
      g.globalAlpha = 0.85 * (1 - p * 0.4);
      const s = d.s * (1 - p * 0.5);
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    // Toplanan çekirdek: Ay'ın doğduğu nokta parlar
    if (p > 0.3) {
      const ox = Math.cos(this.moonA) * this.moonR * r, oy = Math.sin(this.moonA) * ORBIT_FLAT * this.moonR * r;
      const x = P.x + ox * ct - oy * st, y = P.y + ox * st + oy * ct;
      if ((Math.sin(this.moonA) >= 0) === front) {
        const k = (p - 0.3) / 0.7;
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 0.5 * k + 2);
        gr.addColorStop(0, `rgba(230,230,240,${0.7 * k})`); gr.addColorStop(1, 'rgba(200,200,220,0)');
        g.globalAlpha = 1;
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    g.restore();
  }
}

/** Yörüngedeki uydunun ekrandaki yeri (Ay): ebeveynin çevresinde eğik, basık elips */
export function orbitPos(parent: Body, R: number, a: number): { x: number; y: number; front: boolean } {
  const ct = Math.cos(ORBIT_TILT), st = Math.sin(ORBIT_TILT);
  const ox = Math.cos(a) * R * parent.r, oy = Math.sin(a) * ORBIT_FLAT * R * parent.r;
  return { x: parent.x + ox * ct - oy * st, y: parent.y + ox * st + oy * ct, front: Math.sin(a) >= 0 };
}
