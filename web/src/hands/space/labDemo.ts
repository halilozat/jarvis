// Uzay Laboratuvarı · kamerasız demo (?el=demo&mod=lab). Sentetik eller ve sesli komutlarla zaman çizelgesi (56 sn):
// bugünkü gökyüzü → Dünya'yı Güneş'e yaklaştır (canlı sıcaklık) → Venüs'ün uzaklığında bırak → sıfırla →
// Mars'ı fırlat (noktalı yol, kaçış) → Dünya-Mars ışık ipi ve mesaj → yaklaştır: karşılaştır → çarpıştır: enkaz, uydu →
// kesit → zamanı hızlandır → 2030'a git → sıfırla. Demoda segmentasyon yok.
import type { P } from '../gestures';
import { OPEN, synthHand, type DemoHand } from '../synthetic';
import type { SpaceCmd } from './commands';
import { PINCH, pinchOffset, type DemoFrame } from './demo';
import type { LabBrain } from './lab';

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** Döngü içinde bir kez hesaplanan değerler (bir hareketin başlangıç noktası gibi) */
const memo = new Map<string, P>();
const once = (loop: number, key: string, f: () => P | null): P | null => {
  const k = `${loop}:${key}`;
  if (!memo.has(k)) { const v = f(); if (!v) return null; memo.set(k, v); if (memo.size > 60) memo.delete(memo.keys().next().value!); }
  return memo.get(k)!;
};

export const LAB_DEMO_SURE = 56;

