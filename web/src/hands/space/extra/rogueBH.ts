// Ekstra · gezgin kara delik. Güneş'in 10 katı kütlede bir kara delik, saniyede 50 km hızla Güneş sisteminin içinden
// geçer. Gezegenler bugünkü gerçek yerlerinden başlar; sonrası gerçek N-cisim hesabı (physics.ts, AU · yıl · M☉):
// Güneş de çekilir, gezegenler savrulur. Geçiş bitince her gezegenin sonucu hesaptan: yörüngede (basıklığı nasıl
// değişti), kara deliğe yakalandı, sistemden fırlatıldı ya da yutuldu. Yıldızlar kara deliğin çevresinde bükülür.
// Değerler: yıldız kütleli kara delikler ≈5-100 M☉; Samanyolu'ndaki yıldızların tipik göreli hızları ≈20-100 km/s.
import type { HoldState } from '../../fx';
import type { TrackedHand } from '../../gestures';
import { BlackHole } from '../blackhole';
import type { SpaceCmd } from '../commands';
import { GEZEGENLER, VERI } from '../data';
import { sistem } from '../ephemeris';
import { CYAN, DIM, TEXT } from '../labHud';
import { decode, mechPanel, stamp } from '../mech';
import { G, Sim, elements, kmS } from '../physics';
import { Body, projectPoints } from '../planets';
import { Olcek, govdePx } from '../scale';
import { sayi } from '../sentences';
import type { Lens } from '../starfield';
import type { ExtraCtx, ExtraNumara } from './types';

/** Ekranda saniyede geçen yıl */
const YIL_SN = 0.8;
const BH = 9;

type Sonuc = { tip: 'yorunge'; e0: number; e: number } | { tip: 'yakalandi' } | { tip: 'kacti' } | { tip: 'yutuldu' };

export class RogueBH implements ExtraNumara {
  ad = 'GEZGİN KARA DELİK';
  ipucu = '"Jarvis, kara deliği yakından / uzaktan geçir"   ·   ✊ 1 sn: durdur   ·   "sıfırla"';
  private sim: Sim | null = null;
  private view = new Olcek();
  private bh: BlackHole | null = null;
  private bodies: Body[] = [];
  private sun: Body | null = null;
  private trails: { x: number; y: number }[][] = [];
  private e0: number[] = [];
  private yil = 0;
  private durdu = false;
  private fistAt = -1;
  private startAt = 0;
  private b = 4;
  private Mbh = 10;
  private vKmS = 50;
  private enYakin = Infinity;
  private yakinSoz = false;
  private sonuc: Sonuc[] | null = null;
  private sonucAt = 0;
  /** Güneş kara deliğe bağlandı mı (çift sistem) */
  private gunesYakalandi = false;
  private origin = { x: 0, y: 0 };

  start(now: number, ctx: ExtraCtx) {
    this.startAt = now; this.yil = 0; this.durdu = false; this.sonuc = null; this.enYakin = Infinity; this.yakinSoz = false;
    const s0 = sistem(new Date());
    const s = new Sim(10);
    for (const k of ['m', 'x', 'y', 'z', 'vx', 'vy', 'vz'] as const) (s[k] as Float64Array).set(s0[k], 0);
    // Kara delik: 60 AU uzaktan, Güneş'e b AU yakınlıkta geçecek şekilde, +x yönünde
    s.m[BH] = this.Mbh;
    s.x[BH] = s0.x[0] - 60; s.y[BH] = s0.y[0] + this.b; s.z[BH] = s0.z[0];
    s.vx[BH] = (this.vKmS * 1000 * 365.25 * 86400) / 149_597_870_700; s.vy[BH] = 0; s.vz[BH] = 0;
    s.dirty = true;
    this.sim = s;
    this.origin = { x: s.x[0], y: s.y[0] };
    this.e0 = GEZEGENLER.map((_, k) => s.elements(k + 1).e);
    this.sun = new Body('gunes', 0, 0, 12, now); this.sun.form = 1;
    this.bodies = GEZEGENLER.map(g => { const b = new Body(g, 0, 0, 6, now); b.form = 1; b.ambient = ctx.oda ? 0.4 : 0.13; return b; });
    this.trails = GEZEGENLER.map(() => []);
    this.bh = new BlackHole(0, 0, 18, now, null);
    ctx.sfx.blackHole(true);
    void ctx.say(`Güneş'in ${sayi(this.Mbh)} katı kütlede bir kara delik, saniyede ${sayi(this.vKmS)} kilometreyle sisteme giriyor efendim. Güneş'e ${sayi(this.b, this.b < 2 ? 1 : 0)} astronomi birimi yakından geçecek.`);
  }

