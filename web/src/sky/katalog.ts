// Gece Gökyüzü · katalog verisi (web/public/gok/*.json; scripts/gok-katalog.mjs üretir). Saf: tarayıcıda fetch ile,
// testte dosyadan okunur. İsimler ve sayılar yalnızca buradan gelir; model hiçbirini üretmez.

export interface Yildiz {
  hip: number;
  /** J2000, derece */
  ra: number;
  dec: number;
  kadir: number;
  /** Hipparcos yeni indirgeme paralaksı ve hatası (mas) */
  paralaks: number | null;
  paralaksHata: number | null;
  /** B−V renk ölçüsü */
  renk: number | null;
  /** Takımyıldız kısaltması (IAU) */
  tk: string;
  /** Yaygın ad (IAU ya da Türkçe), yoksa boş */
  ad: string;
  /** Bayer/Flamsteed tanımı (α Lyr) */
  tanim: string;
}

export interface Takimyildiz { id: string; ad: string; la: string; merkez: [number, number]; cizgiler: [number, number][][] }

export interface Olay { yil: number; ad: string; iken: string; oldu: string; yaklasik?: boolean }

export interface Katalog { yildizlar: Yildiz[]; takimyildizlar: Record<string, Takimyildiz>; olaylar: Olay[]; kaynak: string }

export function katalogKur(y: { alanlar: string[]; yildizlar: unknown[][]; kaynak: string }, t: { takimyildizlar: Record<string, Omit<Takimyildiz, 'id'>>; kaynak: string }, o: { olaylar: Olay[] }): Katalog {
  const i = (k: string) => y.alanlar.indexOf(k);
  const [ih, ir, id, ik, ip, ie, ic, it, ia, itn] = ['hip', 'ra', 'dec', 'kadir', 'paralaks', 'paralaksHata', 'renk', 'takimyildiz', 'ad', 'tanim'].map(i);
  return {
    yildizlar: y.yildizlar.map(r => ({
      hip: r[ih] as number, ra: r[ir] as number, dec: r[id] as number, kadir: r[ik] as number,
      paralaks: r[ip] as number | null, paralaksHata: r[ie] as number | null, renk: r[ic] as number | null,
      tk: r[it] as string, ad: r[ia] as string, tanim: r[itn] as string,
    })),
    takimyildizlar: Object.fromEntries(Object.entries(t.takimyildizlar).map(([k, v]) => [k, { id: k, ...v }])),
    olaylar: [...o.olaylar].sort((a, b) => a.yil - b.yil),
    kaynak: `${y.kaynak} · takımyıldız çizgileri: ${t.kaynak}`,
  };
}

let yuklenen: Promise<Katalog> | null = null;
/** Tarayıcıda: /gok/*.json (PWA önbelleğine alınmaz, ilk açılışta indirilir) */
export function katalogYukle(): Promise<Katalog> {
  const al = (f: string) => fetch(`/gok/${f}`).then(r => { if (!r.ok) throw new Error(`${f} yüklenemedi`); return r.json(); });
  return (yuklenen ??= Promise.all([al('yildizlar.json'), al('takimyildizlar.json'), al('olaylar.json')])
    .then(([y, t, o]) => katalogKur(y, t, o))
    .catch(e => { yuklenen = null; throw e; }));
}

/** Ekranda gösterilecek ad: yaygın ad, yoksa Bayer tanımı, yoksa HIP numarası */
export const yildizAdi = (y: Yildiz) => y.ad || y.tanim || `HIP ${y.hip}`;

/** B−V → yaklaşık yıldız rengi (yalnızca görsel) */
export function yildizRengi(bv: number | null): string {
  const t = Math.max(-0.4, Math.min(2, bv ?? 0.6));
  if (t < 0) return '#a9c8ff';
  if (t < 0.3) return '#d6e4ff';
  if (t < 0.6) return '#fff6e8';
  if (t < 1.0) return '#ffe2b0';
  if (t < 1.4) return '#ffc58a';
  return '#ffa26b';
}
