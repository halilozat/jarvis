// Sentetik el: kamera olmadan efektleri denemek (?el=demo) ve jest tanımayı test etmek için.
// Basit kinematik: parmaklar kameraya doğru büküldükçe ekranda kısalır (önden bakış).
import type { P } from './gestures';

export interface Pose {
  /** Avuç merkezi değil, BİLEK konumu (px) */
  x: number; y: number;
  /** Bilekten orta parmak köküne uzaklık (px) */
  size: number;
  /** Dönüş (radyan, yukarı = 0) */
  roll?: number;
  /** Parmak bükülmesi 0 (düz) .. 1 (tam kapalı): [başparmak, işaret, orta, yüzük, serçe] */
  curl: [number, number, number, number, number];
  /** Başparmak yukarı (👍) duruşu */
  thumbUp?: boolean;
  /** Çimdik: başparmak ucu işaret ucuna gider (0..1) */
  pinch?: number;
  /** Ekranda sol el (aynalı) */
  left?: boolean;
}

const FINGERS = [
  { mcp: [-0.3, -0.95], len: [0.4, 0.25, 0.2], fan: -0.16 },
  { mcp: [0, -1], len: [0.45, 0.28, 0.22], fan: 0 },
  { mcp: [0.25, -0.95], len: [0.42, 0.26, 0.2], fan: 0.13 },
  { mcp: [0.45, -0.82], len: [0.32, 0.2, 0.18], fan: 0.3 },
];

export function synthHand(pose: Pose): P[] {
  const local: P[] = new Array(21);
  local[0] = { x: 0, y: 0 };
  // Parmaklar: her eklem bükülmeyle 80° kameraya döner; ekrana izdüşüm y bileşenini kısaltır
  FINGERS.forEach((f, i) => {
    const c = pose.curl[i + 1];
    const base = 5 + i * 4;
    let x = f.mcp[0], y = f.mcp[1], th = 0;
    local[base] = { x, y };
    for (let j = 0; j < 3; j++) {
      th += c * (j === 0 ? 1.45 : 1.25);
      x += Math.sin(f.fan) * f.len[j] * Math.cos(th);
      y += -Math.cos(f.fan) * f.len[j] * Math.cos(th);
      local[base + j + 1] = { x, y };
    }
  });
  // Başparmak
  const t = pose.curl[0];
  if (pose.thumbUp) {
    local[1] = { x: -0.28, y: -0.3 }; local[2] = { x: -0.38, y: -0.72 }; local[3] = { x: -0.42, y: -1.12 }; local[4] = { x: -0.44, y: -1.48 };
  } else {
    const open = [[-0.25, -0.15], [-0.48, -0.35], [-0.66, -0.56], [-0.8, -0.76]];
    const shut = [[-0.22, -0.18], [-0.33, -0.42], [-0.16, -0.62], [0.02, -0.66]];
    for (let j = 0; j < 4; j++) local[1 + j] = { x: open[j][0] + (shut[j][0] - open[j][0]) * t, y: open[j][1] + (shut[j][1] - open[j][1]) * t };
  }
  if (pose.pinch) {
    const k = pose.pinch;
    const tip = local[8];
    const target = { x: tip.x - 0.04, y: tip.y + 0.04 };
    local[4] = { x: local[4].x + (target.x - local[4].x) * k, y: local[4].y + (target.y - local[4].y) * k };
    local[3] = { x: local[3].x + (target.x - 0.1 - local[3].x) * k * 0.7, y: local[3].y + (target.y + 0.15 - local[3].y) * k * 0.7 };
  }
  const r = pose.roll ?? 0, cs = Math.cos(r), sn = Math.sin(r), m = pose.left ? -1 : 1;
  return local.map(q => {
    const lx = q.x * m;
    return { x: pose.x + (lx * cs - q.y * sn) * pose.size, y: pose.y + (lx * sn + q.y * cs) * pose.size, z: 0 };
  });
}

export const OPEN: Pose['curl'] = [0, 0, 0, 0, 0];
export const FIST: Pose['curl'] = [1, 1, 1, 1, 1];
export const POINT: Pose['curl'] = [1, 0, 1, 1, 1];
export const VICTORY: Pose['curl'] = [1, 0, 0, 1, 1];

