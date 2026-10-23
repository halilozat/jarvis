// Ekstra · Dünya'ya asteroit. Boşlukta çimdikleyince elinizde bir asteroit belirir; Dünya'ya doğru savurun.
// Çarpınca: beyaz parlama, ateş topu, yüzeyde yayılan şok dalgası, saçılan enkaz, sonra atmosfere yayılıp gezegeni
// karartan toz bulutu. Enerji gerçek hesaptan: E = ½ m v², m = ρ (π/6) D³, ρ = 3.000 kg/m³ (kayalık asteroit).
// Karşılaştırma: Chicxulub (66 milyon yıl önce, ≈10 km, ≈20 km/s; enerji ≈10²³ J, 100 milyon megaton mertebesi;
// Schulte ve ark. 2010, Science 327) · Hiroşima ≈15 kt TNT · 1 megaton = 4,184×10¹⁵ J.
import type { HoldState } from '../../fx';
import type { TrackedHand } from '../../gestures';
import type { SpaceCmd } from '../commands';
import { CYAN, DIM, TEXT } from '../labHud';
import { decode, easeOut, mechPanel, stamp } from '../mech';
import { Body, colorsOf } from '../planets';
import { sayi } from '../sentences';
import type { ExtraCtx, ExtraNumara } from './types';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const MT = 4.184e15;
const HIROSIMA = 6.3e13;

/** Çarpma enerjisi (J): çap (km), hız (km/s) */
export function carpmaEnerjisi(Dkm: number, vKmS: number) {
  const r = (Dkm * 1000) / 2, m = 3000 * (4 / 3) * Math.PI * r ** 3;
  return 0.5 * m * (vKmS * 1000) ** 2;
}

/** Büyük sayıyı Türkçe söyle: 75 milyon, 4,9 milyar */
function buyuk(n: number): string {
  if (n >= 1e12) return `${sayi(n / 1e12, n < 1e13 ? 1 : 0)} trilyon`;
  if (n >= 1e9) return `${sayi(n / 1e9, n < 1e10 ? 1 : 0)} milyar`;
  if (n >= 1e6) return `${sayi(n / 1e6, n < 1e7 ? 1 : 0)} milyon`;
  if (n >= 1e3) return `${sayi(n / 1e3, n < 1e4 ? 1 : 0)} bin`;
  return sayi(n, n < 10 ? 1 : 0);
}

interface Ast { x: number; y: number; vx: number; vy: number; held: string | null; body: Body; trail: { x: number; y: number }[]; vKmS: number }

export class AsteroidStrike implements ExtraNumara {
  ad = "DÜNYA'YA ASTEROİT";
  ipucu = '🤏 boşlukta çimdik: asteroit · Dünya\'ya savur   ·   "Jarvis, 20 kilometrelik asteroit"   ·   "sıfırla"';
  private earth: Body | null = null;
  private ast: Ast | null = null;
  private Dkm = 10;
  private impact: { x: number; y: number; at: number; E: number; vKmS: number; Dkm: number; nx: number; ny: number } | null = null;
  private startAt = 0;
  private flashAt = -1e9;
  private dust: { a: number; r: number; s: number }[] = [];

  start(now: number, ctx: ExtraCtx) {
    this.startAt = now;
    this.earth = new Body('dunya', 0, 0, 100, now);
    this.earth.form = 1;
    this.earth.light = [-0.7, 0.35, 0.62];
    this.impact = null; this.ast = null;
    void ctx.say("Dünya karşınızda efendim. Boşlukta çimdikleyin, asteroidinizi alın ve savurun.");
  }

  private earthPos(ctx: ExtraCtx) { const R = Math.min(ctx.W, ctx.H) * 0.27; return { x: ctx.W * 0.6, y: ctx.H * 0.52, R }; }

  command(cmd: SpaceCmd, _now: number, ctx: ExtraCtx) {
    if (cmd.tip === 'sifirla' || cmd.tip === 'temizle') { this.impact = null; this.ast = null; this.dust = []; return ctx.say('Dünya eski hâline döndü efendim. Bu sefer daha nazik olun.'); }
    if (cmd.tip !== 'ekstra') return;
    if (cmd.boyutKm) this.Dkm = clamp(cmd.boyutKm, 0.05, 100);
    // Sesle: kenardan kendiliğinden fırlar
    if (!this.ast && !this.impact) this.spawn(-60, ctx.H * 0.18, ctx, null, 20);
    const e = this.earthPos(ctx);
    if (this.ast && !this.ast.held) { const dx = e.x - this.ast.x, dy = e.y - this.ast.y, d = Math.hypot(dx, dy); this.ast.vx = (dx / d) * 900; this.ast.vy = (dy / d) * 900; this.ast.vKmS = 20; }
    ctx.sfx.whoosh();
    return ctx.say(`${sayi(this.Dkm, this.Dkm < 1 ? 2 : 0)} kilometrelik bir asteroit yolda efendim.`);
  }

