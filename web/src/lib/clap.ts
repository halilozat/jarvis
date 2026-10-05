// Alkış algılama. ClapDetector saf mantıktır (tarayıcıya bağlı değil; Node'da sentetik seslerle test edilir).
// startClapListener mikrofonu AnalyserNode'a bağlar ve her karede dedektörü besler.
//
// Bir ses "alkış" sayılırsa:
//  - tepe değeri ortam seviyesinin belirgin üstünde (eşik = ortam × sens),
//  - çok hızlı yükseliyor (< 10 ms; konuşma hecesi ~20-50 ms'de yükselir),
//  - enerjisinin büyük kısmı 2–8 kHz'de (kapı çarpması ve konuşmanın gövdesi alçak frekansta),
//  - ~150 ms içinde sönüyor (konuşma ve müzik sürer).
// Desen: iki alkış arası 200–700 ms ve ardından 400 ms içinde üçüncüsü yoksa → çift alkış. Sonra 3 sn bekleme.

export interface ClapFrame {
  /** ms (performance.now) */
  time: number;
  /** Zaman alanı örnekleri, -1..1 */
  td: Float32Array;
  /** Frekans alanı, dB (AnalyserNode.getFloatFrequencyData), uzunluk = fftSize / 2 */
  freqDb: Float32Array;
  sampleRate: number;
}

export interface FrameStats { rms: number; peak: number; ambient: number; threshold: number; hf: number; riseMs: number }

export interface ClapEvents {
  onFrame?(s: FrameStats): void;
  /** Doğrulanmış tek alkış (kalibrasyon ekranında yanıp sönen nokta) */
  onClap?(t: number): void;
  /** Çift alkış ya da öğrenilmiş ritim */
  onPattern?(t: number): void;
  /** Aday reddedildi: nedeni (kalibrasyon ve test için) */
  onReject?(reason: string): void;
}

const MIN_ABS_PEAK = 0.05; // çok kısık seslerde tetiklenmesin
const MAX_RISE_MS = 10;
const MIN_HF_RATIO = 0.35;
const HF_WINDOW_MS = 45;
const DECAY_AT_MS = 150;
const DEDUPE_MS = 60; // örtüşen pencerelerde aynı alkış iki kez görünmesin
const GAP_MIN = 200, GAP_MAX = 700, NO_THIRD_MS = 400, COOLDOWN_MS = 3000;

export class ClapDetector {
  sens: number;
  /** Öğrenilmiş ritim (alkışlar arası süreler); null → düz çift alkış */
  rhythm: number[] | null;
  private ambientRms = 0.002;
  private ambientPeak = 0.008;
  /** Kısa vadeli arka plan (~100 ms): alkış konuşmanın arasında da "sönmüş" sayılabilsin */
  private recentRms = 0.002;
  private cand: { t: number; peakRms: number; bg: number; hfMax: number; hfOk: boolean } | null = null;
  private claps: number[] = [];
  private pendingAt: number | null = null;
  private cooldownUntil = 0;
  private burstUntil = 0;
  private lastOnset = -1e9;
  private ev: ClapEvents;

  constructor(opts: { sens: number; rhythm?: number[] | null }, ev: ClapEvents = {}) {
    this.sens = opts.sens;
    this.rhythm = opts.rhythm ?? null;
    this.ev = ev;
  }

  /** Duraklatmadan dönünce (Jarvis konuştu vb.): yarım kalan aday ve desen sıfırlanır, ortam seviyesi korunur. */
  relax() {
    this.cand = null;
    this.claps = [];
    this.pendingAt = null;
  }

