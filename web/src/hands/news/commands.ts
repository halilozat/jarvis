// Haber Modu · sesli komut eşleştirici (yerelde; sunucuya gitmez). Metin uzay komutlarındaki gibi sadeleştirilir.
// "Haber modunu aç/kapat", "günümü özetle" ve "… hakkında haber getir" her yerden çalışır; diğerleri haber modu açıkken.
// Aramada anahtar kelime cümlenin aslından alınır (Türkçe harfler ve büyük harf korunur: "İran", "asgari ücret").
import { fold } from '../space/commands';
import type { Kategori } from './types';

export type HaberCmd =
  | { tip: 'haber'; ac: boolean }
  | { tip: 'sabah' }
  | { tip: 'kategori'; kategori: Kategori }
  | { tip: 'konu'; q: string }
  /** Anahtar kelimeyle haber getir: internette (kendi kaynaklar, dünya basını, arşiv, Google News) aranır */
  | { tip: 'ara'; q: string }
  /** Açık olayın dünya basınında nasıl verildiği */
  | { tip: 'dunya' }
  // Haber merkezi komutları
  | { tip: 'yayin'; ac: boolean }
  | { tip: 'sonDakika' }
  | { tip: 'mansetler' }
  | { tip: 'dunyaBugun' }
  | { tip: 'basin' }
  | { tip: 'takip'; ac: boolean }
  | { tip: 'duvar' }
  /** Haber duvarında numaralı kutuyu aç */
  | { tip: 'numara'; n: number }
  | { tip: 'sonraki' }
  | { tip: 'onceki' }
  | { tip: 'ozetle' }
  | { tip: 'detay' }
  | { tip: 'karsilastir' }
  | { tip: 'kontrol' }
  | { tip: 'sorular' }
  | { tip: 'geri' };

const has = (t: string, re: RegExp) => re.test(t);

