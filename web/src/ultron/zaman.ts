// Ultron Paketi · Savaş Modu zaman çizelgesi (saf; DOM/WebGL yok, testlenebilir).
// Replik süreleri ses dosyalarından gelir; vuruşlar ve sonraki her şey buna göre kayar. Repliğe bağlı görsel olaylar
// replik başlangıcına bağlıdır (ses ile ±100 ms senkron yapı gereği). durum(t) aynı t için her zaman aynı sonucu verir.

export type Kim = 'ultron' | 'jarvis';
export interface Satir { id: string; vurus: number; kim: Kim; ton: string; metin: string; final?: 'A' | 'B'; ses?: string | null }
export interface ZamanDosyasi {
  ara: number; kuyruk: number;
  vuruslar: { no: number; ad: string; sure: number; replikler: Record<string, number> }[];
  olaylar: ({ vurus: number; final?: 'A' | 'B'; olay?: string; sfx?: string; muzik?: string; sekme?: string; kare?: string; metin?: string; butunluk?: number } & ({ t: number } | { satir: string; ofset: number }))[];
}
export interface PlanReplik { id: string; kim: Kim; ton: string; metin: string; vurus: number; bas: number; sure: number }
export interface PlanOlay { t: number; vurus: number; olay?: string; sfx?: string; muzik?: string; sekme?: string; kare?: string; metin?: string; butunluk?: number; satir?: string }
export interface Plan { final: 'A' | 'B'; toplam: number; vuruslar: { no: number; ad: string; bas: number; bit: number }[]; replikler: PlanReplik[]; olaylar: PlanOlay[] }

/** Ses yoksa (ElevenLabs kapalı) tahmini süre: Türkçe ~14 karakter/sn + üç nokta duraklamaları */
export const tahminiSure = (metin: string) => Math.max(1.2, metin.replace(/…/g, '').length / 14 + (metin.match(/…/g)?.length ?? 0) * 0.35);

/** Zaman çizelgesi: vuruş başı = önceki vuruşun sonu; replik = max(vuruş başı + bas, önceki replik sonu + ara) */
export function planKur(satirlar: Satir[], z: ZamanDosyasi, sureler: Record<string, number>, final: 'A' | 'B'): Plan {
  const s = new Map(satirlar.filter(x => !x.final || x.final === final).map(x => [x.id, x]));
  const vuruslar: Plan['vuruslar'] = [];
  const replikler: PlanReplik[] = [];
  let t = 0;
  for (const v of [...z.vuruslar].sort((a, b) => a.no - b.no)) {
    const bas = t;
    let son = bas;
    for (const [id, ofset] of Object.entries(v.replikler)) {
      const x = s.get(id);
      if (!x) continue; // diğer finalin repliği
      const r0 = Math.max(bas + ofset, replikler.length && son > bas ? son + z.ara : bas + ofset);
      const sure = sureler[id] ?? tahminiSure(x.metin);
      replikler.push({ id, kim: x.kim, ton: x.ton, metin: x.metin, vurus: v.no, bas: r0, sure });
      son = r0 + sure;
    }
    const bit = Math.max(bas + v.sure, son + z.kuyruk);
    vuruslar.push({ no: v.no, ad: v.ad, bas, bit });
    t = bit;
  }
  const olaylar: PlanOlay[] = [];
  for (const o of z.olaylar) {
    if (o.final && o.final !== final) continue;
    const v = vuruslar.find(x => x.no === o.vurus);
    if (!v) continue;
    let tt: number;
    if ('satir' in o) { const r = replikler.find(x => x.id === o.satir); if (!r) continue; tt = r.bas + o.ofset; }
    else tt = v.bas + o.t;
    const { vurus, ...geri } = o as any;
    delete geri.t; delete geri.ofset; delete geri.final;
    olaylar.push({ ...geri, vurus, t: tt });
  }
  olaylar.sort((a, b) => a.t - b.t);
  return { final, toplam: t, vuruslar, replikler, olaylar };
}

// ---------------------------------------------------------------- Sahne durumu

const kel = (x: number) => Math.min(1, Math.max(0, x));
/** 0..1 arası yumuşak geçiş */
export const yumusak = (a: number, b: number, x: number) => { const k = kel((x - a) / (b - a || 1e-6)); return k * k * (3 - 2 * k); };
export type SekmeAd = 'haber' | 'bekci' | 'ev' | 'toplanti';
export const SEKMELER: SekmeAd[] = ['haber', 'bekci', 'ev', 'toplanti'];

