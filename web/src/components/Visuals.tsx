import { motion } from 'framer-motion';
import { Fragment, type ReactNode } from 'react';
import { CountUp } from './CountUp';
import { Icon } from './Icon';
import { fmt } from '../lib/format';
import type { Gorsel } from '../lib/types';
import { TR_H, TR_PATH, TR_W, project } from '../data/turkey';
import { cityCoord } from '../data/cities';

function Panel({ label, source, children, className = '' }: { label?: string; source?: string; children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={'panel ' + className}
      initial={{ opacity: 0, scale: 0.94, clipPath: 'inset(0 0 100% 0)' }}
      animate={{ opacity: 1, scale: 1, clipPath: 'inset(0 0 0% 0)' }}
      exit={{ opacity: 0, scale: 1.03, filter: 'blur(6px)' }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      {label && <div className="panel-label">{label}</div>}
      {children}
      {source && <div className="panel-source">kaynak · {source}</div>}
    </motion.div>
  );
}

const decimals = (n: number) => (String(n).split('.')[1] || '').length;

function Sayi({ g }: { g: Extract<Gorsel, { tip: 'sayi' }> }) {
  const arrow = g.yon === 'yukari' ? '▲' : g.yon === 'asagi' ? '▼' : g.yon === 'sabit' ? '■' : '';
  return (
    <Panel label={g.etiket} source={g.kaynak} className="v-sayi">
      <div className="big-number">
        {g.birim === '%' && <span className="unit pre">%</span>}
        <CountUp to={g.deger} digits={decimals(g.deger)} />
        {g.birim && g.birim !== '%' && <span className="unit">{g.birim}</span>}
      </div>
      {arrow && (
        <motion.div className={'trend ' + g.yon} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}>
          {arrow} {g.yon === 'yukari' ? 'yükseliş' : g.yon === 'asagi' ? 'düşüş' : 'değişmedi'}
        </motion.div>
      )}
    </Panel>
  );
}

