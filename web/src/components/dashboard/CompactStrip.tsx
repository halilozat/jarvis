import { memo } from 'react';
import { fmt } from '../../lib/format';
import type { Dashboard, MarketItem } from '../../lib/types';
import { ARROW, direction } from './direction';

function Fx({ item, code }: { item: MarketItem | undefined; code: string }) {
  if (!item) return <span className="st-item na">{code} —</span>;
  const dir = direction(item.change_pct);
  return (
    <span className="st-item">
      {code} <b>{fmt(item.value, 2)}</b> <i className={'mk-chg ' + dir}>{ARROW[dir]}</i>
    </span>
  );
}

/** Dikey ekranlarda (telefon/tablet) tek satırlık özet: USD · EUR. */
export const CompactStrip = memo(function CompactStrip({ data }: { data: Dashboard | null }) {
  if (!data) return <div className="strip"><span className="st-item na">yükleniyor…</span></div>;
  const items = data.markets?.items ?? [];
  return (
    <div className="strip">
      <Fx item={items.find(i => i.code === 'USD')} code="USD" />
      <span className="st-sep" />
      <Fx item={items.find(i => i.code === 'EUR')} code="EUR" />
      {data.demo && <span className="demo-tag">demo</span>}
    </div>
  );
});
