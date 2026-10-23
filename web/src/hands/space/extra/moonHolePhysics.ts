// Ekstra · Ay yerine kara delik: hesaplar (SI). Ay aynı yerde (384.400 km), yalnızca kütlesi değişen bir kara delik.
// Schwarzschild yarıçapı r_s = 2GM/c². Kütle aynıysa yörünge ve gelgit aynı kalır: ikisi de yalnızca kütleye ve
// uzaklığa bağlıdır. Gelgit: denge gelgiti (okyanus kabarmasının tepe-çukur farkı) 1,5·(M/M⊕)(R⊕/d)³R⊕. Ay için
// ≈0,54 m; kütle büyüyünce yaklaşım yalnızca bir mertebe göstergesidir. Parçalanma: katı cisim Roche sınırı
// d_R = R⊕(2M/M⊕)^⅓ (gelgit kuvveti Dünya'nın kendi çekimini aşar). Hawking sıcaklığı T = ħc³/(8πGMk_B);
// kozmik mikrodalga arka planı 2,7255 K'den soğuk kara delik ışıdığından fazlasını soğurur, buharlaşmaz.
// Einstein halkası (arka plandaki yıldız sonsuzda): θ_E = √(2 r_s / d).
// Kaynaklar: Ay ve Dünya kütleleri JPL SSD; Sagittarius A* 4,297×10⁶ M☉ (GRAVITY Collaboration 2022, A&A 657 L12);
// CMB 2,7255 K (Fixsen 2009, ApJ 707).

export const G = 6.674_30e-11;
export const C = 299_792_458;
const HBAR = 1.054_571_817e-34;
const KB = 1.380_649e-23;
export const CMB_K = 2.7255;

export const M_AY = 7.342e22;
export const M_DUNYA = 5.972_2e24;
export const M_JUPITER = 1.898_13e27;
export const M_GUNES = 1.988_47e30;
export const M_SGRA = 4.297e6 * M_GUNES;
/** Ay'ın ortalama uzaklığı (m) ve Dünya'nın yarıçapı (m) */
export const D = 384_400e3;
export const R_DUNYA = 6_371e3;
export const AY_GUN = 27.321_66;

export type KutleAd = 'ay' | 'dunya' | 'jupiter' | 'gunes' | 'sgra';
/** "büyüt" bu basamaklarda ilerler */
export const BASAMAK: { ad: KutleAd; M: number; etiket: string }[] = [
  { ad: 'ay', M: M_AY, etiket: 'AY' },
  { ad: 'dunya', M: M_DUNYA, etiket: 'DÜNYA' },
  { ad: 'jupiter', M: M_JUPITER, etiket: 'JÜPİTER' },
  { ad: 'gunes', M: M_GUNES, etiket: 'GÜNEŞ' },
  { ad: 'sgra', M: M_SGRA, etiket: 'SGR A*' },
];

