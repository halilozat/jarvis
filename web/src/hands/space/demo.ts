// Uzay Modu · kamerasız demo (?el=demo&mod=uzay). Sentetik ellerle zaman çizelgesi (döngü 40 sn):
// mod geçişi → Dünya oluşur → bilek çevirme → 2 parmak: Mars → diğer elde Dünya → çarpışma → enkaz → Ay →
// Güneş sistemi → (sesle) Satürn → yumruk: kara delik → ✋ söner. Demoda segmentasyon yok, arka plan tamamen yıldız.
import type { P } from '../gestures';
import { FIST, OPEN, POINT, VICTORY, synthHand, type DemoHand, type Pose } from '../synthetic';
import type { SpaceCmd } from './commands';

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
export const PINCH: Pose['curl'] = [0, 0.35, 0, 0, 0];

/** Pozun çimdik noktasının bileğe göre yeri: eli, çimdik noktası hedefe gelecek şekilde koymak için */
export function pinchOffset(size: number, roll: number, left: boolean): P {
  const p = synthHand({ x: 0, y: 0, size, curl: PINCH, pinch: 1, roll, left });
  return { x: (p[4].x + p[8].x) / 2, y: (p[4].y + p[8].y) / 2 };
}

export interface DemoFrame { hands: DemoHand[]; step: string; loop: number; cmd?: { key: string; cmd: SpaceCmd } }

export function demoSpaceHands(t0: number, W: number, H: number): DemoFrame {
  const loop = Math.floor(t0 / 40);
  const t = t0 % 40;
  const s = Math.min(W, H) * 0.16;
  const pinchAt = (id: string, x: number, y: number, roll = 0, size = s, left = false): DemoHand => {
    const o = pinchOffset(size, roll, left);
    return { id, score: 1, pts: synthHand({ x: x - o.x, y: y - o.y, size, curl: PINCH, pinch: 1, roll, left }) };
  };
  const pose = (id: string, x: number, y: number, curl: Pose['curl'], extra: Partial<Pose> = {}): DemoHand => ({ id, score: 1, pts: synthHand({ x, y, size: s, curl, ...extra }) });
  const R = 'Left', L = 'Right';
  if (t < 1.4) return { step: '🪐 uzay modu', hands: [], loop };
  if (t < 3.2) return { step: '🤏 çimdik: Dünya', hands: [pinchAt(R, W * 0.64, H * 0.6)], loop };
  if (t < 5.4) {
    // Bileği çevir: gezegen döner
    const roll = Math.sin((t - 3.2) * 3.2) * 0.7;
    return { step: '↻ bileği çevir: döndür', hands: [pinchAt(R, W * 0.64, H * 0.6, roll)], loop };
  }
  if (t < 7.0) return { step: '✌️ diğer el 2 parmak: Mars', hands: [pinchAt(R, W * 0.64, H * 0.6), pose(L, W * 0.3, H * 0.82, VICTORY, { left: true })], loop };
  if (t < 7.6) return { step: '🤏 diğer elde Dünya', hands: [pinchAt(R, W * 0.64, H * 0.6)], loop };
  if (t < 10.0) {
    const sway = Math.sin(t * 2) * H * 0.01;
    return { step: '🤏🤏 iki elde iki gezegen', hands: [pinchAt(R, W * 0.66, H * 0.6 + sway), pinchAt(L, W * 0.3, H * 0.6 - sway, 0, s, true)], loop };
  }
  if (t < 10.6) {
    // Hızla yaklaştır: çarpışma
    const k = (t - 10.0) / 0.35;
    return { step: '💥 çarpıştır', hands: [pinchAt(R, lerp(W * 0.66, W * 0.36, k), H * 0.6), pinchAt(L, W * 0.3, H * 0.6, 0, s, true)], loop };
  }
  if (t < 15.5) return { step: '🌑 enkaz toplanıyor: Ay doğar', hands: [pinchAt(L, W * 0.3 + (t - 10.6) * W * 0.03, H * 0.6, 0, s, true)], loop };
  if (t < 17.0) return { step: '🌍🌑 Dünya ve Ay', hands: [], loop, cmd: t > 16.5 ? { key: 'temizle', cmd: { tip: 'temizle' } } : undefined };
  if (t < 23.5) {
    // ✋✋: Güneş sistemi; eller açıldıkça büyür
    const k = (t - 17.0) / 6.5;
    const spread = lerp(0.2, 0.33, k);
    return { step: '✋✋ güneş sistemi', hands: [pose(R, W * (0.5 + spread), H * 0.74, OPEN, { roll: 0.15 }), pose(L, W * (0.5 - spread), H * 0.74, OPEN, { roll: -0.15, left: true })], loop };
  }
  if (t < 25.0) return { step: '🗣 "Jarvis, Satürn getir"', hands: [], loop, cmd: t > 24.4 ? { key: 'saturn', cmd: { tip: 'gezegen', govde: 'saturn' } } : undefined };
  if (t < 30.5) {
    // ✊ gezegenin yanında 1,5 sn: kara delik, sonra yumruk tutuldukça yutar
    const x = W * 0.5 + Math.min(W, H) * 0.34;
    return { step: t < 27.2 ? '✊ 1,5 sn: kara delik' : '🕳 spagettileşme', hands: [pose(R, x, H * 0.62, FIST)], loop };
  }
  if (t < 32.5) return { step: '✋ aç: kara delik söner', hands: [pose(R, W * 0.5 + Math.min(W, H) * 0.34, H * 0.66, OPEN)], loop };
  if (t < 34) return { step: '☝️', hands: [pose(R, W * 0.6, H * 0.7, POINT)], loop, cmd: t > 33.5 ? { key: 'temizle2', cmd: { tip: 'temizle' } } : undefined };
  return { step: '—', hands: [], loop };
}
