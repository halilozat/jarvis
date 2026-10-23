// Ekstra · Ay yerine kara delik. Ay, aynı kütlede bir kara deliğe sıkışır (olay ufkunun çapı 0,22 mm) ve aynı
// yörüngede dönmeye devam eder: yörünge ve gelgit kütleye bağlı olduğu için neredeyse hiçbir şey değişmez, yalnızca
// Ay ışığı ve tutulmalar biter. Sonra kara delik büyütülür: Ay → Dünya → Jüpiter → Güneş → Sagittarius A*. Her
// kütlede ufkun boyu, gelgit, bir ayın süresi, ortak kütle merkezi, Hawking sıcaklığı ve Einstein halkası hesaptan
// (moonHolePhysics.ts). Gelgit Dünya'nın kendi çekimini aşınca (≈0,33 M☉) Dünya parçalanır, enkaz diske dönüşür;
// ufuk Ay'ın yörüngesinden büyüyünce (≈130.000 M☉) Dünya'nın yeri ufkun içinde kalır.
// Ölçek: uzaklık ve boyutlar ekranda sıkıştırılmıştır; ufkun gerçek boyu etikette yazar.
import type { HoldState } from '../../fx';
import type { TrackedHand } from '../../gestures';
import { BlackHole } from '../blackhole';
import type { SpaceCmd } from '../commands';
import { CYAN, DIM, TEXT } from '../labHud';
import { decode, easeOut, mechPanel, stamp } from '../mech';
import { Body, projectPoints } from '../planets';
import { sayi } from '../sentences';
import type { Lens } from '../starfield';
import * as F from './moonHolePhysics';
import type { ExtraCtx, ExtraNumara } from './types';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const LOG_MIN = Math.log10(F.M_AY), LOG_MAX = Math.log10(F.M_SGRA);
/** Yörünge düzleminin görüş basıklığı */
const TILT = 0.36;
/** Açılış: Ay sıkışıp kara deliğe dönüşür */
const INTRO = 2000;
/** Çimdikle sürüklerken bir onluk (×10 kütle) ekranın bu kadarı */
const ONLUK = 0.07;
/** Dünya'nın parçalanma animasyonu (ms) */
const PARCALAN = 1600;
const KIRMIZI = 'rgb(255,110,110)', MOR = 'rgb(200,150,255)';

const gunMetni = (g: number) => (g >= 1 ? `${sayi(g, g < 100 ? 1 : 0)} gün` : g * 24 >= 1 ? `${sayi(g * 24, 1)} saat` : `${sayi(g * 1440, 1)} dakika`);
const UST = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** 6,2×10⁻⁸ */
function bilimsel(v: number): string {
  const e = Math.floor(Math.log10(v)), m = v / 10 ** e;
  return `${sayi(m, 1)}×10${e < 0 ? '⁻' : ''}${String(Math.abs(e)).split('').map(c => UST[+c]).join('')}`;
}
const aciMetni = (sn: number) => (sn < 60 ? `${sayi(sn, sn < 1 ? 2 : 1)}″` : sn < 3600 ? `${sayi(sn / 60, 1)}′` : `${sayi(sn / 3600, 1)}°`);

export class MoonHole implements ExtraNumara {
  ad = 'AY YERİNE KARA DELİK';
  ipucu = '🤏 çimdikle yukarı / aşağı: kütle   ·   "Jarvis, kara deliği büyüt / küçült"   ·   "Jüpiter kütlesine büyüt"   ·   ✊ durdur   ·   "sıfırla"';
  private startAt = 0;
  private earth: Body | null = null;
  private moon: Body | null = null;
  private bh: BlackHole | null = null;
  /** Kütle (log10 kg): görünen ve hedef; değişim log ölçekte yumuşak */
  private logM = LOG_MIN;
  private ramp: { from: number; to: number; at: number; dur: number } | null = null;
  private bitince: (() => void) | null = null;
  private theta = -0.6;
  private durdu = false;
  private fistAt = -1;
  private drag: { id: string; y0: number; log0: number } | null = null;
  /** Dünya parçalanmaya başladı / bitti */
  private parcalanAt: number | null = null;
  private dunyaYok = false;
  private ufukAt: number | null = null;
  /** Son anlatımdan beri olanlar (anlatıma eklenir) */
  private yeniParcalandi = false;
  private yeniUfuk = false;
  private durumAt = 0;
  private rsPx = 4;

