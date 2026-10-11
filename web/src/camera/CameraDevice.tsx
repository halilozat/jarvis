// Kamera cihazı modu (eski iPhone): Jarvis'in gözü.
// - İzleyici yokken düşük çözünürlük (yalnızca hareket algılama); izleyici gelince 720p/15 fps; ısınırsa 480p.
// - Her izleyiciye ayrı WebRTC bağlantısı (en fazla 3); görüntü sunucudan geçmez.
// - Aralıklı kare modu: sunucu "kare izleyicisi var" derse saniyede 1 JPEG (960 px, 0,6).
// - Jarvis "kameraya_bak" deyince tek anlık kare (1280 px, 0,8).
import { useEffect, useRef, useState } from 'react';
import { clientId, detectDevice, subscribe } from '../lib/api';
import {
  cameraMotion, cameraStatus, forgetCamera, getCamSettings, grabJpeg, postFrame, registerCamera, saveCamSettings, setRole, signal,
  type CamSettings, type CameraEvent, type Ice, isCameraEvent,
} from '../lib/camera';
import { keepAwake } from '../lib/wake';

type Quality = 'düşük' | '720p' | '480p (ısı koruması)';
const CONSTRAINTS: Record<Quality, MediaTrackConstraints> = {
  'düşük': { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 10, max: 10 } },
  '720p': { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 15 } },
  '480p (ısı koruması)': { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } },
};

