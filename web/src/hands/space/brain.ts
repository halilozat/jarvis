// Uzay Modu · beyin: jestleri ve sesli komutları gezegenlere, çarpışmaya, Güneş sistemine ve kara deliğe çevirir.
// Büyü modunun efektleri (ateş, mühür, şimşek, iz) burada hiç çalışmaz; controller.ts moda göre yönlendirir.
//
// Jestler: 🤏 gezegen oluştur/tut · tutarken diğer elin parmak sayısı 1-5: Dünya, Mars, Jüpiter, Satürn, Güneş ·
// bileği çevir: döndür · 🤏🤏 tek gezegeni büyüt · iki elde ayrı gezegen (en fazla 3) · hızla çarpıştır: Ay doğar ·
// ✋✋ (elde gezegen yokken): Güneş sistemi · ✊ gezegenin yanında 1,5 sn: kara delik, ✋ söndürür ·
// ✊→✋ hızlı: patlat · ✌️ 0,6 sn: mikrofon
import type { Fx, HoldState } from '../fx';
import type { P, TrackedHand } from '../gestures';
import type { Sfx } from '../sfx';
import { BlackHole } from './blackhole';
import { DebrisDisk, orbitPos } from './collision';
import type { SpaceCmd } from './commands';
import { BILGI, GEZEGEN_SIRASI, GOVDE, ONAY, type Govde } from './facts';
import { Body, BodyRenderer, projectPoints } from './planets';
import { SolarSystem } from './solar';
import type { Lens, Starfield } from './starfield';

export interface SpaceHooks {
  /** Jarvis bu cümleyi seçili sesle söylesin (hazır cümleler önceden yüklenir) */
  say(text: string): void;
  /** ✌️ basılı: mikrofonu aç */
  mic(): void;
}

interface HandSt {
  holding: Body | null;
  /** İki elle büyütme: bu el başka elin tuttuğu gövdeyi geriyor */
  scaleOf: Body | null;
  pinchLost: number | null;
  prevRoll: number | null;
  yawVel: number;
  countCand: number;
  countSince: number;
  micFired: number;
  bhFired: number;
  /** Tuttuğu gövde yok oldu (çarpışma, patlama): çimdiği bırakana kadar yeni bir şey tutmaz */
  blocked: boolean;
}

interface Lineup { at: number; ref: Body; refR: number; items: Body[] }

