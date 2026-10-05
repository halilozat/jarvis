import { motion } from 'framer-motion';
import { memo } from 'react';
import { fmt, trDate } from '../../lib/format';
import type { MarketItem, Markets } from '../../lib/types';
import { DashPanel, NoData } from './common';
import { ARROW, direction } from './direction';

function Sparkline({ points, delay }: { points: MarketItem['history']; delay: number }) {
  if (points.length < 2) return <svg className="spark" viewBox="0 0 80 26" />;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i: number) => 2 + (i / (points.length - 1)) * 76;
  const y = (v: number) => 23 - ((v - min) / span) * 20;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  return (
    <svg className="spark" viewBox="0 0 80 26" aria-hidden="true">
      <motion.path d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay, ease: 'easeInOut' }} />
      <motion.circle cx={x(points.length - 1)} cy={y(last.value)} r={2.2} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + 1.1 }} />
    </svg>
  );
}

function change(pct: number | null) {
  if (pct === null) return '—';
  return `%${fmt(Math.abs(pct), 2)}`;
}

export const MarketsPanel = memo(function MarketsPanel({
  index,
  data,
  loading,
  demo,
  highlight,
}: {
  index: number;
  data: Markets | null;
  loading: boolean;
  demo: boolean;
  /** Vurgulanan konular; içinde bir kur kodu varsa o satır parlar. Aynı dizi referansı korunur (memo). */
  highlight: readonly string[];
}) {
  return (
    <DashPanel index={index} label="Piyasalar" meta={data ? 'satış' : undefined} demo={demo} highlight={data?.items.some(it => highlight.includes(it.code)) ?? false} className="mk">
      {loading ? (
        <NoData loading />
      ) : !data ? (
        <NoData />
      ) : (
        <>
          <div className="mk-rows">
            {data.items.map((it, i) => {
              const dir = direction(it.change_pct);
              return (
                <div key={it.code} className={'mk-row' + (highlight.includes(it.code) ? ' hl-row' : '')} title={it.name}>
                  <span className="mk-code">{it.code}</span>
                  <span className="mk-val">{fmt(it.value, 2)}</span>
                  <span className={'mk-chg ' + dir}>{ARROW[dir]} {change(it.change_pct)}</span>
                  {/* Veri değişince çizgi yeniden çizilsin */}
                  <Sparkline key={data.date} points={it.history} delay={0.3 + i * 0.15} />
                </div>
              );
            })}
          </div>
          <div className="panel-source">{data.source === 'TCMB' ? 'tcmb' : 'demo'} · {trDate(data.date)} bülteni</div>
        </>
      )}
    </DashPanel>
  );
});
