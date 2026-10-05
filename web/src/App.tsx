import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Core } from './components/Core';
import { Handoff, TopBar, Telemetry } from './components/Chrome';
import { Visual } from './components/Visuals';
import { AgendaPanel } from './components/dashboard/AgendaPanel';
import { buildAgenda } from './components/dashboard/agenda';
import { CompactStrip } from './components/dashboard/CompactStrip';
import { HeadlineTicker } from './components/dashboard/HeadlineTicker';
import { MarketsPanel } from './components/dashboard/MarketsPanel';
import { NewsStatsPanel } from './components/dashboard/NewsStatsPanel';
import { SystemPanel } from './components/dashboard/SystemPanel';
import { WeatherPanel } from './components/dashboard/WeatherPanel';
import { SleepLayer, WakeChecks, WakeSettings, calibBus } from './components/Wake';
import { clearConversation, detectDevice, getDashboard, getHealth, getState, getVoices, metric, postAttention, postSleep, postWake, previewUrl, saveDevice, saveSettings, sendChat, setPhotoMode, stt, subscribe, token, clientId } from './lib/api';
import { startClapListener, type ClapListener } from './lib/clap';
import { shrinkImage } from './lib/image';
import { recorderSupported, startRecording } from './lib/recorder';
import { Markdown } from './lib/markdown';
import { createRecognizer, speechRecognitionSupported, voice } from './lib/speech';
import { DEVICE_LABEL, type CoreState, type CurrencyCode, type Dashboard, type Device, type GreetingPeriod, type Health, type JarvisReply, type Sahne, type ServerEvent, type StoredMessage, type VoiceOption, type VoiceSel, type WakeConfig } from './lib/types';
import { atServerTime, clockInfo, keepAwake, listenForCommand, preciseTimeout, startClockSync, syncClock, type CommandListen } from './lib/wake';

type Highlight = CurrencyCode | 'weather';
const NO_HIGHLIGHT: Highlight[] = [];

/** Anlatılan cümlede geçen konular (bir cümle hem havayı hem doları anabilir). "Türk Hava Yolları" havaya sayılmaz. */
function highlightsFor(text: string): Highlight[] {
  const t = text.toLocaleLowerCase('tr');
  const out: Highlight[] = [];
  if (/dolar/.test(t)) out.push('USD');
  if (/\beuro|avro/.test(t)) out.push('EUR');
  if (/sterlin/.test(t)) out.push('GBP');
  if (/(^|[^a-zçğıöşü])hava(?!\s*yol)|yağmur|sıcaklı/.test(t)) out.push('weather');
  return out;
}

const SUGGESTIONS = ['Jarvis, aydınlat beni', 'Devam et'];

/** Akışla gelen cevap: sahneler geldikçe dolar, oynatıcı bir sonraki sahneyi bekler. */
interface Live { id: string; scenes: Sahne[]; voice?: VoiceSel; ended: boolean; wake: (() => void) | null; base: JarvisReply }
const wakeLive = (l: Live) => { const w = l.wake; l.wake = null; w?.(); };
const waitScene = (l: Live, i: number) => new Promise<void>(res => { if (l.scenes[i] || l.ended) res(); else l.wake = res; });
/** Rozet: router → gerçekten çalışan alt model */
const brainLabel = (r: JarvisReply) => (r.router && r.model && r.router !== r.model ? `${r.router} → ${r.model}` : r.model);
const voiceGroup = (v: VoiceOption) => v.label.split(' · ').slice(1).join(' · ') || v.model;
const voiceTone = (f0: number | null) => (f0 === null ? '' : f0 < 110 ? 'derin' : f0 < 160 ? 'orta' : 'ince');

/** Çekirdeğe sabit bir fonksiyon: her render'da yeni `bind` çekirdeğin çizim döngüsünü baştan kuruyordu. */
const coreLevel = () => voice.level();

type WakeState = 'awake' | 'sleep' | 'attention' | 'waking';
/** Açılış sekansı: 0 parlama · 0,3 halkalar · 1,2 kontroller · 2,2 paneller · 2,6 karşılama */
type Phase = 'spark' | 'rings' | 'checks' | 'panels' | 'done';
type WakeEvent = Extract<ServerEvent, { type: 'wake' }>;
const SEQ = { rings: 300, checks: 1200, panels: 2200, greet: 2600 };

/** Sunucuyla aynı kural (İstanbul saati): karşılamayı önceden yüklemek için */
function periodNow(): GreetingPeriod {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' }));
  return h >= 5 && h < 12 ? 'sabah' : h >= 12 && h < 18 ? 'gun' : 'aksam';
}
const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

const photoSrc = (url: string) => (url.startsWith('/api/') && token ? `${url}&token=${encodeURIComponent(token)}` : url);

