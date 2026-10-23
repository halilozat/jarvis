// Ekstra · kafanızın etrafında Ay. Yüzünüz Dünya'nın yerine geçer; Ay başınızın çevresinde eğik bir yörüngede döner.
// Yörüngenin arka yarısındayken başınız onu gerçekten kapatır: arka yarı ayrı bir katmana çizilir, kişi maskesiyle
// (segment.ts) sizin olduğunuz yer o katmandan silinir. Ay'ın evreleri ışığa göre değişir (önde dolunay, arkada yeni ay).
// İsteğe bağlı: başınızın çevresinde Satürn gibi bir halka. Gerçek değerler kartta: 384.400 km, 27,3 gün.
import type { HoldState } from '../../fx';
import type { TrackedHand } from '../../gestures';
import type { SpaceCmd } from '../commands';
import { M_CYAN, decode, easeOut } from '../mech';
import { Body } from '../planets';
import type { ExtraCtx, ExtraNumara } from './types';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Ekranda bir tur (s); gerçekte 27,3 gün */
const TUR = 9;

export class ArMoon implements ExtraNumara {
  ad = 'KAFANIZIN ETRAFINDA AY';
  ipucu = '🤏 sağa/sola sürükle: hızlandır, yavaşlat   ·   "Jarvis, halka ekle"   ·   ✊ 1 sn: durdur';
  private moon: Body | null = null;
  private ang = Math.PI * 0.3;
  private hiz = TAU / TUR;
  private durdu = false;
  private halka = false;
  private halkaP: Float32Array | null = null;
  /** Yumuşatılmış kafa kutusu */
  private kafa: { x: number; y: number; w: number; h: number } | null = null;
  private kayipAt = 0;
  private startAt = 0;
  private arka: HTMLCanvasElement = document.createElement('canvas');
  private arkaG = this.arka.getContext('2d')!;
  private dragX: number | null = null;
  private fistAt = -1;

  start(now: number, ctx: ExtraCtx) {
    this.startAt = now;
    this.moon = new Body('ay', 0, 0, 20, now);
    this.moon.form = 1;
    this.moon.ambient = 0.06;
    void ctx.say("Dünya'nın yerine siz geçtiniz efendim. Ay gerçekte bir turunu 27,3 günde atar; ben biraz hızlandırdım.");
  }

  command(cmd: SpaceCmd, _now: number, ctx: ExtraCtx) {
    if (cmd.tip !== 'ekstra' || cmd.halka === undefined) return;
    this.halka = cmd.halka;
    ctx.sfx.solar();
    return ctx.say(cmd.halka ? 'Halkanız hazır efendim. Satürn kıskanabilir.' : 'Halka kaldırıldı efendim.');
  }

  update(hands: TrackedHand[], now: number, dt: number, ctx: ExtraCtx, holds: HoldState[]) {
    // Kafa: yumuşat; kısa kayıplarda son yerinde kal
    const h = ctx.head;
    if (h) {
      this.kayipAt = now;
      if (!this.kafa) this.kafa = { ...h };
      const k = 1 - Math.exp(-dt * 9);
      this.kafa.x += (h.x - this.kafa.x) * k; this.kafa.y += (h.y - this.kafa.y) * k;
      this.kafa.w += (h.w - this.kafa.w) * k; this.kafa.h += (h.h - this.kafa.h) * k;
    } else if (!this.kafa || now - this.kayipAt > 2500) {
      // Yüz yoksa ekranın üst ortası
      const w = Math.min(ctx.W, ctx.H) * 0.24;
      this.kafa = { x: ctx.W / 2 - w / 2, y: ctx.H * 0.22, w, h: w * 1.25 };
    }
    // 🤏 sağa/sola sürükle: hız · ✊ 1 sn: durdur/başlat
    const p = hands.find(x => x.gesture === 'cimdik');
    if (p) {
      if (this.dragX !== null) this.hiz = clamp(this.hiz + (p.shape.pinchPt.x - this.dragX) * 0.004, -TAU / 1.5, TAU / 1.5);
      this.dragX = p.shape.pinchPt.x;
    } else this.dragX = null;
    const f = hands.find(x => x.gesture === 'yumruk');
    if (f) {
      const pr = (now - f.since - 150) / 1000;
      if (pr > 0 && this.fistAt !== f.since) {
        if (pr >= 1) { this.fistAt = f.since; this.durdu = !this.durdu; ctx.sfx.confirm(); }
        else holds.push({ x: f.shape.palm.x, y: f.shape.palm.y, r: f.shape.size * 1.1, p: pr, label: this.durdu ? '▶ AY' : '⏸ AY', done: 0 });
      }
    }
    if (!this.durdu) this.ang += this.hiz * dt;
  }