export interface Durum {
  t: number; vurus: number; vurusT: number; vurusIlerleme: number;
  karart: number;         // uygulamanın üstündeki karartma (0 açık, 1 kapkara)
  nokta: number;          // turuncu nokta görünürlüğü
  izgara: number;         // veri ızgarası
  reaktor: number;        // Jarvis reaktör parlaklığı (0 sönük, 1 tam)
  tarama: number;         // tarama ışını ilerlemesi (0..1; 0 yok)
  tunel: number;          // veri tüneli ilerlemesi (0..1); -1 kapalı
  dokunulan: Record<string, number>; // tünel kare türü → turuncuya dönme ilerlemesi (0..1)
  kureler: number;        // karşılaşma küreleri görünürlüğü
  kalkan: number;         // altıgen kalkan görünürlüğü
  catlak: number;         // kalkanın ele geçirilen oranı (0..1)
  reddedildi: number[];   // "ERİŞİM REDDEDİLDİ" damgalarının yaşı (sn), görünenler
  ark: number;            // elektrik ark'ı yoğunluğu
  sekme: Record<SekmeAd, { ele: number; glitch: number }>; // ele: 0..1 turuncu, glitch: 0..1 bozulma
  butunluk: number | null;// sistem bütünlüğü göstergesi (%), null = görünmez
  dagil: number;          // Jarvis parçacıklarının dağılıp emilmesi (0..1)
  reaktorSon: number;     // reaktörün sönmesi (0..1)
  kure: number;           // turuncu bulutun dünya küresine dönüşmesi (0..1) · Final A
  maviKivilcim: number;   // Final B: mavi kıvılcım (0..1)
  parolaBekle: boolean;   // Final B: parola bekleniyor
  uyari: { metin: string; yas: number } | null;
  tema: number;           // arayüzün turuncu temaya geçişi (0..1)
  flas: number;           // çöküşteki beyaz patlama (0..1)
  sarsinti: number;       // kamera sarsıntısı şiddeti (0..1)
  altyazi: { kim: Kim; metin: string } | null;
}

