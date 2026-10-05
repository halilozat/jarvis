import { motion } from 'framer-motion';
import { memo } from 'react';
import { CATEGORY_LABEL, type NewsStats } from '../../lib/types';
import { DashPanel, NoData } from './common';

export const NewsStatsPanel = memo(function NewsStatsPanel({
  index,
  data,
  loading,
  demo,
}: {
  index: number;
  data: NewsStats | null;
  loading: boolean;
  demo: boolean;
}) {
  const cats = data?.by_category.slice(0, 6) ?? [];
  const max = Math.max(1, ...cats.map(c => c.count));
  return (
    <DashPanel index={index} label="Gündem" demo={demo} className="ns">
      {loading ? (
        <NoData loading />
      ) : !data || data.total === 0 ? (
        <NoData />
      ) : (
        <>
          <div className="ns-total">
            <b>{data.total}</b> haber <span className="sep">·</span> <b>{data.sources_ok}</b> kaynak
          </div>
          <ul className="ns-bars">
            {cats.map((c, i) => (
              <li key={c.category}>
                <span className="ns-cat">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                <span className="ns-track">
                  <motion.i
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: c.count / max }}
                    transition={{ delay: 0.35 + i * 0.07, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </span>
                <span className="ns-n">{c.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashPanel>
  );
});
