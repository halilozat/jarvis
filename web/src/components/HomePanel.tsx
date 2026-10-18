// Akıllı ev paneli: iki ışık, iki kahve makinesi. Durum sunucuda; her değişiklik SSE ile tüm ekranlara yansır.
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { token } from '../lib/api';

export type IsikTon = 'sicak' | 'notr' | 'soguk';
export interface Light { id: string; ad: string; oda: string; tur: 'isik'; acik: boolean; parlaklik: number; ton: IsikTon; updated: number }
export interface TurkishCoffee { id: string; ad: string; oda: string; tur: 'turk_kahve'; durum: 'beklemede' | 'hazirlaniyor' | 'hazir'; kopuk: 'az' | 'orta' | 'bol'; seker: 'sade' | 'az' | 'orta' | 'sekerli'; basladi: number | null; sure: number; updated: number }
export interface FilterCoffee { id: string; ad: string; oda: string; tur: 'filtre_kahve'; durum: 'beklemede' | 'demleniyor' | 'sicak_tutuyor'; fincan: number; basladi: number | null; sure: number; updated: number }
export type HomeDevice = Light | TurkishCoffee | FilterCoffee;
export interface HomeState { mode: 'simulasyon' | 'homeassistant'; devices: HomeDevice[]; real: string[]; last?: { id: string; ozet: string } }

