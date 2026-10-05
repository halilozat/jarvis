import { memo } from 'react';
import { CATEGORY_LABEL, type NewsStats } from '../../lib/types';

/**
 * Alttaki kayan haber şeridi. Tamamen CSS @keyframes: içerik iki kez yan yana konur, şerit -%50 kayınca
 * başa sarar ve kesintisiz döner. Fare üstündeyken durur. React hiç yeniden çizmez.
 */
export const HeadlineTicker = memo(function HeadlineTicker({
  headlines,
  loading,
  demo,
}: {
  headlines: NewsStats['headlines'] | null;
  loading: boolean;
  demo: boolean;
}) {
  const items = headlines ?? [];
  // Hız sabit kalsın diye süre metin uzunluğuyla orantılı (~70 px/sn).
  const chars = items.reduce((n, h) => n + h.title.length + h.source.length + 12, 0);
  const row = (copy: number) =>
    items.map((h, i) => (
      <span className="tk-item" key={`${copy}-${i}`}>
        <span className="tk-cat">{CATEGORY_LABEL[h.category] ?? h.category}</span>
        <span className="tk-title">{h.title}</span>
        <span className="tk-src">{h.source}</span>
      </span>
    ));
  return (
    <div className="ticker">
      <div className="tk-label">
        <span className="tk-pulse" />son dakika{demo && <span className="demo-tag">demo</span>}
      </div>
      <div className="tk-viewport">
        {items.length ? (
          <div className="tk-track" style={{ animationDuration: `${Math.max(30, Math.round(chars * 0.11))}s` }}>
            <div className="tk-row">{row(0)}</div>
            <div className="tk-row" aria-hidden="true">{row(1)}</div>
          </div>
        ) : (
          <div className="no-data">{loading ? 'yükleniyor…' : 'veri alınamadı'}</div>
        )}
      </div>
    </div>
  );
});
