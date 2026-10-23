// Uzay Modu · kara delik. Kapkara merkez (gölge), ince parlak foton halkası, dönen yığılma diski (bize doğru gelen
// taraf daha parlak: Doppler), gölgenin üstünde merceklenmiş disk yayı. Yakalanan gezegen önce kara deliğe doğru uzar,
// spiral çizerek parçalanır (spagettileşme), noktaları içeri akar. Yıldız merceklenmesi starfield.ts'te.
import type { Lens } from './starfield';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface DiskP { R: number; a: number; w: number; s: number }
/** Yutulan gezegenin parçası: kutupsal (kara deliğe göre) */
interface Stream { r: number; a: number; w: number; vr: number; c: string; s: number; life: number }

/** Disk düzleminin görüş eğimi: elips basıklığı */
const FLAT = 0.26;

export class BlackHole {
  x: number; y: number;
  rs: number;
  born: number;
  /** Sönüyor (✋): başlangıç anı */
  dyingAt: number | null = null;
  /** Yumrukla oluştuysa o el; sesle oluştuysa null (sabit) */
  anchor: string | null;
  /** El görünmediği an (uzun süre kaybolursa söner) */
  lostAt: number | null = null;
  private disk: DiskP[] = [];
  private stream: Stream[] = [];
  /** Yutulan malzeme diski parlatır */
  private feedGlow = 0;
  /** Yığılma diskinin görünürlüğü (0: yutacak bir şey yok, yalnızca gölge ve foton halkası) */
  diskAlpha = 1;

  constructor(x: number, y: number, rs: number, now: number, anchor: string | null) {
    this.x = x; this.y = y; this.rs = rs; this.born = now; this.anchor = anchor;
    for (let i = 0; i < 1500; i++) {
      const R = 1.7 + Math.pow(Math.random(), 1.6) * 3.2;
      this.disk.push({ R, a: Math.random() * TAU, w: 2.2 / Math.pow(R, 1.5), s: rnd(0.8, 2.2) });
    }
  }

  /** Görünür yarıçap (oluşma ve sönme animasyonu dahil) */
  scale(now: number): number {
    const grow = clamp((now - this.born) / 700, 0, 1);
    const g = 1 - Math.pow(1 - grow, 3);
    if (this.dyingAt === null) return g;
    return g * Math.max(0, 1 - (now - this.dyingAt) / 500);
  }
  done(now: number) { return this.dyingAt !== null && now - this.dyingAt > 650; }

  lens(now: number): Lens | null {
    const s = this.scale(now);
    return s > 0.05 ? { x: this.x, y: this.y, rs: this.rs * s } : null;
  }

  /** Gezegeni yut: ekran noktaları [x, y, r, g, b] spiral akışa dönüşür */
  feed(points: number[][]) {
    for (const p of points) {
      const dx = p[0] - this.x, dy = (p[1] - this.y) / FLAT;
      const r = Math.max(this.rs * 1.2, Math.hypot(dx, dy));
      this.stream.push({ r, a: Math.atan2(dy, dx), w: 0, vr: 0, c: `rgb(${p[2] | 0},${p[3] | 0},${p[4] | 0})`, s: rnd(1.2, 2.6), life: 0 });
    }
  }

  update(dt: number) {
    for (const d of this.disk) d.a += d.w * dt;
    // Akış: yakına düşen daha hızlı döner ve düşer (gelgit: gezegen uzayıp spiral olur)
    const rs = this.rs;
    let w = 0;
    for (const s of this.stream) {
      s.life += dt;
      const k = rs / s.r;
      s.w = 2.6 * Math.pow(k, 1.2) + 0.4;
      s.vr += (90 + 900 * k * k) * dt;
      s.r -= s.vr * dt * (rs / 40);
      s.a += s.w * dt * (1 + s.life);
      if (s.r > rs * 0.9) this.stream[w++] = s;
      else this.feedGlow = Math.min(1.5, this.feedGlow + 0.004);
    }
    this.stream.length = w;
    this.feedGlow *= Math.exp(-dt * 0.6);
  }

