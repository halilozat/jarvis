import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Pano paneli: mevcut cam panel dili (.panel + köşe braketleri). Açılışta sırayla (0,08 sn arayla)
 * aşağıdan kayarak ve clip-path ile açılarak gelir.
 */
export function DashPanel({
  index,
  label,
  meta,
  demo = false,
  highlight = false,
  className = '',
  children,
}: {
  index: number;
  label: string;
  meta?: ReactNode;
  demo?: boolean;
  highlight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      className={`panel dash-panel ${className}${highlight ? ' hl' : ''}`}
      initial={{ opacity: 0, y: 16, clipPath: 'inset(0 0 100% 0)' }}
      animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
      transition={{ delay: index * 0.08, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      <header className="dash-head">
        <span className="panel-label">{label}</span>
        {demo && <span className="demo-tag">demo</span>}
        {meta && <span className="dash-meta">{meta}</span>}
      </header>
      {children}
    </motion.section>
  );
}

/** Veri yokken ya da yüklenirken gösterilen tek satır. Asla tahmini değer koymaz. */
export function NoData({ loading = false }: { loading?: boolean }) {
  return <div className={'no-data' + (loading ? ' loading' : '')}>{loading ? 'yükleniyor…' : 'veri alınamadı'}</div>;
}
