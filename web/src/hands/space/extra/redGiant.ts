// Ekstra · Güneş'in son günleri. Yaklaşık 30 saniyelik zaman tüneli: bugün → okyanusların buharlaşması → çekirdekte
// hidrojenin bitmesi → kızıl dev (Merkür, Venüs ve Dünya yutulur) → helyum parlaması → asimptotik dev kolu →
// gezegenimsi bulutsu → beyaz cüce. Uzaklıklar doğrusal ölçekte (Güneş'in büyüklüğü yörüngelerle kıyaslanabilsin).
//
// Kaynaklar (≈ değerler):
//  Schröder ve Smith 2008, MNRAS 386:155: kızıl dev kolunun ucu ≈7,59 milyar yıl sonra; yarıçap ≈256 R☉ (≈1,2 AU),
//    parlaklık ≈2.730 L☉, kütle ≈0,668 M☉. Kütle kaybıyla yörüngeler genişler (a ∝ 1/M), ama gelgit sürtünmesi
//    Dünya'yı içeri çeker: Dünya büyük olasılıkla yutulur, Mars kurtulur.
//  Sackmann, Boothroyd ve Kraemer 1993, ApJ 418:457: ≈1,1 milyar yıl sonra Güneş ≈%10 daha parlak, ≈3,5 milyar yıl sonra
//    ≈%40 (okyanuslar buharlaşır). Çekirdekte hidrojen ≈5 milyar yıl sonra biter.
//  Gesicki ve ark. 2018, Nature Astronomy 2:580: Güneş kütlesindeki yıldızlar da (sönük) gezegenimsi bulutsu oluşturur.
//  Beyaz cüce kütlesi ≈0,54 M☉, yarıçapı ≈Dünya kadar (≈0,012 R☉).
import type { HoldState } from '../../fx';
import type { TrackedHand } from '../../gestures';
import type { SpaceCmd } from '../commands';
import { CYAN, DIM, TEXT } from '../labHud';
import { decode, mechPanel, stamp } from '../mech';
import { Body, durumRenk } from '../planets';
import { sayi } from '../sentences';
import type { ExtraCtx, ExtraNumara } from './types';

const TAU = Math.PI * 2;
const RSUN_AU = 0.00465;

/** Gerçek saniye → milyar yıl (olaylar yavaş, aralar hızlı) */
const ZAMAN: [number, number][] = [[0, 0], [3, 0], [7, 1.1], [10, 3.5], [13, 5.0], [16, 7.0], [22, 7.59], [24.5, 7.6], [27, 7.68], [30, 7.75], [31.5, 7.756], [40, 7.76]];
/** Yarıçap (R☉), logaritmik ara değer */
const YARICAP: [number, number][] = [[0, 1], [1.1, 1.05], [3.5, 1.2], [5.0, 1.6], [6.0, 2.3], [7.0, 10], [7.4, 60], [7.59, 256], [7.6, 10], [7.68, 10], [7.75, 149], [7.754, 149], [7.756, 0.012], [8, 0.012]];
/** Parlaklık (L☉) */
const PARLAKLIK: [number, number][] = [[0, 1], [1.1, 1.1], [3.5, 1.4], [5.0, 1.8], [7.0, 30], [7.59, 2730], [7.6, 40], [7.68, 40], [7.75, 3000], [7.754, 3000], [7.756, 0.1], [8, 0.1]];
/** Kütle (M☉), doğrusal */
const KUTLE: [number, number][] = [[0, 1], [7.0, 0.99], [7.59, 0.668], [7.75, 0.54], [8, 0.54]];

function ara(tab: [number, number][], x: number, log = false): number {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) {
      const [x0, y0] = tab[i - 1], [x1, y1] = tab[i], k = (x - x0) / (x1 - x0 || 1);
      return log ? Math.exp(Math.log(y0) + (Math.log(y1) - Math.log(y0)) * k) : y0 + (y1 - y0) * k;
    }
  }
  return tab[tab.length - 1][1];
}

/** Sıcaklıktan yaklaşık renk çarpanı (Güneş'in bugünkü rengine göre) */
function tint(T: number): number[] {
  if (T < 3600) return [1.05, 0.55, 0.35];
  if (T < 4800) return [1.05, 0.75, 0.55];
  if (T < 6500) return [1, 1, 1];
  if (T < 12000) return [0.95, 1.05, 1.25];
  return [0.85, 1.0, 1.45];
}

