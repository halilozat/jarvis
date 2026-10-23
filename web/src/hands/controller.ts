// El Kontrolü · beyin: jestleri efektlere ve Jarvis komutlarına çevirir.
import { Fx, GEZEGENLER, Planet, type GezegenTur, type HoldState, type SigilState } from './fx';
import { TrackedHand, type Gesture, type P } from './gestures';
import type { Library } from './library';
import type { SpaceScene } from './space/scene';
import { VARSAYILAN, type ElAyar } from './settings';
import type { Sfx } from './sfx';
import type { RawHand } from './tracker';

// ------------------------------------------------------------------ Jarvis kontrolleri (basılı tut)

export type Eylem =
  | { tip: 'komut'; metin: string } // Jarvis'e sesli komut gibi gider (kendi cevabını seslendirir)
  | { tip: 'isik'; id: string } // akıllı ev ışığını aç/kapat (anında)
  | { tip: 'sustur' }; // Jarvis konuşuyorsa susturur

export interface Kontrol { jest: Gesture; ad: string; sure: number; eylem: Eylem }

/** Jest → Jarvis eylemi. Değiştirmek için bu listeyi düzenleyin. `sure`: kaç ms basılı tutulmalı. */
export const KONTROLLER: Kontrol[] = [
  { jest: 'basparmak', ad: '☕ TÜRK KAHVESİ', sure: 1000, eylem: { tip: 'komut', metin: 'Jarvis, bana bol köpüklü bir Türk kahvesi yap' } },
  { jest: 'zafer', ad: '💡 SALON IŞIĞI', sure: 900, eylem: { tip: 'isik', id: 'salon_isik' } },
  { jest: 'yumruk', ad: '■ SUSTUR', sure: 1800, eylem: { tip: 'sustur' } },
];

// ------------------------------------------------------------------

interface HandFx { fire: number; sigil: number; sigilPos: SigilState | null; holdDone: number; holdFired: number; holdTick: number }

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

export interface Status { hands: { id: string; gesture: Gesture }[]; mode: string }

export class Controller {
  hands = new Map<string, TrackedHand>();
  private hfx = new Map<string, HandFx>();
  private heldBy: string | 'both' | null = null;
  private planetVel: P = { x: 0, y: 0 };
  private lastBoom = -1e9;
  private holds: HoldState[] = [];
  /** Basılı tutma tamamlanınca çağrılır */
  onAction: (k: Kontrol) => void = () => {};
  debug = false;
  /** Kitaplık (varsa): elin değdiği kitap seçilir; kitap dışarıdayken diğer efektler kapalı */
  library: Library | null = null;
  /** Kitap dışarıda (bu karede) */
  private captured = false;
  /** Efekt ayarları (⚙): kapalı efekt tetiklenmez */
  ayar: ElAyar = { ...VARSAYILAN };
  /** Mod: büyü (ateş, mühür, gezegen, şimşek, iz, kitaplık) ya da uzay (laboratuvar ya da gösteri sahnesi). Biri diğerini tetiklemez. */
  mode: 'buyu' | 'uzay' = 'buyu';
  space: SpaceScene | null = null;

  /** Mod değişti: önceki modun efektleri temizlenir */
  setMode(m: 'buyu' | 'uzay') {
    if (m === this.mode) return;
    this.mode = m;
    this.fx.planet = null;
    this.heldBy = null;
    for (const f of this.hfx.values()) { f.fire = 0; f.sigil = 0; f.sigilPos = null; }
    this.sfx.setRoar(0);
    this.space?.reset();
  }
  /** "Sırayla" modunda sıradaki gezegen; sesle istenen tür bir sonraki çimdikte gelir */
  private planetCycle = 0;
  private wantedTur: GezegenTur | null = null;

  /** Yeni gezegenin türü: sesle istenen > ayardaki sabit tür > sırayla */
  private nextTur(): GezegenTur {
    if (this.wantedTur) { const t = this.wantedTur; this.wantedTur = null; return t; }
    if (this.ayar.gezegenTur !== 'sirayla') return this.ayar.gezegenTur;
    return GEZEGENLER[this.planetCycle++ % GEZEGENLER.length].tur;
  }

  /** "Jarvis, Mars yap": eldeki gezegen dönüşür; gezegen yoksa sonraki çimdikte o gelir. true: dönüştü */
  setPlanet(tur: GezegenTur, now: number): boolean {
    const pl = this.fx.planet;
    if (pl) { pl.setTur(tur, now); this.sfx.form(); return true; }
    this.wantedTur = tur;
    return false;
  }

  fx: Fx;
  sfx: Sfx;
  constructor(fx: Fx, sfx: Sfx) { this.fx = fx; this.sfx = sfx; }

  private fxOf(id: string): HandFx {
    let f = this.hfx.get(id);
    if (!f) { f = { fire: 0, sigil: 0, sigilPos: null, holdDone: 0, holdFired: -1, holdTick: 0 }; this.hfx.set(id, f); }
    return f;
  }

