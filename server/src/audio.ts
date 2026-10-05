// Ses yardımcıları: WAV sarma/okuma ve perde (f0) ölçümü. Yeni bağımlılık yok.

/** Ham 16-bit mono PCM'i WAV başlığıyla sarar. */
export function pcmToWav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export const isMp3 = (b: Buffer) => b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
export const isWav = (b: Buffer) => b.subarray(0, 4).toString() === 'RIFF';

/** WAV'dan örnekleme hızı ve 16-bit örnekler. */
export function readWav(wav: Buffer): { rate: number; samples: Int16Array } | null {
  if (!isWav(wav)) return null;
  const rate = wav.readUInt32LE(24);
  const at = wav.indexOf('data', 12);
  if (at < 0) return null;
  const start = at + 8;
  const len = Math.min(wav.readUInt32LE(at + 4), wav.length - start) & ~1;
  const copy = Buffer.from(wav.subarray(start, start + len));
  return { rate, samples: new Int16Array(copy.buffer, copy.byteOffset, len / 2) };
}

/** WAV süresi (sn). WAV değilse null. */
export function wavSeconds(wav: Buffer): number | null {
  const w = readWav(wav);
  return w ? w.samples.length / w.rate : null;
}

/**
 * Medyan temel frekans (Hz), otokorelasyonla, 70–400 Hz aralığında. Sesin "aynı kişi" kalıp kalmadığını
 * nesnel ölçmek için: Gemini TTS'te aynı ses kimliği istekten isteğe 125–197 Hz oynarken gpt-audio 83–97 Hz'de kaldı.
 */
export function medianF0(samples: Int16Array, rate: number): number | null {
  const frame = Math.round(rate * 0.04), hop = Math.round(rate * 0.01);
  const minLag = Math.floor(rate / 400), maxLag = Math.ceil(rate / 70);
  const f0s: number[] = [];
  for (let s = 0; s + frame + maxLag < samples.length; s += hop) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += samples[s + i] * samples[s + i];
    if (energy / frame < 300 * 300) continue; // sessizlik
    let best = 0, bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0, d1 = 0, d2 = 0;
      for (let i = 0; i < frame; i++) {
        const a = samples[s + i], b = samples[s + i + lag];
        num += a * b;
        d1 += a * a;
        d2 += b * b;
      }
      const r = num / Math.sqrt(d1 * d2 || 1);
      if (r > best) { best = r; bestLag = lag; }
    }
    if (best > 0.6) f0s.push(rate / bestLag);
  }
  if (f0s.length < 10) return null;
  f0s.sort((a, b) => a - b);
  return Math.round(f0s[Math.floor(f0s.length / 2)]);
}

/** Karşılaştırma için: noktalama ve büyük/küçük harf farkını yok say, % → yüzde. */
export const normalizeSpeech = (s: string) =>
  s.replace(/%/g, ' yüzde ').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
