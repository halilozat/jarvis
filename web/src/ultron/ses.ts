// Ultron Paketi · ses: replikler (efektli), sentez müzik ve efektler. Hepsi sentez ya da projenin kendi ses dosyası;
// film müziği/efekti yok. Aynı grafik canlı (AudioContext) ve kayıt (OfflineAudioContext) için kurulur: deterministik.
// Ultron: hafif perde düşürme (playbackRate), metalik halka modülasyonu, kısa yankı. Jarvis 5–6. vuruşta: bit-crush,
// kısa kesilmeler, perde düşüşü; son replikte yavaşlayıp kopar. Seslendirme her zaman net: müzik replik altında kısılır.
import { karma, tohumlu, type Plan, type PlanReplik } from './zaman';

export interface Kaynak { tampon: AudioBuffer; bas: number; sure: number }
export interface Cikislar { ses: AudioNode; muzik: AudioNode; efekt: AudioNode }

/** Ton → oynatma hızı (başlangıç, bitiş). Hız < 1: perde düşer ve süre uzar. */
export function hiz(kim: PlanReplik['kim'], ton: string): [number, number] {
  if (kim === 'ultron') return ton === 'fisilti' ? [0.9, 0.9] : [0.93, 0.93];
  if (ton === 'kesik') return [0.97, 0.94];
  if (ton === 'bozuk') return [0.95, 0.6];
  return [1, 1];
}
/** Kırpılmış tampon süresi + hız → sahnedeki süre (doğrusal hız rampası için ortalama hız) */
export const sahneSuresi = (k: Kaynak, kim: PlanReplik['kim'], ton: string) => { const [a, b] = hiz(kim, ton); return k.sure / ((a + b) / 2); };

/** Baştaki ve sondaki sessizliği kırp (senkron ve sıkı zamanlama için) */
export function kirp(b: AudioBuffer, esik = 0.01): Kaynak {
  const d = b.getChannelData(0);
  let i = 0, j = d.length - 1;
  while (i < d.length && Math.abs(d[i]) < esik) i++;
  while (j > i && Math.abs(d[j]) < esik) j--;
  const sr = b.sampleRate;
  const bas = Math.max(0, i / sr - 0.03), son = Math.min(b.duration, j / sr + 0.09);
  return { tampon: b, bas, sure: Math.max(0.2, son - bas) };
}

// ---------------------------------------------------------------- Yardımcılar

const gurultuOnbellek = new WeakMap<BaseAudioContext, AudioBuffer>();
function gurultu(ctx: BaseAudioContext): AudioBuffer {
  let b = gurultuOnbellek.get(ctx);
  if (b) return b;
  b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const r = tohumlu(77), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  gurultuOnbellek.set(ctx, b);
  return b;
}
function yankiIR(ctx: BaseAudioContext, sure = 1.4, sonum = 2.6): AudioBuffer {
  const b = ctx.createBuffer(2, Math.floor(ctx.sampleRate * sure), ctx.sampleRate);
  const r = tohumlu(91);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / d.length, sonum); }
  return b;
}
/** Bit-crush benzeri: genliği kademelere böl (dalga şekillendirici) */
function kirici(ctx: BaseAudioContext, kademe = 10): WaveShaperNode {
  const w = ctx.createWaveShaper();
  const c = new Float32Array(2048);
  for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.round(x * kademe) / kademe; }
  w.curve = c;
  return w;
}
function zarf(g: AudioParam, t: number, tepe: number, atak: number, dusus: number) {
  g.setValueAtTime(0, t); g.linearRampToValueAtTime(tepe, t + atak); g.exponentialRampToValueAtTime(0.0001, t + atak + dusus);
}
function gurultuKaynak(ctx: BaseAudioContext, t: number, sure: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = gurultu(ctx); s.loop = true;
  s.start(t, (karma(Math.round(t * 1000)) * 1.5)); s.stop(t + sure);
  return s;
}

// ---------------------------------------------------------------- Replikler

