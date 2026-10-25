// Haber Modu · olay kümeleri: farklı kaynakların aynı olayı anlatan haberleri tek kümede.
// Benzerlik: başlık (ağırlık 2) ve özetin başı (ağırlık 1) kelime kökleri; nadir kelimeler daha çok sayılır (idf).
// Türkçe ekler için kelimenin ilk 5 harfi kök sayılır ("depremde", "depremin" → "depre").
import crypto from 'node:crypto';
import type { Kategori } from './newsSources.js';
import type { NewsItem } from './types.js';

const DURAK = new Set(
  ('için olarak sonra daha kadar ilgili açıklama yaptı haber haberi dakika bugün yeni ancak gibi olan oldu olduğu ' +
    'büyük önce şöyle dedi göre ayrıca ifade belirtti sözleri verdi geldi gelen ettı etti eden edilen edildi ' +
    'yıllık türkiye türk tarafından üzerine sırasında itibaren hakkında karşı arasında içinde bütün tüm çok her ' +
    'sonrası nedeniyle şekilde açıkladı açıklamada bildirdi yaşandı yaşanan başladı devam ediyor oluyor olacak ' +
    'video foto izle canlı flaş gelişme gelişmesi işte neler nasıl neden kimdir nedir').split(' '),
);

export const fold = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9 ]+/g, ' ');

/** Kelime kökleri (4+ harfli, durak kelimeler hariç) */
let durakF: Set<string> | null = null;
export function kokler(s: string): string[] {
  const durak = (durakF ??= new Set([...DURAK].map(w => fold(w).trim())));
  return fold(s).split(/\s+/).filter(w => w.length >= 4 && !durak.has(w) && !/^\d+$/.test(w)).map(w => w.slice(0, 5));
}

export interface KumeHaber extends NewsItem {}

export interface Kume {
  id: string;
  kategori: Kategori;
  /** Kümeyi temsil eden başlık: en çok kaynağın verdiği kümede en erken haberin başlığı */
  baslik: string;
  haberler: KumeHaber[];
  /** Farklı kaynak adları */
  kaynaklar: string[];
  ilk: string;
  son: string;
  kokler: string[];
  foto: string | null;
}

/** Kümenin kalıcı kimliği: en erken haberin bağlantısından (yeni haber eklense de değişmez) */
const kimlik = (h: NewsItem) => 'k' + crypto.createHash('sha1').update(h.url || h.title).digest('hex').slice(0, 10);

type Agirlik = Map<string, number>;

// Özel adlar (büyük harfle başlayan kelimeler): iki haberin özel adları varsa ve hiç ortak değilse farklı olaylardır
// ("Fransa'da silahlı saldırı" ↔ "Ürdün'de silahlı saldırı"). Sık geçen unvan ve genel kelimeler sayılmaz.
const GENEL_AD = new Set(['son', 'dakika', 'bakan', 'bakani', 'baskan', 'baskani', 'cumhu', 'turki', 'video', 'canli', 'flas', 'ozel', 'haber', 'resmi', 'genel', 'yeni', 'ilk']);
function ozelAdlar(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/(?<![\p{L}])\p{Lu}[\p{L}]{2,}/gu)) {
    const k = fold(m[0]).trim().slice(0, 5);
    if (k.length >= 3 && !GENEL_AD.has(k)) out.add(k);
  }
  return out;
}

function agirliklar(h: NewsItem): Agirlik {
  const m: Agirlik = new Map();
  for (const k of kokler(h.title)) m.set(k, (m.get(k) ?? 0) + 2);
  for (const k of kokler(h.summary.slice(0, 220))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

/**
 * Haberleri olaylara göre kümele. esik: benzerlik eşiği (0..1).
 * Bir haber, kümenin ilk haberine ya da kümedeki herhangi bir haberine yeterince benziyorsa kümeye girer.
 */
export function kumele(items: NewsItem[], esik = 0.42): Kume[] {
  const liste = [...items].sort((a, b) => a.published_at.localeCompare(b.published_at));
  const vek = liste.map(agirliklar);
  const adlar = liste.map(h => ozelAdlar(`${h.title} ${h.summary.slice(0, 220)}`));
  // Belge sıklığı: çok haberde geçen kök az sayılır
  const df = new Map<string, number>();
  for (const v of vek) for (const k of v.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const N = liste.length || 1;
  const idf = (k: string) => Math.log(1 + N / (df.get(k) ?? 1));
  const toplam = vek.map(v => [...v].reduce((s, [k, w]) => s + w * idf(k), 0));
  const benzer = (i: number, j: number) => {
    const A = vek[i], B = vek[j];
    let ortak = 0, n = 0;
    for (const [k, w] of A) {
      const w2 = B.get(k);
      if (w2) { ortak += Math.min(w, w2) * idf(k); n++; }
    }
    // En az iki ortak kök: tek ortak özel ad ("Ankara") yetmez
    if (n < 2) return 0;
    const a1 = adlar[i], a2 = adlar[j];
    if (a1.size && a2.size && ![...a1].some(x => a2.has(x))) return 0;
    return ortak / Math.max(1e-9, Math.min(toplam[i], toplam[j]));
  };
  const kumeler: number[][] = [];
  for (let i = 0; i < liste.length; i++) {
    let enIyi = -1, skor = esik;
    for (let c = 0; c < kumeler.length; c++) {
      const uyeler = kumeler[c];
      // Aynı kaynağın iki haberi aynı kümede olabilir (güncelleme), ama karşılaştırma için kaynak başına biri seçilir
      let s = 0;
      for (const j of uyeler) s = Math.max(s, benzer(i, j));
      if (s > skor) { skor = s; enIyi = c; }
    }
    if (enIyi >= 0) kumeler[enIyi].push(i);
    else kumeler.push([i]);
  }
  return kumeler.map(uyeler => {
    const haberler = uyeler.map(i => liste[i]);
    // Kaynak başına bir haber: en yenisi (güncellenmiş hâli)
    const kaynakBasi = new Map<string, NewsItem>();
    for (const h of haberler) {
      const v = kaynakBasi.get(h.source);
      if (!v || h.published_at > v.published_at) kaynakBasi.set(h.source, h);
    }
    const secili = [...kaynakBasi.values()].sort((a, b) => a.published_at.localeCompare(b.published_at));
    const sayac = new Map<Kategori, number>();
    for (const h of secili) sayac.set(h.category as Kategori, (sayac.get(h.category as Kategori) ?? 0) + 1);
    const kategori = [...sayac].sort((a, b) => b[1] - a[1] || (a[0] === 'gundem' ? 1 : -1))[0]?.[0] ?? 'gundem';
    const kok = new Map<string, number>();
    for (const i of uyeler) for (const [k, w] of vek[i]) kok.set(k, (kok.get(k) ?? 0) + w);
    return {
      id: kimlik(haberler[0]),
      kategori,
      baslik: secili[0].title,
      haberler: secili,
      kaynaklar: secili.map(h => h.source),
      ilk: secili[0].published_at,
      son: secili[secili.length - 1].published_at,
      kokler: [...kok].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k]) => k),
      foto: secili.find(h => h.image_url)?.image_url ?? null,
    };
  });
}

/** Gündem sırası: daha çok kaynağın verdiği önce, eşitse daha yeni olan */
export const gundemSirasi = (a: Kume, b: Kume) => b.kaynaklar.length - a.kaynaklar.length || b.son.localeCompare(a.son);

/** İki kök kümesinin benzerliği (arşivde "daha önce" araması için) */
export function kokBenzerligi(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  const ortak = a.filter(k => B.has(k)).length;
  return ortak / Math.min(a.length, b.length);
}