// ------------------------------------------------------------------ Demo zaman çizelgesi (?el=demo)

export interface DemoHand { id: string; pts: P[]; score: number }
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

/** t saniyesinde sahnedeki sentetik eller. Döngü 26 sn. Adımlar efektleri ve kontrolleri sırayla gösterir. */
export function demoHands(t: number, W: number, H: number): { hands: DemoHand[]; step: string } {
  t = t % 26;
  const s = Math.min(W, H) * 0.16;
  const R = (x: number, y: number, extra: Partial<Pose> & { curl: Pose['curl'] }): DemoHand => ({ id: 'Left', score: 1, pts: synthHand({ x: W * x, y: H * y, size: s, roll: Math.sin(t * 1.3) * 0.08, ...extra }) });
  const L = (x: number, y: number, extra: Partial<Pose> & { curl: Pose['curl'] }): DemoHand => ({ id: 'Right', score: 1, pts: synthHand({ x: W * x, y: H * y, size: s, roll: -Math.sin(t * 1.1) * 0.08, left: true, ...extra }) });
  const sway = Math.sin(t * 1.7) * 0.02;
  if (t < 4) return { step: '✋ ateş', hands: [R(0.62 + sway, 0.78, { curl: OPEN })] };
  if (t < 8) return { step: '✋✋ mühür', hands: [R(0.7, 0.76 + sway, { curl: OPEN, roll: 0.15 }), L(0.3, 0.76 - sway, { curl: OPEN, roll: -0.15 })] };
  if (t < 9.5) return { step: '🤏 gezegen', hands: [R(0.56, 0.8, { curl: [0, 0.35, 0, 0, 0], pinch: 1 })] };
  if (t < 12) {
    const k = (t - 9.5) / 2.5;
    return { step: '🤏🤏 ger', hands: [R(lerp(0.56, 0.72, k), 0.8, { curl: [0, 0.35, 0, 0, 0], pinch: 1 }), L(lerp(0.48, 0.3, k), 0.8, { curl: [0, 0.35, 0, 0, 0], pinch: 1 })] };
  }
  if (t < 13) return { step: '✊', hands: [R(0.62, 0.8, { curl: FIST })] };
  if (t < 15) return { step: '✊→✋ patlat', hands: [R(0.62, 0.8, { curl: OPEN })] };
  if (t < 17.5) return { step: '☝️☝️ şimşek', hands: [R(0.72, 0.75 + sway, { curl: POINT, roll: -0.5 }), L(0.28, 0.75 - sway, { curl: POINT, roll: 0.5 })] };
  if (t < 19.5) return { step: '☝️ iz', hands: [R(0.55 + Math.cos(t * 4) * 0.1, 0.65 + Math.sin(t * 4) * 0.12, { curl: POINT })] };
  if (t < 21.5) return { step: '👍 kahve', hands: [R(0.6, 0.78, { curl: FIST, thumbUp: true })] };
  if (t < 23.5) return { step: '✌️ ışık', hands: [R(0.6, 0.8, { curl: VICTORY })] };
  return { step: '—', hands: [] };
}

// ------------------------------------------------------------------ Kitaplık demosu (?el=demo&kitaplik=1)

/** Pozdaki bir noktanın (işaret ucu ya da çimdik noktası) bileğe göre konumu: eli o nokta hedefe gelecek şekilde koymak için */
function offsetOf(pose: Omit<Pose, 'x' | 'y'>, pinch: boolean): P {
  const p = synthHand({ ...pose, x: 0, y: 0 });
  return pinch ? { x: (p[4].x + p[8].x) / 2, y: (p[4].y + p[8].y) / 2 } : p[8];
}

export interface DemoRect { x: number; y: number; w: number; h: number }

/**
 * Kitap sahnesi (döngü 24 sn): tarama → işaretle seç → çimdikle tut → çek → kapak → aç → sayfa çevir (iki kez ileri,
 * bir kez geri) → 👍 özeti oku → ✊ rafa koy. `r`: hedef kitabın ekrandaki sırtı.
 */
