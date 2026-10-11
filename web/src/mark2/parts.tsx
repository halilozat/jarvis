// Mark 2 yapı taşları: hepsi özgün çizim (SVG). Gösterilen her sayı gerçek bir kaynaktan gelir;
// süs çizgileri (tik halkaları, cetveller) veri taşımaz.
import { memo, type ReactNode } from 'react';
import type { Weather } from '../lib/types';
import { WeatherIcon } from '../components/dashboard/WeatherIcon';
import { fmt } from '../lib/format';
import { pad2, useNow } from './stats';

const TAU = Math.PI * 2;
/** Açı (derece, 0 = yukarı, saat yönü) → nokta */
export const polar = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};
/** r yarıçaplı yay (derece, 0 = yukarı, saat yönü) */
export function arc(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  const large = Math.abs(to - from) % 360 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} ${to > from ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
/** Halka dilimi (r0 iç, r1 dış) */
export function sector(r0: number, r1: number, from: number, to: number): string {
  const [a, b] = polar(r1, from), [c, d] = polar(r1, to), [e, f] = polar(r0, to), [g, h] = polar(r0, from);
  const large = to - from > 180 ? 1 : 0;
  return `M${a} ${b}A${r1} ${r1} 0 ${large} 1 ${c} ${d}L${e} ${f}A${r0} ${r0} 0 ${large} 0 ${g} ${h}Z`;
}

/** Tik halkası (süs) */
export function Ticks({ r, n, len, every = 0, longLen = 0, className = 'tk' }: { r: number; n: number; len: number; every?: number; longLen?: number; className?: string }) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const l = every && i % every === 0 ? longLen : len;
    const [x0, y0] = polar(r, (i / n) * 360);
    const [x1, y1] = polar(r - l, (i / n) * 360);
    d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return <path d={d} className={className} />;
}

// ---------------------------------------------------------------- Kutu