export function replik(ctx: BaseAudioContext, r: PlanReplik, k: Kaynak, t: number, cikis: AudioNode, yanki: ConvolverNode) {
  const src = ctx.createBufferSource();
  src.buffer = k.tampon;
  const [h0, h1] = hiz(r.kim, r.ton);
  const sure = sahneSuresi(k, r.kim, r.ton);
  src.playbackRate.setValueAtTime(h0, t);
  if (h1 !== h0) src.playbackRate.linearRampToValueAtTime(h1, t + sure);
  const kuru = ctx.createGain();
  const islak = ctx.createGain();
  if (r.kim === 'ultron') {
    // Metalik halka modülasyonu: sinyal × 52 Hz taşıyıcı (paralel, %35) + yankı
    const halka = ctx.createGain(); halka.gain.value = 0;
    const osc = ctx.createOscillator(); osc.frequency.value = 52; osc.connect(halka.gain); osc.start(t); osc.stop(t + sure + 0.1);
    const halkaSeviye = ctx.createGain(); halkaSeviye.gain.value = 0.22;
    src.connect(halka); halka.connect(halkaSeviye); halkaSeviye.connect(kuru);
    const fisilti = r.ton === 'fisilti';
    const gov = ctx.createGain(); gov.gain.value = fisilti ? 0.6 : 0.7;
    if (fisilti) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180; src.connect(hp); hp.connect(gov); } else src.connect(gov);
    gov.connect(kuru);
    islak.gain.value = fisilti ? 0.55 : 0.28;
    kuru.connect(islak); islak.connect(yanki);
  } else if (r.ton === 'kesik' || r.ton === 'bozuk') {
    // Dijital bozulma: kırıcı karışımı + tekrarlanabilir kısa kesilmeler
    const kir = kirici(ctx, r.ton === 'bozuk' ? 6 : 12);
    const kirSeviye = ctx.createGain(); kirSeviye.gain.value = r.ton === 'bozuk' ? 0.75 : 0.5;
    const temiz = ctx.createGain(); temiz.gain.value = r.ton === 'bozuk' ? 0.45 : 0.7;
    src.connect(kir); kir.connect(kirSeviye); kirSeviye.connect(kuru); src.connect(temiz); temiz.connect(kuru);
    const kesici = ctx.createGain();
    kuru.disconnect(); kuru.connect(kesici); kesici.connect(cikis);
    kesici.gain.setValueAtTime(1, t);
    const n = r.ton === 'bozuk' ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const a = t + sure * (0.12 + 0.8 * karma(i, r.id.length * 31 + (r.ton === 'bozuk' ? 7 : 3)));
      const u = 0.04 + 0.07 * karma(i + 9, 5);
      kesici.gain.setValueAtTime(0.05, a); kesici.gain.setValueAtTime(1, a + u);
    }
    if (r.ton === 'bozuk') { kesici.gain.setValueAtTime(1, t + sure - 0.25); kesici.gain.linearRampToValueAtTime(0, t + sure); } // son replik kopar
    islak.gain.value = 0.12; kuru.connect(islak); islak.connect(yanki);
    src.start(t, k.bas, k.sure); src.stop(t + sure + 0.05);
    return;
  } else {
    src.connect(kuru);
    islak.gain.value = 0.08; kuru.connect(islak); islak.connect(yanki);
  }
  kuru.connect(cikis);
  src.start(t, k.bas, k.sure);
  src.stop(t + sure + 0.05);
}

// ---------------------------------------------------------------- Müzik

function drone(ctx: BaseAudioContext, bas: number, bit: number, cikis: AudioNode, koyu = false) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0, bas); g.gain.linearRampToValueAtTime(koyu ? 0.1 : 0.16, bas + 3); g.gain.setValueAtTime(koyu ? 0.1 : 0.16, Math.max(bas + 3, bit - 0.05)); g.gain.linearRampToValueAtTime(0, bit);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = koyu ? 140 : 190; lp.Q.value = 0.7;
  for (const [f, tip] of [[55, 'sawtooth'], [55.45, 'sawtooth'], [41.2, 'sine'], [82.4, 'triangle']] as const) {
    const o = ctx.createOscillator(); o.type = tip; o.frequency.value = f * (koyu ? 0.94 : 1);
    const og = ctx.createGain(); og.gain.value = tip === 'sine' ? 0.9 : 0.35;
    o.connect(og); og.connect(lp); o.start(bas); o.stop(bit + 0.1);
  }
  // Yavaş titreşim (uğultu nefes alır)
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 60;
  lfo.connect(lg); lg.connect(lp.frequency); lfo.start(bas); lfo.stop(bit + 0.1);
  lp.connect(g); g.connect(cikis);
}
function yukselis(ctx: BaseAudioContext, bas: number, bit: number, cikis: AudioNode) {
  const n = gurultuKaynak(ctx, bas, bit - bas);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(260, bas); bp.frequency.exponentialRampToValueAtTime(4200, bit);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, bas); g.gain.exponentialRampToValueAtTime(0.22, bit - 0.05); g.gain.linearRampToValueAtTime(0, bit);
  n.connect(bp); bp.connect(g); g.connect(cikis);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(180, bas); o.frequency.exponentialRampToValueAtTime(880, bit);
  const og = ctx.createGain(); og.gain.setValueAtTime(0, bas); og.gain.linearRampToValueAtTime(0.05, bit - 0.05); og.gain.linearRampToValueAtTime(0, bit);
  o.connect(og); og.connect(cikis); o.start(bas); o.stop(bit + 0.05);
}
function ritim(ctx: BaseAudioContext, bas: number, bit: number, cikis: AudioNode) {
  for (let t = bas, i = 0; t < bit; t += 0.5, i++) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const g = ctx.createGain(); zarf(g.gain, t, 0.55, 0.004, 0.3);
    o.connect(g); g.connect(cikis); o.start(t); o.stop(t + 0.4);
    const h = gurultuKaynak(ctx, t + 0.25, 0.06);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const hg = ctx.createGain(); zarf(hg.gain, t + 0.25, i % 4 === 3 ? 0.12 : 0.06, 0.002, 0.05);
    h.connect(hp); hp.connect(hg); hg.connect(cikis);
  }
}