  process(f: ClapFrame) {
    const { td, freqDb, sampleRate: sr, time: now } = f;
    const n = td.length;
    let sum = 0, peak = 0, pi = 0;
    for (let i = 0; i < n; i++) {
      const v = td[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) { peak = a; pi = i; }
    }
    const rms = Math.sqrt(sum / n);

    // 2–8 kHz enerjisinin 100 Hz–8 kHz'e oranı
    const binHz = sr / 2 / freqDb.length;
    let hiE = 0, allE = 0;
    for (let b = Math.ceil(100 / binHz); b < freqDb.length && b * binHz <= 8000; b++) {
      const p = Math.pow(10, freqDb[b] / 10);
      allE += p;
      if (b * binHz >= 2000) hiE += p;
    }
    const hf = allE > 0 ? hiE / allE : 0;

    // Yükselme süresi: tepeden geriye, 32 örneklik pencerenin hâlâ "sessiz" olduğu son nokta. "Sessiz" tepeye
    // görelidir (%25): arka planda konuşma varken de alkışın başlangıcı bulunur (oda sessizliğine göre aransa bulunamıyordu).
    const quiet = Math.max(this.ambientPeak * 1.5, peak * 0.25);
    let onset = -1;
    for (let j = pi; j >= 32; j -= 4) {
      let m = 0;
      for (let k = j - 32; k < j; k++) { const a = td[k] < 0 ? -td[k] : td[k]; if (a > m) m = a; }
      if (m < quiet) { onset = j; break; }
    }
    const riseMs = onset < 0 ? Infinity : ((pi - onset) / sr) * 1000;

    const threshold = Math.max(MIN_ABS_PEAK, this.ambientPeak * this.sens);
    if (!this.cand) this.recentRms += (rms - this.recentRms) * 0.3;
    this.ev.onFrame?.({ rms, peak, ambient: this.ambientPeak, threshold, hf, riseMs });

    // ---- aday var: sönüyor mu?
    if (this.cand) {
      const c = this.cand;
      const dt = now - c.t;
      if (dt < 30) c.peakRms = Math.max(c.peakRms, rms);
      // Frekans testi ilk 45 ms'in en iyisiyle: başlangıç karesinde alkış pencerenin kenarında kalır ve Blackman
      // penceresi onu bastırır (spektrum arka plandaki konuşmayı ölçer); sonraki karede alkış ortadadır.
      if (dt <= HF_WINDOW_MS) c.hfMax = Math.max(c.hfMax, hf);
      if (!c.hfOk && dt > HF_WINDOW_MS) {
        if (c.hfMax < MIN_HF_RATIO) return this.reject(`yüksek frekans zayıf (%${Math.round(c.hfMax * 100)})`);
        c.hfOk = true;
        // Çift alkışın onay penceresinde hızlı ve tiz bir ani ses: sönmese bile (yankılı oda) üçüncü alkış say.
        if (this.pendingAt !== null && c.t < this.pendingAt) {
          this.cand = null;
          this.pendingAt = null;
          this.claps = [];
          this.burstUntil = now + 600;
          this.ev.onReject?.('üçüncü alkış geldi');
          return;
        }
      }
      if (dt > 60 && rms > c.peakRms * 0.6) {
        this.reject('sönmedi (uzun ses)');
      } else if (dt >= DECAY_AT_MS) {
        // Sönme: tepe enerjisinin %30'una ya da alkıştan ÖNCEKİ arka plan seviyesine (konuşma varsa onun seviyesine) inmeli.
        if (rms < Math.max(c.peakRms * 0.3, c.bg * 1.6, this.ambientRms * 3)) this.confirm(c.t);
        else this.reject('150 ms içinde sönmedi');
      }
    } else if (now - this.lastOnset > DEDUPE_MS && peak > threshold && rms > this.ambientRms * this.sens * 0.5) {
      // ---- yeni aday
      this.lastOnset = now;
      if (riseMs >= MAX_RISE_MS) this.ev.onReject?.(`yavaş yükseldi (${Number.isFinite(riseMs) ? riseMs.toFixed(1) + ' ms' : 'pencere dışı'})`);
      else this.cand = { t: now, peakRms: rms, bg: this.recentRms, hfMax: hf, hfOk: false };
    } else if (rms < this.ambientRms * 3) {
      // ---- ortam seviyesi (yalnızca olay yokken; ~1 sn zaman sabiti)
      this.ambientRms += (Math.max(rms, 0.0005) - this.ambientRms) * 0.05;
      this.ambientPeak += (Math.max(peak, 0.002) - this.ambientPeak) * 0.05;
    }

    // ---- çift alkış onayı: 400 ms içinde üçüncüsü gelmedi (doğrulanmakta olan aday varsa sonucunu bekle)
    if (this.pendingAt !== null && now >= this.pendingAt && !this.cand) {
      this.pendingAt = null;
      this.claps = [];
      this.cooldownUntil = now + COOLDOWN_MS;
      this.ev.onPattern?.(now);
    }
  }

