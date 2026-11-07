// Gece Gökyüzü · gezegenler ve Ay (katalogda yoklar): astronomy-engine 2.1.19 (MIT, VSOP87 / ELP; ≈1 yay dakikası).
// Fotoğrafa yansıtmak için gözlemciye göre (toposentrik) J2000 RA/Dec; ufuk testi için o günün ekvatoruyla irtifa.
import { Body, Equator, Horizon, HorizonFromVector, Illumination, Observer, RotateVector, Rotation_EQJ_HOR, VectorFromSphere, Spherical, MakeTime } from 'astronomy-engine';

export interface Konum { lat: number; lon: number; /** metre */ yukseklik?: number }

export interface GokCismi {
  id: 'merkur' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'ay';
  ad: string;
  /** J2000, derece (toposentrik) */
  ra: number;
  dec: number;
  /** Kırılma dahil irtifa ve azimut (derece; azimut kuzeyden doğuya) */
  irtifa: number;
  azimut: number;
  kadir: number;
  /** Dünya'dan uzaklık (AU) ve ışığın geliş süresi (dakika) */
  au: number;
  isikDk: number;
  /** Ay için aydınlanma oranı 0..1 */
  evre?: number;
}

const CISIMLER: [GokCismi['id'], Body, string][] = [
  ['merkur', Body.Mercury, 'Merkür'], ['venus', Body.Venus, 'Venüs'], ['mars', Body.Mars, 'Mars'],
  ['jupiter', Body.Jupiter, 'Jüpiter'], ['saturn', Body.Saturn, 'Satürn'], ['ay', Body.Moon, 'Ay'],
];

/** 1 AU ışık süresi (dakika) */
const AU_DK = 499.004784 / 60;

export function gokCisimleri(t: Date, k: Konum): GokCismi[] {
  const obs = new Observer(k.lat, k.lon, k.yukseklik ?? 0);
  return CISIMLER.map(([id, b, ad]) => {
    const j2000 = Equator(b, t, obs, false, true);
    const tarih = Equator(b, t, obs, true, true);
    const h = Horizon(t, obs, tarih.ra, tarih.dec, 'normal');
    const il = Illumination(b, t);
    return {
      id, ad, ra: j2000.ra * 15, dec: j2000.dec, irtifa: h.altitude, azimut: h.azimuth,
      kadir: il.mag, au: j2000.dist, isikDk: j2000.dist * AU_DK, ...(id === 'ay' ? { evre: il.phase_fraction } : {}),
    };
  });
}

/** Katalog yıldızı (J2000 RA/Dec) için irtifa/azimut: J2000 → o günün yatay koordinatı (presesyon + nütasyon + kırılma) */
export function yildizUfuk(ra: number, dec: number, t: Date, k: Konum): { irtifa: number; azimut: number } {
  const obs = new Observer(k.lat, k.lon, k.yukseklik ?? 0);
  const rot = Rotation_EQJ_HOR(MakeTime(t), obs);
  const v = RotateVector(rot, VectorFromSphere(new Spherical(dec, ra, 1), MakeTime(t)));
  const s = HorizonFromVector(v, 'normal');
  return { irtifa: s.lat, azimut: s.lon };
}

/** Tek dönüşüm matrisiyle çok yıldız (simülasyon modu her karede yüzlerce yıldız döndürür) */
export function ufukDonusturucu(t: Date, k: Konum): (ra: number, dec: number) => { irtifa: number; azimut: number } {
  const obs = new Observer(k.lat, k.lon, k.yukseklik ?? 0);
  const at = MakeTime(t);
  const rot = Rotation_EQJ_HOR(at, obs);
  return (ra, dec) => {
    const s = HorizonFromVector(RotateVector(rot, VectorFromSphere(new Spherical(dec, ra, 1), at)), 'normal');
    return { irtifa: s.lat, azimut: s.lon };
  };
}
