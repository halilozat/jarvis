// El Kontrolü: kamera görüntüsü üstünde el takibi, büyü efektleri ve jestle Jarvis kontrolü.
// Tuşlar: Esc kapat · L arayüzü gizle/göster (temiz çekim) · D iskelet · M ses · C kamera değiştir · F yüz kilidi · K kitaplık ayarı
// U uzay modu · B arka plan (tam uzay / oda)
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';
import { Controller, KONTROLLER, type Kontrol, type Status } from './controller';
import { Fx } from './fx';
import { GESTURE_LABEL } from './gestures';
import { Sfx } from './sfx';
import { demoBookHands, demoHands } from './synthetic';
import { detect, listCameras, loadLandmarker, openCamera, type CameraInfo, type RawHand } from './tracker';
import { FaceHud, demoFace, detectFaces, loadFaceDetector } from './face';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import { Library, loadCover, thumbOf } from './library';
import LibraryEditor from './LibraryEditor';
import { DEMO_TARGET, buildDemoShelf, demoStream } from './shelfDemo';
import { AYAR_LISTESI, loadAyar, saveAyar, type ElAyar } from './settings';
import { GEZEGENLER, type GezegenTur } from './fx';
import { fillBook, getLibrary, saveLibrary, scanLibrary, shelfRegion, tileFrame, type Kitap } from '../lib/library';
import { SpaceBrain } from './space/brain';
import type { SpaceCmd } from './space/commands';
import { demoSpaceHands } from './space/demo';
import { ONAY } from './space/facts';
import { loadTextures } from './space/planets';
import { PersonCutout, loadSegmenter } from './space/segment';
import { Starfield } from './space/starfield';
import './hands.css';

export interface HandControlProps {
  /** Sentetik ellerle çalış (kamera yok): ?el=demo */
  demo?: boolean;
  /** Jarvis'in o anki altyazısı ve durumu */
  caption: string;
  core: string;
  onAction(k: Kontrol): void;
  onClose(): void;
  /** Yüz HUD etiketindeki ad (.env USER_NAME) */
  userName?: string;
  /** Kullanıcının yüzüne kilitlendi (yalnızca "TANINDI" yüz için) */
  onFaceLock?(): void;
  /** Demo: arka plana prosedürel kitaplık (?el=demo&kitaplik=1) */
  kitaplik?: boolean;
  /** Sunucuda kitaplık değişti (SSE): haritayı yeniden yükle */
  libraryKey?: number;
  /** "Jarvis, kitaplığımı tara": her artışta bir tarama */
  scanSignal?: number;
  onScanDone?(r: { bulunan: number; belirsiz: number; hata?: string }): void;
  /** Kitap açıkken 👍 basılı: özeti seçili sesle oku */
  onBookRead?(k: Kitap): void;
  /** Açık kitap değişti ("Jarvis, bunu özetle" için) */
  onBookOpen?(k: Kitap | null): void;
  /** "Jarvis, Mars yap": n her istekte artar */
  planetCmd?: { tur: GezegenTur; n: number } | null;
  /** Uzay modunda başla (?mod=uzay ya da "Jarvis, uzay modunu aç") */
  uzay?: boolean;
  /** Uzay sesli komutu (sunucuya gitmez): n her istekte artar */
  spaceCmd?: { cmd: SpaceCmd; n: number } | null;
  /** Mikrofon dinliyor (✌️ elinin çevresinde dalga) */
  listening?: boolean;
  /** Jarvis bu hazır cümleyi seçili sesle söylesin */
  onSay?(text: string): void;
  /** ✌️ basılı (uzay modu): mikrofonu aç */
  onMic?(): void;
  onModeChange?(m: 'buyu' | 'uzay'): void;
}

/** Uzay modu jestleri */
const LEGEND_UZAY: [string, string][] = [
  ['🤏', 'gezegen tut'], ['🤏+1…5', 'diğer el: Dünya · Mars · Jüpiter · Satürn · Güneş'], ['↻', 'bileği çevir'], ['🤏🤏', 'büyüt'],
  ['💥', 'iki gezegeni çarpıştır'], ['✋✋', 'güneş sistemi'], ['✊ 1,5 sn', 'kara delik'], ['✊→✋', 'patlat'], ['✌️', 'mikrofon'],
];

