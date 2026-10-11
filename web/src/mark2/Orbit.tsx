// Çekirdeğin etrafındaki veri dilimleri (SVG). Koordinatlar: viewBox -700 -440 1400 880, çekirdek yarıçapı 250.
// Açılar: 0 = yukarı, saat yönü. Hepsi gerçek veri; veri yoksa dilim "veri yok" der.
import { memo } from 'react';
import { CATEGORY_LABEL, type Dashboard } from '../lib/types';
import { fmt } from '../lib/format';
import { arc, polar, sector } from './parts';

const R0 = 268;

/** label: dilim başlığı; at: başlığın yazılacağı açı, anchor: yazı hizası */
function Frame({ from, to, r1, label, at, anchor }: { from: number; to: number; r1: number; label: string; at: number; anchor: 'start' | 'end' }) {
  const [lx, ly] = polar(r1 + 16, at);
  return (
    <g className="o-frame">
      <path d={sector(R0, r1, from, to)} className="o-sector" />
      <path d={arc(r1, from, to)} className="o-edge" />
      <path d={arc(R0, from, to)} className="o-edge in" />
      <text x={lx} y={ly} className="o-label" textAnchor={anchor}>{label}</text>
    </g>
  );
}

const rot = (deg: number, x: number, y: number, left: boolean) => `rotate(${left ? deg + 90 : deg - 90} ${x} ${y})`;