  stop(ctx: ExtraCtx) { ctx.sfx.blackHole(false); }

  command(cmd: SpaceCmd, now: number, ctx: ExtraCtx) {
    if (cmd.tip === 'sifirla' || cmd.tip === 'temizle') { this.start(now, ctx); return; }
    if (cmd.tip === 'zaman') { this.durdu = cmd.islem === 'durdur'; return; }
    if (cmd.tip === 'ekstra' && cmd.yakin) { this.b = cmd.yakin === 'yakin' ? 1.5 : 12; this.start(now, ctx); }
  }

  lens(now: number): Lens | null { return this.bh && !this.sonuc ? this.bh.lens(now) : null; }

  update(hands: TrackedHand[], now: number, dt: number, ctx: ExtraCtx, holds: HoldState[]) {
    const f = hands.find(x => x.gesture === 'yumruk');
    if (f) {
      const pr = (now - f.since - 150) / 1000;
      if (pr > 0 && this.fistAt !== f.since) {
        if (pr >= 1) { this.fistAt = f.since; this.durdu = !this.durdu; ctx.sfx.confirm(); }
        else holds.push({ x: f.shape.palm.x, y: f.shape.palm.y, r: f.shape.size * 1.1, p: pr, label: this.durdu ? '▶ ZAMAN' : '⏸ ZAMAN', done: 0 });
      }
    }
    const s = this.sim;
    if (!s || this.durdu || this.sonuc) { this.bh?.update(dt); return; }
    // İlerle: adım, en yakın karşılaşmanın yerel süresine göre kısalır (kara delik çok yaklaşınca küçük adımlar)
    let left = dt * YIL_SN, n = 0;
    while (left > 1e-9 && n < 4000) {
      let h = 0.01;
      for (let i = 1; i < 9; i++) {
        if (s.gone[i]) continue;
        for (const j of [0, BH]) {
          const d = Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j], s.z[i] - s.z[j]);
          h = Math.min(h, 0.015 * Math.sqrt((d * d * d) / (G * s.m[j])));
        }
      }
      h = Math.max(1e-6, Math.min(h, left));
      s.step(h);
      left -= h; this.yil += h; n++;
      // Yutulma: kara deliğe 0,01 AU'dan yakın
      for (let i = 1; i < 9; i++) {
        if (s.gone[i]) continue;
        if (Math.hypot(s.x[i] - s.x[BH], s.y[i] - s.y[BH]) < 0.01) { s.absorb(BH, i); this.yutuldu(i, ctx); }
      }
    }
    this.bh?.update(dt);
    const dSun = Math.hypot(s.x[BH] - s.x[0], s.y[BH] - s.y[0]);
    this.enYakin = Math.min(this.enYakin, dSun);
    if (!this.yakinSoz && s.x[BH] > s.x[0]) { this.yakinSoz = true; ctx.sfx.boom(); }
    // Bitiş: kara delik yaklaşıp yeniden uzaklaştı ya da 20 yıl geçti (Güneş'i yakaladıysa hiç uzaklaşmaz)
    if ((this.enYakin < 30 && dSun > 45) || this.yil > 20) this.bitir(now, ctx);
  }

  private yutuldu(i: number, ctx: ExtraCtx) {
    const b = this.bodies[i - 1];
    this.bh?.feed(projectPoints(b, 3));
    ctx.sfx.collision();
  }

  /** Geçiş bitti: her gezegenin sonucu hesaptan */
  private bitir(now: number, ctx: ExtraCtx) {
    const s = this.sim!;
    this.sonuc = GEZEGENLER.map((_, k) => {
      const i = k + 1;
      if (s.gone[i]) return { tip: 'yutuldu' } as Sonuc;
      const el = s.elements(i);
      if (el.bound) return { tip: 'yorunge', e0: this.e0[k], e: el.e } as Sonuc;
      const rel = elements(s.x[i] - s.x[BH], s.y[i] - s.y[BH], s.vx[i] - s.vx[BH], s.vy[i] - s.vy[BH], G * (s.m[BH] + s.m[i]));
      return (rel.bound ? { tip: 'yakalandi' } : { tip: 'kacti' }) as Sonuc;
    });
    this.sonucAt = now;
    const gb = elements(s.x[0] - s.x[BH], s.y[0] - s.y[BH], s.vx[0] - s.vx[BH], s.vy[0] - s.vy[BH], G * (s.m[0] + s.m[BH]));
    this.gunesYakalandi = gb.bound;
    ctx.sfx.blackHole(false);
    ctx.sfx.solar();
    const ad = (k: number) => VERI[GEZEGENLER[k]].ad;
    const liste = (tip: Sonuc['tip']) => this.sonuc!.map((r, k) => (r.tip === tip ? ad(k) : '')).filter(Boolean);
    const d = this.sonuc[2];
    const dunya = d.tip === 'yorunge'
      ? (Math.abs(d.e - d.e0) < 0.01 ? "Dünya'nın yörüngesi neredeyse hiç değişmedi." : `Dünya hâlâ Güneş'in çevresinde, ama yörüngesinin basıklığı ${sayi(d.e0, 2)}'den ${sayi(d.e, 2)}'e çıktı.`)
      : d.tip === 'kacti' ? 'Dünya Güneş sisteminden fırlatıldı.' : d.tip === 'yakalandi' ? 'Dünya artık kara deliğin çevresinde dönüyor.' : 'Dünya kara deliğe düştü.';
    const kac = liste('kacti'), yak = liste('yakalandi').filter(x => x !== 'Dünya'), yut = liste('yutuldu').filter(x => x !== 'Dünya');
    const ek = [kac.filter(x => x !== 'Dünya').length ? `${kac.filter(x => x !== 'Dünya').join(', ')} sistemden fırlatıldı.` : '', yak.length ? `${yak.join(', ')} kara deliğe yakalandı.` : '', yut.length ? `${yut.join(', ')} yutuldu.` : ''].filter(Boolean).join(' ');
    const gunes = this.gunesYakalandi ? ' Ve Güneş artık kara deliğin çevresinde dönüyor; bir çift sistem oldular.' : '';
    void ctx.say(`Kara delik geçti efendim. ${dunya}${ek ? ' ' + ek : ' Diğer gezegenler yörüngelerinde kaldı.'}${gunes}`);
  }

  render(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const s = this.sim;
    if (!s) return;
    const { W, H } = ctx, v = this.view;
    v.cx = W * 0.42; v.cy = H * 0.52;
    v.K = Math.min(W * 0.4, H * 0.42 / v.basik) / Math.sqrt(32);
    // Kamera Güneş'i izler (kara delik Güneş'i sürüklese de sahne ekranda kalır); izler AU cinsinden saklanır
    this.origin.x += (s.x[0] - this.origin.x) * 0.08; this.origin.y += (s.y[0] - this.origin.y) * 0.08;
    const ekranAU = (x: number, y: number) => v.ekran(x - this.origin.x, y - this.origin.y);
    const ekran = (i: number) => ekranAU(s.x[i], s.y[i]);
    g.save();
    GEZEGENLER.forEach((_, k) => {
      const i = k + 1, tr = this.trails[k];
      if (!s.gone[i] && !this.durdu && !this.sonuc) { tr.push({ x: s.x[i], y: s.y[i] }); if (tr.length > 260) tr.shift(); }
      let prev: { X: number; Y: number } | null = null;
      for (let j = 0; j < tr.length; j++) {
        const q = ekranAU(tr[j].x, tr[j].y);
        if (prev) { g.strokeStyle = `rgba(150,215,255,${0.5 * (j / tr.length)})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(prev.X, prev.Y); g.lineTo(q.X, q.Y); g.stroke(); }
        prev = q;
      }
    });
    g.restore();
    // Güneş
    const qs = ekran(0);
    this.sun!.x = this.sun!.tx = qs.X; this.sun!.y = this.sun!.ty = qs.Y; this.sun!.r = this.sun!.tr = 14;
    ctx.renderer.draw(g, this.sun!, now, ctx.dpr);
    this.yazi(g, 'GÜNEŞ', qs.X, qs.Y + 18);
    // Gezegenler
    GEZEGENLER.forEach((gz, k) => {
      const i = k + 1;
      if (s.gone[i]) return;
      const q = ekran(i), b = this.bodies[k];
      b.x = b.tx = q.X; b.y = b.ty = q.Y; b.r = b.tr = govdePx(VERI[gz].yaricap, 6);
      const lx = qs.X - q.X, ly = q.Y - qs.Y, lz = 20, ln = Math.hypot(lx, ly, lz) || 1;
      b.light = [lx / ln, ly / ln, lz / ln];
      b.yaw += 0.01;
      ctx.renderer.draw(g, b, now, ctx.dpr);
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 4;
      g.fillStyle = 'rgba(223,245,255,0.85)'; g.font = '600 12px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(VERI[gz].ad.toLocaleUpperCase('tr'), q.X, q.Y + b.r + 3);
      g.restore();
    });
    // Kara delik
    if (this.bh && !this.sonuc) {
      const q = ekran(BH);
      this.bh.x = q.X; this.bh.y = q.Y;
      this.bh.render(g, now);
      this.yazi(g, `KARA DELİK · ${sayi(this.Mbh)} M☉`, q.X, q.Y + 40, 'rgba(255,190,140,0.95)');
    }
    this.hud(g, now, ctx);
  }

  private yazi(g: CanvasRenderingContext2D, t: string, x: number, y: number, renk = 'rgba(255,230,170,0.95)') {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 4;
    g.fillStyle = renk; g.font = '700 13px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(t, x, y);
    g.restore();
  }

  private hud(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const { W, H } = ctx;
    const x = W * 0.7, y = H * 0.14, w = Math.min(360, W * 0.27);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 6;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = CYAN; g.font = '700 40px Rajdhani, sans-serif';
    g.fillText(`+${sayi(this.yil, 1)} YIL`, W * 0.42, H * 0.06);
    g.restore();
    if (!this.sonuc) {
      g.save();
      mechPanel(g, x, y, w, 250, now - this.startAt, 'KARA DELİK', 'BH-01', 1, 2);
      const rows: [string, string][] = [
        ['KÜTLE', `${sayi(this.Mbh)} M☉`],
        ['HIZ', `${sayi(this.vKmS)} km/s`],
        ["GÜNEŞ'E EN YAKIN", Number.isFinite(this.enYakin) && this.enYakin < 50 ? `${sayi(this.enYakin, 2)} AU` : '—'],
        ["GÜNEŞ'İN SAVRULMASI", `${sayi(kmS(Math.hypot(this.sim!.vx[0], this.sim!.vy[0])), 2)} km/s`],
      ];
      g.textBaseline = 'top';
      rows.forEach(([k, v], i) => {
        const ry = y + 46 + i * 46;
        g.fillStyle = DIM; g.font = '600 13px Rajdhani, sans-serif'; g.textAlign = 'left'; g.fillText(k, x + 16, ry);
        g.fillStyle = TEXT; g.font = '700 21px Rajdhani, sans-serif'; g.textAlign = 'right'; g.fillText(v, x + w - 16, ry + 16);
      });
      g.restore();
      return;
    }
    // Sonuç tablosu
    const age = now - this.sonucAt;
    const h = 60 + GEZEGENLER.length * 34;
    g.save();
    mechPanel(g, x, y, w, h, age, 'SONUÇ', 'BH-02', 2, 2);
    g.textBaseline = 'middle';
    this.sonuc.forEach((r, k) => {
      const p = (age - 300 - k * 140) / 300;
      if (p <= 0) return;
      const ry = y + 52 + k * 34;
      const [metin, renk] = r.tip === 'yorunge' ? [Math.abs(r.e - r.e0) < 0.01 ? 'yörüngede' : `e ${sayi(r.e0, 2)} → ${sayi(r.e, 2)}`, Math.abs(r.e - r.e0) < 0.05 ? 'rgb(120,255,170)' : 'rgb(255,210,120)']
        : r.tip === 'kacti' ? ['fırlatıldı', 'rgb(255,120,120)'] : r.tip === 'yakalandi' ? ['kara deliğe yakalandı', 'rgb(200,150,255)'] : ['yutuldu', 'rgb(255,90,90)'];
      g.fillStyle = TEXT; g.font = '700 17px Rajdhani, sans-serif'; g.textAlign = 'left';
      g.fillText(VERI[GEZEGENLER[k]].ad, x + 16, ry);
      g.fillStyle = renk; g.font = '700 16px Rajdhani, sans-serif'; g.textAlign = 'right';
      g.fillText(decode(metin, p, k), x + w - 16, ry);
    });
    stamp(g, this.gunesYakalandi ? 'GÜNEŞ YAKALANDI' : 'GEÇİŞ TAMAMLANDI', W * 0.42, H * 0.86, (age - 400) / 300, this.gunesYakalandi ? 'rgb(255,170,110)' : CYAN, 22);
    g.restore();
  }

  durum() {
    return { numara: 'Gezgin kara delik', gunes_kara_delige_baglandi: this.gunesYakalandi, kutle_M_gunes: this.Mbh, hiz_km_s: this.vKmS, gecis_AU: this.b, gecen_yil: +this.yil.toFixed(1), sonuc: this.sonuc?.map((r, k) => `${VERI[GEZEGENLER[k]].ad}: ${r.tip}`) ?? null };
  }
}