/** Olay ufkunun yarıçapı (m) */
export const rs = (M: number) => (2 * G * M) / (C * C);
/** Kara deliğin Dünya çevresindeki dönemi (gün): ortak kütle merkezi çevresinde, toplam kütleyle */
export const donemGun = (M: number) => (2 * Math.PI * Math.sqrt(D ** 3 / (G * (M + M_DUNYA)))) / 86400;
/** Gelgit kuvveti bugünkü Ay'ınkinin kaç katı */
export const gelgitKat = (M: number) => M / M_AY;
/** Denge gelgiti: okyanus kabarmasının tepe-çukur farkı (m) */
export const gelgitM = (M: number) => 1.5 * (M / M_DUNYA) * (R_DUNYA / D) ** 3 * R_DUNYA;
/** Gelgit ivmesinin yüzey çekimine oranı (1'i geçince Dünya kendi kendini tutamaz) */
export const gelgitOran = (M: number) => 2 * (M / M_DUNYA) * (R_DUNYA / D) ** 3;
/** Ortak kütle merkezinin Dünya'nın merkezine uzaklığı (m) */
export const agirlikMerkezi = (M: number) => (D * M) / (M + M_DUNYA);
/** Katı cisim Roche sınırı (m) */
export const rocheM = (M: number) => R_DUNYA * Math.cbrt((2 * M) / M_DUNYA);
export const parcalanir = (M: number) => rocheM(M) > D;
/** Dünya'yı parçalayan en küçük kütle (kg) */
export const PARCALAMA_M = (0.5 * M_DUNYA * (D / R_DUNYA) ** 3);
/** Olay ufku Ay'ın yörüngesinden büyük: Dünya ufkun içinde */
export const ufukIcinde = (M: number) => rs(M) > D;
export const UFUK_M = (D * C * C) / (2 * G);
/** Hawking sıcaklığı (K) */
export const hawkingK = (M: number) => (HBAR * C ** 3) / (8 * Math.PI * G * M * KB);
/** Einstein halkasının açısal yarıçapı (yay saniyesi) */
export const einsteinSn = (M: number) => Math.sqrt((2 * rs(M)) / D) * (180 / Math.PI) * 3600;
/** Göreli yörünge hızı (km/s) */
export const yorungeHizi = (M: number) => Math.sqrt((G * (M + M_DUNYA)) / D) / 1000;

const tr = (v: number, d = 0) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** 3 anlamlı basamağa yakın, Türkçe */
export function yuvarla(v: number): string {
  if (v >= 1e12) return `${tr(v / 1e12, v < 1e13 ? 1 : 0)} trilyon`;
  if (v >= 1e9) return `${tr(v / 1e9, v < 1e10 ? 1 : 0)} milyar`;
  if (v >= 1e6) return `${tr(v / 1e6, v < 1e8 ? 1 : 0)} milyon`;
  if (v >= 1e4) return tr(Math.round(v / 100) * 100);
  if (v >= 100) return tr(v);
  if (v >= 10) return tr(v, v % 1 ? 1 : 0);
  return tr(v, v < 1 ? 2 : 1);
}

/** Kütleyi tanıdık bir cisimle söyle: "Ay kütlesi", "Dünya'nın 10 katı", "4,3 milyon Güneş" */
export function kutleSoz(M: number): string {
  const yakin = BASAMAK.find(b => Math.abs(Math.log10(M / b.M)) < 0.02);
  if (yakin) return yakin.ad === 'sgra' ? 'Sagittarius A* kütlesi' : `${yakin.ad === 'ay' ? 'Ay' : yakin.ad === 'dunya' ? 'Dünya' : yakin.ad === 'jupiter' ? 'Jüpiter' : 'Güneş'} kütlesi`;
  if (M < M_DUNYA) return `Ay'ın ${yuvarla(M / M_AY)} katı`;
  if (M < M_JUPITER) return `Dünya'nın ${yuvarla(M / M_DUNYA)} katı`;
  if (M < 0.05 * M_GUNES) return `Jüpiter'in ${yuvarla(M / M_JUPITER)} katı`;
  return `${yuvarla(M / M_GUNES)} Güneş kütlesi`;
}

/** Uzunluk (m): "0,22 milimetre", "5,6 metre", "12,7 milyon kilometre" */
export function uzunlukSoz(m: number): string {
  if (m < 1e-2) return `${tr(m * 1e3, m < 1e-3 ? 2 : 1)} milimetre`;
  if (m < 1) return `${tr(m * 100, 1)} santimetre`;
  if (m < 1000) return `${tr(m, 1)} metre`;
  return `${yuvarla(m / 1000)} kilometre`;
}

/** Olay ufkunun çapını tanıdık bir şeyle karşılaştır */
export function capKiyas(capM: number): string {
  if (capM < 1e-3) return 'bir kum tanesinden küçük';
  if (capM < 0.05) return 'bir misket kadar';
  if (capM < 30) return 'bir oda kadar';
  if (capM < 60e3) return 'bir ilçe kadar';
  if (capM < 1.39e9) return "Güneş'ten küçük";
  return `Güneş'in ${yuvarla(capM / 1.392_7e9)} katı`;
}
