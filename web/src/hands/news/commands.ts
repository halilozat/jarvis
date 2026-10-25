// Haber Modu · sesli komut eşleştirici (yerelde; sunucuya gitmez). Metin uzay komutlarındaki gibi sadeleştirilir.
// "Haber modunu aç/kapat" ve "günümü özetle" her yerden çalışır; diğerleri haber modu açıkken.
import { fold } from '../space/commands';
import type { Kategori } from './types';

export type HaberCmd =
  | { tip: 'haber'; ac: boolean }
  | { tip: 'sabah' }
  | { tip: 'kategori'; kategori: Kategori }
  | { tip: 'konu'; q: string }
  | { tip: 'sonraki' }
  | { tip: 'onceki' }
  | { tip: 'ozetle' }
  | { tip: 'detay' }
  | { tip: 'karsilastir' }
  | { tip: 'kontrol' }
  | { tip: 'sorular' }
  | { tip: 'geri' };

const has = (t: string, re: RegExp) => re.test(t);

const KATEGORI: [Kategori, RegExp][] = [
  ['ekonomi', /\b(ekonomi|piyasa|finans|borsa)\w*/],
  ['dunya', /\b(dunya|dis haber|uluslararasi)\w*/],
  ['spor', /\b(spor|futbol|mac)\w*/],
  ['teknoloji', /\b(teknoloji|tekno)\w*/],
  ['bilim', /\b(bilim|saglik|uzay haber)\w*/],
  ['gundem', /\b(gundem|turkiye|son dakika)\w*/],
];

/** Haber Modu komutu; yoksa null */
export function matchNewsCommand(text: string): HaberCmd | null {
  const t = fold(text).replace(/^(hey |ok )?(jarvis|carvis|cervis|jarvi|jarviz)\b\s*/, '');
  if (!t) return null;
  // Mod
  if (has(t, /\bhaber (mod|merkez)\w*/)) {
    if (has(t, /\b(kapat|kapa|cik|bitir)/)) return { tip: 'haber', ac: false };
    return { tip: 'haber', ac: true };
  }
  if (has(t, /\bhaber ?merkezi\w*/) || t === 'haberler' || has(t, /^haberlere (gec|bak)/)) return { tip: 'haber', ac: true };
  // Sabah özeti
  if (has(t, /\b(gunumu|gunu|sabahi|bugunumu) (ozetle|ozet|anlat)\w*|\bsabah ozeti\w*|\bgunun ozeti\w*/)) return { tip: 'sabah' };
  // Sorulmamış sorular
  if (has(t, /\b(ne|neler|hangi sorular?) (sorulmamis|sorulmadi|sorulmuyor)|\bsorulmamis soru\w*|\bkimsenin sormadig\w*/)) return { tip: 'sorular' };
  // İddia kontrolü
  if (has(t, /\b(bunu|bu iddiayi|bu haberi|iddiayi|iddialari) (kontrol|dogrula|teyit)\w*|\bbu (dogru|gercek) mu\b|\bdogru mu bu\b|\bgercekten oyle mi\b/)) return { tip: 'kontrol' };
  // Karşılaştırma
  if (has(t, /\b(bu haberi|haberi|bunu|kaynaklari) (karsilastir|kiyasla)\w*|\bkimler nasil (verdi|vermis|yazdi|anlatti)\b|\bkaynak karsilastirma\w*/)) return { tip: 'karsilastir' };
  // Özetle / detay
  if (has(t, /\b(bu haberi|haberi|bunu) (ozetle|ozetler misin|anlat|oku)\w*/)) return { tip: 'ozetle' };
  if (has(t, /\b(detayini|detaylarini|ayrintisini|ayrintilarini|icini) (ac|goster)\w*|\bhaberi ac\b|\bdetay\w* ac/)) return { tip: 'detay' };
  // Gezinme
  if (has(t, /^(sonraki|siradaki|ileri|bir sonraki)( haber)?\w*$|\bsonraki haber\w*|\bsiradaki haber\w*/)) return { tip: 'sonraki' };
  if (has(t, /^(onceki|geri git)( haber)?\w*$|\bonceki haber\w*/)) return { tip: 'onceki' };
  if (has(t, /^(geri don|ana ekrana don|karti kapat|kapat)$|\bkarti kapat\b/)) return { tip: 'geri' };
  // "[konu] hakkında ne var?"
  const k = /^(.+?) (hakkinda|ile ilgili|konusunda) (ne var|neler var|haber var mi|ne diyorlar|ne oldu)\w*/.exec(t);
  if (k) {
    const q = k[1].replace(/^(peki|bana|bugun)\s+/, '').trim();
    const kat = KATEGORI.find(([, re]) => re.test(q) && q.split(' ').length <= 2);
    if (kat) return { tip: 'kategori', kategori: kat[0] };
    if (q.length >= 3) return { tip: 'konu', q };
  }
  // "[kategori] haberlerini göster"
  if (has(t, /\bhaber\w*/) && has(t, /\b(goster|getir|ac|gec|bak|neler)\w*/)) {
    const kat = KATEGORI.find(([, re]) => re.test(t));
    if (kat) return { tip: 'kategori', kategori: kat[0] };
  }
  return null;
}
