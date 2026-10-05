import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { DEVICE_LABEL, type Device } from '../lib/types';

export function DeviceIcon({ d }: { d: Device }) {
  if (d === 'telefon') return <svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><line x1="11" y1="18.5" x2="13" y2="18.5" /></svg>;
  if (d === 'tablet') return <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
  return <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.6" /><line x1="8" y1="20" x2="16" y2="20" /><line x1="12" y1="16" x2="12" y2="20" /></svg>;
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="clock">
      <div className="time">{now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="date">{now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  );
}

export function TopBar({ me, online, model, connected, mock }: { me: Device; online: Device[]; model: string | null; connected: boolean; mock: boolean }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">JARVIS</span>
        <span className={'link ' + (connected ? 'on' : 'off')}>{connected ? 'çevrimiçi' : 'bağlanıyor…'}</span>
        {mock && <span className="demo">DEMO</span>}
      </div>
      <div className="devices">
        {(['masaustu', 'tablet', 'telefon'] as Device[]).map(d => (
          <div key={d} className={'dev ' + (online.includes(d) ? 'on ' : '') + (d === me ? 'me' : '')} title={DEVICE_LABEL[d]}>
            <DeviceIcon d={d} />
            <span>{DEVICE_LABEL[d]}</span>
          </div>
        ))}
      </div>
      <div className="right">
        <AnimatePresence mode="wait">
          {model && (
            <motion.div key={model} className="model-badge" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <span className="k">beyin</span> {model}
            </motion.div>
          )}
        </AnimatePresence>
        <Clock />
      </div>
    </header>
  );
}

export function Telemetry({ lines }: { lines: string[] }) {
  return (
    <div className="telemetry">
      <AnimatePresence initial={false}>
        {lines.slice(-4).map((l, i) => (
          <motion.div key={l + i} className="tl-line" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <span className="tl-dot" />{l}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Handoff({ info }: { info: { kind: 'out' | 'in'; from: Device | null; to: Device } | null }) {
  return (
    <AnimatePresence>
      {info && (
        <motion.div className={'handoff ' + info.kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <motion.div className="handoff-ring" initial={{ scale: info.kind === 'in' ? 0.2 : 1, opacity: 0 }} animate={{ scale: info.kind === 'in' ? 1 : 0.2, opacity: [0, 1, 1, 0] }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
          <div className="handoff-row">
            {info.from && <div className="hd"><DeviceIcon d={info.from} /><span>{DEVICE_LABEL[info.from]}</span></div>}
            <motion.div className="hd-arrow" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />
            <div className="hd"><DeviceIcon d={info.to} /><span>{DEVICE_LABEL[info.to]}</span></div>
          </div>
          <div className="handoff-text">{info.kind === 'in' ? 'oturum devralındı' : `oturum ${DEVICE_LABEL[info.to].toLocaleLowerCase('tr')} cihazına aktarıldı`}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