  private reject(reason: string) {
    this.cand = null;
    this.ev.onReject?.(reason);
  }

  private confirm(t: number) {
    this.cand = null;
    this.ev.onClap?.(t);
    if (t < this.cooldownUntil || t < this.burstUntil) return;
    // Bekleme sırasında bir alkış daha → üç alkış: desen değil (alkış tufanı, tezahürat)
    if (this.pendingAt !== null && t < this.pendingAt) {
      this.pendingAt = null;
      this.claps = [];
      this.burstUntil = t + 600;
      this.ev.onReject?.('üçüncü alkış geldi');
      return;
    }
    this.claps = [...this.claps.filter(x => t - x < 3000), t];
    if (this.matches()) this.pendingAt = t + NO_THIRD_MS;
  }

  private matches(): boolean {
    const c = this.claps;
    if (this.rhythm?.length) {
      const k = this.rhythm.length;
      if (c.length < k + 1) return false;
      const last = c.slice(-(k + 1));
      return this.rhythm.every((gap, i) => Math.abs(last[i + 1] - last[i] - gap) <= gap * 0.2);
    }
    if (c.length < 2) return false;
    const gap = c[c.length - 1] - c[c.length - 2];
    return gap >= GAP_MIN && gap <= GAP_MAX;
  }
}

// ---------------------------------------------------------------- Tarayıcı bağlantısı

export interface ClapListener {
  stop(): void;
  detector: ClapDetector;
  /** Açık mikrofon akışı: alkıştan sonraki komut kaydı aynı akışı kullanır (yeniden izin/başlatma gecikmesi yok) */
  stream: MediaStream;
}

/**
 * Mikrofonu açıp dedektörü her karede besler. Yalnızca dinleyici cihazda çağrılır (diğerlerinde izin istenmez).
 * Yankı engelleme / gürültü bastırma / otomatik kazanç KAPALI: alkışın keskin başlangıcı korunmalı.
 * @param ctx  Kullanıcı dokunuşuyla açılmış AudioContext (askıdaki bağlam mikrofon verisi üretmez)
 * @param paused  true dönerken analiz yapılmaz (Jarvis konuşuyor, komut dinleniyor…)
 */
export async function startClapListener(
  ctx: AudioContext,
  opts: { sens: number; rhythm?: number[] | null },
  ev: ClapEvents,
  paused: () => boolean,
): Promise<ClapListener> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  // 2048 örnek (48 kHz'de 43 ms): rAF bir kare kaçırsa (33 ms) bile alkışın başlangıcı bir pencerenin içinde kalır.
  // 1024 (21 ms) ile kare kaybında başlangıç aradaki boşluğa düşüp alkış "yavaş yükseldi" diye reddediliyordu (test edildi).
  an.fftSize = 2048;
  an.smoothingTimeConstant = 0; // ani sesler yumuşatılmasın
  src.connect(an); // hoparlöre bağlanmaz
  const td = new Float32Array(an.fftSize);
  const fd = new Float32Array(an.frequencyBinCount);
  const detector = new ClapDetector(opts, ev);
  let raf = 0;
  let wasPaused = false;
  const tick = () => {
    if (paused()) {
      wasPaused = true;
    } else {
      if (wasPaused) { detector.relax(); wasPaused = false; }
      an.getFloatTimeDomainData(td);
      an.getFloatFrequencyData(fd);
      detector.process({ time: performance.now(), td, freqDb: fd, sampleRate: ctx.sampleRate });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    detector,
    stream,
    stop() {
      cancelAnimationFrame(raf);
      src.disconnect();
      stream.getTracks().forEach(t => t.stop());
    },
  };
}