  get consuming() { return this.stream.length > 0; }

  render(g: CanvasRenderingContext2D, now: number) {
    const s = this.scale(now);
    if (s <= 0.01) return;
    const rs = this.rs * s, { x, y } = this;
    const bright = 1 + this.feedGlow * 0.6;
    const tAge = (now - this.born) / 1000;

    // Arka plan ışıması
    g.save();
    const halo = g.createRadialGradient(x, y, rs, x, y, rs * 6);
    halo.addColorStop(0, `rgba(255,150,60,${0.22 * bright * this.diskAlpha})`); halo.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = halo; g.fillRect(x - rs * 6, y - rs * 6, rs * 12, rs * 12);
    g.restore();

    // Disk: arkada kalan yarı (gölgenin arkasında, yukarıda)
    this.drawDisk(g, x, y, rs, false, bright);

    // Merceklenmiş disk yayı: diskin arka yüzü gölgenin üstünden görünür
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(255,${170 - i * 30},${80 - i * 20},${(0.32 - i * 0.08) * bright * this.diskAlpha})`;
      g.lineWidth = rs * (0.22 - i * 0.05);
      g.beginPath();
      g.ellipse(x, y, rs * (1.55 + i * 0.25), rs * (1.35 + i * 0.22), 0, Math.PI, TAU);
      g.stroke();
    }
    g.restore();

    // Gölge
    g.save();
    g.fillStyle = '#000';
    g.beginPath(); g.arc(x, y, rs, 0, TAU); g.fill();
    // Foton halkası
    g.globalCompositeOperation = 'lighter';
    g.shadowColor = 'rgba(255,220,170,0.9)'; g.shadowBlur = rs * 0.35;
    g.strokeStyle = `rgba(255,236,200,${0.85 + 0.15 * Math.sin(tAge * 3)})`;
    g.lineWidth = Math.max(1.2, rs * 0.05);
    g.beginPath(); g.arc(x, y, rs * 1.04, 0, TAU); g.stroke();
    g.restore();

    // Yutulan gezegenin akışı
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of this.stream) {
      const px = x + Math.cos(p.a) * p.r, py = y + Math.sin(p.a) * p.r * FLAT;
      // Gölgenin arkasına düşen kısım görünmez
      if (Math.sin(p.a) < 0 && Math.hypot(px - x, py - y) < rs) continue;
      g.fillStyle = p.c;
      g.globalAlpha = clamp(p.r / (rs * 2), 0.3, 1);
      const len = Math.min(10, p.w * 3);
      g.save();
      g.translate(px, py);
      g.rotate(p.a + Math.PI / 2);
      g.fillRect(-len, -p.s / 2, len * 2, p.s);
      g.restore();
    }
    g.restore();

    // Disk: önde kalan yarı
    this.drawDisk(g, x, y, rs, true, bright);
  }

  /** Yığılma diski. Bize doğru gelen taraf daha parlak ve beyaz; uzaklaşan taraf sönük kızıl. */
  private drawDisk(g: CanvasRenderingContext2D, x: number, y: number, rs: number, front: boolean, bright: number) {
    if (this.diskAlpha < 0.01) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const d of this.disk) {
      const sn = Math.sin(d.a);
      if ((sn >= 0) !== front) continue;
      const px = x + Math.cos(d.a) * d.R * rs, py = y + sn * d.R * rs * FLAT;
      // Doppler: disk saat yönünün tersine döner; sağ yarı (cos > 0) bize doğru gelir, daha parlak ve beyaz
      const dop = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(d.a));
      const heat = clamp(1.2 - (d.R - 1.7) / 3.2, 0, 1);
      const r = 255, gg = Math.round(120 + 120 * heat), b = Math.round(50 + 160 * heat * dop);
      g.globalAlpha = clamp(dop * (0.45 + 0.55 * heat) * bright, 0, 1) * this.diskAlpha;
      g.fillStyle = `rgb(${r},${gg},${b})`;
      const s = d.s * (rs / 40);
      g.fillRect(px - s, py - s * 0.5, s * 2.4, s);
    }
    g.restore();
  }
}