/** Piyasa: her döviz bir dilim; dolgu = bugünkü kurun son 7 iş günü aralığındaki yeri. */
function Markets({ d, hl }: { d: Dashboard | null; hl: string[] }) {
  const items = d?.markets?.items ?? [];
  const from = 240, to = 294, r1 = 330;
  return (
    <g className={'o-markets' + (hl.some(h => h !== 'weather') ? ' hl' : '')}>
      <Frame from={from} to={to} r1={r1} label={`PİYASA · TCMB ${d?.markets ? d.markets.date.slice(8, 10) + '.' + d.markets.date.slice(5, 7) : ''}`} at={from} anchor="end" />
      {items.length === 0 && <text x={polar(300, 275)[0]} y={0} className="o-na" textAnchor="end">veri yok</text>}
      {items.map((it, i) => {
        const a0 = from + 3 + i * 18, a1 = a0 + 14;
        const vals = it.history.map(h => h.value);
        const mn = Math.min(...vals), mx = Math.max(...vals);
        const f = mx > mn ? (it.value - mn) / (mx - mn) : 0.5;
        const [tx, ty] = polar(r1 + 22, (a0 + a1) / 2);
        const up = (it.change_pct ?? 0) > 0, down = (it.change_pct ?? 0) < 0;
        return (
          <g key={it.code} className={hl.includes(it.code) ? 'hot' : ''}>
            <path d={sector(R0 + 8, r1 - 6, a0, a1)} className="o-slot" />
            <path d={sector(R0 + 8, R0 + 8 + (r1 - R0 - 14) * Math.max(0.06, f), a0, a1)} className="o-fill" />
            <text x={tx} y={ty - 6} className="o-k" textAnchor="end">{it.code}</text>
            <text x={tx} y={ty + 12} className="o-v" textAnchor="end">
              {fmt(it.value, 4)} <tspan className={up ? 'up' : down ? 'down' : ''}>{it.change_pct === null ? '' : `${up ? '▲' : down ? '▼' : '■'}${fmt(Math.abs(it.change_pct), 2)}%`}</tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Gündem dağılımı: kategori başına radyal çubuk (haber sayısı). */
function Categories({ d }: { d: Dashboard | null }) {
  const cats = (d?.news.by_category ?? []).slice(0, 7);
  const max = Math.max(1, ...cats.map(c => c.count));
  const from = 188, to = 234;
  const step = (to - from) / Math.max(1, cats.length);
  return (
    <g className="o-cats">
      <Frame from={from} to={to} r1={440} label={`GÜNDEM · ${d?.news.total ?? 0} HABER`} at={to + 4} anchor="end" />
      {cats.map((c, i) => {
        const a = from + step * (i + 0.5);
        const len = 20 + 120 * (c.count / max);
        const [x0, y0] = polar(R0 + 10, a), [x1, y1] = polar(R0 + 10 + len, a), [tx, ty] = polar(R0 + 18 + len, a);
        return (
          <g key={c.category}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} className="o-bar" />
            <text x={tx} y={ty} className="o-t" textAnchor="end" dominantBaseline="middle" transform={rot(a, tx, ty, true)}>
              {(CATEGORY_LABEL[c.category] ?? c.category).toLocaleUpperCase('tr')} {c.count}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Önümüzdeki 12 saat: sıcaklık çubukları ve yağış olasılığı. */
function Hourly({ d, hl }: { d: Dashboard | null; hl: boolean }) {
  const hrs = d?.weather?.hourly ?? [];
  const temps = hrs.map(h => h.temp);
  const mn = Math.min(...temps), mx = Math.max(...temps);
  const from = 118, to = 166;
  const step = (to - from) / Math.max(1, hrs.length);
  return (
    <g className={'o-hourly' + (hl ? ' hl' : '')}>
      <Frame from={from} to={to} r1={430} label="HAVA · 12 SAAT" at={from - 4} anchor="start" />
      {hrs.length === 0 && <text x={polar(320, 140)[0]} y={polar(320, 140)[1]} className="o-na">veri yok</text>}
      {hrs.map((h, i) => {
        const a = from + step * (i + 0.5);
        const len = 18 + 90 * (mx > mn ? (h.temp - mn) / (mx - mn) : 0.5);
        const [x0, y0] = polar(R0 + 10, a), [x1, y1] = polar(R0 + 10 + len, a), [tx, ty] = polar(R0 + 18 + len, a);
        const [rx, ry] = polar(R0 + 140, a);
        const p = (h.rain_prob ?? 0) / 100;
        return (
          <g key={h.time}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} className="o-bar" />
            {i % 3 === 0 && (
              <text x={tx} y={ty} className="o-t" dominantBaseline="middle" transform={rot(a, tx, ty, false)}>{h.time} {Math.round(h.temp)}°</text>
            )}
            <circle cx={rx} cy={ry} r={1.5 + p * 5} className={'o-rain' + (p >= 0.4 ? ' wet' : '')} />
          </g>
        );
      })}
    </g>
  );
}

/** Haber kaynakları: çekirdekten çıkan kılavuz çizgileri, sağda durum noktası. */
function Sources({ d }: { d: Dashboard | null }) {
  const src = d?.news.sources ?? [];
  const from = 48, to = 104;
  const step = (to - from) / Math.max(1, src.length - 1);
  const x2 = 470;
  return (
    <g className="o-sources">
      <text x={x2} y={polar(R0, from)[1] - 30} className="o-label">KAYNAKLAR · {d?.news.sources_ok ?? 0}/{d?.news.sources_total ?? 0}</text>
      {src.map((s, i) => {
        const a = from + step * i;
        const [x0, y0] = polar(R0, a), [x1, y1] = polar(R0 + 26, a);
        const y = -150 + i * (300 / Math.max(1, src.length - 1));
        return (
          <g key={s.name} className={s.ok ? 'ok' : 'bad'}>
            <path d={`M${x0} ${y0}L${x1} ${y1}L${x2 - 40} ${y}L${x2 - 8} ${y}`} className="o-lead" />
            <circle cx={x2} cy={y} r={4.5} className="o-dot" />
            <text x={x2 + 14} y={y} dominantBaseline="middle" className="o-src">{s.name}</text>
            <text x={x2 + 200} y={y} dominantBaseline="middle" textAnchor="end" className="o-cnt">{s.ok ? s.count : 'yok'}</text>
          </g>
        );
      })}
    </g>
  );
}

export const Orbit = memo(function Orbit({ d, hl, dim }: { d: Dashboard | null; hl: string[]; dim: boolean }) {
  return (
    <svg className={'m2-orbit' + (dim ? ' dim' : '')} viewBox="-700 -440 1400 880" aria-hidden="true">
      <circle r={R0} className="o-ring" />
      <circle r={455} className="o-ring faint" />
      <Markets d={d} hl={hl} />
      <Categories d={d} />
      <Hourly d={d} hl={hl.includes('weather')} />
      <Sources d={d} />
    </svg>
  );
});
