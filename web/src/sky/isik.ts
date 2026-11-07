// Gece Gökyüzü · ışık yolculuğu: Hipparcos paralaksından uzaklık, ışığın yola çıktığı yıl ve en yakın tarih olayı.
// Cümleler burada kalıptan kurulur (rakam ve isimler katalogdan/olay listesinden); model bunları yalnızca seslendirir.
import type { Olay, Yildiz } from './katalog';

/** 1 parsek = 3,26156 ışık yılı; paralaks mas → uzaklık = 1000/p parsek */
export const PC_IY = 3.26156;
/** Bu sınırların üstünde uzaklık "yaklaşık" gösterilir */
export const BELIRSIZ_ORAN = 0.2;
export const BELIRSIZ_IY = 300;

export interface Isik {
  /** Işık yılı (paralaksın merkezi değeri) */
  uzaklik: number;
  /** Paralaks ± hatasından gelen aralık; üst sınır yoksa null (paralaks hatası paralakstan büyük) */
  aralik: [number, number | null];
  /** Paralaks hatası / paralaks */
  goreliHata: number;
  yaklasik: boolean;
  /** Işığın yola çıktığı yıl (çekim yılı − uzaklık); aralık uzaklık aralığından */
  yil: number;
  yilAralik: [number | null, number];
}

export function isikHesapla(y: Pick<Yildiz, 'paralaks' | 'paralaksHata'>, cekim: Date): Isik | null {
  const p = y.paralaks, e = y.paralaksHata ?? 0;
  if (!p || p <= 0) return null;
  const uzaklik = (1000 / p) * PC_IY;
  const alt = (1000 / (p + e)) * PC_IY;
  const ust = p - e > 0 ? (1000 / (p - e)) * PC_IY : null;
  const goreliHata = e / p;
  const yilNow = cekim.getUTCFullYear() + (cekim.getUTCMonth() + 0.5) / 12;
  return {
    uzaklik,
    aralik: [alt, ust],
    goreliHata,
    yaklasik: goreliHata > BELIRSIZ_ORAN || uzaklik > BELIRSIZ_IY,
    yil: Math.floor(yilNow - uzaklik),
    yilAralik: [ust === null ? null : Math.floor(yilNow - ust), Math.floor(yilNow - alt)],
  };
}

export interface OlayEsi {
  olay: Olay;
  fark: number;
  aralikta: boolean;
  /** Tek başına cümle: "Bu ışık, İstanbul fethedilirken yola çıktı." */
  cumle: string;
  /** Yıl söylendikten sonra: "Tam o sıralarda İstanbul fethedildi." */
  kisa: string;
}

/** Olay listesi tarihçi yazımıyla (MÖ 44 = -44, sıfır yılı yok); hesap astronomik yılla (MÖ 1 = 0) */
export const astronomikYil = (y: number) => (y < 0 ? y + 1 : y);

/** Yola çıkış yılına en yakın olay ve hazır cümle */
export function olayEsle(i: Isik, olaylar: Olay[]): OlayEsi | null {
  if (!olaylar.length) return null;
  let en = olaylar[0];
  const a = (o: Olay) => astronomikYil(o.yil);
  for (const o of olaylar) if (Math.abs(a(o) - i.yil) < Math.abs(a(en) - i.yil)) en = o;
  const fark = a(en) - i.yil;
  const [lo, hi] = i.yilAralik;
  const aralikta = i.yaklasik && (lo === null || a(en) >= lo) && a(en) <= hi;
  let cumle: string, kisa: string;
  if (Math.abs(fark) <= 1) { cumle = `Bu ışık, ${en.iken} yola çıktı.`; kisa = `Tam o sıralarda ${en.oldu}.`; }
  else if (aralikta) { cumle = `Bu ışık, aşağı yukarı ${en.iken} yola çıktı.`; kisa = `Aşağı yukarı o yıllarda ${en.oldu}.`; }
  else if (fark > 0) { cumle = `Bu ışık yola çıktıktan ${fark} yıl sonra ${en.oldu}.`; kisa = `${fark} yıl sonra ${en.oldu}.`; }
  else { cumle = `Bu ışık yola çıktığında ${en.ad} ${-fark} yıl geride kalmıştı.`; kisa = `O sırada ${en.ad} ${-fark} yıl geride kalmıştı.`; }
  return { olay: en, fark, aralikta, cumle, kisa };
}

const sayi = (n: number) => Math.round(n).toLocaleString('tr-TR');
/** Astronomik yılı Türkçe yaz: 0 → "MÖ 1", -333 → "MÖ 334" */
export const yilYaz = (y: number) => (y <= 0 ? `MÖ ${sayi(1 - y)}` : String(y));
/** Olay listesindeki (tarihçi) yılı yaz */
export const olayYiliYaz = (y: number) => (y < 0 ? `MÖ ${sayi(-y)}` : String(y));

/** "25 ışık yılı" · "yaklaşık 500 ışık yılı (440–570)" */
export function uzaklikYaz(i: Isik): string {
  const yuvarla = (n: number) => (n < 100 ? Math.round(n * 10) / 10 : n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 50) * 50);
  const ana = `${yuvarla(i.uzaklik).toLocaleString('tr-TR')} ışık yılı`;
  if (!i.yaklasik) return ana;
  const [a, u] = i.aralik;
  return `yaklaşık ${ana} (${sayi(yuvarla(a))}–${u === null ? '?' : sayi(yuvarla(u))})`;
}

/** "1453" · "yaklaşık 1441 (1310–1530)" */
export function yolaCikisYaz(i: Isik): string {
  if (!i.yaklasik) return yilYaz(i.yil);
  const [lo, hi] = i.yilAralik;
  return `yaklaşık ${yilYaz(i.yil)} (${lo === null ? '?' : yilYaz(lo)}–${yilYaz(hi)})`;
}

/** Sesli okunacak uzaklık (parantezsiz): "25 ışık yılı" · "yaklaşık 500 ışık yılı" */
export function uzaklikSoz(i: Isik): string {
  const n = i.uzaklik < 100 ? Math.round(i.uzaklik * 10) / 10 : i.uzaklik < 1000 ? Math.round(i.uzaklik / 10) * 10 : Math.round(i.uzaklik / 50) * 50;
  return `${i.yaklasik ? 'yaklaşık ' : ''}${n.toLocaleString('tr-TR')} ışık yılı`;
}

/** Sesli okunacak yıl: "2001 yılında" · "yaklaşık 1528 yılında" */
export const yolaCikisSoz = (i: Isik) => `${i.yaklasik ? 'yaklaşık ' : ''}${yilYaz(i.yil)} yılında`;
