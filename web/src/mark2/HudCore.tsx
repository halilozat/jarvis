import { useEffect, useRef } from 'react';
import type { CoreState } from '../lib/types';

const COLORS: Record<CoreState, [number, number, number]> = {
  idle: [63, 184, 255],
  listening: [93, 255, 176],
  thinking: [255, 181, 71],
  speaking: [110, 214, 255],
};
const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']; // Türkçe pusula

const span = (p: number, a: number, b: number) => {
  const x = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return 1 - Math.pow(1 - x, 3);
};

export interface HudCoreInfo {
  /** Sahne ilerlemesi: [şimdiki, toplam] ya da null (boşta saniye halkası) */
  scene: [number, number] | null;
}

/**
 * Mark 2 çekirdeği: Mark 1'den daha yoğun, özgün bir HUD çekirdeği.
 * Dıştan içe: pusula + derece halkası · saat yayı (HH:MM) ve günün geçen kısmı · parçalı dönen halka ·
 * saniye/sahne halkası · kesik çizgili karşı yön halkası · ses dalgası · düşünme kovalayıcıları · altıgen mercek.
 * Saat, saniye ve sahne ilerlemesi gerçek; diğer katmanlar süs.
 */
export function HudCore({ state, level, introAt = null, info }: { state: CoreState; level: () => number; introAt?: number | null; info: HudCoreInfo }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const introRef = useRef(introAt);
  introRef.current = introAt;
  const infoRef = useRef(info);
  infoRef.current = info;
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, w = 0, h = 0, dpr = 1, L = 0, spin = 0;
    let col = [...COLORS.idle];
    const noise = Array.from({ length: 120 }, () => Math.random());
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
    const white = (a: number) => `rgba(225,248,255,${a})`;

    const draw = (t: number) => {
      const s = stateRef.current;
      const target = COLORS[s];
      col = col.map((c, i) => c + (target[i] - c) * 0.06);
      const lv = s === 'speaking' ? levelRef.current() : s === 'listening' ? 0.3 + 0.25 * Math.sin(t / 170) * Math.sin(t / 61) : 0;
      L += (lv - L) * 0.3;
      const speed = s === 'thinking' ? 3.4 : s === 'speaking' ? 1.4 : s === 'listening' ? 1.8 : 0.55;
      spin += 0.0016 * speed;
      const intro = introRef.current;
      const p = intro === null ? 99 : (t - intro) / 1000;
      const k = { core: span(p, 0, 0.45), wave: span(p, 0.3, 0.55), dash: span(p, 0.45, 0.7), sec: span(p, 0.55, 0.85), seg: span(p, 0.7, 1.0), time: span(p, 0.8, 1.1), comp: span(p, 0.9, 1.2) };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = (Math.min(w, h) / 2) * 0.97;
      ctx.translate(w / 2, h / 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'butt';
      const now = new Date();

      // 1) Pusula: 360 tik, her 10°'de uzun, her 45°'de yön harfi (sabit; kuzey yukarı)
      const nT = Math.round(180 * k.comp);
      for (let i = 0; i < nT; i++) {
        const a = (i / 180) * Math.PI * 2 - Math.PI / 2;
        const long = i % 5 === 0;
        const r1 = R * (long ? 0.925 : 0.95);
        ctx.strokeStyle = rgba(long ? 0.75 : 0.28);
        ctx.lineWidth = long ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98);
        ctx.stroke();
      }
      if (k.comp > 0.95) {
        ctx.font = `600 ${Math.max(9, R * 0.045)}px Rajdhani, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        COMPASS.forEach((c, i) => {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          ctx.fillStyle = i === 0 ? white(0.95) : rgba(0.8);
          ctx.fillText(c, Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
        });
        // Derece etiketleri (her 30°, harflerin arasında)
        ctx.font = `500 ${Math.max(8, R * 0.032)}px "JetBrains Mono", monospace`;
        for (let d = 15; d < 360; d += 30) {
          const a = (d / 360) * Math.PI * 2 - Math.PI / 2;
          ctx.fillStyle = rgba(0.45);
          ctx.fillText(String(d).padStart(3, '0'), Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
        }
      }
      // Dönen imleç (dış halkada)
      ctx.save();
      ctx.rotate(spin * 0.8);
      ctx.fillStyle = white(0.9 * k.comp);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.995);
      ctx.lineTo(-R * 0.018, -R * 1.03);
      ctx.lineTo(R * 0.018, -R * 1.03);
      ctx.fill();
      ctx.restore();

      // 2) Saat yayı: günün geçen kısmı (kalın) + sol üstte HH:MM
      if (k.time > 0) {
        const dayFrac = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
        ctx.lineWidth = Math.max(2, R * 0.012);
        ctx.strokeStyle = rgba(0.2);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k.time);
        ctx.stroke();
        ctx.strokeStyle = rgba(0.85);
        ctx.shadowColor = rgba(0.9);
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dayFrac * k.time);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // HH:MM yay boyunca (−60° civarı)
        const txt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        ctx.font = `700 ${Math.max(12, R * 0.085)}px Rajdhani, sans-serif`;
        ctx.fillStyle = white(0.92 * k.time);
        const chars = txt.split('');
        const step = 0.075;
        chars.forEach((ch, i) => {
          const a = -Math.PI / 2 - 0.95 + (i - (chars.length - 1) / 2) * step;
          ctx.save();
          ctx.rotate(a + Math.PI / 2);
          ctx.fillText(ch, 0, -R * 0.705);
          ctx.restore();
        });
      }

      // 3) Parçalı halka (saat yönü), sırayla çizilerek gelir
      ctx.save();
      ctx.rotate(spin);
      ctx.shadowColor = rgba(0.9);
      ctx.shadowBlur = 12;
      ctx.lineWidth = Math.max(2, R * 0.02);
      for (let i = 0; i < 9; i++) {
        const a0 = (i / 9) * Math.PI * 2;
        const len = Math.min((Math.PI * 2 / 9) * (i % 3 === 0 ? 0.78 : 0.4), Math.PI * 2 * k.seg - a0);
        if (len <= 0) continue;
        ctx.strokeStyle = rgba(i % 3 === 0 ? 0.95 : 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.665, a0, a0 + len);
        ctx.stroke();
      }
      ctx.restore();

      // 4) Saniye halkası (boşta) ya da sahne halkası (konuşurken): gerçek ilerleme
      const sc = infoRef.current.scene;
      const segs = sc ? sc[1] : 60;
      const lit = sc ? sc[0] : now.getSeconds();
      const gap = sc ? 0.06 : 0.025;
      ctx.lineWidth = Math.max(3, R * (sc ? 0.03 : 0.022));
      for (let i = 0; i < Math.round(segs * k.sec); i++) {
        const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2 + gap;
        const a1 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2 - gap;
        ctx.strokeStyle = i === lit ? white(0.95) : i < lit ? rgba(0.6) : rgba(0.14);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.6, a0, a1);
        ctx.stroke();
      }

      // 5) Kesik çizgili halka (ters yön)
      if (k.dash > 0) {
        ctx.save();
        ctx.rotate(-spin * 1.6);
        ctx.setLineDash([R * 0.012, R * 0.022]);
        ctx.lineWidth = Math.max(3, R * 0.035);
        ctx.strokeStyle = rgba(0.22);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.53, 0, Math.PI * 2 * k.dash);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // 6) Düşünme: kovalayan yaylar + tarama ışını
      if (s === 'thinking') {
        ctx.save();
        ctx.shadowColor = rgba(1);
        ctx.shadowBlur = 18;
        ctx.lineWidth = Math.max(2, R * 0.018);
        for (let j = 0; j < 3; j++) {
          const a = (t / [300, 420, 220][j]) * (j % 2 ? -1 : 1);
          ctx.strokeStyle = rgba(0.95);
          ctx.beginPath();
          ctx.arc(0, 0, R * [0.47, 0.5, 0.72][j], a, a + 0.9);
          ctx.stroke();
        }
        const sweep = (t / 900) % (Math.PI * 2);
        if (!ctx.createConicGradient) { ctx.restore(); } else {
        const g = ctx.createConicGradient(sweep, 0, 0);
        g.addColorStop(0, rgba(0.25));
        g.addColorStop(0.12, rgba(0));
        g.addColorStop(1, rgba(0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        }
      }

      // 7) Ses dalgası: radyal çubuklar
      ctx.save();
      ctx.rotate(-spin * 0.4);
      const bars = Math.round(noise.length * k.wave);
      for (let i = 0; i < bars; i++) {
        const a = (i / noise.length) * Math.PI * 2;
        const n = 0.35 + 0.65 * Math.abs(Math.sin(t / 130 + noise[i] * 9 + i * 0.37));
        const amp = 0.015 + L * 0.13 * n;
        ctx.strokeStyle = rgba(0.3 + L * 0.6);
        ctx.lineWidth = Math.max(1.2, R * 0.009);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.39, Math.sin(a) * R * 0.39);
        ctx.lineTo(Math.cos(a) * R * (0.39 + amp), Math.sin(a) * R * (0.39 + amp));
        ctx.stroke();
      }
      ctx.restore();

      // 8) Altıgen mercek + çekirdek parıltısı
      const kc = k.core;
      const flash = p < 1.6 ? Math.max(0, 1 - Math.abs(p - 0.15) / 0.5) : 0;
      ctx.save();
      ctx.rotate(spin * 2);
      ctx.strokeStyle = rgba(0.8 * kc);
      ctx.lineWidth = 1.5;
      for (const rr of [0.3, 0.24]) {
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const r = R * rr * kc;
          if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.stroke();
        ctx.rotate(Math.PI / 6);
      }
      ctx.restore();
      const rc = R * (0.2 + L * 0.05) * (0.12 + 0.88 * kc) * (1 + 0.3 * flash);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rc * 1.8);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.2, rgba(0.9));
      g.addColorStop(0.55, rgba(Math.min(1, 0.22 + L * 0.3 + flash * 0.5)));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rc * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className="m2-core" aria-label="Jarvis çekirdeği" />;
}
