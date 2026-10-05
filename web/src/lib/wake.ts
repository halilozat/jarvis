// "İki alkışla uyanma" — tarayıcı tarafı: komut eşleştirme, sunucu saatine senkron, ekranı açık tutma ve
// alkıştan sonraki kısa komut penceresi ("uyan jarvis").
import { serverTime, stt } from './api';
import { startRecording } from './recorder';
import { createRecognizer } from './speech';

// ---------------------------------------------------------------- Komut eşleştirme

/** Küçük harf, Türkçe harfler sadeleşir (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u), noktalama boşluğa döner. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Ses tanıma "Jarvis"i çoğu zaman Türkçe yazımla duyar: carvis, cervis, çarvis (→ carvis), jarviz…
const NAME = /\b(jarvis|carvis|cervis|jervis|carviz|jarviz)\b/;
// "uyan", "uyan artık", "hadi uyan", "uyansana"
const WAKE = /\buyan(sana|in)?\b/;

/**
 * "Uyan Jarvis" mi? strict: hem "uyan" hem isim gerekir (yalnızca sesle uyanma: alkış yok, yanlış uyanma daha kolay).
 * strict değilse (alkıştan sonraki 4 sn) "uyan" yeterli: niyeti çift alkış zaten gösterdi; isim yanlış duyulsa da kaçmaz.
 */
export function isWakePhrase(text: string, strict: boolean): boolean {
  const t = fold(text);
  if (!WAKE.test(t)) return false;
  return !strict || NAME.test(t);
}

// ---------------------------------------------------------------- Saat senkronu

let offset = 0; // sunucu − istemci (ms)
let rtt = Infinity;

/** Sunucu saatine göre şimdi (ms). */
export const serverNow = (now: () => number = Date.now) => now() + offset;
export const clockInfo = () => ({ offset: Math.round(offset), rtt: Number.isFinite(rtt) ? Math.round(rtt) : null });

/**
 * Ofseti ölçer: 5 deneme, en kısa gidiş-dönüşün yarısı düşülür (Cristian algoritması). En kısa deneme, ağ
 * gecikmesinin en simetrik olduğu denemedir; hata payı ±rtt/2. Yerel ağ ve Tailscale'de rtt tipik olarak 5–40 ms.
 */
export async function syncClock(now: () => number = Date.now, fetchTime: () => Promise<number> = serverTime): Promise<void> {
  let best: { off: number; rtt: number } | null = null;
  for (let i = 0; i < 5; i++) {
    try {
      const t0 = now();
      const s = await fetchTime();
      const t1 = now();
      const r = t1 - t0;
      if (!best || r < best.rtt) best = { off: s - (t0 + r / 2), rtt: r };
    } catch { /* ağ yok: bir sonrakini dene */ }
  }
  if (best) { offset = best.off; rtt = best.rtt; }
}

/** Bağlanınca ve dakikada bir ölçer; sekme görünür olunca da (uyku sırasında saat kayabilir). */
export function startClockSync(): () => void {
  syncClock();
  const id = setInterval(syncClock, 60_000);
  const onVis = () => document.visibilityState === 'visible' && syncClock();
  document.addEventListener('visibilitychange', onVis);
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
}

// Arka plandaki (ya da başka pencerenin altında kalan) sekmede Chrome ana iş parçacığı zamanlayıcılarını 1 sn'ye
// hizalıyor: testte uyanış 371 ms geç başladı. Ayrı bir Worker'ın zamanlayıcıları bu kısıtlamaya girmiyor.
let timerWorker: Worker | null | undefined;
const workerCbs = new Map<number, () => void>();
let workerSeq = 0;
function getTimerWorker(): Worker | null {
  if (timerWorker !== undefined) return timerWorker;
  try {
    const src = 'onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)';
    timerWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    timerWorker.onmessage = e => { const cb = workerCbs.get(e.data); workerCbs.delete(e.data); cb?.(); };
  } catch {
    timerWorker = null;
  }
  return timerWorker;
}

/** Arka planda da hassas setTimeout: Worker ile setTimeout yarışır (Worker açılamazsa yalnızca setTimeout). İptal fonksiyonu döner. */
export function preciseTimeout(fn: () => void, ms: number): () => void {
  let fired = false;
  const wid = ++workerSeq;
  const fire = () => { if (fired) return; fired = true; clearTimeout(id); workerCbs.delete(wid); fn(); };
  const id = setTimeout(fire, ms);
  const w = typeof Worker !== 'undefined' ? getTimerWorker() : null;
  if (w) { workerCbs.set(wid, fire); w.postMessage({ id: wid, ms }); }
  return () => { fired = true; clearTimeout(id); workerCbs.delete(wid); };
}

