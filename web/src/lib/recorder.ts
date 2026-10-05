// Mikrofon kaydı (MediaRecorder) → sunucuda RouteLLM ile yazıya çevrilir. iPhone'da Web Speech API güvenilir
// olmadığı için asıl yol bu; Web Speech yalnızca yedek. Konuşma bitince (sessizlik) kendiliğinden durur.

export interface Recording { stop(): void }

export function recorderSupported() {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Tarayıcının kaydedebildiği ilk biçim: Chrome/Android webm, iPhone mp4. */
function pickMime(): string | undefined {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export async function startRecording(h: {
  /** Konuşma algılandıysa kayıt; hiç konuşulmadıysa null (boşuna istek gönderilmez) */
  onStop(blob: Blob | null): void;
  onLevel?(level: number): void;
  /** Konuşma başladıktan sonra bu kadar sessizlikte dur (varsayılan 1400 ms) */
  silenceMs?: number;
  /** Hiç konuşma yoksa bu sürede vazgeç (varsayılan 6000 ms) */
  noSpeechMs?: number;
  /** En uzun kayıt (varsayılan 15000 ms) */
  maxMs?: number;
  /** Açık bir mikrofon akışı (alkış dinleyicisininki): yeniden izin/başlatma gecikmesi olmaz, kapatılmaz */
  stream?: MediaStream;
  /** Kullanıcı dokunuşuyla açılmış ses bağlamı. Dokunuşsuz (alkışla) başlayan kayıtta yeni bağlam askıda kalır ve
   *  seviye ölçülemez; verilmezse yenisi açılır. Verilen bağlam kapatılmaz. */
  ctx?: AudioContext;
}): Promise<Recording> {
  const silenceMs = h.silenceMs ?? 1400, noSpeechMs = h.noSpeechMs ?? 6000, maxMs = h.maxMs ?? 15000;
  const ownStream = !h.stream;
  const stream = h.stream ?? (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);

  // Sessizlik algılama: konuşma başladıktan sonra 1,4 sn sessizlikte dur; 6 sn hiç konuşma yoksa vazgeç; en fazla 15 sn.
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = h.ctx ?? new AC();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const source = ctx.createMediaStreamSource(stream);
  source.connect(analyser);
  // Bağlam askıdaysa seviye hep sıfır görünür: o durumda konuşma "duyulmuş" sayılır, kayıt süre sonunda gönderilir.
  const blind = ctx.state !== 'running';
  const buf = new Uint8Array(analyser.fftSize);
  const t0 = performance.now();
  let heard = false;
  let lastVoice = t0;
  let raf = 0;
  let stopped = false;

  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    if (rec.state !== 'inactive') rec.stop();
  };
  rec.onstop = () => {
    source.disconnect();
    if (ownStream) stream.getTracks().forEach(t => t.stop());
    if (!h.ctx) ctx.close().catch(() => {});
    h.onStop(heard && chunks.length ? new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }) : null);
  };

  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    h.onLevel?.(Math.min(1, rms * 4));
    const now = performance.now();
    if (rms > 0.035 || blind) { heard = true; lastVoice = blind ? t0 : now; }
    if ((heard && !blind && now - lastVoice > silenceMs) || (!heard && now - t0 > noSpeechMs) || now - t0 > (blind ? noSpeechMs : maxMs)) return finish();
    raf = requestAnimationFrame(tick);
  };
  rec.start(250);
  raf = requestAnimationFrame(tick);
  return { stop: finish };
}
