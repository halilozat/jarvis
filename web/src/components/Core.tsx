import { useEffect, useRef } from 'react';
import type { CoreState } from '../lib/types';

const COLORS: Record<CoreState, [number, number, number]> = {
  idle: [77, 225, 255],
  listening: [125, 255, 178],
  thinking: [255, 181, 71],
  speaking: [120, 236, 255],
};

/** a–b saniye aralığında 0→1 (yumuşak), aralık dışında 0 ya da 1 */
const span = (p: number, a: number, b: number) => {
  const x = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return 1 - Math.pow(1 - x, 3);
};

/**
 * Jarvis çekirdeği: farklı hızlarda dönen parçalı halkalar + sese tepki veren dalga halkası.
 * Tamamen özgün bir tasarım; canvas ile çizilir.
 * introAt (performance.now): uyanış sekansı. Çekirdek bir noktadan parlar, halkalar içten dışa sırayla çizilir
 * (0,3–1,2 sn); null → tam çizim.
 */
export function Core({ state, level, introAt = null }: { state: CoreState; level: () => number; introAt?: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const introRef = useRef(introAt);
  introRef.current = introAt;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0, h = 0, dpr = 1;
    let L = 0; // yumuşatılmış seviye
    let col = [...COLORS.idle];
    let spin = 0;
    const noise = Array.from({ length: 96 }, () => Math.random());

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const rgba = (a: number) => `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;

    const draw = (t: number) => {
      const s = stateRef.current;
      const target = COLORS[s];
      col = col.map((c, i) => c + (target[i] - c) * 0.06);
      const lv = s === 'speaking' ? level() : s === 'listening' ? 0.25 + 0.2 * Math.sin(t / 180) * Math.sin(t / 77) : 0;
      L += (lv - L) * 0.3;
      const speed = s === 'thinking' ? 3.2 : s === 'speaking' ? 1.4 : s === 'listening' ? 1.8 : 0.6;
      spin += 0.0016 * speed;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) / 2 * 0.92;
      const breathe = s === 'idle' ? 0.015 * Math.sin(t / 900) : 0;
      // Uyanış: her katmanın görünme oranı (0..1). p saniye cinsinden sekans zamanı.
      const intro = introRef.current;
      const p = intro === null ? 99 : (t - intro) / 1000;
      const kCore = span(p, 0, 0.45);
      const kWave = span(p, 0.3, 0.6);
      const kDash = span(p, 0.5, 0.8);
      const kSeg = span(p, 0.7, 1.0);
      const kTick = span(p, 0.9, 1.2);
      const kFlash = p < 1.6 ? Math.max(0, 1 - Math.abs(p - 0.15) / 0.5) : 0; // ilk anda parlama
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      // 1) Dış tik halkası
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin * 0.4);
      const nTick = Math.round(144 * kTick);
      for (let i = 0; i < nTick; i++) {
        const a = (i / 144) * Math.PI * 2 - Math.PI / 2;
        const long = i % 12 === 0;
        const r1 = R * (long ? 0.93 : 0.96), r2 = R;
        ctx.strokeStyle = rgba(long ? 0.7 : 0.22);
        ctx.lineWidth = long ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();

      // 2) Parçalı halka (saat yönü)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ctx.shadowColor = rgba(0.9);
      ctx.shadowBlur = 14;
      ctx.lineWidth = Math.max(2, R * 0.018);
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        // Sırayla çizim: halka saat yönünde "kalemle" çizilir
        const len = Math.min((Math.PI * 2 / segs) * (i % 3 === 0 ? 0.72 : 0.45), Math.PI * 2 * kSeg - a0);
        if (len <= 0) continue;
        ctx.strokeStyle = rgba(i % 3 === 0 ? 0.95 : 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, R * (0.84 + breathe), a0, a0 + len);
        ctx.stroke();
      }
      ctx.restore();

      // 3) Kesik çizgili halka (ters yön)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-spin * 1.7);
      ctx.setLineDash([R * 0.02, R * 0.035]);
      ctx.lineWidth = Math.max(3, R * 0.04);
      ctx.strokeStyle = rgba(0.28);
      if (kDash > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.73, 0, Math.PI * 2 * kDash);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // 4) Düşünürken kovalayan yaylar
      if (s === 'thinking') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.shadowColor = rgba(1);
        ctx.shadowBlur = 20;
        ctx.lineWidth = Math.max(2, R * 0.02);
        for (let k = 0; k < 2; k++) {
          const a = t / (k ? 260 : 380) * (k ? -1 : 1);
          ctx.strokeStyle = rgba(0.95);
          ctx.beginPath();
          ctx.arc(0, 0, R * (k ? 0.62 : 0.66), a, a + 1.1);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 5) Dalga halkası: sese göre radyal çubuklar
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-spin * 0.5);
      const bars = noise.length;
      const nBars = Math.round(bars * kWave);
      for (let i = 0; i < nBars; i++) {
        const a = (i / bars) * Math.PI * 2;
        const n = 0.35 + 0.65 * Math.abs(Math.sin(t / 140 + noise[i] * 9 + i * 0.4));
        const amp = 0.02 + L * 0.16 * n;
        const r1 = R * 0.52, r2 = R * (0.52 + amp);
        ctx.strokeStyle = rgba(0.35 + L * 0.6);
        ctx.lineWidth = Math.max(1.5, R * 0.012);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();

      // 6) İç çekirdek
      const rc = R * (0.3 + breathe + L * 0.07) * (0.12 + 0.88 * kCore) * (1 + 0.25 * kFlash);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rc * 1.9);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.18, rgba(0.9));
      g.addColorStop(0.5, rgba(Math.min(1, 0.25 + L * 0.3 + kFlash * 0.5)));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rc * 1.9, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(0.8);
      ctx.beginPath();
      ctx.arc(cx, cy, rc * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [level]);

  return <canvas ref={ref} className="core-canvas" aria-label="Jarvis çekirdeği" />;
}
