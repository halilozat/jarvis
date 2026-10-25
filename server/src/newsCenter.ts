// Haber Modu · sunucu uçları. El Kontrolü'ndeki haber merkezi buradan okur.
//   GET /api/haber/merkez          gündemdeki olay kümeleri (karusel kartları)
//   GET /api/haber/kume/:id        kümenin temel bilgisi (hemen; tam metin beklenmez)
//   GET /api/haber/analiz/:id      detay + kaynak karşılaştırması + sorulmamış sorular (tam metin + model; arşivlenir)
//   GET /api/haber/iddia/:id       iddia kontrolü (resmî veriyle)
//   GET /api/haber/sabah           sabah özeti: hava, döviz, trafik, gündemin ilk 5 olayı
import { Router } from 'express';
import { getMarkets, getWeather } from './dashboard.js';
import { iddialariKontrolEt } from './factcheck.js';
import { newsSnapshot, onNewsRefresh } from './news.js';
import { analizEt } from './newsAnalysis.js';
import { arsivKume, arsivle, arsivTemizle } from './newsArchive.js';
import { gundemSirasi, kumele, type Kume } from './newsCluster.js';
import { KATEGORILER, type Kategori } from './newsSources.js';
import { knownImageUrls, type PhotoMode } from './photos.js';
import { getTrafik } from './traffic.js';
import type { NewsItem } from './types.js';

/** Son kaç saatin haberleri kümelenir */
const PENCERE_SAAT = 30;
/** "Son dakika": ilk haberi bu kadar dakika içinde gelen kümeler */
const SON_DAKIKA_DK = 45;

let son: { kaynak: NewsItem[]; kumeler: Kume[] } | null = null;

function kumeleriHesapla(items: NewsItem[]): Kume[] {
  if (son?.kaynak === items) return son.kumeler;
  const sinir = Date.now() - PENCERE_SAAT * 3600_000;
  const kumeler = kumele(items.filter(i => new Date(i.published_at).getTime() > sinir)).sort(gundemSirasi);
  son = { kaynak: items, kumeler };
  // Arşiv: birden çok kaynağın verdiği olaylar (tek kaynaklı haberler arşivi şişirmesin)
  arsivle(kumeler.filter(k => k.kaynaklar.length >= 2));
  return kumeler;
}

export async function guncelKumeler(): Promise<Kume[]> {
  const { items } = await newsSnapshot();
  return kumeleriHesapla(items);
}

/** Kimliği bilinen küme: güncel listede yoksa arşivden (son 3 gün) */
async function kumeBul(id: string): Promise<Kume | null> {
  const k = (await guncelKumeler()).find(x => x.id === id);
  if (k) return k;
  const a = arsivKume(id);
  if (!a) return null;
  return {
    id: a.id, kategori: a.kategori as Kategori, baslik: a.baslik, ilk: a.ilk, son: a.son, kokler: a.kokler, foto: null,
    kaynaklar: a.kaynaklar.map(s => s.ad),
    haberler: a.kaynaklar.map(s => ({ id: '', title: s.baslik, summary: s.ozet, category: a.kategori, source: s.ad, published_at: s.saat, url: s.url, image_url: null })),
  };
}

const fotoAdresi = (k: Kume, mod: PhotoMode) => {
  // Foto modu "video" iken haber fotoğrafı gösterilmez (telif); kart kategori görseliyle kalır
  if (mod !== 'haber' || !k.foto) return null;
  knownImageUrls.add(k.foto);
  return `/api/img?u=${encodeURIComponent(k.foto)}`;
};

export interface KumeOzet {
  id: string; baslik: string; kategori: Kategori; kaynakSayisi: number; kaynaklar: string[];
  ilk: string; son: string; foto: string | null; sonDakika: boolean; kokler: string[];
  /** Kaynak bağlantısı: kartta görünür */
  url: string; kaynak: string;
}

