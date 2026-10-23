// Uzay modunun iki sahnesi aynı arayüzle çalışır: Uzay Laboratuvarı (lab.ts, varsayılan) ve gösteri (brain.ts:
// serbest gezegenler, çarpışma, kara delik). controller.ts eldeki sahneye yönlendirir.
import type { HoldState } from '../fx';
import type { TrackedHand } from '../gestures';
import type { SpaceCmd } from './commands';
import type { Lens } from './starfield';

export interface SpaceScene {
  /** App: mikrofon dinliyor (✌️ elinin çevresinde dalga) */
  listening: boolean;
  resize(W: number, H: number): void;
  /** Sahneden çıkınca her şeyi bırak */
  reset(): void;
  lens(now: number): Lens | null;
  update(hands: TrackedHand[], now: number, dt: number): { mode: string; holds: HoldState[] };
  onGesture(h: TrackedHand, now: number): void;
  command(cmd: SpaceCmd, now: number): void;
}
