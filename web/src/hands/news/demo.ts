// Haber Modu · kamerasız demo (?el=demo&mod=haber). Sentetik ellerle: motto → karusel kaydırma → ☝️ vurgu →
// 🤏 kart çekme → detay → 🤏🤏 yelpaze: kaynak karşılaştırması → 🤏🤏 terazi: iddia kontrolü → sorulmamış sorular →
// ✊ geri → sabah özeti (✋ yukarı kaydırma). Analiz (tam metin + model) gelmeden sonraki adıma geçilmez: demonun
// saati bekler. Veriler sunucudan (gerçek haberler).
import type { P } from '../gestures';
import { FIST, OPEN, POINT, synthHand, type DemoHand } from '../synthetic';
import { PINCH, pinchOffset } from '../space/demo';
import type { HaberCmd } from './commands';
import type { NewsScene } from './scene';

export interface HaberDemoKare { hands: DemoHand[]; step: string; cmd?: { key: string; cmd: HaberCmd } }

const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const SURE = 84;
const DONGU_BAS = 7;

let saat = 0, son = -1, tur = 0;

export function demoNews(t: number, W: number, H: number, news: NewsScene): HaberDemoKare {
  const dt = son < 0 ? 0 : Math.max(0, Math.min(0.1, t - son));
  son = t;
  const s = Math.min(W, H) * 0.15;
  const cx = W / 2, cy = H * 0.47;
  // Bekleme: analiz ya da iddialar hazır değilse saat ilerlemez
  const bekle = (saat > 14.5 && saat < 15 && !news.analizHazir) || (saat > 36.5 && saat < 37 && !news.iddiaHazir);
  if (!bekle) saat += dt;
  if (saat > SURE) { saat = DONGU_BAS; tur++; }
  const k = saat;
  const R = 'Right', L = 'Left';
  const el = (id: string, x: number, y: number, curl: typeof OPEN, extra: { pinch?: number; left?: boolean; size?: number } = {}): DemoHand =>
    ({ id, score: 1, pts: synthHand({ x, y, size: extra.size ?? s, curl, pinch: extra.pinch, roll: 0, left: extra.left }) });
  const acik = (id: string, x: number, y: number, left = false) => el(id, x, y + s * 0.9, OPEN, { left });
  const cimdik = (id: string, x: number, y: number, left = false, size = s) => { const o = pinchOffset(size, 0, left); return el(id, x - o.x, y - o.y, PINCH, { pinch: 1, left, size }); };
  const isaret = (id: string, p: P) => { const o = synthHand({ x: 0, y: 0, size: s, curl: POINT })[8]; return el(id, p.x - o.x, p.y - o.y, POINT); };
  const yumruk = (id: string, x: number, y: number) => el(id, x, y + s * 0.6, FIST);
  /** 🤏 tut ve sürükle: 0,25 sn tutulur (çimdik tanınsın), 0,6 sn'de taşınır, bırakılır */
  const surukle = (bas: number, x0: number, y0: number, x1: number, y1: number): DemoHand[] => {
    const u = k - bas;
    if (u < 0 || u > 1.1) return [];
    const m = smooth((u - 0.25) / 0.6);
    return [cimdik(R, x0 + (x1 - x0) * m, y0 + (y1 - y0) * m)];
  };
  /** ✊ yumruğu tut: 0,4 sn açık, sonra 1,1 sn yumruk (0,8 sn'de kapatır) */
  const kapat = (bas: number, x: number, y: number): DemoHand[] => {
    const u = k - bas;
    if (u < 0 || u > 1.5) return [];
    return [u < 0.4 ? acik(R, x, y) : yumruk(R, x, y)];
  };
  const cmd = (at: number, key: string, c: HaberCmd) => (k > at && k < at + 0.5 ? { key: `${tur}:${key}`, cmd: c } : undefined);

  if (k < DONGU_BAS) return { step: '📰 HABER MERKEZİ · motto', hands: [] };
  if (k < 10.2) {
    // 🤏 tut, sürükle: karusel eli izler; bırakınca hızıyla kayar
    const u = k - 7.2;
    if (u < 0 || u > 2.4) return { step: '🤏 tut ve sürükle: karusel elini izler', hands: [] };
    if (u < 1.7) { const m = smooth((u - 0.3) / 1.3); return { step: '🤏 tut ve sürükle: karusel elini izler', hands: [cimdik(R, W * (0.74 - m * 0.42), cy)] }; }
    return { step: '🖐 bırak: hızıyla kayar, karta oturur', hands: [acik(R, W * (0.32 - (u - 1.7) * 0.2), cy)] };
  }
  if (k < 11.6) return { step: '☝️ işaret: kart öne doğru vurgulanır', hands: [isaret(R, { x: cx + Math.sin((k - 10.2) * 2) * 30, y: cy })] };
  if (k < 13.4) {
    // ✊→🖐 parmakları aç: öndeki kart açılır
    if (k < 11.8) return { step: '✊→🖐 kısa yumruk ve aç: kart açılır', hands: [] };
    return { step: '✊→🖐 kısa yumruk ve aç: kart açılır', hands: [k < 12.5 ? yumruk(R, W * 0.7, H * 0.55) : acik(R, W * 0.7, H * 0.55)] };
  }
  if (k < 15.6) return { step: news.analizHazir ? '📄 haber detayı: özet, sayılar, harita, kim ne zaman verdi' : '⏳ Jarvis kaynakları okuyor (tam metin + analiz)', hands: [] };
  if (k < 17.4) {
    // 🤏 tut ve yukarı sürükle: içerik kayar
    const m = smooth((k - 15.9) / 1.1);
    return { step: '🤏 tut ve yukarı sürükle: içerik kayar', hands: [cimdik(R, W * 0.3, H * (0.72 - m * 0.22))] };
  }
  if (k < 18) return { step: '📄 haber detayı', hands: [] };
  if (k < 19.6) {
    const m = smooth((k - 18.3) / 0.8);
    const d = W * (0.07 + m * 0.24);
    return { step: '🤏🤏 elleri aç: bir kat daha yakınlaş → kaynak karşılaştırması', hands: [cimdik(R, cx + d, cy), cimdik(L, cx - d, cy, true)] };
  }
  if (k < 24) return { step: '🧾 her kaynağın kartı yan yana · altta tarafsız karşılaştırma', hands: [] };
  if (k < 28) {
    const kart = document.querySelectorAll<HTMLElement>('.hb-kaynak')[1]?.getBoundingClientRect();
    return { step: '☝️ kaynağa dokun: ilgili cümleler metinde vurgulanır', hands: kart ? [isaret(R, { x: kart.left + kart.width / 2, y: kart.top + kart.height * 0.4 })] : [] };
  }
  if (k < 32) return { step: '🧾 karşılaştırma', hands: [] };
  if (k < 34) {
    const u = k - 32;
    const a = Math.sin(u * Math.PI * 2 * 1.3) * H * 0.13;
    return { step: '🤏🤏 terazi: elleri ters yönde oynat → iddia kontrolü', hands: [cimdik(R, cx + W * 0.16, cy - a), cimdik(L, cx - W * 0.16, cy + a, true)] };
  }
  if (k < 40) return { step: news.iddiaHazir ? '⚖️ söylenen ↔ resmî veri: etiket, kaynak bağlantısı ve tarih' : '⏳ iddialar resmî veriyle karşılaştırılıyor', hands: [] };
  if (k < 41.4) return { step: '🤏 tut ve sola sürükle: sonraki iddia', hands: surukle(40.1, W * 0.72, cy, W * 0.36, cy) };
  if (k < 46) return { step: '⚖️ iddia kontrolü', hands: [] };
  if (k < 53) return { step: '🗣 "Jarvis, burada ne sorulmamış?"', hands: [], cmd: cmd(46.2, 'sorular', { tip: 'sorular' }) };
  if (k < 55) return { step: '🖐→✊ avucunu kapat: detaya dön', hands: k < 53.3 ? [] : [k < 53.9 ? acik(R, W * 0.7, H * 0.55) : yumruk(R, W * 0.7, H * 0.55)] };
  if (k < 57) return { step: '✊ yumruğu tut: ana görünüme dön', hands: kapat(55.4, W * 0.7, H * 0.55) };
  if (k < 58) return { step: '🗣 "Jarvis, günümü özetle"', hands: [], cmd: cmd(57, 'sabah', { tip: 'sabah' }) };
  if (k < 74) {
    const h = [...surukle(63, W * 0.72, H * 0.72, W * 0.72, H * 0.4), ...surukle(67.5, W * 0.72, H * 0.72, W * 0.72, H * 0.4), ...surukle(71.5, W * 0.72, H * 0.72, W * 0.72, H * 0.4)];
    return { step: '🌅 sabah özeti · 🤏 tut ve yukarı sürükle: sonraki kart', hands: h };
  }
  if (k < 76) return { step: '✊ yumruğu tut: karusele dön', hands: kapat(74.4, W * 0.7, H * 0.55) };
  if (k < 79) {
    // 🤏🤏 elleri aç: öndeki kart büyür, eşikte detaya iner
    const m = smooth((k - 76.6) / 1.4);
    const d = W * (0.08 + m * 0.12);
    return { step: '🤏🤏 elleri aç: kart büyür, detaya iner', hands: k < 76.4 ? [] : [cimdik(R, cx + d, cy), cimdik(L, cx - d, cy, true)] };
  }
  if (k < 82) {
    // 🤏🤏 elleri yaklaştır: uzaklaş, karusele dön
    const m = smooth((k - 79.8) / 1.2);
    const d = W * (0.22 - m * 0.14);
    return { step: '🤏🤏 elleri yaklaştır: uzaklaş', hands: k < 79.6 ? [] : [cimdik(R, cx + d, cy), cimdik(L, cx - d, cy, true)] };
  }
  return { step: '📰 karusel', hands: [] };
}
