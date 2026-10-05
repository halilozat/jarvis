import { memo } from 'react';
import type { WeatherIcon as Kind } from '../../lib/types';

// Bulut silueti (64x64 görünümünde)
const CLOUD = 'M20 46h26a8 8 0 0 0 0-16a10 10 0 0 0-19-4a8 8 0 0 0-7 20z';

function Sun({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <g className="wx-rays" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={cx + Math.cos(a) * (r + 4)} y1={cy + Math.sin(a) * (r + 4)} x2={cx + Math.cos(a) * (r + 8)} y2={cy + Math.sin(a) * (r + 8)} />;
        })}
      </g>
      <circle className="wx-sun" cx={cx} cy={cy} r={r} />
    </g>
  );
}

function Falling({ kind, count, x0, step }: { kind: 'drop' | 'flake'; count: number; x0: number; step: number }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const x = x0 + i * step;
        const style = { animationDelay: `${(i * 0.37) % 1.1}s` };
        return kind === 'drop'
          ? <line key={i} className="wx-drop" x1={x} y1={49} x2={x - 2} y2={55} style={style} />
          : <circle key={i} className="wx-flake" cx={x} cy={51} r={1.6} style={style} />;
      })}
    </g>
  );
}

/** Hava koduna göre küçük animasyonlu SVG. Animasyonlar tamamen CSS'te (yeniden render yok). */
export const WeatherIcon = memo(function WeatherIcon({ icon, size = 64 }: { icon: Kind; size?: number }) {
  const cloud = (extra = '') => <path className={'wx-cloud ' + extra} d={CLOUD} />;
  return (
    <svg className={`wx-icon wx-${icon}`} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {icon === 'acik' && <Sun cx={32} cy={32} r={11} />}
      {icon === 'parcali' && <><Sun cx={23} cy={23} r={8} />{cloud('drift')}</>}
      {/* Konum dış grupta: CSS kaydırma animasyonu SVG transform özniteliğini ezmesin */}
      {icon === 'bulutlu' && <><g transform="translate(-9 -9) scale(0.8)"><path className="wx-cloud back drift-slow" d={CLOUD} /></g>{cloud('drift')}</>}
      {icon === 'sis' && (
        <>
          {cloud()}
          {[50, 55, 60].map((y, i) => <line key={y} className="wx-fog" x1={14 + i * 3} y1={y} x2={50 - i * 2} y2={y} style={{ animationDelay: `${i * 0.6}s` }} />)}
        </>
      )}
      {icon === 'cisenti' && <>{cloud()}<Falling kind="drop" count={3} x0={26} step={7} /></>}
      {icon === 'yagmur' && <>{cloud()}<Falling kind="drop" count={4} x0={23} step={7} /></>}
      {icon === 'saganak' && <>{cloud('dark')}<Falling kind="drop" count={6} x0={20} step={5} /></>}
      {icon === 'kar' && <>{cloud()}<Falling kind="flake" count={4} x0={23} step={7} /></>}
      {icon === 'firtina' && (
        <>
          {cloud('dark')}
          <path className="wx-bolt" d="M34 44l-6 9h5l-3 8 9-11h-5l3-6z" />
          <Falling kind="drop" count={3} x0={20} step={14} />
        </>
      )}
    </svg>
  );
});