/** Sadeleştirilmiş sorgunun cümlenin aslındaki karşılığı; bulunamazsa sadeleştirilmiş hâli */
function asli(text: string, q: string): string {
  const kel = text.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  const kf = kel.map(w => fold(w).trim());
  const qf = q.split(' ');
  for (let i = 0; i + qf.length <= kf.length; i++) if (qf.every((w, j) => kf[i + j] === w)) return kel.slice(i, i + qf.length).join(' ');
  return q;
}
/** Konu değil: "son haberleri getir", "bugünün haberlerini bul" */
const GENEL = /^(son|yeni|guncel|onemli|tum|butun|bugunun|bugunku|gunun|sabahin|aksamin|en son|en yeni|diger|baska|daha fazla)$/;
/** Sorgunun başındaki dolgu kelimeleri */
const DOLGU = /^(?:(?:bana|peki|simdi|bugun|bir|internet(?:te|ten)?|webde|haberlerde)\s+)+/;

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
  // "haber modu", "haber merkezi" ya da "haber ajansı"
  if (has(t, /\bhaber (mod|merkez|ajans)\w*/)) {
    if (has(t, /\b(kapat|kapa|cik|bitir)/)) return { tip: 'haber', ac: false };
    return { tip: 'haber', ac: true };
  }
  if (has(t, /\bhaber ?merkezi\w*/) || t === 'haberler' || has(t, /^haberlere (gec|bak)/)) return { tip: 'haber', ac: true };
  // Sabah özeti
  if (has(t, /\b(gunumu|gunu|sabahi|bugunumu) (ozetle|ozet|anlat)\w*|\bsabah ozeti\w*|\bgunun ozeti\w*/)) return { tip: 'sabah' };
  // Dünya basını ("basın ne diyor" basın özetinden önce: "yabancı basın ne diyor" dünya basınıdır)
  if (has(t, /\b(dunya|yabanci|uluslararasi|dis) basin\w*|\bdunya (bunu |bu haberi )?nasil (verdi|gordu|yazdi|anlatti|duydu)/)) return { tip: 'dunya' };
  // Haber merkezi komutları
  if (has(t, /\b(yayini|bulteni|canli yayini) (bitir|kapat|sonlandir|kes)\w*|\byayindan cik\w*/)) return { tip: 'yayin', ac: false };
  if (has(t, /\bcanli yayin\w*|\byayina (gir|gec|basla|cik)\w*|\bana haber\w*|\bhaber bulteni\w*|\bbulteni (baslat|ac|ver|oku)\w*|\bbulten (baslasin|zamani)/)) return { tip: 'yayin', ac: true };
  if (has(t, /^son dakika\b|\bson dakika (ne var|haberi|var mi|gelisme)\w*|\bson gelisme\w* (ne|neler)\b/)) return { tip: 'sonDakika' };
  if (has(t, /\bmansetleri (ver|goster|oku|say|getir|sirala)\w*|\bgunun mansetleri\w*|\bmansetler(de)? neler\b|\bilk on haber\w*/)) return { tip: 'mansetler' };
  if (has(t, /\bdunyada (bugun )?(ne oldu|neler oldu|ne oluyor|neler oluyor|neler var)\b|\bdunya gundemi\w*|\bdunyayi (goster|tara)\w*/)) return { tip: 'dunyaBugun' };
  if (has(t, /\bbasin ozeti\w*|\bgazeteler(de)? ne (diyor|yaziyor|var)\b|\bkim neyi manset\w*|\bbasin (ne diyor|turu)\b/)) return { tip: 'basin' };
  if (has(t, /\b(takibi|takipten) (birak|cik|kaldir|sil)\w*|\btakip etmeyi birak\w*|\bartik takip etme\b/)) return { tip: 'takip', ac: false };
  if (has(t, /\b(bunu|bu haberi|bu olayi|haberi|olayi) takip (et|edelim|eder misin)\b|\btakibe al\w*|\btakip listesine ekle\w*|\bgelisme olursa (haber ver|soyle)\b/)) return { tip: 'takip', ac: true };
  if (has(t, /\bekrani (bol|dokuza bol|parcala)\w*|\bcoklu ekran\w*|\b(video|haber) duvari\w*|\bdokuz (haber|ekran)\w*/)) return { tip: 'duvar' };
  const no = /^(?:(\d)|(bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz)|(birinci|ikinci|ucuncu|dorduncu|besinci|altinci|yedinci|sekizinci|dokuzuncu)(?:yu|yi|su)?)\s*(?:numara\w*|nolu)?\s*(?:haberi\s+|kutuyu\s+)?(?:ac|goster|buyut)\w*$/.exec(t);
  if (no) {
    const SAY = ['bir', 'iki', 'uc', 'dort', 'bes', 'alti', 'yedi', 'sekiz', 'dokuz'], SIRA = ['birinci', 'ikinci', 'ucuncu', 'dorduncu', 'besinci', 'altinci', 'yedinci', 'sekizinci', 'dokuzuncu'];
    const n = no[1] ? Number(no[1]) : no[2] ? SAY.indexOf(no[2]) + 1 : SIRA.indexOf(no[3]) + 1;
    if (n >= 1 && n <= 9) return { tip: 'numara', n };
  }
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
    const q = k[1].replace(DOLGU, '').trim();
    const kat = KATEGORI.find(([, re]) => re.test(q) && q.split(' ').length <= 2);
    if (kat) return { tip: 'kategori', kategori: kat[0] };
    if (q.length >= 3) return { tip: 'konu', q: asli(text, q) };
  }
  // "[konu] hakkında haber getir", "bana [konu] haberlerini bul", "internette [konu] haberlerini tara", "[konu] haberi ara"
  const a = /^(.+?)\s+(?:(?:hakkinda|ile ilgili|konusunda|uzerine)\s+)?(?:son\s+|yeni\s+)?(?:haber|haberler|haberleri|haberlerini|haberi)\s+(?:getir|bul|ara|tara|ver|cikar|topla)\w*/.exec(t)
    ?? /^(?:internette|internetten|webde|haberlerde)\s+(.+?)\s+(?:ara|tara|bul)\w*$/.exec(t)
    ?? /^haber\s+(?:ara|tara|bul)\w*\s+(.+)$/.exec(t);
  if (a) {
    const q = a[1].replace(DOLGU, '').replace(/\s+(hakkinda|ile ilgili|konusunda)$/, '').trim();
    const kat = KATEGORI.find(([, re]) => re.test(q) && q.split(' ').length <= 2);
    if (kat) return { tip: 'kategori', kategori: kat[0] };
    if (q.length >= 2 && !GENEL.test(q)) return { tip: 'ara', q: asli(text, q) };
  }
  // "[kategori] haberlerini göster"
  if (has(t, /\bhaber\w*/) && has(t, /\b(goster|getir|ac|gec|bak|neler)\w*/)) {
    const kat = KATEGORI.find(([, re]) => re.test(t));
    if (kat) return { tip: 'kategori', kategori: kat[0] };
  }
  return null;
}
