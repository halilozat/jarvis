// Uzay Laboratuvarı · beyin. Güneş ve 8 gezegen bugünkü gerçek yerlerinde (astronomy-engine), sonrası N-cisim
// simülasyonu (physics.ts). Her etkileşimin arkasında gerçek bir hesap var; ekrandaki ve sesteki bütün sayılar
// data.ts ve physics.ts'ten gelir. Ekran ölçeği scale.ts'te (uzaklık ∝ √AU, boyutlar büyütülmüş).
//
// Jestler (her hareketin tek bir işi var):
//  🤏 gezegene kısa dokunuş: o gezegene yakınlaş (uyduları, NASA kartı; içeride 🤏 sürükle döndürür, 🤏🤏 aç kesit,
//     🤏🤏 kapa geri çıkar) · 🤏 gezegeni sürükle: canlı sıcaklık, yüzey hâli, gideceği yol
//  boşluğa yavaş bırak: o uzaklıkta yörünge · başka gezegenin üstüne bırak: yer değiştirirler
//  hızla başka gezegene vur: çarpışma · boşluğa hızla bırak: fırlat (el hızı → Δv)
//  🤏🤏 boşlukta iki elle: güneş sistemini büyüt/küçült (harita gibi) · 🤏 + 🤏 iki gezegen: ışık ipi, yaklaştır: karşılaştır
//  ✊ 1 sn: zamanı durdur/başlat · ✌️ 0,6 sn: mikrofon
//
// Gezegene yakınlaşınca ("Jüpiter'e yakınlaş") uyduları görünür: Europa, Ganymede, Enceladus, Titan, Ay. Yaşam izi
// taraması (life.ts hesap, lifeScan.ts animasyon) seçili cisim, bir cisim ya da yakınlaşılan bölge için çalışır.
import type { Fx, HoldState } from '../fx';
import type { P, TrackedHand } from '../gestures';
import type { Sfx } from '../sfx';
import type { SpaceHooks } from './brain';
import { DebrisDisk, orbitPos } from './collision';
import type { SpaceCmd } from './commands';
import { AU_KM, DONMA, GEZEGENLER, KAYNAMA, KIZGIN, UYDU_YORUNGE, VERI, YB_DIS, YB_IC, ebeveyn, ortUzaklikAU, type Cisim, type Gezegen, type Uydu } from './data';
import { ayYonu, indeks, sistem, uyduAcisi } from './ephemeris';
import { BILGI, ONAY, type Govde } from './facts';
import * as H from './labHud';
import { setLabProvider } from './labContext';
import { bolgeCisimleri, ozet, tara, type TaramaGirdi } from './life';
import { LifeScan, type ScanItem } from './lifeScan';
import { LabHafiza, adI, kisisellestir } from './narration';
import { HIZLAR, LAB_ONAY } from './labText';
import { decode, easeOut, gearRing, segArcs } from './mech';
import { C, G, Sim, daireselHiz, dengeT, hohmannGun, isikSn, kmS, tahmin, KACIS_AU, YIL_GUN, type Elements, type Tahmin } from './physics';
import { Body, BodyRenderer, colorsOf, durumRenk, projectPoints, type YuzeyDurum } from './planets';
import { Olcek, govdePx } from './scale';
import type { SpaceScene } from './scene';
import { drawAtmosphere, drawSection } from './section';
import * as S from './sentences';
import type { Lens } from './starfield';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeBackL = (t: number) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const DAY_MS = 86_400_000;

const HIZ_VARSAYILAN = 5;
const hizAd = (d: number) => {
  const a = Math.abs(d);
  const t = a >= 365 ? '1 yıl/sn' : a >= 30 ? '1 ay/sn' : a >= 7 ? '1 hafta/sn' : a >= 1 ? '1 gün/sn' : '2,4 saat/sn';
  return d < 0 ? `◀◀ ${t} geri` : `${a >= 7 ? '▶▶' : '▶'} ${t}`;
};

/** Bırakırken el bundan yavaşsa (px/s) dairesel yörünge; hızlıysa fırlatma */
const YAVAS = 320;
/** Fırlatma: el hızı → Δv (yörünge hızı cinsinden). 320 px/s → 0, 1420 px/s → 1 kat */
const dvKat = (sp: number) => clamp((sp - YAVAS) / 1100, 0, 1.8);
/** Tutulan gezegen elden bu kadar uzaklaşınca (px) yörüngesinden kopar */
const KOPMA = 30;

/** Gezegenlerin bugünkü sera farkı (K): ortalama sıcaklık − denge sıcaklığı. Gaz devlerinde iç ısı ve 1 bar düzeyi. */
const SERA: Record<Gezegen, number> = Object.fromEntries(GEZEGENLER.map(g => {
  const d = VERI[g].sicaklik + 273.15 - dengeT(ortUzaklikAU(g), VERI[g].albedo);
  return [g, VERI[g].kaya ? Math.max(0, d) : d];
})) as Record<Gezegen, number>;

/** Gezegenin r AU'daki ortalama yüzey sıcaklığı (°C): denge sıcaklığı + bugünkü sera farkı (sabit kabul) */
export const yuzeyC = (g: Gezegen, r: number) => C(dengeT(r, VERI[g].albedo) + SERA[g]);

/** Sıcaklıktan yüzey hâli */
export function durumOf(g: Gezegen, Tc: number): YuzeyDurum {
  if (!VERI[g].kaya) return 'gaz';
  if (g === 'dunya') return Tc < DONMA ? 'buz' : Tc < KAYNAMA ? 'su' : Tc < KIZGIN ? 'kaynayan' : 'kizgin';
  if (Tc >= KIZGIN) return 'kizgin';
  return Tc < Math.min(-100, VERI[g].sicaklik - 60) ? 'buz' : 'kaya';
}

const ybMi = (r: number) => r >= YB_IC && r <= YB_DIS;
/** Açılış animasyonu süresi (ms) */
const INTRO_MS = 3200;
/** İç gezegenler görünümünün yakınlaştırma çarpanı (Mars yörüngesi ekrana sığar) */
const ZOOM_IC = Math.sqrt(30.6 / 1.68);
/** Kısa dokunuş: bu süreden kısa ve kıpırdamadan bırakılan çimdik (ms) */
const DOKUNUS = 450;
/** Bu hızdan (px/s) hızlı vuruş çarpışma sayılır */
const VURUS = 850;

/** Uydu ya da Ay'ın yüzey sıcaklığı (°C): gezegeninin Güneş'e uzaklığında denge sıcaklığı + bugünkü farkı */
export function uyduC(c: Cisim, r: number): number {
  const v = VERI[c], a0 = ortUzaklikAU(ebeveyn(c));
  return C(dengeT(r, v.albedo) + (v.sicaklik + 273.15 - dengeT(a0, v.albedo)));
}

/** Yakınlaşınca görünen uydular */
const UYDU_LISTE: Partial<Record<Gezegen, (Uydu | 'ay')[]>> = { jupiter: ['europa', 'ganymede'], saturn: ['enceladus', 'titan'], dunya: ['ay'] };
const UYDU_SAY: Partial<Record<Gezegen, string>> = { jupiter: 'Europa ile Ganymede', saturn: 'Enceladus ile Titan', dunya: 'Ay' };

interface LP {
  g: Gezegen;
  i: number;
  body: Body;
  heldBy: string | null;
  /** Elde ama henüz yörüngesinden koparılmadı (el kıpırdamadıysa bırakınca hiçbir şey değişmez) */
  detached: boolean;
  grabPt: P | null;
  /** Ekrandaki yer ve taban yarıçap */
  sx: number; sy: number; rpx: number;
  /** Tutulurken büyür */
  grow: number;
  /** Fiziksel durum */
  r: number; Tc: number; durum: YuzeyDurum;
  /** Renk geçişi */
  cols: Uint8ClampedArray; from: Uint8ClampedArray; to: Uint8ClampedArray; blend: number;
  moved: boolean;
  gone: 'kacti' | 'dustu' | 'carpisti' | null;
  orbit: Float32Array | null; orbitAt: number;
  el: Elements | null;
  /** Görsel kaydırma (taşı/yaklaştır animasyonu) */
  off: { dx: number; dy: number; at: number } | null;
  /** Yanına bir dev kondu: basıklık izlenir */
  watch: { e0: number; said: boolean; by: Gezegen } | null;
  /** Çarpışmayla büyüdü (görsel yarıçap çarpanı) */
  kmK: number;
  hot: number;
  /** Tutulmadan önceki durum (Güneş'e göre): kesitten sonra geri konur */
  saved: { x: number; y: number; z: number; vx: number; vy: number; vz: number; moved: boolean } | null;
}

interface HS {
  holding: LP | null;
  /** Çimdik boşlukta başladı (iki elle yakınlaştırma için) */
  bos: boolean;
  /** Çimdiğin başladığı an ve yer (kısa dokunuş, döndürme) */
  t0: number; x0: number; lastX: number;
  /** Sürüklenen gezegenin altındaki gezegen (bırakınca yer değiştir, hızla vurunca çarpış) */
  hedef: LP | null;
  kesitOf: LP | null;
  dial: { roll0: number; idx0: number } | null;
  /** Boşlukta çimdik başladı: 250 ms içinde gezegene değmezse zaman kadranı açılır */
  emptySince: number | null;
  pinchLost: number | null;
  blocked: boolean;
  cardFired: number; fistFired: number; micFired: number;
}

interface Banner { baslik: string; alt: string; renk: string; at: number; dur: number }
interface Rope { a: LP; b: LP; at: number; pulseAt: number | null; until: number | null; said: boolean; arrived: boolean }
interface Compare { a: Cisim; b: Cisim; at: number; until: number | null }
interface Section { g: Cisim; body: Body; at: number; open: number; until: number | null; x: number; y: number; R: number; lp: LP | null }

export class LabBrain implements SpaceScene {
  listening = false;
  /** Göstergeler: tam · temiz çekim (yalnızca sonuçlar) · yok */
  cekim: 'tam' | 'temiz' | 'yok' = 'tam';
  view = new Olcek();
  sim: Sim;
  /** Simülasyon tarihi (ms) */
  date: number;
  hizIdx = HIZ_VARSAYILAN;
  paused = false;
  hz = true;
  /** Yakınlaştırma çarpanı: 1 bütün sistem, ≈4,3 iç gezegenler; iki elle kademesiz */
  zoomX = 1;
  selected: Cisim = 'dunya';
  /** Yakınlaşılan gezegen (uyduları görünür) */
  odak: Gezegen | null = null;
  /** Ay kaldırıldı ("Ay'ı kaldır") */
  ayYok = false;
  scan: LifeScan;
  /** Jarvis'in laboratuvar hafızası: taramalar ve hareketler (samimi, bağlamlı anlatım için) */
  hafiza = new LabHafiza();
  planets: LP[] = [];
  /** Kullanıcının kilosu (karşılaştırmada ağırlık hissi) */
  kg = 70;
  W = 0; H = 0;
  private dpr = 1;
  private g: CanvasRenderingContext2D;
  private renderer = new BodyRenderer();
  private sun: Body;
  private moon: Body;
  private hst = new Map<string, HS>();
  private banner: Banner | null = null;
  private pred: { lp: LP; t: Tahmin | null; circle: number | null; at: number; live: boolean } | null = null;
  private predAt = 0;
  private rope: Rope | null = null;
  private compare: Compare | null = null;
  private section: Section | null = null;
  private card: { g: Cisim; until: number } | null = null;
  private odakK = 0;
  /** Açılış animasyonunun başladığı an (null: bitti) */
  private intro: number | null = null;
  private introSes = 0;
  /** İki elle boşlukta çimdik: yakınlaştırma (sistem) ya da kesit/geri (yakınlaşma görünümü) */
  /** mod: başladığı görünüme kilitli (yakınlaştırma ya da kesit/geri); 'bitti': eller bırakana kadar yok sayılır */
  private pinchZoom: { a: P; b: P; d0: number; z0: number; dPrev: number; mod: 'zoom' | 'odak' | 'bitti' } | null = null;
  /** Yakınlaşma görünümünde gezegenin ekrandaki yeri (kesit oraya açılır) */
  private odakMerkez = { x: 0, y: 0, R: 60 };
  private odakSon: Gezegen | null = null;
  /** Yakınlaşma görünümünde gövdelerin ekrandaki yeri (çimdikle seçmek için) */
  private odakPos: { c: Cisim; x: number; y: number; r: number }[] = [];
  private uyduBody = new Map<Cisim, Body>();
  private pairD: number | null = null;
  private closing = 0;
  /** Son anlardaki en yüksek yaklaşma hızı (el takibi gecikse de çarpışma kaçmasın) */
  private closingPeak = 0;
  private disks: DebrisDisk[] = [];
  private moons: Body[] = [];
  private tween: { from: Map<number, { x: number; y: number }>; next: Sim; date0: number; date1: number; at: number; say: string } | null = null;
  private events: string[] = [];
  private openedAt = 0;
  private autoZoom = true;
  private micHand: string | null = null;
  private flashAt = -1e9;
  private moonBehind = false;
  /** Çarpışmadan hemen sonra (eller bırakırken) yeni bant ve cümle çıkmasın */
  private quietUntil = 0;

  private canvas: HTMLCanvasElement;
  private fx: Fx;
  private sfx: Sfx;
  private hooks: SpaceHooks;
  constructor(canvas: HTMLCanvasElement, fx: Fx, sfx: Sfx, hooks: SpaceHooks) {
    this.canvas = canvas; this.fx = fx; this.sfx = sfx; this.hooks = hooks;
    this.g = canvas.getContext('2d')!;
    try { const k = Number(localStorage.getItem('jarvis.lab.kilo')); if (k >= 20 && k <= 300) this.kg = k; } catch { /* yok */ }
    this.date = Date.now();
    this.sim = sistem(new Date(this.date));
    this.sun = new Body('gunes', 0, 0, 20, 0);
    this.sun.form = 1;
    this.moon = new Body('ay', 0, 0, 3, 0);
    this.moon.form = 1;
    this.scan = new LifeScan(sfx, { say: t => this.hooks.say(t), preload: l => this.hooks.preload?.(l), done: t => this.hafiza.kaydet(t) });
    this.planets = GEZEGENLER.map(g => this.makeLP(g));
  }