export default function CameraDevice() {
  const [cfg, setCfg] = useState<CamSettings>(getCamSettings);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const ice = useRef<Ice>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const [running, setRunning] = useState(false);
  /** Kullanıcı durdurdu: izleyiciler ya da Jarvis kamerayı uzaktan yeniden açamaz */
  const [stopped, setStopped] = useState(false);
  const stoppedRef = useRef(stopped);
  stoppedRef.current = stopped;
  const [error, setError] = useState<string | null>(null);
  const [viewers, setViewers] = useState(0);
  const [frameViewers, setFrameViewers] = useState(0);
  const [motion, setMotion] = useState(false);
  const [quality, setQuality] = useState<Quality>('düşük');
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const [connected, setConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const wakeSupported = 'wakeLock' in navigator;

  // ---- Kamera akışı ----
  const start = async (facing = cfgRef.current.facing) => {
    setError(null);
    setStopped(false);
    stoppedRef.current = false;
    try {
      stream.current?.getTracks().forEach(t => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, ...CONSTRAINTS[qualityRef.current] }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      // Açık bağlantılara yeni izi ver (yeniden pazarlık gerekmez)
      const track = s.getVideoTracks()[0];
      for (const pc of pcs.current.values()) pc.getSenders().forEach(snd => snd.track?.kind === 'video' && snd.replaceTrack(track));
      track.onended = () => { setRunning(false); cameraStatus(cfgRef.current.id, { state: 'kamera kesildi' }); };
      setRunning(true);
      if (!cfgRef.current.started) { const n = { ...cfgRef.current, started: true }; saveCamSettings(n); setCfg(n); }
      cameraStatus(cfgRef.current.id, { state: 'yayında', quality: qualityRef.current });
    } catch (e) {
      setRunning(false);
      setError((e as Error).name === 'NotAllowedError' ? 'Kamera izni verilmedi. Safari → aA → Web Sitesi Ayarları → Kamera: İzin Ver.' : `Kamera açılamadı: ${(e as Error).message}`);
    }
  };

  /** Kamerayı durdur: akış kapanır, izleyiciler bırakılır, yeniden açılış yalnızca bu cihazdan */
  const stop = () => {
    stoppedRef.current = true;
    setStopped(true);
    stream.current?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    stream.current = null;
    for (const [viewer, pc] of pcs.current) { pc.close(); signal(cfgRef.current.id, 'bye', undefined, viewer); }
    pcs.current.clear();
    if (video.current) video.current.srcObject = null;
    setRunning(false);
    setMotion(false);
    const n = { ...cfgRef.current, started: false }; // yeniden yüklenince kendiliğinden açılmasın
    saveCamSettings(n);
    setCfg(n);
    cameraStatus(cfgRef.current.id, { state: 'durduruldu' });
  };

  const setQ = async (q: Quality) => {
    if (q === qualityRef.current) return;
    setQuality(q);
    qualityRef.current = q;
    const t = stream.current?.getVideoTracks()[0];
    if (t) await t.applyConstraints(CONSTRAINTS[q]).catch(() => {});
    cameraStatus(cfgRef.current.id, { quality: q });
  };

  // İlk açılış: iOS dokunuşsuz kamera açtırmayabilir; daha önce başlatıldıysa yine de dene
  useEffect(() => { if (cfg.started) start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ekran açık kalsın
  useEffect(() => keepAwake(), []);

  // Arka plan / ön plan: iOS arka planda kamerayı keser; dönünce yeniden başlat
  useEffect(() => {
    const onVis = () => {
      if (stoppedRef.current) return;
      if (document.visibilityState === 'hidden') cameraStatus(cfgRef.current.id, { state: 'arka planda' });
      else if (!stream.current || stream.current.getVideoTracks()[0]?.readyState !== 'live') start();
      else cameraStatus(cfgRef.current.id, { state: 'yayında' });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- WebRTC: izleyici başına bir bağlantı ----
  const dropPeer = (viewer: string) => {
    pcs.current.get(viewer)?.close();
    pcs.current.delete(viewer);
  };
  const onEvent = async (e: CameraEvent) => {
    const me = cfgRef.current.id;
    if ('camId' in e && e.camId !== me) return;
    if (e.type === 'camera_ctl') {
      setViewers(e.viewers);
      setFrameViewers(e.frames);
      // İzleyici yokken düşük çözünürlük; izleyici varken 720p (ısı koruması devredeyse 480p'de kal)
      if (e.viewers + e.frames === 0) setQ('düşük');
      else if (qualityRef.current === 'düşük') setQ('720p');
      return;
    }
    if (e.type === 'camera_snap') {
      if (stoppedRef.current) return;
      const v = video.current;
      const jpeg = v ? await grabJpeg(v, 1280, 0.8) : null;
      if (jpeg) postFrame(me, jpeg, e.reqId);
      return;
    }
    if (e.type !== 'rtc') return;
    const viewer = e.from;
    if (e.kind === 'request') {
      if (stoppedRef.current) { signal(me, 'bye', undefined, viewer); return; }
      if (!stream.current) await start();
      const track = stream.current?.getVideoTracks()[0];
      if (!track) return;
      dropPeer(viewer);
      if (pcs.current.size >= 3) return;
      const pc = new RTCPeerConnection({ iceServers: ice.current });
      pcs.current.set(viewer, pc);
      pc.addTrack(track, stream.current!);
      pc.onicecandidate = ev => { if (ev.candidate) signal(me, 'ice', ev.candidate.toJSON(), viewer); };
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) dropPeer(viewer); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal(me, 'offer', pc.localDescription, viewer);
    } else if (e.kind === 'answer') {
      await pcs.current.get(viewer)?.setRemoteDescription(e.data).catch(() => {});
    } else if (e.kind === 'ice') {
      await pcs.current.get(viewer)?.addIceCandidate(e.data).catch(() => {});
    } else if (e.kind === 'bye') dropPeer(viewer);
  };
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // SSE: kamera rolüyle bağlan (ekran cihazı sayılmaz), bağlanınca kaydol
  useEffect(() => subscribe(detectDevice(), ev => { if (isCameraEvent(ev)) onEventRef.current(ev); }, ok => {
    setConnected(ok);
    if (ok) registerCamera(cfgRef.current).then(r => { if (r?.ice?.length) ice.current = r.ice; });
  }, 'camera'), []);

  // Ayarlar değişince yeniden kaydol (etiket/konum)
  useEffect(() => { if (connected) registerCamera(cfg); }, [cfg.label, cfg.location]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Aralıklı kare modu ----
  useEffect(() => {
    if (!frameViewers || !running) return;
    const id = setInterval(async () => {
      const v = video.current;
      const jpeg = v ? await grabJpeg(v, 960, 0.6) : null;
      if (jpeg) postFrame(cfgRef.current.id, jpeg);
    }, 1000);
    return () => clearInterval(id);
  }, [frameViewers, running]);

  // ---- Hareket algılama (yalnızca cihazda; 64×36 gri kareler) ----
  useEffect(() => {
    if (!running || !cfg.motion) { setMotion(false); return; }
    const c = document.createElement('canvas');
    c.width = 64; c.height = 36;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    let on = false, lastMove = 0;
    const id = setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      g.drawImage(v, 0, 0, 64, 36);
      const d = g.getImageData(0, 0, 64, 36).data;
      const gray = new Uint8ClampedArray(64 * 36);
      for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
      if (prev) {
        let changed = 0;
        for (let i = 0; i < gray.length; i++) if (Math.abs(gray[i] - prev[i]) > 25) changed++;
        const now = performance.now();
        if (changed / gray.length > cfgRef.current.threshold) lastMove = now;
        const moving = now - lastMove < 3000;
        if (moving !== on) { on = moving; setMotion(on); cameraMotion(cfgRef.current.id, on); }
      }
      prev = gray;
    }, 500);
    return () => { clearInterval(id); if (on) cameraMotion(cfgRef.current.id, false); };
  }, [running, cfg.motion]);

  // ---- Isı koruması: 720p'de kare hızı düşerse 480p ----
  useEffect(() => {
    const v = video.current as (HTMLVideoElement & { requestVideoFrameCallback?(cb: () => void): number }) | null;
    if (!running || !v?.requestVideoFrameCallback) return;
    let frames = 0, low = 0, alive = true;
    const count = () => { frames++; if (alive) v.requestVideoFrameCallback!(count); };
    v.requestVideoFrameCallback(count);
    const id = setInterval(() => {
      const fps = frames / 2;
      frames = 0;
      if (qualityRef.current === '720p' && document.visibilityState === 'visible') {
        low = fps < 9 ? low + 1 : 0;
        if (low >= 3) { setQ('480p (ısı koruması)'); low = 0; }
      }
    }, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (p: Partial<CamSettings>) => { const n = { ...cfg, ...p }; saveCamSettings(n); setCfg(n); };
  const watching = viewers + frameViewers;

  return (
    <div className="camdev">
      <div className="camdev-top">
        <span className="camdev-id">{cfg.label}{cfg.location ? ` · ${cfg.location}` : ''}</span>
        <span className={'camdev-link ' + (connected ? 'on' : 'off')}>{connected ? 'bağlı' : 'bağlanıyor…'}</span>
      </div>

      <div className="camdev-preview">
        <video ref={video} playsInline muted autoPlay />
        {!running && (
          <div className="camdev-start">
            {error && <p className="camdev-err">{error}</p>}
            {stopped && <p className="muted">Kamera durduruldu</p>}
            <button onClick={() => start()}>Kamerayı başlat</button>
          </div>
        )}
      </div>

      <div className="camdev-actions">
        {running && <button className="camdev-stop" onClick={stop}>■ Kamerayı durdur</button>}
        <button onClick={async () => { stop(); await forgetCamera(cfgRef.current.id); setRole('ekran'); }}>Ekran moduna dön</button>
      </div>

      <div className="camdev-status">
        {watching > 0 ? <span className="camdev-live"><i />CANLI · {watching} izleyici</span> : <span className="muted">izleyici yok · {running ? 'beklemede' : 'kapalı'}</span>}
        {motion && <span className="camdev-motion">HAREKET</span>}
        {running && <span className="muted">{quality}</span>}
      </div>
      {!wakeSupported && <p className="camdev-warn">Bu Safari ekranı açık tutamıyor: Ayarlar → Ekran ve Parlaklık → Otomatik Kilit: Asla yapın ya da Rehberli Erişim'i açın.</p>}

      <button className="camdev-gear" onClick={() => setShowSettings(!showSettings)}>{showSettings ? 'Ayarları kapat' : 'Ayarlar'}</button>
      {showSettings && (
        <div className="camdev-settings">
          <label>Kamera adı</label>
          <input value={cfg.label} maxLength={24} onChange={e => update({ label: e.target.value.toLocaleUpperCase('tr') })} />
          <label>Konum</label>
          <input value={cfg.location} maxLength={24} placeholder="ör. MUTFAK" onChange={e => update({ location: e.target.value.toLocaleUpperCase('tr') })} />
          <label>Kamera</label>
          <div className="seg">
            <button className={cfg.facing === 'environment' ? 'on' : ''} onClick={() => { update({ facing: 'environment' }); start('environment'); }}>Arka</button>
            <button className={cfg.facing === 'user' ? 'on' : ''} onClick={() => { update({ facing: 'user' }); start('user'); }}>Ön</button>
          </div>
          <label>Hareket algılama (yalnızca bu cihazda)</label>
          <div className="seg">
            <button className={cfg.motion ? 'on' : ''} onClick={() => update({ motion: true })}>Açık</button>
            <button className={!cfg.motion ? 'on' : ''} onClick={() => update({ motion: false })}>Kapalı</button>
          </div>
          <label>Hassasiyet · değişen alan %{Math.round(cfg.threshold * 100)}</label>
          <input type="range" min={0.01} max={0.2} step={0.01} value={cfg.threshold} onChange={e => update({ threshold: Number(e.target.value) })} />
          <p className="muted small">Kimlik: {cfg.id} · istemci {clientId}</p>
        </div>
      )}
    </div>
  );
}