  render(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const k0 = this.kafa, m = this.moon;
    if (!k0 || !m) return;
    const { W, H, dpr } = ctx;
    const on = easeOut((now - this.startAt) / 1200);
    // Yörünge: kafanın biraz üst-ortasında, eğik elips
    const cx = k0.x + k0.w / 2, cy = k0.y + k0.h * 0.5;
    const R = k0.w * 1.25 * on, ry = R * 0.3, tilt = -0.16;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const nokta = (a: number, rr = R, yy = ry) => { const x = Math.cos(a) * rr, y = Math.sin(a) * yy; return { x: cx + x * ct - y * st, y: cy + x * st + y * ct }; };
    const onde = Math.sin(this.ang) > 0;
    const q = nokta(this.ang);
    // Önde büyük, arkada küçük (derinlik)
    const derin = Math.sin(this.ang);
    m.x = m.tx = q.x; m.y = m.ty = q.y;
    m.r = m.tr = Math.max(6, k0.w * 0.16 * (1 + 0.22 * derin)) * on;
    m.yaw += 0.004;
    // Evreler: önde dolunay, arkada yeni ay; yanlarda yarım
    const lx = -0.6 * Math.cos(this.ang), lz = 0.25 + 0.75 * derin, ly = 0.2, ln = Math.hypot(lx, ly, lz) || 1;
    m.light = [lx / ln, ly / ln, lz / ln];

    // ---- Arka katman: yörüngenin arka yarısı, halkanın arkası, arkadaysa Ay; sonra kişi maskesiyle kafa siliniyor
    if (this.arka.width !== Math.round(W * dpr) || this.arka.height !== Math.round(H * dpr)) { this.arka.width = Math.round(W * dpr); this.arka.height = Math.round(H * dpr); }
    const a = this.arkaG;
    a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, this.arka.width, this.arka.height);
    a.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.yorunge(a, nokta, false);
    if (this.halka) this.halkaCiz(a, cx, cy, R, ry, ct, st, now, false);
    if (!onde) { this.parilti(a, m.x, m.y, m.r, 0.5); ctx.renderer.draw(a, m, now, dpr); }
    if (ctx.cutout?.ready) ctx.cutout.punch(a, W, H);
    else this.sahteKafa(a, k0, ctx.demo);
    g.drawImage(this.arka, 0, 0, W, H);
    if (!ctx.cutout?.ready && ctx.demo) this.kafaCizgisi(g, k0);

