// Haber Modu · anahtar kelimeyle haber arama. Sırayla taranır ve her adım canlı bildirilir (istemcideki "internet
// taranıyor" animasyonu yalnızca bu gerçek olaylarla ilerler):
//   1) Türk basını: 25 kaynağın son haberleri  2) dünya basını: 10 yayın (İngilizce sorguyla)
//   3) arşiv: son 90 günün olayları  4) Google News Türkçe ve İngilizce (başlık düzeyinde; metin okunmaz)
// Bulunanlar olaylara kümelenir; kümeler 2 saat bellekte durur (detay, analiz ve dünya basını açılabilsin).
import { arsivAra, arsivGunSayisi } from './newsArchive.js';
import { fold, kumele, type Kume } from './newsCluster.js';
import { FEEDS, newsSnapshot } from './news.js';
import type { Kategori } from './newsSources.js';
import type { NewsItem } from './types.js';
import { DUNYA_KAYNAKLARI, dunyaHaberleri, googleHaber, worldDeps, type GoogleHaber } from './worldNews.js';

export type Dil = 'tr' | 'en';
export type AramaOlay =
  | { tip: 'basla'; q: string; yayinlar: { ad: string; dil: Dil; konum: [number, number] }[]; arsivGun: number }
  | { tip: 'adim'; ad: string }
  /** Sorgunun İngilizcesi hazır (dünya basını ve Google News İngilizce bununla aranır) */
  | { tip: 'sorguEn'; qEn: string | null }
  | { tip: 'kaynak'; ad: string; dil: Dil; grup: 'kendi' | 'dunya' | 'arsiv' | 'google'; adet: number; konum: [number, number] | null }
  | { tip: 'baslik'; baslik: string; kaynak: string; saat: string; dil: Dil; foto: string | null }
  | { tip: 'bitti'; kumeler: Kume[]; sayac: { yayin: number; haber: number; olay: number; arsiv: number }; sure: number };

const ISTANBUL: [number, number] = [41.01, 28.98], ANKARA: [number, number] = [39.93, 32.86];
const trKonum = (ad: string): [number, number] => (/Anadolu|TRT/.test(ad) ? ANKARA : ISTANBUL);

/** Sorgu kelimeleri: her biri metinde bir kelimenin başında geçmeli (Türkçe ekler: "deprem" → "depremde") */
export function eslestirici(q: string): (metin: string) => boolean {
  const kel = fold(q).split(/\s+/).filter(w => w.length >= 2);
  if (!kel.length) return () => false;
  return metin => {
    const sozler = fold(metin).split(/\s+/);
    return kel.every(k => sozler.some(s => (k.length <= 3 ? s === k : s.startsWith(k))));
  };
}