// ---------------------------------------------------------------- Efektler

type Sfx = (ctx: BaseAudioContext, t: number, cikis: AudioNode, sure?: number) => void;
const SFX: Record<string, Sfx> = {
  ugultu: (ctx, t, c) => { const o = ctx.createOscillator(); o.frequency.value = 50; const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 1.5); g.gain.linearRampToValueAtTime(0, t + 7); o.connect(g); g.connect(c); o.start(t); o.stop(t + 7.1); },
  cizirti: (ctx, t, c, sure = 1.6) => {
    const n = gurultuKaynak(ctx, t, sure); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    for (let i = 0; i * 0.035 < sure; i++) { const a = t + i * 0.035; g.gain.setValueAtTime(karma(i, Math.round(t * 10)) > 0.62 ? 0.18 * karma(i, 3) : 0, a); }
    g.gain.setValueAtTime(0, t + sure);
    n.connect(bp); bp.connect(g); g.connect(c);
  },
  acilis: (ctx, t, c) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1300, t + 0.6); const g = ctx.createGain(); zarf(g.gain, t, 0.12, 0.05, 0.9); o.connect(g); g.connect(c); o.start(t); o.stop(t + 1.1); },
  tarama: (ctx, t, c) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880; const v = ctx.createOscillator(); v.frequency.value = 9; const vg = ctx.createGain(); vg.gain.value = 40; v.connect(vg); vg.connect(o.frequency); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 1.4); o.connect(g); g.connect(c); o.start(t); v.start(t); o.stop(t + 1.5); v.stop(t + 1.5); },
  hizlanma: (ctx, t, c) => { const n = gurultuKaynak(ctx, t, 2.4); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 2.2); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 1.6); g.gain.linearRampToValueAtTime(0, t + 2.4); n.connect(bp); bp.connect(g); g.connect(c); },
  cokme: (ctx, t, c) => { const n = gurultuKaynak(ctx, t, 1.3); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(90, t + 1.2); const g = ctx.createGain(); zarf(g.gain, t, 0.3, 0.02, 1.2); n.connect(lp); lp.connect(g); g.connect(c); },
  kalkan: (ctx, t, c) => { for (const f of [440, 660, 990]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); zarf(g.gain, t, 0.04, 0.08, 0.9); o.connect(g); g.connect(c); o.start(t); o.stop(t + 1.1); } },
  red: (ctx, t, c) => { for (const d of [0, 0.15]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 220; const g = ctx.createGain(); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.06, t + d + 0.005); g.gain.setValueAtTime(0.06, t + d + 0.1); g.gain.linearRampToValueAtTime(0, t + d + 0.11); o.connect(g); g.connect(c); o.start(t + d); o.stop(t + d + 0.12); } },
  ark: (ctx, t, c, sure = 6) => SFX.cizirti(ctx, t, c, sure),
  ele: (ctx, t, c) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.35); const k = kirici(ctx, 5); const g = ctx.createGain(); zarf(g.gain, t, 0.09, 0.005, 0.4); o.connect(k); k.connect(g); g.connect(c); o.start(t); o.stop(t + 0.45); SFX.cizirti(ctx, t, c, 0.4); },
  boom: (ctx, t, c) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(26, t + 3); const g = ctx.createGain(); zarf(g.gain, t, 0.9, 0.01, 3.6); o.connect(g); g.connect(c); o.start(t); o.stop(t + 3.8);
    const n = gurultuKaynak(ctx, t, 1.6); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(60, t + 1.5); const ng = ctx.createGain(); zarf(ng.gain, t, 0.45, 0.005, 1.5); n.connect(lp); lp.connect(ng); ng.connect(c);
  },
  dagilma: (ctx, t, c) => { const n = gurultuKaynak(ctx, t, 2.8); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(400, t); hp.frequency.exponentialRampToValueAtTime(9000, t + 2.6); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 2.8); n.connect(hp); hp.connect(g); g.connect(c); },
  toplanma: (ctx, t, c) => { const n = gurultuKaynak(ctx, t, 2.4); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(5000, t); bp.frequency.exponentialRampToValueAtTime(300, t + 2.2); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 2.1); g.gain.linearRampToValueAtTime(0, t + 2.4); n.connect(bp); bp.connect(g); g.connect(c); SFX.acilis(ctx, t + 2.1, c); },
};