const EVRE = (gyr: number, R: number) =>
  gyr < 5 ? 'ANA KOL' : gyr < 7.0 ? 'ALT DEV' : gyr < 7.595 ? 'KIZIL DEV' : gyr < 7.62 ? 'HELYUM PARLAMASI' : gyr < 7.69 ? 'YATAY KOL' : gyr < 7.755 ? 'ASİMPTOTİK DEV KOLU' : R < 0.1 ? 'BEYAZ CÜCE + GEZEGENİMSİ BULUTSU' : 'GEZEGENİMSİ BULUTSU';

interface Gez { ad: string; a0: number; km: number; body: Body; yutuldu: number | null; dunya: boolean }

/** Zaman tünelindeki anlatım: [milyar yıl, cümle] */
const SOZ: [number, string][] = [
  [0, "Güneş'in geleceğine gidiyoruz efendim. Zamanı milyar yıllarla ileri sarıyorum."],
  [1.1, "Bir milyar yıl sonra Güneş yaklaşık yüzde on daha parlak; Dünya'nın okyanusları buharlaşmaya başlıyor."],
  [3.5, "Üç buçuk milyar yıl sonra Dünya, bugünkü Venüs'e benziyor."],
  [5.0, 'Beş milyar yıl sonra çekirdekteki hidrojen bitiyor; Güneş şişmeye başlıyor.'],
  [7.6, 'Helyum parlaması: çekirdek tutuşuyor, Güneş birden küçülüyor.'],
  [7.75, 'Dış katmanlar uzaya savruluyor; geriye gezegenimsi bir bulutsu kalıyor.'],
  [7.757, 'Ortada Dünya büyüklüğünde bir beyaz cüce. Mars hâlâ yörüngede, ama artık buz gibi.'],
];

export class RedGiant implements ExtraNumara {
  ad = "GÜNEŞ'İN SON GÜNLERİ";
  ipucu = '✊ 1 sn: durdur / devam   ·   "Jarvis, durdur / devam et / sıfırla"';
  private startAt = 0;
  private t = 0;
  private durdu = false;
  private fistAt = -1;
  private sun: Body | null = null;
  private gez: Gez[] = [];
  private soylendi = new Set<number>();
  private pnAt: number | null = null;

  start(now: number, ctx: ExtraCtx) {
    this.startAt = now; this.t = 0; this.durdu = false; this.soylendi.clear(); this.pnAt = null;
    this.sun = new Body('gunes', 0, 0, 20, now);
    this.sun.form = 1;
    const mk = (g: 'merkur' | 'venus' | 'dunya' | 'mars', ad: string, a0: number, km: number): Gez => {
      const b = new Body(g, 0, 0, 8, now); b.form = 1;
      if (g === 'dunya') b.ownColors = true;
      if (g === 'dunya') b.colors = durumRenk('dunya', 'su');
      return { ad, a0, km, body: b, yutuldu: null, dunya: g === 'dunya' };
    };
    this.gez = [mk('merkur', 'Merkür', 0.387, 2440), mk('venus', 'Venüs', 0.723, 6052), mk('dunya', 'Dünya', 1.0, 6371), mk('mars', 'Mars', 1.524, 3390)];
    void ctx;
  }

  command(cmd: SpaceCmd, now: number, ctx: ExtraCtx) {
    if (cmd.tip === 'sifirla' || cmd.tip === 'temizle') { this.start(now, ctx); return; }
    if (cmd.tip === 'zaman') {
      if (cmd.islem === 'durdur') this.durdu = true;
      else if (cmd.islem === 'devam' || cmd.islem === 'hizlandir') this.durdu = false;
      return ctx.say(this.durdu ? 'Zaman durdu efendim.' : 'Devam ediyoruz efendim.');
    }
  }

