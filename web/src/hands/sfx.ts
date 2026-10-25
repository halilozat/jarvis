// El Kontrolü · ses efektleri. Dosya yok: hepsi Web Audio ile anında sentezlenir.
export class Sfx {
  ctx: AudioContext | null = null;
  on = true;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private roar: { src: AudioBufferSourceNode; gain: GainNode; filt: BiquadFilterNode } | null = null;

  /** Kullanıcı hareketi içinde çağrılmalı (el kontrolünü açan tık/tuş) */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /** Yüz kilidi: iki kısa yükselen bip ve ince bir tık */
  lockOn() {
    if (!this.ok()) return;
    const c = this.ctx!, t0 = c.currentTime;
    [[880, 0], [1320, 0.09]].forEach(([hz, d]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.12, t0 + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.08);
      o.connect(g).connect(this.master!); o.start(t0 + d); o.stop(t0 + d + 0.1);
    });
    this.burst(0.05, 4000, 2000, 0.15, 'highpass', 1, 0.2);
  }

  setOn(on: boolean) { this.on = on; if (!on) this.setRoar(0); }

  // ---- Kitaplık
  /** Kitap seçildi: kısa, yumuşak bir tık */
  hover() { this.tone(1500, 0.05, 0.04, 'sine'); }
  /** Kitap tutuldu: ince, yükselen tel sesi */
  grab() { this.tone(660, 0.25, 0.06, 'triangle', 990); this.burst(0.08, 5000, 3000, 0.05, 'highpass', 1); }
  /** Raftan kopup uçtu: hava sesi */
  whoosh() { this.burst(0.7, 400, 3200, 0.35, 'bandpass', 0.9); this.tone(180, 0.5, 0.06, 'sine', 90); }
  /** Kapak açıldı: alçak hologram uğultusu + parıltı */
  open() { this.tone(220, 0.9, 0.08, 'sine', 330); [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.5, 0.025, 'sine', undefined, 0.15 + i * 0.06)); }
  /** Sayfa çevir: kâğıt hışırtısı (iki kısa süzülmüş gürültü) */
  page() { this.burst(0.22, 1800, 6500, 0.22, 'bandpass', 0.7); this.burst(0.12, 5000, 2500, 0.12, 'highpass', 0.8, 0.12); }
  /** Kitap kapandı */
  close() { this.burst(0.18, 900, 300, 0.25, 'lowpass', 0.8); this.tone(330, 0.4, 0.05, 'sine', 160); }
  /** Rafına oturdu: tok bir vuruş */
  thud() { this.tone(120, 0.25, 0.3, 'sine', 60); this.burst(0.12, 700, 200, 0.3, 'lowpass', 0.8); }
  // ---- Uzay modu
  /** Mod geçişi: ışık hızına çıkış (yükselen hava + ton) */
  warp() { this.burst(0.9, 200, 5000, 0.4, 'bandpass', 0.7); this.tone(80, 0.9, 0.12, 'sawtooth', 640); this.tone(160, 0.8, 0.05, 'sine', 1280, 0.1); }
  /** Gezegen oluştu: yükselen akor */
  planet() { [261.6, 329.6, 392, 523.3].forEach((f, i) => this.tone(f, 0.9 - i * 0.1, 0.06, 'sine', undefined, i * 0.07)); this.burst(0.6, 2500, 7000, 0.08, 'highpass', 0.7, 0.1); }
  /** Gezegen dönüştü: ışıltı */
  morph() { this.burst(0.5, 3000, 9000, 0.12, 'bandpass', 2); [784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 0.035, 'triangle', f * 1.5, i * 0.05)); }
  /** Çarpışma: derin patlama + çatırtı */
  collision() {
    this.tone(70, 1.8, 0.9, 'sine', 24); this.tone(140, 1.0, 0.4, 'sawtooth', 40);
    this.burst(2.0, 1600, 80, 1.0, 'lowpass', 0.5); this.burst(0.9, 6000, 900, 0.5, 'highpass', 0.7, 0.05);
    for (let i = 0; i < 6; i++) this.burst(0.08, 4000 + Math.random() * 3000, 1500, 0.25, 'bandpass', 3, 0.15 + i * 0.09 + Math.random() * 0.05);
  }
  /** Enkaz toplanıyor: yükselen ışıltı (Ay doğar) */
  gather() { this.tone(330, 3.2, 0.05, 'sine', 990); this.burst(3.2, 1500, 9000, 0.08, 'bandpass', 4); [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 0.8, 0.04, 'sine', undefined, 3.0 + i * 0.08)); }
  /** Güneş sistemi açıldı */
  solar() { [392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 1.2, 0.045, 'sine', undefined, i * 0.09)); }
  /** Mikrofon açıldı */
  micOn() { this.tone(880, 0.12, 0.08, 'sine', 1320); }
  /** Kara delik: alçak uğultu (sürekli) + emme */
  private hum: { o: OscillatorNode; o2: OscillatorNode; g: GainNode } | null = null;
  blackHole(on: boolean) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    if (on && !this.hum && this.ok()) {
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 42; o2.type = 'triangle'; o2.frequency.value = 63;
      g.gain.value = 0.0001;
      o.connect(g); o2.connect(g); g.connect(this.master);
      o.start(); o2.start();
      g.gain.setTargetAtTime(0.28, c.currentTime, 0.4);
      this.hum = { o, o2, g };
      this.burst(1.6, 4000, 120, 0.4, 'lowpass', 1.5); // emme
    } else if (!on && this.hum) {
      const h = this.hum;
      h.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.15);
      setTimeout(() => { try { h.o.stop(); h.o2.stop(); } catch { /* yok say */ } }, 700);
      this.hum = null;
      this.tone(90, 0.6, 0.3, 'sine', 400); this.burst(0.5, 300, 6000, 0.3, 'bandpass', 1);
    }
  }

  /** Tarama başladı */
  scanStart() { this.tone(400, 1.2, 0.05, 'sawtooth', 1600); }

  // Uzay Laboratuvarı · yaşam izi taraması
  /** Tarama ışını uğultusu (süre boyunca, hafif titreşimli) */
  scanBeam(dur: number) {
    this.tone(96, dur, 0.06, 'sawtooth', 120);
    this.tone(192, dur, 0.025, 'sine', 240);
    this.burst(dur, 1200, 2600, 0.04, 'bandpass', 6);
  }
  /** Kontrol listesi: ✓ yüksek, ✗ alçak, ? orta kısa tık */
  check(kind: 'evet' | 'hayir' | 'belirsiz') {
    const f = kind === 'evet' ? 1320 : kind === 'hayir' ? 440 : 880;
    this.tone(f, 0.09, 0.07, 'triangle');
    this.burst(0.04, 5000, 3000, 0.04, 'highpass', 1);
  }
  /** Mekanik panel açılışı: servo vızıltısı ve kısa klik */
  servo() { this.burst(0.22, 600, 2400, 0.06, 'bandpass', 3); this.tone(180, 0.18, 0.03, 'square', 260); this.tone(1800, 0.03, 0.04, 'square', undefined, 0.2); }
  /** Hedefe kilitlenme: iki hızlı bip */
  lock() { this.tone(1400, 0.06, 0.06, 'square'); this.tone(2100, 0.08, 0.05, 'square', undefined, 0.08); }
  /** Yazı çözülürken çok kısa tık */
  typeTick() { this.tone(3200 + Math.random() * 800, 0.012, 0.015, 'square'); }
  /** Damga çakılması */
  stamp() { this.tone(90, 0.18, 0.2, 'sine', 50); this.burst(0.08, 2000, 600, 0.12, 'lowpass', 1); }
  /** ESI göstergesi dolarken yükselen ton (k: 0..1 değer) */
  esiRise(dur: number, k: number) { this.tone(260, dur, 0.06, 'sine', 260 + 900 * Math.max(0.05, k)); }

  private ok() { return this.on && this.ctx && this.master && this.ctx.state === 'running'; }

  private burst(dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = 'bandpass', q = 1.2, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', f1?: number, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Avuçta ateş tutuşur */
  ignite() { this.burst(0.55, 300, 2400, 0.5, 'bandpass', 0.8); this.burst(0.35, 120, 80, 0.4, 'lowpass', 0.7); }
  /** Ateş sönünce */
  douse() { this.burst(0.5, 2200, 400, 0.25, 'highpass', 0.5); }
  /** Mühür halkası açılır */
  sigil() {
    this.burst(0.9, 200, 1800, 0.35, 'bandpass', 2);
    [220, 330, 440, 660].forEach((f, i) => this.tone(f, 1.4, 0.06, 'triangle', f * 1.01, i * 0.04));
  }
  /** Gezegen oluşur */
  form() { this.tone(110, 1.3, 0.18, 'sine', 330); this.burst(1.1, 3000, 600, 0.18, 'bandpass', 3); [523, 659, 784].forEach((f, i) => this.tone(f, 0.9, 0.04, 'sine', undefined, 0.25 + i * 0.07)); }
  /** Patlama */
  boom() { this.tone(140, 1.2, 0.8, 'sine', 32); this.burst(1.4, 1800, 120, 0.9, 'lowpass', 0.6); this.burst(0.25, 4000, 1500, 0.4, 'highpass', 0.6); }
  /** Basılı tutma tamamlandı: HUD onayı */
  // Haber Modu
  /** Kanal jeneriği: iki akor ve parıltı */
  jenerik() {
    [[220, 277.2, 329.6], [246.9, 311.1, 370]].forEach((ak, j) => ak.forEach((f, i) => this.tone(f, 0.55, 0.05, 'sawtooth', undefined, j * 0.42 + i * 0.012)));
    this.tone(880, 1.1, 0.04, 'sine', 1760, 0.84);
    this.burst(0.9, 6000, 9000, 0.06, 'highpass', 1, 0.84);
  }
  /** Bölüm geçişi: ışık süpürmesi */
  stinger() { this.burst(0.45, 800, 6000, 0.18, 'bandpass', 1.4); this.tone(523.3, 0.18, 0.05, 'square', undefined, 0.12); this.tone(784, 0.25, 0.05, 'square', undefined, 0.2); }
  kartKaydir() { this.burst(0.28, 1200, 4200, 0.16, 'bandpass', 1.1); }
  kartCek() { this.tone(330, 0.3, 0.07, 'triangle', 660); this.burst(0.25, 3000, 900, 0.1, 'lowpass', 1); }
  yelpaze() { for (let i = 0; i < 7; i++) this.burst(0.06, 2500 + i * 300, 1800, 0.08, 'bandpass', 2, i * 0.045); }
  terazi() { this.tone(1320, 0.35, 0.06, 'triangle'); this.tone(1980, 0.3, 0.04, 'sine', undefined, 0.16); this.tone(990, 0.4, 0.05, 'triangle', undefined, 0.34); }
  vurgu() { this.tone(2400, 0.035, 0.035, 'square'); }
  soru() { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.16, 0.05, 'sine', f * 1.25, i * 0.11)); }
  damga() { this.tone(110, 0.2, 0.18, 'sine', 60); this.burst(0.1, 2400, 700, 0.12, 'lowpass', 1); }

  confirm() { this.tone(880, 0.12, 0.18, 'square'); this.tone(1320, 0.22, 0.14, 'square', undefined, 0.09); }
  /** Basılı tutma ilerlerken tık */
  tick(p: number) { this.tone(500 + p * 700, 0.05, 0.05, 'sine'); }

  /** Sürekli alev uğultusu: 0..1 */
  setRoar(level: number) {
    if (!this.ctx || !this.master || !this.noise) return;
    const c = this.ctx;
    if (!this.roar && level > 0.01 && this.on) {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500; filt.Q.value = 0.8;
      const gain = c.createGain(); gain.gain.value = 0;
      src.connect(filt).connect(gain).connect(this.master);
      src.start();
      this.roar = { src, gain, filt };
    }
    if (this.roar) {
      const v = this.on ? level : 0;
      this.roar.gain.gain.setTargetAtTime(v * 0.35, c.currentTime, 0.08);
      this.roar.filt.frequency.setTargetAtTime(350 + v * 900, c.currentTime, 0.1);
    }
  }

  /** Şimşek çıtırtısı: 0..1 */
  setCrackle(level: number) {
    if (!this.ok()) return;
    if (level > 0.01 && Math.random() < level * 0.35) this.burst(0.06 + Math.random() * 0.08, 2500 + Math.random() * 3000, 900, 0.25 * level, 'bandpass', 4);
  }

  stop() {
    try { this.roar?.src.stop(); } catch { /* yok say */ }
    try { this.hum?.o.stop(); this.hum?.o2.stop(); } catch { /* yok say */ }
    this.hum = null;
    this.roar = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
