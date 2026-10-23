// Uzay modu · ekstra sahne: beş "numara" aynı arayüzle çalışır (kafanızın etrafında Ay, asteroit, Güneş'in son günleri,
// gezgin kara delik, Ay yerine kara delik). extra.ts hangisinin açık olduğunu yönetir.
import type { Fx, HoldState } from '../../fx';
import type { TrackedHand } from '../../gestures';
import type { Sfx } from '../../sfx';
import type { FaceBox } from '../../face';
import type { SpaceCmd } from '../commands';
import type { BodyRenderer } from '../planets';
import type { PersonCutout } from '../segment';
import type { Lens } from '../starfield';

export type NumaraAd = 'ay' | 'asteroit' | 'kizildev' | 'karadelik' | 'aykaradelik';

export interface ExtraCtx {
  W: number; H: number; dpr: number;
  renderer: BodyRenderer;
  fx: Fx; sfx: Sfx;
  /** Jarvis söylesin; söz cümle bitince çözülür */
  say(text: string): Promise<void> | void;
  /** Oda modu: kullanıcının odası görünür */
  oda: boolean;
  demo: boolean;
  /** Kameradaki yüz (kafanın etrafında Ay için) */
  head: FaceBox | null;
  /** Kişi maskesi (Ay kafanın arkasındayken kafa onu kapatır) */
  cutout: PersonCutout | null;
}

export interface ExtraNumara {
  /** Başlık ve alt satırdaki jest ipucu */
  ad: string;
  ipucu: string;
  start(now: number, ctx: ExtraCtx): void;
  update(hands: TrackedHand[], now: number, dt: number, ctx: ExtraCtx, holds: HoldState[]): void;
  render(g: CanvasRenderingContext2D, now: number, ctx: ExtraCtx): void;
  /** Yıldızlar bükülsün (kara delik) */
  lens?(now: number): Lens | null;
  command?(cmd: SpaceCmd, now: number, ctx: ExtraCtx): Promise<void> | void;
  stop?(ctx: ExtraCtx): void;
  /** Jarvis'in sohbet bağlamı için kısa durum */
  durum?(): object;
}
