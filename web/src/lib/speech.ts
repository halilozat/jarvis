import { ttsUrl } from './api';
import type { VoiceSel } from './types';

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* yok say */ } }

/**
 * Jarvis'in sesi.
 * - Sunucu TTS'i açıksa RouteLLM ses modeli çalınır, seviye Web Audio analizörüyle ölçülür.
 * - Ses cevaba sabitlenir (reply.voice). Bir sahnenin sunucu sesi alınamazsa bir kez yeniden denenir; yine olmazsa
 *   O CEVABIN KALANI tarayıcı sesine geçer. Önceden tek tek sahneler tarayıcı sesine düşebiliyor, sesler karışıyordu.
 */
class VoiceEngine {
  private audio = new Audio();
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private simulated = 0;
  private simTarget = 0;
  private speakingBrowser = false;
  /** Başka cihaz seslendirirken bu cihazda çekirdeğin "konuşuyor" gibi oynaması için (performance.now sınırı) */
  private mimicUntil = 0;
  /** <audio> öğesi bir kez gerçekten çalabildi mi (iOS kilidi açıldı) */
  private elUnlocked = false;
  private prefetch = new Map<string, Promise<string | null>>();
  private cancelCurrent: (() => void) | null = null;
  /** Sunucu sesi açık mı (seçili ses 'browser' değilse) */
  serverTts = false;
  /** Konuşma hızı (playbackRate), 0.9–1.3 */
  rate = 1.08;
  /** "Jarvis efekti": sahne geçiş sesi */
  sfx = true;
  /** Bu cevap tarayıcı sesine geçti mi */
  private replyBrowser = false;
  /** Ses gerçekten çalmaya başlayınca (ilk ses ölçümü için) */
  onPlay: (() => void) | null = null;
  /** Cevap tarayıcı sesine geçince */
  onFallback: ((reason: string) => void) | null = null;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', '');
    this.audio.onplaying = () => this.onPlay?.();
  }

  /** Yeni cevap başlıyor: ses modu sıfırlanır (önceki cevabın yedeğe düşmesi bunu etkilemez). */
  beginReply() { this.replyBrowser = !this.serverTts; }

  // ---- Tarayıcı sesi (çevrimdışı yedek): her cihazın kendi sesleri var, seçim cihazda saklanır ----
  get browserVoiceName() { return safeGet('jarvis.browserVoice'); }
  set browserVoiceName(v: string | null) { safeSet('jarvis.browserVoice', v); }
  browserVoices(): SpeechSynthesisVoice[] {
    if (!('speechSynthesis' in window)) return [];
    return speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('tr'));
  }

  /** Kullanıcı dokunuşuyla açılmış ses bağlamı (alkış dinleyicisi aynı bağlamı kullanır); henüz yoksa null. */
  get context(): AudioContext | null { return this.ctx; }

  /** Ses çalabilir durumda mı: bağlam çalışıyor ve <audio> kilidi açılmış. */
  get unlocked(): boolean { return this.ctx?.state === 'running' && this.elUnlocked; }

  /** Dokunuşsuz bağlamı sürdürmeyi dener (iOS ekran kilidinden sonra askıya alır); en fazla 300 ms bekler. */
  async resume(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state !== 'running') await Promise.race([this.ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 300))]);
    return this.unlocked;
  }

  /** Sunucu sesi ya da tarayıcı sesi şu an çalıyor mu (alkış dinleyicisi bu sürede kapalı) */
  isPlaying(): boolean { return !this.audio.paused || this.speakingBrowser || (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking); }

  /** Karşılamayı başka cihaz seslendirirken burada çekirdek ms boyunca konuşuyormuş gibi oynar. */
  mimic(ms: number) { this.mimicUntil = performance.now() + ms; }

  /** Kullanıcı hareketi (tıklama) sırasında çağrılmalı: iOS'ta sesin kilidini açar. Zaten açıksa dokunmaz (çalan sesi kesmez). */
  unlock() {
    if (this.unlocked) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AC();
        const src = this.ctx.createMediaElementSource(this.audio);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.buf = new Uint8Array(this.analyser.fftSize);
        src.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      this.ctx.resume();
      // Sessiz bir çalma ile <audio> öğesinin kilidini aç
      this.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      this.audio.play().then(() => { this.elUnlocked = true; }).catch(() => {});
      if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    } catch { /* yok say */ }
  }

  /** Çalan sunucu sesinin ilerlemesi (0..1); ses çalmıyorsa ya da süre bilinmiyorsa null. */
  progress(): number | null {
    const a = this.audio;
    if (a.paused || !a.src.startsWith('blob:') || !Number.isFinite(a.duration) || a.duration <= 0) return null;
    return Math.min(1, a.currentTime / a.duration);
  }

  /** 0..1 arası anlık ses seviyesi (çekirdek animasyonu için) */
  level(): number {
    if (this.analyser && this.buf && !this.audio.paused) {
      this.analyser.getByteTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sum += v * v; }
      return Math.min(1, Math.sqrt(sum / this.buf.length) * 3.2);
    }
    if (this.speakingBrowser || performance.now() < this.mimicUntil) {
      if (Math.random() < 0.18) this.simTarget = 0.25 + Math.random() * 0.6;
      this.simulated += (this.simTarget - this.simulated) * 0.25;
      return this.simulated;
    }
    this.simulated *= 0.85;
    return this.simulated;
  }

  /**
   * Sahne geçişi efekti: iki kısa sinüs tonu ve hafif bir "whoosh".
   * Dosya yerine Web Audio ile üretilir — indirme yok, telif sorunu yok, gecikme sıfır.
   */
  blip() {
    if (!this.sfx) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;

    // Camgöbeği HUD'a uygun, iki notalı kısa bir "tink"
    const master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);

    [1046.5, 1568].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, t0);
      const start = t0 + i * 0.07;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(1, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 0.3);
    });

    // Altına ince bir hava sesi: geçişi "süpürme" hissi verir
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(900, t0);
    band.frequency.exponentialRampToValueAtTime(2600, t0 + 0.22);
    band.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.1, t0);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    noise.connect(band);
    band.connect(ng);
    ng.connect(master);
    noise.start(t0);
    noise.stop(t0 + 0.24);
  }

  /**
   * Uyanış tınısı (~1,4 sn): alçaktan yükselen yumuşak bir süpürme, üstünde iki parlak nota ve ince bir ışıltı.
   * Web Audio ile üretilir; ayarlardaki "Jarvis efekti"nden bağımsızdır (uyanışın imzası).
   */
  chime() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.value = 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t0);
    lp.frequency.exponentialRampToValueAtTime(5200, t0 + 0.9);
    lp.connect(master);
    master.connect(ctx.destination);

    // Gövde: iki hafif akortsuz testere dişi, bir oktav yükselir (güç açılıyor hissi)
    [0, 7].forEach(cents => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.detune.value = cents;
      o.frequency.setValueAtTime(110, t0);
      o.frequency.exponentialRampToValueAtTime(220, t0 + 0.85);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
      o.connect(g);
      g.connect(lp);
      o.start(t0);
      o.stop(t0 + 1.35);
    });
    // İki parlak nota (E6 → B6), çekirdek parlarken
    [[1318.5, 0.55], [1975.5, 0.72]].forEach(([hz, at]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      const s = t0 + at;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.35, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.7);
      o.connect(g);
      g.connect(master);
      o.start(s);
      o.stop(s + 0.75);
    });
    // Işıltı: yüksek geçirenden geçmiş kısa gürültü
    const len = Math.floor(ctx.sampleRate * 0.9);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
    const n = ctx.createBufferSource();
    n.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    n.connect(hp);
    hp.connect(ng);
    ng.connect(master);
    n.start(t0 + 0.3);
  }

  private key(text: string, v?: VoiceSel) { return `${v ? `${v.model}:${v.voice}` : ''}\u0000${text}`; }

  /** Sahnenin sesini önden ister; aynı ses+metin için tek istek. force: cevabın yedeğe düşmesine bakma (karşılama). */
  preload(text: string, v?: VoiceSel, i?: number, n?: number, force = false): Promise<string | null> {
    if (!this.serverTts || (this.replyBrowser && !force)) return Promise.resolve(null);
    const k = this.key(text, v);
    if (!this.prefetch.has(k)) {
      this.prefetch.set(
        k,
        fetch(ttsUrl(text, v, i, n))
          .then(r => (r.status === 200 ? r.blob() : null))
          .then(b => (b ? URL.createObjectURL(b) : null))
          .catch(() => null),
      );
    }
    return this.prefetch.get(k)!;
  }

  private play(url: string): Promise<boolean> {
    const a = this.audio;
    return new Promise<boolean>(resolve => {
      let guard: ReturnType<typeof setTimeout> | undefined;
      const finish = (v: boolean) => {
        clearTimeout(guard);
        a.onended = a.onerror = a.onpause = a.onloadedmetadata = null;
        resolve(v);
      };
      this.cancelCurrent = () => finish(true);
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      // Chrome bazen dosyanın sonunda "pause" gönderip "ended"ı hiç göndermiyor; brifing orada kilitleniyordu.
      a.onpause = () => { if (a.duration && a.currentTime >= a.duration - 0.3) finish(true); };
      // Son emniyet: hiçbir olay gelmezse ses süresi + pay kadar sonra devam et.
      a.onloadedmetadata = () => { if (Number.isFinite(a.duration)) guard = setTimeout(() => finish(true), (a.duration / this.rate + 1.5) * 1000); };
      a.src = url;
      // Tempo: perdeyi koruyarak hızlandır (src değişince bazı tarayıcılar hızı sıfırlıyor, ikisi de ayarlanır).
      a.defaultPlaybackRate = a.playbackRate = this.rate;
      a.preservesPitch = true;
      (a as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      a.play().then(() => { this.elUnlocked = true; }).catch(() => finish(false));
    });
  }

  async speak(text: string, v?: VoiceSel, i?: number, n?: number): Promise<void> {
    this.stop();
    if (this.serverTts && !this.replyBrowser) {
      let url = await this.preload(text, v, i, n);
      if (!url) {
        this.prefetch.delete(this.key(text, v)); // bir kez yeniden dene
        url = await this.preload(text, v, i, n);
      }
      const ok = url ? await this.play(url) : false;
      this.cancelCurrent = null;
      if (ok) return;
      // Sunucu sesi bu sahnede de alınamadı: cevabın KALANI tarayıcı sesine geçer (sahne sahne karışık ses yok).
      this.replyBrowser = true;
      this.onFallback?.(url ? 'ses çalınamadı' : 'sunucu sesi alınamadı');
    }
    return this.speakBrowser(text);
  }

  private speakBrowser(text: string): Promise<void> {
    if (!('speechSynthesis' in window)) return new Promise(r => setTimeout(r, Math.max(1500, text.length * 55)));
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR';
      const voices = this.browserVoices();
      const chosen = this.browserVoiceName ? voices.find(v => v.name === this.browserVoiceName) : undefined;
      const preferred = chosen || voices.find(v => /yelda|google|premium|enhanced/i.test(v.name)) || voices[0];
      if (preferred) u.voice = preferred;
      u.rate = this.rate;
      u.onstart = () => this.onPlay?.();
      u.pitch = 0.95;
      const done = () => { this.speakingBrowser = false; resolve(); };
      u.onend = done;
      u.onerror = done;
      u.onboundary = () => { this.simTarget = 0.5 + Math.random() * 0.5; };
      this.cancelCurrent = done;
      this.speakingBrowser = true;
      speechSynthesis.speak(u);
      // Bazı tarayıcılarda onend gelmeyebiliyor: güvenlik zaman aşımı
      setTimeout(() => this.speakingBrowser && done(), 4000 + text.length * 120);
    });
  }

  stop() {
    this.audio.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.speakingBrowser = false;
    const c = this.cancelCurrent;
    this.cancelCurrent = null;
    c?.();
  }
}

export const voice = new VoiceEngine();

// ---------------- Konuşma tanıma (bas-konuş) ----------------
export interface Recognizer { start(): void; stop(): void }

export function speechRecognitionSupported() {
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function createRecognizer(h: { onInterim(t: string): void; onFinal(t: string): void; onEnd(): void; onError(msg: string): void }): Recognizer | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'tr-TR';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    h.onInterim((finalText + ' ' + interim).trim());
  };
  rec.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') h.onError(e.error); };
  rec.onend = () => {
    const t = finalText.trim();
    finalText = '';
    if (t) h.onFinal(t);
    h.onEnd();
  };
  return { start: () => rec.start(), stop: () => rec.stop() };
}