  update(hands: TrackedHand[], now: number, dt: number, ctx: ExtraCtx, holds: HoldState[]) {
    const f = hands.find(x => x.gesture === 'yumruk');
    if (f) {
      const pr = (now - f.since - 150) / 1000;
      if (pr > 0 && this.fistAt !== f.since) {
        if (pr >= 1) { this.fistAt = f.since; this.durdu = !this.durdu; ctx.sfx.confirm(); }
        else holds.push({ x: f.shape.palm.x, y: f.shape.palm.y, r: f.shape.size * 1.1, p: pr, label: this.durdu ? '▶ ZAMAN' : '⏸ ZAMAN', done: 0 });
      }
    }
    if (!this.durdu) this.t += dt;
    const gyr = this.gyr();
    // Anlatım
    for (const [g0, s] of SOZ) if (gyr >= g0 && !this.soylendi.has(g0)) { this.soylendi.add(g0); void ctx.say(s); if (g0 === 7.6) ctx.sfx.boom(); }
    // Yutulma: Güneş'in yarıçapı yörüngeyi geçince. Dünya: yörüngesi genişlese de gelgit sürtünmesi onu içeri çeker
    const Rau = ara(YARICAP, gyr, true) * RSUN_AU, M = ara(KUTLE, gyr);
    for (const p of this.gez) {
      if (p.yutuldu !== null) continue;
      const a = p.a0 / M;
      const yut = p.dunya ? gyr >= 7.575 : Rau > a * 0.97;
      if (yut) {
        p.yutuldu = now;
        ctx.sfx.collision();
        void ctx.say(p.dunya ? "Ve Dünya. Güneş bugünkü boyunun 256 katına ulaşıyor; gelgit sürtünmesi Dünya'yı içeri çekiyor." : `${p.ad} yutuldu efendim.`);
      }
    }
    // Dünya'nın yüzeyi: okyanuslar kaynar, sonra kızgın kaya
    const dun = this.gez.find(p => p.dunya);
    if (dun) dun.body.colors = durumRenk('dunya', gyr < 1.1 ? 'su' : gyr < 3.5 ? 'kaynayan' : 'kizgin');
    if (dun) dun.body.heat = gyr > 3.5 ? 0.6 : 0;
    if (gyr >= 7.754 && this.pnAt === null) { this.pnAt = now; ctx.sfx.solar(); }
  }

  private gyr() { return ara(ZAMAN, this.t); }