const ozet = (k: Kume, mod: PhotoMode): KumeOzet => ({
  id: k.id, baslik: k.baslik, kategori: k.kategori, kaynakSayisi: k.kaynaklar.length, kaynaklar: k.kaynaklar,
  ilk: k.ilk, son: k.son, foto: fotoAdresi(k, mod), sonDakika: Date.now() - new Date(k.ilk).getTime() < SON_DAKIKA_DK * 60_000,
  kokler: k.kokler, url: k.haberler[0].url, kaynak: k.haberler[0].source,
});

/** Karusel listesi: her kategoriden en önemli olaylar (çok kaynaklılar önce) */
function merkezListesi(kumeler: Kume[], kategori: string | null, n = 40): Kume[] {
  if (kategori) return kumeler.filter(k => k.kategori === kategori).slice(0, n);
  const coklu = kumeler.filter(k => k.kaynaklar.length >= 2);
  return (coklu.length >= 12 ? coklu : kumeler).slice(0, n);
}

/** Haber modu açıkken ilk kartlar arka planda sırayla analiz edilir (kart açılınca hazır olsun). Yeni küme yoksa model çağrılmaz. */
let isiniyor = false;
async function onIsit(kumeler: Kume[]) {
  if (isiniyor) return;
  isiniyor = true;
  try { for (const k of kumeler.slice(0, 5)) await analizEt(k).catch(() => null); } finally { isiniyor = false; }
}

export function initNewsCenter() {
  onNewsRefresh(items => { try { kumeleriHesapla(items); } catch (e) { console.warn('Haber kümeleri:', e); } });
  arsivTemizle();
  setInterval(arsivTemizle, 24 * 3600_000).unref();
}

export function newsCenterRouter(photoMode: () => PhotoMode): Router {
  const r = Router();

  r.get('/api/haber/merkez', async (req, res) => {
    try {
      const { sources } = await newsSnapshot();
      const kumeler = await guncelKumeler();
      const kategori = typeof req.query.kategori === 'string' && KATEGORILER.some(k => k.id === req.query.kategori) ? req.query.kategori : null;
      const mod = photoMode();
      const liste = merkezListesi(kumeler, kategori);
      void onIsit(liste);
      res.json({
        kumeler: liste.map(k => ozet(k, mod)),
        kategoriler: KATEGORILER.map(k => ({ ...k, sayi: kumeler.filter(x => x.kategori === k.id && x.kaynaklar.length >= 2).length })),
        kaynaklar: { toplam: sources.length, calisan: sources.filter(s => s.ok).length },
        at: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message || e) });
    }
  });

  r.get('/api/haber/kume/:id', async (req, res) => {
    const k = await kumeBul(req.params.id);
    if (!k) return res.status(404).json({ error: 'küme bulunamadı' });
    res.json({ ozet: ozet(k, photoMode()), haberler: k.haberler.map(h => ({ kaynak: h.source, baslik: h.title, ozet: h.summary, saat: h.published_at, url: h.url })) });
  });

  r.get('/api/haber/analiz/:id', async (req, res) => {
    const k = await kumeBul(req.params.id);
    if (!k) return res.status(404).json({ error: 'küme bulunamadı' });
    try {
      res.json(await analizEt(k));
    } catch (e) {
      console.warn('Haber analizi:', e);
      res.status(500).json({ error: String((e as Error).message || e) });
    }
  });

  r.get('/api/haber/iddia/:id', async (req, res) => {
    const k = await kumeBul(req.params.id);
    if (!k) return res.status(404).json({ error: 'küme bulunamadı' });
    try {
      res.json({ iddialar: await iddialariKontrolEt(k.id, await analizEt(k)), at: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message || e) });
    }
  });

  r.get('/api/haber/sabah', async (_req, res) => {
    const [hava, piyasa, trafik, kumeler] = await Promise.all([getWeather(), getMarkets(), getTrafik(), guncelKumeler().catch(() => [])]);
    const mod = photoMode();
    res.json({ hava, piyasa, trafik, gundem: kumeler.filter(k => k.kaynaklar.length >= 2).slice(0, 5).map(k => ozet(k, mod)), ajanda: null, at: new Date().toISOString() });
  });

  return r;
}