function Grafik({ g }: { g: Extract<Gorsel, { tip: 'grafik' }> }) {
  const W = 420, H = 210, P = 28;
  const vals = g.seri.map(p => p.deger);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min || 1) * 0.25;
  const y = (v: number) => H - P - ((v - (min - pad)) / (max - min + pad * 2)) * (H - P * 2);
  const x = (i: number) => P + (i / Math.max(1, g.seri.length - 1)) * (W - P * 2);
  const d = g.seri.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.deger)}`).join('');
  const area = `${d}L${x(g.seri.length - 1)},${H - P}L${x(0)},${H - P}Z`;
  const last = g.seri[g.seri.length - 1];
  return (
    <Panel label={g.baslik} source={g.kaynak} className="v-grafik">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart">
        <defs>
          <linearGradient id="ga" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={P} x2={W - P} y1={P + f * (H - P * 2)} y2={P + f * (H - P * 2)} className="grid" />)}
        <motion.path d={area} fill="url(#ga)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.6 }} />
        <motion.path d={d} className="line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: 'easeInOut' }} />
        {g.seri.map((p, i) => (
          <g key={i}>
            <motion.circle cx={x(i)} cy={y(p.deger)} r={4} className="dot" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + (i / g.seri.length) * 1.1 }} />
            <text x={x(i)} y={H - 6} className="axis" textAnchor="middle">{p.etiket}</text>
          </g>
        ))}
        <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}>
          <text x={x(g.seri.length - 1)} y={y(last.deger) - 14} textAnchor="end" className="last">{fmt(last.deger)} {g.birim}</text>
        </motion.g>
      </svg>
    </Panel>
  );
}

function Harita({ g }: { g: Extract<Gorsel, { tip: 'harita' }> }) {
  // Şehir adları (hazır koordinat) + wiki_lookup'tan gelen koordinatlar (yalnızca Türkiye sınırları içinde çizilir).
  const inTurkey = (lon: number, lat: number) => lon >= 25.5 && lon <= 45 && lat >= 35.8 && lat <= 42.2;
  const pts = [
    ...g.sehirler.map(c => ({ c, xy: cityCoord(c) })),
    ...(g.noktalar ?? []).filter(p => inTurkey(p.lon, p.lat)).map(p => ({ c: p.ad, xy: [p.lon, p.lat] as [number, number] })),
  ].filter((p, i, all) => p.xy && all.findIndex(q => q.c === p.c) === i) as { c: string; xy: [number, number] }[];
  return (
    <Panel label={g.etiket} className="v-harita">
      <svg viewBox={`0 0 ${TR_W} ${TR_H}`} className="map">
        <motion.path d={TR_PATH} className="land" initial={{ pathLength: 0, fillOpacity: 0 }} animate={{ pathLength: 1, fillOpacity: 1 }} transition={{ pathLength: { duration: 1.6, ease: 'easeInOut' }, fillOpacity: { delay: 1.2, duration: 0.6 } }} />
        {pts.map(({ c, xy }, i) => {
          const [px, py] = project(xy[0], xy[1]);
          return (
            <g key={c}>
              {[0, 1, 2].map(k => (
                <motion.circle key={k} cx={px} cy={py} r={8} className="pulse" initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 5, opacity: 0 }} transition={{ delay: 1.2 + i * 0.3 + k * 0.6, duration: 1.8, repeat: Infinity, repeatDelay: 0.2 }} style={{ transformOrigin: `${px}px ${py}px` }} />
              ))}
              <motion.circle cx={px} cy={py} r={9} className="city" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1 + i * 0.3, type: 'spring' }} style={{ transformOrigin: `${px}px ${py}px` }} />
              <motion.text x={px + 16} y={py - 14} className="city-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 + i * 0.3 }}>{c.toLocaleUpperCase('tr')}</motion.text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

function Baslik({ g }: { g: Extract<Gorsel, { tip: 'baslik' }> }) {
  const words = g.metin.split(' ');
  return (
    <Panel className="v-baslik" source={g.kaynaklar?.join(', ')}>
      {g.kategori && <div className="chip">{g.kategori.toLocaleUpperCase('tr')}</div>}
      <h2 className="headline">
        {/* Boşluk span'in DIŞINDA durmalı: .headline span inline-block ve kutu sonundaki boşluk kırpılıyor. */}
        {words.map((w, i) => (
          <Fragment key={i}>
            <motion.span initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.25 + i * 0.06 }}>
              {w}
            </motion.span>
            {i < words.length - 1 && ' '}
          </Fragment>
        ))}
      </h2>
    </Panel>
  );
}

function Karsilastirma({ g }: { g: Extract<Gorsel, { tip: 'karsilastirma' }> }) {
  return (
    <Panel label={g.olay} className="v-karsi">
      <div className="sides">
        {g.taraflar.slice(0, 2).map((t, i) => (
          <motion.div key={i} className={'side s' + i} initial={{ opacity: 0, x: i ? 40 : -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.25, ease: 'easeOut' }}>
            <div className="side-src">{t.kaynak}</div>
            <div className="side-txt">{t.ozet}</div>
          </motion.div>
        ))}
        <motion.div className="vs" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring' }}>⇄</motion.div>
      </div>
    </Panel>
  );
}

function Zaman({ g }: { g: Extract<Gorsel, { tip: 'zaman' }> }) {
  return (
    <Panel label="Bugün" className="v-zaman">
      <ul className="timeline">
        {g.olaylar.map((o, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }}>
            <span className="t">{o.zaman}</span><span>{o.metin}</span>
          </motion.li>
        ))}
      </ul>
    </Panel>
  );
}

function Liste({ g }: { g: Extract<Gorsel, { tip: 'liste' }> }) {
  return (
    <Panel label={g.baslik} className="v-liste">
      <ul className="items">
        {g.maddeler.map((m, i) => (
          <motion.li key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.12 }}>{m}</motion.li>
        ))}
      </ul>
    </Panel>
  );
}

function Ikon({ g }: { g: Extract<Gorsel, { tip: 'ikon' }> }) {
  return (
    <Panel className="v-ikon">
      <motion.div className="ikon-orb" initial={{ scale: 0.4, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.15 }}>
        <span className="ikon-ring" />
        <Icon name={g.ikon} size={84} />
      </motion.div>
      <motion.div className="ikon-title" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>{g.baslik}</motion.div>
      {g.alt && <motion.div className="ikon-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>{g.alt}</motion.div>}
    </Panel>
  );
}

function Kart({ g }: { g: Extract<Gorsel, { tip: 'kart' }> }) {
  return (
    <Panel label={g.baslik} className="v-kart">
      <ul className="kart-items">
        {g.maddeler.map((m, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.14 }}>
            <span className="kart-ic"><Icon name={m.ikon} size={22} /></span>
            <span>{m.metin}</span>
          </motion.li>
        ))}
      </ul>
    </Panel>
  );
}

function Adimlar({ g }: { g: Extract<Gorsel, { tip: 'adimlar' }> }) {
  return (
    <Panel label={g.baslik} className="v-adimlar">
      <ol className="steps">
        {g.adimlar.map((a, i) => (
          <motion.li key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.16 }}>
            <span className="step-n">{i + 1}</span>
            <span className="step-t">{a}</span>
          </motion.li>
        ))}
      </ol>
    </Panel>
  );
}

function Alinti({ g }: { g: Extract<Gorsel, { tip: 'alinti' }> }) {
  return (
    <Panel className="v-alinti" source={g.kaynak}>
      <motion.div className="quote-mark" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>“</motion.div>
      <motion.blockquote initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>{g.metin}</motion.blockquote>
    </Panel>
  );
}

/** Wikipedia fotoğraflı tanıtım kartı. Fotoğraf ve atıf sunucudan (lisans bilgisiyle) gelir. */
function KisiYer({ g }: { g: Extract<Gorsel, { tip: 'kisi_yer' }> & { foto?: Gorsel['foto'] } }) {
  return (
    <Panel className="v-kisi">
      <div className="kisi-body">
        {g.foto && (
          <motion.figure className="kisi-foto" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
            <img src={g.foto.url} alt={g.baslik} onError={e => ((e.target as HTMLImageElement).parentElement!.style.display = 'none')} />
            <figcaption>{g.foto.credit}</figcaption>
          </motion.figure>
        )}
        <div>
          <div className="chip">Wikipedia</div>
          <h2 className="kisi-name">{g.baslik}</h2>
          <motion.p className="kisi-ozet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>{g.ozet}</motion.p>
        </div>
      </div>
    </Panel>
  );
}

export function Visual({ g }: { g: Gorsel }) {
  switch (g.tip) {
    case 'sayi': return <Sayi g={g} />;
    case 'grafik': return <Grafik g={g} />;
    case 'harita': return <Harita g={g} />;
    case 'baslik': return <Baslik g={g} />;
    case 'karsilastirma': return <Karsilastirma g={g} />;
    case 'zaman': return <Zaman g={g} />;
    case 'liste': return <Liste g={g} />;
    case 'ikon': return <Ikon g={g} />;
    case 'kart': return <Kart g={g} />;
    case 'adimlar': return <Adimlar g={g} />;
    case 'alinti': return <Alinti g={g} />;
    case 'kisi_yer': return <KisiYer g={g} />;
    default: return null;
  }
}