  update(raw: RawHand[], now: number, dt: number): Status {
    const fx = this.fx;
    // 1) Elleri güncelle, kaybolanları düşür
    const seen = new Set<string>();
    for (const r of raw) {
      let h = this.hands.get(r.id);
      if (!h) { h = new TrackedHand(r.id); this.hands.set(r.id, h); }
      const { changed } = h.update(r.pts, now, dt);
      seen.add(r.id);
      if (changed) this.onGestureChange(h, now);
    }
    for (const [id, h] of this.hands) {
      if (!seen.has(id) && now - h.lastSeen > 220) { h.reset(); this.hands.delete(id); }
    }
    const live = [...this.hands.values()].filter(h => seen.has(h.id) || now - h.lastSeen < 220);
    // Uzay modu: eller doğrudan uzay beynine gider (büyü efektleri ve kitaplık çalışmaz)
    if (this.mode === 'uzay' && this.space) {
      const r = this.space.update(live, now, dt);
      if (this.debug) for (const h of live) fx.skeleton(h.pts, `${h.id} · ${h.gesture}`);
      return { hands: live.map(h => ({ id: h.id, gesture: h.gesture })), mode: r.mode };
    }
    // Kitaplık önceliklidir: kitap dışarıdayken ateş/mühür/gezegen/şimşek ve basılı tutma kontrolleri kapalı;
    // kitaplık bölgesindeki el çimdikle gezegen OLUŞTURMAZ, kitap seçer.
    const A = this.ayar;
    const lib = A.kitaplik ? this.library?.update(live, now, dt) ?? null : null;
    const cap = this.captured = !!lib?.capture;
    // Raf bölgesindeki el (kitaba uzanıyor): ateş, iz ve şimşek çıkmasın (ayar)
    const quiet = (h: TrackedHand) => A.rafSessiz && !!lib?.zone.has(h.id);
    const both = live.length === 2 ? live : null;
    const twoOpen = A.muhur && !cap && !!both && both.every(h => h.gesture === 'acik');
    const twoPoint = A.simsek && !cap && !!both && both.every(h => h.gesture === 'isaret' && !quiet(h));
    const pinching = cap || !A.gezegen ? [] : live.filter(h => h.gesture === 'cimdik' && (!lib?.zone.has(h.id) || (fx.planet?.held && this.heldBy === h.id)));

    // 2) Ateş ve mühür
    const sigils: SigilState[] = [];
    let roar = 0;
    for (const id of new Set([...this.hfx.keys(), ...live.map(h => h.id)])) {
      const h = this.hands.get(id);
      const f = this.fxOf(id);
      const wantFire = A.ates && !!h && h.gesture === 'acik' && !twoOpen && !cap && !quiet(h);
      const wantSigil = !!h && twoOpen;
      const before = f.fire;
      f.fire = Math.max(0, Math.min(1, f.fire + (wantFire ? dt * 3.5 : -dt * 6)));
      if (before === 0 && f.fire > 0) this.sfx.ignite();
      if (h && f.fire > 0) fx.fireHand(h.pts, h.shape.size, f.fire, dt, h.vel);
      roar = Math.max(roar, f.fire);
      const sb = f.sigil;
      f.sigil = Math.max(0, Math.min(1, f.sigil + (wantSigil ? dt * 2.2 : -dt * 3)));
      if (sb === 0 && f.sigil > 0) this.sfx.sigil();
      if (h && wantSigil) {
        const s = h.shape;
        f.sigilPos = { x: s.palm.x, y: s.palm.y, r: s.size * 2.2, roll: s.roll, squash: Math.max(0.35, s.face), k: f.sigil };
      }
      if (f.sigilPos && f.sigil > 0) {
        f.sigilPos.k = f.sigil;
        sigils.push(f.sigilPos);
        fx.sigilSparks(f.sigilPos, dt);
      }
      if (!h && f.fire === 0 && f.sigil === 0) this.hfx.delete(id);
    }
    this.sfx.setRoar(roar);

    // 3) Gezegen: çimdikle oluştur/tut, iki çimdikle ger, bırakınca süzülür, hızlı bırakınca fırlar
    let pl = fx.planet;
    if (pinching.length === 2 && pl) {
      const [a, b] = pinching;
      pl.held = true;
      this.heldBy = 'both';
      pl.tx = (a.shape.pinchPt.x + b.shape.pinchPt.x) / 2;
      pl.ty = (a.shape.pinchPt.y + b.shape.pinchPt.y) / 2;
      pl.tr = Math.max(30, Math.min(Math.min(fx.W, fx.H) * 0.42, dist(a.shape.pinchPt, b.shape.pinchPt) * 0.36));
      // İki elin arasındaki çizgi eğilince halka da eğilir (soldaki elden sağdakine)
      const [l, r] = a.shape.pinchPt.x < b.shape.pinchPt.x ? [a, b] : [b, a];
      pl.roll = -0.25 + Math.atan2(r.shape.pinchPt.y - l.shape.pinchPt.y, r.shape.pinchPt.x - l.shape.pinchPt.x) * 0.8;
    } else if (pinching.length >= 1) {
      const h = pinching.find(x => x.id === this.heldBy) ?? pinching[0];
      if (!pl && now - this.lastBoom > 700) {
        pl = fx.planet = new Planet(h.shape.pinchPt.x, h.shape.pinchPt.y - h.shape.size * 0.15, h.shape.size * 0.7, now, this.nextTur());
        this.sfx.form();
      }
      if (pl) {
        pl.held = true;
        this.heldBy = h.id;
        pl.tx = h.shape.pinchPt.x;
        pl.ty = h.shape.pinchPt.y - h.shape.size * 0.15;
        pl.roll = -0.25 + h.shape.roll * 0.8;
        pl.spin = 0.6 + Math.max(-2, Math.min(2, h.vel.x * 0.003));
        this.planetVel = { ...h.vel };
      }
    } else if (pl && pl.held) {
      pl.held = false;
      this.heldBy = null;
      // Fırlat: el hızlı hareket ederken bırakıldıysa gezegen o yöne uçar
      if (Math.hypot(this.planetVel.x, this.planetVel.y) < 900) this.planetVel = { x: 0, y: 0 };
    }
    if (pl && !pl.held && (this.planetVel.x || this.planetVel.y)) {
      pl.tx += this.planetVel.x * dt; pl.ty += this.planetVel.y * dt;
      pl.x = pl.tx; pl.y = pl.ty;
      const off = pl.x < -pl.r * 3 || pl.x > fx.W + pl.r * 3 || pl.y < -pl.r * 3 || pl.y > fx.H + pl.r * 3;
      if (off) { fx.planet = null; this.planetVel = { x: 0, y: 0 }; }
    }
    fx.dust(dt);

    // 4) Şimşek ve ışık izi
    if (twoPoint) {
      fx.lightning(both![0].pts[8], both![1].pts[8], 1);
      this.sfx.setCrackle(1);
    }
    for (const h of live) fx.trail(h.id, A.iz && h.gesture === 'isaret' && !twoPoint && !cap && !lib?.zone.has(h.id) ? h.pts[8] : null, now);

    // 5) Basılı tutma kontrolleri
    this.holds = lib?.holds ?? [];
    for (const h of cap || !A.kontroller ? [] : live) {
      const f = this.fxOf(h.id);
      const k = KONTROLLER.find(c => c.jest === h.gesture);
      if (!k || (h.gesture === 'yumruk' && (fx.planet?.held))) { f.holdDone = 0; continue; }
      const p = Math.max(0, (now - h.since - 350) / k.sure); // ilk 350 ms halka görünmez: geçiş jestleri tetiklemesin
      if (p <= 0) continue;
      const fired = f.holdFired === h.since;
      if (!fired && p >= 1) {
        f.holdFired = h.since;
        f.holdDone = 0;
        this.sfx.confirm();
        fx.confirmBurst(h.shape.palm.x, h.shape.palm.y, h.shape.size * 1.25);
        this.onAction(k);
      }
      if (fired) f.holdDone = Math.min(1, f.holdDone + dt * 3);
      else if (Math.floor(p * 8) !== f.holdTick) { f.holdTick = Math.floor(p * 8); this.sfx.tick(p); }
      if (!fired || f.holdDone < 1) this.holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: h.shape.size * 1.25, p: Math.min(1, p), label: k.ad, done: fired ? f.holdDone : 0 });
    }

    // 6) Çiz
    fx.render(dt, now, sigils, this.holds);
    if (this.debug) for (const h of live) fx.skeleton(h.pts, `${h.id} · ${h.gesture}`);

    const mode = lib?.mode ? lib.mode : fx.planet ? (fx.planet.held ? 'gezegen' : 'gezegen · serbest') : twoOpen ? 'mühür' : twoPoint ? 'şimşek' : live.some(h => h.gesture === 'acik') ? 'ateş' : live.length ? 'hazır' : 'el bekleniyor';
    return { hands: live.map(h => ({ id: h.id, gesture: h.gesture })), mode };
  }

  /** Jest değişti: yumruk → açık = patlat, ateş → yumruk = söndür */
  private onGestureChange(h: TrackedHand, now: number) {
    const f = this.fxOf(h.id);
    if (this.mode === 'uzay') { this.space?.onGesture(h, now); return; }
    if (this.captured) return; // kitap açıkken yumruk → açık patlatmaz
    if (h.gesture === 'acik' && h.prevGesture === 'yumruk' && now - h.lastFist < 500) {
      // yumruğun ne kadar sürdüğü: uzun tutulduysa (sustur) patlatma
      const fistLen = h.lastFist - (h.fistSince ?? h.lastFist);
      if (fistLen < 1200 && (this.ayar.patlat || this.fx.planet)) {
        if (this.fx.planet) {
          this.fx.explode(now);
          this.heldBy = null;
        } else {
          this.fx.shockwave(h.shape.palm.x, h.shape.palm.y, h.shape.size * 0.8);
        }
        this.sfx.boom();
        this.lastBoom = now;
        f.fire = 0.01; // patlamadan sonra alev hemen geri gelir (ignite sesi çalmaz)
      }
    }
    if (h.gesture === 'yumruk') {
      h.fistSince = now;
      if (f.fire > 0.3) { this.fx.douse(h.pts, h.shape.size); this.sfx.douse(); }
    }
  }
}