export function demoBookHands(t: number, W: number, H: number, r: DemoRect | null): { hands: DemoHand[]; step: string; loop: number } {
  const loop = Math.floor(t / 24);
  t = t % 24;
  const s = Math.min(W, H) * 0.16;
  const hand = (x: number, y: number, extra: Partial<Pose> & { curl: Pose['curl'] }, id = 'Left'): DemoHand => ({ id, score: 1, pts: synthHand({ x, y, size: s, ...extra }) });
  const sway = Math.sin(t * 1.7) * 0.008;
  if (t < 4.5 || !r) return { step: t < 1.3 ? '🔎 kitaplık taranıyor' : '🔎 tarama', hands: [], loop };
  const cx = r.x + r.w / 2, cy = r.y + r.h * 0.55;
  const point = { size: s, curl: POINT, roll: -0.25 };
  const pinch = { size: s, curl: [0, 0.35, 0, 0, 0] as Pose['curl'], pinch: 1, roll: -0.25 };
  const po = offsetOf(point, false), pi = offsetOf(pinch, true);
  if (t < 6.1) {
    // Alttan kitaba uzan (☝️)
    const k = Math.min(1, (t - 4.5) / 1.1);
    const e = 1 - Math.pow(1 - k, 3);
    const x = lerp(W * 0.72, cx, e) - po.x, y = lerp(H * 1.05, cy, e) - po.y;
    return { step: '☝️ kitabı seç', hands: [hand(x, y + sway * H, { curl: POINT, roll: -0.25 })], loop };
  }
  if (t < 6.7) return { step: '🤏 tut', hands: [hand(cx - pi.x, cy - pi.y, { curl: pinch.curl, pinch: 1, roll: -0.25 })], loop };
  if (t < 7.7) {
    // Çek: kendine doğru (aşağı ve ortaya), el büyür
    const k = (t - 6.7) / 1.0;
    const grow = 1 + 0.35 * k;
    const tx = lerp(cx, W * 0.5, k * 0.6), ty = lerp(cy, H * 0.72, k);
    const o = offsetOf({ ...pinch, size: s * grow }, true);
    return { step: '🤏 çek', hands: [{ id: 'Left', score: 1, pts: synthHand({ x: tx - o.x, y: ty - o.y, size: s * grow, curl: pinch.curl, pinch: 1, roll: -0.25 }) }], loop };
  }
  if (t < 8.6) {
    const k = (t - 7.7) / 0.9;
    return { step: '📖 kapak', hands: [hand(W * 0.5 + k * W * 0.2, H * (0.95 + k * 0.4), { curl: OPEN })], loop };
  }
  if (t < 10.8) return { step: '📖 holografik açılış', hands: [], loop };
  const swipe = (t0: number, dir: 1 | -1, label: string) => {
    const k = (t - t0) / 0.3;
    const x0 = dir === 1 ? 0.72 : 0.3, x1 = dir === 1 ? 0.3 : 0.72;
    const x = W * (k < 0 ? x0 : k > 1 ? x1 : lerp(x0, x1, k));
    return { step: label, hands: [hand(x, H * 0.92, { curl: OPEN, left: dir === -1 })], loop };
  };
  if (t < 11.6) return swipe(11.0, 1, '✋ sola savur: sayfa çevir');
  if (t < 12.2) return { step: '✋ sola savur: sayfa çevir', hands: [], loop };
  if (t < 13.0) return swipe(12.4, 1, '✋ bir sayfa daha');
  if (t < 13.6) return { step: '✋ sağa savur: geri', hands: [], loop };
  if (t < 14.4) return swipe(13.8, -1, '✋ sağa savur: geri');
  if (t < 15.0) return { step: '👍 basılı tut: özeti oku', hands: [], loop };
  if (t < 16.8) return { step: '👍 basılı tut: özeti oku', hands: [hand(W * 0.72, H * 0.86, { curl: FIST, thumbUp: true })], loop };
  if (t < 17.2) return { step: '✊ basılı tut: rafa koy', hands: [], loop };
  if (t < 18.8) return { step: '✊ basılı tut: rafa koy', hands: [hand(W * 0.72, H * 0.88, { curl: FIST })], loop };
  return { step: '↩ rafına döndü', hands: [], loop };
}