export function demoLabHands(t0: number, W: number, H: number, lab: LabBrain): DemoFrame {
  const loop = Math.floor(t0 / LAB_DEMO_SURE);
  const t = t0 % LAB_DEMO_SURE;
  const s = Math.min(W, H) * 0.15;
  const R = 'Left', L = 'Right';
  const pinchAt = (id: string, x: number, y: number, left = false): DemoHand => {
    const o = pinchOffset(s, 0, left);
    return { id, score: 1, pts: synthHand({ x: x - o.x, y: y - o.y, size: s, curl: PINCH, pinch: 1, roll: 0, left }) };
  };
  const openAt = (id: string, x: number, y: number, left = false): DemoHand => {
    const o = pinchOffset(s, 0, left);
    return { id, score: 1, pts: synthHand({ x: x - o.x, y: y - o.y, size: s, curl: OPEN, roll: 0, left }) };
  };
  const cmd = (at: number, key: string, c: SpaceCmd) => (t > at && t < at + 0.6 ? { key, cmd: c } : undefined);
  const pos = (g: 'dunya' | 'mars') => lab.screenOf(g);

  if (t < 3.6) return { step: '🪐 bugünkü gökyüzü · gerçek konumlar', hands: [], loop };
  if (t < 5.2) {
    const p = pos('dunya');
    return { step: "🤏 Dünya'yı tut (yerinde bırakırsan hiçbir şey değişmez)", hands: p ? [pinchAt(R, p.x, p.y)] : [], loop };
  }
  if (t < 9.2) {
    const k = smooth((t - 5.2) / 4);
    const q = lab.screenAt('dunya', lerp(1, 0.42, k));
    return { step: "🔥 Güneş'e yaklaştır: sıcaklık canlı hesaplanır", hands: [pinchAt(R, q.x, q.y + s * 0.12)], loop };
  }
  if (t < 10.6) {
    const q = lab.screenAt('dunya', lerp(0.42, 0.72, smooth((t - 9.2) / 0.9)));
    return { step: "Venüs'ün uzaklığı: 0,72 AU", hands: [pinchAt(R, q.x, q.y + s * 0.12)], loop };
  }
  if (t < 13.0) return { step: '🖐 yavaş bırak: dairesel yörünge, Jarvis hesabı söyler', hands: [], loop };
  if (t < 15.0) return { step: '🗣 "Jarvis, sıfırla"', hands: [], loop, cmd: cmd(13, 'sifirla1', { tip: 'sifirla' }) };
  if (t < 16.4) {
    const p = pos('mars');
    return { step: "🤏 Mars'ı tut", hands: p ? [pinchAt(R, p.x, p.y)] : [], loop };
  }
  if (t < 16.9) {
    // Fırlat: kısa, hızlı bir savuruş (çoğu yörünge yönünde); sonra el açılır, bırakma anındaki el hızı → Δv
    const p0 = once(loop, 'mars0', () => pos('mars'));
    if (!p0) return { step: '—', hands: [], loop };
    const dx = p0.x - lab.view.cx, dy = p0.y - lab.view.cy, d = Math.hypot(dx, dy) || 1;
    const tx = dy / d, ty = -dx / d; // ekranda yörünge yönü (saat yönünün tersi)
    const ux = tx * 0.92 + (dx / d) * 0.4, uy = ty * 0.92 + (dy / d) * 0.4;
    const k = (t - 16.4) * 1500;
    const x = p0.x + ux * k, y = p0.y + uy * k;
    return { step: '↗ fırlat: noktalı yol önceden çizilir', hands: [t < 16.52 ? pinchAt(R, x, y) : openAt(R, x, y)], loop };
  }
  if (t < 21.0) return { step: '⏩ zaman hızlandı: sonuç gerçek N-cisim hesabı', hands: [], loop };
  if (t < 22.5) return { step: '🗣 "Jarvis, sıfırla"', hands: [], loop, cmd: cmd(21, 'sifirla2', { tip: 'sifirla' }) };
  if (t < 27.5) {
    const a = pos('dunya'), b = pos('mars');
    const hands = [a && pinchAt(R, a.x, a.y), b && pinchAt(L, b.x, b.y, true)].filter(Boolean) as DemoHand[];
    return { step: t < 24.5 ? '🤏🤏 iki gezegen: ışık ipi' : '🗣 "Jarvis, Mars\'a mesaj gönder"', hands, loop, cmd: cmd(24.5, 'mesaj', { tip: 'mesaj', hedef: 'mars', kaynak: 'dunya' }) };
  }
  if (t < 32.6) {
    // İki gezegen yaşanabilir bölgede bir noktaya taşınır: yavaşça yaklaşır (karşılaştır), sonra hızla çarpışır
    const a0 = once(loop, 'e0', () => pos('dunya')), b0 = once(loop, 'm0', () => pos('mars'));
    const M = once(loop, 'M', () => lab.screenAt('dunya', 1.25));
    if (!a0 || !b0 || !M) return { step: '—', hands: [], loop };
    const k1 = smooth((t - 27.5) / 2.4);
    const ax = lerp(a0.x, M.x, k1), ay = lerp(a0.y + s * 0.12 + 6, M.y + s * 0.12, k1);
    const gap = t < 30.6 ? 130 : lerp(130, 0, (t - 30.6) / 0.12);
    const bx = lerp(b0.x, M.x - 130, k1) + (gap - 130) * -1, by = lerp(b0.y, M.y + s * 0.12, k1);
    return { step: t < 30.6 ? 'yavaşça yaklaştır: karşılaştır' : '💥 hızla çarpıştır', hands: [pinchAt(R, ax, ay), pinchAt(L, bx, by, true)], loop };
  }
  if (t < 34.6) return { step: '🌑 enkaz diski → uydu', hands: [], loop };
  if (t < 35.2) return { step: '🗣 "Jarvis, sıfırla"', hands: [], loop, cmd: cmd(34.6, 'sifirla3', { tip: 'sifirla' }) };
  if (t < 44.0) return { step: '🗣 "Jarvis, Dünya\'nın içini aç"', hands: [], loop, cmd: cmd(36, 'kesit', { tip: 'kesit', govde: 'dunya' }) };
  if (t < 49.5) {
    const c = cmd(44.5, 'h1', { tip: 'zaman', islem: 'hizlandir' }) ?? cmd(46, 'h2', { tip: 'zaman', islem: 'hizlandir' }) ?? cmd(47.5, 'h3', { tip: 'zaman', islem: 'hizlandir' });
    return { step: '🗣 "Jarvis, zamanı hızlandır"', hands: [], loop, cmd: c };
  }
  if (t < 53.0) return { step: '🗣 "Jarvis, 1 Ocak 2030\'a git"', hands: [], loop, cmd: cmd(49.6, 'tarih', { tip: 'tarih', yil: 2030, ay: 1, gun: 1 }) };
  return { step: '🗣 "Jarvis, sıfırla"', hands: [], loop, cmd: cmd(53.2, 'sifirla4', { tip: 'sifirla' }) };
}