/** Tepe sınırlayıcı (kırpılmayı önler) */
export function sinirlayici(ctx: BaseAudioContext): DynamicsCompressorNode {
  const d = ctx.createDynamicsCompressor();
  d.threshold.value = -9; d.knee.value = 6; d.ratio.value = 16; d.attack.value = 0.002; d.release.value = 0.12;
  return d;
}
/** Yankı düğümü (Ultron'un Gözü anlatımı için de) */
export function yankiKur(ctx: BaseAudioContext, hedef: AudioNode) { const y = ctx.createConvolver(); y.buffer = yankiIR(ctx); y.connect(hedef); return y; }
/** Göz anlatımı için koyu fon (drone) */
export const fonDrone = (ctx: BaseAudioContext, bas: number, bit: number, cikis: AudioNode) => drone(ctx, bas, bit, cikis, true);

// ---------------------------------------------------------------- Grafik

/**
 * Sahnenin bütün sesini ctx üzerinde zamanlar. t0: sahnenin t=0 anının ctx zamanı. aralik: yalnızca bu sahne
 * aralığındaki öğeler (Final B: parola gelince ikinci yarı ayrıca zamanlanır).
 */
export function sesKur(ctx: BaseAudioContext, p: Plan, kaynaklar: Record<string, Kaynak>, t0: number, c: Cikislar, aralik: [number, number] = [-Infinity, Infinity]) {
  const ici = (t: number) => t >= aralik[0] && t < aralik[1];
  const at = (t: number) => t0 + t;
  const b = (no: number) => p.vuruslar.find(v => v.no === no)!;
  // Seslendirme sınırlayıcısı: halka + yankı toplamı kırpılmasın
  const sinir = sinirlayici(ctx); sinir.connect(c.ses);
  const yanki = ctx.createConvolver(); yanki.buffer = yankiIR(ctx); yanki.connect(sinir);

  // Müzik veri yolu: ducking (replik altında kısılır)
  const muzik = ctx.createGain(); muzik.gain.value = 1; muzik.connect(c.muzik);
  for (const r of p.replikler) {
    if (!ici(r.bas)) continue;
    muzik.gain.setTargetAtTime(0.38, at(r.bas) - 0.05, 0.06);
    muzik.gain.setTargetAtTime(1, at(r.bas + r.sure), 0.25);
  }
  if (ici(0)) drone(ctx, at(0), at(b(6).bas), muzik);
  if (ici(b(4).bas)) yukselis(ctx, at(b(4).bas), at(b(6).bas), muzik);
  if (ici(b(5).bas)) ritim(ctx, at(b(5).bas), at(b(6).bas), muzik);
  if (p.final === 'A' && ici(b(7).bas)) drone(ctx, at(b(7).bas), at(p.toplam + 2), muzik, true);
  if (p.final === 'B' && ici(b(7).bas)) {
    const mk = p.olaylar.find(o => o.olay === 'maviKivilcim')?.t ?? b(7).bas;
    for (const f of [261.6, 392, 523.3]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(0, at(mk)); g.gain.linearRampToValueAtTime(0.035, at(mk) + 1.5); g.gain.linearRampToValueAtTime(0, at(p.toplam) + 1); o.connect(g); g.connect(muzik); o.start(at(mk)); o.stop(at(p.toplam) + 1.1); }
  }
  for (const o of p.olaylar) {
    if (!ici(o.t)) continue;
    if (o.sfx && SFX[o.sfx]) SFX[o.sfx](ctx, at(o.t), c.efekt, o.sfx === 'ark' ? Math.max(1, b(6).bas - o.t) : undefined);
  }
  for (const r of p.replikler) {
    const k = kaynaklar[r.id];
    if (k && ici(r.bas)) replik(ctx, r, k, at(r.bas), sinir, yanki);
  }
}

// ---------------------------------------------------------------- WAV

export function wav(kanallar: Float32Array[], sr: number): Blob {
  const n = kanallar[0].length, k = kanallar.length;
  const buf = new ArrayBuffer(44 + n * k * 2);
  const v = new DataView(buf);
  const yaz = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  yaz(0, 'RIFF'); v.setUint32(4, 36 + n * k * 2, true); yaz(8, 'WAVE'); yaz(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, k, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * k * 2, true); v.setUint16(32, k * 2, true); v.setUint16(34, 16, true); yaz(36, 'data'); v.setUint32(40, n * k * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) { const x = Math.max(-1, Math.min(1, kanallar[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}
