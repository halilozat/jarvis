// Mark 2: yoğun HUD ekranı. Mark 1 ile aynı durum ve veriyi kullanır, yalnızca görünüş farklıdır.
// İlke: ekrandaki her sayı gerçek bir kaynaktan gelir (TCMB, Open-Meteo, haber kaynakları, RouteLLM, bu cihaz).
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, type ReactNode } from 'react';
import { Visual } from '../components/Visuals';
import type { AgendaItem } from '../components/dashboard/agenda';
import { cityCoord } from '../data/cities';
import { DEVICE_LABEL, type CoreState, type Dashboard, type Device, type Gorsel, type JarvisReply, type Photo, type Sahne } from '../lib/types';
import { clockInfo } from '../lib/wake';
import { Globe, type GlobeMarker } from './Globe';
import { HudCore } from './HudCore';
import { Orbit } from './Orbit';
import { Box, DateDial, DayRuler, RingGauge, RoundButton, Row, WeatherDial } from './parts';
import { pad2, useClientStats, useNow } from './stats';
import { progressOf, statusText, type HomeState } from '../components/HomePanel';
import './mark2.css';

export interface Mark2Props {
  device: Device;
  online: Device[];
  connected: boolean;
  mock: boolean;
  model: string | null;
  dash: Dashboard | null;
  core: CoreState;
  level: () => number;
  introAt: number | null;
  reply: JarvisReply | null;
  sceneIdx: number;
  visualScene: Sahne | null;
  visualKey: string;
  photo: Photo | null;
  photoSrc(url: string): string;
  speakingReply: boolean;
  agenda: AgendaItem[];
  caption: string;
  telemetry: string[];
  hl: string[];
  checks: ReactNode;
  panelKey: number;
  input: string;
  setInput(s: string): void;
  onSubmit(text: string): void;
  onMic(): void;
  onCamera(): void;
  /** Canlı kamera paneli (kamera cihazı) */
  onLiveCamera(): void;
  home: HomeState | null;
  onHome(): void;
  onHands(): void;
  onStop(): void;
  onDrawer(d: 'detay' | 'gecmis' | 'ayarlar'): void;
  onSleep(): void;
}

const STATE_LABEL: Record<CoreState, string> = { idle: 'HAZIR', listening: 'DİNLİYOR', thinking: 'ANALİZ', speaking: 'KONUŞUYOR' };

/** Harita sahnesindeki noktalar (şehir adı → koordinat, wiki koordinatları) */
function mapPoints(g: Gorsel | undefined): GlobeMarker[] {
  if (!g || g.tip !== 'harita') return [];
  const pts: GlobeMarker[] = [];
  for (const c of g.sehirler) {
    const xy = cityCoord(c);
    if (xy) pts.push({ lon: xy[0], lat: xy[1], label: c, hot: true });
  }
  for (const p of g.noktalar ?? []) pts.push({ lon: p.lon, lat: p.lat, label: p.ad, hot: true });
  return pts;
}

const hhmm = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