  start(now: number, ctx: ExtraCtx) {
    this.startAt = now; this.durumAt = now;
    this.logM = LOG_MIN; this.ramp = null; this.drag = null; this.durdu = false; this.theta = -0.6;
    this.parcalanAt = null; this.dunyaYok = false; this.ufukAt = null; this.yeniParcalandi = this.yeniUfuk = false;
    this.bitince?.(); this.bitince = null;
    this.earth = new Body('dunya', 0, 0, 60, now); this.earth.form = 1; this.earth.light = [-0.75, 0.3, 0.6];
    this.moon = new Body('ay', 0, 0, 16, now); this.moon.form = 1; this.moon.light = [-0.75, 0.3, 0.6]; this.moon.ambient = ctx.oda ? 0.35 : 0.12;
    this.earth.ambient = ctx.oda ? 0.35 : 0.12;
    this.bh = null;
    const cap = F.uzunlukSoz(2 * F.rs(F.M_AY));
    void ctx.say(`Ay'ı aynı kütlede bir kara deliğe çeviriyorum efendim. Bunun için onu ${cap}ye, bir kum tanesinden küçük bir noktaya sıkıştırmak gerekirdi. Şaşırtıcı olan şu: neredeyse hiçbir şey değişmiyor. Yörünge aynı, gelgitler aynı; çünkü ikisi de yalnızca kütleye bakar. Değişen tek şey geceler: Ay ışığı yok, tutulma yok.`);
  }

  stop(ctx: ExtraCtx) { ctx.sfx.blackHole(false); this.bitince?.(); this.bitince = null; }

  lens(now: number): Lens | null { return this.bh && !this.ufukAt ? this.bh.lens(now) : null; }

  private get M() { return 10 ** this.logM; }

  command(cmd: SpaceCmd, now: number, ctx: ExtraCtx): Promise<void> | void {
    if (cmd.tip === 'sifirla' || cmd.tip === 'temizle') { ctx.sfx.blackHole(false); this.start(now, ctx); return; }
    if (cmd.tip === 'zaman') { this.durdu = cmd.islem === 'durdur'; return; }
    if (cmd.tip !== 'ekstra' || !cmd.kutle) return;
    const k = cmd.kutle, L = this.ramp?.to ?? this.logM;
    let hedef: number | null;
    if (cmd.kat) hedef = L + (k === 'kucult' ? -1 : 1) * Math.log10(cmd.kat);
    else if (k === 'buyut') hedef = F.BASAMAK.map(b => Math.log10(b.M)).find(x => x > L + 0.02) ?? null;
    else if (k === 'kucult') hedef = [...F.BASAMAK].reverse().map(b => Math.log10(b.M)).find(x => x < L - 0.02) ?? null;
    else hedef = Math.log10(F.BASAMAK.find(b => b.ad === k)!.M);
    if (hedef === null) return ctx.say(k === 'buyut' ? "Bu zaten Samanyolu'nun merkezindeki kara delik kadar efendim; daha büyüğü bu ekrana sığmaz." : 'Zaten Ay kütlesindeyiz efendim; Ay\'ın yerini tutması için bundan küçülemez.');
    hedef = clamp(hedef, LOG_MIN, LOG_MAX);
    if (Math.abs(hedef - this.logM) < 0.01) return ctx.say(`Kara delik zaten ${F.kutleSoz(this.M)} efendim.`);
    const d = Math.abs(hedef - this.logM);
    this.ramp = { from: this.logM, to: hedef, at: now, dur: Math.min(4000, 1200 + 350 * d) };
    ctx.sfx.servo(); ctx.sfx.warp();
    this.bitince?.();
    return new Promise<void>(res => { this.bitince = res; });
  }