export function Box({ title, meta, children, className = '' }: { title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'m2-box ' + className}>
      <header>
        <i className="m2-notch" />
        <span className="m2-title">{title}</span>
        {meta !== undefined && <span className="m2-meta">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/** Etiket · değer · ince çubuk */
export function Row({ k, v, frac, tone = 'ok' }: { k: string; v: ReactNode; frac?: number | null; tone?: 'ok' | 'warn' | 'bad' | 'dim' }) {
  return (
    <div className={'m2-row ' + tone}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      {frac !== undefined && <span className="bar"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, frac ?? 0)) * 100)}%` }} /></span>}
    </div>
  );
}

// ---------------------------------------------------------------- Gün cetveli

const MONTHS = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
const DAYS = ['PAZAR', 'PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ'];

/** Ayın günleri; bugün kutulu, geçen günler sönük. Dar ekranda bugünün ±6 günü. */
export const DayRuler = memo(function DayRuler({ day, month, year }: { day: number; month: number; year: number }) {
  const n = new Date(year, month + 1, 0).getDate();
  return (
    <div className="m2-ruler">
      <span className="m2-ruler-m">{MONTHS[month]} {year}</span>
      <div className="m2-ruler-days">
        {Array.from({ length: n }, (_, i) => i + 1).map(d => (
          <span key={d} className={(d === day ? 'today ' : d < day ? 'past ' : '') + (Math.abs(d - day) > 6 ? 'far' : '')}>{pad2(d)}</span>
        ))}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------- Tarih halkası

/** Ay, gün, hafta günü, saat; dış yay günün geçen kısmı, iç noktalar saniye. */
export function DateDial() {
  const now = useNow(1000);
  const sec = now.getSeconds();
  const dayFrac = (now.getHours() * 3600 + now.getMinutes() * 60 + sec) / 86400;
  return (
    <div className="m2-datedial">
      <svg viewBox="-110 -110 220 220">
        <circle r={104} className="ln dim" />
        <Ticks r={100} n={60} len={3} every={5} longLen={8} />
        <path d={arc(92, 0, Math.max(0.5, dayFrac * 360))} className="ln thick" />
        <circle r={86} className="ln dim" />
        {Array.from({ length: 60 }, (_, i) => {
          const [x, y] = polar(80, i * 6);
          return <circle key={i} cx={x} cy={y} r={i === sec ? 2.6 : 1.1} className={i <= sec ? 'sdot on' : 'sdot'} />;
        })}
        <text y={-38} className="t-sm" textAnchor="middle">{MONTHS[now.getMonth()]}</text>
        <text y={22} className="t-xl" textAnchor="middle">{pad2(now.getDate())}</text>
        <text y={46} className="t-sm" textAnchor="middle">{DAYS[now.getDay()]}</text>
      </svg>
      <div className="m2-clock">
        {pad2(now.getHours())}:{pad2(now.getMinutes())}<small>{pad2(sec)}</small>
        <span>günün %{Math.round(dayFrac * 100)}'i geride</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Halka gösterge

export function RingGauge({ frac, value, unit, label, sub, tone = 'ok' }: { frac: number | null; value: ReactNode; unit?: string; label: string; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  const f = frac === null ? 0 : Math.max(0, Math.min(1, frac));
  return (
    <div className={'m2-ring ' + tone}>
      <svg viewBox="-60 -60 120 120">
        <Ticks r={57} n={40} len={2.5} every={10} longLen={6} />
        <circle r={48} className="ln dim" strokeWidth={7} />
        {frac !== null && <path d={arc(48, 0, Math.max(1, f * 359.9))} className="ln val" strokeWidth={7} />}
        <circle r={38} className="ln dim dash" />
        <text y={6} className="t-md" textAnchor="middle">{value}{unit && <tspan className="t-unit">{unit}</tspan>}</text>
      </svg>
      <div className="m2-ring-l">{label}</div>
      {sub && <div className="m2-ring-s">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Hava halkası

const minutes = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);

/**
 * Sıcaklık + 24 saatlik gün halkası: gündüz yayı (gün doğumu–batımı), şimdiki saat imleci,
 * iç yay sıcaklığın bugünkü en düşük–en yüksek arasındaki yeri, dış noktalar 12 saatlik yağış olasılığı.
 */
export function WeatherDial({ w, highlight }: { w: Weather | null; highlight: boolean }) {
  const now = useNow(30_000);
  if (!w) return <div className="m2-wx empty">hava verisi alınamadı</div>;
  const rise = minutes(w.sunrise), set = minutes(w.sunset);
  const nowDeg = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 360;
  const span = w.today.max - w.today.min || 1;
  const tf = Math.max(0, Math.min(1, (w.temp - w.today.min) / span));
  return (
    <div className={'m2-wx' + (highlight ? ' hl' : '')}>
      <svg viewBox="-110 -110 220 220">
        <circle r={104} className="ln dim" />
        <Ticks r={104} n={24} len={5} every={6} longLen={10} />
        {rise !== null && set !== null && <path d={arc(96, (rise / 1440) * 360, (set / 1440) * 360)} className="ln day" strokeWidth={5} />}
        {(() => { const [x, y] = polar(96, nowDeg); return <circle cx={x} cy={y} r={5} className="now" />; })()}
        {w.hourly.map((h, i) => {
          const [x, y] = polar(84, ((Number(h.time.slice(0, 2)) + 0.5) / 24) * 360);
          const p = (h.rain_prob ?? 0) / 100;
          return <circle key={i} cx={x} cy={y} r={1.5 + p * 4} className={'rain' + (p >= 0.4 ? ' wet' : '')} />;
        })}
        <circle r={74} className="ln dim dash" />
        <path d={arc(66, 210, 210 + 300 * tf)} className="ln val" strokeWidth={4} />
        <path d={arc(66, 210 + 300 * tf, 510)} className="ln dim" strokeWidth={4} />
        {['00', '06', '12', '18'].map((t, i) => { const [x, y] = polar(116, i * 90); return <text key={t} x={x} y={y + 3} className="t-xs" textAnchor="middle">{t}</text>; })}
        <text y={14} className="t-xl" textAnchor="middle">{Math.round(w.temp)}°</text>
        <text y={36} className="t-xs" textAnchor="middle">{Math.round(w.today.min)}° · {Math.round(w.today.max)}°</text>
      </svg>
      <div className="m2-wx-side">
        <WeatherIcon icon={w.icon} size={40} />
        <div className="m2-wx-city">{w.city.toLocaleUpperCase('tr')}</div>
        <div className="m2-wx-desc">{w.description}</div>
        <div className="m2-wx-kv">his {fmt(Math.round(w.feels_like))}° · rüzgâr {fmt(Math.round(w.wind))} km/s</div>
        {w.sunrise && w.sunset && <div className="m2-wx-kv">☀ {w.sunrise} – {w.sunset}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Yuvarlak düğme

export function RoundButton({ label, onClick, children, big = false, active = false, disabled = false }: { label: string; onClick(): void; children: ReactNode; big?: boolean; active?: boolean; disabled?: boolean }) {
  return (
    <button className={'m2-btn' + (big ? ' big' : '') + (active ? ' on' : '')} onClick={onClick} disabled={disabled} aria-label={label}>
      <svg viewBox="-50 -50 100 100" className="m2-btn-ring">
        <circle r={46} className="ln dim" />
        <path d={arc(46, -40, 40) + arc(46, 140, 220)} className="ln val" strokeWidth={3} />
        <circle r={38} className="ln dim dash spin" />
      </svg>
      <span className="m2-btn-ic">{children}</span>
      <span className="m2-btn-l">{label}</span>
    </button>
  );
}

export { TAU };