  private makeLP(g: Gezegen): LP {
    const body = new Body(g as Govde, 0, 0, 6, 0);
    body.form = 1;
    body.ownColors = true;
    const base = durumRenk(g as Govde, 'su');
    const cols = new Uint8ClampedArray(base);
    body.colors = cols;
    return {
      g, i: indeks(g), body, heldBy: null, detached: false, grabPt: null, sx: 0, sy: 0, rpx: 6, grow: 1,
      r: ortUzaklikAU(g), Tc: VERI[g].sicaklik, durum: 'su', cols, from: base, to: base, blend: 1,
      moved: false, gone: null, orbit: null, orbitAt: -1e9, el: null, off: null, watch: null, kmK: 1, hot: 0, saved: null,
    };
  }

  resize(W: number, H: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.layout(1);
  }

  /** Laboratuvar açıldı: bugünkü gökyüzü, önce bütün sistem, 3 sn sonra iç gezegenlere yakınlaşır */
  open(now: number) {
    this.openedAt = now;
    this.intro = now;
    this.introSes = 0;
    this.autoZoom = true;
    this.zoomX = 1;
    if (!this.planets.some(p => p.moved || p.gone)) this.loadDate(Date.now());
    this.layout(1);
    setLabProvider(() => this.context());
  }

  reset() {
    this.hst.clear();
    this.rope = null; this.compare = null; this.section = null; this.pred = null; this.card = null; this.banner = null;
    for (const p of this.planets) { p.heldBy = null; p.detached = false; this.sim.held[p.i] = 0; }
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    setLabProvider(null);
  }

  lens(): Lens | null { return null; }

  // ---------------------------------------------------------------- Ölçek ve yerleşim

  private hedefK() {
    const s = H.guvenliAlan(this.W, this.H);
    const half = Math.min((s.x1 - s.x0) * 0.5, ((s.y1 - s.y0) * 0.5) / this.view.basik);
    return (half / Math.sqrt(30.6)) * this.zoomX;
  }

  private layout(k: number) {
    const s = H.guvenliAlan(this.W, this.H);
    this.view.cx = (s.x0 + s.x1) / 2;
    this.view.cy = (s.y0 + s.y1) / 2;
    this.view.K += (this.hedefK() - this.view.K) * k;
  }

  /** Açılış animasyonu: 0 → 1 (3,2 sn); bitince 1 */
  private introT(now: number) { return this.intro === null ? 1 : clamp((now - this.intro) / INTRO_MS, 0, 1); }
  /** i. gezegenin açılıştaki görünme oranı (iç gezegenler önce) */
  private introK(i: number, t: number) { return t >= 1 ? 1 : ease(clamp((t - (0.36 + 0.045 * i)) / 0.3, 0, 1)); }
  private introSounds(t: number) {
    if (t >= 1) return;
    if (this.introSes === 0 && t > 0.14) { this.introSes = 1; this.sfx.form(); }
    if (this.introSes === 1 && t > 0.4) { this.introSes = 2; this.sfx.servo(); }
    if (this.introSes === 2 && t > 0.86) { this.introSes = 3; this.sfx.lock(); }
  }

  /** Gezegenin taban yarıçapı (px): boyutlar büyütülmüş */
  private basePx() { return clamp(this.view.K * 0.075, 5, 24) * (this.scan.oda ? 1.25 : 1); }

  // ---------------------------------------------------------------- Her kare

  update(hands: TrackedHand[], now: number, dt: number): { mode: string; holds: HoldState[] } {
    const holds: HoldState[] = [];
    if (this.autoZoom && now - this.openedAt > 3200) { this.autoZoom = false; this.zoomX = ZOOM_IC; }
    this.layout(1 - Math.exp(-dt * 2.2));
    // Kaybolan eller bıraktı sayılır
    const seen = new Set(hands.map(h => h.id));
    for (const [id, s] of [...this.hst]) if (!seen.has(id)) { this.release(null, s, now); this.hst.delete(id); }

    const it = this.introT(now);
    if (it >= 1) this.intro = null;
    if (!this.tween && !this.scan.active && it >= 0.9) this.handleHands(hands, now, dt, holds);
    this.introSounds(it);
    if (this.odak) this.odakSon = this.odak;
    this.odakK += ((this.odak ? 1 : 0) - this.odakK) * (1 - Math.exp(-dt * 4));
    this.scan.update(now);
    this.pairStep(hands, now, dt);
    this.advance(now, dt);
    this.positions(now, dt);
    this.render(now, dt, hands);
    this.fx.render(dt, now, [], holds);

    const held = this.planets.filter(p => p.heldBy).map(p => VERI[p.g].ad.toLocaleLowerCase('tr'));
    const mode = this.scan.active ? 'lab · yaşam izi taraması' : this.odak ? `lab · ${VERI[this.odak].ad.toLocaleLowerCase('tr')} sistemi` : this.section ? `lab · ${VERI[this.section.g].ad.toLocaleLowerCase('tr')} kesiti` : held.length ? `lab · ${held.join(' + ')}` : `lab · ${this.paused ? 'durdu' : hizAd(HIZLAR[this.hizIdx])}`;
    return { mode, holds };
  }

  private st(id: string): HS {
    let s = this.hst.get(id);
    if (!s) { s = { holding: null, bos: false, t0: 0, x0: 0, lastX: 0, hedef: null, kesitOf: null, dial: null, emptySince: null, pinchLost: null, blocked: false, cardFired: -1, fistFired: -1, micFired: -1 }; this.hst.set(id, s); }
    return s;
  }