  update(hands: TrackedHand[], now: number, dt: number, ctx: ExtraCtx, holds: HoldState[]) {
    // ✊ 1 sn: yörünge durur / devam eder
    const f = hands.find(x => x.gesture === 'yumruk');
    if (f) {
      const pr = (now - f.since - 150) / 1000;
      if (pr > 0 && this.fistAt !== f.since) {
        if (pr >= 1) { this.fistAt = f.since; this.durdu = !this.durdu; ctx.sfx.confirm(); }
        else holds.push({ x: f.shape.palm.x, y: f.shape.palm.y, r: f.shape.size * 1.1, p: pr, label: this.durdu ? '▶ YÖRÜNGE' : '⏸ YÖRÜNGE', done: 0 });
      }
    }
    const intro = now - this.startAt < INTRO;
    // Açılışın sonunda Ay çöker: parlama, kara delik doğar
    if (!intro && !this.bh) {
      this.bh = new BlackHole(0, 0, 4, now, null);
      this.bh.diskAlpha = 0;
      ctx.sfx.boom(); ctx.sfx.blackHole(true);
      ctx.fx.shake = 0.5;
    }
    // 🤏 sürükle: yukarı büyür, aşağı küçülür (log ölçek)
    const p = hands.find(h => h.gesture === 'cimdik');
    if (!intro) {
      if (p && !this.drag) { this.drag = { id: p.id, y0: p.shape.pinchPt.y, log0: this.logM }; this.ramp = null; ctx.sfx.grab(); }
      if (this.drag) {
        const h = hands.find(x => x.id === this.drag!.id);
        if (h && h.gesture === 'cimdik') {
          const L = clamp(this.drag.log0 + (this.drag.y0 - h.shape.pinchPt.y) / (ctx.H * ONLUK), LOG_MIN, LOG_MAX);
          if (Math.floor(L) !== Math.floor(this.logM)) ctx.sfx.tick(clamp((L - LOG_MIN) / (LOG_MAX - LOG_MIN), 0, 1));
          this.logM = L;
        } else {
          const degisti = Math.abs(this.logM - this.drag.log0) > 0.15;
          this.drag = null;
          if (degisti) void ctx.say(this.anlatim());
        }
      }
    }
    // Sesli büyütme: log ölçekte yumuşak geçiş
    if (this.ramp) {
      const k = clamp((now - this.ramp.at) / this.ramp.dur, 0, 1), e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      const L = this.ramp.from + (this.ramp.to - this.ramp.from) * e;
      if (Math.floor(L) !== Math.floor(this.logM)) ctx.sfx.tick(clamp((L - LOG_MIN) / (LOG_MAX - LOG_MIN), 0, 1));
      this.logM = L;
      if (k >= 1) {
        this.ramp = null;
        const bit = this.bitince; this.bitince = null;
        Promise.resolve(ctx.say(this.anlatim())).then(() => bit?.());
      }
    }
    const M = this.M;
    // Eşikler
    if (!this.parcalanAt && F.parcalanir(M)) { this.parcalanAt = now; this.yeniParcalandi = true; this.durumAt = now; ctx.sfx.collision(); ctx.fx.shake = 1; }
    if (this.parcalanAt && !this.dunyaYok && now - this.parcalanAt > PARCALAN) this.dunyaDagil(now, ctx);
    if (!this.ufukAt && F.ufukIcinde(M)) { this.ufukAt = now; this.yeniUfuk = true; this.durumAt = now; ctx.sfx.boom(); }
    if (this.ufukAt && !F.ufukIcinde(M)) this.ufukAt = null;
    // Yörünge: ekrandaki dönem gerçek döneme göre kısalır (Ay kütlesinde 20 sn)
    const P = F.donemGun(M) / F.donemGun(F.M_AY);
    if (!this.durdu) this.theta += (TAU / clamp(20 * P ** 0.35, 1.4, 20)) * dt;
    if (this.earth) this.earth.yaw += dt * 0.25;
    if (this.bh) {
      this.bh.update(dt);
      const hedefDisk = this.dunyaYok && !this.ufukAt ? 1 : 0;
      this.bh.diskAlpha += (hedefDisk - this.bh.diskAlpha) * Math.min(1, dt * 1.2);
    }
  }

