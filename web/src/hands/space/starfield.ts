// Uzay Modu · arka plan: tamamen prosedürel yıldız alanı (dosya yok).
// 3 derinlik katmanı (uzak binlerce minik, orta, yakın az ve parlak), yavaş sürüklenme ile parallax, göz kırpma,
// sıcak/soğuk renkler, Samanyolu bandı, soluk nebulalar, ara sıra kayan yıldız. Yıldızlar veri olarak tutulur:
// kara delik varken her yıldız konumu bükülerek (merceklenme) tek tek çizilir.

interface Star { x: number; y: number; s: number; a: number; c: number; tw: number; ph: number }
interface Shooting { x: number; y: number; vx: number; vy: number; at: number; dur: number }

/** Yıldız renkleri: mavi-beyaz, beyaz, sarı, turuncu */
const COLORS = ['rgb(190,215,255)', 'rgb(245,247,255)', 'rgb(255,236,190)', 'rgb(255,196,140)'];
const pickColor = (r: number) => (r < 0.28 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3);

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Kara delik merceklenmesi için: merkez, gölge yarıçapı */
export interface Lens { x: number; y: number; rs: number }

export class Starfield {
  private g: CanvasRenderingContext2D;
  private W = 0; private H = 0; private dpr = 1;
  /** Katmanlar: uzak, orta, yakın. Konumlar alan genişliğinde (W + pay) sarar. */
  private layers: Star[][] = [[], [], []];
  private speed = [3, 7, 14];
  private drift = 0;
  /** Samanyolu + nebulalar + uzak ve orta yıldızlar: bir kez çizilen arka plan */
  private bg: HTMLCanvasElement | null = null;
  private shooting: Shooting[] = [];
  private nextShoot = 0;
  private warpAt = -1e9;
  private glow: HTMLCanvasElement;

