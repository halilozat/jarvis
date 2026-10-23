// Uzay Laboratuvarı · gezegenlerin gerçek konumları (astronomy-engine 2.1.19, MIT; VSOP87 tabanlı, ≈1 yay dakikası).
// astronomy-engine konumları Dünya ekvatoru çerçevesinde (EQJ) verir; laboratuvar ekliptik düzleminde çalışır
// (gezegenler bu düzleme yakın döner), bu yüzden her şey ekliptiğe (ECL) döndürülür.
import { Body as AB, GeoMoon, HelioState, JupiterMoons, RotateState, RotateVector, Rotation_EQJ_ECL, Vector } from 'astronomy-engine';
import { GEZEGENLER, UYDU_YORUNGE, kutleGunes, type Gezegen, type Uydu } from './data';
import { Sim, YIL_GUN } from './physics';

const ROT = Rotation_EQJ_ECL();

export const AE_GOVDE: Record<Gezegen, AB> = {
  merkur: AB.Mercury, venus: AB.Venus, dunya: AB.Earth, mars: AB.Mars,
  jupiter: AB.Jupiter, saturn: AB.Saturn, uranus: AB.Uranus, neptun: AB.Neptune,
};

export interface Durum3 { x: number; y: number; z: number; vx: number; vy: number; vz: number }

/** Güneş merkezli konum (AU) ve hız (AU/yıl), ekliptik çerçevede */
export function helio(g: Gezegen, date: Date): Durum3 {
  const s = RotateState(ROT, HelioState(AE_GOVDE[g], date));
  return { x: s.x, y: s.y, z: s.z, vx: s.vx * YIL_GUN, vy: s.vy * YIL_GUN, vz: s.vz * YIL_GUN };
}

/** Ay'ın Dünya'ya göre yönü (ekliptik düzleminde, radyan) ve uzaklığı (AU) */
export function ayYonu(date: Date): { aci: number; r: number } {
  const v = RotateVector(ROT, GeoMoon(date));
  return { aci: Math.atan2(v.y, v.x), r: Math.hypot(v.x, v.y, v.z) };
}

/** İndeks düzeni: 0 Güneş, 1..8 gezegenler (GEZEGENLER sırası) */
export const indeks = (g: Gezegen) => GEZEGENLER.indexOf(g) + 1;

/** O tarihteki gerçek Güneş sistemi: Güneş + 8 gezegen, kütle merkezi başlangıçta */
export function sistem(date: Date): Sim {
  const s = new Sim(GEZEGENLER.length + 1);
  s.m[0] = 1;
  GEZEGENLER.forEach((g, k) => {
    const i = k + 1, h = helio(g, date);
    s.m[i] = kutleGunes(g);
    s.x[i] = h.x; s.y[i] = h.y; s.z[i] = h.z;
    s.vx[i] = h.vx; s.vy[i] = h.vy; s.vz[i] = h.vz;
  });
  s.toBarycenter();
  return s;
}

/**
 * Uydunun gezegenine göre yönü (ekliptik düzleminde, radyan). Europa ve Ganymede gerçek (astronomy-engine,
 * Jüpiter uyduları); Enceladus ve Titan için astronomy-engine konum vermediğinden gerçek dönemle dairesel yörünge,
 * başlangıç açısı temsili ("≈ konum").
 */
export function uyduAcisi(u: Uydu, date: Date): { aci: number; yaklasik: boolean } {
  if (u === 'europa' || u === 'ganymede') {
    const s = JupiterMoons(date)[u];
    const v = RotateVector(ROT, new Vector(s.x, s.y, s.z, s.t));
    return { aci: Math.atan2(v.y, v.x), yaklasik: false };
  }
  const gun = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const f = gun / UYDU_YORUNGE[u].P;
  return { aci: (f - Math.floor(f)) * Math.PI * 2, yaklasik: true };
}