  /** Gelgit Dünya'yı parçaladı: noktaları kara deliğe akar */
  private dunyaDagil(now: number, ctx: ExtraCtx) {
    this.dunyaYok = true;
    const e = this.earth!;
    if (this.bh) this.bh.feed(projectPoints(e, 2));
    ctx.fx.colorBurst(projectPoints(e, 6), e.x, e.y, 260, 3);
    ctx.sfx.boom();
    void now;
  }

  /** Kütleye göre anlatım: basamaklarda özel cümle, aradaki kütlelerde özet */
  private anlatim(): string {
    const M = this.M, L = this.logM;
    const cap = F.uzunlukSoz(2 * F.rs(M)), kat = F.yuvarla(F.gelgitKat(M));
    const gun = gunMetni(F.AY_GUN * (F.donemGun(M) / F.donemGun(F.M_AY)));
    const b = F.BASAMAK.find(x => Math.abs(Math.log10(x.M) - L) < 0.02)?.ad;
    const parca = this.yeniParcalandi, ufuk = this.yeniUfuk;
    this.yeniParcalandi = this.yeniUfuk = false;
    const yokSoz = this.dunyaYok && !parca ? " Dünya'nın enkazı ise diskte dönmeye devam ediyor; parçalar geri birleşmez, baştan başlamak için \"sıfırla\" deyin." : '';
    let s: string;
    if (b === 'ay') s = this.dunyaYok ? `Kara delik yeniden Ay kütlesinde efendim, ufkun çapı ${cap}.${yokSoz}` : `Ay kütlesine döndük efendim. Ufkun çapı ${cap}; yörünge ve gelgit bugünkü gibi.`;
    else if (b === 'dunya') s = `Dünya kütlesi efendim. Olay ufkunun çapı ${cap}, bir misket kadar. Ama gelgit ${kat} kat güçlü: okyanuslar günde iki kez yaklaşık ${sayi(F.gelgitM(M))} metre kabarır. Ortak kütle merkezi artık Dünya'nın dışında; ikisi aradaki bir noktanın çevresinde dans ediyor. Bir ay ${gun} sürüyor.${yokSoz}`;
    else if (b === 'jupiter') s = `Jüpiter kütlesi. Ufkun çapı ${cap}, bir oda kadar. Gelgit ${kat} kat: kaba bir hesapla ${sayi(F.gelgitM(M) / 1000)} kilometrelik bir kabarma. Okyanuslar kıtaları siler, kayalar bile esneyip ısınır. Artık Dünya kara deliğin çevresinde ${gun}de bir dönüyor.${yokSoz}`;
    else if (b === 'gunes') s = parca ? `Güneş kütlesi efendim. Ufkun çapı yalnızca ${cap}. Ama Dünya Roche sınırının içinde kaldı: gelgit, Dünya'nın kendi çekiminin ${sayi(F.gelgitOran(M), 1)} katı. Dünya parçalandı; enkazı kara deliğin çevresinde ışıldayan bir diske dönüşüyor.` : `Güneş kütlesi. Ufkun çapı ${cap}.${yokSoz}`;
    else if (b === 'sgra') s = `Sagittarius A*, Samanyolu'nun merkezindeki kara delik: ${sayi(F.M_SGRA / F.M_GUNES / 1e6, 1)} milyon Güneş kütlesi. Olay ufkunun yarıçapı ${F.yuvarla(F.rs(M) / 1000)} kilometre, Ay'ın yörüngesinin ${sayi(F.rs(M) / F.D)} katı.${parca ? " Dünya yolda gelgitle parçalandı ve" : " Dünya'nın"} bulunduğu yer artık ufkun içinde; oradan bize hiçbir ışık ulaşamaz.`;
    else {
      s = `${F.kutleSoz(M)} efendim. Olay ufkunun çapı ${cap}, gelgit Ay'ınkinin ${kat} katı.`;
      if (!this.dunyaYok) s += ` Bir ay ${gun} sürüyor.`;
      if (parca) s += " Gelgit Dünya'nın kendi çekimini yendi; Dünya parçalandı.";
      if (ufuk) s += " Dünya'nın yeri artık olay ufkunun içinde.";
      else s += yokSoz;
    }
    return s;
  }

  // ——— Çizim ———

