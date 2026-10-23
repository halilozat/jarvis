// Uzay Laboratuvarı · gerçek veriler. Bu dosyadaki her sayı bir kaynağa dayanır; ekranda gösterilen ve Jarvis'in
// söylediği bütün sayılar buradan ya da bunlardan yapılan hesaplardan (physics.ts) gelir.
//
// Kaynaklar:
//  [N]  NASA NSSDCA Planetary Fact Sheet (metrik): https://nssdc.gsfc.nasa.gov/planetary/factsheet/
//       kütle, çap → ortalama yarıçap (bireysel bilgi sayfaları), yüzey çekimi, kaçış hızı, gün uzunluğu,
//       yörünge dönemi, Güneş'e uzaklık, ortalama sıcaklık, Bond albedosu, yoğunluk, atmosfer bileşimi
//  [NS] NSSDCA Sun Fact Sheet: Güneş kütlesi 1.988.500 ×10²⁴ kg, yarıçap 695.700 km, etkin sıcaklık 5772 K
//  [K]  Kopparapu ve ark. 2013, ApJ 765:131 (2014 düzeltmesiyle): Güneş için tutucu yaşanabilir bölge,
//       iç sınır "nemli sera" 0,99 AU, dış sınır "en büyük sera" 1,70 AU
//  [S]  Uydular: NASA JPL SSD "Planetary Satellite Physical Parameters" (https://ssd.jpl.nasa.gov/sats/phys_par/) ve
//       "Planetary Satellite Mean Elements" (yörünge yarıçapı, dönem); yüzey sıcaklıkları NASA uydu sayfaları
//       (science.nasa.gov); Titan: Huygens HASI 93,7 K ve 1,47 bar (Fulchignoni 2005), GCMS yüzeye yakın metan
//       %5,65 (Niemann 2005). Uyduların iç katmanları modeldir (≈); Titan'ınki tartışmalıdır (Petricca 2025, Nature).
//  [I]  İç yapı: NASA gezegen sayfaları (science.nasa.gov) ve InSight (Mars çekirdeği ≈1.830 km, Stähler 2021).
//       Gaz ve buz devlerinin iç katman sınırları modellere göre değişir; ekranda "≈" ile gösterilir.
//
// Basitleştirme: atmosferin ısıtması (sera farkı) gezegen nereye taşınırsa taşınsın sabit kabul edilir.

export type Gezegen = 'merkur' | 'venus' | 'dunya' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptun';
/** Yaşam adayı uydular (laboratuvarda gezegenlerine yakınlaşınca görünür) */
export type Uydu = 'europa' | 'ganymede' | 'enceladus' | 'titan';
export const UYDULAR: Uydu[] = ['europa', 'ganymede', 'enceladus', 'titan'];
/** Laboratuvardaki bütün gövdeler (Güneş hariç) */
export type Cisim = Gezegen | 'ay' | Uydu;
export const GEZEGENLER: Gezegen[] = ['merkur', 'venus', 'dunya', 'mars', 'jupiter', 'saturn', 'uranus', 'neptun'];

export interface Katman { ad: string; /** dış sınırı, yarıçapın kesri */ r: number; renk: string }

export interface GovdeVeri {
  ad: string;
  /** İyelik ekli ad: "Dünya'nın" */
  adIn: string;
  /** Kütle (10²⁴ kg) [N] */
  kutle: number;
  /** Ortalama yarıçap (km) [N] */
  yaricap: number;
  /** Yüzey çekimi (m/s²) [N] */
  cekim: number;
  /** Kaçış hızı (km/s) [N] */
  kacis: number;
  /** Gün uzunluğu, Güneş'ten Güneş'e (saat) [N] */
  gun: number;
  /** Yörünge dönemi (gün) [N] */
  yil: number;
  /** Güneş'e ortalama uzaklık (10⁶ km) [N] */
  uzaklik: number;
  /** Ortalama sıcaklık (°C) [N]; gaz devlerinde 1 bar düzeyinde */
  sicaklik: number;
  /** Bond albedosu [N] */
  albedo: number;
  /** Ortalama yoğunluk (kg/m³) [N] */
  yogunluk: number;
  /** Yüzey basıncı (bar) [N]; gaz devlerinde yüzey yok */
  basinc: number | null;
  /** Atmosfer bileşimi, hacimce % [N] */
  atmosfer: [string, number][];
  /** İç katmanlar, içten dışa [I] */
  katmanlar: Katman[];
  /** Katı yüzeyi var mı (yüzey hâlleri: buz, su, kaynama, kızgın kaya) */
  kaya: boolean;
}

