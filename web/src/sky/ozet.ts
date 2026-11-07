// Gece Gökyüzü · sohbet isteğine giden ekran özeti (sunucuda gokyuzu aracı bundan hazır cümle kurar; server/src/gok.ts
// GokBaglam ile aynı biçim). Sayılar burada sesli okunacak biçime çevrilir; model hiçbirini hesaplamaz.
import { uzaklikSoz, yolaCikisSoz } from './isik';
import type { Sahne } from './sahne';

export type Kaynak = 'fotograf' | 'simulasyon' | 'ornek';

const YONLER = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];
/** Azimut (kuzeyden doğuya) → 8 yön */
export const yonAdi = (az: number) => YONLER[Math.round((((az % 360) + 360) % 360) / 45) % 8];

const sayi = (n: number) => Math.round(n).toLocaleString('tr-TR');

export function ozetKur(s: Sahne, o: { kaynak: Kaynak; yer: string; secili: number | string | null }) {
  return {
    kaynak: o.kaynak,
    cekim: s.cekim,
    yer: o.yer,
    alan: `${Math.round(s.alan[0])}×${Math.round(s.alan[1])}°`,
    yildizlar: s.yildizlar.slice(0, 60).map(y => ({
      hip: y.hip,
      ad: y.ad,
      tk: y.tkAd,
      kadir: y.kadir,
      uzaklik: y.isik ? uzaklikSoz(y.isik) : 'bilinmiyor',
      uzaklikIy: y.isik ? Math.round(y.isik.uzaklik * 10) / 10 : null,
      aralik: y.isik?.yaklasik ? (y.isik.aralik[1] === null ? `en az ${sayi(y.isik.aralik[0])} ışık yılı` : `${sayi(y.isik.aralik[0])} ile ${sayi(y.isik.aralik[1])} ışık yılı arasında`) : null,
      yaklasik: !!y.isik?.yaklasik,
      yolaCikis: y.isik ? yolaCikisSoz(y.isik) : 'bilinmiyor',
      olay: y.olay?.cumle ?? '',
      olayKisa: y.olay?.kisa ?? '',
    })),
    takimyildizlar: s.takimyildizlar.map(t => t.ad),
    gezegenler: s.gorunenCisimler.concat().sort((a, b) => a.kadir - b.kadir).map(c => ({
      id: c.id, ad: c.ad, irtifa: Math.round(c.irtifa * 10) / 10, yon: yonAdi(c.azimut), kadir: Math.round(c.kadir * 10) / 10,
      kadrajda: s.cisimler.some(x => x.id === c.id),
    })),
    secili: o.secili,
  };
}