  private yerler(ctx: ExtraCtx) {
    const { W, H } = ctx, M = this.M;
    const R = Math.min(W * 0.3, H * 0.62);
    const C = { x: W * 0.44, y: H * 0.55 };
    const f = this.dunyaYok ? 1 : F.agirlikMerkezi(M) / F.D;
    const ux = Math.cos(this.theta), uy = Math.sin(this.theta);
    return {
      R, C, f, uy,
      earth: { x: C.x - f * R * ux, y: C.y - f * R * uy * TILT },
      bh: { x: C.x + (1 - f) * R * ux, y: C.y + (1 - f) * R * uy * TILT },
      Re: Math.min(W, H) * 0.085,
    };
  }

  render(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const E = this.earth, Mo = this.moon;
    if (!E || !Mo) return;
    const y = this.yerler(ctx), M = this.M, age = now - this.startAt;
    const on = easeOut(age / 900);
    // Kara deliğin ekrandaki boyu: log ölçek; ufuk yörüngeye yaklaşınca gerçek orana geçer
    const logK = Math.log10(M / F.M_AY);
    this.rsPx = Math.min(y.R * 1.55, Math.max(4 + 3.6 * logK, y.R * (F.rs(M) / F.D)));

    this.yorungeler(g, y, on);
    // Arkada kalan önce: yörüngenin üst yarısı uzak taraf
    const bhArkada = y.uy < 0;
    if (bhArkada) { this.kdCiz(g, now, ctx, y); this.dunyaCiz(g, now, ctx, y); }
    else { this.dunyaCiz(g, now, ctx, y); this.kdCiz(g, now, ctx, y); }
    this.merdiven(g, now, ctx);
    this.panel(g, now, ctx);
    this.damga(g, now, ctx);
  }

  private yorungeler(g: CanvasRenderingContext2D, y: ReturnType<MoonHole['yerler']>, on: number) {
    if (this.ufukAt) return;
    g.save();
    g.globalAlpha = on;
    g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 3;
    const rb = (1 - y.f) * y.R, re = y.f * y.R;
    g.setLineDash([6, 8]); g.lineWidth = 1.4; g.strokeStyle = 'rgba(150,215,255,0.55)';
    if (rb > 4) { g.beginPath(); g.ellipse(y.C.x, y.C.y, rb, rb * TILT, 0, 0, TAU); g.stroke(); }
    if (!this.dunyaYok && re > 4) { g.strokeStyle = 'rgba(120,255,190,0.5)'; g.beginPath(); g.ellipse(y.C.x, y.C.y, re, re * TILT, 0, 0, TAU); g.stroke(); }
    g.setLineDash([]);
    // Ortak kütle merkezi: Dünya'nın dışına çıkınca görünür bir artı
    if (!this.dunyaYok && re > y.Re * 0.9 && rb > this.rsPx + 34) {
      g.strokeStyle = CYAN; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(y.C.x - 7, y.C.y); g.lineTo(y.C.x + 7, y.C.y); g.moveTo(y.C.x, y.C.y - 7); g.lineTo(y.C.x, y.C.y + 7); g.stroke();
      g.fillStyle = 'rgba(150,240,255,0.85)'; g.font = '600 11px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('ORTAK MERKEZ', y.C.x, y.C.y + 10);
    }
    g.restore();
  }