export const VERI: Record<Cisim, GovdeVeri> = {
  merkur: {
    ad: 'Merkür', adIn: "Merkür'ün", kutle: 0.330, yaricap: 2440, cekim: 3.7, kacis: 4.3, gun: 4222.6, yil: 88.0, uzaklik: 57.9,
    sicaklik: 167, albedo: 0.068, yogunluk: 5429, basinc: 0, atmosfer: [],
    katmanlar: [{ ad: 'Demir çekirdek', r: 0.83, renk: '#c9873e' }, { ad: 'Manto', r: 0.985, renk: '#8a5a3c' }, { ad: 'Kabuk', r: 1, renk: '#9a9a9a' }],
    kaya: true,
  },
  venus: {
    ad: 'Venüs', adIn: "Venüs'ün", kutle: 4.87, yaricap: 6052, cekim: 8.9, kacis: 10.4, gun: 2802.0, yil: 224.7, uzaklik: 108.2,
    sicaklik: 464, albedo: 0.77, yogunluk: 5243, basinc: 92, atmosfer: [['CO₂', 96.5], ['N₂', 3.5]],
    katmanlar: [{ ad: 'Demir-nikel çekirdek', r: 0.5, renk: '#d9903f' }, { ad: 'Manto', r: 0.99, renk: '#9a5232' }, { ad: 'Kabuk', r: 1, renk: '#c8a070' }],
    kaya: true,
  },
  dunya: {
    ad: 'Dünya', adIn: "Dünya'nın", kutle: 5.97, yaricap: 6371, cekim: 9.8, kacis: 11.2, gun: 24.0, yil: 365.2, uzaklik: 149.6,
    sicaklik: 15, albedo: 0.306, yogunluk: 5514, basinc: 1.014, atmosfer: [['N₂', 78.08], ['O₂', 20.95], ['Ar', 0.93], ['CO₂', 0.04]],
    katmanlar: [
      { ad: 'İç çekirdek (katı demir-nikel)', r: 0.192, renk: '#ffe08a' },
      { ad: 'Dış çekirdek (sıvı)', r: 0.546, renk: '#f2a33a' },
      { ad: 'Manto', r: 0.995, renk: '#c4562e' },
      { ad: 'Kabuk', r: 1, renk: '#6f8f5a' },
    ],
    kaya: true,
  },
  mars: {
    ad: 'Mars', adIn: "Mars'ın", kutle: 0.642, yaricap: 3390, cekim: 3.7, kacis: 5.0, gun: 24.7, yil: 687.0, uzaklik: 228.0,
    sicaklik: -65, albedo: 0.25, yogunluk: 3934, basinc: 0.006, atmosfer: [['CO₂', 95.1], ['N₂', 2.59], ['Ar', 1.94], ['O₂', 0.16], ['CO', 0.06]],
    katmanlar: [{ ad: 'Sıvı demir çekirdek', r: 0.54, renk: '#e0973e' }, { ad: 'Manto', r: 0.985, renk: '#a24a2a' }, { ad: 'Kabuk', r: 1, renk: '#c0704a' }],
    kaya: true,
  },
  jupiter: {
    ad: 'Jüpiter', adIn: "Jüpiter'in", kutle: 1898, yaricap: 69911, cekim: 23.1, kacis: 59.5, gun: 9.9, yil: 4331, uzaklik: 778.5,
    sicaklik: -110, albedo: 0.343, yogunluk: 1326, basinc: null, atmosfer: [['H₂', 89.8], ['He', 10.2]],
    katmanlar: [
      { ad: 'Seyreltik çekirdek (≈)', r: 0.3, renk: '#b07a4a' },
      { ad: 'Metalik hidrojen', r: 0.8, renk: '#8b9bb0' },
      { ad: 'Moleküler hidrojen-helyum', r: 1, renk: '#d8b48a' },
    ],
    kaya: false,
  },
  saturn: {
    ad: 'Satürn', adIn: "Satürn'ün", kutle: 568, yaricap: 58232, cekim: 9.0, kacis: 35.5, gun: 10.7, yil: 10747, uzaklik: 1432.0,
    sicaklik: -140, albedo: 0.342, yogunluk: 687, basinc: null, atmosfer: [['H₂', 96.3], ['He', 3.25]],
    katmanlar: [
      { ad: 'Kaya-buz çekirdek (≈)', r: 0.2, renk: '#a07850' },
      { ad: 'Metalik hidrojen', r: 0.5, renk: '#8f9caa' },
      { ad: 'Moleküler hidrojen-helyum', r: 1, renk: '#e6cf9a' },
    ],
    kaya: false,
  },
  uranus: {
    ad: 'Uranüs', adIn: "Uranüs'ün", kutle: 86.8, yaricap: 25362, cekim: 8.7, kacis: 21.3, gun: 17.2, yil: 30589, uzaklik: 2867.0,
    sicaklik: -195, albedo: 0.3, yogunluk: 1270, basinc: null, atmosfer: [['H₂', 82.5], ['He', 15.2], ['CH₄', 2.3]],
    katmanlar: [
      { ad: 'Kaya çekirdek (≈)', r: 0.2, renk: '#8a7060' },
      { ad: 'Su-amonyak-metan "buzu" (sıcak akışkan)', r: 0.75, renk: '#4f9fb0' },
      { ad: 'Hidrojen-helyum-metan', r: 1, renk: '#a8e0e8' },
    ],
    kaya: false,
  },
  neptun: {
    ad: 'Neptün', adIn: "Neptün'ün", kutle: 102, yaricap: 24622, cekim: 11.0, kacis: 23.5, gun: 16.1, yil: 59800, uzaklik: 4515.0,
    sicaklik: -200, albedo: 0.29, yogunluk: 1638, basinc: null, atmosfer: [['H₂', 80.0], ['He', 19.0], ['CH₄', 1.5]],
    katmanlar: [
      { ad: 'Kaya çekirdek (≈)', r: 0.25, renk: '#7a6a62' },
      { ad: 'Su-amonyak-metan "buzu" (sıcak akışkan)', r: 0.8, renk: '#3a6fb8' },
      { ad: 'Hidrojen-helyum-metan', r: 1, renk: '#6f9cf0' },
    ],
    kaya: false,
  },
  ay: {
    ad: 'Ay', adIn: "Ay'ın", kutle: 0.073, yaricap: 1737, cekim: 1.6, kacis: 2.4, gun: 708.7, yil: 27.3, uzaklik: 0.384,
    sicaklik: -20, albedo: 0.11, yogunluk: 3344, basinc: 0, atmosfer: [],
    katmanlar: [
      { ad: 'Katı iç çekirdek', r: 0.138, renk: '#f0d080' },
      { ad: 'Sıvı dış çekirdek', r: 0.19, renk: '#e09a40' },
      { ad: 'Kısmen erimiş katman', r: 0.276, renk: '#c06a3a' },
      { ad: 'Manto', r: 0.976, renk: '#7a6a62' },
      { ad: 'Kabuk', r: 1, renk: '#b0b0b0' },
    ],
    kaya: true,
  },
  // Uydular [S]. Gün uzunluğu = yörünge dönemi (gelgit kilidi). Uzaklık: gezegenine (10⁶ km). Albedo ≈ (Bond).
  europa: {
    ad: 'Europa', adIn: "Europa'nın", kutle: 0.048, yaricap: 1560.8, cekim: 1.315, kacis: 2.03, gun: 85.2, yil: 3.551, uzaklik: 0.6711,
    sicaklik: -171, albedo: 0.68, yogunluk: 3013, basinc: 0, atmosfer: [],
    katmanlar: [
      { ad: 'Demir çekirdek (≈)', r: 0.38, renk: '#d9903f' },
      { ad: 'Kaya manto', r: 0.92, renk: '#8a5a3c' },
      { ad: 'Tuzlu su okyanusu (≈100 km)', r: 0.988, renk: '#2f7fe0' },
      { ad: 'Buz kabuğu (≈15-25 km)', r: 1, renk: '#e8eef5' },
    ],
    kaya: true,
  },
  ganymede: {
    ad: 'Ganymede', adIn: "Ganymede'in", kutle: 0.1482, yaricap: 2634.1, cekim: 1.428, kacis: 2.74, gun: 171.7, yil: 7.155, uzaklik: 1.0704,
    sicaklik: -163, albedo: 0.43, yogunluk: 1942, basinc: 0, atmosfer: [],
    katmanlar: [
      { ad: 'Demir çekirdek (≈)', r: 0.27, renk: '#d9903f' },
      { ad: 'Kaya manto', r: 0.53, renk: '#8a5a3c' },
      { ad: 'Yüksek basınçlı buz', r: 0.905, renk: '#9fb6c8' },
      { ad: 'Tuzlu su okyanusu (≈)', r: 0.943, renk: '#2f7fe0' },
      { ad: 'Buz kabuğu (≈150 km)', r: 1, renk: '#c8c4ba' },
    ],
    kaya: true,
  },
  enceladus: {
    ad: 'Enceladus', adIn: "Enceladus'un", kutle: 0.000108, yaricap: 252.1, cekim: 0.113, kacis: 0.239, gun: 32.9, yil: 1.37, uzaklik: 0.238,
    sicaklik: -198, albedo: 0.81, yogunluk: 1609, basinc: 0, atmosfer: [],
    katmanlar: [
      { ad: 'Gözenekli kaya çekirdek (≈)', r: 0.75, renk: '#8a6a52' },
      { ad: 'Tuzlu su okyanusu (≈)', r: 0.9, renk: '#2f7fe0' },
      { ad: 'Buz kabuğu (güney kutbunda ince)', r: 1, renk: '#f2f6fb' },
    ],
    kaya: true,
  },
  titan: {
    ad: 'Titan', adIn: "Titan'ın", kutle: 0.1345, yaricap: 2574.7, cekim: 1.352, kacis: 2.64, gun: 382.7, yil: 15.945, uzaklik: 1.2219,
    sicaklik: -179, albedo: 0.27, yogunluk: 1882, basinc: 1.47, atmosfer: [['N₂', 94.2], ['CH₄', 5.7], ['H₂', 0.1]],
    katmanlar: [
      { ad: 'Kaya çekirdek (≈)', r: 0.62, renk: '#8a6a52' },
      { ad: 'Yüksek basınçlı buz; okyanus mu, su cepleri mi (tartışmalı)', r: 0.88, renk: '#5f8fb8' },
      { ad: 'Buz kabuğu', r: 1, renk: '#d8b878' },
    ],
    kaya: true,
  },
};