export default function Mark2(p: Mark2Props) {
  const now = useNow(60_000);
  const st = useClientStats();
  const d = p.dash;
  const sys = d?.system;
  const clock = clockInfo();
  const hasVisual = p.speakingReply && !!p.visualScene;

  // Küre: harita sahnesinde o noktalara döner; yoksa hava şehri işaretli, kendi etrafında döner.
  const pts = useMemo(() => mapPoints(p.visualScene?.gorsel), [p.visualScene]);
  const home = d?.weather ? cityCoord(d.weather.city) : null;
  const markers: GlobeMarker[] = pts.length ? pts : home ? [{ lon: home[0], lat: home[1], label: d!.weather!.city }] : [];
  const focus: [number, number] | null = pts.length ? [pts[0].lon, pts[0].lat] : null;

  const ms = sys?.routellm_ms ?? null;
  const latTone = !sys?.routellm_ok || ms === null ? 'bad' : ms < 800 ? 'ok' : ms < 2000 ? 'warn' : 'bad';
  const src = d?.news;
  const curAgenda = p.agenda.findIndex(a => p.sceneIdx >= a.start && p.sceneIdx < a.end);

  return (
    <div className={`mk2 m2-state-${p.core}${hasVisual ? ' with-visual' : ''}`}>
      <div className="m2-bg"><div className="m2-grid" /><div className="m2-rings-bg" /><div className="m2-vig" /></div>

      <header className="m2-top">
        <DayRuler day={now.getDate()} month={now.getMonth()} year={now.getFullYear()} />
        <div className="m2-top-r">
          <span className={'m2-link ' + (p.connected ? 'on' : 'off')}>{p.connected ? 'BAĞLI' : 'BAĞLANIYOR'}</span>
          {p.mock && <span className="m2-demo">DEMO</span>}
          {p.model && <span className="m2-brain">BEYİN · {p.model}</span>}
        </div>
      </header>

      <aside className="m2-left" key={'l' + p.panelKey}>
        <DateDial />
        <Box title="SİSTEM" meta={DEVICE_LABEL[p.device].toLocaleUpperCase('tr')}>
          <Row k="routellm" v={ms !== null && sys?.routellm_ok ? `${ms} ms` : 'erişilemiyor'} frac={ms !== null ? 1 - Math.min(1, ms / 2500) : 0} tone={latTone} />
          <Row k="kaynaklar" v={src ? `${src.sources_ok}/${src.sources_total}` : '—'} frac={src ? src.sources_ok / Math.max(1, src.sources_total) : null} tone={!src ? 'dim' : src.sources_ok === src.sources_total ? 'ok' : src.sources_ok ? 'warn' : 'bad'} />
          <Row k="cihazlar" v={`${p.online.length}/3 · ${p.online.map(o => DEVICE_LABEL[o]).join(', ') || '—'}`} frac={p.online.length / 3} />
          <Row k="saat senkronu" v={clock.rtt === null ? 'ölçülmedi' : `±${Math.max(1, Math.round(clock.rtt / 2))} ms`} tone={clock.rtt === null ? 'dim' : 'ok'} />
          <Row k="akış" v={p.connected ? 'canlı (SSE)' : 'kopuk'} tone={p.connected ? 'ok' : 'bad'} />
        </Box>
        <div className="m2-rings">
          <RingGauge
            label="GÜÇ"
            frac={st.battery}
            value={st.battery === null ? '—' : Math.round(st.battery * 100)}
            unit={st.battery === null ? undefined : '%'}
            sub={st.battery === null ? 'pil bilgisi yok' : st.charging ? 'şarj oluyor' : 'pilde'}
            tone={st.battery !== null && st.battery < 0.2 && !st.charging ? 'bad' : 'ok'}
          />
          <RingGauge
            label="AĞ"
            frac={st.downlink === null ? null : Math.min(1, st.downlink / 10)}
            value={st.downlink === null ? '—' : st.downlink}
            unit={st.downlink === null ? undefined : 'Mb'}
            sub={st.rtt !== null ? `gecikme ${st.rtt} ms` : clock.rtt !== null ? `sunucu ${clock.rtt} ms` : 'ölçüm yok'}
          />
        </div>
      </aside>

      <main className="m2-center">
        <div className="m2-stagewrap">
          <div className="m2-orbitwrap">
            <Orbit d={d} hl={p.hl} dim={hasVisual || p.core === 'thinking'} />
            <HudCore state={p.core} level={p.level} introAt={p.introAt} info={{ scene: p.speakingReply && p.reply ? [p.sceneIdx, p.reply.sahneler.length] : null }} />
            <div className="m2-statelabel">
              <b>{STATE_LABEL[p.core]}</b>
              <span>{p.speakingReply && p.reply ? `SAHNE ${pad2(p.sceneIdx + 1)}/${pad2(p.reply.sahneler.length)}` : 'JARVIS · MARK II'}</span>
            </div>
            {p.checks}
          </div>
        </div>

        {/* Hologram çerçevesi: sahne fotoğrafı ya da dünya */}
        <div className="m2-holo">
          <div className="m2-holo-h">
            <span>{p.photo ? 'GÖRÜNTÜ' : pts.length ? 'KONUM' : 'DÜNYA'}</span>
            <span className="m2-meta">{p.photo ? (p.photo.kind === 'temsili' ? 'temsili · yapay zeka' : p.photo.credit) : pts.length ? pts.map(x => x.label).join(' · ') : home ? `${d!.weather!.city} işaretli` : ''}</span>
          </div>
          <AnimatePresence mode="wait">
            {p.photo ? (
              <motion.div key={p.photo.url} className="m2-photo" initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }} animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
                <img src={p.photoSrc(p.photo.url)} alt="" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
                <i className="m2-scan" />
              </motion.div>
            ) : (
              <motion.div key="globe" className="m2-globewrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Globe markers={markers} focus={focus} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Günlük: düşünürken ve konuşurken araç adımları */}
        <div className="m2-log">
          <div className="m2-holo-h"><span>GÜNLÜK</span><span className="m2-meta">{p.telemetry.length ? `${p.telemetry.length} adım` : 'boşta'}</span></div>
          {(p.core === 'thinking' || p.core === 'speaking') && p.telemetry.slice(-6).map((l, i) => <div key={i} className="m2-logl">▸ {l}</div>)}
          {p.core === 'idle' && <div className="m2-logl dim">komut bekleniyor</div>}
          {p.core === 'listening' && <div className="m2-logl">▸ mikrofon açık</div>}
        </div>

        <AnimatePresence mode="wait">
          {hasVisual && (
            <motion.div key={p.visualKey} className="m2-visual" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.4 }}>
              <svg className="m2-visual-lead" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 5H100" /></svg>
              <Visual g={p.visualScene!.gorsel} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="m2-caption">
          <AnimatePresence mode="wait">
            {p.caption && (
              <motion.p key={p.caption} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
                <span className="who">{p.core === 'listening' ? 'SİZ' : 'JARVIS'} ▸</span> {p.caption}
              </motion.p>
            )}
          </AnimatePresence>
          {p.speakingReply && p.reply && (
            <div className="m2-dots">{p.reply.sahneler.map((_, i) => <i key={i} className={i === p.sceneIdx ? 'on' : i < p.sceneIdx ? 'past' : ''} />)}</div>
          )}
        </div>
      </main>

      <aside className="m2-right" key={'r' + p.panelKey}>
        <WeatherDial w={d?.weather ?? null} highlight={p.hl.includes('weather')} />
        {p.speakingReply && p.agenda.length > 0 ? (
          <Box title="AKIŞ" meta={`${Math.max(0, curAgenda) + 1}/${p.agenda.length}`} className="m2-list">
            {p.agenda.map((a, i) => (
              <div key={i} className={'m2-li' + (i === curAgenda ? ' on' : i < curAgenda ? ' past' : '')}>
                <span className="n">{pad2(i + 1)}</span>
                <span className="t">{a.title}</span>
              </div>
            ))}
          </Box>
        ) : (
          <Box title="GÜNDEM" meta={src ? `${src.total} haber` : ''} className="m2-list">
            {(src?.headlines ?? []).slice(0, 7).map((h, i) => (
              <div key={i} className="m2-li">
                <span className="n">{hhmm(h.published_at)}</span>
                <span className="t">{h.title}<em>{h.source}</em></span>
              </div>
            ))}
            {!src?.headlines.length && <div className="m2-li dim">haber alınamadı</div>}
          </Box>
        )}
        {/* Akıllı ev: anlık durum (OTURUM ölçümlerinin yerini aldı; ev daha işe yarar) */}
        <Box title="EV" meta={p.home ? (p.home.mode === 'simulasyon' ? 'simülasyon' : 'Home Assistant') : ''} className="m2-home">
          <button className="m2-home-open" onClick={p.onHome} aria-label="Akıllı ev panelini aç" />
          {(p.home?.devices ?? []).map(d => {
            const active = d.tur === 'isik' ? d.acik : d.durum !== 'beklemede';
            const frac = d.tur === 'isik' ? (d.acik ? d.parlaklik / 100 : 0) : progressOf(d);
            return <Row key={d.id} k={d.tur === 'isik' ? d.oda : d.tur === 'turk_kahve' ? 'türk kahvesi' : 'filtre kahve'} v={statusText(d)} frac={frac} tone={active ? (d.tur === 'isik' ? 'warn' : 'ok') : 'dim'} />;
          })}
          {!p.home && <Row k="ev" v="bağlantı yok" tone="dim" />}
        </Box>
      </aside>

      <footer className="m2-dock">
        <form className="m2-cmd" onSubmit={e => { e.preventDefault(); p.onSubmit(p.input); }}>
          <span className="m2-cmd-l">KOMUT</span>
          <input value={p.input} onChange={e => p.setInput(e.target.value)} placeholder="Jarvis'e yazın…" enterKeyHint="send" />
        </form>
        <div className="m2-btns">
          <RoundButton label="Geçmiş" onClick={() => p.onDrawer('gecmis')}><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg></RoundButton>
          <RoundButton label="Fotoğraf" onClick={p.onCamera}><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></RoundButton>
          <RoundButton label="Kamera" onClick={p.onLiveCamera}><svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2" /><path d="M16 11l5-3v8l-5-3z" /><circle cx="7" cy="10" r="1" /></svg></RoundButton>
          <RoundButton label="Brifing" onClick={() => p.onSubmit('Jarvis, aydınlat beni')}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></svg></RoundButton>
          <RoundButton label={p.core === 'listening' ? 'Dinliyor' : 'Konuş'} onClick={p.onMic} big active={p.core === 'listening'}><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></RoundButton>
          <RoundButton label="Devam" onClick={() => p.onSubmit('Devam et')}><svg viewBox="0 0 24 24"><path d="M6 5l7 7-7 7M13 5l7 7-7 7" /></svg></RoundButton>
          <RoundButton label="Durdur" onClick={p.onStop} disabled={p.core !== 'speaking'}><svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" /></svg></RoundButton>
          <RoundButton label="El" onClick={p.onHands}><svg viewBox="0 0 24 24"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M8 11.5a1.5 1.5 0 0 0-3 0V14a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6V9.5a1.5 1.5 0 0 0-3 0" /></svg></RoundButton>
          <RoundButton label="Ev" onClick={p.onHome}><svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></svg></RoundButton>
          <RoundButton label="Ayarlar" onClick={() => p.onDrawer('ayarlar')}><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg></RoundButton>
        </div>
      </footer>
    </div>
  );
}