/** t anındaki sahne durumu (saf ve deterministik) */
export function durum(p: Plan, t: number): Durum {
  const v = p.vuruslar.find(x => t >= x.bas && t < x.bit) ?? (t < 0 ? p.vuruslar[0] : p.vuruslar[p.vuruslar.length - 1]);
  const vb = (no: number) => p.vuruslar.find(x => x.no === no)!;
  const olay = (ad: string) => p.olaylar.filter(o => o.olay === ad);
  const ilk = (ad: string) => olay(ad)[0]?.t ?? Infinity;
  const b = [0, ...[1, 2, 3, 4, 5, 6, 7].map(n => vb(n)?.bas ?? Infinity)];
  const bit7 = vb(7)?.bit ?? p.toplam;

  // Karartma: vuruş 1'de ekran kararır; tünel boyunca tam; karşılaşmada uygulama loş görünür (sekmeler görünsün)
  let karart = yumusak(0, 0.45, t);
  if (t >= b[4]) karart = 0.97 - 0.42 * yumusak(b[4], b[4] + 1.2, t);
  if (t >= b[6]) karart = 0.55 + 0.3 * yumusak(b[6], b[6] + 2.5, t);
  if (p.final === 'B' && t >= b[7]) karart = 0.85 * (1 - yumusak(ilk('maviKivilcim') + 0.4, ilk('maviKivilcim') + 3, t));

  const nokta = t < b[3] ? yumusak(ilk('nokta'), ilk('nokta') + 0.5, t) * (1 - yumusak(b[3] - 0.2, b[3] + 0.4, t)) : 0;
  const izgara = yumusak(ilk('izgara'), ilk('izgara') + 1.5, t) * (1 - yumusak(b[3], b[3] + 0.6, t));
  // Reaktör: başta sönük ışık; vuruş 2'de geri gelir; karşılaşmada küreye dönüşür, çöküşte söner
  let reaktor = 0.18;
  if (t >= ilk('reaktorGeri')) reaktor = 0.18 + 0.82 * yumusak(ilk('reaktorGeri'), ilk('reaktorGeri') + 0.6, t);
  if (t >= b[3]) reaktor = 1;
  const reaktorSon = yumusak(ilk('reaktorSon'), ilk('reaktorSon') + 1.4, t);
  if (p.final === 'B' && t >= ilk('maviKivilcim')) reaktor = yumusak(ilk('maviKivilcim'), ilk('maviKivilcim') + 1.5, t);

  const tarama = t >= ilk('tarama') && t < b[3] ? kel((t - ilk('tarama')) / Math.max(0.5, b[3] - ilk('tarama'))) : 0;
  const tunel = t >= b[3] && t < b[4] + 0.8 ? kel((t - b[3]) / (b[4] - b[3])) : -1;
  const dokunulan: Record<string, number> = {};
  for (const o of olay('dokun')) dokunulan[o.kare!] = yumusak(o.t, o.t + 1.1, t);

  const kureler = t >= b[4] ? yumusak(b[4] + 0.2, b[4] + 1.4, t) : 0;
  const kalkan = yumusak(ilk('kalkan'), ilk('kalkan') + 0.5, t) * (1 - yumusak(ilk('reaktorSon') - 0.6, ilk('reaktorSon') + 0.2, t));
  const catlak = t >= b[5] ? kel((t - b[5]) / Math.max(1, b[6] - b[5])) : 0;
  const reddedildi = olay('reddedildi').map(o => t - o.t).filter(y => y >= 0 && y < 1.6);
  const ark = t >= b[5] && t < b[6] + 1.5 ? yumusak(b[5], b[5] + 0.8, t) * (1 - yumusak(b[6] + 0.3, b[6] + 1.5, t)) : 0;

  const sekme = {} as Durum['sekme'];
  for (const s of SEKMELER) {
    const al = olay('sekme').find(o => o.sekme === s)?.t ?? Infinity;
    const geri = olay('geriAl').find(o => o.sekme === s)?.t ?? Infinity;
    const ele = yumusak(al, al + 0.5, t) * (1 - yumusak(geri, geri + 0.5, t));
    const g1 = t >= al ? Math.max(0, 1 - (t - al) / 0.9) : 0;
    const g2 = t >= geri ? Math.max(0, 1 - (t - geri) / 0.7) : 0;
    sekme[s] = { ele, glitch: Math.max(g1, g2) };
  }
  // Bütünlük: vuruş 4'te %100 görünür; olaylardaki değerlere 0,4 sn'de iner
  let butunluk: number | null = null;
  if (t >= b[4] + 0.5 && !(p.final === 'A' && t >= b[7])) {
    butunluk = 100;
    for (const o of p.olaylar) if (o.butunluk != null && t >= o.t) {
      const k = yumusak(o.t, o.t + 0.4, t);
      butunluk = butunluk + (o.butunluk - butunluk) * k;
    }
  }
  const dagil = yumusak(ilk('dagil'), ilk('dagil') + 3.2, t);
  const kure = p.final === 'A' ? yumusak(ilk('kureyeDonus'), ilk('kureHazir') + 0.6, t) : 0;
  const maviKivilcim = p.final === 'B' ? yumusak(ilk('maviKivilcim'), ilk('maviKivilcim') + 2.4, t) : 0;
  const parolaBekle = p.final === 'B' && t >= b[7] && t < ilk('maviKivilcim');

  const u = olay('uyari').filter(o => t >= o.t && t < o.t + 4.5).at(-1);
  // Tema: sekmeler ele geçirildikçe; çöküşten sonra tüm arayüz turuncu. Final B'de geri döner.
  let tema = 0;
  const alinan = olay('sekme').filter(o => t >= o.t).length;
  tema = Math.max(alinan / 8, yumusak(b[6], b[6] + 2, t));
  if (p.final === 'B' && t >= b[7]) tema = 1 - yumusak(ilk('maviKivilcim') + 0.3, ilk('maviKivilcim') + 2.6, t);
  const flas = Math.max(t >= ilk('cokus') ? Math.max(0, 1 - (t - ilk('cokus')) / 0.7) : 0, p.final === 'B' && t >= ilk('maviKivilcim') + 1.2 ? Math.max(0, 0.6 - (t - ilk('maviKivilcim') - 1.2) / 0.8) : 0);
  const sarsinti = Math.max(ark * 0.5, t >= ilk('cokus') ? Math.max(0, 1 - (t - ilk('cokus')) / 1.6) : 0, ...olay('sekme').map(o => (t >= o.t ? Math.max(0, 0.6 - (t - o.t)) : 0)));
  const r = p.replikler.find(x => t >= x.bas && t < x.bas + x.sure);
  void bit7;
  return {
    t, vurus: v.no, vurusT: t - v.bas, vurusIlerleme: kel((t - v.bas) / (v.bit - v.bas)),
    karart, nokta, izgara, reaktor: reaktor * (1 - reaktorSon), tarama, tunel, dokunulan, kureler, kalkan, catlak, reddedildi, ark, sekme,
    butunluk: butunluk == null ? null : Math.round(butunluk), dagil, reaktorSon, kure, maviKivilcim, parolaBekle,
    uyari: u ? { metin: u.metin!, yas: t - u.t } : null, tema, flas, sarsinti, altyazi: r ? { kim: r.kim, metin: r.metin } : null,
  };
}

// ---------------------------------------------------------------- Tohumlu rastgele

/** mulberry32: aynı tohum → aynı dizi (render(t) determinizmi için) */
export function tohumlu(tohum: number) {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** Tam sayıdan tekrarlanabilir 0..1 (zamana bağlı titreşimler: hash(floor(t·fps), i)) */
export const karma = (a: number, b = 0) => {
  let x = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};