export default function App() {
  const [device, setDevice] = useState<Device>(detectDevice);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [online, setOnline] = useState<Device[]>([]);
  const [connected, setConnected] = useState(false);
  const [mock, setMock] = useState(false);
  const [photoMode, setMode] = useState<'haber' | 'video'>('haber');
  const [core, setCore] = useState<CoreState>('idle');
  const [telemetry, setTelemetry] = useState<string[]>([]);
  const [reply, setReply] = useState<JarvisReply | null>(null);
  const [sceneIdx, setSceneIdx] = useState(-1);
  const [model, setModel] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [interim, setInterim] = useState('');
  const [drawer, setDrawer] = useState<null | 'detay' | 'gecmis' | 'ayarlar'>(null);
  const [handoff, setHandoff] = useState<{ kind: 'out' | 'in'; from: Device | null; to: Device } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playToken = useRef(0);
  const recRef = useRef<{ stop(): void } | null>(null);
  const liveRef = useRef<Live | null>(null);
  /** Gönderme anı: "ilk sahne geldi" ve "ilk ses çalmaya başladı" ölçümü için */
  const t0Ref = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Seslendiren (tüm cihazlarda ortak; sunucuda saklanır)
  const [voiceSel, setVoiceSel] = useState<VoiceSel | null>(null);
  const [sfxOn, setSfxOn] = useState(true);
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [bVoices, setBVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speedDraft, setSpeedDraft] = useState<number | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  // Brifing komutunda açılış, cevap yazılmadan önce çalınır; brifing gelince o sahne atlanır.
  const openingRef = useRef<{ text: string; done: Promise<void> } | null>(null);
  const [preCaption, setPreCaption] = useState('');
  // Sabah panosu: ilk yüklemede çekilir, sonra sunucu 5 dakikada bir SSE ile yeniler.
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [dashTried, setDashTried] = useState(false);
  const [hl, setHl] = useState<Highlight[]>(NO_HIGHLIGHT);
  // İki alkışla uyanma
  const [wake, setWake] = useState<WakeConfig | null>(null);
  const [wstate, setWstate] = useState<WakeState>('awake');
  const [phase, setPhase] = useState<Phase>('done');
  const [introAt, setIntroAt] = useState<number | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const [entering, setEntering] = useState(false);
  const [checks, setChecks] = useState<{ health: Health | null; failed: boolean } | null>(null);
  const [glow, setGlow] = useState(false);
  const [soundHint, setSoundHint] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [heardLive, setHeardLive] = useState('');
  const [calibrating, setCalibrating] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const wstateRef = useRef(wstate);
  wstateRef.current = wstate;
  const wakeRef = useRef(wake);
  wakeRef.current = wake;
  const coreRef = useRef(core);
  coreRef.current = core;
  const calibRef = useRef(calibrating);
  calibRef.current = calibrating;
  /** Sekans zamanlayıcılarının iptal fonksiyonları */
  const seqTimers = useRef<(() => void)[]>([]);
  const healthRef = useRef<{ at: number; p: Promise<Health | null> } | null>(null);
  const pendingGreet = useRef<(() => void) | null>(null);
  const clapRef = useRef<ClapListener | null>(null);
  const commandRef = useRef<CommandListen | null>(null);
  const lastActive = useRef(Date.now());
  const cancelWakeRef = useRef<(() => void) | null>(null);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 3200); };

  const syncReply = (l: Live) => setReply({ ...l.base, sahneler: l.scenes.slice() });

  // ---- Sahne oynatıcı: sahneler geldikçe çalar; sahne süresini sesin kendisi belirler ----
  const runPlayer = useCallback(async (l: Live) => {
    // Açılış komut anında çalındıysa bitmesini bekle, brifinge 2. sahneden devam et.
    const pre = openingRef.current;
    openingRef.current = null;
    let start = 0;
    if (pre) {
      const before = playToken.current;
      await waitScene(l, 0);
      if (playToken.current !== before) return;
      if (l.scenes[0]?.ses === pre.text) {
        await pre.done;
        if (playToken.current !== before) return;
        start = 1;
      }
    }
    const my = ++playToken.current;
    voice.stop();
    setPreCaption('');
    // Ses ve hız bu cevaba sabit: cevap sürerken Ayarlar'dan değişse de bu cevap tek sesle biter.
    voice.rate = l.voice?.speed ?? voice.rate;
    voice.beginReply();
    setCore('speaking');
    for (let i = start; ; i++) {
      await waitScene(l, i);
      if (playToken.current !== my) return;
      const sc = l.scenes[i];
      if (!sc) break;
      const n = l.ended ? l.scenes.length : undefined;
      // Sıradaki sahnelerin sesini önden iste (sunucu aynı anda en fazla 3 üretir, sıra korunur).
      l.scenes.slice(i, i + 3).forEach((s, k) => voice.preload(s.ses, l.voice, i + k + 1, n));
      setSceneIdx(i);
      voice.blip();
      // Eskiden her sahneye max(2,6 sn, 45 ms × karakter) zorla bekleniyordu. Artık süreyi ses belirler;
      // yalnızca görselli sahnelerde animasyon tamamlansın diye en fazla 1,2 sn alt sınır var.
      const minMs = sc.gorsel.tip !== 'yok' ? 1200 : 0;
      await Promise.all([voice.speak(sc.ses, l.voice, i + 1, n), new Promise(r => setTimeout(r, minMs))]);
      if (playToken.current !== my) return;
      await new Promise(r => setTimeout(r, 80));
    }
    if (playToken.current === my) {
      setCore('idle');
      setSceneIdx(l.scenes.length); // bitti
    }
  }, []);

  /** Tamamlanmış bir cevabı (geçmişten) baştan oynatır. */
  const play = useCallback((r: JarvisReply) => {
    const l: Live = { id: r.id, scenes: r.sahneler.slice(), voice: r.voice, ended: true, wake: null, base: r };
    liveRef.current = l;
    setReply(r);
    setModel(brainLabel(r));
    return runPlayer(l);
  }, [runPlayer]);

  // ---- Anında açılış: brifing komutu gelir gelmez önbellekteki açılış cümlesi ----
  const playOpening = useCallback((text: string, v: VoiceSel) => {
    const my = playToken.current;
    setPreCaption(text);
    setCore('speaking');
    voice.blip();
    voice.rate = v.speed;
    voice.beginReply();
    const done = voice.speak(text, v).then(() => {
      if (playToken.current !== my) return;
      setPreCaption('');
      setCore('thinking'); // brifing yazılırken HUD taramaya devam eder
    });
    openingRef.current = { text, done };
  }, []);

  const stopPlayback = () => { playToken.current++; voice.stop(); setPreCaption(''); setCore('idle'); };

  // =================================================================== İki alkışla uyanma
  const clearSeq = () => { seqTimers.current.forEach(c => c()); seqTimers.current = []; };
  /** Sistem kontrolleri: dikkat anında istenir, uyanışta (15 sn içindeyse) aynı sonuç kullanılır. */
  const fetchHealth = () => {
    const h = healthRef.current;
    if (h && Date.now() - h.at < 15_000) return h.p;
    const p = getHealth();
    healthRef.current = { at: Date.now(), p };
    return p;
  };

  const enterSleep = () => {
    stopPlayback();
    recRef.current?.stop();
    commandRef.current?.cancel();
    cancelWakeRef.current?.();
    clearSeq();
    pendingGreet.current = null;
    setDrawer(null);
    setCalibrating(false);
    setChecks(null);
    setSoundHint(false);
    setEntering(false);
    setPhase('done');
    setIntroAt(null);
    setWstate('sleep');
  };

  /** Karşılama: sesi yalnızca karşılayan cihaz çalar; diğerleri altyazı + çekirdek animasyonu. */
  const greet = (e: WakeEvent, isGreeter: boolean) => {
    const text = e.greeting.text;
    const my = ++playToken.current;
    setSceneIdx(-1);
    setPreCaption(text);
    setCore('speaking');
    const end = () => {
      if (playToken.current !== my) return;
      setPreCaption('');
      setCore('idle');
    };
    if (!isGreeter) {
      const ms = Math.max(1400, (text.length * 70) / (e.voice.speed || 1));
      voice.mimic(ms);
      seqTimers.current.push(preciseTimeout(end, ms));
      return;
    }
    const t0 = performance.now();
    const prev = voice.onPlay;
    voice.onPlay = () => { voice.onPlay = prev; metric('karşılama çalmaya başladı', performance.now() - t0, 'sekansın 2,6. saniyesinden itibaren'); };
    voice.rate = e.voice.speed;
    voice.beginReply();
    voice.speak(text, e.voice).then(() => {
      voice.onPlay = prev;
      end();
      if (e.brief && playToken.current === my) submit('Jarvis, aydınlat beni');
    });
  };

  /** Sunucunun verdiği anda (at) açılış sekansı; tüm cihazlar aynı anda. */
  const runWake = (e: WakeEvent) => {
    const isGreeter = e.greeter === device;
    const asleep = wstateRef.current !== 'awake';
    if (wstateRef.current === 'waking') return; // aynı uyanış ikinci kez gelmez ama emniyet
    if (isGreeter) voice.preload(e.greeting.text, e.voice, undefined, undefined, true);
    const hp = fetchHealth();
    clearSeq();
    lastActive.current = Date.now();
    // Ses kilidi: karşılayan cihazda bağlam askıdaysa sürdürmeyi dene (iOS ekran kilidi sonrası)
    const audioOk = isGreeter ? voice.resume() : Promise.resolve(true);
    let skipGreet = false;
    const cancel = atServerTime(e.at, late => {
      const c = clockInfo();
      console.info(`[uyanış] sekans başladı · sapma ${late} ms · saat ofseti ${c.offset} ms (rtt ${c.rtt} ms)`);
      metric('uyanış başladı', late, `${DEVICE_LABEL[device]} · sapma (+geç/−erken) · ofset ${c.offset} ms · rtt ${c.rtt} ms · ${e.via}`);
      const t0 = performance.now() - Math.max(0, late); // geç başladıysak sekans zamanında yetişsin
      const at = (ms: number, fn: () => void) => seqTimers.current.push(preciseTimeout(fn, Math.max(0, ms - (performance.now() - t0))));
      audioOk.then(ok => {
        if (!isGreeter) return;
        if (ok) voice.chime();
        else setSoundHint(true);
      });
      if (!asleep && !isGreeter && coreRef.current !== 'idle') skipGreet = true; // bu cihaz meşgul: araya girme
      if (asleep) {
        stopPlayback();
        setIntroAt(t0);
        setPhase('spark');
        setWstate('waking');
        setChecks(null);
        at(SEQ.rings, () => setPhase('rings'));
        at(SEQ.checks, () => {
          setPhase('checks');
          setChecks({ health: null, failed: false });
          hp.then(h => setChecks(c => (c ? { health: h, failed: !h } : c)));
        });
        at(SEQ.panels, () => { setPhase('panels'); setPanelKey(k => k + 1); setEntering(true); });
        at(SEQ.panels + 1200, () => setEntering(false));
        at(SEQ.greet + 3200, () => setChecks(null));
      } else {
        // Uyumayan cihaz: kısa bir parlama
        setGlow(true);
        at(900, () => setGlow(false));
      }
      at(SEQ.greet, () => {
        setPhase('done');
        setWstate('awake');
        if (skipGreet) return;
        audioOk.then(ok => {
          if (!isGreeter || ok || voice.unlocked) return greet(e, isGreeter);
          // iOS ses kilidi: sekans sessiz oynadı; altyazı şimdi, ses ilk dokunuşta
          setPreCaption(e.greeting.text);
          pendingGreet.current = () => { setSoundHint(false); greet(e, true); };
        });
      });
    });
    cancelWakeRef.current = cancel;
  };

  /** Dinleyici cihaz: çift alkış duyuldu. */
  const onDoubleClap = async () => {
    const cfg = wakeRef.current;
    if (!cfg || wstateRef.current !== 'sleep' || commandRef.current) return;
    if (cfg.mode === 'clap') { postWake('çift alkış'); return; }
    postAttention(device);
    const cmd = listenForCommand({ ms: 4000, strict: false, ctx: voice.context ?? undefined, stream: clapRef.current?.stream, onInterim: setHeardLive });
    commandRef.current = cmd;
    const r = await cmd.result;
    commandRef.current = null;
    setHeardLive('');
    console.info(`[uyanış] komut ${r.matched ? 'eşleşti' : 'gelmedi'} · ${r.via ?? '—'} · ${r.ms} ms · "${r.heard}"`);
    metric('uyanış komutu', r.ms, `${r.matched ? 'eşleşti' : 'gelmedi'} · yakalayan: ${r.via ?? '—'} · "${r.heard.slice(0, 40)}"`);
    if (r.matched) postWake(`çift alkış + ses (${r.via === 'webspeech' ? 'Web Speech' : 'RouteLLM'})`, r.heard);
    else postAttention(device, true, r.heard);
  };

  // ---- Sunucu olayları ----
  useEffect(() => {
    getState()
      .then(s => {
        setMessages(s.messages);
        setOnline(s.online);
        setMock(s.mock);
        setMode(s.photoMode);
        voice.serverTts = s.tts;
        voice.sfx = s.sfx;
        voice.rate = s.voice.speed;
        setVoiceSel(s.voice);
        setSfxOn(s.sfx);
        setWake(s.wake);
        const last = [...s.messages].reverse().find(m => m.reply);
        if (last?.reply) { setReply(last.reply); setModel(brainLabel(last.reply)); setSceneIdx(last.reply.sahneler.length); }
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    return subscribe(device, (e: ServerEvent) => {
      const mine = 'origin' in e && e.origin === clientId;
      switch (e.type) {
        case 'presence': setOnline(e.online); break;
        case 'user':
          setMessages(m => [...m, e.message]);
          if (!mine) flash(`${DEVICE_LABEL[e.message.device]}: “${e.message.text}”`);
          break;
        case 'progress': if (mine) setTelemetry(t => [...t, e.line]); break;
        case 'opening': if (mine) playOpening(e.text, e.voice); break;
        case 'scene': {
          if (!mine) break;
          let l = liveRef.current;
          if (!l || l.id !== e.replyId) {
            const base: JarvisReply = { id: e.replyId, sahneler: [], detay: '', model: null, tool_log: [], device, created_at: new Date().toISOString(), voice: e.voice };
            l = { id: e.replyId, scenes: [], voice: e.voice, ended: false, wake: null, base };
            liveRef.current = l;
            l.scenes[e.index] = e.sahne;
            syncReply(l);
            if (t0Ref.current !== null) metric('ilk sahne geldi', performance.now() - t0Ref.current);
            runPlayer(l);
          } else {
            l.scenes[e.index] = e.sahne;
            syncReply(l);
            wakeLive(l);
          }
          break;
        }
        case 'scene_update': {
          const l = liveRef.current;
          if (mine && l?.id === e.replyId && l.scenes[e.index]) {
            l.scenes[e.index] = { ...l.scenes[e.index], gorsel: { ...l.scenes[e.index].gorsel, foto: e.foto } };
            syncReply(l);
          }
          break;
        }
        case 'scene_end': {
          const l = liveRef.current;
          if (mine && l?.id === e.replyId) { l.ended = true; wakeLive(l); }
          break;
        }
        case 'reply': {
          setMessages(m => [...m, e.message]);
          const r = e.message.reply;
          if (!r) break;
          setModel(brainLabel(r)); // cevap başına rozet
          console.info(`[beyin] ${r.router ?? '?'} → ${r.model ?? '?'}`);
          if (!mine) break;
          const l = liveRef.current;
          if (l && l.id === r.id) {
            // Akış zaten çalıyor: son hali (detay, geç gelen görseller) yerine koy.
            l.scenes = r.sahneler.slice();
            l.base = r;
            l.ended = true;
            syncReply(l);
            wakeLive(l);
          } else play(r);
          break;
        }
        case 'error': {
          if (!mine) break;
          openingRef.current = null;
          const l = liveRef.current;
          if (l) { l.ended = true; wakeLive(l); }
          setPreCaption(''); setCore('idle'); setTelemetry(t => [...t, 'hata: ' + e.error]);
          break;
        }
        case 'handoff':
          if (e.toClient === clientId) setHandoff({ kind: 'in', from: e.from, to: e.to });
          else { stopPlayback(); setHandoff({ kind: 'out', from: e.from, to: e.to }); }
          setTimeout(() => setHandoff(null), 2200);
          break;
        case 'attention':
          if (wstateRef.current !== 'sleep') break;
          setWstate('attention');
          fetchHealth();
          // Emniyet: dinleyiciden haber gelmezse uykuya dön
          seqTimers.current.push(preciseTimeout(() => wstateRef.current === 'attention' && setWstate('sleep'), e.ms + 8000));
          break;
        case 'attention_end':
          if (wstateRef.current === 'attention') setWstate('sleep');
          break;
        case 'wake': runWake(e); break;
        case 'sleep': enterSleep(); break;
        case 'settings':
          setWake(e.wake);
          setMode(e.photoMode);
          setVoiceSel(e.voice);
          setSfxOn(e.sfx);
          voice.sfx = e.sfx;
          // Yeni ses bir SONRAKİ cevaptan geçerli (oynatıcı her cevabın başında sabitler).
          voice.serverTts = e.voice.model !== 'browser' && !mock;
          break;
        case 'dashboard': setDash(e.data); setDashTried(true); break;
        case 'cleared': setMessages([]); setReply(null); setSceneIdx(-1); break;
      }
    }, setConnected);
  }, [device, play, playOpening, runPlayer, mock]);

  // ---- Pano ----
  const loadDashboard = useCallback(() => {
    getDashboard()
      .then(setDash)
      .catch(() => { /* paneller "veri alınamadı" der */ })
      .finally(() => setDashTried(true));
  }, []);
  useEffect(loadDashboard, [loadDashboard]);

  // Sekme arka plandayken (ya da pencere başka bir pencerenin altındayken) Chrome animasyon zaman çizelgesini
  // durduruyor: giriş animasyonları %60 opaklıkta donup kalıyordu ("detaylı özeti aç" ve çipler soluk görünüyordu).
  // Sayfa görünür olunca yarıda kalan sonlu animasyonları bitir ve kaçırılmış olabilecek pano güncellemesini al.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      for (const a of document.getAnimations()) {
        const end = a.effect?.getComputedTiming().endTime;
        if (a.playState === 'running' && typeof end === 'number' && Number.isFinite(end)) a.finish();
      }
      loadDashboard();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadDashboard]);

  // İlk sesin ne zaman çalmaya başladığı (istemci ölçümü sunucu loguna da gider) ve yedeğe düşme bildirimi
  useEffect(() => {
    voice.onPlay = () => {
      if (t0Ref.current === null) return;
      const ms = performance.now() - t0Ref.current;
      t0Ref.current = null;
      console.info(`[zaman] ilk ses çalmaya başladı · ${Math.round(ms)} ms`);
      metric('ilk ses çalmaya başladı', ms);
    };
    voice.onFallback = reason => flash(`Sunucu sesi alınamadı (${reason}); bu cevap tarayıcı sesiyle sürüyor.`);
  }, []);

  // ---- Gönderme ----
  const submit = async (text: string, image?: string) => {
    const t = text.trim();
    if (!t && !image) return;
    voice.unlock(); // kullanıcı hareketi içinde sesi aç
    stopPlayback();
    setInput('');
    setInterim('');
    setTelemetry([]);
    setCore('thinking');
    setSceneIdx(-1);
    t0Ref.current = performance.now();
    try {
      await sendChat(t, device, image);
    } catch (e: any) {
      setCore('idle');
      setTelemetry(['hata: ' + e.message]);
    }
  };

  // Web Speech API yalnızca yedek (iPhone'da güvenilir değil).
  const startWebSpeech = () => {
    const rec = createRecognizer({
      onInterim: setInterim,
      onFinal: t => submit(t),
      onEnd: () => setCore(c => (c === 'listening' ? 'idle' : c)),
      onError: m => { setTelemetry([`mikrofon: ${m}`]); setCore('idle'); },
    });
    if (!rec) { setCore('idle'); flash('Bu tarayıcıda ses tanıma yok, yazarak sorabilirsiniz.'); return; }
    recRef.current = rec;
    setInterim('');
    setCore('listening');
    rec.start();
  };

  // Asıl yol: mikrofon kaydı → RouteLLM ile yazıya çevirme. Konuşma bitince (sessizlik) kendiliğinden durur.
  const toggleMic = async () => {
    voice.unlock();
    if (core === 'listening') { recRef.current?.stop(); return; }
    stopPlayback();
    if (!recorderSupported()) return startWebSpeech();
    setInterim('');
    setCore('listening');
    try {
      recRef.current = await startRecording({
        onStop: async blob => {
          recRef.current = null;
          if (!blob) { setCore(c => (c === 'listening' ? 'idle' : c)); return; }
          setInterim('anlıyorum…');
          try {
            const text = await stt(blob);
            setInterim('');
            if (text) submit(text);
            else { setCore('idle'); flash('Sizi duyamadım efendim.'); }
          } catch (err: any) {
            setInterim('');
            setCore('idle');
            flash(`Ses yazıya çevrilemedi: ${err.message}`);
          }
        },
      });
    } catch {
      // Mikrofon izni yok ya da kayıt başlamadı: Web Speech yedeğini dene.
      setCore('idle');
      startWebSpeech();
    }
  };

  // Kamera / galeri: Jarvis'in "gözü"
  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      const img = await shrinkImage(f);
      submit(input.trim() || 'Bu ne?', img);
    } catch (e: any) {
      flash(e.message);
    }
  };

  // ---- Ayarlar → Ses ----
  useEffect(() => {
    if (drawer !== 'ayarlar') return;
    getVoices().then(r => setVoices(r.voices)).catch(() => setVoices([]));
    const load = () => setBVoices(voice.browserVoices());
    load();
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = load;
  }, [drawer]);

  const chooseVoice = async (sel: VoiceSel, label: string) => {
    try {
      await saveSettings({ voice: sel });
      flash(`Seslendiren: ${label} · tüm cihazlarda güncellendi`);
    } catch (e: any) {
      flash(e.message);
    }
  };
  const previewVoice = (id: string) => {
    previewRef.current?.pause();
    voice.stop();
    const a = new Audio(previewUrl(id));
    previewRef.current = a;
    a.play().catch(() => flash('Önizleme çalınamadı'));
  };
  // Hız kaydırıcısı: bırakınca kaydet (tüm cihazlarda bir sonraki cevaptan geçerli)
  useEffect(() => {
    if (speedDraft === null || !voiceSel || speedDraft === voiceSel.speed) return;
    const t = setTimeout(() => {
      saveSettings({ voice: { ...voiceSel, speed: speedDraft } })
        .then(() => flash(`Konuşma hızı ${speedDraft.toLocaleString('tr-TR')}× · tüm cihazlarda güncellendi`))
        .catch(e => flash(e.message));
    }, 450);
    return () => clearTimeout(t);
  }, [speedDraft, voiceSel]);

  // Masaüstünde boşluk tuşu = bas-konuş (yazı alanı odakta değilken). Çekim kolaylığı: W = test uyanışı, S = uyku.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { stopPlayback(); return; }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyW' && !e.repeat) { postWake('test (W)'); return; }
      if (e.code === 'KeyS' && !e.repeat) { voice.unlock(); postSleep(); return; }
      if (wstate !== 'awake') return;
      if (e.code === 'Space') { e.preventDefault(); toggleMic(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- Uyanış: saat senkronu (bağlanınca ve dakikada bir), ekranı açık tutma ----
  useEffect(() => startClockSync(), []);
  useEffect(() => { if (connected) syncClock(); }, [connected]);
  useEffect(() => keepAwake(), []);

  // İlk dokunuş/tuş: ses bağlamını aç (alkış dinleyicisi ve karşılama buna bağlı). Bekleyen karşılama varsa çal.
  useEffect(() => {
    const onGesture = () => {
      lastActive.current = Date.now();
      voice.unlock();
      if (voice.context) setAudioReady(true);
      setSoundHint(false);
      const g = pendingGreet.current;
      if (g) { pendingGreet.current = null; g(); }
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => { window.removeEventListener('pointerdown', onGesture, true); window.removeEventListener('keydown', onGesture, true); };
  }, []);

  // Boşta kalınca uyku (yalnızca bu cihaz). Jarvis konuşurken/düşünürken, çekmece ya da kalibrasyon açıkken saymaz.
  useEffect(() => {
    const id = setInterval(() => {
      const mins = wakeRef.current?.idleMinutes ?? 0;
      if (!mins || wstateRef.current !== 'awake') return;
      if (coreRef.current !== 'idle' || calibRef.current || drawerRef.current) { lastActive.current = Date.now(); return; }
      if (Date.now() - lastActive.current > mins * 60_000) {
        console.info(`[uyanış] ${mins} dk boşta: uyku modu`);
        enterSleep();
      }
    }, 5000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const drawerRef = useRef(drawer);
  drawerRef.current = drawer;

  // Karşılayan cihaz: şimdiki dönemin karşılamasını önden yükle (uyanışta ağ beklemesi olmasın)
  useEffect(() => {
    if (!wake || !voiceSel || device !== wake.greeter) return;
    voice.preload(wake.greetings[periodNow()], voiceSel, undefined, undefined, true);
  }, [wake, voiceSel, device]);

  // ---- Alkış dinleyicisi: yalnızca dinleyici cihazda, uykudayken (ya da kalibrasyonda) ----
  const listening = !!wake && device === wake.listener && (calibrating || (wake.enabled && wake.mode !== 'voice' && (wstate === 'sleep' || wstate === 'attention')));
  useEffect(() => {
    if (!listening) { setMicError(null); return; }
    const ctx = voice.context;
    if (!ctx || ctx.state !== 'running') { setMicError('Alkışı dinlemek için ekrana bir kez dokunun.'); return; }
    setMicError(null);
    let alive = true;
    let quietUntil = 0;
    // Jarvis konuşurken, komut dinlenirken ve ses bittikten sonraki 600 ms boyunca analiz yok (kendi sesi tetiklemesin)
    const paused = () => {
      if (voice.isPlaying()) { quietUntil = performance.now() + 600; return true; }
      return !!commandRef.current || performance.now() < quietUntil || (wstateRef.current === 'attention' && !calibRef.current);
    };
    const cfg = wakeRef.current!;
    startClapListener(ctx, { sens: cfg.sens, rhythm: cfg.rhythmOn ? cfg.rhythm : null }, {
      onFrame: f => calibBus.sink?.onFrame?.(f),
      onClap: t => calibBus.sink?.onClap?.(t),
      onReject: r => calibBus.sink?.onReject?.(r),
      onPattern: t => {
        calibBus.sink?.onPattern?.(t);
        console.info('[uyanış] çift alkış');
        if (!calibRef.current) onDoubleClap();
      },
    }, paused)
      .then(l => { if (alive) clapRef.current = l; else l.stop(); })
      .catch(err => { console.warn('[uyanış] mikrofon açılamadı', err); setMicError('Mikrofon açılamadı: izin verin ya da dinleyici cihazı değiştirin.'); });
    return () => { alive = false; clapRef.current?.stop(); clapRef.current = null; commandRef.current?.cancel(); };
  }, [listening, audioReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eşik ve ritim değişince dinleyiciyi yeniden başlatmadan uygula
  useEffect(() => {
    const d = clapRef.current?.detector;
    if (!d || !wake) return;
    d.sens = wake.sens;
    d.rhythm = wake.rhythmOn ? wake.rhythm : null;
  }, [wake]);

  // ---- Yalnızca "uyan Jarvis" modu: uykudayken döngüde dinle (konuşma duyulmazsa istek gitmez) ----
  const voiceLoop = !!wake && wake.enabled && wake.mode === 'voice' && device === wake.listener && wstate === 'sleep';
  useEffect(() => {
    if (!voiceLoop) return;
    const ctx = voice.context;
    if (!ctx || ctx.state !== 'running') { setMicError('Dinlemek için ekrana bir kez dokunun.'); return; }
    let alive = true;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        setMicError('Mikrofon açılamadı.');
        return;
      }
      while (alive) {
        const cmd = listenForCommand({ ms: 8000, strict: true, ctx, stream: stream! });
        commandRef.current = cmd;
        const r = await cmd.result;
        commandRef.current = null;
        if (!alive) break;
        if (r.heard) console.info(`[uyanış] duyulan: "${r.heard}" · ${r.matched ? 'eşleşti' : 'eşleşmedi'}`);
        if (r.matched) { postWake(`ses (${r.via === 'webspeech' ? 'Web Speech' : 'RouteLLM'})`, r.heard); break; }
        await new Promise(res => setTimeout(res, 250));
      }
    })();
    return () => { alive = false; commandRef.current?.cancel(); stream?.getTracks().forEach(t => t.stop()); };
  }, [voiceLoop, audioReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveWake = (patch: Partial<WakeConfig>) => {
    saveSettings({ wake: patch }).catch(e => flash(e.message));
  };

  const scene = reply && sceneIdx >= 0 && sceneIdx < reply.sahneler.length ? reply.sahneler[sceneIdx] : null;
  const photo = scene?.gorsel.foto ?? null;
  const done = !!reply && sceneIdx >= reply.sahneler.length;
  const caption = core === 'listening' ? interim || 'dinliyorum…' : scene?.ses ?? preCaption;
  const showCta = core === 'idle' && !caption;

  // Görselsiz yorum sahnesinde bir önceki görsel ekranda kalır; çekirdek her sahnede büyüyüp küçülmez.
  const visualIdx = useMemo(() => {
    if (!reply || sceneIdx < 0 || sceneIdx >= reply.sahneler.length) return -1;
    for (let i = sceneIdx; i >= 0; i--) if (reply.sahneler[i].gorsel.tip !== 'yok') return i;
    return -1;
  }, [reply, sceneIdx]);
  const visualScene = visualIdx >= 0 ? reply!.sahneler[visualIdx] : null;
  const agenda = useMemo(() => (reply ? buildAgenda(reply) : []), [reply]);
  const speakingReply = core === 'speaking' && !!reply && sceneIdx >= 0 && !done;
  const showAgenda = speakingReply && agenda.length > 0;

  // Bağlamsal vurgu: anlatılan sahne doları/euroyu/havayı anıyorsa ilgili panel 1,5 sn parlar.
  useEffect(() => {
    if (core !== 'speaking' || !scene) return;
    const targets = highlightsFor(scene.ses);
    if (!targets.length) return;
    setHl(targets);
    const t = setTimeout(() => setHl(NO_HIGHLIGHT), 1500);
    return () => { clearTimeout(t); setHl(NO_HIGHLIGHT); };
  }, [scene, core]);

  const dashLoading = !dash && !dashTried;
  // Uyurken ve açılış sekansının ilk 2,2 sn'sinde arayüz gizli (yer kaplamaya devam eder: çekirdek kıpırdamaz)
  const uiHidden = wstate === 'sleep' || wstate === 'attention' || (wstate === 'waking' && phase !== 'panels');
  const showSleep = wstate === 'sleep' || wstate === 'attention' || (wstate === 'waking' && phase === 'spark');
  const demo = !!dash?.demo;

  return (
    <div className={`app dev-${device} state-${core} w-${wstate}${uiHidden ? ' hide-ui' : ''}${entering ? ' ui-enter' : ''}${glow ? ' wake-glow' : ''}`}>
      {/* Arka plan: sahne fotoğrafı (yavaş yakınlaşma) */}
      <div className="backdrop">
        <AnimatePresence>
          {photo && (
            <motion.div key={photo.url} className="photo" initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1.0 }} exit={{ opacity: 0 }} transition={{ opacity: { duration: 0.9 }, scale: { duration: 9, ease: 'linear' } }}>
              <img src={photoSrc(photo.url)} alt="" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="grid-bg" />
        <div className="vignette" />
        <div className="scanlines" />
      </div>

      <TopBar me={device} online={online} model={model} connected={connected} mock={mock} />
      <CompactStrip data={dash} />

      <main className="stage">
        {/* Sol sütun: hava + sistem */}
        <aside className="dash-col left" key={'l' + panelKey}>
          <WeatherPanel index={0} data={dash?.weather ?? null} loading={dashLoading} demo={demo} highlight={hl.includes('weather')} />
          <SystemPanel index={1} sys={dash?.system ?? null} news={dash?.news ?? null} online={online} demo={demo} loading={dashLoading} />
        </aside>

        {/* Orta: çekirdek; konuşurken yanında büyük sahne görseli */}
        {/* Görselli düzen: cevapta en az bir görsel varsa (akış listesinden bağımsız; yeni görsel tipleri de sayılır) */}
        <div className={'focus' + (speakingReply && reply!.sahneler.some(s => s.gorsel.tip !== 'yok') ? ' has-visual' : '')}>
          <div className="core-wrap">
            {/* Uyurken çekirdek çizilmez (pil); uyanışta halkalar sırayla çizilerek gelir */}
            {(wstate === 'awake' || wstate === 'waking') && <Core state={core} level={coreLevel} introAt={introAt} />}
            <div className="core-label">{wstate === 'waking' ? 'başlatılıyor' : core === 'idle' ? 'hazır' : core === 'listening' ? 'dinliyor' : core === 'thinking' ? 'düşünüyor' : 'konuşuyor'}</div>
            <Telemetry lines={core === 'thinking' || core === 'speaking' ? telemetry : []} />
            {checks && <WakeChecks health={checks.health} failed={checks.failed} />}
          </div>
          <div className="visual-wrap">
            <AnimatePresence mode="wait">
              {speakingReply && visualScene && (
                <motion.div key={reply!.id + visualIdx} className="visual-slot">
                  <Visual g={visualScene.gorsel} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {photo && <div className="photo-credit">{photo.kind === 'temsili' ? 'temsili görsel · yapay zeka' : `foto · ${photo.credit}`}</div>}
        </div>

        <div className="caption">
          <AnimatePresence mode="wait">
            {caption && (
              <motion.p key={caption} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {caption}
              </motion.p>
            )}
          </AnimatePresence>
          {reply && sceneIdx >= 0 && !done && (
            <div className="scene-dots">{reply.sahneler.map((_, i) => <span key={i} className={i === sceneIdx ? 'on' : i < sceneIdx ? 'past' : ''} />)}</div>
          )}
          {/* Bekleme düğmeleri sahne görselleriyle aynı mode="wait" grubunda değil: görselin çıkışını beklemezler. */}
          <AnimatePresence>
            {showCta && (
              <motion.div key="cta" className="cta" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.35 }}>
                {!reply && <div className="cta-hint">{speechRecognitionSupported() ? 'Mikrofona dokun ya da yaz.' : 'Bir şey yaz.'}</div>}
                <div className="chips">
                  {done && reply?.detay && <button className="detail-cta" onClick={() => setDrawer('detay')}>detaylı özeti aç ↗</button>}
                  {SUGGESTIONS.map(s => <button key={s} onClick={() => submit(s)}>{s}</button>)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sağ sütun: piyasalar + gündem; konuşurken gündem "Bugünün akışı"na dönüşür */}
        <aside className="dash-col right" key={'r' + panelKey}>
          <MarketsPanel index={2} data={dash?.markets ?? null} loading={dashLoading} demo={demo} highlight={hl} />
          <AnimatePresence mode="wait" initial={false}>
            {showAgenda ? (
              <AgendaPanel key={'agenda-' + reply!.id} reply={reply!} items={agenda} sceneIdx={sceneIdx} />
            ) : (
              <NewsStatsPanel key="news" index={3} data={dash?.news ?? null} loading={dashLoading} demo={demo} />
            )}
          </AnimatePresence>
        </aside>
      </main>

      <HeadlineTicker headlines={dash?.news.headlines ?? null} loading={dashLoading} demo={demo} />

      <footer className="dock">
        <button className="icon-btn" onClick={() => setDrawer(drawer ? null : 'gecmis')} aria-label="Menü">☰</button>
        <form className="ask" onSubmit={e => { e.preventDefault(); submit(input); }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Jarvis'e sor…" enterKeyHint="send" />
        </form>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="icon-btn cam" onClick={() => { voice.unlock(); fileRef.current?.click(); }} aria-label="Fotoğraf">
          <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </button>
        <button className={'mic ' + (core === 'listening' ? 'live' : '')} onClick={toggleMic} aria-label="Konuş">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </button>
        {core === 'speaking' && <button className="icon-btn" onClick={stopPlayback} aria-label="Durdur">■</button>}
      </footer>

      <AnimatePresence>
        {drawer && (
          <motion.aside className="drawer" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }}>
            <div className="drawer-tabs">
              {(['detay', 'gecmis', 'ayarlar'] as const).map(t => (
                <button key={t} className={drawer === t ? 'on' : ''} onClick={() => setDrawer(t)}>{t === 'detay' ? 'Detay' : t === 'gecmis' ? 'Geçmiş' : 'Ayarlar'}</button>
              ))}
              <button className="close" onClick={() => setDrawer(null)}>✕</button>
            </div>
            <div className="drawer-body">
              {drawer === 'detay' && (reply?.detay ? <Markdown text={reply.detay} /> : <p className="muted">Henüz detay yok.</p>)}
              {drawer === 'gecmis' && (
                <ul className="history">
                  {messages.length === 0 && <p className="muted">Konuşma boş.</p>}
                  {messages.map((m, i) => (
                    <li key={i} className={m.role}>
                      <span className="who">{m.role === 'user' ? `sen · ${DEVICE_LABEL[m.device]}` : 'jarvis'}</span>
                      <span className="txt">{m.text}</span>
                      {m.reply && <button className="replay" onClick={() => { voice.unlock(); setDrawer(null); play(m.reply!); }}>▶ burada oynat</button>}
                    </li>
                  ))}
                </ul>
              )}
              {drawer === 'ayarlar' && (
                <div className="settings">
                  <label>Bu cihaz</label>
                  <div className="seg">
                    {(['masaustu', 'tablet', 'telefon'] as Device[]).map(d => (
                      <button key={d} className={device === d ? 'on' : ''} onClick={() => { saveDevice(d); setDevice(d); }}>{DEVICE_LABEL[d]}</button>
                    ))}
                  </div>
                  <label>Fotoğraf modu</label>
                  <div className="seg">
                    <button className={photoMode === 'haber' ? 'on' : ''} onClick={() => setPhotoMode('haber')}>Haber fotoğrafı</button>
                    <button className={photoMode === 'video' ? 'on' : ''} onClick={() => setPhotoMode('video')}>Video (stok)</button>
                  </div>
                  <p className="muted small">Video modu, çekimde telifsiz stok fotoğraf kullanır.</p>
                  <label>Seslendiren</label>
                  {voices === null ? <p className="muted small">yükleniyor…</p> : voices.length === 0 ? (
                    <p className="muted small">Doğrulanmış ses yok. Sunucuda <code>npm run voices</code> çalıştırın.</p>
                  ) : (
                    [...new Set(voices.map(voiceGroup))].map(group => (
                      <div key={group} className="vgroup">
                        <div className="vgroup-title">{group}</div>
                        {voices.filter(v => voiceGroup(v) === group).map(v => {
                          const on = voiceSel?.model === v.model && voiceSel?.voice === v.voice;
                          return (
                            <div key={v.id} className={'vrow' + (on ? ' on' : '')}>
                              <button className="vpick" onClick={() => voiceSel && chooseVoice({ model: v.model, voice: v.voice, speed: voiceSel.speed }, v.label)}>
                                <span className="vmark">{on ? '●' : '○'}</span>
                                <span className="vname">{v.label.split(' · ')[0]}</span>
                                <span className="vmeta">{voiceTone(v.f0)}{v.wpm ? ` · ${v.wpm} kel/dk` : ''}</span>
                              </button>
                              <button className="vplay" onClick={() => previewVoice(v.id)}>▶ dinle</button>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                  <label>Konuşma hızı · {(speedDraft ?? voiceSel?.speed ?? 1.08).toLocaleString('tr-TR')}×</label>
                  <input className="range" type="range" min={0.9} max={1.3} step={0.02} value={speedDraft ?? voiceSel?.speed ?? 1.08} onChange={e => setSpeedDraft(Number(e.target.value))} />
                  <label>Jarvis efekti (sahne geçiş sesi)</label>
                  <div className="seg">
                    <button className={sfxOn ? 'on' : ''} onClick={() => saveSettings({ sfx: true })}>Açık</button>
                    <button className={!sfxOn ? 'on' : ''} onClick={() => saveSettings({ sfx: false })}>Kapalı</button>
                  </div>
                  <label>Tarayıcı sesi (çevrimdışı yedek)</label>
                  {bVoices.length === 0 ? <p className="muted small">Bu cihazda Türkçe tarayıcı sesi yok.</p> : (
                    <div className="vgroup">
                      {bVoices.map(b => {
                        const on = voiceSel?.model === 'browser' && voice.browserVoiceName === b.name;
                        return (
                          <div key={b.name} className={'vrow' + (on ? ' on' : '')}>
                            <button className="vpick" onClick={() => { voice.browserVoiceName = b.name; if (voiceSel) chooseVoice({ model: 'browser', voice: b.name, speed: voiceSel.speed }, `${b.name} (tarayıcı)`); }}>
                              <span className="vmark">{on ? '●' : '○'}</span>
                              <span className="vname">{b.name}</span>
                              <span className="vmeta">{b.localService ? 'cihazda' : 'çevrimiçi'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="muted small">Tarayıcı sesleri her cihazda farklıdır; seçim tüm cihazları tarayıcı sesine geçirir, ses adı bu cihazda saklanır.</p>
                  {wake && (
                    <WakeSettings
                      cfg={wake}
                      device={device}
                      calibrating={calibrating}
                      onCalibrate={on => { voice.unlock(); setAudioReady(true); setCalibrating(on); }}
                      onSave={saveWake}
                      onSleep={() => { voice.unlock(); postSleep(); }}
                      onTestWake={() => postWake('test (ayarlar)')}
                      onLiveSens={v => { const d = clapRef.current?.detector; if (d) d.sens = v; }}
                    />
                  )}
                  {micError && calibrating && <p className="muted small">{micError}</p>}
                  <button className="danger" onClick={() => clearConversation()}>Konuşmayı temizle</button>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <Handoff info={handoff} />

      {showSleep && (
        <SleepLayer
          mode={wstate === 'waking' ? 'waking' : wstate === 'attention' ? 'attention' : 'sleep'}
          heard={heardLive}
          hint={micError}
          onDoubleTap={() => postWake('çift dokunma')}
        />
      )}

      <AnimatePresence>
        {toast && <motion.div className="toast" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{toast}</motion.div>}
        {error && <motion.div className="toast err">{error}</motion.div>}
        {soundHint && <motion.div key="sound" className="toast sound-hint" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>Sesi açmak için ekrana dokunun</motion.div>}
      </AnimatePresence>
    </div>
  );
}