  private handleHands(hands: TrackedHand[], now: number, dt: number, holds: HoldState[]) {
    const anyHeld = this.planets.some(p => p.heldBy);
    const odakta = !!this.odak && this.odakK > 0.5;
    for (const h of hands) {
      const s = this.st(h.id);
      if (h.gesture === 'cimdik') {
        s.pinchLost = null;
        if (!s.holding && !s.bos && !s.blocked) this.acquire(h, s, now);
      } else if (s.blocked) s.blocked = false;
      else if (s.holding || s.bos) {
        // Kısa titremeler bırakma sayılmaz
        s.pinchLost ??= now;
        if (now - s.pinchLost > 160) this.release(h, s, now);
      }

      // Yakınlaşma görünümünde tek elle sürükle: gezegeni döndür
      if (odakta && s.bos && s.pinchLost === null && this.pinchZoom === null) {
        const dx = h.shape.pinchPt.x - s.lastX;
        const lp = this.lp(this.odak);
        if (lp) lp.body.yaw += dx * 0.012;
      }
      s.lastX = h.shape.pinchPt.x;

      // Tutulan gezegen eli izler
      if (s.holding) {
        const p = s.holding;
        const tx = h.shape.pinchPt.x, ty = h.shape.pinchPt.y - h.shape.size * 0.12;
        // Kopma eşiği el büyüklüğüne göre: parmaklar kapanırken çimdik noktası biraz kayar, dokunuş koparmasın
        if (!p.detached && p.grabPt && Math.hypot(h.shape.pinchPt.x - p.grabPt.x, h.shape.pinchPt.y - p.grabPt.y) > Math.max(KOPMA, h.shape.size * 0.3)) {
          p.detached = true;
          this.sim.held[p.i] = 1;
          p.moved = true;
          this.sfx.grab();
        }
        // Çimdik bırakıldıysa (bırakma onayı beklenirken) gezegen olduğu yerde kalır; el hızı fırlatmaya gider
        if (p.detached && s.pinchLost === null) {
          const k = 1 - Math.exp(-dt * 16);
          p.sx += (tx - p.sx) * k; p.sy += (ty - p.sy) * k;
          const q = this.view.duzlem(p.sx, p.sy);
          const sim = this.sim;
          sim.x[p.i] = sim.x[0] + q.x; sim.y[p.i] = sim.y[0] + q.y; sim.z[p.i] = sim.z[0];
          sim.vx[p.i] = sim.vx[0]; sim.vy[p.i] = sim.vy[0]; sim.vz[p.i] = sim.vz[0];
          sim.dirty = true;
          // Altındaki gezegen: bırakınca yer değiştir, hızla vurunca çarpış
          s.hedef = this.hedefGezegen(p);
          const hiz = Math.hypot(h.vel.x, h.vel.y);
          if (s.hedef && hiz > VURUS && Math.hypot(p.sx - s.hedef.sx, p.sy - s.hedef.sy) < (p.rpx * p.grow + s.hedef.rpx * s.hedef.grow) * 1.1) {
            const B = s.hedef;
            s.hedef = null;
            this.collide(p, B, now);
            continue;
          }
          // Bırakılırsa nereye gider? (saniyede ~8 kez; bir gezegenin üstündeyken yer değiştirme gösterilir)
          if (!s.hedef && now - this.predAt > 120 && !this.rope && !this.compare) { this.predAt = now; this.predict(p, h, now); }
          else if (s.hedef) this.pred = null;
        }
      }

      // ✊ 1 sn: zamanı durdur / başlat
      if (h.gesture === 'yumruk' && !s.holding) {
        const p = (now - h.since - 150) / 1000;
        if (p > 0 && s.fistFired !== h.since) {
          if (p >= 1) { s.fistFired = h.since; this.setPaused(!this.paused, now); }
          else holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: h.shape.size * 1.1, p, label: this.paused ? '▶ ZAMAN' : '⏸ ZAMAN', done: 0 });
        }
      }
      // ✌️ 0,6 sn: mikrofon
      if (h.gesture === 'zafer' && !anyHeld) {
        const p = (now - h.since - 150) / 600;
        if (p > 0 && s.micFired !== h.since) {
          if (p >= 1) { s.micFired = h.since; this.micHand = h.id; this.sfx.micOn(); this.hooks.mic(); }
          else holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: h.shape.size * 1.2, p, label: '🎙 DİNLE', done: 0 });
        }
      }
    }
  }

  /** Sürüklenen gezegenin altındaki (en yakın) başka gezegen */
  private hedefGezegen(p: LP): LP | null {
    let best: LP | null = null, bd = Infinity;
    for (const o of this.planets) {
      if (o === p || o.gone || o.heldBy) continue;
      const d = Math.hypot(o.sx - p.sx, o.sy - p.sy);
      if (d < Math.max(34, o.rpx * o.grow * 2.2) + p.rpx * p.grow * 0.5 && d < bd) { best = o; bd = d; }
    }
    return best;
  }

  /** Ekrandaki noktaya en yakın gezegen (görünen yarıçap + pay içinde) */
  private nearest(p: P, pay: number): LP | null {
    let best: LP | null = null, bd = Infinity;
    for (const lp of this.planets) {
      if (lp.gone) continue;
      const d = Math.hypot(lp.sx - p.x, lp.sy - p.y);
      if (d < Math.max(28, lp.rpx * lp.grow * 1.8) + pay && d < bd) { best = lp; bd = d; }
    }
    return best;
  }

  private acquire(h: TrackedHand, s: HS, now: number) {
    s.t0 = now; s.x0 = s.lastX = h.shape.pinchPt.x; s.hedef = null;
    // Yakınlaşma görünümü: uyduya dokunuş seçer; boşlukta çimdik döndürür, iki elle kesit ya da geri
    if (this.odak && this.odakK > 0.5) {
      let best: { c: Cisim; d: number } | null = null;
      for (const q of this.odakPos) {
        if (q.c === this.odak) continue;
        const d = Math.hypot(q.x - h.shape.pinchPt.x, q.y - h.shape.pinchPt.y);
        if (d < Math.max(30, q.r * 1.3) && (!best || d < best.d)) best = { c: q.c, d };
      }
      if (best) { this.selected = best.c; this.sfx.hover(); s.blocked = true; return; }
      s.bos = true;
      return;
    }
    const lp = this.nearest(h.shape.pinchPt, 6);
    if (lp && !lp.heldBy) {
      lp.heldBy = h.id; lp.detached = false; lp.grabPt = { ...h.shape.pinchPt };
      const sm = this.sim, i = lp.i;
      lp.saved = { x: sm.x[i] - sm.x[0], y: sm.y[i] - sm.y[0], z: sm.z[i] - sm.z[0], vx: sm.vx[i] - sm.vx[0], vy: sm.vy[i] - sm.vy[0], vz: sm.vz[i] - sm.vz[0], moved: lp.moved };
      s.holding = lp;
      this.selected = lp.g;
      this.sfx.hover();
      return;
    }
    // Boşlukta çimdik: tek başına bir şey yapmaz; ikinci el de boşlukta çimdikleyince yakınlaştırma
    s.bos = true;
  }

  /** Gezegene yakınlaş: büyür, uyduları ve NASA kartı görünür */
  private odakla(g: Gezegen, now: number) {
    this.odak = g;
    this.selected = g;
    this.card = null;
    this.section = null;
    this.sfx.solar();
    this.log(`${VERI[g].ad} yakından incelendi`);
    void now;
  }

  /** A, B'nin üstüne bırakıldı: B'nin yerine geçer, B de A'nın eski yerine gider (ikisi de dairesel yörüngede) */
  private yerDegistir(A: LP, B: LP, now: number) {
    const sim = this.sim, sv = A.saved;
    const rA = sv ? Math.hypot(sv.x, sv.y) : A.r, angA = sv ? Math.atan2(sv.y, sv.x) : 0;
    const rB = B.r, angB = Math.atan2(sim.y[B.i] - sim.y[0], sim.x[B.i] - sim.x[0]);
    this.place(A, rB, angB);
    this.place(B, rA, angA);
    this.pred = null;
    this.selected = A.g;
    this.hafiza.olay({ tip: 'tasi', cisim: A.g, metin: `${VERI[B.g].adIn} yörüngesine` });
    this.hafiza.olay({ tip: 'tasi', cisim: B.g, metin: `${VERI[A.g].adIn} eski yörüngesine` });
    this.log(`${VERI[A.g].ad} ile ${VERI[B.g].ad} yer değiştirdi`);
    this.sfx.morph();
    void this.settled(A, rB, now);
  }

  private release(h: TrackedHand | null, s: HS, now: number) {
    const lp = s.holding, hedef = s.hedef;
    s.holding = null; s.dial = null; s.pinchLost = null; s.bos = false; s.hedef = null;
    if (s.kesitOf) { s.kesitOf = null; if (this.section) this.section.until = now + 5000; }
    if (!lp) return;
    lp.heldBy = null; lp.grabPt = null;
    // Kesit açıkken bırakıldı ya da hiç koparılmadı: yörüngesi değişmez
    if (this.section?.lp === lp) { this.restore(lp); this.section.lp = null; this.section.until = now + 5000; return; }
    if (!lp.detached) {
      // Kısa dokunuş: gezegene yakınlaş
      if (h && now - s.t0 < DOKUNUS) this.odakla(lp.g, now);
      return;
    }
    lp.detached = false;
    this.sim.held[lp.i] = 0;
    // Başka gezegenin üstüne bırakıldı: yer değiştirirler
    if (hedef && !hedef.gone && (!h || Math.hypot(h.vel.x, h.vel.y) < VURUS)) { this.yerDegistir(lp, hedef, now); return; }
    const sim = this.sim, i = lp.i;
    const rx = sim.x[i] - sim.x[0], ry = sim.y[i] - sim.y[0], r = Math.hypot(rx, ry);
    const vc = daireselHiz(r, G * (sim.m[0] + sim.m[i]));
    const tx = -ry / r, ty = rx / r;
    const sp = h ? Math.hypot(h.vel.x, h.vel.y) : 0;
    let vx = tx * vc, vy = ty * vc;
    const k = dvKat(sp);
    if (h && k > 0) {
      const d = this.view.yon(lp.sx, lp.sy, h.vel.x, h.vel.y);
      vx += d.x * vc * k; vy += d.y * vc * k;
    }
    sim.vx[i] = sim.vx[0] + vx; sim.vy[i] = sim.vy[0] + vy; sim.vz[i] = sim.vz[0];
    sim.dirty = true;
    lp.orbitAt = -1e9;
    if (k > 0) {
      // Fırlatma: tahmin ve sonuç; zaman hızlanır ki sonuç birkaç saniyede görünsün
      const t = tahmin(sim, i, vx, vy);
      this.pred = { lp, t, circle: null, at: now, live: false };
      const kat = Math.hypot(vx, vy) / vc;
      const dvKmS = kmS(vc * k);
      if (t.sonuc === 'kacti') this.setBanner('KAÇIŞ YÖRÜNGESİ', `Δv ≈ ${S.sayi(dvKmS, 1)} km/s · hız dairesel hızın ${S.sayi(kat, 2)} katı (kaçış: √2 ≈ 1,41)`, 'rgb(255,120,120)', now, 6000);
      else if (t.sonuc === 'dustu') this.setBanner("GÜNEŞ'E DÜŞECEK", `Δv ≈ ${S.sayi(dvKmS, 1)} km/s · günberi Güneş'in içinde`, 'rgb(255,170,80)', now, 6000);
      else this.setBanner('YENİ YÖRÜNGE', `e = ${S.sayi(t.el.e, 2)} · ${S.sayi(t.el.q, 2)}–${S.sayi(t.el.Q, 2)} AU · bir tur ${S.gunSoz(t.el.P * YIL_GUN)}`, H.CYAN, now, 6000);
      this.log(`${VERI[lp.g].ad} fırlatıldı: Δv ≈ ${S.sayi(dvKmS, 1)} km/s, sonuç ${t.sonuc === 'kacti' ? 'kaçış' : t.sonuc === 'dustu' ? "Güneş'e düşüş" : `yörünge e=${S.sayi(t.el.e, 2)}`}`);
      this.hooks.say(S.firlatma(lp.g, t.sonuc, t.el, kat));
      this.hafiza.olay({ tip: 'firlat', cisim: lp.g, metin: `${adI(VERI[lp.g].ad)} fırlattık` });
      this.sfx.whoosh();
      if (HIZLAR[this.hizIdx] < 30) { this.hizIdx = HIZLAR.indexOf(30); this.paused = false; }
      // Yol iç görünümün dışına çıkıyorsa bütün sisteme uzaklaş
      if (this.zoomX > 1.5 && (t.sonuc === 'kacti' || t.el.Q > 1.7)) { this.zoomX = 1; this.autoZoom = false; }
    } else {
      this.pred = { lp, t: null, circle: r, at: now, live: false };
      this.hafiza.olay({ tip: 'tasi', cisim: lp.g, metin: `elinizle ${S.sayi(r, 2)} AU'ya` });
      this.settled(lp, r, now);
    }
  }

  /** Gezegen dairesel yörüngeye oturdu: bant + Jarvis'in hesaptan kurduğu cümle */
  private settled(lp: LP, r: number, now: number): Promise<void> {
    if (now < this.quietUntil) return Promise.resolve();
    const Tc = yuzeyC(lp.g, r), d = durumOf(lp.g, Tc);
    this.setBanner(`${VERI[lp.g].ad.toLocaleUpperCase('tr')} · ${S.sayi(r, 2)} AU`, `yüzey ≈ ${S.sayi(Math.round(Tc))} °C · ${S.durumAd(lp.g, d)}${ybMi(r) ? ' · yaşanabilir bölgede' : ''}`, d === 'su' ? 'rgb(120,255,170)' : d === 'buz' ? 'rgb(170,220,255)' : d === 'gaz' || d === 'kaya' ? H.CYAN : 'rgb(255,150,90)', now, 6000);
    this.log(`${VERI[lp.g].ad} ${S.sayi(r, 2)} AU'da dairesel yörüngeye kondu; yüzey ≈ ${Math.round(Tc)} °C (${S.durumAd(lp.g, d)})`);
    let say = S.yerlesti(lp.g, r, Tc, d);
    if (lp.g === 'dunya' && d === 'buz' && ybMi(r)) say += ' Daha kalın bir atmosferle sıvı kalabilirdi; bu modelde sera etkisi sabit.';
    this.sfx.planet();
    return this.sayP(say);
  }

  /** Jarvis söylesin; cümle bitince çözülür (zincirleme komutlar bunu bekler) */
  private sayP(text: string): Promise<void> {
    const r = this.hooks.say(text);
    return r instanceof Promise ? r : Promise.resolve();
  }

  /** Gezegeni tutulmadan önceki yörüngesine döndür (kesitten sonra) */
  private restore(lp: LP) {
    if (!lp.detached) return;
    lp.detached = false;
    const sim = this.sim, i = lp.i, sv = lp.saved;
    sim.held[i] = 0;
    if (!sv) return;
    const old = { x: lp.sx, y: lp.sy };
    sim.x[i] = sim.x[0] + sv.x; sim.y[i] = sim.y[0] + sv.y; sim.z[i] = sim.z[0] + sv.z;
    sim.vx[i] = sim.vx[0] + sv.vx; sim.vy[i] = sim.vy[0] + sv.vy; sim.vz[i] = sim.vz[0] + sv.vz;
    sim.dirty = true;
    lp.moved = sv.moved;
    const q = this.view.ekran(sv.x, sv.y);
    lp.off = { dx: old.x - q.X, dy: old.y - q.Y, at: performance.now() };
    lp.orbitAt = -1e9;
  }

  /** Gezegeni r AU'ya, verilen açıda, dairesel yörüngeye koy (görsel geçişle) */
  private place(lp: LP, r: number, ang: number) {
    const sim = this.sim, i = lp.i;
    const old = { x: lp.sx, y: lp.sy };
    sim.x[i] = sim.x[0] + Math.cos(ang) * r; sim.y[i] = sim.y[0] + Math.sin(ang) * r; sim.z[i] = sim.z[0];
    const vc = daireselHiz(r, G * (sim.m[0] + sim.m[i]));
    sim.vx[i] = sim.vx[0] - Math.sin(ang) * vc; sim.vy[i] = sim.vy[0] + Math.cos(ang) * vc; sim.vz[i] = sim.vz[0];
    sim.held[i] = 0;
    sim.dirty = true;
    const p = this.view.ekran(Math.cos(ang) * r, Math.sin(ang) * r);
    lp.off = { dx: old.x - p.X, dy: old.y - p.Y, at: performance.now() };
    lp.moved = true;
    lp.orbitAt = -1e9;
  }

  /** Bırakılırsa nereye gider: yavaşsa dairesel (çember), hızlıysa N-cisim tahmini */
  private predict(lp: LP, h: TrackedHand, now: number) {
    const sim = this.sim, i = lp.i;
    const rx = sim.x[i] - sim.x[0], ry = sim.y[i] - sim.y[0], r = Math.hypot(rx, ry);
    const sp = Math.hypot(h.vel.x, h.vel.y);
    const k = dvKat(sp);
    if (k <= 0) { this.pred = { lp, t: null, circle: r, at: now, live: true }; return; }
    const vc = daireselHiz(r, G * (sim.m[0] + sim.m[i]));
    const d = this.view.yon(lp.sx, lp.sy, h.vel.x, h.vel.y);
    const vx = (-ry / r) * vc + d.x * vc * k, vy = (rx / r) * vc + d.y * vc * k;
    this.pred = { lp, t: tahmin(sim, i, vx, vy, 160), circle: null, at: now, live: true };
  }

  // ---------------------------------------------------------------- İki el: ip, karşılaştırma, çarpışma, kesit

  private pairStep(hands: TrackedHand[], now: number, dt: number) {
    // İki el boşlukta çimdikliyor: sistemde yakınlaştırma (harita gibi); gezegene yakınlaşmışken aç = kesit, kapa = geri
    const bos = hands.filter(h => { const st = this.hst.get(h.id); return !!st?.bos && st.pinchLost === null && h.gesture === 'cimdik'; });
    if (bos.length === 2 && !this.scan.active) {
      const a = bos[0].shape.pinchPt, b = bos[1].shape.pinchPt, d = dist(a, b);
      this.pinchZoom ??= { a, b, d0: Math.max(60, d), z0: this.zoomX, dPrev: Math.max(60, d), mod: this.odak && this.odakK > 0.5 ? 'odak' : 'zoom' };
      const pz = this.pinchZoom;
      pz.a = a; pz.b = b;
      const oran = d / pz.d0;
      const adim = Math.max(60, d) / pz.dPrev;
      pz.dPrev = Math.max(60, d);
      if (pz.mod === 'bitti') { /* geri çıkıldı: eller bırakana kadar bekle */ }
      else if (pz.mod === 'odak') {
        if (oran < 0.62 || !this.odak) { this.odak = null; pz.mod = 'bitti'; this.section = null; this.sfx.close(); }
        else {
          const open = clamp((oran - 1.12) / 0.7, 0, 1);
          if (open > 0.02) {
            if (!this.section || this.section.g !== this.odak) this.openSection(this.odak, now, null, null, false);
            const sc = this.section!;
            sc.x = this.odakMerkez.x; sc.y = this.odakMerkez.y; sc.R = this.odakMerkez.R * 1.5;
            sc.open = Math.max(sc.open * 0.92, open); sc.until = null;
            if (open > 0.6 && !sc.lp) { sc.lp = this.lp(this.odak); this.sectionSaid(this.odak); }
          }
        }
      } else {
        this.autoZoom = false;
        // Göreli: eller ne kadar açılırsa sistem o oranda büyür (harita gibi), sıçrama olmaz
        this.zoomX = clamp(this.zoomX * Math.pow(adim, 1.15), 0.6, 12);
      }
    } else if (this.pinchZoom) {
      this.pinchZoom = null;
      if (this.section && this.section.until === null) this.section.until = now + 6000;
    }
    if (this.section && this.section.until !== null && now > this.section.until) this.section = null;

    // İki ayrı gezegen elde: ip / karşılaştırma / çarpışma
    const held = this.planets.filter(p => p.heldBy && !p.gone);
    if (held.length === 2) {
      const [A, B] = held;
      const d = Math.hypot(A.sx - B.sx, A.sy - B.sy);
      if (this.pairD !== null && dt > 0) this.closing = this.closing * 0.7 + ((this.pairD - d) / dt) * 0.3;
      this.closingPeak = Math.max(this.closing, this.closingPeak * Math.exp(-dt * 5));
      this.pairD = d;
      const rA = A.rpx * A.grow, rB = B.rpx * B.grow;
      const tasindi = A.detached || B.detached;
      if (d < (rA + rB) * 1.1 && this.closingPeak > 600 && A.detached && B.detached) { this.collide(A, B, now); return; }
      // Karşılaştırma: biri yerinden alınıp öbürüne yaklaştırıldıysa (yerinde tutulan iki gezegen arasında hep ip)
      if (tasindi && d < (rA + rB) * 2.6 + 50) {
        if (!this.compare || this.compare.until !== null || this.compare.a !== A.g || this.compare.b !== B.g) this.openCompare(A.g, B.g, now, null, true);
        this.rope = null;
      } else {
        if (this.compare && this.compare.until === null) this.compare = null;
        if (!this.rope || this.rope.a !== A || this.rope.b !== B || this.rope.until !== null) this.rope = { a: A, b: B, at: now, pulseAt: null, until: null, said: false, arrived: false };
        if (!this.rope.said && now - this.rope.at > 700) {
          this.rope.said = true;
          const { lt, hoh } = this.ropeNumbers(A, B);
          this.hooks.say(S.ip(A.g, B.g, lt, hoh));
          this.log(`Işık ipi ${VERI[A.g].ad}–${VERI[B.g].ad}: ışık ${S.sureSoz(lt)}, Hohmann ${S.gunSoz(hoh)}`);
        }
      }
    } else {
      this.pairD = null; this.closing = 0; this.closingPeak = 0;
      if (this.rope && this.rope.until === null) this.rope = null;
      if (this.compare && this.compare.until === null) this.compare = { ...this.compare, until: now + 4000 };
    }
    if (this.rope?.until && now > this.rope.until) this.rope = null;
    if (this.compare?.until && now > this.compare.until) this.compare = null;
  }

  /** İki gezegen arası: uzaklık (AU), ışık süresi (s), Hohmann (gün; Güneş'e uzaklıkları arasında) */
  private ropeNumbers(A: LP, B: LP) {
    const s = this.sim;
    const d = Math.hypot(s.x[A.i] - s.x[B.i], s.y[A.i] - s.y[B.i], s.z[A.i] - s.z[B.i]);
    return { d, lt: isikSn(d), hoh: hohmannGun(s.rSun(A.i), s.rSun(B.i)) };
  }

  private openCompare(a: Cisim, b: Cisim, now: number, until: number | null, speak: boolean) {
    this.compare = { a, b, at: now, until };
    if (speak) {
      this.hooks.say(S.karsilastir(a, b, this.kg));
      this.log(`${VERI[a].ad} ile ${VERI[b].ad} karşılaştırıldı (${this.kg} kg → ${Math.round((this.kg * VERI[b].cekim) / VERI.dunya.cekim)} kg hissi)`);
    }
    this.sfx.solar();
  }

  private openSection(g: Cisim, now: number, until: number | null, lp: LP | null, speak = true) {
    const body = new Body(g as Govde, 0, 0, 40, now);
    body.form = 1;
    if (lp) { body.ownColors = true; body.colors = lp.cols; }
    this.section = { g, body, at: now, open: 0, until, x: this.W / 2, y: this.H * 0.48, R: Math.min(this.W, this.H) * 0.24, lp: null };
    if (speak) this.sectionSaid(g);
  }

  private sectionSaid(g: Cisim) {
    this.hooks.say(S.kesit(g));
    this.log(`${VERI[g].adIn} kesiti açıldı`);
    this.sfx.open();
  }

  /** Çarpışma: küçük cisim → enkaz diski ve uydu; kütleler yakınsa erimiş tek gezegen. Kütle ve momentum korunur. */
  private collide(A: LP, B: LP, now: number) {
    const sim = this.sim;
    const [big, small] = sim.m[A.i] >= sim.m[B.i] ? [A, B] : [B, A];
    const oran = sim.m[small.i] / sim.m[big.i];
    const birlesti = oran > 0.25;
    // En düşük çarpma hızı: karşılıklı kaçış hızı √(2G(m1+m2)/(R1+R2)) (SI)
    const m = (VERI[big.g].kutle + VERI[small.g].kutle) * 1e24, R = (VERI[big.g].yaricap + VERI[small.g].yaricap) * 1e3;
    const vImp = Math.sqrt((2 * 6.674e-11 * m) / R) / 1000;
    const cx = (big.sx + small.sx) / 2, cy = (big.sy + small.sy) / 2;
    this.fx.colorBurst(projectPoints(small.body, 3), cx, cy, 520, 4);
    this.fx.colorBurst(Array.from({ length: 200 }, () => [cx + (Math.random() - 0.5) * small.rpx, cy + (Math.random() - 0.5) * small.rpx, 255, 120 + Math.random() * 100, 30]), cx, cy, 650, 4.5);
    this.fx.shake = 1;
    this.flashAt = now;
    this.sfx.collision();
    sim.absorb(big.i, small.i);
    sim.held[big.i] = big.heldBy && big.detached ? 1 : 0; // büyük gezegen elde ise el tutmaya devam eder
    small.gone = 'carpisti';
    for (const s of this.hst.values()) if (s.holding === small) { s.holding = null; s.blocked = true; }
    small.heldBy = null;
    big.hot = 1;
    big.kmK = Math.cbrt(1 + Math.pow(VERI[small.g].yaricap / VERI[big.g].yaricap, 3) * (birlesti ? 1 : 0.15));
    if (!birlesti) {
      const cols: string[] = [];
      for (let i = 0; i < 40; i++) { const k = Math.floor((Math.random() * small.cols.length) / 3) * 3; cols.push(`rgb(${small.cols[k]},${small.cols[k + 1]},${small.cols[k + 2]})`); }
      for (let i = 0; i < 20; i++) cols.push(`rgb(255,${130 + Math.floor(Math.random() * 90)},40)`);
      this.disks.push(new DebrisDisk(big.body, cols, Math.atan2(small.sy - big.sy, small.sx - big.sx), now));
      setTimeout(() => this.sfx.gather(), 500);
    }
    this.rope = null; this.compare = null; this.pred = null;
    this.setBanner(birlesti ? 'ÇARPIŞMA · BİRLEŞME' : 'ÇARPIŞMA', `${VERI[big.g].ad} + ${VERI[small.g].ad} · çarpma hızı ≥ ${S.sayi(vImp, 1)} km/s · kütle oranı ${S.sayi(oran, oran < 0.1 ? 3 : 2)}`, 'rgb(255,150,80)', now, 7000);
    this.hooks.say(S.carpisma(big.g, small.g, vImp, birlesti));
    this.quietUntil = now + 5000;
    this.log(`${VERI[big.g].ad} ile ${VERI[small.g].ad} çarpıştı (≥ ${S.sayi(vImp, 1)} km/s); ${birlesti ? 'erimiş tek gezegende birleştiler' : 'enkaz diski oluştu'}`);
  }

  // ---------------------------------------------------------------- Zaman

  private setPaused(p: boolean, now: number) {
    this.paused = p;
    this.setBanner(p ? '⏸ ZAMAN DURDU' : `${hizAd(HIZLAR[this.hizIdx])}`, '', H.CYAN, now, 1800);
    this.sfx.confirm();
  }

  private advance(now: number, dt: number) {
    if (this.tween) {
      const t = (now - this.tween.at) / 1500;
      if (t >= 1) {
        this.sim = this.tween.next;
        this.date = this.tween.date1;
        this.hooks.say(this.tween.say);
        this.tween = null;
      }
      return;
    }
    if (this.paused) return;
    const days = HIZLAR[this.hizIdx] * dt;
    const r = this.sim.advance(days / YIL_GUN);
    this.date += (days - r.left * YIL_GUN) * DAY_MS;
    for (const i of r.fell) {
      const lp = this.planets.find(p => p.i === i);
      if (!lp || lp.gone) continue;
      lp.gone = 'dustu';
      this.flashAt = now;
      this.fx.shockwave(this.view.cx, this.view.cy, this.sunPx() * 1.2, '255,200,90');
      this.setBanner("GÜNEŞ'E DÜŞTÜ", `${VERI[lp.g].ad} · kütlesi ve momentumu Güneş'e eklendi`, 'rgb(255,170,80)', now, 5000);
      this.hooks.say(S.dustuSoz(lp.g));
      this.log(`${VERI[lp.g].ad} Güneş'e düştü`);
      this.sfx.boom();
    }
  }

  /** Simülasyonu bir tarihe kur (anında) */
  private loadDate(ms: number) {
    this.date = ms;
    this.sim = sistem(new Date(ms));
    this.disks = []; this.moons = [];
    this.planets = GEZEGENLER.map(g => this.makeLP(g));
    this.pred = null; this.rope = null; this.compare = null; this.section = null;
    this.ayYok = false;
    for (const s of this.hst.values()) { s.holding = null; s.kesitOf = null; s.blocked = true; }
  }

  /** "2030'a git": gezegenler o tarihteki gerçek yerlerine akar (1,5 sn) */
  private goDate(ms: number, now: number, say: string) {
    const from = new Map<number, { x: number; y: number }>();
    for (const p of this.planets) if (!p.gone) from.set(p.i, { x: p.sx, y: p.sy });
    const date0 = this.date;
    this.loadDate(ms);
    this.date = date0;
    this.tween = { from, next: this.sim, date0, date1: ms, at: now, say };
    this.sfx.warp();
  }

  // ---------------------------------------------------------------- Konumlar, yüzey hâlleri

  private sunPx() { return clamp(this.view.K * 0.2, 12, 64); }

  private positions(now: number, dt: number) {
    const sim = this.sim, v = this.view, base = this.basePx();
    const tw = this.tween ? ease((now - this.tween.at) / 1500) : 1;
    for (const p of this.planets) {
      if (p.gone) continue;
      const i = p.i;
      p.rpx = govdePx(VERI[p.g].yaricap * p.kmK, base);
      p.grow += ((p.heldBy ? 1.7 : 1) - p.grow) * (1 - Math.exp(-dt * 8));
      const rx = sim.x[i] - sim.x[0], ry = sim.y[i] - sim.y[0];
      p.r = Math.hypot(rx, ry, sim.z[i] - sim.z[0]);
      if (!p.detached) {
        let { X, Y } = v.ekran(rx, ry);
        if (this.tween) {
          const f = this.tween.from.get(i);
          if (f) {
            // Güneş çevresinde açıyla akış
            const a0 = Math.atan2(f.y - v.cy, f.x - v.cx), r0 = Math.hypot(f.x - v.cx, f.y - v.cy);
            const a1 = Math.atan2(Y - v.cy, X - v.cx), r1 = Math.hypot(X - v.cx, Y - v.cy);
            let da = a1 - a0;
            const fwd = this.tween.date1 >= this.tween.date0;
            da = fwd ? (da > 0 ? da - Math.PI * 2 : da) : (da < 0 ? da + Math.PI * 2 : da); // ekranda saat yönünün tersi = ileri (y aşağı)
            const a = a0 + da * tw, rr = r0 + (r1 - r0) * tw;
            X = v.cx + Math.cos(a) * rr; Y = v.cy + Math.sin(a) * rr;
          }
        }
        if (p.off) {
          const t = (now - p.off.at) / 900;
          if (t >= 1) p.off = null;
          else { X += p.off.dx * (1 - ease(t)); Y += p.off.dy * (1 - ease(t)); }
        }
        p.sx = X; p.sy = Y;
      }
      p.Tc = yuzeyC(p.g, p.r);
      p.durum = durumOf(p.g, p.Tc);
      // Renk geçişi
      const target = durumRenk(p.g as Govde, p.g === 'venus' && p.durum !== 'buz' ? 'su' : p.durum);
      if (target !== p.to) { p.from = p.cols.slice(); p.to = target; p.blend = 0; }
      if (p.blend < 1) {
        p.blend = Math.min(1, p.blend + dt / 0.8);
        const k = ease(p.blend), a = p.from, b = p.to, c = p.cols;
        for (let j = 0; j < c.length; j++) c[j] = a[j] + (b[j] - a[j]) * k;
      }
      const heat = Math.max(p.hot, p.durum === 'kizgin' && p.g !== 'venus' ? 0.7 : 0);
      p.body.heat += (heat - p.body.heat) * (1 - Math.exp(-dt * 3));
      if (p.hot > 0) p.hot = Math.max(0, p.hot - dt / 8);
      // Açılış: gezegenler ekranın dışından sarmal çizerek yerlerine uçar
      const ik = this.introK(GEZEGENLER.indexOf(p.g), this.introT(now));
      if (ik < 1) {
        const dx = p.sx - v.cx, dy = p.sy - v.cy, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx) - 1.2 * (1 - ik);
        const R0 = Math.max(this.W, this.H) * 0.8, rr = R0 + (d - R0) * ik;
        p.sx = v.cx + Math.cos(a) * rr; p.sy = v.cy + Math.sin(a) * rr;
      }
      p.body.fade = ik;
      p.body.ambient = this.scan.oda ? 0.42 : 0.13;
      p.body.x = p.body.tx = p.sx; p.body.y = p.body.ty = p.sy;
      p.body.light = this.isik(p.sx, p.sy);
      p.body.r = p.body.tr = p.rpx * p.grow;
      p.body.yaw += 0.3 * Math.sign(HIZLAR[this.hizIdx]) * (this.paused ? 0 : 1) * dt * (p.g === 'venus' ? -0.4 : 1);
      // Kaçtı mı?
      if (!p.heldBy && p.r > KACIS_AU) {
        p.gone = 'kacti';
        sim.gone[i] = 1; sim.dirty = true;
        this.setBanner('GÜNEŞ SİSTEMİNDEN KAÇTI', `${VERI[p.g].ad} · ${KACIS_AU} AU'yu geçti`, 'rgb(255,120,120)', now, 5000);
        this.hooks.say(S.kactiSoz(p.g));
        this.log(`${VERI[p.g].ad} Güneş sisteminden kaçtı`);
      }
      // Yörünge (oskülasyon elipsi), 0,4 sn'de bir
      if (now - p.orbitAt > 400) { p.orbitAt = now; p.el = sim.elements(i); p.orbit = this.orbitPath(p.el); }
      // Yanına dev kondu: basıklık izlenir
      if (p.watch && !p.watch.said && p.el && p.el.e > p.watch.e0 + 0.05) {
        p.watch.said = true;
        this.setBanner('YÖRÜNGE BOZULDU', `${VERI[p.g].ad} · e ${S.sayi(p.watch.e0, 2)} → ${S.sayi(p.el.e, 2)} · ${VERI[p.watch.by].ad} çekimi`, 'rgb(255,190,90)', now, 5000);
        this.hooks.say(`${VERI[p.g].adIn} yörüngesi bozuldu efendim: basıklık ${S.sayi(p.watch.e0, 2)}'den ${S.sayi(p.el.e, 2)}'e çıktı.`);
        this.log(`${VERI[p.g].adIn} yörüngesi ${VERI[p.watch.by].ad} yüzünden bozuldu (e ${S.sayi(p.watch.e0, 2)} → ${S.sayi(p.el.e, 2)})`);
      }
    }
    // Güneş ve Ay
    this.sun.x = this.sun.tx = v.cx; this.sun.y = this.sun.ty = v.cy;
    // Açılış: Güneş tutuşur (sıfırdan biraz taşarak büyür)
    const st = this.introT(now);
    this.sun.r = this.sun.tr = this.sunPx() * (st >= 1 ? 1 : Math.max(0.001, easeBackL(clamp((st - 0.1) / 0.26, 0, 1))));
    this.moon.ambient = this.scan.oda ? 0.42 : 0.13;
    this.moon.fade = this.introK(2, st);
    this.sun.yaw += dt * 0.12;
    const earth = this.lp('dunya');
    if (earth && !earth.gone && !this.ayYok) {
      const { aci } = ayYonu(new Date(this.date));
      const R = earth.rpx * earth.grow * 3.2;
      this.moon.x = earth.sx + Math.cos(aci) * R; this.moon.y = earth.sy - Math.sin(aci) * R * v.basik;
      this.moon.r = Math.max(2.4, earth.rpx * earth.grow * 0.32);
      this.moonBehind = Math.sin(aci) > 0;
      this.moon.light = this.isik(this.moon.x, this.moon.y);
    }
  }

  /** Tarama girdisi: cismin (uyduysa gezegeninin) Güneş'e uzaklığı ve simülasyondaki yüzey sıcaklığı */
  girdi(c: Cisim): TaramaGirdi | null {
    const pg = ebeveyn(c), lp = this.lp(pg);
    if (!lp || lp.gone || (c === 'ay' && this.ayYok)) return null;
    return { r: lp.r, Tc: c === pg ? lp.Tc : uyduC(c, lp.r), degisti: lp.moved, ayYok: this.ayYok };
  }

  /** Cismin ekrandaki yeri (tarama oradan büyüyerek başlar) */
  private ekrandaCisim(c: Cisim): { x: number; y: number; r: number } {
    const q = this.odakK > 0.5 ? this.odakPos.find(o => o.c === c) : null;
    if (q) return { x: q.x, y: q.y, r: q.r };
    if (c === 'ay' && !this.ayYok) return { x: this.moon.x, y: this.moon.y, r: this.moon.r };
    const lp = this.lp(ebeveyn(c));
    return lp ? { x: lp.sx, y: lp.sy, r: lp.rpx * lp.grow * (c === lp.g ? 1 : 0.4) } : { x: this.W / 2, y: this.H / 2, r: 10 };
  }

  private lp(g: Govde | Cisim | null): LP | null { return g ? this.planets.find(p => p.g === g) ?? null : null; }

  /** Yörünge elipsi → ekran noktaları */
  private orbitPath(el: Elements): Float32Array | null {
    if (!el.bound || el.a > 60) return null;
    const N = 160, out = new Float32Array(N * 2), p = el.a * (1 - el.e * el.e);
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2;
      const r = p / (1 + el.e * Math.cos(th));
      const { X, Y } = this.view.ekran(Math.cos(th + el.w) * r, Math.sin(th + el.w) * r);
      out[k * 2] = X; out[k * 2 + 1] = Y;
    }
    return out;
  }

  // ---------------------------------------------------------------- Sesli komutlar

  /** Sesli komut. Dönen söz, komutun anlatımı ve animasyonu bitince çözülür (zincirleme komutlar bekler). */
  command(cmd: SpaceCmd, now: number): Promise<void> | void {
    const say = (t: string) => this.sayP(t);
    switch (cmd.tip) {
      case 'sifirla':
      case 'temizle':
        this.scan.stop();
        this.odak = null;
        this.goDate(Date.now(), now, LAB_ONAY.sifirla);
        this.hizIdx = HIZ_VARSAYILAN; this.paused = false;
        this.zoomX = ZOOM_IC; this.autoZoom = false;
        this.log('Laboratuvar sıfırlandı (bugünkü gökyüzü)');
        this.hafiza.sifirla();
        return;
      case 'tarih': {
        const cur = new Date(this.date);
        const d = cmd.fark !== undefined
          ? Date.UTC(cur.getUTCFullYear() + cmd.fark, cur.getUTCMonth(), cur.getUTCDate(), 12)
          : Date.UTC(cmd.yil, (cmd.ay ?? 1) - 1, cmd.gun ?? 1, 12);
        const ms = clamp(d, Date.UTC(1700, 0, 1), Date.UTC(2400, 0, 1));
        this.goDate(ms, now, S.tarihSoz(new Date(ms)));
        this.hizIdx = HIZ_VARSAYILAN; this.paused = false;
        this.log(`Tarihe gidildi: ${new Date(ms).toISOString().slice(0, 10)}`);
        return;
      }
      case 'zaman': {
        const i = this.hizIdx;
        if (cmd.islem === 'durdur') { this.setPaused(true, now); say(LAB_ONAY.durdu); return; }
        if (cmd.islem === 'devam') { this.setPaused(false, now); say(LAB_ONAY.devam); return; }
        if (cmd.islem === 'hizlandir') this.hizIdx = HIZLAR[i] < 0 ? HIZ_VARSAYILAN : Math.min(HIZLAR.length - 1, i + 1);
        else if (cmd.islem === 'yavaslat') this.hizIdx = HIZLAR[i] < 0 ? Math.min(HIZ_VARSAYILAN - 2, i + 1) : Math.max(4, i - 1);
        else this.hizIdx = HIZLAR[i] > 0 ? 3 : Math.max(0, i - 1);
        this.paused = false;
        this.setBanner(hizAd(HIZLAR[this.hizIdx]), '', H.CYAN, now, 1800);
        say(LAB_ONAY.hiz[this.hizIdx]);
        return;
      }
      case 'yasanabilir':
        this.hz = cmd.goster;
        say(cmd.goster ? LAB_ONAY.ybAc : LAB_ONAY.ybKapat);
        return;
      case 'gorunum':
      case 'sistem':
        this.autoZoom = false;
        this.odak = null;
        this.zoomX = cmd.tip === 'gorunum' && cmd.ic ? ZOOM_IC : 1;
        return say(this.zoomX > 1.5 ? LAB_ONAY.ic : LAB_ONAY.tum);
      case 'odak': {
        if (cmd.govde === 'gunes') { this.odak = null; this.zoomX = ZOOM_IC; return say(LAB_ONAY.ic); }
        const c = cmd.govde as Cisim, pg = ebeveyn(c), lp = this.lp(pg);
        if (!lp || lp.gone) return say(LAB_ONAY.yok);
        this.odak = pg;
        this.selected = c === 'ay' && this.ayYok ? pg : c;
        this.log(`${VERI[pg].ad} sistemine yakınlaşıldı`);
        this.sfx.solar();
        return say(`${VERI[pg].ad}${UYDU_SAY[pg] ? ` ve ${UYDU_SAY[pg]}` : ''}, efendim.`);
      }
      case 'kaldir': {
        if (cmd.govde !== 'ay') return say("Şimdilik yalnızca Ay'ı kaldırabilirim efendim.");
        if (this.ayYok) return say('Ay zaten yok efendim.');
        this.ayYok = true;
        if (this.selected === 'ay') this.selected = 'dunya';
        this.fx.shockwave(this.moon.x, this.moon.y, this.moon.r * 2, '200,210,230');
        this.setBanner('AY KALDIRILDI', 'gelgitler ≈ üçte birine iner (yalnızca Güneş gelgiti) · eksen eğikliği daha az kararlı olabilir', H.CYAN, now, 6000);
        this.log("Ay kaldırıldı (gelgitler yalnızca Güneş'ten, ≈ üçte bir)");
        this.hafiza.olay({ tip: 'kaldir', cisim: 'ay', metin: "Ay'ı kaldırdık" });
        // Güneş gelgiti Ay'ınkinin ≈ 0,46'sı: Ay yoksa toplam gelgit ≈ 0,46 / 1,46 ≈ üçte bir. Eğiklik: Laskar 1993, Lissauer 2012.
        return say("Ay kaldırıldı efendim. Gelgitler yaklaşık üçte birine iner; Dünya'nın eksen eğikliği daha az kararlı olabilir.");
      }
      case 'tara': {
        if (cmd.hedef === 'gunes') return say("Güneş'te yaşam aranmaz efendim; yüzeyi yaklaşık 5.500 derece.");
        const list: Cisim[] = cmd.hedef === 'odak' ? bolgeCisimleri(this.odak) : [(cmd.hedef as Cisim | null) ?? this.selected];
        const items: ScanItem[] = [];
        for (const c of list) {
          const gi = this.girdi(c);
          if (!gi) continue;
          const lp = this.lp(c);
          const t = tara(c, gi);
          // Hafızadan samimi, bağlamlı cümleler (bölge taramasında hızlı)
          const ks = kisisellestir(t, this.hafiza, cmd.hizli || list.length > 1);
          if (cmd.hizli || list.length > 1) t.hizliCumleler = ks; else t.cumleler = ks;
          items.push({ t, from: this.ekrandaCisim(c), colors: lp ? lp.cols : colorsOf(c as Govde) });
        }
        if (!items.length) return say(LAB_ONAY.yok);
        this.selected = list[0];
        this.card = null;
        this.log(`Yaşam izi taraması: ${items.map(i => `${i.t.ad} (ESI ${S.sayi(i.t.esi, 2)})`).join(', ')}`);
        return this.scan.start(items, cmd.hizli, !!cmd.surucu, now);
      }
      case 'kilo':
        this.kg = cmd.kg;
        try { localStorage.setItem('jarvis.lab.kilo', String(cmd.kg)); } catch { /* yok */ }
        say(`Tamam efendim, ${cmd.kg} kilo.`);
        return;
      case 'yaklastir': {
        const p = this.lp(cmd.govde);
        if (!p || p.gone) { say(LAB_ONAY.yok); return; }
        const sim = this.sim;
        const ang = Math.atan2(sim.y[p.i] - sim.y[0], sim.x[p.i] - sim.x[0]);
        const r = clamp(p.r * (cmd.yakin ? 0.8 : 1.25), 0.06, 40);
        this.place(p, r, ang);
        this.selected = p.g;
        this.hafiza.olay({ tip: 'yaklastir', cisim: p.g, metin: cmd.yakin ? "Güneş'e biraz daha yakına" : "Güneş'ten biraz daha uzağa" });
        return this.settled(p, r, now);
      }
      case 'tasi': {
        const A = this.lp(cmd.govde), B = this.lp(cmd.hedef);
        if (!A || !B || A === B || A.gone || B.gone) { say(LAB_ONAY.yok); return; }
        const sim = this.sim;
        const angA = Math.atan2(sim.y[A.i] - sim.y[0], sim.x[A.i] - sim.x[0]), rA = A.r;
        const angB = Math.atan2(sim.y[B.i] - sim.y[0], sim.x[B.i] - sim.x[0]), rB = B.r;
        this.selected = A.g;
        if (cmd.yanina) {
          // Aynı yörüngede 7° önde (aynı yörüngeyi paylaşırlar)
          this.place(A, rB, angB + 0.12);
          B.watch = { e0: sim.elements(B.i).e, said: false, by: A.g };
          A.watch = { e0: sim.elements(A.i).e, said: false, by: B.g };
          this.hafiza.olay({ tip: 'tasi', cisim: A.g, metin: `${VERI[B.g].adIn} yanına` });
          const k = VERI[A.g].kutle / VERI[B.g].kutle;
          const t = `${VERI[A.g].ad} ${VERI[B.g].adIn} yanında efendim. Kütlesi ${VERI[B.g].adIn} ${k >= 1 ? S.sayi(k, k < 10 ? 1 : 0) + ' katı' : 'yüzde ' + S.sayi(k * 100)}; ikisi aynı yörüngede birbirini çekiştirecek.`;
          this.setBanner(`${VERI[A.g].ad.toLocaleUpperCase('tr')} → ${VERI[B.g].ad.toLocaleUpperCase('tr')} YANINA`, `${S.sayi(rB, 2)} AU · kütle oranı ${S.sayi(k, k < 10 ? 2 : 0)}`, H.CYAN, now, 5000);
          this.log(`${VERI[A.g].ad} ${VERI[B.g].adIn} yanına kondu (${S.sayi(rB, 2)} AU)`);
          this.sfx.planet();
          return say(t);
        } else {
          // Yer değiştirirler
          this.place(A, rB, angB);
          this.place(B, rA, angA);
          this.hafiza.olay({ tip: 'tasi', cisim: A.g, metin: `${VERI[B.g].adIn} yörüngesine` });
          this.hafiza.olay({ tip: 'tasi', cisim: B.g, metin: `${VERI[A.g].adIn} eski yörüngesine` });
          return this.settled(A, rB, now);
        }
      }
      case 'mesaj': {
        const A = this.lp(cmd.kaynak), B = this.lp(cmd.hedef);
        if (!A || !B || A === B || A.gone || B.gone) { say(LAB_ONAY.yok); return; }
        const held = this.planets.filter(p => p.heldBy);
        const rope: Rope = this.rope && held.length === 2 ? this.rope : { a: A, b: B, at: now, pulseAt: null, until: now + 12000, said: true, arrived: false };
        rope.pulseAt = now; rope.arrived = false;
        this.rope = rope;
        const { lt } = this.ropeNumbers(rope.a, rope.b);
        say(S.mesaj(rope.a.g, rope.b.g, lt));
        this.log(`${VERI[rope.a.g].ad} → ${VERI[rope.b.g].ad} mesaj: ışık ${S.sureSoz(lt)}`);
        this.sfx.confirm();
        return;
      }
      case 'karsilastir': {
        const held = this.planets.filter(p => p.heldBy).map(p => p.g as Cisim);
        const ok = (x: Govde | null): Cisim | null => (x && x !== 'gunes' ? x : null);
        const a: Cisim = ok(cmd.a) ?? held[0] ?? 'dunya';
        let b: Cisim = ok(cmd.b) ?? held[1] ?? (this.selected !== a ? this.selected : a === 'dunya' ? 'mars' : 'dunya');
        if (b === a) b = a === 'dunya' ? 'mars' : 'dunya';
        this.openCompare(a, b, now, now + 10000, true);
        return;
      }
      case 'kesit': {
        const g = (cmd.govde && cmd.govde !== 'gunes' ? cmd.govde : this.selected) as Cisim;
        if (g !== 'ay') this.selected = g;
        this.openSection(g, now, now + 11000, null);
        return;
      }
      case 'gezegen':
      case 'bilgi': {
        const g = cmd.tip === 'gezegen' ? cmd.govde : cmd.konu;
        if (g !== 'gunes' && g !== 'karadelik') {
          const c = g as Cisim, pg = ebeveyn(c);
          // Uydu: gezegenine yakınlaş, uyduyu seç
          if (c !== pg && !(c === 'ay' && this.ayYok)) this.odak = pg;
          if (this.lp(pg)) { this.selected = c; this.card = { g: c, until: now + 7000 }; }
        }
        return say(cmd.tip === 'bilgi' ? BILGI[cmd.konu] : ONAY.govde(g as Govde));
      }
      default:
        return;
    }
  }

  /** Güneş'ten gelen ışığın yönü (gövde çizicisinin görüş çerçevesinde; biraz bize doğru ki evreler görünsün) */
  private isik(x: number, y: number): number[] {
    const dx = this.view.cx - x, dy = -(this.view.cy - y), d = Math.hypot(dx, dy) || 1;
    const z = 0.45, n = Math.hypot(1, z);
    return [dx / d / n, dy / d / n, z / n];
  }

  private setBanner(baslik: string, alt: string, renk: string, now: number, dur: number) { this.banner = { baslik, alt, renk, at: now, dur }; }
  private log(e: string) { this.events.push(e); if (this.events.length > 8) this.events.shift(); }

  /** Jarvis'in sohbet aracıyla başlayan taramada cevabın sahne sırası */
  drive(i: number, bitti: boolean) { this.scan.driveTo(i, bitti); }

  /** Jarvis'e gönderilen bağlam (sohbet isteğine eklenir) */
  context(): object {
    const tarih = new Date(this.date).toISOString().slice(0, 10);
    return {
      ekran: 'Uzay Laboratuvarı (El Kontrolü)',
      tarih,
      zaman: this.paused ? 'durdu' : hizAd(HIZLAR[this.hizIdx]),
      secili: VERI[this.selected].ad,
      model: 'Başlangıç konumları gerçek (astronomy-engine), sonrası N-cisim simülasyonu. Yüzey sıcaklığı = denge sıcaklığı + gezegenin bugünkü sera farkı (atmosfer sabit kabul edilir). Yaşanabilir bölge Kopparapu 2013: 0,99-1,70 AU.',
      kullanici_kilo: this.kg,
      gezegenler: this.planets.map(p => ({
        ad: VERI[p.g].ad,
        ...(p.gone ? { durum: p.gone === 'kacti' ? 'Güneş sisteminden kaçtı' : p.gone === 'dustu' ? "Güneş'e düştü" : 'çarpışmada yok oldu' } : {
          uzaklik_AU: +p.r.toFixed(3),
          yuzey_C: Math.round(p.Tc),
          yuzey: S.durumAd(p.g, p.durum),
          yasanabilir_bolgede: ybMi(p.r),
          basiklik: p.el ? +p.el.e.toFixed(3) : null,
          donem_gun: p.el?.bound ? Math.round(p.el.P * YIL_GUN) : null,
          degistirildi: p.moved,
        }),
      })),
      son_olaylar: this.events,
      yakinlasilan: this.odak ? VERI[this.odak].ad : null,
      ay_kaldirildi: this.ayYok,
      jarvis_hafizasi: this.hafiza.ozet(),
      bolge: bolgeCisimleri(this.odak).map(c => VERI[c].ad),
      // Yaşam izi taraması: her cisim için hesaplanmış sonuç (yasam_izi_tara aracı bunu kullanır)
      yasam_taramasi: Object.fromEntries((Object.keys(VERI) as Cisim[]).flatMap(c => {
        const gi = this.girdi(c);
        return gi ? [[c, { ...ozet(tara(c, gi)), ad: VERI[c].ad }]] : [];
      })),
    };
  }

  /** Demo için: gezegenin ekrandaki yeri */
  screenOf(g: Gezegen): { x: number; y: number; r: number } | null {
    const p = this.lp(g);
    return p && !p.gone ? { x: p.sx, y: p.sy, r: p.rpx * p.grow } : null;
  }
  /** Demo için: gezegenin yönünde r AU'nun ekrandaki yeri */
  screenAt(g: Gezegen, r: number): { x: number; y: number } {
    const p = this.lp(g)!, s = this.sim;
    const a = Math.atan2(s.y[p.i] - s.y[0], s.x[p.i] - s.x[0]);
    const q = this.view.ekran(Math.cos(a) * r, Math.sin(a) * r);
    return { x: q.X, y: q.Y };
  }

  onGesture(h: TrackedHand, now: number) { if (h.gesture === 'yumruk') h.fistSince = now; }

  // ---------------------------------------------------------------- Çizim

  private render(now: number, dt: number, hands: TrackedHand[]) {
    const g = this.g, { W, H: Hh } = this, v = this.view, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, Hh);
    if (this.fx.shake > 0) { const m = this.fx.shake * 10; g.translate((Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2); }
    const showUi = this.cekim !== 'yok';
    const heldLP = this.planets.find(p => p.heldBy && p.detached);

    // Yaşanabilir bölge
    if (this.hz) {
      const r0 = v.yaricap(YB_IC), r1 = v.yaricap(YB_DIS), b = v.basik;
      const inside = heldLP ? ybMi(heldLP.r) : false;
      g.save();
      g.globalAlpha = clamp((this.introT(now) - 0.68) / 0.2, 0, 1);
      g.beginPath();
      g.ellipse(v.cx, v.cy, r1, r1 * b, 0, 0, Math.PI * 2);
      g.ellipse(v.cx, v.cy, r0, r0 * b, 0, 0, Math.PI * 2, true);
      g.fillStyle = inside ? 'rgba(90,255,150,0.16)' : 'rgba(90,255,150,0.065)';
      g.fill();
      g.setLineDash([4, 6]);
      g.strokeStyle = inside ? 'rgba(120,255,170,0.8)' : 'rgba(120,255,170,0.35)';
      g.lineWidth = 1;
      g.beginPath(); g.ellipse(v.cx, v.cy, r0, r0 * b, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(v.cx, v.cy, r1, r1 * b, 0, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      if (showUi) {
        g.fillStyle = 'rgba(140,255,180,0.95)'; g.font = '700 13px Rajdhani, sans-serif'; g.textAlign = 'center';
        if (this.scan.oda) { g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 5; }
        g.fillText('YAŞANABİLİR BÖLGE · 0,99–1,70 AU', v.cx, v.cy - r1 * b - 6);
      }
      g.restore();
    }

    // Yörüngeler (açılışta sırayla kendini çizer; oda modunda altında koyu çizgiyle belirgin)
    const it = this.introT(now), oda = this.scan.oda;
    g.save();
    for (const p of this.planets) {
      if (p.gone || !p.orbit || (p.heldBy && p.detached)) continue;
      const o = p.orbit, sel = p.g === this.selected;
      const frac = it >= 1 ? 1 : clamp((it - (0.24 + 0.045 * GEZEGENLER.indexOf(p.g))) / 0.34, 0, 1);
      if (frac <= 0) continue;
      const n = Math.max(2, Math.floor((o.length / 2) * frac));
      const yol = () => { g.beginPath(); g.moveTo(o[0], o[1]); for (let k = 1; k < n; k++) g.lineTo(o[k * 2], o[k * 2 + 1]); if (frac >= 1) g.closePath(); };
      if (oda) { g.strokeStyle = 'rgba(0,8,16,0.45)'; g.lineWidth = sel ? 4 : 3; yol(); g.stroke(); }
      g.strokeStyle = sel ? `rgba(150,230,255,${oda ? 0.95 : 0.5})` : p.moved ? `rgba(255,200,120,${oda ? 0.8 : 0.35})` : `rgba(150,210,255,${oda ? 0.55 : 0.16})`;
      g.lineWidth = sel ? 1.8 : oda ? 1.3 : 1;
      yol(); g.stroke();
    }
    g.restore();

    // Tahmin: noktalı yol
    const pr = this.pred;
    if (pr && !pr.lp.gone) {
      const age = (now - pr.at) / 1000;
      const a = pr.live ? 1 : Math.max(0, 1 - age / 5);
      if (!pr.live && a <= 0) this.pred = null;
      else if (pr.live && !(pr.lp.heldBy && pr.lp.detached)) this.pred = null;
      else {
        g.save();
        g.globalAlpha = a;
        const col = pr.t?.sonuc === 'kacti' ? 'rgba(255,130,130,0.9)' : pr.t?.sonuc === 'dustu' ? 'rgba(255,180,90,0.9)' : 'rgba(150,240,255,0.9)';
        g.fillStyle = col;
        if (pr.circle !== null) {
          const R = v.yaricap(pr.circle);
          for (let k = 0; k < 120; k++) {
            const th = (k / 120) * Math.PI * 2 + now / 3000;
            g.beginPath(); g.arc(v.cx + Math.cos(th) * R, v.cy + Math.sin(th) * R * v.basik, 1.4, 0, Math.PI * 2); g.fill();
          }
        } else if (pr.t) {
          const pts = pr.t.pts;
          for (let k = 0; k < pts.length; k += 2) {
            const q = v.ekran(pts[k], pts[k + 1]);
            if (q.X < -50 || q.Y < -50 || q.X > W + 50 || q.Y > Hh + 50) continue;
            g.beginPath(); g.arc(q.X, q.Y, 1.6, 0, Math.PI * 2); g.fill();
          }
        }
        g.restore();
      }
    }

    // Işık ipi
    if (this.rope) this.renderRope(g, now);

    // Güneş, gezegenler (uzaktakiler önce), Ay
    if (it < 1 && it > 0.1) {
      // Tutuşma parlaması
      const fk = clamp((it - 0.1) / 0.3, 0, 1), fa = Math.sin(Math.PI * fk);
      const gr = g.createRadialGradient(v.cx, v.cy, 0, v.cx, v.cy, this.sunPx() * 6);
      gr.addColorStop(0, `rgba(255,230,170,${0.55 * fa})`); gr.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = gr; g.fillRect(v.cx - this.sunPx() * 6, v.cy - this.sunPx() * 6, this.sunPx() * 12, this.sunPx() * 12);
    }
    this.renderer.draw(g, this.sun, now, dpr);
    const order = this.planets.filter(p => !p.gone && !(this.section?.lp === p)).sort((a, b) => a.sy - b.sy);
    const earth = this.lp('dunya');
    const moonBehind = this.moonBehind;
    for (const p of order) {
      if (p === earth && moonBehind && !earth.gone) this.renderer.draw(g, this.moon, now, dpr);
      for (const d of this.disks) if (d.parent === p.body) d.render(g, now, false);
      if (oda && p.body.fade > 0.05) this.plaka(g, p.sx, p.sy, p.rpx * p.grow, p.body.fade, p.g === this.selected);
      this.renderer.draw(g, p.body, now, dpr);
      for (const d of this.disks) if (d.parent === p.body) d.render(g, now, true);
      if (p === earth && !moonBehind && !earth.gone) this.renderer.draw(g, this.moon, now, dpr);
    }
    // Enkaz diskleri → uydu
    for (const d of [...this.disks]) {
      d.update(dt, now);
      if (d.done) {
        this.disks = this.disks.filter(x => x !== d);
        const moon = new Body('ay', d.parent.x, d.parent.y, d.parent.r * 0.27, now);
        moon.form = 0.6;
        moon.orbit = { parent: d.parent, R: d.moonR, ang: d.moonA, w: d.moonW };
        this.moons.push(moon);
      }
    }
    for (const m of this.moons) {
      const o = m.orbit!;
      o.ang += o.w * dt;
      const q = orbitPos(o.parent, o.R, o.ang);
      m.x = m.tx = q.x; m.y = m.ty = q.y; m.r = m.tr = Math.max(2, o.parent.r * 0.27);
      m.form = Math.min(1, m.form + dt);
      this.renderer.draw(g, m, now, dpr);
    }

    // Ad etiketleri
    if (showUi) {
      g.save();
      g.textAlign = 'center'; g.textBaseline = 'top';
      if (oda) { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 4; }
      for (const p of order) {
        const sel = p.g === this.selected;
        g.globalAlpha = p.body.fade;
        g.font = `${sel ? 700 : 600} ${sel ? 15 : oda ? 14 : 12}px Rajdhani, sans-serif`;
        g.fillStyle = sel ? 'rgba(223,251,255,0.98)' : oda ? 'rgba(223,245,255,0.92)' : 'rgba(190,225,240,0.7)';
        g.fillText(VERI[p.g].ad.toLocaleUpperCase('tr'), p.sx, p.sy + p.rpx * p.grow + (p.g === 'saturn' ? p.rpx * 0.9 : 4));
      }
      g.restore();
    }

    // Sürüklenen gezegenin altındaki gezegen: bırak = yer değiştir, hızla vur = çarpış
    for (const st of this.hst.values()) {
      const T = st.hedef, A = st.holding;
      if (!T || !A || !showUi) continue;
      const R = T.rpx * T.grow + 12 + 4 * Math.sin(now / 120);
      g.save();
      g.strokeStyle = 'rgba(255,220,120,0.9)'; g.lineWidth = 2; g.setLineDash([8, 6]); g.lineDashOffset = -now / 30;
      g.beginPath(); g.arc(T.sx, T.sy, R, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(3,12,18,0.8)'; g.font = '700 15px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      const t1 = `BIRAK: ${VERI[A.g].ad.toLocaleUpperCase('tr')} ⇄ ${VERI[T.g].ad.toLocaleUpperCase('tr')}`, t2 = 'HIZLA VUR: ÇARPIŞTIR';
      const w = Math.max(g.measureText(t1).width, g.measureText(t2).width) + 18;
      // Ekranın üstüne yakınsa etiket gezegenin altına
      const by = T.sy - R - 46 < 70 ? T.sy + R + 6 : T.sy - R - 46;
      g.fillRect(T.sx - w / 2, by, w, 40);
      g.fillStyle = 'rgb(255,225,150)'; g.fillText(t1, T.sx, by + 20);
      g.fillStyle = 'rgba(255,170,120,0.95)'; g.font = '600 13px Rajdhani, sans-serif'; g.fillText(t2, T.sx, by + 37);
      g.restore();
    }

    // Tutulan gezegenin yanında canlı sıcaklık
    if (heldLP && showUi) {
      const p = heldLP;
      const renk = p.durum === 'su' ? 'rgb(120,255,170)' : p.durum === 'buz' ? 'rgb(170,220,255)' : p.durum === 'kaynayan' || p.durum === 'kizgin' ? 'rgb(255,150,90)' : H.TEXT;
      const right = p.sx < W - 260;
      H.etiket(g, p.sx + (right ? 1 : -1) * (p.rpx * p.grow + 18), p.sy, [
        [`${S.sayi(p.r, 2)} AU · ≈ ${S.sayi(Math.round(p.Tc))} °C`, H.TEXT],
        [S.durumAd(p.g, p.durum) + (ybMi(p.r) ? ' · yaşanabilir bölge' : ''), renk],
      ], 1, right);
    }

    // Karşılaştırma
    if (this.compare) this.renderCompare(g, now);

    // Çarpışma parlaması
    const fa = (now - this.flashAt) / 600;
    if (fa < 1) { g.save(); g.globalAlpha = (1 - fa) * 0.6; g.fillStyle = fa < 0.15 ? '#fff' : 'rgb(255,190,120)'; g.fillRect(-20, -20, W + 40, Hh + 40); g.restore(); }

    // Gezegene yakınlaşma (uydular)
    if (this.odakK > 0.01) this.renderOdak(g, now);
    // Kesit (yakınlaşma görünümünün üstünde)
    if (this.section) this.renderSection(g, now);
    // İki elle yakınlaştırma göstergesi
    if (this.pinchZoom?.mod === 'zoom') this.renderPinchZoom(g);
    // Göstergeler
    this.renderHud(g, now, hands);
    // Yaşam izi taraması (her şeyin üstünde)
    this.scan.render(g, now, W, Hh, this.renderer, dpr);
    // Açılış animasyonu
    if (this.intro !== null) this.renderIntro(g, now);

    // Dinliyor: ✌️ elinin çevresinde dalga
    if (this.listening) {
      const h = hands.find(x => x.id === this.micHand) ?? hands[0];
      const p = h ? h.shape.palm : { x: W / 2, y: Hh * 0.8 };
      const base = h ? h.shape.size : 60;
      g.save();
      for (let i = 0; i < 3; i++) {
        const k = ((now / 1000) * 0.9 + i / 3) % 1;
        g.strokeStyle = `rgba(95,242,255,${(1 - k) * 0.8})`; g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, base * (0.8 + k * 1.6), 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
  }

  /** Gezegene yakınlaşma: gezegen ortada büyür, uyduları gerçek yönlerinde (Satürn'ünkiler ≈), uzaklıklar sıkıştırılmış */
  private renderOdak(g: CanvasRenderingContext2D, now: number) {
    const pg = this.odak ?? this.odakSon;
    const lp = pg ? this.lp(pg) : null;
    this.odakPos = [];
    if (!pg || !lp || lp.gone) return;
    const k = ease(this.odakK), v = this.view, s = H.guvenliAlan(this.W, this.H);
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2 + 10;
    const uydular = (UYDU_LISTE[pg] ?? []).filter(u => !(u === 'ay' && this.ayYok));
    const Rk = VERI[pg].yaricap;
    const f = (u: Uydu | 'ay') => 1.6 + 0.55 * Math.sqrt(UYDU_YORUNGE[u].a / Rk);
    const fmax = Math.max(1.4, ...uydular.map(f));
    const half = Math.min((s.x1 - s.x0) / 2, (s.y1 - s.y0) / 2 / v.basik);
    const Rp = uydular.length ? Math.min(Math.min(this.W, this.H) * 0.13, (half * 0.9) / fmax) : Math.min(this.W, this.H) * 0.22;
    g.save();
    // Oda modunda odayı kapatmadan, hafif perde
    g.globalAlpha = (this.scan.oda ? 0.45 : 0.9) * k;
    g.fillStyle = 'rgb(2,6,10)';
    g.fillRect(-20, -20, this.W + 40, this.H + 40);
    g.restore();
    const date = new Date(this.date);
    const light = this.isik(lp.sx, lp.sy);
    type Q = { c: Cisim; body: Body; x: number; y: number; behind: boolean; yaklasik: boolean };
    const qs: Q[] = [];
    g.save();
    g.globalAlpha = k;
    for (const u of uydular) {
      const { aci, yaklasik } = u === 'ay' ? { aci: ayYonu(date).aci, yaklasik: false } : uyduAcisi(u, date);
      const Ro = Rp * f(u);
      g.strokeStyle = u === this.selected ? 'rgba(150,220,255,0.55)' : 'rgba(150,200,255,0.2)';
      g.lineWidth = 1;
      g.setLineDash(yaklasik ? [4, 5] : []);
      g.beginPath(); g.ellipse(cx, cy, Ro, Ro * v.basik, 0, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      let b = this.uyduBody.get(u);
      if (!b) { b = new Body(u as Govde, 0, 0, 5, now); b.form = 1; this.uyduBody.set(u, b); }
      b.x = b.tx = cx + Math.cos(aci) * Ro; b.y = b.ty = cy - Math.sin(aci) * Ro * v.basik;
      b.r = b.tr = Math.max(4, Rp * 0.9 * Math.sqrt(VERI[u].yaricap / Rk));
      b.light = light;
      b.yaw += 0.002;
      qs.push({ c: u, body: b, x: b.x, y: b.y, behind: Math.sin(aci) > 0, yaklasik });
    }
    const pb = lp.body, sx = pb.x, sy = pb.y, sr = pb.r;
    const px = lp.sx + (cx - lp.sx) * k, py = lp.sy + (cy - lp.sy) * k, pr = lp.rpx + (Rp - lp.rpx) * k;
    this.odakMerkez = { x: cx, y: cy, R: Rp };
    for (const q of qs) if (q.behind) this.renderer.draw(g, q.body, now, this.dpr);
    pb.x = px; pb.y = py; pb.r = pr;
    this.renderer.draw(g, pb, now, this.dpr);
    pb.x = sx; pb.y = sy; pb.r = sr;
    for (const q of qs) if (!q.behind) this.renderer.draw(g, q.body, now, this.dpr);
    // Etiketler
    g.textAlign = 'center'; g.textBaseline = 'top';
    this.odakPos.push({ c: pg, x: px, y: py, r: pr });
    for (const q of qs) {
      this.odakPos.push({ c: q.c, x: q.x, y: q.y, r: q.body.r });
      const sel = q.c === this.selected;
      if (sel) { g.strokeStyle = H.CYAN; g.lineWidth = 1.5; g.beginPath(); g.arc(q.x, q.y, q.body.r + 6, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = sel ? H.TEXT : 'rgba(190,225,240,0.8)'; g.font = `${sel ? 700 : 600} ${sel ? 18 : 15}px Rajdhani, sans-serif`;
      g.fillText(VERI[q.c].ad.toLocaleUpperCase('tr') + (q.yaklasik ? ' ≈' : ''), q.x, q.y + q.body.r + 6);
    }
    if (this.cekim !== 'yok') {
      g.fillStyle = H.CYAN; g.font = '700 26px Rajdhani, sans-serif';
      g.fillText(`${VERI[pg].ad.toLocaleUpperCase('tr')} SİSTEMİ`, cx, s.y0 + 4);
      g.fillStyle = H.DIM; g.font = '500 14px Rajdhani, sans-serif';
      const not = qs.some(q => q.yaklasik) ? 'uydu uzaklıkları sıkıştırılmış · ≈ konum temsili (dönem gerçek)' : qs.length ? 'uydu uzaklıkları sıkıştırılmış · konumlar gerçek' : 'bu gezegende yaşam adayı uydu yok';
      g.fillText(not, cx, s.y0 + 34);
      // Yönergeler (alt orta)
      g.fillStyle = 'rgba(223,251,255,0.85)'; g.font = '600 15px Rajdhani, sans-serif'; g.textBaseline = 'alphabetic';
      g.fillText(`🤏 sürükle: döndür   ·   🤏🤏 elleri aç: kesit   ·   🤏🤏 elleri kapat: geri${qs.length ? '   ·   🤏 uyduya dokun: seç' : ''}`, cx, s.y1 - 4);
    }
    g.restore();
  }

  /** Açılış: merkezden halka patlaması, köşe kıskaçları, tarama çizgisi, harf harf çözülen başlık */
  private renderIntro(g: CanvasRenderingContext2D, now: number) {
    const t = this.introT(now), { W, H: Hh } = this, v = this.view;
    const out = 1 - clamp((t - 0.78) / 0.22, 0, 1);
    if (out <= 0) return;
    g.save();
    g.globalAlpha = out;
    // Açılışta kısa karartma (oda görünür kalır)
    g.fillStyle = `rgba(2,8,16,${0.35 * (1 - clamp(t / 0.4, 0, 1))})`;
    g.fillRect(0, 0, W, Hh);
    // Halka patlaması
    for (let i = 0; i < 3; i++) {
      const k = clamp((t - i * 0.07) / 0.45, 0, 1);
      if (k <= 0 || k >= 1) continue;
      const R = easeOut(k) * Math.max(W, Hh) * 0.75;
      g.strokeStyle = `rgba(95,242,255,${0.7 * (1 - k)})`; g.lineWidth = 2.5 - i * 0.6;
      g.beginPath(); g.ellipse(v.cx, v.cy, R, R * v.basik, 0, 0, Math.PI * 2); g.stroke();
    }
    gearRing(g, v.cx, v.cy, 60 + 260 * easeOut(t / 0.5), t * 2, 96, 6, `rgba(95,242,255,${0.5 * (1 - clamp(t / 0.6, 0, 1))})`, 12);
    segArcs(g, v.cx, v.cy, 40 + 200 * easeOut(t / 0.45), -t * 3, 6, 0.5, 3, `rgba(95,242,255,${0.6 * (1 - clamp(t / 0.55, 0, 1))})`);
    // Tarama çizgisi (yukarıdan aşağı)
    const ly = Hh * clamp(t / 0.5, 0, 1);
    if (t < 0.5) {
      const gr = g.createLinearGradient(0, ly - 30, 0, ly + 4);
      gr.addColorStop(0, 'rgba(95,242,255,0)'); gr.addColorStop(1, 'rgba(95,242,255,0.5)');
      g.fillStyle = gr; g.fillRect(0, ly - 30, W, 34);
    }
    // Köşe kıskaçları ekranın köşelerinden içeri
    const S = H.guvenliAlan(W, Hh), k = easeOut(clamp(t / 0.35, 0, 1)), L = 46;
    g.strokeStyle = 'rgba(95,242,255,0.9)'; g.lineWidth = 2.5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const fx = sx < 0 ? 0 : W, fy = sy < 0 ? 0 : Hh, tx = sx < 0 ? S.x0 : S.x1, ty = sy < 0 ? S.y0 : S.y1;
      const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k;
      g.beginPath(); g.moveTo(x, y - sy * L); g.lineTo(x, y); g.lineTo(x - sx * L, y); g.stroke();
    }
    // Başlık
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 8;
    g.fillStyle = H.CYAN; g.font = '700 44px Rajdhani, sans-serif';
    g.fillText(decode('UZAY LABORATUVARI', (t - 0.04) / 0.32, 17), W / 2, S.y0 + 36);
    g.fillStyle = 'rgba(223,251,255,0.9)'; g.font = '600 18px Rajdhani, sans-serif';
    g.fillText(decode(`GÜNEŞ SİSTEMİ · ${new Date(this.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).toLocaleUpperCase('tr')} · GERÇEK KONUMLAR`, (t - 0.2) / 0.35, 29), W / 2, S.y0 + 74);
    g.restore();
  }

  /** Oda modunda gezegenin arkasına koyu disk ve ince parlak kenar: aydınlık odada kaybolmasın */
  private plaka(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, sel: boolean) {
    g.save();
    g.globalAlpha = a;
    const gr = g.createRadialGradient(x, y, r * 0.9, x, y, r * 1.9);
    gr.addColorStop(0, 'rgba(0,6,14,0.55)'); gr.addColorStop(1, 'rgba(0,6,14,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = sel ? 'rgba(120,240,255,0.95)' : 'rgba(170,225,255,0.55)'; g.lineWidth = sel ? 2 : 1.2;
    g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  private renderPinchZoom(g: CanvasRenderingContext2D) {
    const { a, b } = this.pinchZoom!;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    g.save();
    g.strokeStyle = 'rgba(95,242,255,0.7)'; g.lineWidth = 1.5; g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    for (const q of [a, b]) { g.beginPath(); g.arc(q.x, q.y, 10, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(3,12,18,0.8)'; g.fillRect(mx - 44, my - 16, 88, 32);
    g.fillStyle = H.CYAN; g.font = '700 20px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`× ${S.sayi(this.zoomX, 1)}`, mx, my);
    g.restore();
  }

  private renderRope(g: CanvasRenderingContext2D, now: number) {
    const r = this.rope!;
    if (r.a.gone || r.b.gone) { this.rope = null; return; }
    const { d, lt, hoh } = this.ropeNumbers(r.a, r.b);
    const ax = r.a.sx, ay = r.a.sy, bx = r.b.sx, by = r.b.sy;
    g.save();
    g.strokeStyle = 'rgba(255,240,170,0.35)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = 'rgba(255,245,200,0.95)'; g.lineWidth = 1.5;
    g.setLineDash([10, 8]); g.lineDashOffset = -now / 40;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.setLineDash([]);
    // Mesaj darbesi: gerçek ışık süresi ekranda ölçeklenir (en az 1,5, en çok 6 sn)
    let prog: number | null = null;
    if (r.pulseAt !== null) {
      const dur = clamp((lt / 60) * 0.3, 1.5, 6) * 1000;
      prog = (now - r.pulseAt) / dur;
      if (prog <= 1) {
        const x = ax + (bx - ax) * prog, y = ay + (by - ay) * prog;
        const gr = g.createRadialGradient(x, y, 0, x, y, 18);
        gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(1, 'rgba(255,230,150,0)');
        g.fillStyle = gr; g.fillRect(x - 18, y - 18, 36, 36);
      } else if (prog < 1.6) {
        const k = (prog - 1) / 0.6;
        g.strokeStyle = `rgba(255,240,180,${1 - k})`; g.lineWidth = 2;
        g.beginPath(); g.arc(bx, by, r.b.rpx * r.b.grow + 6 + k * 40, 0, Math.PI * 2); g.stroke();
        if (!r.arrived) { r.arrived = true; this.sfx.confirm(); }
      }
    }
    g.restore();
    if (this.cekim === 'yok') return;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const lines: [string, string][] = [
      [`IŞIK ${S.sureSoz(lt).replace(/dakika/, 'dk').replace(/saniye/, 'sn').replace(/saat/, 'sa')}`, 'rgb(255,240,180)'],
      [`${S.sayi(d, 2)} AU · ${S.sayi((d * AU_KM) / 1e6)} milyon km`, H.TEXT],
      [`Hohmann ≈ ${S.gunSoz(hoh)}`, H.DIM],
    ];
    if (prog !== null && prog <= 1) lines.push([`mesaj: ${S.sureSoz(lt * prog)}`, 'rgb(255,240,180)']);
    H.etiket(g, mx + 14, my - 30, lines);
  }

  private renderSection(g: CanvasRenderingContext2D, now: number) {
    const sc = this.section!;
    const alpha = sc.until !== null ? clamp((sc.until - now) / 600, 0, 1) : 1;
    if (sc.until !== null && !sc.lp) sc.open = Math.min(1, sc.open + 0.03);
    g.save();
    g.globalAlpha = alpha;
    // Arka planı biraz karart
    const gr = g.createRadialGradient(sc.x, sc.y, sc.R * 0.8, sc.x, sc.y, sc.R * 3);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(sc.x - sc.R * 3, sc.y - sc.R * 3, sc.R * 6, sc.R * 6);
    sc.body.yaw += 0.004;
    sc.body.fade = alpha;
    drawSection(g, sc.body, sc.g, sc.x, sc.y, sc.R, sc.open, this.renderer, now, this.dpr);
    drawAtmosphere(g, sc.g, sc.x - sc.R * 1.75, sc.y - sc.R * 0.15, Math.min(64, sc.R * 0.42), clamp((sc.open - 0.4) * 2, 0, 1));
    g.globalAlpha = alpha;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = H.CYAN; g.font = '700 22px Rajdhani, sans-serif';
    g.fillText(`${VERI[sc.g].ad.toLocaleUpperCase('tr')} · KESİT`, sc.x, sc.y + sc.R + 16);
    g.fillStyle = H.DIM; g.font = '500 13px Rajdhani, sans-serif';
    g.fillText('katman sınırları gerçek oranlarda · kaynak: NASA, InSight', sc.x, sc.y + sc.R + 42);
    g.restore();
  }

  private renderCompare(g: CanvasRenderingContext2D, now: number) {
    const c = this.compare!;
    const alpha = Math.min(1, (now - c.at) / 300) * (c.until !== null ? clamp((c.until - now) / 500, 0, 1) : 1);
    if (alpha <= 0) return;
    const A = VERI[c.a], B = VERI[c.b];
    const s = H.guvenliAlan(this.W, this.H);
    const w = 440, h = 286, x = (this.W - w) / 2, y = s.y1 - h - 4;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(3,12,18,0.82)'; g.strokeStyle = 'rgba(95,242,255,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill(); g.stroke();
    // Gerçek oranlarda iki disk
    const big = Math.max(A.yaricap, B.yaricap), Rmax = 34;
    const ra = Math.max(1.5, (A.yaricap / big) * Rmax), rb = Math.max(1.5, (B.yaricap / big) * Rmax);
    const col = (gg: Cisim) => (gg === 'ay' ? '#b8b8bc' : gg === 'dunya' ? '#4f8fe0' : gg === 'mars' ? '#d0764a' : gg === 'venus' ? '#e6c890' : gg === 'merkur' ? '#a0a0a0' : gg === 'jupiter' ? '#d8b48a' : gg === 'saturn' ? '#e6cf9a' : gg === 'uranus' ? '#a8e0e8' : '#6f9cf0');
    const cy = y + 46;
    g.fillStyle = col(c.a); g.beginPath(); g.arc(x + w * 0.62, cy, ra, 0, Math.PI * 2); g.fill();
    g.fillStyle = col(c.b); g.beginPath(); g.arc(x + w * 0.86, cy, rb, 0, Math.PI * 2); g.fill();
    g.fillStyle = H.DIM; g.font = '500 11px Rajdhani, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('gerçek boyut oranı', x + 18, cy + 18);
    g.fillStyle = H.CYAN; g.font = '700 20px Rajdhani, sans-serif';
    g.fillText('KARŞILAŞTIR', x + 18, y + 14);
    const rows: [string, string, string][] = [
      ['', A.ad.toLocaleUpperCase('tr'), B.ad.toLocaleUpperCase('tr')],
      ['Yarıçap', `${S.sayi(A.yaricap)} km`, `${S.sayi(B.yaricap)} km`],
      ['Kütle (Dünya = 1)', S.sayi(A.kutle / VERI.dunya.kutle, A.kutle < 1 ? 3 : 2), S.sayi(B.kutle / VERI.dunya.kutle, B.kutle < 1 ? 3 : 2)],
      ['Yüzey çekimi', `${S.sayi(A.cekim, 1)} m/s²`, `${S.sayi(B.cekim, 1)} m/s²`],
      ['Gün', saatAd(A.gun), saatAd(B.gun)],
      ['Yıl', `${S.sayi(A.yil, A.yil < 100 ? 1 : 0)} gün`, `${S.sayi(B.yil, B.yil < 100 ? 1 : 0)} gün`],
      [`${this.kg} kg ağırlık hissi`, `${S.sayi(Math.round((this.kg * A.cekim) / VERI.dunya.cekim))} kg`, `${S.sayi(Math.round((this.kg * B.cekim) / VERI.dunya.cekim))} kg`],
    ];
    rows.forEach(([k, a, b], i) => {
      const ry = y + 92 + i * 26;
      g.font = i === 0 ? '700 13px Rajdhani, sans-serif' : '500 14px Rajdhani, sans-serif';
      g.fillStyle = H.DIM; g.textAlign = 'left'; g.fillText(k, x + 18, ry);
      g.font = i === 0 ? '700 13px Rajdhani, sans-serif' : i === rows.length - 1 ? '700 16px Rajdhani, sans-serif' : '700 15px Rajdhani, sans-serif';
      g.fillStyle = i === rows.length - 1 ? 'rgb(255,230,150)' : H.TEXT; g.textAlign = 'center';
      g.fillText(a, x + w * 0.62, ry); g.fillText(b, x + w * 0.86, ry);
    });
    g.fillStyle = H.DIM; g.font = '500 11px Rajdhani, sans-serif'; g.textAlign = 'left';
    g.fillText('kaynak: NASA NSSDCA', x + 18, y + h - 18);
    g.restore();
  }

  private renderHud(g: CanvasRenderingContext2D, now: number, hands: TrackedHand[]) {
    if (this.cekim === 'yok' || this.scan.active || this.introT(now) < 0.85) return;
    // Oda modunda yazılar aydınlık zeminde okunsun
    g.save();
    if (this.scan.oda) { g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6; }
    this.hudIc(g, now, hands);
    g.restore();
  }

  private hudIc(g: CanvasRenderingContext2D, now: number, hands: TrackedHand[]) {
    const s = H.guvenliAlan(this.W, this.H);
    const tam = this.cekim === 'tam';
    // Sonuç bandı
    const b = this.banner;
    if (b) {
      const t = (now - b.at) / b.dur;
      if (t >= 1) this.banner = null;
      else H.band(g, this.W / 2, s.y0, b.baslik, b.alt, b.renk, Math.min(1, t * 8) * (t > 0.85 ? (1 - t) / 0.15 : 1));
    }
    // Zaman kadranı (elin yanında)
    for (const h of hands) {
      const st = this.hst.get(h.id);
      if (!st?.dial) continue;
      this.renderDial(g, h.shape.pinchPt.x, h.shape.pinchPt.y - h.shape.size * 1.3, h.shape.size * 0.9);
    }
    if (!tam) {
      g.save(); g.fillStyle = H.DIM; g.font = '500 12px Rajdhani, sans-serif'; g.textAlign = 'left';
      g.fillText('mesafeler ölçekli · boyutlar büyütülmüş · basitleştirilmiş model', s.x0, s.y1 + 8);
      g.restore();
      return;
    }
    // Sol alt: tarih, hız, ölçek, dürüstlük
    const d = new Date(this.tween ? this.tween.date0 + (this.tween.date1 - this.tween.date0) * ease((now - this.tween.at) / 1500) : this.date);
    const tarih = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (this.scan.oda) { g.save(); g.shadowBlur = 0; g.fillStyle = 'rgba(2,10,18,0.45)'; g.beginPath(); g.roundRect(s.x0 - 12, s.y1 - 84, 410, 104, 10); g.fill(); g.restore(); }
    H.altBilgi(g, s.x0, s.y1, tarih, this.paused ? '⏸ zaman durdu' : hizAd(HIZLAR[this.hizIdx]), `ölçek: uzaklık ∝ √AU · ${this.zoomX < 1.5 ? 'bütün sistem' : this.zoomX < 6 ? 'iç gezegenler' : 'yakın'} · ×${S.sayi(this.zoomX, 1)}`, this.paused);
    // Sağ üst: ayrıntı kartı ya da seçili gezegen (canlı)
    // Yakınlaşma görünümünde seçili cismin NASA kartı hep açık
    const card = this.odak ? { g: this.selected, until: Infinity } : this.card && now < this.card.until ? this.card : null;
    if (!card) this.card = null;
    const sec: Cisim = card?.g ?? this.selected;
    if (card) {
      const v = VERI[sec], uydu = sec !== ebeveyn(sec);
      H.panel(g, s.x1, s.y0, v.ad.toLocaleUpperCase('tr'), uydu ? 'kaynak: NASA JPL SSD' : 'kaynak: NASA NSSDCA', [
        { k: 'Kütle', v: `${S.sayi(v.kutle, v.kutle < 1 ? 3 : v.kutle < 10 ? 2 : 0)} ×10²⁴ kg` },
        { k: 'Yarıçap', v: `${S.sayi(v.yaricap)} km` },
        { k: 'Yüzey çekimi', v: `${S.sayi(v.cekim, 1)} m/s²` },
        { k: 'Kaçış hızı', v: `${S.sayi(v.kacis, 1)} km/s` },
        { k: 'Gün uzunluğu', v: saatAd(v.gun) },
        { k: 'Yıl', v: `${S.sayi(v.yil, v.yil < 100 ? 1 : 0)} gün` },
        uydu ? { k: `${VERI[ebeveyn(sec)].adIn.replace(/'.*/, "'e")} uzaklık`, v: `${S.sayi(v.uzaklik * 1000)} bin km` } : { k: "Güneş'e uzaklık", v: `${S.sayi(v.uzaklik, 1)} milyon km` },
        { k: 'Ortalama sıcaklık', v: `${S.sayi(v.sicaklik)} °C` },
        { k: 'Bond albedosu', v: S.sayi(v.albedo, 3) },
        { k: 'Yoğunluk', v: `${S.sayi(v.yogunluk)} kg/m³` },
        { k: 'Yüzey basıncı', v: v.basinc === null ? 'yüzey yok' : `${S.sayi(v.basinc, v.basinc < 0.1 ? 3 : 2)} bar` },
      ], 1, 310);
      return;
    }
    // Uydu ya da Ay seçili: gezegeninin uzaklığından canlı sıcaklık
    if (sec !== ebeveyn(sec)) {
      const gi = this.girdi(sec), v = VERI[sec], pg = ebeveyn(sec);
      if (!gi) { H.panel(g, s.x1, s.y0, v.ad.toLocaleUpperCase('tr'), 'laboratuvarda yok', [{ k: 'Geri getirmek', v: '"Jarvis, sıfırla"' }]); return; }
      const yaklasik = sec === 'enceladus' || sec === 'titan';
      H.panel(g, s.x1, s.y0, v.ad.toLocaleUpperCase('tr'), `${VERI[pg].ad} uydusu · canlı hesap`, [
        { k: "Güneş'e uzaklık", v: `${S.sayi(gi.r, 3)} AU` },
        { k: 'Yüzey sıcaklığı (≈)', v: `${S.sayi(Math.round(gi.Tc))} °C`, renk: 'rgb(170,220,255)' },
        { k: 'Yarıçap', v: `${S.sayi(v.yaricap)} km` },
        { k: 'Bir tur', v: `${S.sayi(v.yil, 1)} gün` },
        { k: 'Atmosfer', v: v.basinc ? `${S.sayi(v.basinc, 2)} bar` : 'yok denecek kadar ince' },
        { k: 'Konum', v: yaklasik ? '≈ (dairesel yörünge)' : sec === 'ay' ? 'gerçek' : 'gerçek (astronomy-engine)' },
      ]);
      return;
    }
    const lp = this.lp(sec);
    if (!lp) return;
    const v = VERI[lp.g];
    if (lp.gone) {
      H.panel(g, s.x1, s.y0, v.ad.toLocaleUpperCase('tr'), 'simülasyonda yok', [{ k: 'Durum', v: lp.gone === 'kacti' ? 'Güneş sisteminden kaçtı' : lp.gone === 'dustu' ? "Güneş'e düştü" : 'çarpışmada birleşti' }, { k: 'Geri getirmek', v: '"Jarvis, sıfırla"' }]);
      return;
    }
    const el = lp.heldBy && lp.detached ? null : lp.el;
    const renk = lp.durum === 'su' ? 'rgb(120,255,170)' : lp.durum === 'buz' ? 'rgb(170,220,255)' : lp.durum === 'kaynayan' || lp.durum === 'kizgin' ? 'rgb(255,150,90)' : H.TEXT;
    H.panel(g, s.x1, s.y0, v.ad.toLocaleUpperCase('tr'), lp.moved ? 'değiştirildi · canlı hesap' : 'bugünkü gerçek yörünge · canlı', [
      { k: "Güneş'e uzaklık", v: `${S.sayi(lp.r, 3)} AU · ${S.sayi((lp.r * AU_KM) / 1e6)} mn km` },
      { k: 'Yüzey sıcaklığı (≈)', v: `${S.sayi(Math.round(lp.Tc))} °C`, renk },
      { k: 'Yüzey', v: S.durumAd(lp.g, lp.durum), renk },
      { k: 'Yaşanabilir bölge', v: ybMi(lp.r) ? 'içinde' : lp.r < YB_IC ? 'iç sınırın içinde' : 'dışında', renk: ybMi(lp.r) ? 'rgb(120,255,170)' : undefined },
      { k: 'Basıklık (e)', v: el ? S.sayi(el.e, 3) : '—' },
      { k: 'Bir tur', v: !el ? '—' : el.bound ? S.gunSoz(el.P * YIL_GUN) : 'kaçış yörüngesi' },
      { k: "Güneş'ten ışık", v: S.sureSoz(isikSn(lp.r)).replace(/dakika/, 'dk').replace(/saniye/, 'sn') },
    ]);
  }

  private renderDial(g: CanvasRenderingContext2D, x: number, y: number, R: number) {
    g.save();
    const n = HIZLAR.length;
    g.strokeStyle = 'rgba(95,242,255,0.3)'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, R, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    for (let k = 0; k < n; k++) {
      const a = Math.PI * 1.15 + (k / (n - 1)) * Math.PI * 0.7;
      const on = k === this.hizIdx;
      g.fillStyle = on ? H.CYAN : HIZLAR[k] < 0 ? 'rgba(255,170,120,0.7)' : 'rgba(200,230,240,0.6)';
      g.beginPath(); g.arc(x + Math.cos(a) * R, y + Math.sin(a) * R, on ? 6 : 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = H.TEXT; g.font = '700 15px Rajdhani, sans-serif'; g.textAlign = 'center';
    g.fillText(hizAd(HIZLAR[this.hizIdx]), x, y - R - 14);
    g.fillStyle = H.DIM; g.font = '500 11px Rajdhani, sans-serif';
    g.fillText('bileği çevir', x, y - R + 4);
    g.restore();
  }
}

/** Saat cinsinden gün uzunluğu: "24 sa", "176 gün" */
function saatAd(h: number) { return h < 100 ? `${S.sayi(h, 1)} sa` : `${S.sayi(h / 24, 1)} gün`; }