  private spawn(x: number, y: number, ctx: ExtraCtx, held: string | null, vKmS: number) {
    const body = new Body('merkur', x, y, 10, 0);
    body.form = 1;
    body.ownColors = true;
    const c = colorsOf('merkur'), d = new Uint8ClampedArray(c.length);
    for (let i = 0; i < c.length; i += 3) { d[i] = c[i] * 0.55 + 20; d[i + 1] = c[i + 1] * 0.5 + 14; d[i + 2] = c[i + 2] * 0.45 + 10; }
    body.colors = d;
    body.light = [-0.7, 0.35, 0.62];
    this.ast = { x, y, vx: 0, vy: 0, held, body, trail: [], vKmS };
    void ctx;
  }

  update(hands: TrackedHand[], now: number, dt: number, ctx: ExtraCtx, holds: HoldState[]) {
    void holds;
    const e = this.earthPos(ctx);
    if (this.earth) this.earth.yaw += dt * 0.08;
    // 🤏 boşlukta: asteroit elde belirir; bırakınca el hızıyla fırlar
    const p = hands.find(h => h.gesture === 'cimdik');
    if (!this.impact) {
      if (p && !this.ast && Math.hypot(p.shape.pinchPt.x - e.x, p.shape.pinchPt.y - e.y) > e.R * 1.2) { this.spawn(p.shape.pinchPt.x, p.shape.pinchPt.y, ctx, p.id, 20); ctx.sfx.grab(); }
      const a = this.ast;
      if (a?.held) {
        const h = hands.find(x => x.id === a.held);
        if (h && h.gesture === 'cimdik') { a.x += (h.shape.pinchPt.x - a.x) * 0.5; a.y += (h.shape.pinchPt.y - a.y) * 0.5; }
        else {
          // Bırakıldı: el hızı ekranda hız, çarpma hızı 11,2 (kaçış hızı) ile 72 km/s arası
          const vx = h?.vel.x ?? 0, vy = h?.vel.y ?? 0, sp = Math.hypot(vx, vy);
          a.held = null;
          a.vx = vx; a.vy = vy;
          a.vKmS = clamp(11.2 + sp / 60, 11.2, 72);
          if (sp > 300) ctx.sfx.whoosh();
        }
      } else if (a) {
        // Dünya'nın çekimi ekranda hafif bükülme verir
        const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy) || 1;
        const acc = 9e6 / (d * d);
        a.vx += (dx / d) * acc * dt; a.vy += (dy / d) * acc * dt;
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (d < e.R * 0.97) this.carp(a, e, now, ctx);
        else if (a.x < -300 || a.y < -300 || a.x > ctx.W + 300 || a.y > ctx.H + 300) this.ast = null;
      }
      if (this.ast) { this.ast.trail.push({ x: this.ast.x, y: this.ast.y }); if (this.ast.trail.length > 40) this.ast.trail.shift(); this.ast.body.yaw += dt * 2; }
    }
    // Toz bulutu: yayılır, sonra çok yavaş incelir
    if (this.impact) for (const d of this.dust) { d.a += d.s * dt; }
  }

  private carp(a: Ast, e: { x: number; y: number; R: number }, now: number, ctx: ExtraCtx) {
    const dx = a.x - e.x, dy = a.y - e.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const ix = e.x + nx * e.R * 0.96, iy = e.y + ny * e.R * 0.96;
    const E = carpmaEnerjisi(this.Dkm, a.vKmS);
    this.impact = { x: ix, y: iy, at: now, E, vKmS: a.vKmS, Dkm: this.Dkm, nx, ny };
    this.ast = null;
    this.flashAt = now;
    this.dust = Array.from({ length: 60 }, () => ({ a: Math.random() * TAU, r: Math.random(), s: (Math.random() - 0.5) * 0.3 }));
    // Enkaz: kızgın kaya ve toz
    const pts = Array.from({ length: 420 }, () => [ix + (Math.random() - 0.5) * 30, iy + (Math.random() - 0.5) * 30, 255, 120 + Math.random() * 110, 40 + Math.random() * 40]);
    ctx.fx.colorBurst(pts, ix - nx * 20, iy - ny * 20, 900, 4.5);
    ctx.fx.colorBurst(Array.from({ length: 200 }, () => [ix, iy, 150, 130, 110]), ix - nx * 10, iy - ny * 10, 500, 5);
    ctx.fx.shake = 1.6;
    ctx.sfx.boom(); ctx.sfx.collision();
    const mt = E / MT, hir = E / HIROSIMA;
    const kiyas = mt > 3e7 && mt < 3e8 ? '66 milyon yıl önce dinozorların sonunu getiren Chicxulub çarpması da bu ölçekteydi.' : mt >= 3e8 ? "Chicxulub'dan da büyük bir çarpma." : 'Chicxulub\'dan küçük ama yine de bölgesel bir felaket.';
    void ctx.say(`Çarpma enerjisi yaklaşık ${buyuk(mt)} megaton efendim; Hiroşima bombasının ${buyuk(hir)} katı. ${kiyas}`);
  }

  render(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const e = this.earthPos(ctx), E = this.earth;
    if (!E) return;
    const on = easeOut((now - this.startAt) / 1000);
    // Atmosfer halesi
    const gr = g.createRadialGradient(e.x, e.y, e.R * 0.95, e.x, e.y, e.R * 1.12);
    gr.addColorStop(0, `rgba(110,170,255,${0.5 * on})`); gr.addColorStop(1, 'rgba(110,170,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(e.x, e.y, e.R * 1.12, 0, TAU); g.fill();
    E.x = E.tx = e.x; E.y = E.ty = e.y; E.r = E.tr = e.R * on;
    ctx.renderer.draw(g, E, now, ctx.dpr);
    const im = this.impact;
    if (im) this.sonrasi(g, now, e, im);
    // Asteroit ve iz
    const a = this.ast;
    if (a) {
      g.save();
      for (let i = 1; i < a.trail.length; i++) {
        const t0 = a.trail[i - 1], t1 = a.trail[i], k = i / a.trail.length;
        g.strokeStyle = `rgba(255,${150 + 80 * k},90,${0.5 * k})`; g.lineWidth = 1 + 5 * k;
        g.beginPath(); g.moveTo(t0.x, t0.y); g.lineTo(t1.x, t1.y); g.stroke();
      }
      g.restore();
      a.body.x = a.body.tx = a.x; a.body.y = a.body.ty = a.y;
      a.body.r = a.body.tr = 9 + Math.sqrt(this.Dkm) * 2;
      ctx.renderer.draw(g, a.body, now, ctx.dpr);
      if (!a.held) this.hedefCizgisi(g, a, e);
    }
    // Parlama
    const fa = (now - this.flashAt) / 700;
    if (fa < 1) { g.save(); g.globalAlpha = (1 - fa) * 0.85; g.fillStyle = fa < 0.12 ? '#fff' : 'rgb(255,210,150)'; g.fillRect(-20, -20, ctx.W + 40, ctx.H + 40); g.restore(); }
    if (im) this.panel(g, now, ctx, im);
  }

  /** Dünya'ya giden yol (öngörü çizgisi) */
  private hedefCizgisi(g: CanvasRenderingContext2D, a: Ast, e: { x: number; y: number; R: number }) {
    g.save();
    g.strokeStyle = 'rgba(255,200,120,0.5)'; g.setLineDash([4, 8]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + a.vx * 0.6, a.y + a.vy * 0.6); g.stroke();
    g.restore();
    void e;
  }

  /** Çarpma sonrası: ateş topu, şok dalgası, toz bulutunun gezegeni sarması */
  private sonrasi(g: CanvasRenderingContext2D, now: number, e: { x: number; y: number; R: number }, im: NonNullable<AsteroidStrike['impact']>) {
    const t = (now - im.at) / 1000;
    const olcek = clamp(Math.cbrt(im.E / 3e23), 0.3, 2.5);
    g.save();
    g.beginPath(); g.arc(e.x, e.y, e.R, 0, TAU); g.clip();
    // Toz: çarpma noktasından yayılıp bütün diski kaplar (gezegen kararır)
    const tozR = e.R * 2.2 * easeOut(t / (7 / olcek));
    const tg = g.createRadialGradient(im.x, im.y, 0, im.x, im.y, Math.max(1, tozR));
    tg.addColorStop(0, `rgba(70,55,45,${Math.min(0.85, 0.3 + t * 0.1)})`); tg.addColorStop(0.7, `rgba(90,75,60,${Math.min(0.7, 0.2 + t * 0.08)})`); tg.addColorStop(1, 'rgba(90,75,60,0)');
    g.fillStyle = tg; g.fillRect(e.x - e.R, e.y - e.R, e.R * 2, e.R * 2);
    // Dönen toz hüzmeleri
    g.globalAlpha = Math.min(0.5, t * 0.15);
    for (const d of this.dust) {
      const rr = d.r * tozR;
      g.fillStyle = 'rgba(120,100,80,0.5)';
      g.beginPath(); g.ellipse(im.x + Math.cos(d.a) * rr, im.y + Math.sin(d.a) * rr * 0.6, 26, 9, d.a, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // Şok dalgası (yüzeyde)
    for (let i = 0; i < 3; i++) {
      const k = clamp((t - i * 0.25) / 2.2, 0, 1);
      if (k <= 0 || k >= 1) continue;
      g.strokeStyle = `rgba(255,230,190,${0.8 * (1 - k)})`; g.lineWidth = 3 * (1 - k) + 1;
      g.beginPath(); g.arc(im.x, im.y, k * e.R * 1.6 * olcek, 0, TAU); g.stroke();
    }
    // Ateş topu
    const fk = clamp(t / 1.6, 0, 1);
    if (fk < 1) {
      const fr = e.R * 0.35 * olcek * Math.sin(Math.PI * Math.min(1, fk * 1.4));
      const fg = g.createRadialGradient(im.x, im.y, 0, im.x, im.y, Math.max(1, fr));
      fg.addColorStop(0, 'rgba(255,255,230,0.95)'); fg.addColorStop(0.4, 'rgba(255,170,60,0.85)'); fg.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = fg; g.beginPath(); g.arc(im.x, im.y, Math.max(1, fr), 0, TAU); g.fill();
    }
    // Kızgın krater
    g.fillStyle = `rgba(255,${120 + 60 * Math.sin(now / 150)},40,${Math.max(0.25, 0.9 - t * 0.05)})`;
    g.beginPath(); g.arc(im.x, im.y, e.R * 0.05 * olcek, 0, TAU); g.fill();
    g.restore();
  }

  private panel(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx, im: NonNullable<AsteroidStrike['impact']>) {
    const age = now - im.at - 600;
    if (age <= 0) return;
    const x = ctx.W * 0.06, y = ctx.H * 0.16, w = Math.min(380, ctx.W * 0.3), h = 300;
    g.save();
    mechPanel(g, x, y, w, h, age, 'ÇARPMA ANALİZİ', 'IMP-01', 4, 4);
    const rows: [string, string][] = [
      ['ÇAP', `${sayi(im.Dkm, im.Dkm < 1 ? 2 : 0)} km`],
      ['HIZ', `${sayi(im.vKmS, 1)} km/s`],
      ['ENERJİ', `≈ ${buyuk(im.E / MT)} megaton`],
      ['HİROŞİMA', `× ${buyuk(im.E / HIROSIMA)}`],
    ];
    g.textBaseline = 'top';
    rows.forEach(([k, v], i) => {
      const p = (age - 300 - i * 200) / 400;
      if (p <= 0) return;
      const ry = y + 48 + i * 42;
      g.fillStyle = DIM; g.font = '600 14px Rajdhani, sans-serif'; g.textAlign = 'left'; g.fillText(k, x + 18, ry + 6);
      g.fillStyle = TEXT; g.font = '700 24px Rajdhani, sans-serif'; g.textAlign = 'right'; g.fillText(decode(v, p, i + 3), x + w - 18, ry);
    });
    const sp = (age - 1400) / 300;
    stamp(g, 'KÜRESEL KIŞ', x + w / 2, y + 236, sp, 'rgb(255,170,110)', 22);
    g.fillStyle = DIM; g.font = '500 12px Rajdhani, sans-serif'; g.textAlign = 'center';
    g.fillText('E = ½ m v² · ρ = 3.000 kg/m³ · Chicxulub ≈ 10 km, 20 km/s', x + w / 2, y + h - 22);
    g.fillStyle = CYAN;
    g.restore();
  }

  durum() {
    const im = this.impact;
    return { numara: "Dünya'ya asteroit", cap_km: this.Dkm, ...(im ? { carpma_hizi_km_s: +im.vKmS.toFixed(1), enerji_megaton: Math.round(im.E / MT) } : {}) };
  }
}