const headers = (): HeadersInit => ({ 'Content-Type': 'application/json', ...(token ? { 'x-jarvis-token': token } : {}) });
export const getHome = (): Promise<HomeState | null> => fetch('/api/home', { headers: headers() }).then(r => (r.ok ? r.json() : null)).catch(() => null);
export const homeAct = (id: string, body: object) => fetch(`/api/home/${id}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });

/** Kahve makinesinin ilerlemesi 0..1 (sunucunun verdiği başlangıç ve süreden) */
export function progressOf(d: TurkishCoffee | FilterCoffee, now = Date.now()): number {
  if (!d.basladi) return d.durum === 'hazir' || d.durum === 'sicak_tutuyor' ? 1 : 0;
  return Math.min(1, Math.max(0, (now - d.basladi) / d.sure));
}
export function statusText(d: HomeDevice, now = Date.now()): string {
  if (d.tur === 'isik') return d.acik ? `%${d.parlaklik}` : 'kapalı';
  if (d.tur === 'turk_kahve') return d.durum === 'hazirlaniyor' ? `hazırlanıyor %${Math.round(progressOf(d, now) * 100)}` : d.durum === 'hazir' ? 'hazır ☕' : 'beklemede';
  return d.durum === 'demleniyor' ? `demleniyor %${Math.round(progressOf(d, now) * 100)}` : d.durum === 'sicak_tutuyor' ? 'sıcak tutuyor' : 'beklemede';
}

function useTick(on: boolean) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { if (!on) return; const id = setInterval(() => setT(Date.now()), 500); return () => clearInterval(id); }, [on]);
  return t;
}

function Ring({ p, children }: { p: number; children: React.ReactNode }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="hp-ring">
      <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r={r} className="bg" /><circle cx="40" cy="40" r={r} className="fg" strokeDasharray={c} strokeDashoffset={c * (1 - p)} /></svg>
      <span>{children}</span>
    </div>
  );
}

function LightCard({ d }: { d: Light }) {
  const [p, setP] = useState(d.parlaklik);
  useEffect(() => setP(d.parlaklik), [d.parlaklik]);
  return (
    <div className={'hp-card light' + (d.acik ? ' on' : '')} style={{ ['--glow' as string]: d.ton === 'sicak' ? '#ffcf7a' : d.ton === 'soguk' ? '#bfe6ff' : '#fff3dc', ['--lvl' as string]: d.acik ? d.parlaklik / 100 : 0 }}>
      <header><span className="hp-room">{d.oda}</span><span className="hp-st">{d.acik ? `AÇIK · %${d.parlaklik}` : 'KAPALI'}</span></header>
      <button className="hp-bulb" onClick={() => homeAct(d.id, { islem: d.acik ? 'kapat' : 'ac' })} aria-label={d.acik ? 'Kapat' : 'Aç'}>
        <svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></svg>
      </button>
      <input type="range" min={1} max={100} value={p} disabled={!d.acik} onChange={e => setP(Number(e.target.value))} onPointerUp={() => homeAct(d.id, { islem: 'ayarla', parlaklik: p })} onKeyUp={() => homeAct(d.id, { islem: 'ayarla', parlaklik: p })} />
      <div className="seg">
        {(['sicak', 'notr', 'soguk'] as IsikTon[]).map(t => <button key={t} className={d.ton === t ? 'on' : ''} disabled={!d.acik} onClick={() => homeAct(d.id, { islem: 'ayarla', ton: t })}>{t === 'sicak' ? 'Sıcak' : t === 'notr' ? 'Nötr' : 'Soğuk'}</button>)}
      </div>
    </div>
  );
}

function TurkishCard({ d, now }: { d: TurkishCoffee; now: number }) {
  const busy = d.durum === 'hazirlaniyor';
  return (
    <div className={'hp-card coffee' + (busy ? ' busy' : '') + (d.durum === 'hazir' ? ' done' : '')}>
      <header><span className="hp-room">{d.ad}</span><span className="hp-st">{statusText(d, now).toLocaleUpperCase('tr')}</span></header>
      <Ring p={progressOf(d, now)}>{busy ? `${Math.round(progressOf(d, now) * 100)}%` : d.durum === 'hazir' ? '☕' : '—'}</Ring>
      <label>Köpük</label>
      <div className="seg">{(['az', 'orta', 'bol'] as const).map(k => <button key={k} className={d.kopuk === k ? 'on' : ''} disabled={busy} onClick={() => homeAct(d.id, { islem: 'ayarla', kopuk: k })}>{k === 'az' ? 'Az' : k === 'orta' ? 'Orta' : 'Bol'}</button>)}</div>
      <label>Şeker</label>
      <div className="seg">{(['sade', 'az', 'orta', 'sekerli'] as const).map(k => <button key={k} className={d.seker === k ? 'on' : ''} disabled={busy} onClick={() => homeAct(d.id, { islem: 'ayarla', seker: k })}>{k === 'sade' ? 'Sade' : k === 'az' ? 'Az' : k === 'orta' ? 'Orta' : 'Şekerli'}</button>)}</div>
      <button className="hp-go" onClick={() => homeAct(d.id, { islem: busy ? 'kapat' : 'pisir' })}>{busy ? 'Durdur' : d.durum === 'hazir' ? 'Yeniden pişir' : 'Pişir'}</button>
    </div>
  );
}

function FilterCard({ d, now }: { d: FilterCoffee; now: number }) {
  const busy = d.durum === 'demleniyor';
  return (
    <div className={'hp-card coffee' + (busy ? ' busy' : '') + (d.durum === 'sicak_tutuyor' ? ' done' : '')}>
      <header><span className="hp-room">{d.ad}</span><span className="hp-st">{statusText(d, now).toLocaleUpperCase('tr')}</span></header>
      <Ring p={progressOf(d, now)}>{busy ? `${Math.round(progressOf(d, now) * 100)}%` : d.durum === 'sicak_tutuyor' ? '♨' : '—'}</Ring>
      <label>Fincan</label>
      <div className="seg">{[1, 2, 3, 4].map(n => <button key={n} className={d.fincan === n ? 'on' : ''} disabled={busy} onClick={() => homeAct(d.id, { islem: 'ayarla', fincan: n })}>{n}</button>)}</div>
      <button className="hp-go" onClick={() => homeAct(d.id, { islem: busy || d.durum === 'sicak_tutuyor' ? 'kapat' : 'demle' })}>{busy ? 'Durdur' : d.durum === 'sicak_tutuyor' ? 'Kapat' : 'Demle'}</button>
    </div>
  );
}

export function HomePanel({ home, onClose }: { home: HomeState; onClose(): void }) {
  const busy = home.devices.some(d => d.tur !== 'isik' && (d.durum === 'hazirlaniyor' || d.durum === 'demleniyor'));
  const now = useTick(busy);
  const get = (id: string) => home.devices.find(d => d.id === id);
  const salon = get('salon_isik'), calisma = get('calisma_isik'), turk = get('turk_kahve'), filtre = get('filtre_kahve');
  return (
    <motion.div className="home-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="hp-frame" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10 }} onClick={e => e.stopPropagation()}>
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        <header className="hp-head">
          <span className="hp-title">AKILLI EV</span>
          <span className={'hp-mode ' + home.mode}>{home.mode === 'simulasyon' ? 'simülasyon' : 'Home Assistant'}</span>
          <span className="hp-sp" />
          <button className="vp-close" onClick={onClose} aria-label="Kapat">✕</button>
        </header>
        <div className="hp-grid">
          {salon?.tur === 'isik' && <LightCard d={salon} />}
          {calisma?.tur === 'isik' && <LightCard d={calisma} />}
          {turk?.tur === 'turk_kahve' && <TurkishCard d={turk} now={now} />}
          {filtre?.tur === 'filtre_kahve' && <FilterCard d={filtre} now={now} />}
        </div>
        <p className="hp-hint">Sesle de olur: "Jarvis, salonun ışığını aç", "çalışma odasını yüzde otuz yap", "filtre kahveyi iki fincan demle".</p>
      </motion.div>
    </motion.div>
  );
}

/** Jarvis bir cihazı değiştirince ekranın üstünde kısa HUD bildirimi */
export function HomeToast({ text }: { text: string }) {
  return (
    <motion.div className="home-toast" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <i /> {text}
    </motion.div>
  );
}