/**
 * Yaşam izi taraması demosu: ?el=demo&mod=lab&tara=europa ya da &tara=dunya-mars-yorungesi (sentetik el yok).
 * Döngü başında bütün sistem görünür, iç gezegenlere yakınlaşınca komut (zincir) gelir; sonunda sıfırlanır.
 */
export function demoLabTara(t0: number, param: string): { step: string; loop: number; zincir?: { key: string; cmds: SpaceCmd[] } } {
  const dm = param === 'dunya-mars-yorungesi';
  // Bilinmeyen değer (ör. tara=bos): el ve komut yok, elle denemek için boş laboratuvar
  if (!dm && param !== 'europa') return { step: '', loop: 0 };
  const sure = dm ? 46 : 32;
  const loop = Math.floor(t0 / sure), t = t0 % sure;
  const at = (s: number, key: string, cmds: SpaceCmd[]) => (t > s && t < s + 0.6 ? { key, cmds } : undefined);
  if (t < 4) return { step: '🪐 bugünkü gökyüzü', loop };
  if (dm) {
    if (t < sure - 2) return { step: "🗣 \"Jarvis, Dünya'yı Mars'ın yerine koy, sonra yaşam izi tara\"", loop, zincir: at(4, 'zincir', [{ tip: 'tasi', govde: 'dunya', hedef: 'mars', yanina: false }, { tip: 'tara', hedef: 'dunya', hizli: false }]) };
    return { step: '🗣 "Jarvis, sıfırla"', loop, zincir: at(sure - 1.8, 'sifirla', [{ tip: 'sifirla' }]) };
  }
  if (t < sure - 2) return { step: "🗣 \"Jarvis, Europa'da yaşam izi tara\"", loop, zincir: at(4, 'tara', [{ tip: 'tara', hedef: 'europa', hizli: false }]) };
  return { step: '🗣 "Jarvis, sıfırla"', loop, zincir: at(sure - 1.8, 'sifirla', [{ tip: 'sifirla' }]) };
}

/**
 * Jest demosu (?el=demo&mod=lab&tara=jest, 38 sn): iki elle büyüt/küçült → Mars'a dokun: yakınlaş → sürükle: döndür →
 * iki elle aç: kesit → kapat: geri → Dünya'yı Mars'ın üstüne bırak: yer değiştir → sıfırla → Mars'ı Dünya'ya vur: çarpışma.
 */
