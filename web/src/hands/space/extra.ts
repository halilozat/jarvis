// Uzay modu · ekstra sahne: laboratuvar ve gösterinin yanında, gösterişli beş numara.
//  🌙 Kafanızın etrafında Ay (extra/arMoon.ts) · ☄️ Dünya'ya asteroit (extra/asteroid.ts)
//  ☀️ Güneş'in son günleri (extra/redGiant.ts) · 🕳 Gezgin kara delik (extra/rogueBH.ts)
//  ⚫ Ay yerine kara delik (extra/moonHole.ts)
// Numara sesle ("Jarvis, asteroit fırlat"), 1-5 tuşlarıyla ya da üst şeritteki düğmelerle seçilir.
import type { Fx, HoldState } from '../fx';
import type { FaceBox } from '../face';
import type { TrackedHand } from '../gestures';
import type { Sfx } from '../sfx';
import type { SpaceHooks } from './brain';
import type { SpaceCmd } from './commands';
import { ArMoon } from './extra/arMoon';
import { AsteroidStrike } from './extra/asteroid';
import { MoonHole } from './extra/moonHole';
import { RedGiant } from './extra/redGiant';
import { RogueBH } from './extra/rogueBH';
import type { ExtraCtx, ExtraNumara, NumaraAd } from './extra/types';
import { CYAN } from './labHud';
import { setLabProvider } from './labContext';
import { decode } from './mech';
import { BodyRenderer } from './planets';
import type { SpaceScene } from './scene';
import type { PersonCutout } from './segment';
import type { Lens } from './starfield';

export type { NumaraAd };
export const NUMARALAR: { ad: NumaraAd; etiket: string }[] = [
  { ad: 'ay', etiket: '🌙 Ay' }, { ad: 'asteroit', etiket: '☄️ Asteroit' }, { ad: 'kizildev', etiket: '☀️ Kızıl dev' }, { ad: 'karadelik', etiket: '🕳 Kara delik' },
  { ad: 'aykaradelik', etiket: '⚫ Ay → kara delik' },
];

export class ExtraScene implements SpaceScene {
  listening = false;
  numara: NumaraAd = 'ay';
  oda = true;
  demo = false;
  head: FaceBox | null = null;
  cutout: PersonCutout | null = null;
  W = 0; H = 0;
  private dpr = 1;
  private g: CanvasRenderingContext2D;
  private renderer = new BodyRenderer();
  private cur: ExtraNumara | null = null;
  private acikAt = 0;
  private canvas: HTMLCanvasElement;
  private fx: Fx;
  private sfx: Sfx;
  private hooks: SpaceHooks;
  constructor(canvas: HTMLCanvasElement, fx: Fx, sfx: Sfx, hooks: SpaceHooks) {
    this.canvas = canvas; this.fx = fx; this.sfx = sfx; this.hooks = hooks;
    this.g = canvas.getContext('2d')!;
  }

  private ctx(): ExtraCtx {
    return { W: this.W, H: this.H, dpr: this.dpr, renderer: this.renderer, fx: this.fx, sfx: this.sfx, say: t => this.hooks.say(t), oda: this.oda, demo: this.demo, head: this.head, cutout: this.cutout };
  }

  resize(W: number, H: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr); this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
  }

  /** Sahne açıldı: seçili numara başlar */
  open(now: number) {
    this.sec(this.numara, now);
    setLabProvider(() => ({ ekran: 'Uzay modu · ekstra', ...(this.cur?.durum?.() ?? {}) }));
  }

  sec(n: NumaraAd, now: number) {
    this.cur?.stop?.(this.ctx());
    this.numara = n;
    this.cur = n === 'ay' ? new ArMoon() : n === 'asteroit' ? new AsteroidStrike() : n === 'kizildev' ? new RedGiant() : n === 'karadelik' ? new RogueBH() : new MoonHole();
    this.acikAt = now;
    this.sfx.warp();
    this.cur.start(now, this.ctx());
  }

  reset() {
    this.cur?.stop?.(this.ctx());
    this.cur = null;
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    setLabProvider(null);
  }

  lens(now: number): Lens | null { return this.cur?.lens?.(now) ?? null; }

  update(hands: TrackedHand[], now: number, dt: number): { mode: string; holds: HoldState[] } {
    const holds: HoldState[] = [];
    const ctx = this.ctx();
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    if (this.fx.shake > 0) { const m = this.fx.shake * 10; g.translate((Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2); }
    if (this.cur) {
      this.cur.update(hands, now, dt, ctx, holds);
      this.cur.render(g, now, ctx);
      this.baslik(g, now);
    }
    this.fx.render(dt, now, [], holds);
    if (this.listening) this.dinliyor(g, now, hands);
    return { mode: `ekstra · ${NUMARALAR.find(n => n.ad === this.numara)!.etiket.replace(/^\S+\s/, '').toLocaleLowerCase('tr')}`, holds };
  }

  private baslik(g: CanvasRenderingContext2D, now: number) {
    const age = now - this.acikAt;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 6;
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillStyle = 'rgba(223,251,255,0.9)'; g.font = '600 15px Rajdhani, sans-serif';
    g.fillText(this.cur!.ipucu, this.W / 2, this.H - 24);
    // Açılışta ortada büyük başlık, sonra küçülüp sol üst köşeye yerleşir (numaraların kendi göstergelerine yer kalsın)
    const k = Math.min(1, Math.max(0, (age - 1600) / 600)), e = 1 - Math.pow(1 - k, 3);
    const yazi = decode(`EKSTRA · ${this.cur!.ad}`, age / 700, 13);
    g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillStyle = CYAN; g.font = `700 ${Math.round(44 - 24 * e)}px Rajdhani, sans-serif`;
    const w = g.measureText(yazi).width;
    g.globalAlpha = 1 - 0.2 * e;
    g.fillText(yazi, (this.W / 2 - w / 2) * (1 - e) + 30 * e, this.H * 0.42 * (1 - e) + 64 * e);
    g.restore();
  }

  private dinliyor(g: CanvasRenderingContext2D, now: number, hands: TrackedHand[]) {
    const h = hands[0], p = h ? h.shape.palm : { x: this.W / 2, y: this.H * 0.8 }, base = h ? h.shape.size : 60;
    g.save();
    for (let i = 0; i < 3; i++) {
      const k = ((now / 1000) * 0.9 + i / 3) % 1;
      g.strokeStyle = `rgba(95,242,255,${(1 - k) * 0.8})`; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, base * (0.8 + k * 1.6), 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  onGesture(h: TrackedHand, now: number) { if (h.gesture === 'yumruk') h.fistSince = now; }

  /** Sesli komut: numara seçimi ya da açık numaraya iletilir */
  command(cmd: SpaceCmd, now: number): Promise<void> | void {
    if (cmd.tip === 'ekstra' && cmd.numara && cmd.numara !== this.numara) {
      this.sec(cmd.numara, now);
      // Asteroit sesle seçildiyse hemen fırlar; diğerlerinde ek ayar yoksa yalnızca açılır
      if (cmd.numara !== 'asteroit' && cmd.halka === undefined && !cmd.boyutKm && !cmd.yakin && !cmd.kutle) return;
    }
    return this.cur?.command?.(cmd, now, this.ctx());
  }
}