/** Sunucu zamanı `at` anında fn'i çalıştırır; gecikme (+ geç, − erken) ms olarak fn'e verilir. */
export function atServerTime(at: number, fn: (lateMs: number) => void, now: () => number = Date.now): () => void {
  return preciseTimeout(() => fn(serverNow(now) - at), Math.max(0, at - serverNow(now)));
}

// ---------------------------------------------------------------- Ekranı açık tutma

/**
 * Screen Wake Lock: uyku ekranı kararsa da cihaz kilitlenmesin. Sekme gizlenince tarayıcı kilidi bırakır,
 * görünür olunca yeniden istenir. Desteklenmiyorsa (eski iOS) README'deki ayar gerekir.
 */
export function keepAwake(): () => void {
  const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void>; released: boolean }> } };
  if (!nav.wakeLock) return () => {};
  let lock: { release(): Promise<void>; released: boolean } | null = null;
  let on = true;
  const req = () => {
    if (!on || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
    nav.wakeLock!.request('screen').then(l => { if (on) lock = l; else l.release(); }).catch(() => {});
  };
  req();
  document.addEventListener('visibilitychange', req);
  return () => {
    on = false;
    document.removeEventListener('visibilitychange', req);
    lock?.release().catch(() => {});
  };
}

// ---------------------------------------------------------------- Komut penceresi

export interface CommandResult {
  matched: boolean;
  heard: string;
  /** Hangi yol yakaladı (log için) */
  via: 'routellm' | 'webspeech' | null;
  ms: number;
}

export interface CommandListen { result: Promise<CommandResult>; cancel(): void }

/**
 * Kısa bir pencerede "uyan jarvis" dinler. İki yol yarışır:
 *  - Asıl yol: kayıt → RouteLLM ile yazıya çevirme (her cihazda çalışır; konuşma bitince gönderilir).
 *  - Hızlandırıcı: Web Speech (varsa) ara sonuçları canlı verir; "uyan" duyulur duyulmaz eşleşir.
 * Hangisi önce eşleşirse o kazanır; ikisi de bitip eşleşme yoksa matched=false.
 */
export function listenForCommand(o: {
  ms: number;
  strict: boolean;
  ctx?: AudioContext;
  stream?: MediaStream;
  onInterim?(t: string): void;
}): CommandListen {
  const t0 = performance.now();
  let settle!: (r: CommandResult) => void;
  const result = new Promise<CommandResult>(r => (settle = r));
  let done = false;
  let heardAll = '';
  let recorderOk = true;
  const stops: (() => void)[] = [];
  const finish = (matched: boolean, via: CommandResult['via'], heard = heardAll) => {
    if (done) return;
    done = true;
    stops.forEach(s => { try { s(); } catch { /* yok say */ } });
    settle({ matched, heard, via, ms: Math.round(performance.now() - t0) });
  };
  // RouteLLM yolu bitince karar verilir (pencerede konuşma yoksa hemen); Web Speech yalnızca kayıt yoksa belirleyici.
  const report = (via: 'routellm' | 'webspeech', text: string, final: boolean) => {
    if (done) return;
    if (text) heardAll = text;
    if (text && isWakePhrase(text, o.strict)) return finish(true, via, text);
    if (final && (via === 'routellm' || !recorderOk)) finish(false, null);
  };

  // 1) Web Speech (varsa; Chrome masaüstünde ara sonuçlar ~300 ms'de gelir)
  const rec = createRecognizer({
    onInterim: t => { o.onInterim?.(t); report('webspeech', t, false); },
    onFinal: t => report('webspeech', t, false),
    onEnd: () => report('webspeech', '', true),
    onError: () => { /* onEnd yine gelir */ },
  });
  if (rec) {
    try { rec.start(); stops.push(() => rec.stop()); } catch { /* başka tanıma sürüyor: yalnızca kayıt */ }
  }

  // 2) Kayıt + RouteLLM
  startRecording({
    stream: o.stream,
    ctx: o.ctx,
    noSpeechMs: o.ms,
    silenceMs: 700,
    maxMs: o.ms + 2000, // pencerenin sonunda başlayan "uyan jarvis" yarıda kesilmesin
    onStop: blob => {
      if (done) return;
      if (!blob) return report('routellm', '', true);
      stt(blob).then(t => report('routellm', t, true)).catch(() => report('routellm', '', true));
    },
  })
    .then(rec => (done ? rec.stop() : stops.push(() => rec.stop())))
    .catch(() => { recorderOk = false; if (!rec) finish(false, null); });

  // Emniyet: pencere + yazıya çevirme payı
  const guard = setTimeout(() => finish(false, null), o.ms + 6000);
  stops.push(() => clearTimeout(guard));
  return { result, cancel: () => finish(false, null) };
}