    // ---- Ön katman
    this.yorunge(g, nokta, true);
    if (this.halka) this.halkaCiz(g, cx, cy, R, ry, ct, st, now, true);
    if (onde) { this.parilti(g, m.x, m.y, m.r, 0.8); ctx.renderer.draw(g, m, now, dpr); this.etiket(g, m.x, m.y, m.r, now); }
  }

  /** Yörünge çizgisi: arka yarı (sin < 0) ya da ön yarı */
  private yorunge(g: CanvasRenderingContext2D, nokta: (a: number) => { x: number; y: number }, on: boolean) {
    g.save();
    g.strokeStyle = on ? 'rgba(180,230,255,0.75)' : 'rgba(180,230,255,0.4)';
    g.lineWidth = on ? 1.6 : 1.1;
    g.setLineDash(on ? [] : [5, 6]);
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 3;
    g.beginPath();
    const a0 = on ? 0 : Math.PI;
    for (let i = 0; i <= 64; i++) { const p = nokta(a0 + (i / 64) * Math.PI); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
    g.stroke();
    g.restore();
  }

  private parilti(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
    const gr = g.createRadialGradient(x, y, r * 0.9, x, y, r * 2);
    gr.addColorStop(0, `rgba(220,230,255,${0.35 * a})`); gr.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill();
  }

  /** Satürn gibi halka: parçacıklar, arkası ve önü ayrı */
  private halkaCiz(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, ry: number, ct: number, st: number, now: number, on: boolean) {
    if (!this.halkaP) {
      this.halkaP = new Float32Array(1400 * 3);
      for (let i = 0; i < 1400; i++) { this.halkaP[i * 3] = 0.72 + Math.random() * 0.5; this.halkaP[i * 3 + 1] = Math.random() * TAU; this.halkaP[i * 3 + 2] = Math.random(); }
    }
    const P = this.halkaP, t = now / 1000;
    g.save();
    for (let i = 0; i < 1400; i++) {
      const rr = P[i * 3], a = P[i * 3 + 1] + t * (0.5 / rr), c = P[i * 3 + 2];
      if ((Math.sin(a) > 0) !== on) continue;
      const x = Math.cos(a) * R * rr, y = Math.sin(a) * ry * rr;
      const px = cx + x * ct - y * st, py = cy + x * st + y * ct;
      g.fillStyle = c > 0.7 ? 'rgba(240,222,180,0.9)' : c > 0.3 ? 'rgba(225,205,160,0.6)' : 'rgba(200,180,140,0.35)';
      g.fillRect(px - 1, py - 1, 2, 2);
    }
    g.restore();
  }

  /** Maske yoksa (demo ya da model yükleniyor): kafa elipsini arka katmandan sil */
  private sahteKafa(a: CanvasRenderingContext2D, k: { x: number; y: number; w: number; h: number }, demo: boolean) {
    if (!demo) return;
    a.save();
    a.globalCompositeOperation = 'destination-out';
    a.beginPath(); a.ellipse(k.x + k.w / 2, k.y + k.h / 2, k.w * 0.48, k.h * 0.55, 0, 0, TAU); a.fill();
    a.fillRect(k.x - k.w * 0.25, k.y + k.h * 0.95, k.w * 1.5, k.h * 2);
    a.restore();
  }

  /** Demoda kafanın yerini göster (kamera yok) */
  private kafaCizgisi(g: CanvasRenderingContext2D, k: { x: number; y: number; w: number; h: number }) {
    g.save();
    g.fillStyle = 'rgba(40,60,80,0.55)';
    g.beginPath(); g.ellipse(k.x + k.w / 2, k.y + k.h / 2, k.w * 0.48, k.h * 0.55, 0, 0, TAU); g.fill();
    g.fillRect(k.x - k.w * 0.25, k.y + k.h * 0.95, k.w * 1.5, k.h * 2);
    g.restore();
  }

  /** Ay'ın yanında holografik etiket */
  private etiket(g: CanvasRenderingContext2D, x: number, y: number, r: number, now: number) {
    const p = (now - this.startAt - 1200) / 900;
    if (p <= 0) return;
    g.save();
    g.globalAlpha = clamp(p, 0, 1);
    g.strokeStyle = 'rgba(95,242,255,0.7)'; g.lineWidth = 1;
    const ex = x + r + 26, ey = y - r - 14;
    g.beginPath(); g.moveTo(x + r * 0.7, y - r * 0.7); g.lineTo(ex, ey); g.lineTo(ex + 120, ey); g.stroke();
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 4;
    g.fillStyle = M_CYAN; g.font = '700 15px Rajdhani, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(decode('AY', p, 3), ex + 4, ey - 2);
    g.fillStyle = 'rgba(223,251,255,0.9)'; g.font = '600 12px Rajdhani, sans-serif'; g.textBaseline = 'top';
    g.fillText(decode('384.400 km · 27,3 gün', p - 0.3, 5), ex + 4, ey + 3);
    g.restore();
  }

  durum() { return { numara: 'Kafanın etrafında Ay', halka: this.halka, hiz: +(this.hiz / (TAU / TUR)).toFixed(2) }; }
}
