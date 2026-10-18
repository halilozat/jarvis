import { AnimatePresence, motion } from 'framer-motion';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ProfileSettings } from './components/Profile';
import { LibrarySettings } from './components/LibrarySettings';
import { addNote, patchBook, type Kitap } from './lib/library';
import { VideoPanel, type VideoInfo } from './components/VideoPanel';
import { CameraPanel } from './camera/CameraPanel';
import { HomePanel, HomeToast, getHome, homeAct, type HomeState } from './components/HomePanel';
import type { Kontrol } from './hands/controller';
import type { GezegenTur } from './hands/fx';
import { emitCamera, getCameras, getRole, isCameraEvent, onCamera, setRole, toggleCameraPanel } from './lib/camera';
import { type ElevenUsage, clearConversation, detectDevice, getDashboard, getHealth, getState, getVoices, metric, postAttention, postSleep, postWake, previewUrl, saveDevice, saveSettings, sendChat, setPhotoMode, stt, subscribe, token, clientId } from './lib/api';
import { startClapListener, type ClapListener } from './lib/clap';
import { shrinkImage } from './lib/image';
import { recorderSupported, startRecording } from './lib/recorder';
import { Markdown } from './lib/markdown';
import { createRecognizer, speechRecognitionSupported, voice } from './lib/speech';
import { DEVICE_LABEL, type CoreState, type CurrencyCode, type Dashboard, type Device, type GreetingPeriod, type Health, type JarvisReply, type Sahne, type ServerEvent, type StoredMessage, type UiMode, type VoiceOption, type VoiceSel, type WakeConfig } from './lib/types';
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

