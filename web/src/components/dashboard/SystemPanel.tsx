import { memo } from 'react';
import { DeviceIcon } from '../Chrome';
import { DEVICE_LABEL, type Device, type NewsStats, type SystemStats } from '../../lib/types';
import { DashPanel, NoData } from './common';

const SWEEP_S = 4; // radar bir turu kaç saniyede atar
const BEAM_DEG = 45; // ışın, tarama diliminin saat yönündeki kenarında

/**
 * Radar: tarama CSS ile döner. Noktalar rastgele değil; cevap veren kaynak sayısı kadar, altın açıyla
 * yerleşir ve her biri ışın üzerinden geçtiği anda parlar (gecikmesi açısından hesaplanır).
 */
const Radar = memo(function Radar({ count }: { count: number }) {
  const dots = Array.from({ length: count }, (_, i) => {
    const angle = (i * 137.508) % 360;
    const r = 12 + (i % 3) * 11;
    const rad = (angle * Math.PI) / 180;
    const hitAt = (((angle - BEAM_DEG + 360) % 360) / 360) * SWEEP_S;
    return { x: r * Math.sin(rad), y: -r * Math.cos(rad), delay: hitAt - SWEEP_S };
  });
  const bx = 40 * Math.sin((BEAM_DEG * Math.PI) / 180), by = -40 * Math.cos((BEAM_DEG * Math.PI) / 180);
  return (
    <svg className="radar" viewBox="-44 -44 88 88" aria-hidden="true">
      {[40, 27, 14].map(r => <circle key={r} r={r} className="radar-ring" />)}
      <line x1={-40} y1={0} x2={40} y2={0} className="radar-axis" />
      <line x1={0} y1={-40} x2={0} y2={40} className="radar-axis" />
      <g className="radar-sweep" style={{ animationDuration: `${SWEEP_S}s` }}>
        <path d={`M0 0L0 -40A40 40 0 0 1 ${bx} ${by}Z`} className="radar-wedge" />
        <line x1={0} y1={0} x2={bx} y2={by} className="radar-beam" />
      </g>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={2.3} className="radar-dot" style={{ animationDelay: `${d.delay}s`, animationDuration: `${SWEEP_S}s` }} />
      ))}
    </svg>
  );
});

function latencyClass(sys: SystemStats) {
  if (!sys.routellm_ok || sys.routellm_ms === null) return 'bad';
  if (sys.routellm_ms < 800) return 'ok';
  return sys.routellm_ms < 2000 ? 'warn' : 'bad';
}

export const SystemPanel = memo(function SystemPanel({
  index,
  sys,
  news,
  online,
  demo,
  loading,
}: {
  index: number;
  sys: SystemStats | null;
  news: NewsStats | null;
  online: Device[];
  demo: boolean;
  loading: boolean;
}) {
  return (
    <DashPanel index={index} label="Sistem" demo={demo} className="sys">
      {loading || !sys || !news ? (
        <NoData loading={loading} />
      ) : (
        <div className="sys-body">
          {/* Sayı değişince radar yeniden kurulur; tarama ile noktalar aynı anda başlasın diye */}
          <Radar key={news.sources_ok} count={news.sources_ok} />
          <dl className="kv">
            <div>
              <dt>routellm</dt>
              <dd><i className={'dot ' + latencyClass(sys)} />{sys.routellm_ok && sys.routellm_ms !== null ? `${sys.routellm_ms} ms` : 'erişilemiyor'}</dd>
            </div>
            <div>
              <dt>kaynaklar</dt>
              <dd className={news.sources_ok === news.sources_total ? 'good' : news.sources_ok ? 'warn' : 'bad'}>
                {news.sources_ok}/{news.sources_total} {news.sources_ok === news.sources_total ? '✓' : ''}
              </dd>
            </div>
            <div>
              <dt>cihazlar</dt>
              <dd className="sys-devices">
                {(['masaustu', 'tablet', 'telefon'] as Device[]).map(d => (
                  <span key={d} className={online.includes(d) ? 'on' : ''} title={DEVICE_LABEL[d]}><DeviceIcon d={d} /></span>
                ))}
              </dd>
            </div>
            <div><dt>beyin</dt><dd className="mono">{sys.model}</dd></div>
          </dl>
        </div>
      )}
    </DashPanel>
  );
});