  private canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.glow = document.createElement('canvas');
    this.glow.width = this.glow.height = 32;
    const gg = this.glow.getContext('2d')!;
    const gr = gg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(220,235,255,0.6)'); gr.addColorStop(1, 'rgba(220,235,255,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 32, 32);
  }

  resize(W: number, H: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    const area = (W * H) / (1440 * 900);
    const make = (n: number, s0: number, s1: number, a0: number, a1: number): Star[] =>
      Array.from({ length: Math.round(n * area) }, () => {
        const r = Math.random();
        return { x: Math.random() * W, y: Math.random() * H, s: rnd(s0, s1), a: rnd(a0, a1), c: pickColor(r), tw: rnd(0.6, 2.4), ph: Math.random() * TAU };
      });
    this.layers = [make(2600, 0.5, 1.1, 0.25, 0.75), make(520, 1.0, 1.7, 0.45, 0.95), make(70, 1.6, 2.6, 0.7, 1)];
    this.bg = this.buildBackground();
  }

  /** Samanyolu bandı (gürültü tabanlı yumuşak ışık şeridi, toz bantlarıyla) ve 3 soluk nebula */
  private buildBackground(): HTMLCanvasElement {
    const { W, H } = this;
    const c = document.createElement('canvas');
    c.width = Math.round(W); c.height = Math.round(H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#02030a';
    g.fillRect(0, 0, W, H);
    // Derinlik: köşelerde hafif mavi-mor
    const v = g.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(12,16,40,0.0)'); v.addColorStop(1, 'rgba(18,10,40,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    // Nebulalar: üst üste binmiş yumuşak lekeler
    const blob = (x: number, y: number, r: number, rgb: string, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const neb = [[0.18, 0.28, '150,70,200'], [0.82, 0.72, '60,110,220'], [0.68, 0.18, '230,120,60']] as const;
    for (const [nx, ny, rgb] of neb) {
      for (let i = 0; i < 26; i++) blob(W * nx + rnd(-1, 1) * W * 0.09, H * ny + rnd(-1, 1) * H * 0.1, rnd(0.05, 0.16) * W, rgb, rnd(0.015, 0.04));
    }
    // Samanyolu: köşegen bant
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-0.42);
    const L = Math.hypot(W, H);
    for (let i = 0; i < 900; i++) {
      const x = rnd(-L / 2, L / 2);
      const off = (Math.random() + Math.random() + Math.random() - 1.5) * H * 0.09;
      const r = rnd(8, 40);
      const warm = Math.random() < 0.35;
      const gr = g.createRadialGradient(x, off, 0, x, off, r);
      gr.addColorStop(0, warm ? 'rgba(255,225,190,0.05)' : 'rgba(190,205,255,0.045)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, off - r, r * 2, r * 2);
    }
    // Bant içinde yoğun minik yıldız tozu
    for (let i = 0; i < 6000; i++) {
      const x = rnd(-L / 2, L / 2), y = (Math.random() + Math.random() - 1) * H * 0.1;
      g.fillStyle = `rgba(230,235,255,${rnd(0.05, 0.35)})`;
      g.fillRect(x, y, rnd(0.4, 1), rnd(0.4, 1));
    }
    // Toz bantları (koyu)
    for (let i = 0; i < 160; i++) {
      const x = rnd(-L / 2, L / 2), y = (Math.random() - 0.5) * H * 0.05, r = rnd(10, 34);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(2,3,10,0.35)'); gr.addColorStop(1, 'rgba(2,3,10,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
    return c;
  }

  /** Mod geçişi: oda kararıp yıldızlar ışık hızında belirir (0,8 sn) */
  warp(now: number) { this.warpAt = now; }

  /** "Jarvis, kayan yıldız" ya da kendiliğinden (15-30 sn'de bir) */
  shoot(now: number) {
    const fromLeft = Math.random() < 0.5;
    const sp = rnd(900, 1400);
    const ang = rnd(0.25, 0.5);
    this.shooting.push({ x: fromLeft ? rnd(0, this.W * 0.4) : rnd(this.W * 0.6, this.W), y: rnd(0, this.H * 0.35), vx: (fromLeft ? 1 : -1) * Math.cos(ang) * sp, vy: Math.sin(ang) * sp, at: now, dur: rnd(0.7, 1.1) });
  }

  /** punch: tam uzayda kişinin olduğu yere delik (segment.ts) — yıldızlar videonun üstünde, siz delikten görünürsünüz */
  render(now: number, dt: number, lens: Lens | null, punch?: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
    const g = this.g, { W, H } = this;
    if (!this.bg) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drift += dt;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0, W, H);

    const t = now / 1000;
    const w = (now - this.warpAt) / 800;
    const warping = w < 1;

    if (warping) {
      // Işık hızı: yıldızlar merkezden dışa çizgi olarak uzar, sonra noktaya oturur
      const k = ease(w);
      g.globalAlpha = Math.min(1, w * 2);
      const cx = W / 2, cy = H / 2;
      g.lineCap = 'round';
      for (const layer of this.layers) {
        for (const s of layer) {
          const dx = s.x - cx, dy = s.y - cy;
          const len = (1 - k) * 0.35;
          g.strokeStyle = COLORS[s.c];
          g.lineWidth = s.s;
          g.beginPath();
          g.moveTo(cx + dx * (1 - len), cy + dy * (1 - len));
          g.lineTo(s.x, s.y);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    } else {
      for (let li = 0; li < 3; li++) {
        const off = (this.drift * this.speed[li]) % W;
        this.drawLayer(g, this.layers[li], off, li, t, lens);
      }
    }

    // Kayan yıldız
    if (now > this.nextShoot) {
      if (this.nextShoot) this.shoot(now);
      this.nextShoot = now + rnd(15000, 30000);
    }
    this.shooting = this.shooting.filter(s => (now - s.at) / 1000 < s.dur);
    for (const s of this.shooting) {
      const u = (now - s.at) / 1000;
      const x = s.x + s.vx * u, y = s.y + s.vy * u;
      const a = Math.sin(Math.PI * (u / s.dur));
      const tail = 0.12;
      const gr = g.createLinearGradient(x - s.vx * tail, y - s.vy * tail, x, y);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(255,255,255,${0.9 * a})`);
      g.strokeStyle = gr; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - s.vx * tail, y - s.vy * tail); g.lineTo(x, y); g.stroke();
      g.globalAlpha = a;
      g.drawImage(this.glow, x - 6, y - 6, 12, 12);
      g.globalAlpha = 1;
    }
    punch?.(g, W, H);
  }

  /**
   * Bir katmanı çiz. Kara delik varsa her yıldızın konumu radyal olarak dışa bükülür (Einstein halkası benzeri):
   * r' = r + rE² / r. Gölgenin içine düşen yıldız görünmez, halkaya yakın olanlar teğet yönde uzar.
   */
  private drawLayer(g: CanvasRenderingContext2D, stars: Star[], off: number, li: number, t: number, lens: Lens | null) {
    const W = this.W;
    const rE = lens ? lens.rs * 2.6 : 0;
    // Renk başına tek yol: binlerce yıldız hızlı çizilir
    for (let c = 0; c < 4; c++) {
      g.fillStyle = COLORS[c];
      g.beginPath();
      for (const s of stars) {
        if (s.c !== c) continue;
        let x = s.x - off; if (x < 0) x += W;
        let y = s.y;
        let stretch = 1;
        if (lens) {
          const dx = x - lens.x, dy = y - lens.y, r = Math.hypot(dx, dy);
          if (r < lens.rs * 7) {
            if (r < lens.rs * 1.05) continue;
            const r2 = r + (rE * rE) / r;
            x = lens.x + (dx / r) * r2; y = lens.y + (dy / r) * r2;
            stretch = 1 + (rE / r) * 2.2;
          }
        }
        const a = li === 0 ? s.a : s.a * (0.65 + 0.35 * Math.sin(t * s.tw + s.ph));
        if (a < 0.3 && li > 0) continue;
        const sz = s.s;
        if (stretch > 1.05) {
          // Teğet yönde uzamış yay parçası (merceklenme)
          g.save();
          g.translate(x, y);
          g.rotate(Math.atan2(y - lens!.y, x - lens!.x) + Math.PI / 2);
          g.rect(-sz * stretch / 2, -sz / 2, sz * stretch, sz);
          g.restore();
        } else g.rect(x, y, sz, sz);
      }
      g.globalAlpha = li === 0 ? 0.6 : 0.9;
      g.fill();
    }
    g.globalAlpha = 1;
    // Yakın katmanın parlak yıldızlarına ışıltı
    if (li === 2) {
      for (const s of stars) {
        let x = s.x - off; if (x < 0) x += W;
        let y = s.y;
        if (lens) {
          const dx = x - lens.x, dy = y - lens.y, r = Math.hypot(dx, dy);
          if (r < lens.rs * 1.05) continue;
          if (r < lens.rs * 7) { const r2 = r + (rE * rE) / r; x = lens.x + (dx / r) * r2; y = lens.y + (dy / r) * r2; }
        }
        g.globalAlpha = 0.35 + 0.35 * Math.sin(t * s.tw * 1.5 + s.ph);
        const gs = s.s * 4;
        g.drawImage(this.glow, x - gs / 2, y - gs / 2, gs, gs);
      }
      g.globalAlpha = 1;
    }
  }

  clear() {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
