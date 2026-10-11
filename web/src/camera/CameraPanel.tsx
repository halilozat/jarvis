// İzleyici paneli (PC/tablet): köşede küçük pencere, tıklayınca tam ekran.
// Önce doğrudan WebRTC (P2P); 7 sn'de kurulamazsa aralıklı kare (KARE). Panel kapalıyken bağlantı yok.
// Jarvis kameraya bakınca panel öne gelir, tarama oynar ve analiz edilen kare 3 sn donar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraBus, frameUrl, getCameras, hhmm, onCamera, signal, watchFrames, type CameraInfo, type Ice } from '../lib/camera';
import { serverNow } from '../lib/wake';
import { useNow } from '../mark2/stats';

type View = 'min' | 'win' | 'full';
type Mode = 'bağlanıyor' | 'P2P' | 'KARE';
const P2P_TIMEOUT_MS = 7000;

export function CameraPanel() {
  const [cams, setCams] = useState<CameraInfo[]>([]);
  const [ice, setIce] = useState<Ice>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const [view, setView] = useState<View>('min');
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [frameAt, setFrameAt] = useState<number | null>(null);
  const [look, setLook] = useState<{ phase: 'scan' | 'frozen'; at?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selRef = useRef(sel);
  selRef.current = sel;
  const now = useNow(1000);
  const scanAt = useRef(0);

  useEffect(() => {
    getCameras().then(r => { if (r) { setCams(r.cameras); if (r.ice?.length) setIce(r.ice); } });
  }, []);

  // "Kamera" düğmesi: paneli aç / küçült
  useEffect(() => {
    const h = () => setView(v => (v === 'min' ? 'win' : 'min'));
    cameraBus.addEventListener('toggle-panel', h);
    return () => cameraBus.removeEventListener('toggle-panel', h);
  }, []);

  // Seçili kamera yoksa: çevrimiçi ilk kamera
  useEffect(() => {
    if (sel && cams.some(c => c.id === sel)) return;
    setSel((cams.find(c => c.online) ?? cams[0])?.id ?? null);
  }, [cams, sel]);
  const cam = cams.find(c => c.id === sel) ?? null;
  const paused = cam?.state === 'durduruldu';
  /** Bağlanılabilir: çevrimiçi ve kamera cihazında durdurulmamış */
  const online = !!cam?.online && !paused;

  // ---- Olaylar ----
  useEffect(() => onCamera(async e => {
    if (e.type === 'cameras') { setCams(e.cameras); return; }
    if (e.type === 'camera_motion') { setCams(cs => cs.map(c => (c.id === e.camId ? { ...c, motion: e.on } : c))); return; }
    if (e.type === 'camera_frame') { if (e.camId === selRef.current && modeRef.current === 'KARE') setFrameAt(e.at); return; }
    if (e.type === 'camera_look') {
      if (e.phase === 'scan') { scanAt.current = performance.now(); setSel(e.camId); setView(v => (v === 'min' ? 'win' : v)); setLook({ phase: 'scan' }); return; }
      // Tarama en az 0,8 sn görünsün (kare çok hızlı gelse de videoda Jarvis'in baktığı anlaşılsın), sonra kare 3 sn donar
      const wait = Math.max(0, 800 - (performance.now() - scanAt.current));
      setTimeout(() => {
        if (e.phase !== 'frozen') { setLook(null); return; }
        setLook({ phase: 'frozen', at: e.at });
        setTimeout(() => setLook(l => (l?.phase === 'frozen' && l.at === e.at ? null : l)), 3000);
      }, wait);
      return;
    }
    if (e.type !== 'rtc' || e.camId !== selRef.current) return;
    const p = pc.current;
    if (e.kind === 'offer' && p) {
      await p.setRemoteDescription(e.data);
      const ans = await p.createAnswer();
      await p.setLocalDescription(ans);
      signal(e.camId, 'answer', p.localDescription);
    } else if (e.kind === 'ice' && p) await p.addIceCandidate(e.data).catch(() => {});
    else if (e.kind === 'bye') { p?.close(); pc.current = null; setMode(null); }
  }), []);

  // ---- Bağlantı: panel açık ve kamera çevrimiçiyken ----
  const connected = useRef(false);
  useEffect(() => {
    if (view === 'min' || !sel || !online) return;
    let dead = false;
    setError(null);
    setMode('bağlanıyor');
    setLatency(null);
    const p = new RTCPeerConnection({ iceServers: ice });
    pc.current = p;
    connected.current = false;
    p.ontrack = ev => { if (video.current) { video.current.srcObject = ev.streams[0] ?? new MediaStream([ev.track]); video.current.play().catch(() => {}); } };
    p.onicecandidate = ev => { if (ev.candidate) signal(sel, 'ice', ev.candidate.toJSON()); };
    const toFrames = async () => {
      if (dead || modeRef.current === 'KARE') return;
      p.close();
      signal(sel, 'bye');
      const r = await watchFrames(sel, true).catch(() => null);
      if (dead) return;
      if (r && !r.ok) { setError((await r.json().catch(() => ({}))).error || 'izlenemiyor'); setMode(null); return; }
      setMode('KARE');
      setFrameAt(Date.now());
    };
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') { connected.current = true; setMode('P2P'); }
      if (p.connectionState === 'failed') toFrames();
    };
    signal(sel, 'request').then(async r => {
      if (!r.ok && !dead) { setError((await r.json().catch(() => ({}))).error || 'bağlanılamadı'); setMode(null); }
    });
    const t = setTimeout(() => { if (!connected.current) toFrames(); }, P2P_TIMEOUT_MS);
    return () => {
      dead = true;
      clearTimeout(t);
      if (modeRef.current === 'KARE') watchFrames(sel, false);
      else signal(sel, 'bye');
      p.close();
      pc.current = null;
      setMode(null);
    };
  }, [view === 'min', sel, online, ice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gecikme: P2P'de yarım gidiş-dönüş + titreşim tamponu; KARE'de karenin yaşı
  useEffect(() => {
    if (mode !== 'P2P') return;
    const id = setInterval(async () => {
      const st = await pc.current?.getStats().catch(() => null);
      if (!st) return;
      let rtt = 0, jitter = 0;
      st.forEach((r: any) => {
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && r.currentRoundTripTime) rtt = r.currentRoundTripTime;
        if (r.type === 'inbound-rtp' && r.kind === 'video' && r.jitterBufferEmittedCount) jitter = r.jitterBufferDelay / r.jitterBufferEmittedCount;
      });
      setLatency(Math.round((rtt / 2 + jitter) * 1000));
    }, 2000);
    return () => clearInterval(id);
  }, [mode]);
  const frameAge = mode === 'KARE' && frameAt ? Math.max(0, Math.round(serverNow() - frameAt)) : null;

  const toggleFull = useCallback(() => setView(v => (v === 'full' ? 'win' : 'full')), []);
  if (!cams.length) return null;

  if (view === 'min') {
    return (
      <button className="campanel-chip" onClick={() => setView('win')}>
        <i className={online ? 'on' : ''} />
        {cam?.label}{cam?.location ? ` · ${cam.location}` : ''}
        {cam?.motion && <b>HAREKET</b>}
      </button>
    );
  }

  return (
    <div className={`campanel ${view}${look ? ' look-' + look.phase : ''}`}>
      <header className="cp-head">
        <span className={'cp-rec' + (online ? ' on' : '')} />
        <span className="cp-id">{cam?.label}{cam?.location ? ` · ${cam.location}` : ''}</span>
        {cam?.motion && <span className="cp-motion">HAREKET</span>}
        <span className="cp-sp" />
        {cams.length > 1 && (
          <span className="cp-tabs">
            {cams.map(c => <button key={c.id} className={c.id === sel ? 'on' : ''} onClick={() => setSel(c.id)}>{c.label}</button>)}
          </span>
        )}
        <span className="cp-clock">{now.toLocaleTimeString('tr-TR')}</span>
        {mode && <span className={'cp-mode ' + (mode === 'P2P' ? 'p2p' : mode === 'KARE' ? 'kare' : '')}>{mode}</span>}
        {mode === 'P2P' && latency !== null && <span className="cp-lat">{latency} ms</span>}
        {frameAge !== null && <span className="cp-lat">{frameAge} ms</span>}
        <button className="cp-btn" onClick={toggleFull} aria-label="Tam ekran">{view === 'full' ? '⤡' : '⤢'}</button>
        <button className="cp-btn" onClick={() => setView('min')} aria-label="Küçült">—</button>
      </header>
      <div className="cp-body" onClick={toggleFull}>
        {cam && paused ? (
          <div className="cp-off">{cam.label} durduruldu · kamera cihazında yeniden başlatılabilir</div>
        ) : !cam || !online ? (
          <div className="cp-off">{cam?.label ?? 'Kamera'} çevrimdışı{cam?.lastSeen ? ` · son görülme ${hhmm(cam.lastSeen)}` : ''}</div>
        ) : error ? (
          <div className="cp-off">{error}</div>
        ) : (
          <>
            <video ref={video} playsInline muted autoPlay className={mode === 'P2P' ? '' : 'hidden'} />
            {mode === 'KARE' && frameAt && <img src={frameUrl(cam.id, frameAt)} alt="" />}
            {mode === 'bağlanıyor' && <div className="cp-wait">bağlanıyor…</div>}
          </>
        )}
        {look?.phase === 'frozen' && look.at && cam && <img className="cp-frozen" src={frameUrl(cam.id, look.at)} alt="" />}
        {look && <div className="cp-scan"><span>{look.phase === 'scan' ? 'JARVIS BAKIYOR' : 'ANALİZ EDİLEN KARE'}</span></div>}
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
      </div>
      <footer className="cp-foot">{cam ? `${cam.viewers} izleyici${cam.quality ? ` · ${cam.quality}` : ''}${cam.state ? ` · ${cam.state}` : ''}` : ''}</footer>
    </div>
  );
}
