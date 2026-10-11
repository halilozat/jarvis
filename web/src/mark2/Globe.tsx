import { useEffect, useRef } from 'react';
import { LAND } from '../data/world';

export interface GlobeMarker { lon: number; lat: number; label: string; hot?: boolean }

const D = Math.PI / 180;
// Kıyı çizgileri bir kez ayrıştırılır (boylam, enlem çiftleri, radyan)
const RINGS: Float32Array[] = LAND.map(s => Float32Array.from(s.split(',').map(Number), v => v * D));

/**
 * Tel kafes dünya (ortografik izdüşüm): ızgara, kıyı çizgileri (Natural Earth), işaretler.
 * focus verilince yumuşakça o noktaya döner (harita sahnesi); yoksa yavaşça kendi etrafında döner.
 */
export function Globe({ markers, focus }: { markers: GlobeMarker[]; focus: [number, number] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mRef = useRef(markers);
  mRef.current = markers;
  const fRef = useRef(focus);
  fRef.current = focus;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, w = 0, h = 0, dpr = 1;
    let lon0 = 20 * D, lat0 = 25 * D;
    let last = performance.now();
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const f = fRef.current;
      if (f) {
        // En kısa yoldan hedefe dön
        let dl = f[0] * D - lon0;
        dl = Math.atan2(Math.sin(dl), Math.cos(dl));
        lon0 += dl * Math.min(1, dt * 2.2);
        lat0 += (Math.min(60, Math.max(-60, f[1])) * D - lat0) * Math.min(1, dt * 2.2);
      } else {
        lon0 += dt * 8 * D;
        lat0 += (25 * D - lat0) * Math.min(1, dt);
      }
      const sinP = Math.sin(lat0), cosP = Math.cos(lat0);
      const R = Math.min(w, h) / 2 - 6;
      // Gizli çerçevede (telefonda display:none) boyut sıfır: çizme, yalnızca döngüyü sürdür
      if (R <= 4) { raf = requestAnimationFrame(draw); return; }
      const cx = w / 2, cy = h / 2;
      // Görünürse [x, y], değilse null
      const proj = (lam: number, phi: number): [number, number] | null => {
        const cosPhi = Math.cos(phi), dl = lam - lon0;
        const cosc = sinP * Math.sin(phi) + cosP * cosPhi * Math.cos(dl);
        if (cosc < 0) return null;
        return [cx + R * cosPhi * Math.sin(dl), cy - R * (cosP * Math.sin(phi) - sinP * cosPhi * Math.cos(dl))];
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Küre
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      g.addColorStop(0, 'rgba(63,184,255,0.16)');
      g.addColorStop(1, 'rgba(63,184,255,0.03)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(63,184,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Izgara (30°)
      ctx.strokeStyle = 'rgba(63,184,255,0.16)';
      ctx.lineWidth = 0.8;
      const line = (pts: [number, number][]) => {
        let on = false;
        ctx.beginPath();
        for (const [l, p] of pts) {
          const q = proj(l, p);
          if (!q) { on = false; continue; }
          if (on) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
          on = true;
        }
        ctx.stroke();
      };
      for (let l = -180; l < 180; l += 30) line(Array.from({ length: 37 }, (_, i) => [l * D, (-90 + i * 5) * D]));
      for (let p = -60; p <= 60; p += 30) line(Array.from({ length: 73 }, (_, i) => [(-180 + i * 5) * D, p * D]));

      // Kıyılar
      ctx.strokeStyle = 'rgba(140,220,255,0.75)';
      ctx.lineWidth = 1;
      for (const r of RINGS) {
        let on = false;
        ctx.beginPath();
        for (let i = 0; i < r.length; i += 2) {
          const q = proj(r[i], r[i + 1]);
          if (!q) { on = false; continue; }
          if (on) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
          on = true;
        }
        ctx.stroke();
      }

      // Tarama çizgisi
      const sy = cy + Math.sin(t / 1400) * R * 0.95;
      const half = Math.sqrt(Math.max(0, R * R - (sy - cy) ** 2));
      ctx.strokeStyle = 'rgba(160,230,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(cx - half, sy);
      ctx.lineTo(cx + half, sy);
      ctx.stroke();

      // İşaretler
      ctx.font = '600 11px Rajdhani, sans-serif';
      ctx.textBaseline = 'middle';
      for (const m of mRef.current) {
        const q = proj(m.lon * D, m.lat * D);
        if (!q) continue;
        const pulse = (t / 1200 + m.lon) % 1;
        ctx.strokeStyle = m.hot ? `rgba(255,190,90,${1 - pulse})` : `rgba(160,235,255,${1 - pulse})`;
        ctx.beginPath();
        ctx.arc(q[0], q[1], 3 + pulse * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = m.hot ? '#ffc46b' : '#dff7ff';
        ctx.beginPath();
        ctx.arc(q[0], q[1], 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(m.label.toLocaleUpperCase('tr'), q[0] + 7, q[1] - 7);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className="m2-globe" aria-label="Dünya" />;
}