  render(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const sun = this.sun;
    if (!sun) return;
    const { W, H } = ctx;
    const gyr = this.gyr();
    const Rsun = ara(YARICAP, gyr, true), L = ara(PARLAKLIK, gyr, true), M = ara(KUTLE, gyr);
    const T = 5772 * Math.pow(L, 0.25) / Math.sqrt(Rsun);
    const cx = W * 0.44, cy = H * 0.52;
    const K = Math.min(W * 0.36, H * 0.4) / 2.9; // px / AU (doğrusal)
    // Yörüngeler
    g.save();
    for (const p of this.gez) {
      const a = (p.a0 / M) * K;
      g.strokeStyle = p.yutuldu !== null ? 'rgba(255,120,90,0.18)' : 'rgba(170,215,255,0.45)';
      g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(cx, cy, a, a * 0.42, 0, 0, TAU); g.stroke();
    }
    g.restore();
    // Gezegenimsi bulutsu
    if (this.pnAt !== null) this.bulutsu(g, now, cx, cy, K);
    // Güneş (beyaz cüceyse küçük ve mavi-beyaz)
    const rpx = Math.max(Rsun < 0.1 ? 5 : 16, Rsun * RSUN_AU * K);
    sun.tint = tint(T);
    sun.x = sun.tx = cx; sun.y = sun.ty = cy; sun.r = sun.tr = rpx;
    sun.yaw += 0.002;
    // Kızıl devde dışarı taşan, kaynayan kabuk
    if (Rsun > 30) {
      const gr = g.createRadialGradient(cx, cy, rpx * 0.85, cx, cy, rpx * 1.5);
      gr.addColorStop(0, 'rgba(255,90,40,0.55)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rpx * 1.5, 0, TAU); g.fill();
    }
    // Gezegenler: arkadakiler Güneş'ten önce
    const yer = this.gez.map((p, i) => {
      const a = (p.a0 / M) * K, ang = now / 1000 * (0.9 / Math.pow(p.a0, 1.5)) + i * 1.7;
      return { p, x: cx + Math.cos(ang) * a, y: cy + Math.sin(ang) * a * 0.42, arka: Math.sin(ang) < 0 };
    });
    for (const q of yer) if (q.arka) this.gezegen(g, q.p, q.x, q.y, now, ctx);
    ctx.renderer.draw(g, sun, now, ctx.dpr);
    for (const q of yer) if (!q.arka) this.gezegen(g, q.p, q.x, q.y, now, ctx);
    // Göstergeler
    this.hud(g, now, ctx, gyr, Rsun, L, M, T);
  }

  private gezegen(g: CanvasRenderingContext2D, p: Gez, x: number, y: number, now: number, ctx: ExtraCtx) {
    const b = p.body;
    let r = 6 + Math.sqrt(p.km / 6371) * 6;
    if (p.yutuldu !== null) {
      const k = (now - p.yutuldu) / 1200;
      if (k >= 1) return;
      b.heat = 1; r *= 1 - k;
      g.save(); g.globalAlpha = 1 - k; g.fillStyle = 'rgba(255,220,150,0.9)'; g.beginPath(); g.arc(x, y, r * 2.5 * k + 2, 0, TAU); g.fill(); g.restore();
    }
    b.x = b.tx = x; b.y = b.ty = y; b.r = b.tr = Math.max(1, r);
    // Işık Güneş'ten (gövde çizicisinde y yukarı)
    const lx = this.sun!.x - x, ly = y - this.sun!.y, lz = 30, ln = Math.hypot(lx, ly, lz) || 1;
    b.light = [lx / ln, ly / ln, lz / ln];
    ctx.renderer.draw(g, b, now, ctx.dpr);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 4;
    g.fillStyle = 'rgba(223,245,255,0.9)'; g.font = '600 13px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(p.ad.toLocaleUpperCase('tr'), x, y + r + 4);
    g.restore();
  }

  /** Gezegenimsi bulutsu: içte turkuaz (oksijen), dışta kızıl (hidrojen-azot) genişleyen kabuklar */
  private bulutsu(g: CanvasRenderingContext2D, now: number, cx: number, cy: number, K: number) {
    const t = (now - this.pnAt!) / 1000;
    const R = (1.2 + t * 0.35) * K;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const katman: [number, string, number][] = [[0.75, '60,220,200', 0.28], [1.0, '255,80,90', 0.22], [1.15, '255,140,120', 0.12]];
    for (const [k, c, a] of katman) {
      const rr = R * k;
      const gr = g.createRadialGradient(cx, cy, rr * 0.6, cx, cy, rr);
      gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.75, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.8, 0.3, 0, TAU); g.fill();
    }
    // İplikçikler
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996, rr = R * (0.7 + 0.35 * Math.abs(Math.sin(i * 7.1)));
      g.strokeStyle = `rgba(${i % 2 ? '255,110,120' : '90,230,210'},0.18)`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * rr * 0.6, cy + Math.sin(a) * rr * 0.5); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8); g.stroke();
    }
    g.restore();
  }

  private hud(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx, gyr: number, R: number, L: number, M: number, T: number) {
    const { W, H } = ctx;
    const x = W * 0.68, y = H * 0.14, w = Math.min(360, W * 0.28), h = 330;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 6;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = CYAN; g.font = '700 46px Rajdhani, sans-serif';
    g.fillText(gyr < 0.001 ? 'BUGÜN' : `+${sayi(gyr, gyr < 1 ? 2 : 2)} MİLYAR YIL`, W * 0.44, H * 0.06);
    g.fillStyle = TEXT; g.font = '700 18px Rajdhani, sans-serif';
    g.fillText(decode(EVRE(gyr, R), 1, 1), W * 0.44, H * 0.06 + 52);
    g.restore();
    g.save();
    mechPanel(g, x, y, w, h, now - this.startAt, 'GÜNEŞ', 'STAR-01', Math.min(4, Math.floor(gyr / 2)), 4);
    const rows: [string, string][] = [
      ['YARIÇAP', R < 0.1 ? `${sayi(R * 109, 1)} Dünya` : `${sayi(R, R < 10 ? 2 : 0)} R☉${R > 30 ? ` · ${sayi(R * RSUN_AU, 2)} AU` : ''}`],
      ['PARLAKLIK', `${sayi(L, L < 10 ? 2 : 0)} × bugün`],
      ['KÜTLE', `${sayi(M, 3)} M☉`],
      ['YÜZEY SICAKLIĞI', `≈ ${sayi(Math.round(T / 100) * 100)} K`],
      ['YUTULAN', this.gez.filter(p => p.yutuldu !== null).map(p => p.ad).join(', ') || '—'],
    ];
    g.textBaseline = 'top';
    rows.forEach(([k, v], i) => {
      const ry = y + 46 + i * 46;
      g.fillStyle = DIM; g.font = '600 13px Rajdhani, sans-serif'; g.textAlign = 'left'; g.fillText(k, x + 16, ry);
      g.fillStyle = TEXT; g.font = '700 21px Rajdhani, sans-serif'; g.textAlign = 'right'; g.fillText(v, x + w - 16, ry + 16);
    });
    g.fillStyle = DIM; g.font = '500 11px Rajdhani, sans-serif'; g.textAlign = 'center';
    g.fillText('Schröder & Smith 2008 · Sackmann 1993 · ≈ değerler', x + w / 2, y + h - 18);
    if (R < 0.1 && this.pnAt !== null) stamp(g, 'BEYAZ CÜCE', W * 0.44, H * 0.86, (now - this.pnAt - 1500) / 300, 'rgb(190,215,255)', 24);
    g.restore();
  }

  durum() { const gyr = this.gyr(); return { numara: "Güneş'in son günleri", milyar_yil_sonra: +gyr.toFixed(2), evre: EVRE(gyr, ara(YARICAP, gyr, true)), yutulanlar: this.gez.filter(p => p.yutuldu !== null).map(p => p.ad) }; }
}