const MAX_BODIES = 3;
const PARMAK: Record<number, Govde> = { 1: 'dunya', 2: 'mars', 3: 'jupiter', 4: 'saturn', 5: 'gunes' };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export class SpaceBrain {
  bodies: Body[] = [];
  bh: BlackHole | null = null;
  solar: SolarSystem | null = null;
  disks: DebrisDisk[] = [];
  /** Çimdikle oluşacak gövde (varsayılan Dünya; sesle değişir) */
  selected: Govde = 'dunya';
  /** App: mikrofon dinliyor (✌️ elinin çevresinde dalga) */
  listening = false;
  private hst = new Map<string, HandSt>();
  private lineup: Lineup | null = null;
  private flashAt = -1e9;
  private twoOpenSince: number | null = null;
  private notTwoOpenSince: number | null = null;
  private theiaAt: number | null = null;
  private micHand: string | null = null;
  private renderer = new BodyRenderer();
  private g: CanvasRenderingContext2D;
  W = 0; H = 0; private dpr = 1;

  private canvas: HTMLCanvasElement;
  private fx: Fx;
  private sfx: Sfx;
  private stars: Starfield;
  private hooks: SpaceHooks;
  constructor(canvas: HTMLCanvasElement, fx: Fx, sfx: Sfx, stars: Starfield, hooks: SpaceHooks) {
    this.canvas = canvas; this.fx = fx; this.sfx = sfx; this.stars = stars; this.hooks = hooks;
    this.g = canvas.getContext('2d')!;
  }

  resize(W: number, H: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
  }

  lens(now: number): Lens | null { return this.bh ? this.bh.lens(now) : null; }

  /** Mod kapanınca her şeyi bırak */
  reset() {
    this.bodies = []; this.bh = null; this.solar = null; this.disks = []; this.lineup = null;
    this.hst.clear(); this.theiaAt = null;
    this.sfx.blackHole(false);
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private st(id: string): HandSt {
    let s = this.hst.get(id);
    if (!s) { s = { holding: null, scaleOf: null, pinchLost: null, prevRoll: null, yawVel: 0, countCand: 0, countSince: 0, micFired: -1, bhFired: -1, blocked: false }; this.hst.set(id, s); }
    return s;
  }

  /** Sayılan gövdeler (yörüngedeki uydular ve kaybolanlar hariç) */
  private active() { return this.bodies.filter(b => !b.orbit && !b.dying); }

  private baseR(h: TrackedHand | null, g: Govde) {
    const base = h ? h.shape.size * 0.75 : Math.min(this.W, this.H) * 0.16;
    return clamp(base, 24, Math.min(this.W, this.H) * 0.3) * GOVDE[g].olcek;
  }

  private create(g: Govde, x: number, y: number, r: number, now: number): Body | null {
    if (this.active().length >= MAX_BODIES) {
      // En eski serbest gövde yer açar
      const old = this.active().find(b => !b.heldBy);
      if (!old) return null;
      this.dispose(old);
    }
    const b = new Body(g, x, y, r, now);
    this.bodies.push(b);
    this.sfx.planet();
    return b;
  }

  /** Gövdeyi (ve uydularını) yumuşakça kaybet */
  private dispose(b: Body) {
    b.dying = true;
    for (const m of this.bodies) if (m.orbit?.parent === b) m.dying = true;
  }

  private remove(b: Body) {
    this.bodies = this.bodies.filter(x => x !== b && x.orbit?.parent !== b);
    this.disks = this.disks.filter(d => d.parent !== b);
    this.renderer.forget(b.id);
    for (const s of this.hst.values()) {
      if (s.holding === b) { s.holding = null; s.blocked = true; }
      if (s.scaleOf === b) { s.scaleOf = null; s.blocked = true; }
    }
  }

  // ---------------------------------------------------------------- Her kare

  update(hands: TrackedHand[], now: number, dt: number): { mode: string; holds: HoldState[] } {
    const holds: HoldState[] = [];
    const seen = new Set(hands.map(h => h.id));
    for (const id of [...this.hst.keys()]) {
      if (seen.has(id)) continue;
      const s = this.hst.get(id)!;
      if (s.holding) { s.holding.heldBy = null; }
      this.hst.delete(id);
    }

    this.handleHands(hands, now, dt, holds);
    this.twoHands(hands, now);
    this.physics(now, dt);
    this.collisions(now);
    this.blackHoleStep(hands, now, dt);
    if (this.theiaAt !== null && now >= this.theiaAt) { this.theiaAt = null; this.launchTheia(now); }

    this.render(now, dt, hands);
    this.fx.render(dt, now, [], holds);

    const mode = this.bh ? 'uzay · kara delik' : this.disks.length ? 'uzay · ay doğuyor' : this.solar ? 'uzay · güneş sistemi'
      : this.active().length ? `uzay · ${this.active().map(b => GOVDE[b.govde].ad.toLocaleLowerCase('tr')).join(' + ')}` : 'uzay';
    return { mode, holds };
  }

  private handleHands(hands: TrackedHand[], now: number, dt: number, holds: HoldState[]) {
    const anyHeld = this.bodies.some(b => b.heldBy);
    for (const h of hands) {
      const s = this.st(h.id);
      const pinching = h.gesture === 'cimdik';
      if (pinching) {
        s.pinchLost = null;
        if (!s.holding && !s.scaleOf && !s.blocked) this.acquire(h, s, now);
      } else if (s.blocked) s.blocked = false;
      else if (s.holding || s.scaleOf) {
        s.pinchLost ??= now;
        if (now - s.pinchLost > 120) this.release(h, s);
      }
      // Tutulan gövde eli izler; bileği çevirmek gövdeyi döndürür
      if (s.holding) {
        const b = s.holding;
        b.tx = h.shape.pinchPt.x;
        b.ty = h.shape.pinchPt.y - h.shape.size * 0.12;
        const roll = h.shape.roll;
        if (s.prevRoll !== null && dt > 0) {
          let d = roll - s.prevRoll;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          s.yawVel = s.yawVel * 0.8 + (d / dt) * 2.2 * 0.2;
        }
        s.prevRoll = roll;
        b.yaw += s.yawVel * dt;
      } else { s.prevRoll = null; s.yawVel *= 0.9; }

      // ✌️ 0,6 sn: mikrofon (eller boşken)
      if (h.gesture === 'zafer' && !anyHeld && !s.holding) {
        const p = (now - h.since - 150) / 600;
        if (p > 0 && s.micFired !== h.since) {
          if (p >= 1) { s.micFired = h.since; this.micHand = h.id; this.sfx.micOn(); this.hooks.mic(); }
          else holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: h.shape.size * 1.2, p, label: '🎙 DİNLE', done: 0 });
        }
      }

      // ✊ gezegenin yanında 1,5 sn: kara delik
      if (h.gesture === 'yumruk' && !this.bh && !s.holding) {
        const target = this.nearest(h.shape.palm, 3);
        if (target) {
          const p = (now - h.since - 200) / 1500;
          if (p > 0 && s.bhFired !== h.since) {
            if (p >= 1) { s.bhFired = h.since; this.makeBlackHole(h.shape.palm.x, h.shape.palm.y, Math.max(16, target.r * 0.38), now, h.id, target); }
            else holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: h.shape.size * 1.2, p, label: '● KARA DELİK', done: 0 });
          }
        }
      }
    }

    // Tutarken diğer elin parmak sayısı → dönüş (1 Dünya · 2 Mars · 3 Jüpiter · 4 Satürn · 5 Güneş)
    const holders = hands.filter(h => this.st(h.id).holding && !this.st(h.id).scaleOf);
    if (holders.length === 1 && hands.length === 2) {
      const holder = holders[0], other = hands.find(h => h !== holder)!;
      const os = this.st(other.id);
      if (!os.holding && !os.scaleOf && other.gesture !== 'cimdik' && other.gesture !== 'yumruk') {
        const f = other.shape.fingers;
        let n = (f[1] ? 1 : 0) + (f[2] ? 1 : 0) + (f[3] ? 1 : 0) + (f[4] ? 1 : 0);
        if (n === 4 && f[0]) n = 5;
        if (other.gesture === 'acik') n = 5;
        if (n !== os.countCand) { os.countCand = n; os.countSince = now; }
        else if (n >= 1 && now - os.countSince > 350) {
          const b = this.st(holder.id).holding!;
          const g = PARMAK[n];
          if (g && b.govde !== g && !b.morphFrom) {
            b.tr *= GOVDE[g].olcek / GOVDE[b.govde].olcek;
            b.morph(g, now);
            this.sfx.morph();
          }
        }
      }
    }
  }

  /** Çimdik başladı: sistemden gezegen çek, yakındaki gövdeyi tut, iki elle büyüt ya da yeni gövde oluştur */
  private acquire(h: TrackedHand, s: HandSt, now: number) {
    const p = h.shape.pinchPt;
    if (this.solar && this.solar.alpha(now) > 0.5) {
      const b = this.solar.pluck(p.x, p.y);
      if (b) {
        b.heldBy = h.id; s.holding = b;
        b.tr = this.baseR(h, b.govde); b.cardAt = now;
        this.bodies.push(b);
        this.sfx.planet();
        return;
      }
    }
    // Serbest gövde yakında mı?
    let best: Body | null = null, bd = Infinity;
    for (const b of this.active()) {
      if (b.heldBy) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < b.r * 1.3 + 20 && d < bd) { best = b; bd = d; }
    }
    if (best) { best.heldBy = h.id; best.fvx = best.fvy = 0; best.theia = false; s.holding = best; return; }
    // Başka elin tuttuğu tek gövdenin yakınında: iki elle büyüt
    for (const b of this.active()) {
      if (!b.heldBy || b.heldBy === h.id) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r * 2.6 && ![...this.hst.values()].some(o => o.scaleOf === b)) { s.scaleOf = b; return; }
    }
    const b = this.create(this.selected, p.x, p.y - h.shape.size * 0.12, this.baseR(h, this.selected), now);
    if (b) { b.heldBy = h.id; s.holding = b; }
  }

  private release(h: TrackedHand, s: HandSt) {
    const b = s.holding;
    if (b) {
      b.heldBy = null;
      // Hızla bırakılırsa fırlar
      const sp = Math.hypot(h.vel.x, h.vel.y);
      if (sp > 700) { b.fvx = h.vel.x * 0.9; b.fvy = h.vel.y * 0.9; }
      // Bileğin verdiği dönüş ivmeyle sürer, sonra yavaşlar
      b.spin = 0.35 + s.yawVel;
      // Büyüten el varsa tutmayı o devralır
      for (const [id, o] of this.hst) if (o.scaleOf === b) { o.scaleOf = null; o.holding = b; b.heldBy = id; }
    }
    s.holding = null; s.scaleOf = null; s.pinchLost = null;
  }

  /** İki el: büyütme ya da (elde gezegen yokken) ✋✋ Güneş sistemi */
  private twoHands(hands: TrackedHand[], now: number) {
    // İki elle büyüt
    for (const [id, s] of this.hst) {
      if (!s.scaleOf) continue;
      const b = s.scaleOf;
      const a = hands.find(h => h.id === b.heldBy), c = hands.find(h => h.id === id);
      if (!a || !c) continue;
      const pa = a.shape.pinchPt, pc = c.shape.pinchPt;
      b.tr = clamp(dist(pa, pc) * 0.36, 20, Math.min(this.W, this.H) * 0.42);
      b.tx = (pa.x + pc.x) / 2; b.ty = (pa.y + pc.y) / 2;
    }
    const twoOpen = hands.length === 2 && hands.every(h => h.gesture === 'acik') && !this.bodies.some(b => b.heldBy);
    if (twoOpen) {
      this.notTwoOpenSince = null;
      this.twoOpenSince ??= now;
      const [a, b] = hands;
      const cx = (a.shape.palm.x + b.shape.palm.x) / 2, cy = (a.shape.palm.y + b.shape.palm.y) / 2;
      const sc = clamp(dist(a.shape.palm, b.shape.palm) * 0.5, 80, Math.max(this.W, this.H) * 0.48);
      if (!this.solar && now - this.twoOpenSince > 400) {
        this.openSolar(cx, cy, sc, now, false);
      } else if (this.solar && this.solar.fadeAt === null) {
        const k = 0.15;
        this.solar.cx += (cx - this.solar.cx) * k; this.solar.cy += (cy - this.solar.cy) * k;
        this.solar.scale += (sc - this.solar.scale) * k;
      }
    } else {
      this.twoOpenSince = null;
      this.notTwoOpenSince ??= now;
      if (this.solar && !this.solar.pinned && this.solar.fadeAt === null && now - this.notTwoOpenSince > 1200) this.solar.fadeAt = now;
    }
  }

  private openSolar(cx: number, cy: number, scale: number, now: number, pinned: boolean) {
    for (const b of this.active()) if (!b.heldBy) this.dispose(b);
    this.solar = new SolarSystem(cx, cy, scale, now, pinned);
    this.sfx.solar();
  }

  private physics(now: number, dt: number) {
    const k = 1 - Math.exp(-dt * 18);
    for (const b of this.bodies) {
      const px = b.x, py = b.y;
      if (b.orbit) {
        const o = b.orbit;
        o.ang += o.w * dt;
        const pos = orbitPos(o.parent, o.R, o.ang);
        b.x = b.tx = pos.x; b.y = b.ty = pos.y;
        b.r = b.tr = o.parent.r * 0.27;
        if (o.parent.dying) b.dying = true;
      } else if (b.heldBy) {
        b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k;
      } else {
        // Serbest: fırlatma hızıyla gider, yavaşlar; theia hedefe yönelir
        if (b.theia) {
          const earth = this.bodies.find(x => x.govde === 'dunya' && !x.dying && !x.orbit);
          if (earth) {
            const dx = earth.x - b.x, dy = earth.y - b.y, d = Math.hypot(dx, dy) || 1;
            const sp = Math.hypot(b.fvx, b.fvy);
            b.fvx += ((dx / d) * sp - b.fvx) * Math.min(1, dt * 2.5);
            b.fvy += ((dy / d) * sp - b.fvy) * Math.min(1, dt * 2.5);
          }
        } else {
          const damp = Math.exp(-dt * 0.5);
          b.fvx *= damp; b.fvy *= damp;
        }
        b.x += b.fvx * dt; b.y += b.fvy * dt;
        b.tx = b.x; b.ty = b.y;
        if (b.x < -b.r * 4 || b.x > this.W + b.r * 4 || b.y < -b.r * 4 || b.y > this.H + b.r * 4) b.dying = true;
      }
      b.r += (b.tr - b.r) * (1 - Math.exp(-dt * 10));
      if (dt > 0) { b.vx = b.vx * 0.6 + ((b.x - px) / dt) * 0.4; b.vy = b.vy * 0.6 + ((b.y - py) / dt) * 0.4; }
      b.form = Math.min(1, b.form + dt / 0.9);
      b.yaw += b.spin * dt;
      if (!b.heldBy) b.spin += (0.35 - b.spin) * (1 - Math.exp(-dt / 2.5));
      if (b.heat > 0 && now - b.born > 0) b.heat = Math.max(0, b.heat - dt / 6.5);
      if (b.dying) b.fade -= dt * 2.5;
    }
    for (const b of [...this.bodies]) if (b.fade <= 0) this.remove(b);
    // Enkaz diskleri: bitince Ay doğar
    for (const d of [...this.disks]) {
      d.update(dt, now);
      if (d.done) {
        this.disks = this.disks.filter(x => x !== d);
        const P = d.parent;
        if (P.dying) continue;
        const moon = new Body('ay', P.x, P.y, P.r * 0.27, now);
        moon.form = 0.6;
        moon.orbit = { parent: P, R: d.moonR, ang: d.moonA, w: d.moonW };
        this.bodies.push(moon);
        if (P.govde === 'dunya') this.hooks.say(BILGI.theia);
      }
    }
    if (this.solar) {
      this.solar.update(dt, now);
      if (this.solar.done(now)) this.solar = null;
    }
    // Gerçek boyutlar: 4 sn sonra geri dön
    if (this.lineup && now - this.lineup.at > 4400) {
      const l = this.lineup;
      if (!l.ref.dying) l.ref.tr = l.refR;
      this.lineup = null;
    }
  }

  /** İki gövde değince ve göreli hız eşiği aşılınca (ya da theia) çarpışma */
  private collisions(now: number) {
    const act = this.active().filter(b => b.form > 0.7);
    for (let i = 0; i < act.length; i++) {
      for (let j = i + 1; j < act.length; j++) {
        const a = act[i], b = act[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) > (a.r + b.r) * 0.85) continue;
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (rel < 380 && !a.theia && !b.theia) continue;
        this.collide(a, b, now);
        return;
      }
    }
  }

  private collide(a: Body, b: Body, now: number) {
    // Büyük olan hayatta kalır (eşitse Dünya)
    const [big, small] = a.r > b.r * 1.05 || (Math.abs(a.r - b.r) <= b.r * 0.05 && a.govde === 'dunya') ? [a, b] : [b, a];
    const cx = (big.x * small.r + small.x * big.r) / (big.r + small.r), cy = (big.y * small.r + small.y * big.r) / (big.r + small.r);
    const pts = projectPoints(small, 3);
    this.fx.colorBurst(pts, cx, cy, 520, 4.5);
    // Lav ve kopan malzeme
    const lava = Array.from({ length: 260 }, () => [cx + (Math.random() - 0.5) * small.r, cy + (Math.random() - 0.5) * small.r, 255, 120 + Math.random() * 100, 30]);
    this.fx.colorBurst(lava, cx, cy, 700, 5);
    this.fx.shake = 1.2;
    this.flashAt = now;
    this.sfx.collision();
    // Enkaz renkleri: küçük gezegenden + lav + büyüğün yüzeyinden biraz
    const cols: string[] = [];
    for (let i = 0; i < 40; i++) {
      const k = Math.floor(Math.random() * small.colors.length / 3) * 3;
      cols.push(`rgb(${small.colors[k]},${small.colors[k + 1]},${small.colors[k + 2]})`);
    }
    for (let i = 0; i < 20; i++) cols.push(`rgb(255,${130 + Math.floor(Math.random() * 90)},40)`);
    for (let i = 0; i < 15; i++) cols.push('rgb(175,170,165)');
    const impact = Math.atan2((small.y - big.y) / 0.3, small.x - big.x);
    this.disks.push(new DebrisDisk(big, cols, impact, now));
    big.heat = 1;
    small.theia = false;
    this.remove(small);
    setTimeout(() => this.sfx.gather(), 500);
  }

  private nearest(p: P, within: number): Body | null {
    let best: Body | null = null, bd = Infinity;
    for (const b of this.active()) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < b.r * within && d < bd) { best = b; bd = d; }
    }
    return best;
  }

  private makeBlackHole(x: number, y: number, rs: number, now: number, anchor: string | null, eat: Body | null) {
    this.bh = new BlackHole(x, y, rs, now, anchor);
    this.sfx.blackHole(true);
    if (eat) setTimeout(() => this.feed(eat), 350);
  }

  /** Gövde kara deliğe düşer: noktaları spiral akışa döner */
  private feed(b: Body) {
    if (!this.bh || !this.bodies.includes(b)) return;
    this.bh.feed(projectPoints(b, 3));
    for (const m of this.bodies) if (m.orbit?.parent === b) this.bh.feed(projectPoints(m, 4));
    this.remove(b);
  }

  private blackHoleStep(hands: TrackedHand[], now: number, dt: number) {
    const bh = this.bh;
    if (!bh) return;
    bh.update(dt);
    if (bh.dyingAt === null) {
      const hand = bh.anchor ? hands.find(h => h.id === bh.anchor) : null;
      if (bh.anchor) {
        if (hand) {
          bh.lostAt = null;
          bh.x += (hand.shape.palm.x - bh.x) * Math.min(1, dt * 10);
          bh.y += (hand.shape.palm.y - bh.y) * Math.min(1, dt * 10);
          if (hand.gesture === 'acik') this.collapse(now);
        } else {
          bh.lostAt ??= now;
          if (now - bh.lostAt > 2500) this.collapse(now);
        }
      } else if (hands.some(h => h.gesture === 'acik' && Math.hypot(h.shape.palm.x - bh.x, h.shape.palm.y - bh.y) < bh.rs * 3.5)) {
        this.collapse(now);
      }
      // Yakındaki serbest gövdeler içeri çekilir
      for (const b of this.active()) {
        if (b.heldBy) continue;
        const dx = bh.x - b.x, dy = bh.y - b.y, d = Math.hypot(dx, dy) || 1;
        if (d < bh.rs * 2.6) { this.feed(b); continue; }
        if (d < bh.rs * 9) {
          const acc = 2600 * (bh.rs / d);
          b.fvx += (dx / d) * acc * dt; b.fvy += (dy / d) * acc * dt;
        }
      }
    }
    if (bh.done(now)) { this.bh = null; }
  }

  /** ✋: kara delik kısa bir parlamayla küçülüp kaybolur */
  private collapse(now: number) {
    const bh = this.bh;
    if (!bh || bh.dyingAt !== null) return;
    bh.dyingAt = now;
    this.fx.shockwave(bh.x, bh.y, bh.rs * 0.8, '255,190,120');
    this.fx.shake = 0.4;
    this.sfx.blackHole(false);
  }

  /** ✊→✋ hızlı: yakındaki gezegen patlar (controller'dan) */
  onGesture(h: TrackedHand, now: number) {
    if (h.gesture === 'acik' && h.prevGesture === 'yumruk' && now - h.lastFist < 500) {
      const fistLen = h.lastFist - (h.fistSince ?? h.lastFist);
      if (fistLen >= 1200) return;
      if (this.bh?.anchor === h.id) return; // kara deliği söndürmek için açtı
      const b = this.nearest(h.shape.palm, 2.4);
      if (!b) return;
      this.fx.colorBurst(projectPoints(b, 2), b.x, b.y, 900 * (b.r / 100), 5);
      this.fx.shockwave(b.x, b.y, b.r * 0.9, b.govde === 'gunes' ? '255,200,90' : '200,220,255');
      this.sfx.boom();
      this.remove(b);
    }
    if (h.gesture === 'yumruk') h.fistSince = now;
  }

  // ---------------------------------------------------------------- Sesli komutlar

  /** Uzay komutu (mod ve arka plan HandControl'de). Başarılıysa Jarvis kısa bir onay söyler. */
  command(cmd: SpaceCmd, now: number) {
    const say = this.hooks.say;
    const cx = this.W / 2, cy = this.H * 0.48;
    switch (cmd.tip) {
      case 'gezegen': {
        this.selected = cmd.govde;
        const held = this.active().find(b => b.heldBy);
        const target = held ?? (this.active().length >= MAX_BODIES ? this.active()[this.active().length - 1] : null);
        if (target) {
          target.tr *= GOVDE[cmd.govde].olcek / GOVDE[target.govde].olcek;
          target.morph(cmd.govde, now);
          this.sfx.morph();
        } else {
          if (this.solar && !this.solar.pinned) this.solar.fadeAt = now;
          this.create(cmd.govde, cx, cy, this.baseR(null, cmd.govde), now);
        }
        say(ONAY.govde(cmd.govde));
        return;
      }
      case 'bilgi': {
        say(BILGI[cmd.konu]);
        if (cmd.konu !== 'karadelik') for (const b of this.active()) if (b.govde === cmd.konu) b.cardAt = now;
        return;
      }
      case 'sistem':
        this.solar = null;
        this.openSolar(cx, cy, Math.min(this.W, this.H) * 0.46, now, true);
        say(ONAY.sistem);
        return;
      case 'olcek':
        this.startLineup(now);
        say(ONAY.olcek);
        return;
      case 'karadelik': {
        if (this.bh) this.bh = null;
        const target = this.active().sort((a, b) => b.r - a.r)[0] ?? null;
        const rs = Math.max(20, (target?.r ?? Math.min(this.W, this.H) * 0.12) * 0.38);
        const x = target ? clamp(target.x + (target.x > cx ? -1 : 1) * Math.max(target.r * 2.6, 140), rs * 3, this.W - rs * 3) : cx;
        const y = target ? target.y : cy;
        this.makeBlackHole(x, y, rs, now, null, null);
        say(ONAY.karadelik);
        return;
      }
      case 'theia': {
        if (!this.active().some(b => b.govde === 'dunya')) {
          // Dünya yoksa önce ortada oluşur, Theia biraz sonra fırlar
          if (this.solar) this.solar.fadeAt = now;
          this.create('dunya', cx, cy, this.baseR(null, 'dunya'), now);
          this.theiaAt = now + 1100;
        } else this.theiaAt = now + 150;
        say(ONAY.theia);
        return;
      }
      case 'kayan':
        this.stars.shoot(now);
        say(ONAY.kayan);
        return;
      case 'temizle':
        for (const b of this.bodies) b.dying = true;
        if (this.solar) this.solar.fadeAt = now;
        this.disks = [];
        this.lineup = null;
        if (this.bh) this.collapse(now);
        say(ONAY.temizle);
        return;
      default:
        return;
    }
  }

  /** Theia: ekranın kenarından Dünya'ya Mars büyüklüğünde bir gök cismi fırlar (çarpışma kendiliğinden olur) */
  private launchTheia(now: number) {
    const earth = this.active().find(b => b.govde === 'dunya');
    if (!earth) return;
    const left = earth.x > this.W / 2;
    const r = earth.r * 0.55;
    const x0 = left ? -r * 2 : this.W + r * 2, y0 = Math.max(r, earth.y - this.H * 0.28);
    const m = new Body('mars', x0, y0, r, now);
    m.form = 0.85;
    m.theia = true;
    const dx = earth.x - x0, dy = earth.y - y0, d = Math.hypot(dx, dy);
    const sp = Math.max(700, d / 1.1);
    m.fvx = (dx / d) * sp; m.fvy = (dy / d) * sp;
    this.bodies.push(m);
    this.sfx.whoosh();
  }

  /** "Gerçek boyutlarda göster": eldeki (ya da en büyük) gövdenin yanına diğerleri gerçek oranlarla gelir, 4 sn */
  private startLineup(now: number) {
    const ref: Body | null = this.active().find(b => b.heldBy) ?? this.active().sort((a, b) => b.r - a.r)[0]
      ?? this.create('dunya', this.W * 0.3, this.H * 0.5, this.baseR(null, 'dunya'), now);
    if (!ref) return;
    const list = GEZEGEN_SIRASI.filter(g => g !== ref.govde);
    const kmRef = GOVDE[ref.govde].km;
    const maxRatio = Math.max(1, ...list.map(g => GOVDE[g].km / kmRef));
    let s = Math.min(1, (this.H * 0.4) / (ref.tr * maxRatio));
    const right = ref.x < this.W / 2;
    const room = right ? this.W - ref.x - ref.tr * s - 30 : ref.x - ref.tr * s - 30;
    // Satürn'ün halkası gövdesinin ~2,3 katı genişliğinde: ona göre yer ayır
    const half = (g: Govde) => (g === 'saturn' ? 2.3 : 1);
    const need = list.reduce((acc, g) => acc + ref.tr * s * (GOVDE[g].km / kmRef) * 2 * half(g) + 14, 0);
    if (need > room) s *= Math.max(0.15, room / need);
    const refR = ref.tr;
    ref.tr = refR * s;
    let x = right ? ref.x + ref.tr + 24 : ref.x - ref.tr - 24;
    const items: Body[] = [];
    for (const g of list) {
      const r = Math.max(1.5, refR * s * (GOVDE[g].km / kmRef));
      const w = r * half(g);
      x += right ? w : -w;
      const b = new Body(g, x, ref.y, r, now);
      b.form = 0.2;
      items.push(b);
      x += right ? w + 14 : -(w + 14);
    }
    this.lineup = { at: now, ref, refR, items };
    this.sfx.solar();
  }

  // ---------------------------------------------------------------- Çizim

  private render(now: number, dt: number, hands: TrackedHand[]) {
    const g = this.g, { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // Çarpışma sarsıntısı (efekt katmanıyla aynı)
    if (this.fx.shake > 0) {
      const m = this.fx.shake * 12;
      g.translate((Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2);
    }
    const dpr = this.dpr;
    // Güneş sistemi
    if (this.solar) {
      this.solar.renderOrbits(g, now);
      for (const b of this.solar.bodies()) this.renderer.draw(g, b, now, dpr);
    }
    // Uydular arkada, enkaz arkada
    for (const d of this.disks) d.render(g, now, false);
    const moons = this.bodies.filter(b => b.orbit);
    for (const m of moons) if (Math.sin(m.orbit!.ang) < 0) this.renderer.draw(g, m, now, dpr);
    for (const b of this.bodies) if (!b.orbit) this.renderer.draw(g, b, now, dpr);
    for (const m of moons) if (Math.sin(m.orbit!.ang) >= 0) this.renderer.draw(g, m, now, dpr);
    for (const d of this.disks) d.render(g, now, true);
    // Kara delik
    this.bh?.render(g, now);
    // Gerçek boyutlar
    if (this.lineup) this.renderLineup(g, now);
    // Bilgi kartları
    for (const b of this.bodies) if (!b.orbit && now - b.cardAt < 3600) this.card(g, b, now);
    // Çarpışma parlaması
    const fa = (now - this.flashAt) / 600;
    if (fa < 1) {
      g.save();
      g.globalAlpha = (1 - fa) * 0.7;
      g.fillStyle = fa < 0.15 ? '#fff' : 'rgb(255,190,120)';
      g.fillRect(-20, -20, W + 40, H + 40);
      g.restore();
    }
    // Dinliyor: ✌️ elinin çevresinde dalga halkaları
    if (this.listening) {
      const h = hands.find(x => x.id === this.micHand) ?? hands[0];
      const p = h ? h.shape.palm : { x: W / 2, y: H * 0.8 };
      const base = h ? h.shape.size : 60;
      g.save();
      for (let i = 0; i < 3; i++) {
        const k = ((now / 1000) * 0.9 + i / 3) % 1;
        g.strokeStyle = `rgba(95,242,255,${(1 - k) * 0.8})`;
        g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, base * (0.8 + k * 1.6), 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }
    void dt;
  }

  private renderLineup(g: CanvasRenderingContext2D, now: number) {
    const l = this.lineup!;
    const t = (now - l.at) / 4400;
    const a = t < 0.1 ? t / 0.1 : t > 0.88 ? (1 - t) / 0.12 : 1;
    g.save();
    g.font = '600 12px Rajdhani, sans-serif';
    g.textAlign = 'center';
    for (const b of l.items) {
      b.form = Math.min(1, b.form + 0.04);
      b.fade = a;
      b.yaw += 0.01;
      b.y = l.ref.y;
      if (b.r < 3) {
        g.globalAlpha = a;
        g.fillStyle = 'rgb(220,220,230)';
        g.beginPath(); g.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2); g.fill();
      } else this.renderer.draw(g, b, now, this.dpr);
      g.globalAlpha = a * 0.85;
      g.fillStyle = 'rgba(223,251,255,0.9)';
      g.fillText(GOVDE[b.govde].ad.toLocaleUpperCase('tr'), b.x, b.y + Math.max(b.r, 4) + 16);
    }
    g.globalAlpha = a * 0.85;
    g.fillText(GOVDE[l.ref.govde].ad.toLocaleUpperCase('tr'), l.ref.x, l.ref.y + l.ref.r + 16);
    g.globalAlpha = a;
    g.font = '700 15px Rajdhani, sans-serif';
    g.fillStyle = 'rgb(95,242,255)';
    g.fillText('GERÇEK ORANLAR', this.W / 2, 96);
    g.restore();
  }

  /** Bilgi kartı: gövdenin yanında ad + tek satır */
  private card(g: CanvasRenderingContext2D, b: Body, now: number) {
    const t = (now - b.cardAt) / 3600;
    const a = Math.min(1, t * 6) * (t > 0.82 ? (1 - t) / 0.18 : 1) * b.fade * ease(b.form);
    if (a <= 0.01) return;
    const info = GOVDE[b.govde];
    const right = b.x + b.r + 260 < this.W;
    const x = right ? b.x + b.r * 1.05 + 22 : b.x - b.r * 1.05 - 22;
    const y = b.y - b.r * 0.55;
    g.save();
    g.globalAlpha = a;
    g.font = '700 20px Rajdhani, sans-serif';
    const tw1 = g.measureText(info.ad.toLocaleUpperCase('tr')).width;
    g.font = '500 13px Rajdhani, sans-serif';
    const tw2 = g.measureText(info.kart).width;
    const w = Math.max(tw1, tw2) + 28, h = 54;
    const bx = right ? x : x - w;
    g.strokeStyle = 'rgba(95,242,255,0.75)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(right ? b.x + b.r * 0.75 : b.x - b.r * 0.75, b.y - b.r * 0.45); g.lineTo(right ? bx : bx + w, y + 14); g.stroke();
    g.fillStyle = 'rgba(3,12,18,0.78)';
    g.beginPath(); g.roundRect(bx, y - 6, w, h, 8); g.fill(); g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgb(95,242,255)';
    g.font = '700 20px Rajdhani, sans-serif';
    g.fillText(info.ad.toLocaleUpperCase('tr'), bx + 14, y);
    g.fillStyle = 'rgba(223,251,255,0.9)';
    g.font = '500 13px Rajdhani, sans-serif';
    g.fillText(info.kart, bx + 14, y + 26);
    g.restore();
  }
}