export function demoLabJest(t0: number, W: number, H: number, lab: LabBrain): DemoFrame {
  const sure = 38;
  const loop = Math.floor(t0 / sure), t = t0 % sure;
  const s = Math.min(W, H) * 0.15;
  const R = 'Left', L = 'Right';
  const el = (id: string, x: number, y: number, curl: typeof PINCH, left = false): DemoHand => {
    const o = pinchOffset(s, 0, left);
    return { id, score: 1, pts: synthHand({ x: x - o.x, y: y - o.y, size: s, curl, pinch: curl === PINCH ? 1 : 0, roll: 0, left }) };
  };
  const pinch = (id: string, x: number, y: number, left = false) => el(id, x, y, PINCH, left);
  const acik = (id: string, x: number, y: number, left = false) => el(id, x, y, OPEN, left);
  const cmd = (at: number, key: string, c: SpaceCmd) => (t > at && t < at + 0.6 ? { key, cmd: c } : undefined);
  const pos = (g: 'dunya' | 'mars') => lab.screenOf(g);
  const dy = s * 0.12;

  if (t < 4) return { step: '🪐 bugünkü gökyüzü', hands: [], loop };
  if (t < 9.5) {
    // Boşlukta iki elle çimdik: aç = büyüt, kapat = küçült
    const k = t < 7 ? smooth((t - 4.4) / 2.4) : 1 - smooth((t - 7) / 2.3);
    const half = lerp(W * 0.16, W * 0.26, k);
    const y = H * 0.84;
    const hands = t < 4.4 ? [acik(R, W / 2 + half, y), acik(L, W / 2 - half, y, true)] : [pinch(R, W / 2 + half, y), pinch(L, W / 2 - half, y, true)];
    return { step: t < 7 ? '🤏🤏 boşlukta iki elle aç: büyüt' : '🤏🤏 kapat: küçült', hands, loop };
  }
  if (t < 11.2) {
    // Mars'a kısa dokunuş: yakınlaş
    const p = pos('mars');
    if (!p) return { step: '—', hands: [], loop };
    const m = once(loop, 'marsTap', () => p)!;
    return { step: "🤏 Mars'a kısa dokun: yakınlaş", hands: [t > 10.2 && t < 10.45 ? pinch(R, m.x, m.y) : acik(R, m.x, m.y)], loop };
  }
  if (t < 14) {
    // Yakınlaşma görünümünde sürükle: döndür
    const x = lerp(W * 0.42, W * 0.62, smooth((t - 11.6) / 2.2));
    return { step: '🤏 sürükle: döndür', hands: [t > 11.6 ? pinch(R, x, H * 0.78) : acik(R, x, H * 0.78)], loop };
  }
  if (t < 19.5) {
    // İki elle aç: kesit · kapat: geri
    // Aç: kesit · başlangıçtan daha çok kapat: geri çık
    const half = t < 17 ? lerp(W * 0.15, W * 0.3, smooth((t - 14.4) / 2.2)) : lerp(W * 0.3, W * 0.05, smooth((t - 17) / 2.2));
    const y = H * 0.82;
    const hands = t < 14.4 ? [acik(R, W / 2 + W * 0.15, y), acik(L, W / 2 - W * 0.15, y, true)] : [pinch(R, W / 2 + half, y), pinch(L, W / 2 - half, y, true)];
    return { step: t < 17 ? '🤏🤏 elleri aç: kesit' : '🤏🤏 elleri kapat: geri', hands, loop };
  }
  if (t < 24.5) {
    // Dünya'yı yavaşça Mars'ın üstüne taşı ve bırak: yer değiştirirler
    const e0 = once(loop, 'e0', () => pos('dunya'));
    const m = pos('mars');
    if (!e0 || !m) return { step: '—', hands: [], loop };
    const k = smooth((t - 20.2) / 2.6);
    const x = lerp(e0.x, m.x, k), y = lerp(e0.y, m.y, k) + dy;
    return { step: "🤏 Dünya'yı Mars'ın üstüne bırak: yer değiştir", hands: [t < 20 ? acik(R, e0.x, e0.y + dy) : t < 23.3 ? pinch(R, x, y) : acik(R, x, y)], loop };
  }
  if (t < 26.5) return { step: '🗣 "Jarvis, sıfırla"', hands: [], loop, cmd: cmd(24.8, 'sifirla', { tip: 'sifirla' }) };
  if (t < 33) {
    // Mars'ı tut, Dünya'ya doğru götür, son anda hızla vur: çarpışma
    const m0 = once(loop, 'm0', () => pos('mars'));
    const e = pos('dunya');
    if (!m0 || !e) return { step: '—', hands: [], loop };
    // Dünya'nın dış yanına götür (yolda başka gezegen olmasın), oradan içeri hızla vur
    const ox = e.x - lab.view.cx, oy = e.y - lab.view.cy, od = Math.hypot(ox, oy) || 1;
    const P1 = { x: e.x + (ox / od) * 150, y: e.y + (oy / od) * 150 };
    let x: number, y: number;
    if (t < 29.5) { const k = smooth((t - 27.6) / 1.8); x = lerp(m0.x, P1.x, k); y = lerp(m0.y, P1.y, k) + dy; }
    else { const k = (t - 29.5) / 0.14; x = lerp(P1.x, e.x - (ox / od) * 20, k); y = lerp(P1.y, e.y - (oy / od) * 20, k) + dy; }
    return { step: t < 29.5 ? "🤏 Mars'ı Dünya'ya götür" : '💥 hızla vur: çarpıştır', hands: [t < 27.2 ? acik(R, m0.x, m0.y + dy) : pinch(R, x, y)], loop };
  }
  return { step: '🗣 "Jarvis, sıfırla"', hands: [], loop, cmd: cmd(36.5, 'sifirla2', { tip: 'sifirla' }) };
}