  private dunyaCiz(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx, y: ReturnType<MoonHole['yerler']>) {
    if (this.dunyaYok || this.ufukAt) return;
    const E = this.earth!, M = this.M;
    const on = easeOut((now - this.startAt) / 900);
    E.x = E.tx = y.earth.x; E.y = E.ty = y.earth.y; E.r = E.tr = y.Re * on;
    const ang = Math.atan2(y.bh.y - y.earth.y, y.bh.x - y.earth.x);
    // Parçalanma: Dünya kara deliğe doğru uzar
    const pk = this.parcalanAt ? clamp((now - this.parcalanAt) / PARCALAN, 0, 1) : 0;
    const sx = 1 + 0.9 * pk * pk, sy = 1 - 0.35 * pk * pk;
    g.save();
    g.translate(E.x, E.y); g.rotate(ang); g.scale(sx, sy); g.rotate(-ang); g.translate(-E.x, -E.y);
    ctx.renderer.draw(g, E, now, ctx.dpr);
    g.restore();
    // Gelgit kabarması (abartılı): kara deliğe doğru ve tam karşısında
    const b = clamp(0.03 + 0.035 * Math.log10(F.gelgitKat(M)), 0.03, 0.4) * (1 + pk);
    g.save();
    g.translate(E.x, E.y); g.rotate(ang);
    g.strokeStyle = `rgba(110,190,255,${0.55 + 0.3 * pk})`; g.lineWidth = 2;
    g.shadowColor = 'rgba(110,190,255,0.8)'; g.shadowBlur = 8;
    g.beginPath(); g.ellipse(0, 0, E.r * (1.06 + b) * sx, E.r * (1.06 - b * 0.4) * sy, 0, 0, TAU); g.stroke();
    g.restore();
    this.etiket(g, 'DÜNYA', E.x, E.y + E.r * sy + 8, 'rgba(223,245,255,0.9)');
    if (pk > 0) this.etiket(g, 'ROCHE SINIRI AŞILDI', E.x, E.y - E.r - 26, KIRMIZI);
  }

