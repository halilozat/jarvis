// Gece Gökyüzü · sahne: çözülmüş fotoğrafın WCS'i + katalog + gezegenler → fotoğraf pikselinde işaretler.
// Her şey katalogdan ya da hesaptan gelir. annotations (astrometry.net'in kendi listesi) varsa sapma ölçülür.
import { yildizAdi, type Katalog, type Yildiz } from './katalog';
import { gokCisimleri, yildizUfuk, type GokCismi, type Konum } from './gezegen';
import { isikHesapla, olayEsle, type Isik, type OlayEsi } from './isik';
import { aciUzaklik, gokPiksel, pikselGok, type Wcs } from './wcs';

export interface SahneYildiz {
  hip: number;
  ad: string;
  /** Yaygın adı var mı (etiket önceliği) */
  adli: boolean;
  tanim: string;
  tk: string;
  tkAd: string;
  x: number;
  y: number;
  kadir: number;
  renk: number | null;
  ra: number;
  dec: number;
  isik: Isik | null;
  olay: OlayEsi | null;
}

export interface SahneCisim extends GokCismi { x: number; y: number }

export interface SahneTakim { id: string; ad: string; segmentler: [number, number, number, number][]; etiket: { x: number; y: number } }

export interface Sahne {
  w: number;
  h: number;
  cekim: string;
  konum: Konum;
  merkez: { ra: number; dec: number };
  /** Görüş alanı (derece): genişlik ve yükseklik */
  alan: [number, number];
  yildizlar: SahneYildiz[];
  takimyildizlar: SahneTakim[];
  /** Ufkun üstünde ve kadrajda */
  cisimler: SahneCisim[];
  /** Kadrajın dışında ama ufkun üstünde olanlar ("bu gece hangi gezegenler görünüyor" için) */
  gorunenCisimler: GokCismi[];
  kaynak: string;
}

const icinde = (p: { x: number; y: number }, w: number, h: number, pay = 0) => p.x >= -pay && p.y >= -pay && p.x <= w + pay && p.y <= h + pay;

export function sahneKur(o: { wcs: Wcs; katalog: Katalog; cekim: Date; konum: Konum; kadirSiniri?: number }): Sahne {
  const { wcs, katalog, cekim, konum } = o;
  const { w, h } = wcs;
  const sinir = o.kadirSiniri ?? 4.5;
  const tkAd = (id: string) => katalog.takimyildizlar[id]?.ad ?? id;

  const yildizlar: SahneYildiz[] = [];
  for (const y of katalog.yildizlar) {
    if (y.kadir > sinir) continue;
    const p = gokPiksel(wcs, y.ra, y.dec);
    if (!p || !icinde(p, w, h)) continue;
    const isik = isikHesapla(y, cekim);
    yildizlar.push({
      hip: y.hip, ad: yildizAdi(y), adli: !!y.ad, tanim: y.tanim, tk: y.tk, tkAd: tkAd(y.tk), x: p.x, y: p.y,
      kadir: y.kadir, renk: y.renk, ra: y.ra, dec: y.dec, isik, olay: isik ? olayEsle(isik, katalog.olaylar) : null,
    });
  }
  yildizlar.sort((a, b) => a.kadir - b.kadir);

  const takimyildizlar: SahneTakim[] = [];
  for (const t of Object.values(katalog.takimyildizlar)) {
    const seg: SahneTakim['segmentler'] = [];
    const icNokta: { x: number; y: number }[] = [];
    for (const c of t.cizgiler) {
      const pts = c.map(([ra, dec]) => gokPiksel(wcs, ra, dec));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (!a || !b) continue;
        const ai = icinde(a, w, h), bi = icinde(b, w, h);
        if (!ai && !bi) continue;
        // Kadrajın çok dışına uzanan uç (projeksiyonun kenarı) çizgiyi bozar
        if (!icinde(a, w, h, Math.max(w, h)) || !icinde(b, w, h, Math.max(w, h))) continue;
        seg.push([a.x, a.y, b.x, b.y]);
        if (ai) icNokta.push(a);
        if (bi) icNokta.push(b);
      }
    }
    if (seg.length < 2) continue;
    const ex = icNokta.reduce((s, p) => s + p.x, 0) / icNokta.length, ey = icNokta.reduce((s, p) => s + p.y, 0) / icNokta.length;
    takimyildizlar.push({ id: t.id, ad: t.ad, segmentler: seg, etiket: { x: ex, y: ey } });
  }
  takimyildizlar.sort((a, b) => b.segmentler.length - a.segmentler.length);

  const tum = gokCisimleri(cekim, konum);
  const gorunenCisimler = tum.filter(c => c.irtifa > 0);
  const cisimler: SahneCisim[] = [];
  for (const c of gorunenCisimler) {
    const p = gokPiksel(wcs, c.ra, c.dec);
    if (p && icinde(p, w, h)) cisimler.push({ ...c, x: p.x, y: p.y });
  }

  const m = pikselGok(wcs, w / 2, h / 2);
  const sol = pikselGok(wcs, 0, h / 2), sag = pikselGok(wcs, w, h / 2), ust = pikselGok(wcs, w / 2, 0), alt = pikselGok(wcs, w / 2, h);
  return {
    w, h, cekim: cekim.toISOString(), konum, merkez: m,
    alan: [aciUzaklik(sol.ra, sol.dec, sag.ra, sag.dec), aciUzaklik(ust.ra, ust.dec, alt.ra, alt.dec)],
    yildizlar, takimyildizlar, cisimler, gorunenCisimler, kaynak: katalog.kaynak,
  };
}

/** astrometry.net annotations ("bright" yıldızlar; pixelx/pixely FITS kuralıyla 1 tabanlı) */
export interface Annotation { type: string; names: string[]; pixelx: number; pixely: number; vmag?: number }

/** Annotation adındaki Yunan harfi + takımyıldız ("α Sco / 21 Sco") ya da özel adla eşleştir */
export function annotationBul(y: Pick<Yildiz, 'ad' | 'tanim'> & { tk: string }, an: Annotation[]): Annotation | null {
  for (const a of an) {
    if (a.type !== 'bright') continue;
    const adlar = a.names.flatMap(n => n.split('/').map(s => s.trim()));
    if (y.tanim && adlar.includes(y.tanim)) return a;
    if (y.ad && adlar.some(n => n.toLocaleLowerCase('en') === y.ad.toLocaleLowerCase('en'))) return a;
  }
  return null;
}

export function sapmaOlc(sahne: Sahne, an: Annotation[]): { eslesen: number; ortanca: number; enBuyuk: number } | null {
  const farklar: number[] = [];
  for (const y of sahne.yildizlar) {
    const a = annotationBul(y, an);
    // annotations FITS pikseliyle (1 tabanlı) gelir; sahne 0 tabanlı
    if (a) farklar.push(Math.hypot(a.pixelx - 1 - y.x, a.pixely - 1 - y.y));
  }
  if (!farklar.length) return null;
  farklar.sort((a, b) => a - b);
  return { eslesen: farklar.length, ortanca: farklar[farklar.length >> 1], enBuyuk: farklar[farklar.length - 1] };
}

export { yildizUfuk };