/** Sorgunun İngilizce karşılığı (dünya basını ve Google News İngilizce için). Model yoksa ya da çeviremezse null. */
export async function ingilizce(q: string): Promise<string | null> {
  try {
    const t = await worldDeps.chat(`Translate this Turkish news search query into a short English news search query (keep proper nouns). Reply with the query only.\n${q}`);
    const s = t.replace(/["“”]/g, '').split('\n')[0].trim().slice(0, 80);
    return s && s.toLowerCase() !== q.toLowerCase() ? s : null;
  } catch { return null; }
}

const aramalar = new Map<string, { at: number; kume: Kume }>();
const ARAMA_MS = 2 * 3600_000;
export function aramaKumesi(id: string): Kume | null {
  const v = aramalar.get(id);
  return v && Date.now() - v.at < ARAMA_MS ? v.kume : null;
}

const googleItem = (g: GoogleHaber, i: number, kategori: Kategori): NewsItem =>
  ({ id: `g${i}`, title: g.baslik, summary: '', category: kategori, source: g.kaynak, published_at: g.saat, url: g.url, image_url: null });

export async function haberAra(q: string, bildir: (o: AramaOlay) => void): Promise<void> {
  const t0 = Date.now();
  const eslesir = eslestirici(q);
  const enP = ingilizce(q);
  const yayinlar = [
    ...[...new Set(FEEDS.map(f => f.source))].map(ad => ({ ad, dil: 'tr' as Dil, konum: trKonum(ad) })),
    ...DUNYA_KAYNAKLARI.map(k => ({ ad: k.ad, dil: 'en' as Dil, konum: k.konum })),
  ];
  // Çeviri modeli beklenmeden başlanır (Türk basını taranırken çeviri hazırlanır)
  bildir({ tip: 'basla', q, yayinlar, arsivGun: arsivGunSayisi() });
  const say = new Map<string, number>();
  const baslikBildir = (i: NewsItem, dil: Dil) => bildir({ tip: 'baslik', baslik: i.title, kaynak: i.source, saat: i.published_at, dil, foto: i.image_url });

  // 1) Türk basını
  bildir({ tip: 'adim', ad: 'Türk basını · 25 kaynak' });
  const { items } = await newsSnapshot();
  const trBulunan = items.filter(i => eslesir(`${i.title} ${i.summary}`));
  for (const ad of new Set(FEEDS.map(f => f.source))) {
    const adet = trBulunan.filter(i => i.source === ad).length;
    bildir({ tip: 'kaynak', ad, dil: 'tr', grup: 'kendi', adet, konum: trKonum(ad) });
    if (adet) say.set(ad, adet);
  }
  trBulunan.slice(0, 24).forEach(i => baslikBildir(i, 'tr'));

  // 2) Dünya basını (İngilizce sorguyla; çeviri yoksa özel adlar için Türkçe sorgu)
  const qEn = await enP;
  bildir({ tip: 'sorguEn', qEn });
  bildir({ tip: 'adim', ad: 'Dünya basını · 10 yayın' });
  const dunya = await dunyaHaberleri().catch(() => ({ items: [] as NewsItem[], calisan: [] as string[] }));
  const enEslesir = eslestirici(qEn ?? q);
  const enBulunan = dunya.items.filter(i => enEslesir(`${i.title} ${i.summary}`));
  for (const k of DUNYA_KAYNAKLARI) {
    const adet = enBulunan.filter(i => i.source === k.ad).length;
    bildir({ tip: 'kaynak', ad: k.ad, dil: 'en', grup: 'dunya', adet, konum: k.konum });
    if (adet) say.set(k.ad, adet);
  }
  enBulunan.slice(0, 16).forEach(i => baslikBildir(i, 'en'));

  // 3) Arşiv
  bildir({ tip: 'adim', ad: `Arşiv · ${arsivGunSayisi()} gün` });
  const guncelId = new Set(kumele(trBulunan).map(k => k.id));
  const arsiv = arsivAra(eslesir).filter(a => !guncelId.has(a.kume.id));
  bildir({ tip: 'kaynak', ad: 'Jarvis arşivi', dil: 'tr', grup: 'arsiv', adet: arsiv.length, konum: null });

  // 4) Google News (paralel)
  bildir({ tip: 'adim', ad: 'Google News · Türkçe ve İngilizce' });
  const [gTr, gEn] = await Promise.all([googleHaber(q, 'tr', 60).catch(() => []), googleHaber(qEn ?? q, 'en', 40).catch(() => [])]);
  const kendiKaynak = new Set(trBulunan.map(i => fold(i.source).trim()));
  const gTrYeni = gTr.filter(g => !kendiKaynak.has(fold(g.kaynak).trim()));
  for (const [dil, liste] of [['tr', gTrYeni], ['en', gEn]] as const) {
    const gruplar = new Map<string, number>();
    for (const g of liste) gruplar.set(g.kaynak, (gruplar.get(g.kaynak) ?? 0) + 1);
    for (const [ad, adet] of gruplar) { bildir({ tip: 'kaynak', ad, dil, grup: 'google', adet, konum: null }); say.set(`${dil}:${ad}`, adet); }
    liste.slice(0, 12).forEach(g => bildir({ tip: 'baslik', baslik: g.baslik, kaynak: g.kaynak, saat: g.saat, dil, foto: null }));
  }

  // Olaylar: Türkçe (kendi + Google), dünya (yayınlar + Google), arşiv
  bildir({ tip: 'adim', ad: 'Olaylar birleştiriliyor' });
  const trKume = kumele([...trBulunan, ...gTrYeni.map((g, i) => googleItem(g, i, 'gundem'))]).sort((a, b) => b.kaynaklar.length - a.kaynaklar.length || b.son.localeCompare(a.son));
  const enKume = kumele([...enBulunan, ...gEn.map((g, i) => googleItem(g, i + 1000, 'dunya'))]).map(k => ({ ...k, kategori: 'dunya' as Kategori }))
    .sort((a, b) => b.kaynaklar.length - a.kaynaklar.length || b.son.localeCompare(a.son));
  const arsivKume: Kume[] = arsiv.map(({ kume: a }) => ({
    id: a.id, kategori: a.kategori as Kategori, baslik: a.baslik, ilk: a.ilk, son: a.son, kokler: a.kokler, foto: null,
    kaynaklar: a.kaynaklar.map(s => s.ad),
    haberler: a.kaynaklar.map(s => ({ id: '', title: s.baslik, summary: s.ozet, category: a.kategori, source: s.ad, published_at: s.saat, url: s.url, image_url: null })),
  }));
  // Sıra: en çok kaynaklı güncel olaylar, sonra dünya, sonra arşiv; aralara karışık (karusel tek türden dolmasın)
  const kumeler: Kume[] = [];
  const kuyruk = [trKume, enKume, arsivKume];
  for (let i = 0; kumeler.length < 40 && kuyruk.some(l => i < l.length); i++) {
    for (const l of kuyruk) if (l[i] && kumeler.length < 40) kumeler.push(l[i]);
  }
  for (const k of kumeler) aramalar.set(k.id, { at: Date.now(), kume: k });
  if (aramalar.size > 400) for (const [id, v] of aramalar) if (Date.now() - v.at > ARAMA_MS) aramalar.delete(id);
  const yayin = new Set([...say.keys()].map(k => k.replace(/^(tr|en):/, ''))).size;
  bildir({ tip: 'bitti', kumeler, sayac: { yayin, haber: trBulunan.length + enBulunan.length + gTrYeni.length + gEn.length, olay: kumeler.length, arsiv: arsiv.length }, sure: Date.now() - t0 });
}