const LEGEND: [string, string][] = [
  ['✋', 'ateş'], ['✋✋', 'mühür'], ['🤏', 'gezegen'], ['🤏🤏', 'büyüt'], ['✊→✋', 'patlat'], ['☝️☝️', 'şimşek'], ['☝️', 'iz'],
  ...KONTROLLER.map(k => [k.jest === 'basparmak' ? '👍' : k.jest === 'zafer' ? '✌️' : k.jest === 'yumruk' ? '✊ tut' : k.jest, k.ad.replace(/^\S+\s/, '').toLocaleLowerCase('tr')] as [string, string]),
];

/** Kitap dışarıdayken (seçili/tutuldu/açık) jest listesi */
const LEGEND_KITAP: [string, string][] = [['☝️', 'kitap seç'], ['🤏', 'tut ve çek'], ['✋⇠', 'sayfa çevir'], ['👍', 'özeti oku'], ['✊', 'rafa koy'], ['✋⤴', 'ileri it: rafa koy']];

export default function HandControl(p: HandControlProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceRef = useRef<HTMLCanvasElement>(null);
  const shelfRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLCanvasElement>(null);
  const spaceRef = useRef<HTMLCanvasElement>(null);
  const brainRef = useRef<SpaceBrain | null>(null);
  /** Mod: büyü ya da uzay (U). Arka plan: tam uzay (sizi odadan ayırır) ya da katman (oda görünür) (B). */
  const [mod, setMod] = useState<'buyu' | 'uzay'>(p.uzay ? 'uzay' : 'buyu');
  const [arka, setArka] = useState<'tam' | 'katman'>('tam');
  const modRef = useRef(mod);
  const arkaRef = useRef(arka);
  useEffect(() => { modRef.current = mod; arkaRef.current = arka; }, [mod, arka]);
  const libRef = useRef<Library | null>(null);
  const shelfDemo = !!(p.demo && p.kitaplik);
  /** Kitaplık ayar modu (K) */
  const [editing, setEditing] = useState(false);
  // Kitaplık demosu: prosedürel raf ve kitapları bir kez üret
  const [demoShelf] = useState(() => (shelfDemo ? buildDemoShelf() : null));
  const [libBooks, setLibBooks] = useState<Kitap[]>(() => demoShelf?.books ?? []);
  const [scanning, setScanning] = useState(false);
  const [moved, setMoved] = useState(false);
  const [dims, setDims] = useState({ W: window.innerWidth, H: window.innerHeight, vw: 1920, vh: 1080 });
  /** Efekt ayarları (⚙ / E): bu cihazda saklanır. Kitaplık demosunda yüz kilidi kapalı başlar (raf temiz görünsün). */
  const [ayar, setAyarState] = useState<ElAyar>(() => ({ ...loadAyar(), ...(shelfDemo ? { yuz: false } : {}) }));
  const [ayarOpen, setAyarOpen] = useState(false);
  const setAyar = (patch: Partial<ElAyar>) => setAyarState(a => { const n = { ...a, ...patch }; if (!shelfDemo) saveAyar(n); return n; });
  const face = ayar.yuz;
  const faceOn = useRef(face);
  const ayarRef = useRef(ayar);
  useEffect(() => { faceOn.current = face; ayarRef.current = ayar; }, [face, ayar]);
  const [status, setStatus] = useState<string>('kamera açılıyor…');
  const [err, setErr] = useState<string | null>(null);
  const [hud, setHud] = useState(true);
  const [stats, setStats] = useState<{ fps: number; st: Status; delegate: string; step?: string }>({ fps: 0, st: { hands: [], mode: '—' }, delegate: '' });
  const muted = !ayar.ses;
  const [cams, setCams] = useState<CameraInfo[]>([]);
  const [camId, setCamId] = useState<string | undefined>(() => { try { return localStorage.getItem('jarvis.el.kamera') || undefined; } catch { return undefined; } });
  const [toast, setToast] = useState<string | null>(null);
  const ctlRef = useRef<Controller | null>(null);
  const actionRef = useRef(p.onAction);
  const closeRef = useRef(p.onClose);
  const faceLockRef = useRef(p.onFaceLock);
  const propsRef = useRef(p);
  useEffect(() => { actionRef.current = p.onAction; closeRef.current = p.onClose; faceLockRef.current = p.onFaceLock; propsRef.current = p; });
  // Ses bağlamı: açılış bir tık/tuşla olduğundan kullanıcı hareketi hâlâ geçerli
  const [sfx] = useState(() => new Sfx());
  useEffect(() => { sfx.unlock(); return () => sfx.stop(); }, [sfx]);
  const nextCam = () => {
    if (!cams.length) return;
    const i = cams.findIndex(c => c.deviceId === camId);
    const n = cams[(i + 1) % cams.length];
    try { localStorage.setItem('jarvis.el.kamera', n.deviceId); } catch { /* yok say */ }
    setCamId(n.deviceId);
  };

  // Kamera + model + döngü
  useEffect(() => {
    const canvas = canvasRef.current!, video = videoRef.current!;
    const fx = new Fx(canvas);
    const ctl = new Controller(fx, sfx);
    ctlRef.current = ctl;
    if (p.demo) ctl.debug = true; // kamera yok: sentetik eller iskelet olarak görünsün
    ctl.onAction = k => {
      setToast(p.demo ? `demo · ${k.ad} (komut gönderilmedi)` : k.ad);
      setTimeout(() => setToast(null), 2200);
      if (!p.demo) actionRef.current(k);
    };
    const hudFace = new FaceHud(faceRef.current!, p.userName || '');
    hudFace.onLock = () => { sfx.lockOn(); faceLockRef.current?.(); };
    const lib = new Library(shelfRef.current!, stageRef.current!, video, fx, sfx, {
      onRead: k => {
        if (p.demo) { setToast('demo · Jarvis özeti seçili sesle okurdu'); setTimeout(() => setToast(null), 2200); return; }
        propsRef.current.onBookRead?.(k);
      },
      onOpenChange: k => propsRef.current.onBookOpen?.(k),
      fill: k => (k.id.startsWith('demo-') ? Promise.resolve(null) : fillBook(k.id).then(r => r.kitap).catch(() => null)),
      cover: loadCover,
    });
    libRef.current = lib;
    ctl.library = lib;
    // Uzay modu: yıldız alanı, uzay beyni, (tam uzayda) kişi kesiti. Dokular arka planda yüklenir.
    const stars = new Starfield(starsRef.current!);
    const brain = new SpaceBrain(spaceRef.current!, fx, sfx, stars, {
      say: t => {
        if (p.demo) { setToast(`demo · Jarvis: ${t}`); setTimeout(() => setToast(null), 2600); return; }
        propsRef.current.onSay?.(t);
      },
      mic: () => propsRef.current.onMic?.(),
    });
    brainRef.current = brain;
    ctl.space = brain;
    loadTextures();
    let cutout: PersonCutout | null = null, segLoading = false, uzOn = false;
    const size = () => {
      const W = window.innerWidth, H = window.innerHeight;
      fx.resize(W, H); hudFace.resize(W, H); lib.resize(W, H);
      stars.resize(W, H); brain.resize(W, H);
      setDims({ W, H, vw: video.videoWidth || 1920, vh: video.videoHeight || 1080 });
    };
    size();
    window.addEventListener('resize', size);

    let alive = true, raf = 0, stream: MediaStream | null = null, lm: HandLandmarker | null = null, fd: FaceDetector | null = null, faceTick = 0;
    let last = performance.now(), lastVideoT = -1, frames = 0, fpsAt = last, hands: RawHand[] = [], delegate = '';
    const demoStart = performance.now() - (Number(new URLSearchParams(location.search).get('elt')) || 0) * 1000;
    let step = '';
    // Kitaplık demosu: prosedürel raf sahte kamera akışı olarak <video>'ya; tarama sahnesi her döngü başında
    let demoCam: ReturnType<typeof demoStream> | null = null;
    const demoBooks: Kitap[] = demoShelf?.books ?? [];
    const demoTarget = demoBooks.find(b => b.ad === DEMO_TARGET)?.id ?? '';
    let demoLoop = -1;
    if (demoShelf) {
      demoCam = demoStream(demoShelf.frame);
      video.srcObject = demoCam.stream;
      video.muted = true;
      video.play().catch(() => {});
      video.addEventListener('loadedmetadata', size, { once: true });
      lib.setBooks(demoBooks, { genislik: demoShelf.frame.width, yukseklik: demoShelf.frame.height, kucukResim: thumbOf(demoShelf.frame) });
      demoJiggle.current = demoCam.jiggle;
    }
    let lastMoved = false, libOn = true;
    const demoFired = new Set<string>();

    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Mod değişimi: önceki modun izleri temizlenir; uzaya geçişte oda kararır, yıldızlar ışık hızıyla belirir
      const uz = modRef.current === 'uzay';
      if (uz !== uzOn) {
        uzOn = uz;
        ctl.setMode(uz ? 'uzay' : 'buyu');
        if (uz) { stars.warp(now); sfx.warp(); lib.reset(); libOn = false; hudFace.clear(); }
        else stars.clear();
      }
      if (uz && p.demo) {
        const d = demoSpaceHands((now - demoStart) / 1000, fx.W, fx.H);
        hands = d.hands; step = d.step;
        const key = `${d.loop}:${d.cmd?.key}`;
        if (d.cmd && !demoFired.has(key)) { demoFired.add(key); brain.command(d.cmd.cmd, now); }
      } else if (demoShelf) {
        const t = (now - demoStart) / 1000;
        const d = demoBookHands(t, fx.W, fx.H, lib.rectOf(demoTarget));
        if (d.loop !== demoLoop) {
          demoLoop = d.loop;
          lib.scanStart();
          setTimeout(() => { if (alive) lib.scanResult(demoBooks, demoBooks.filter(b => b.ad).length, demoBooks.filter(b => !b.ad).length); }, 1300);
        }
        hands = d.hands; step = d.step;
      } else if (p.demo) {
        const d = demoHands((now - demoStart) / 1000, fx.W, fx.H);
        hands = d.hands; step = d.step;
      } else if (lm && video.readyState >= 2 && video.currentTime !== lastVideoT) {
        lastVideoT = video.currentTime;
        try { hands = detect(lm, video, now, fx.W, fx.H); } catch (e) { console.warn('[el] algılama', e); }
      }
      // Uzay: yıldızlar (kara delik varsa bükülerek) ve tam uzayda sizi odadan ayıran kesit
      if (uz) {
        const tam = !p.demo && arkaRef.current === 'tam';
        if (tam) {
          if (!cutout && !segLoading) {
            segLoading = true;
            loadSegmenter()
              .then(sg => { if (!alive) { sg.close(); return; } cutout = new PersonCutout(sg); })
              .catch(e => { console.warn('[uzay] segmentasyon yüklenemedi', e); setToast('arka plan ayrılamadı: oda modu'); setArka('katman'); });
          }
          cutout?.update(video, now);
        }
        stars.render(now, dt, brain.lens(now), tam && cutout ? (g, W, H) => cutout!.punch(g, W, H) : undefined);
        brain.listening = !!propsRef.current.listening;
      }
      // Yüz: demoda sahte yüz; kamerada her 3. yeni karede algıla (el takibine yer kalsın), arada yumuşatılmış kutu
      if (faceOn.current && !uz) {
        if (p.demo) hudFace.update(demoFace((now - demoStart) / 1000, fx.W, fx.H), now);
        else if (fd && video.readyState >= 2 && ++faceTick % 3 === 0) {
          try { hudFace.update(detectFaces(fd, video, now, fx.W, fx.H), now); } catch (e) { console.warn('[el] yüz', e); }
        }
        hudFace.render(now);
      } else hudFace.clear();
      ctl.ayar = ayarRef.current;
      const st = ctl.update(hands, now, dt);
      // Kitaplık ayardan kapatılınca (ya da uzay modunda) dışarıdaki kitap ve raf katmanı temizlenir
      if (ctl.ayar.kitaplik && !uz) { libOn = true; lib.render(now); }
      else if (libOn) { libOn = false; lib.reset(); }
      if (lib.moved !== lastMoved) { lastMoved = lib.moved; setMoved(lib.moved); }
      frames++;
      if (now - fpsAt > 400) {
        const fps = Math.round((frames * 1000) / (now - fpsAt));
        frames = 0; fpsAt = now;
        setStats({ fps, st, delegate, step });
      }
    };

    (async () => {
      if (p.demo) { setStatus(''); loop(); return; }
      try {
        const s = await openCamera(video, camId);
        // Bu başlatma bu arada geçersiz kaldıysa (bileşen yeniden başladı / kapandı) kamerayı hemen kapat
        if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        listCameras().then(setCams);
        size();
        // Kitaplık haritası (kurulumda bir kez taranır; sunucuda durur)
        getLibrary().then(k => { if (!alive) return; lib.setBooks(k.kitaplar, k.referans); setLibBooks(k.kitaplar); }).catch(() => {});
      } catch (e: any) {
        if (!alive) return; // eski başlatmanın hatası ekrana gelmesin
        setErr(e?.name === 'NotAllowedError' ? 'Kamera izni verilmedi. Adres çubuğundaki kamera simgesinden izin verin.' : `Kamera açılamadı: ${e?.message || e}`);
        return;
      }
      try {
        const r = await loadLandmarker(setStatus);
        if (!alive) { r.lm.close(); return; }
        lm = r.lm; delegate = r.delegate;
        setStatus('');
        // Yüz algılayıcı: yüklenemezse el kontrolü yine çalışır (yalnızca yüz HUD'u olmaz)
        loadFaceDetector().then(d => { if (alive) fd = d; else d.close(); }).catch(e => console.warn('[el] yüz algılayıcı yüklenemedi', e));
      } catch (e: any) {
        setErr(`El takip modeli yüklenemedi: ${e?.message || e}. İnternet bağlantısını kontrol edin ya da "npm run el-modeli" ile modeli indirin.`);
        return;
      }
      loop();
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      stream?.getTracks().forEach(t => t.stop());
      lm?.close();
      fd?.close();
      sfx.setRoar(0);
      demoCam?.stop();
      lib.dispose();
      libRef.current = null;
      cutout?.close();
      brain.reset();
      brainRef.current = null;
    };
  }, [p.demo, camId, sfx, demoShelf]);

  // ---- Kitaplık: tarama, harita yenileme, ayar modu
  /** Kameradan TAM ÇÖZÜNÜRLÜKTE tek kare (aynalanmamış) → görüntü modeli → kutular. Demoda sahte sonuç. */
  const scanBusy = useRef(false);
  /** Kitaplık demosu: J tuşu kamerayı "kıpırdatır" (uyarıyı denemek için) */
  const demoJiggle = useRef<((on: boolean) => void) | null>(null);
  const jiggled = useRef(false);
  const runScan = async () => {
    const lib = libRef.current, video = videoRef.current;
    if (!lib || !video || scanBusy.current) return;
    scanBusy.current = true;
    setScanning(true);
    lib.scanStart();
    const done = (r: { bulunan: number; belirsiz: number; hata?: string }) => { scanBusy.current = false; setScanning(false); propsRef.current.onScanDone?.(r); };
    if (shelfDemo) {
      setTimeout(() => {
        const books = lib.books;
        lib.scanResult(books, books.filter(b => b.ad).length, books.filter(b => !b.ad).length);
        done({ bulunan: books.filter(b => b.ad).length, belirsiz: books.filter(b => !b.ad).length });
      }, 1300);
      return;
    }
    // Kamera hazır değilse biraz bekle (sesli komutla El Kontrolü yeni açıldıysa)
    for (let i = 0; i < 40 && (video.readyState < 2 || !video.videoWidth); i++) await new Promise(r => setTimeout(r, 250));
    if (!video.videoWidth) { lib.scanFail('kamera hazır değil'); done({ bulunan: 0, belirsiz: 0, hata: 'kamera hazır değil' }); return; }
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d')!.drawImage(video, 0, 0);
      // İlk taramada tüm kare; sonra yalnızca rafın bulunduğu bölge (kamera kıpırdadıysa yine tüm kare)
      const region = lib.moved ? undefined : shelfRegion(lib.books);
      const r = await scanLibrary({ parcalar: tileFrame(c, region), genislik: c.width, yukseklik: c.height, kucukResim: thumbOf(video) });
      lib.setBooks(r.kitaplik.kitaplar, r.kitaplik.referans);
      setLibBooks(r.kitaplik.kitaplar);
      if (r.hata) lib.scanFail(r.hata);
      else lib.scanResult(r.kitaplik.kitaplar.filter(b => b.kutu), r.bulunan, r.belirsiz);
      done({ bulunan: r.bulunan, belirsiz: r.belirsiz, hata: r.hata });
    } catch (e) {
      const msg = (e as Error).message;
      lib.scanFail(msg);
      done({ bulunan: 0, belirsiz: 0, hata: msg });
    }
  };
  // "Jarvis, kitaplığımı tara"
  const lastSignal = useRef(p.scanSignal ?? 0);
  useEffect(() => {
    if (!p.scanSignal || p.scanSignal === lastSignal.current) return;
    lastSignal.current = p.scanSignal;
    runScan();
  }, [p.scanSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Jarvis, Mars yap": eldeki gezegen dönüşür, yoksa sonraki çimdikte gelir
  const lastPlanetCmd = useRef(p.planetCmd?.n ?? 0);
  useEffect(() => {
    const c = p.planetCmd;
    if (!c || c.n === lastPlanetCmd.current || !ctlRef.current) return;
    lastPlanetCmd.current = c.n;
    const ad = GEZEGENLER.find(g => g.tur === c.tur)!.ad.toLocaleUpperCase('tr');
    const morphed = ctlRef.current.setPlanet(c.tur, performance.now());
    if (!morphed) { setToast(`◉ ${ad} · çimdikle oluştur`); setTimeout(() => setToast(null), 2200); }
  }, [p.planetCmd]);

  // Uzay sesli komutları: mod ve arka plan burada, gerisi uzay beyninde
  const say = (t: string) => { if (p.demo) { setToast(`demo · Jarvis: ${t}`); setTimeout(() => setToast(null), 2600); } else propsRef.current.onSay?.(t); };
  const lastSpaceCmd = useRef(0);
  const applySpaceCmd = (cmd: SpaceCmd) => {
    if (cmd.tip === 'mod') {
      setMod(cmd.ac ? 'uzay' : 'buyu');
      say(cmd.ac ? ONAY.modAc : ONAY.modKapat);
      return;
    }
    if (cmd.tip === 'arkaplan') {
      setArka(cmd.tam ? 'tam' : 'katman');
      say(cmd.tam ? ONAY.arkaUzay : ONAY.arkaOda);
      return;
    }
    // Uzay modu kapalıyken uzay komutu: önce moda geç, ışık hızı geçişinden sonra çalıştır
    if (modRef.current !== 'uzay') {
      setMod('uzay');
      setTimeout(() => brainRef.current?.command(cmd, performance.now()), 900);
      return;
    }
    brainRef.current?.command(cmd, performance.now());
  };
  useEffect(() => {
    const c = p.spaceCmd;
    if (!c || c.n === lastSpaceCmd.current) return;
    lastSpaceCmd.current = c.n;
    applySpaceCmd(c.cmd);
  }, [p.spaceCmd]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { propsRef.current.onModeChange?.(mod); }, [mod]);

  // Sunucuda kitaplık değişti (not eklendi, Ayarlar'dan düzenlendi): haritayı yenile
  useEffect(() => {
    if (!p.libraryKey || shelfDemo) return;
    getLibrary().then(k => { libRef.current?.setBooks(k.kitaplar, k.referans); setLibBooks(k.kitaplar); }).catch(() => {});
  }, [p.libraryKey, shelfDemo]);
  useEffect(() => { if (libRef.current) libRef.current.paused = editing; }, [editing]);
  const saveBooks = async (list: Kitap[]) => {
    const lib = libRef.current;
    if (shelfDemo) { lib?.setBooks(list, null); setLibBooks(list); setToast('demo · kaydedilmedi'); setTimeout(() => setToast(null), 1800); return; }
    try {
      const k = await saveLibrary({ kitaplar: list });
      lib?.setBooks(k.kitaplar, k.referans);
      setLibBooks(k.kitaplar);
      setToast(`kitaplık kaydedildi · ${k.kitaplar.filter(b => b.ad).length} kitap`);
    } catch (e) {
      setToast(`kaydedilemedi: ${(e as Error).message}`);
    }
    setTimeout(() => setToast(null), 2200);
  };

  // Tuşlar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Kitaplık ayar modunda ad yazarken tuşlar kısayol sayılmaz
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') { e.stopPropagation(); if (editing) setEditing(false); else closeRef.current(); return; }
      if (e.code === 'KeyL') setHud(h => !h);
      else if (e.code === 'KeyD' && ctlRef.current) ctlRef.current.debug = !ctlRef.current.debug;
      else if (e.code === 'KeyM') setAyar({ ses: !ayarRef.current.ses });
      else if (e.code === 'KeyF') setAyar({ yuz: !ayarRef.current.yuz });
      else if (e.code === 'KeyE') setAyarOpen(v => !v);
      else if (e.code === 'KeyK' && modRef.current === 'buyu') setEditing(v => !v);
      else if (e.code === 'KeyU') { setEditing(false); setMod(m => (m === 'uzay' ? 'buyu' : 'uzay')); }
      else if (e.code === 'KeyB' && modRef.current === 'uzay') setArka(a => (a === 'tam' ? 'katman' : 'tam'));
      else if (e.code === 'KeyJ' && demoJiggle.current) { jiggled.current = !jiggled.current; demoJiggle.current(jiggled.current); }
      else if (e.code === 'KeyC' && cams.length > 1) nextCam();
      else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => sfx.setOn(!muted), [muted, sfx]);

  const st = stats.st;
  return (
    <div className={'el-root' + (p.demo ? ' demo' : '') + (shelfDemo ? ' shelf' : '') + (mod === 'uzay' ? ` uzay ${arka}` : '')}>
      <video ref={videoRef} className="el-video" playsInline muted />
      <canvas ref={starsRef} className="sp-stars" />
      <canvas ref={shelfRef} className="el-shelf" />
      <canvas ref={spaceRef} className="sp-canvas" />
      <canvas ref={canvasRef} className="el-canvas" />
      <div ref={stageRef} className="lb-stage" />
      <canvas ref={faceRef} className="el-face" />

      {hud && (
        <>
          <i className="el-corner tl" /><i className="el-corner tr" /><i className="el-corner bl" /><i className="el-corner br" />
          <div className="el-top">
            <span className="el-title">JARVIS · {mod === 'uzay' ? 'UZAY' : 'EL KONTROLÜ'}</span>
            <span className="el-chip">MOD: {st.mode.toLocaleUpperCase('tr')}</span>
            <span className="el-meta">{stats.fps} FPS · {st.hands.length} el{stats.delegate ? ` · ${stats.delegate}` : ''}{p.demo ? ' · DEMO' : ''}</span>
            {st.hands.map(h => <span key={h.id} className="el-meta">{GESTURE_LABEL[h.gesture]}</span>)}
            <span className="el-sp" />
            <button className={'el-btn' + (mod === 'uzay' ? ' on' : '')} onClick={() => { setEditing(false); setMod(m => (m === 'uzay' ? 'buyu' : 'uzay')); }} title="Uzay modu (U)">{mod === 'uzay' ? '✨ büyü' : '🪐 uzay'}</button>
            {mod === 'uzay' && !p.demo && <button className="el-btn" onClick={() => setArka(a => (a === 'tam' ? 'katman' : 'tam'))} title="Arka plan (B)">{arka === 'tam' ? '🏠 oda' : '🌌 tam uzay'}</button>}
            {cams.length > 1 && <button className="el-btn" onClick={nextCam} title="Kamera değiştir (C)">⟳ kamera</button>}
            <button className="el-btn" onClick={() => setAyar({ ses: !ayar.ses })} title="Efekt sesi (M)">{muted ? '🔇' : '🔊'}</button>
            <button className={'el-btn' + (ayarOpen ? ' on' : '')} onClick={() => setAyarOpen(v => !v)} title="Efektleri aç/kapat (E)">⚙ efektler</button>
            <button className="el-btn" onClick={p.onClose} title="Kapat (Esc)">✕</button>
          </div>
          <div className="el-legend">
            {(mod === 'uzay' ? LEGEND_UZAY : st.mode.startsWith('kitap') ? LEGEND_KITAP : LEGEND).map(([g, t]) => <span key={g + t}><b>{g}</b> {t}</span>)}
            <span className="el-keys">{mod === 'uzay' ? 'U büyü modu · B arka plan · L arayüz · D iskelet · M ses · Esc çık' : 'U uzay · L arayüz · E efektler · F yüz kilidi · K kitaplık · D iskelet · M ses · Esc çık'}</span>
          </div>
          {p.demo && stats.step && <div className="el-step">{stats.step}</div>}
        </>
      )}

      {(p.caption || p.core === 'thinking') && (
        <div className={'el-caption ' + p.core}>
          <span className="el-dot" />
          {p.caption || 'düşünüyor…'}
        </div>
      )}
      {toast && <div className="el-toast">{toast}</div>}
      {ayarOpen && (
        <aside className="el-ayar" onPointerDown={e => e.stopPropagation()}>
          <header><b>EFEKTLER</b><button className="el-btn" onClick={() => setAyarOpen(false)}>✕</button></header>
          {AYAR_LISTESI.map(({ k, ad, alt }) => (
            <label key={k} className={ayar[k] ? 'on' : ''}>
              <input type="checkbox" checked={ayar[k]} onChange={e => setAyar({ [k]: e.target.checked })} />
              <span>{ad}</span>
              {alt && <em>{alt}</em>}
            </label>
          ))}
          <div className="el-ayar-row">
            <span>🪐 Gezegen</span>
            <select value={ayar.gezegenTur} onChange={e => setAyar({ gezegenTur: e.target.value as ElAyar['gezegenTur'] })}>
              <option value="sirayla">Sırayla (her çimdikte sonraki)</option>
              {GEZEGENLER.map(g => <option key={g.tur} value={g.tur}>{g.ad}</option>)}
            </select>
          </div>
          <p>Bu cihazda saklanır. Kapalı efekt hiç tetiklenmez. Sesle: "Jarvis, Mars yap". Kısayol: <b>E</b></p>
        </aside>
      )}
      {moved && !editing && <div className="el-warn">⚠ KAMERA KIPIRDAMIŞ · KİTAPLIĞI YENİDEN TARA (K)</div>}
      {editing && (
        <LibraryEditor
          books={libBooks} W={dims.W} H={dims.H} vw={dims.vw} vh={dims.vh}
          scanning={scanning} moved={moved} demo={shelfDemo}
          onScan={runScan} onSave={saveBooks} onClose={() => setEditing(false)}
        />
      )}
      {(status || err) && (
        <div className="el-status">
          {err ? <><b>El kontrolü başlatılamadı</b><span>{err}</span><button className="el-btn" onClick={p.onClose}>Kapat</button></> : <><span className="el-spin" />{status}</>}
        </div>
      )}
    </div>
  );
}