// Mark 2 (yoğun HUD) ayrı parça olarak yüklenir: Mark 1 kullanan cihaz onu indirmez.
const Mark2 = lazy(() => import('./mark2/Mark2'));
// El Kontrolü (kamera + el takibi) ayrı parça: yalnızca açılınca indirilir.
const HandControl = lazy(() => import('./hands/HandControl'));
/** ?el=1 açılışta el kontrolünü açar, ?el=demo kamerasız sentetik ellerle gösterir */
const EL_PARAM = ((q: string | null) => (q === 'demo' ? 'demo' : q === '1' || q === 'kamera' ? 'kamera' : null))(new URLSearchParams(location.search).get('el'));
/** "Jarvis, el kontrolünü aç / kapat" — sunucuya gitmeden arayüzde karşılanır */
const EL_OPEN = /\b(el kontrol[a-zçğıöşü]*|büyü modu[a-zçğıöşü]*)\b.*\b(aç|başlat|etkinleştir)|^(el kontrolü|büyü modu)$/i;
const EL_CLOSE = /\b(el kontrol[a-zçğıöşü]*|büyü modu[a-zçğıöşü]*)\b.*\b(kapat|durdur)/i;
/** ?el=demo&kitaplik=1: kitaplık demosu (prosedürel raf) */
const KITAPLIK_DEMO = new URLSearchParams(location.search).get('kitaplik') === '1';
/** "Jarvis, kitaplığımı tara" / "kitaplığı tarar mısın" / "rafları tara" (El Kontrolü kamerasıyla) */
const KITAPLIK_TARA = /(kitapl[ıi]k|kitapl[ıi][gğ][ıi](m[ıi])?|raflar[ıi](m[ıi])?)\s.*?\btar(a|ar|at)/i;
/** Kitap açıkken: "Jarvis, bunu özetle", "kitabı özetle", "özetini oku" */
/** Kitap açıkken: "Jarvis, not al: …", "buna not ekle …", "alıntı ekle: …" → o kitaba eklenir (modele gitmez) */
const KITABA_NOT = /^\s*(jarvis[,\s]+)?(bunu\s+|buna\s+|bu kitaba\s+|kitaba\s+)?(not al|not ekle|notlara ekle|alıntı ekle|alıntı al|alıntılara ekle)\s*[:,.\-–]?\s*(.+)$/i;
/** Kitap açıkken: "Jarvis, bu kitabın adı Davranış" → açık kitap adlandırılır, Jarvis sayfaları dolar */
const KITABIN_ADI = /(^|\s)(bu\s+)?kitab[ıi]n\s+ad[ıi](?:\s*[:,]\s*|\s+)["“']?(?!(?:ne|nedir|neydi)\s*\??\s*$)([^?]+?)["”']?[.!]?\s*$/i;
/** El Kontrolü açıkken: "Jarvis, Mars yap", "Jüpiter'e çevir", "gezegeni Dünya yap", "Güneş olsun" */
const GEZEGEN_KOMUT = /(?:^|\s)(dünya|mars|jüpiter|jupiter|satürn|saturn|ay|güneş)(?:['’]?(?:y?[aeıiuü]|[dt][ae]|n[ıiuü]n))?\s+(yap|çevir|olsun|getir|dönüştür|oluştur)/i;
const GEZEGEN_ADI: Record<string, GezegenTur> = { dünya: 'dunya', mars: 'mars', jüpiter: 'jupiter', jupiter: 'jupiter', satürn: 'saturn', saturn: 'saturn', ay: 'ay', güneş: 'gunes' };
const BUNU_OZETLE = /(^|\s)(bunu|kitab[ıi]|bu kitab[ıi])\s+(özetle|özetler misin|anlat|oku)(?=$|[\s,.!?])|(^|\s)özetini\s+(oku|söyle)/i;
/** ?ui=mark2 ya da ?ui=mark1: ortak ayarı değiştirmeden yalnızca bu sekmede dene */
const UI_OVERRIDE = ((q: string | null) => (q === 'mark1' || q === 'mark2' ? q : null))(new URLSearchParams(location.search).get('ui'));

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
  const [elevenUse, setElevenUse] = useState<ElevenUsage | null>(null);
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
  // Jarvis içinde açılan YouTube videosu
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const videoRef = useRef(video);
  videoRef.current = video;
  // İki alkışla uyanma
  const [uiShared, setUi] = useState<UiMode>('mark1');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [userName, setUserName] = useState('');
  // Akıllı ev
  const [home, setHome] = useState<HomeState | null>(null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [homeToast, setHomeToast] = useState<string | null>(null);
  // El kontrolü
  const [hands, setHands] = useState<null | 'kamera' | 'demo'>(EL_PARAM);
  const handsRef = useRef(hands);
  handsRef.current = hands;
  // Kitaplık: SSE ile değişince artar (El Kontrolü ve Ayarlar yeniden yükler); sesli tarama sinyali; açık kitap
  const [libKey, setLibKey] = useState(0);
  const [scanSig, setScanSig] = useState(0);
  const openBook = useRef<Kitap | null>(null);
  const [planetCmd, setPlanetCmd] = useState<{ tur: GezegenTur; n: number } | null>(null);
  const homeRef = useRef(home);
  homeRef.current = home;
  useEffect(() => { getHome().then(h => h && setHome(h)); }, []);
  const [camCount, setCamCount] = useState(0);
  useEffect(() => {
    if (!cameraEnabled) return;
    getCameras().then(r => r && setCamCount(r.cameras.length));
    return onCamera(e => { if (e.type === 'cameras') setCamCount(e.cameras.length); });
  }, [cameraEnabled]);
  /** "Kamera" düğmesi: canlı kamera paneli; bağlı kamera yoksa nasıl bağlanacağını söyler */
  const openLiveCamera = () => {
    if (!cameraEnabled) return flash('Kamera özelliği kapalı: sunucuda ACCESS_TOKEN tanımlı değil.');
    if (!camCount) return flash("Henüz kamera cihazı bağlı değil efendim. Eski iPhone'da Jarvis'i açıp Ayarlar → Bu cihazın rolü → Kamera seçin.");
    toggleCameraPanel();
  };
  const ui: UiMode = UI_OVERRIDE ?? uiShared;
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
      // Önceki/sonraki cümle bağlamı: ElevenLabs tonlamayı sahneler arasında sürdürür (diğer seslerde yok sayılır)
      const ctx = (j: number) => ({ prev: l.scenes[j - 1]?.ses, next: l.scenes[j + 1]?.ses });
      l.scenes.slice(i, i + 3).forEach((s, k) => voice.preload(s.ses, l.voice, i + k + 1, n, false, ctx(i + k)));
      setSceneIdx(i);
      voice.blip();
      // Eskiden her sahneye max(2,6 sn, 45 ms × karakter) zorla bekleniyordu. Artık süreyi ses belirler;
      // yalnızca görselli sahnelerde animasyon tamamlansın diye en fazla 1,2 sn alt sınır var.
      const minMs = sc.gorsel.tip !== 'yok' ? 1200 : 0;
      await Promise.all([voice.speak(sc.ses, l.voice, i + 1, n, ctx(i)), new Promise(r => setTimeout(r, minMs))]);
      if (playToken.current !== my) return;
      // Video sahnesi: cümleden sonra video Jarvis'in içinde açılır, cevap burada biter (sesler çakışmasın)
      if (sc.gorsel.tip === 'video') {
        setVideo({ id: sc.gorsel.youtube_id, title: sc.gorsel.baslik, channel: sc.gorsel.kanal, external: !!sc.gorsel.harici, vertical: !!sc.gorsel.dikey });
        break;
      }
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
  const closeVideo = useCallback(() => setVideo(null), []);

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
    setVideo(null);
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
        setUi(s.ui ?? 'mark1');
        setCameraEnabled(!!s.camera?.enabled);
        setUserName(s.userName || '');
        const last = [...s.messages].reverse().find(m => m.reply);
        if (last?.reply) { setReply(last.reply); setModel(brainLabel(last.reply)); setSceneIdx(last.reply.sahneler.length); }
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    return subscribe(device, (e: ServerEvent) => {
      if (isCameraEvent(e)) { emitCamera(e); return; } // kamera paneli dinler
      if (e.type === 'kitaplik') { setLibKey(k => k + 1); return; }
      if (e.type === 'home') {
        setHome(e);
        if (e.last) {
          const d = e.devices.find(x => x.id === e.last!.id);
          setHomeToast(`${d?.ad ?? e.last.id} · ${e.last.ozet}`);
          setTimeout(() => setHomeToast(t => (t?.startsWith(d?.ad ?? e.last!.id) ? null : t)), 2800);
        }
        return;
      }
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
          if (e.ui) setUi(e.ui);
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
    voice.onFallback = reason => flash(`Ses alınamadı (${reason}). Başka sese geçilmedi.`);
  }, []);

  // ---- Gönderme ----
  const submit = async (text: string, image?: string) => {
    const t = text.trim();
    if (!t && !image) return;
    if (!image && EL_CLOSE.test(t)) { setInput(''); setInterim(''); setCore('idle'); setHands(null); return; }
    if (!image && EL_OPEN.test(t)) { voice.unlock(); setInput(''); setInterim(''); setCore('idle'); setHands(h => h ?? 'kamera'); return; }
    // Kitaplık taraması El Kontrolü'nün kamerasıyla yapılır (kapalıysa açılır)
    if (!image && KITAPLIK_TARA.test(t)) {
      voice.unlock(); setInput(''); setInterim('');
      setHands(h => h ?? (KITAPLIK_DEMO ? 'demo' : 'kamera'));
      setScanSig(n => n + 1);
      speakLine('Kitaplığınızı tarıyorum efendim.');
      return;
    }
    // Gezegen dönüştür (yalnızca El Kontrolü açıkken; modele gitmez, anında)
    const gm = !image && handsRef.current ? GEZEGEN_KOMUT.exec(t) : null;
    if (gm) {
      setInput(''); setInterim(''); setCore('idle');
      setPlanetCmd(c => ({ tur: GEZEGEN_ADI[gm[1].toLocaleLowerCase('tr')], n: (c?.n ?? 0) + 1 }));
      return;
    }
    // Açık kitabı adlandır (adı okunamamış sırtlar için): ad yazılır, sunucu kapağı ve Jarvis sayfalarını doldurur
    const an = !image && openBook.current ? KITABIN_ADI.exec(t) : null;
    if (an && openBook.current) {
      voice.unlock(); setInput(''); setInterim('');
      const ad = an[3].trim();
      patchBook(openBook.current.id, { ad })
        .then(() => speakLine('Tamamdır efendim, ekliyorum.'))
        .catch(e => flash(`Kitap adlandırılamadı: ${e.message}`));
      return;
    }
    // Açık kitaba not/alıntı
    const nm = !image && openBook.current ? KITABA_NOT.exec(t) : null;
    if (nm && openBook.current) {
      voice.unlock(); setInput(''); setInterim('');
      const alinti = /alıntı/i.test(nm[3]);
      const metin = nm[4].trim().replace(/[.。]+$/, '');
      addNote(openBook.current.id, metin, alinti ? 'alinti' : 'not')
        .then(() => speakLine(alinti ? 'Alıntıyı ekledim efendim.' : 'Not aldım efendim.'))
        .catch(e => flash(`Not eklenemedi: ${e.message}`));
      return;
    }
    // Açık kitabın özeti: modele gitmeden, hazır özeti seçili sesle oku
    if (!image && openBook.current && BUNU_OZETLE.test(t)) {
      voice.unlock(); setInput(''); setInterim('');
      readBook(openBook.current);
      return;
    }
    voice.unlock(); // kullanıcı hareketi içinde sesi aç
    stopPlayback();
    setVideo(null); // yeni soru: açık video kapanır
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
    setVideo(null); // mikrofon videonun sesini duymasın
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

  /** Modele gitmeden tek bir cümleyi seçili sesle söyle (altyazıyla). delay: önce çalan efekt sesi bitsin. */
  const speakLine = (text: string, delay = 0) => {
    if (!voiceSel) return;
    const my = ++playToken.current;
    setSceneIdx(-1);
    setPreCaption(text);
    setCore('speaking');
    voice.rate = voiceSel.speed;
    voice.beginReply();
    setTimeout(() => {
      if (playToken.current !== my) return;
      voice.speak(text, voiceSel).then(() => {
        if (playToken.current !== my) return;
        setPreCaption('');
        setCore('idle');
      });
    }, delay);
  };

  /** Yüz kilidi: seçili sesle tek cümle. Sesi sunucuda önceden hazır (server/src/scripted.ts YUZ_KILIDI ile aynı metin).
   *  En fazla dakikada bir; Jarvis başka bir şey anlatıyorsa araya girmez. */
  const faceGreetAt = useRef(0);
  const onFaceLock = () => {
    const now = Date.now();
    if (now - faceGreetAt.current < 60_000 || coreRef.current !== 'idle' || !voiceSel) return;
    faceGreetAt.current = now;
    // Kilit sesinin (iki bip) bitmesini bekle, sonra konuş
    speakLine('Yüz tanındı. Hoş geldiniz efendim, tam yetki verildi.', 350);
  };

  /** Kitap açıkken 👍 ya da "bunu özetle": özeti seçili sesle oku */
  const readBook = (k: Kitap) => {
    if (k.ozet) speakLine(k.ozet);
    else speakLine(k.ad ? `${k.ad} için henüz bir özetim yok efendim.` : 'Bu kitabın adını bilmiyorum efendim.');
  };
  const onScanDone = (r: { bulunan: number; belirsiz: number; hata?: string }) => {
    if (r.hata) speakLine('Kitaplığı tarayamadım efendim. Ayrıntı ekranda.');
    else speakLine(`${r.bulunan} kitap tanıdım efendim${r.belirsiz ? `, ${r.belirsiz} tanesinin sırtını okuyamadım` : ''}.`);
  };

  /** El kontrolünde basılı tutma tamamlandı */
  const onHandAction = (k: Kontrol) => {
    const e = k.eylem;
    if (e.tip === 'komut') submit(e.metin);
    else if (e.tip === 'sustur') stopPlayback();
    else if (e.tip === 'isik') {
      const d = homeRef.current?.devices.find(x => x.id === e.id);
      homeAct(e.id, { islem: d?.tur === 'isik' && d.acik ? 'kapat' : 'ac' });
    }
  };
  const toggleHands = () => { voice.unlock(); setHands(h => (h ? null : 'kamera')); };

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
    getVoices().then(r => { setVoices(r.voices); setElevenUse(r.eleven); }).catch(() => setVoices([]));
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
      if (e.key === 'Escape') { if (videoRef.current) setVideo(null); else stopPlayback(); return; }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyW' && !e.repeat) { postWake('test (W)'); return; }
      if (e.code === 'KeyS' && !e.repeat) { voice.unlock(); postSleep(); return; }
      if (e.code === 'KeyH' && !e.repeat) { toggleHands(); return; }
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
      if (coreRef.current !== 'idle' || calibRef.current || drawerRef.current || videoRef.current || handsRef.current) { lastActive.current = Date.now(); return; }
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
    for (let i = sceneIdx; i >= 0; i--) if (reply.sahneler[i].gorsel.tip !== 'yok' && reply.sahneler[i].gorsel.tip !== 'video') return i;
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
      {/* El Kontrolü tam ekranken arkadaki arayüz hiç çizilmez: Mark 2'nin küresi ve halkaları görünmese de her karede
          çiziliyordu; bir MacBook'ta El Kontrolü 48 FPS'te kalıyordu (gizleyince 64). Kapanınca geri gelir. */}
      {hands ? null : ui === 'mark2' ? (
        <Suspense fallback={null}>
          <Mark2
            device={device}
            online={online}
            connected={connected}
            mock={mock}
            model={model}
            dash={dash}
            core={core}
            level={coreLevel}
            introAt={(wstate === 'awake' || wstate === 'waking') ? introAt : null}
            reply={reply}
            sceneIdx={sceneIdx}
            visualScene={visualScene}
            visualKey={reply ? reply.id + visualIdx : ''}
            photo={speakingReply ? photo : null}
            photoSrc={photoSrc}
            speakingReply={speakingReply}
            agenda={agenda}
            caption={caption}
            telemetry={telemetry}
            hl={hl}
            checks={checks && <WakeChecks health={checks.health} failed={checks.failed} />}
            panelKey={panelKey}
            input={input}
            setInput={setInput}
            onSubmit={t => submit(t)}
            onMic={toggleMic}
            onCamera={() => { voice.unlock(); fileRef.current?.click(); }}
            onLiveCamera={openLiveCamera}
            home={home}
            onHome={() => setHomeOpen(o => !o)}
            onHands={toggleHands}
            onStop={stopPlayback}
            onDrawer={d => setDrawer(drawer === d ? null : d)}
            onSleep={() => { voice.unlock(); postSleep(); }}
          />
        </Suspense>
      ) : (
        <>
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
          <div className={'focus' + (speakingReply && reply!.sahneler.some(s => s.gorsel.tip !== 'yok' && s.gorsel.tip !== 'video') ? ' has-visual' : '')}>
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
          <button className="icon-btn cam" onClick={() => setHomeOpen(o => !o)} aria-label="Akıllı ev" title="Akıllı ev">
            <svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></svg>
          </button>
          <button className="icon-btn cam" onClick={toggleHands} aria-label="El kontrolü" title="El kontrolü (H)">
            <svg viewBox="0 0 24 24"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M8 11.5a1.5 1.5 0 0 0-3 0V14a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6V9.5a1.5 1.5 0 0 0-3 0" /></svg>
          </button>
          <button className="icon-btn cam live" onClick={openLiveCamera} aria-label="Canlı kamera" title="Canlı kamera">
            <svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2" /><path d="M16 11l5-3v8l-5-3z" /></svg>
          </button>
          <button className="icon-btn cam" onClick={() => { voice.unlock(); fileRef.current?.click(); }} aria-label="Fotoğraf" title="Fotoğraf gönder">
            <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          </button>
          <button className={'mic ' + (core === 'listening' ? 'live' : '')} onClick={toggleMic} aria-label="Konuş">
            <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
          {core === 'speaking' && <button className="icon-btn" onClick={stopPlayback} aria-label="Durdur">■</button>}
        </footer>
        </>
      )}

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
                  <label>Ekran (tüm cihazlarda)</label>
                  <div className="seg">
                    <button className={ui === 'mark1' ? 'on' : ''} onClick={() => saveSettings({ ui: 'mark1' }).catch(e => flash(e.message))}>Mark 1 · sade</button>
                    <button className={ui === 'mark2' ? 'on' : ''} onClick={() => saveSettings({ ui: 'mark2' }).catch(e => flash(e.message))}>Mark 2 · yoğun HUD</button>
                  </div>
                  <p className="muted small">Mark 2 geniş ekran için tasarlandı; telefonda sade bir düzene geçer.</p>
                  <ProfileSettings flash={flash} />
                  <LibrarySettings flash={flash} version={libKey} />
                  <label>Bu cihazın rolü</label>
                  <div className="seg">
                    <button className={getRole() === 'ekran' ? 'on' : ''} onClick={() => setRole('ekran')}>Ekran</button>
                    <button className={getRole() === 'kamera' ? 'on' : ''} disabled={!cameraEnabled} onClick={() => setRole('kamera')}>Kamera (Jarvis'in gözü)</button>
                  </div>
                  <p className="muted small">
                    {cameraEnabled
                      ? 'Kamera rolünde bu cihaz Jarvis arayüzü yerine kamera ekranını açar; görüntüsü diğer ekranlarda canlı izlenir ve Jarvis istenince ona bakar.'
                      : 'Kamera özelliği kapalı: sunucuda ACCESS_TOKEN tanımlı değil. Görüntü taşıyan bir özellik olduğu için erişim anahtarı olmadan açılmaz (README → Kamera cihazı).'}
                  </p>
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
                  {elevenUse && (
                    <p className="muted small">
                      ElevenLabs kullanımı: {elevenUse.used.toLocaleString('tr-TR')} / {elevenUse.limit.toLocaleString('tr-TR')} karakter
                      {elevenUse.resetAt ? ` · ${new Date(elevenUse.resetAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} yenilenir` : ''}
                      {elevenUse.tier ? ` · ${elevenUse.tier}` : ''}
                    </p>
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

      {cameraEnabled && <CameraPanel />}

      <AnimatePresence>{homeOpen && home && <HomePanel home={home} onClose={() => setHomeOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{homeToast && !homeOpen && <HomeToast key={homeToast} text={homeToast} />}</AnimatePresence>

      {hands && (
        <Suspense fallback={null}>
          <HandControl demo={hands === 'demo'} caption={caption} core={core} onAction={onHandAction} onClose={() => setHands(null)} userName={userName} onFaceLock={onFaceLock}
            kitaplik={KITAPLIK_DEMO} libraryKey={libKey} scanSignal={scanSig} onScanDone={onScanDone}
            onBookRead={readBook} onBookOpen={k => { openBook.current = k; }} planetCmd={planetCmd} />
        </Suspense>
      )}

      <AnimatePresence>{video && <VideoPanel key={video.id} video={video} onClose={closeVideo} />}</AnimatePresence>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
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
