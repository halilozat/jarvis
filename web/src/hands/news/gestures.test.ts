// Haber Modu jest testi (sahte el kareleriyle). Çalıştır: npm run test:haber
import { HaberJest, type JestOlay } from './gestures';
import type { Gesture, P, TrackedHand } from '../gestures';

/** Sahte el: yalnızca jestlerin okuduğu alanlar */
function el(id: string, gesture: Gesture, since: number, p: P, size = 120, vel: P = { x: 0, y: 0 }): TrackedHand {
  return { id, gesture, since, vel, pts: Array.from({ length: 21 }, () => p), shape: { size, palm: p, pinchPt: p, pinch: gesture === 'cimdik' ? 0.1 : 0.8, roll: 0, face: 1, fingers: [true, true, true, true, true], gesture } } as unknown as TrackedHand;
}

let fail = 0, ok = 0;
const t = (ad: string, f: () => void) => { try { f(); ok++; console.log(`✓ ${ad}`); } catch (e) { fail++; console.log(`✗ ${ad}: ${(e as Error).message}`); } };
const esit = (a: unknown, b: unknown, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const tipler = (o: JestOlay[]) => o.map(x => x.tip).filter(x => x !== 'isaret');

/** Kare kare oynat: [an, eller]; tüm olaylar. kilit: true → eller kilitlenmeden önce hiçbir şey yapmaz (gerçek kullanım) */
function oynat(kareler: [number, TrackedHand[]][], kilit = false): JestOlay[] {
  const j = new HaberJest(); j.H = 1080; j.kilitGerekli = kilit;
  return kareler.flatMap(([now, h]) => j.update(h, now, []));
}
/** Avucu 0,7 sn sabit göster (kilitlenir) */
const kilitle = (id: string, t0: number, p: P = { x: 800, y: 500 }): [number, TrackedHand[]][] =>
  [0, 100, 200, 300, 400, 500, 600, 700].map(dt => [t0 + dt, [el(id, 'acik', t0, p)]]);

t('🤏 tut ve yana sürükle: tut → sürükle (yer değiştirme) → bırak (hız); çekme yok', () => {
  const o = oynat([
    [0, [el('a', 'cimdik', 0, { x: 800, y: 500 })]],
    [33, [el('a', 'cimdik', 0, { x: 760, y: 502 })]],
    [66, [el('a', 'cimdik', 0, { x: 600, y: 505 })]],
    [100, [el('a', 'acik', 100, { x: 560, y: 505 }, 120, { x: -900, y: 0 })]],
  ]);
  esit(tipler(o), ['tut', 'surukle', 'birak']);
  const s = o.find(x => x.tip === 'surukle') as Extract<JestOlay, { tip: 'surukle' }>;
  esit([s.dx, s.dy], [-200, 5]);
  esit((o.at(-2) as Extract<JestOlay, { tip: 'birak' }>).vx, -900, 'bırakış hızı');
});
t('küçük titreme sürükleme sayılmaz; yerinde el büyürse çek', () => {
  const o = oynat([
    [0, [el('a', 'cimdik', 0, { x: 800, y: 500 }, 120)]],
    [33, [el('a', 'cimdik', 0, { x: 810, y: 506 }, 125)]],
    [66, [el('a', 'cimdik', 0, { x: 812, y: 510 }, 145)]],
  ]);
  esit(tipler(o), ['tut', 'cek']);
});
t('🤏🤏 elleri aç: canlı oran, eşikte bir kez yakınlaş (açmaya devam etse de); bırakınca zoomBitti', () => {
  const o = oynat([
    [0, [el('a', 'cimdik', 0, { x: 800, y: 500 }), el('b', 'cimdik', 0, { x: 1000, y: 500 })]],
    [33, [el('a', 'cimdik', 0, { x: 760, y: 500 }), el('b', 'cimdik', 0, { x: 1040, y: 500 })]],
    [66, [el('a', 'cimdik', 0, { x: 740, y: 500 }), el('b', 'cimdik', 0, { x: 1060, y: 500 })]],
    [100, [el('a', 'cimdik', 0, { x: 730, y: 500 }), el('b', 'cimdik', 0, { x: 1070, y: 500 })]],
    [133, []],
  ]);
  const zoom = o.filter(x => x.tip === 'zoom').map(x => +(x as { oran: number }).oran.toFixed(2));
  esit(zoom, [1, 1.4, 1.6, 1.7], 'oran');
  esit(o.filter(x => x.tip === 'yakinlas').length, 1);
  esit(tipler(o).at(-1), 'zoomBitti');
});
t('bir tutuşta bir seviye; bırakıp yeniden tutunca bir seviye daha', () => {
  const ac = (t0: number): [number, TrackedHand[]][] => [
    [t0, [el('a', 'cimdik', t0, { x: 850, y: 500 }), el('b', 'cimdik', t0, { x: 950, y: 500 })]],
    [t0 + 400, [el('a', 'cimdik', t0, { x: 700, y: 500 }), el('b', 'cimdik', t0, { x: 1100, y: 500 })]],
    [t0 + 1500, [el('a', 'cimdik', t0, { x: 500, y: 500 }), el('b', 'cimdik', t0, { x: 1300, y: 500 })]],
  ];
  esit(oynat(ac(0)).filter(x => x.tip === 'yakinlas').length, 1, 'tek tutuş');
  esit(oynat([...ac(0), [1600, []], ...ac(1700)]).filter(x => x.tip === 'yakinlas').length, 2, 'iki tutuş');
});
t('🤏🤏 elleri yaklaştır: uzaklaş', () => {
  const o = oynat([
    [0, [el('a', 'cimdik', 0, { x: 600, y: 500 }), el('b', 'cimdik', 0, { x: 1100, y: 500 })]],
    [50, [el('a', 'cimdik', 0, { x: 760, y: 500 }), el('b', 'cimdik', 0, { x: 1000, y: 500 })]],
  ]);
  esit(o.filter(x => x.tip === 'uzaklas').length, 1);
});
t('🤏🤏 terazi: ters yönde salınım iddia kontrolü, yakınlaştırma yok', () => {
  const o = oynat([
    [0, [el('a', 'cimdik', 0, { x: 700, y: 500 }), el('b', 'cimdik', 0, { x: 1000, y: 520 })]],
    [200, [el('a', 'cimdik', 0, { x: 700, y: 600 }), el('b', 'cimdik', 0, { x: 1000, y: 420 })]],
    [400, [el('a', 'cimdik', 0, { x: 700, y: 400 }), el('b', 'cimdik', 0, { x: 1000, y: 620 })]],
  ]);
  esit(o.filter(x => x.tip === 'terazi').length, 1);
  esit(o.filter(x => x.tip === 'yakinlas' || x.tip === 'uzaklas').length, 0);
});
t('✊→🖐 parmakları aç: kartı aç; çok kısa yumruk sayılmaz', () => {
  const ac = oynat([
    [0, [el('a', 'yumruk', 0, { x: 800, y: 500 })]],
    [300, [el('a', 'acik', 300, { x: 800, y: 500 })]],
  ]);
  esit(tipler(ac), ['ac']);
  const kisa = oynat([
    [0, [el('a', 'yumruk', 0, { x: 800, y: 500 })]],
    [80, [el('a', 'acik', 80, { x: 800, y: 500 })]],
  ]);
  esit(tipler(kisa), []);
});
t('açık eli yumruk yapmak tek başına bir şey yapmaz; 0,8 sn tutunca kapat; sonra açılınca kart yeniden açılmaz', () => {
  const o = oynat([
    [0, [el('a', 'acik', 0, { x: 800, y: 500 })]],
    [400, [el('a', 'yumruk', 400, { x: 800, y: 500 })]],
    [700, [el('a', 'yumruk', 400, { x: 800, y: 500 })]],
  ]);
  esit(tipler(o), [], 'yumruk yapılınca');
  const o2 = oynat([
    [0, [el('a', 'acik', 0, { x: 800, y: 500 })]],
    [400, [el('a', 'yumruk', 400, { x: 800, y: 500 })]],
    [1250, [el('a', 'yumruk', 400, { x: 800, y: 500 })]],
    [1400, [el('a', 'acik', 1400, { x: 800, y: 500 })]],
  ]);
  esit(tipler(o2), ['kapat']);
});
t('yumruk ne zaman yapılırsa yapılsın, 0,8 sn tutulunca kapatır (bir kez)', () => {
  const o = oynat([
    [0, [el('a', 'acik', 0, { x: 800, y: 500 })]],
    [100, [el('a', 'diger', 100, { x: 800, y: 500 })]],
    [900, [el('a', 'yumruk', 900, { x: 800, y: 500 })]],
    [1750, [el('a', 'yumruk', 900, { x: 800, y: 500 })]],
    [2600, [el('a', 'yumruk', 900, { x: 800, y: 500 })]],
  ]);
  esit(tipler(o), ['kapat']);
});

// ———————— Kilit ————————
t('kilitsiz el hiçbir şey tetiklemez: kadraja yarı kapalı giren el açılınca "aç" yok, çimdik "tut" yok', () => {
  const o = oynat([
    [0, [el('a', 'yumruk', 0, { x: 800, y: 500 })]],
    [300, [el('a', 'acik', 300, { x: 820, y: 500 }, 120, { x: 900, y: 0 })]],
    [500, [el('a', 'cimdik', 500, { x: 700, y: 500 })]],
    [700, [el('a', 'cimdik', 500, { x: 400, y: 500 })]],
  ], true);
  esit(tipler(o), []);
});
t('avuç 0,6 sn sabit: kilitlenir; sonra ✊→🖐 açar', () => {
  const o = oynat([
    ...kilitle('a', 0),
    [1200, [el('a', 'yumruk', 1200, { x: 800, y: 500 })]],
    [1500, [el('a', 'acik', 1500, { x: 800, y: 500 })]],
  ], true);
  esit(tipler(o), ['kilit', 'ac']);
});
t('hareket eden avuç kilitlenmez', () => {
  const o = oynat([0, 100, 200, 300, 400, 500, 600, 700, 800].map(t0 => [t0, [el('a', 'acik', 0, { x: 300 + t0, y: 500 }, 120, { x: 1000, y: 0 })]] as [number, TrackedHand[]]), true);
  esit(tipler(o), []);
});
t('kısa takip kopması kilidi bozmaz; 0,4 sn\'den uzun kayıp açar', () => {
  const o = oynat([
    ...kilitle('a', 0),
    [800, []],
    [1000, [el('a', 'cimdik', 1000, { x: 800, y: 500 })]],
    [1100, [el('a', 'acik', 1100, { x: 800, y: 500 })]],
    [1200, []],
    [1700, []],
  ], true);
  esit(tipler(o), ['kilit', 'tut', 'birak', 'kilit']);
  esit((o.filter(x => x.tip === 'kilit') as { acik: boolean }[]).map(x => x.acik), [true, false]);
});
t('kol aşağı inince kilit açılır', () => {
  const o = oynat([
    ...kilitle('a', 0),
    [800, [el('a', 'acik', 0, { x: 800, y: 1020 })]],
    [1300, [el('a', 'acik', 0, { x: 800, y: 1020 })]],
    [1400, [el('a', 'yumruk', 1400, { x: 800, y: 1020 })]],
  ], true);
  esit((o.filter(x => x.tip === 'kilit') as { acik: boolean }[]).map(x => x.acik), [true, false]);
  esit(tipler(o).filter(x => x !== 'kilit'), []);
});
t('iki elle yakınlaştırma için iki el de kilitli olmalı', () => {
  const ac: [number, TrackedHand[]][] = [
    [1000, [el('a', 'cimdik', 1000, { x: 850, y: 500 }), el('b', 'cimdik', 1000, { x: 950, y: 500 })]],
    [1300, [el('a', 'cimdik', 1000, { x: 600, y: 500 }), el('b', 'cimdik', 1000, { x: 1200, y: 500 })]],
  ];
  esit(oynat([...kilitle('a', 0, { x: 700, y: 500 }), ...ac], true).filter(x => x.tip === 'yakinlas').length, 0, 'tek el kilitli');
  const ikisi: [number, TrackedHand[]][] = [0, 100, 200, 300, 400, 500, 600, 700].map(dt => [dt, [el('a', 'acik', 0, { x: 700, y: 500 }), el('b', 'acik', 0, { x: 1000, y: 500 })]]);
  esit(oynat([...ikisi, ...ac], true).filter(x => x.tip === 'yakinlas').length, 1, 'iki el kilitli');
});

console.log(`${ok}/${ok + fail} haber jesti testi geçti`);
if (fail) throw new Error(`${fail} haber jesti testi başarısız`);