/** Uyduların gezegeni ve yörüngesi [S]: yarıçap (km), dönem (gün) */
export const UYDU_YORUNGE: Record<Uydu | 'ay', { ebeveyn: Gezegen; a: number; P: number }> = {
  europa: { ebeveyn: 'jupiter', a: 671_100, P: 3.551 },
  ganymede: { ebeveyn: 'jupiter', a: 1_070_400, P: 7.155 },
  enceladus: { ebeveyn: 'saturn', a: 238_000, P: 1.37 },
  titan: { ebeveyn: 'saturn', a: 1_221_870, P: 15.945 },
  ay: { ebeveyn: 'dunya', a: 384_400, P: 27.32 },
};
/** Uydunun ya da Ay'ın gezegeni; gezegenlerde kendisi */
export const ebeveyn = (c: Cisim): Gezegen => (c in UYDU_YORUNGE ? UYDU_YORUNGE[c as Uydu | 'ay'].ebeveyn : (c as Gezegen));

// ------------------------------------------------------------------ Sabitler

/** Astronomi birimi (km), IAU 2012 */
export const AU_KM = 149_597_870.7;
/** Işığın 1 AU'yu geçme süresi (s) */
export const AU_ISIK_SN = 499.004_784;
/** Güneş kütlesi (10²⁴ kg) [NS] */
export const GUNES_KUTLE = 1_988_500;
/** Güneş yarıçapı (km) [NS] ve AU cinsinden */
export const GUNES_YARICAP_KM = 695_700;
export const GUNES_YARICAP_AU = GUNES_YARICAP_KM / AU_KM;
/** Güneş'in etkin yüzey sıcaklığı (K) [NS] */
export const GUNES_T = 5772;
/** Tutucu yaşanabilir bölge (AU) [K] */
export const YB_IC = 0.99;
export const YB_DIS = 1.70;
/** Suyun 1 bar'da donma ve kaynama noktası (°C) */
export const DONMA = 0;
export const KAYNAMA = 100;
/** Bu modelde yüzeyin "kızgın kaya" sayıldığı sıcaklık (°C, ≈ kayaların koyu kırmızı parlamaya başladığı düzey) */
export const KIZGIN = 450;

/** Kütle Güneş kütlesi cinsinden (fizik bu birimle çalışır) */
export const kutleGunes = (g: Cisim) => VERI[g].kutle / GUNES_KUTLE;
/** Güneş'e ortalama uzaklık (AU) */
export const ortUzaklikAU = (g: Gezegen) => (VERI[g].uzaklik * 1e6) / AU_KM;