  private kdCiz(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx, y: ReturnType<MoonHole['yerler']>) {
    const age = now - this.startAt;
    const Mo = this.moon!;
    const moonR = y.Re * 0.27;
    if (age < INTRO) {
      // Açılış: Ay görünür, sonra halkalar içe çöker ve Ay bir noktaya sıkışır
      const k = clamp((age - 700) / (INTRO - 700), 0, 1), e = k * k * k;
      Mo.x = Mo.tx = y.bh.x; Mo.y = Mo.ty = y.bh.y; Mo.r = Mo.tr = Math.max(0.5, moonR * (1 - e) * easeOut(age / 600));
      ctx.renderer.draw(g, Mo, now, ctx.dpr);
      g.save();
      for (let i = 0; i < 3; i++) {
        const q = (k * 1.6 + i / 3) % 1;
        g.strokeStyle = `rgba(95,242,255,${k > 0 ? (1 - q) * 0.7 : 0})`; g.lineWidth = 1.5;
        g.beginPath(); g.arc(y.bh.x, y.bh.y, moonR * (3 - 2.6 * q), 0, TAU); g.stroke();
      }
      g.restore();
      this.etiket(g, k > 0 ? decode('SIKIŞTIRILIYOR · 0,22 mm', k * 2, 7) : 'AY', y.bh.x, y.bh.y + moonR + 8, 'rgba(223,245,255,0.9)');
      return;
    }
    const bh = this.bh!;
    bh.x = y.bh.x; bh.y = y.bh.y; bh.rs = this.rsPx;
    // Ay'ın eski boyu (hayalet daire): kara deliğin ne kadar küçük olduğunu gösterir
    if (this.rsPx < moonR * 0.9) {
      g.save();
      g.setLineDash([3, 5]); g.strokeStyle = 'rgba(200,210,220,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.arc(bh.x, bh.y, moonR, 0, TAU); g.stroke();
      g.restore();
    }
    // Merceklenme halkası (Einstein halkası, abartılı)
    g.save();
    g.strokeStyle = 'rgba(230,240,255,0.22)'; g.lineWidth = 1;
    g.beginPath(); g.arc(bh.x, bh.y, this.rsPx * 2.6, 0, TAU); g.stroke();
    g.restore();
    bh.render(g, now);
    // Çok küçükken kilit köşeleri: göz onu bulsun
    if (this.rsPx < 20) {
      const r = this.rsPx + 12 + 2 * Math.sin(now / 300);
      g.save();
      g.strokeStyle = CYAN; g.lineWidth = 1.5;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.beginPath(); g.moveTo(bh.x + sx * r, bh.y + sy * (r - 6)); g.lineTo(bh.x + sx * r, bh.y + sy * r); g.lineTo(bh.x + sx * (r - 6), bh.y + sy * r); g.stroke();
      }
      g.restore();
    }
    if (!this.ufukAt) {
      const ust = bh.y - Math.max(this.rsPx * 1.6, moonR) - 30;
      this.etiket(g, 'KARA DELİK', bh.x, ust, 'rgba(255,200,150,0.95)');
      this.etiket(g, `ufuk ⌀ ${F.uzunlukSoz(2 * F.rs(this.M))} (büyütülmüş)`, bh.x, ust + 15, 'rgba(223,245,255,0.8)', 11);
    } else {
      this.etiket(g, `OLAY UFKU · yarıçap ${F.yuvarla(F.rs(this.M) / 1000)} km`, ctx.W * 0.44, ctx.H * 0.5, 'rgba(255,220,180,0.95)', 15);
      this.etiket(g, `gerçekte ekrandakinin ${sayi(Math.max(1, (F.rs(this.M) / F.D) * y.R / this.rsPx))} katı`, ctx.W * 0.44, ctx.H * 0.5 + 20, 'rgba(223,245,255,0.75)', 12);
    }
  }

  /** Sol kenarda kütle merdiveni: basamaklar, parçalanma ve ufuk eşikleri, şu anki kütle */
  private merdiven(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const { H } = ctx, x = 40, y0 = H * 0.8, y1 = H * 0.24;
    const yOf = (L: number) => y0 + ((L - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (y1 - y0);
    const on = easeOut((now - this.startAt - 400) / 800);
    if (on <= 0) return;
    g.save();
    g.globalAlpha = on;
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 4;
    g.fillStyle = DIM; g.font = '600 12px Rajdhani, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText('KÜTLE', x - 6, y1 - 14);
    g.strokeStyle = 'rgba(95,242,255,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
    // Dolu kısım
    const yc = yOf(this.logM);
    g.strokeStyle = this.ufukAt ? MOR : this.dunyaYok ? KIRMIZI : CYAN; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, yc); g.stroke();
    g.textBaseline = 'middle';
    for (const b of F.BASAMAK) {
      const yy = yOf(Math.log10(b.M)), gecti = this.logM >= Math.log10(b.M) - 0.02;
      g.fillStyle = gecti ? CYAN : 'rgba(150,200,215,0.6)';
      g.fillRect(x - 6, yy - 1, 12, 2);
      g.font = '700 13px Rajdhani, sans-serif'; g.fillText(b.etiket, x + 14, yy);
    }
    const esik = (M: number, metin: string, renk: string) => {
      const yy = yOf(Math.log10(M));
      g.strokeStyle = renk; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(x - 8, yy); g.lineTo(x + 120, yy); g.stroke(); g.setLineDash([]);
      g.fillStyle = renk; g.font = '600 10px Rajdhani, sans-serif'; g.fillText(metin, x + 14, yy + 9);
    };
    esik(F.PARCALAMA_M, 'DÜNYA PARÇALANIR', KIRMIZI);
    esik(F.UFUK_M, 'UFUK > AY YÖRÜNGESİ', MOR);
    // İşaretçi
    g.fillStyle = TEXT;
    g.beginPath(); g.moveTo(x - 8, yc); g.lineTo(x - 18, yc - 6); g.lineTo(x - 18, yc + 6); g.closePath(); g.fill();
    g.restore();
  }

  private panel(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const age = now - this.startAt - INTRO + 400;
    if (age <= 0) return;
    const { W, H } = ctx, M = this.M;
    const x = W * 0.7, y = H * 0.14, w = Math.min(360, W * 0.27);
    const T = F.hawkingK(M), E = F.einsteinSn(M), bm = F.agirlikMerkezi(M) / 1000;
    const kat = F.gelgitKat(M), gm = F.gelgitM(M);
    const rows: [string, string, string][] = [
      ['KÜTLE', F.kutleSoz(M), `${bilimsel(M)} kg`],
      ['OLAY UFKU ÇAPI', F.uzunlukSoz(2 * F.rs(M)), F.capKiyas(2 * F.rs(M))],
      ['GELGİT', kat < 1.05 ? "Ay'la aynı" : `×${F.yuvarla(kat)}`, F.gelgitOran(M) >= 1 ? "Dünya'nın çekiminden güçlü" : gm < 1000 ? `kabarma ≈ ${sayi(gm, gm < 10 ? 2 : 0)} m` : `kabarma ≈ ${F.yuvarla(gm / 1000)} km (kaba)`],
      ['BİR AY', this.dunyaYok || this.ufukAt ? '—' : gunMetni(F.AY_GUN * (F.donemGun(M) / F.donemGun(F.M_AY))), this.dunyaYok ? 'Dünya yok' : 'bugün 27,3 gün'],
      ['ORTAK MERKEZ', this.dunyaYok ? '—' : bm * 1000 < F.R_DUNYA ? "Dünya'nın içinde" : "Dünya'nın dışında", this.dunyaYok ? '' : `Dünya'nın merkezinden ${F.yuvarla(bm)} km`],
      ['HAWKING SICAKLIĞI', T >= 0.01 ? `${sayi(T, 2)} K` : `${bilimsel(T)} K`, T < F.CMB_K ? 'uzaydan (2,7 K) soğuk: buharlaşmaz' : 'uzaydan sıcak: buharlaşır'],
      ['EINSTEIN HALKASI', this.ufukAt ? '—' : aciMetni(E), this.ufukAt ? '' : E < 60 ? 'gözle görünmez' : E > 500 && E < 1600 ? 'gökte Ay boyunda bir halka' : ''],
      ['AY IŞIĞI', 'yok', 'tutulma da yok'],
    ];
    const rh = 40, h = 52 + rows.length * rh;
    g.save();
    mechPanel(g, x, y, w, h, age, 'AY → KARA DELİK', 'AKD-01', this.dunyaYok ? 2 : 1, 2);
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 4;
    rows.forEach(([k, v, alt], i) => {
      const p = (age - 300 - i * 110) / 300;
      if (p <= 0) return;
      const ry = y + 44 + i * rh;
      g.textBaseline = 'top';
      g.fillStyle = DIM; g.font = '600 12px Rajdhani, sans-serif'; g.textAlign = 'left'; g.fillText(k, x + 16, ry);
      if (alt) { g.fillStyle = 'rgba(150,200,215,0.7)'; g.font = '500 11px Rajdhani, sans-serif'; g.fillText(alt, x + 16, ry + 16); }
      g.fillStyle = i === 2 && F.gelgitOran(M) >= 1 ? KIRMIZI : TEXT; g.font = '700 18px Rajdhani, sans-serif'; g.textAlign = 'right';
      g.fillText(decode(v, p, i), x + w - 16, ry + 6);
    });
    g.restore();
  }

  private damga(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx) {
    const { W, H } = ctx;
    const [t, renk]: [string | null, string] = this.ufukAt ? ['DÜNYA OLAY UFKUNUN İÇİNDE', MOR] : this.dunyaYok ? ['DÜNYA PARÇALANDI', KIRMIZI]
      : this.logM < LOG_MIN + 0.02 ? ['NEREDEYSE HİÇBİR ŞEY DEĞİŞMEDİ', CYAN] : [null, CYAN];
    if (!t) return;
    const at = this.ufukAt ?? (this.dunyaYok ? this.parcalanAt! + PARCALAN : Math.max(this.durumAt, this.startAt + INTRO + 1200));
    g.save();
    stamp(g, t, W * 0.44, H * 0.82, (now - at) / 300, renk, 22);
    g.restore();
  }

  private etiket(g: CanvasRenderingContext2D, t: string, x: number, y: number, renk: string, px = 13) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 4;
    g.fillStyle = renk; g.font = `700 ${px}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(t, x, y);
    g.restore();
  }

  durum() {
    const M = this.M;
    return {
      numara: 'Ay yerine kara delik',
      kutle: F.kutleSoz(M), kutle_kg: +M.toPrecision(3),
      olay_ufku_cap_m: +(2 * F.rs(M)).toPrecision(3),
      gelgit_ay_kati: +F.gelgitKat(M).toPrecision(3),
      bir_ay_gun: this.dunyaYok ? null : +(F.AY_GUN * (F.donemGun(M) / F.donemGun(F.M_AY))).toPrecision(3),
      hawking_K: +F.hawkingK(M).toPrecision(3),
      dunya_parcalandi: this.dunyaYok,
      dunya_ufkun_icinde: !!this.ufukAt,
    };
  }
}
