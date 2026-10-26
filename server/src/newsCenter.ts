// Haber Modu · sunucu uçları. El Kontrolü'ndeki haber merkezi buradan okur.
//   GET /api/haber/merkez          gündemdeki olay kümeleri (karusel kartları)
//   GET /api/haber/kume/:id        kümenin temel bilgisi (hemen; tam metin beklenmez)
//   GET /api/haber/analiz/:id      detay + kaynak karşılaştırması + sorulmamış sorular (tam metin + model; arşivlenir)
//   GET /api/haber/iddia/:id       iddia kontrolü (resmî veriyle)
//   GET /api/haber/sabah           sabah özeti: hava, döviz, trafik, gündemin ilk 5 olayı
//   GET /api/haber/ara?q=…         anahtar kelimeyle arama; her adım canlı (NDJSON: bir satır bir olay)
//   GET /api/haber/dunya/:id       olayın dünya basınında nasıl verildiği (tarafsız karşılaştırma)
//   GET /api/haber/son-dakika      en son gelişen çok kaynaklı olay
//   GET /api/haber/basin           basın özeti: her kaynağın baş haberi, aynı olayı öne çıkaranlar
//   GET /api/haber/dunya-bugun     dünyanın bugünkü olayları, yerleriyle (küre)
//   GET/POST/DELETE /api/haber/takip[/:id]   olay takibi
import { Router } from 'express';
import { getMarkets, getWeather } from './dashboard.js';
import { iddialariKontrolEt } from './factcheck.js';
import { kaynakMansetleri, newsSnapshot, onNewsRefresh } from './news.js';
import { analizEt } from './newsAnalysis.js';
import { arsivKume, arsivle, arsivTemizle } from './newsArchive.js';
import { gundemSirasi, kumele, type Kume } from './newsCluster.js';
import { aramaKumesi, haberAra, type AramaOlay } from './newsSearch.js';
import { dunyaBasini } from './worldNews.js';
import { gelismeler, takibeAl, takipListesi, takipte, takiptenCik } from './newsFollow.js';
import { yerBul } from './worldPlaces.js';
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
  const k = (await guncelKumeler()).find(x => x.id === id) ?? aramaKumesi(id);
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
  /** Olay takipte ("bunu takibe al") */
  takipte: boolean;
}

const ozet = (k: Kume, mod: PhotoMode): KumeOzet => ({
  id: k.id, baslik: k.baslik, kategori: k.kategori, kaynakSayisi: k.kaynaklar.length, kaynaklar: k.kaynaklar,
  takipte: takipte(k.id),
  ilk: k.ilk, son: k.son, foto: fotoAdresi(k, mod), sonDakika: Date.now() - new Date(k.ilk).getTime() < SON_DAKIKA_DK * 60_000,
  // Kartın bağlantısı: Google News yönlendirmesi yerine varsa yayının kendi adresi
  kokler: k.kokler, url: (k.haberler.find(h => !/news\.google\./.test(h.url)) ?? k.haberler[0]).url, kaynak: (k.haberler.find(h => !/news\.google\./.test(h.url)) ?? k.haberler[0]).source,
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

export function initNewsCenter(broadcast: (e: object) => void = () => {}) {
  onNewsRefresh(items => {
    try {
      const kumeler = kumeleriHesapla(items);
      // Takipteki olayların gelişmeleri (haber modu kapalıyken de bildirilir)
      for (const g of gelismeler(kumeler)) {
        console.log(`[haber] takip · ${g.takip.baslik} · ${g.yeniKume ? 'yeni gelişme' : `+${g.yeniKaynaklar.length} kaynak`}`);
        broadcast({ type: 'haber_takip', takip: g.takip, kume: ozet(g.kume, 'haber'), yeniKaynaklar: g.yeniKaynaklar, yeniKume: g.yeniKume });
      }
    } catch (e) { console.warn('Haber kümeleri:', e); }
  });
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

  // Arama: satır satır olay akışı (istemci animasyonu bunlarla ilerler). Fotoğraf yalnızca "haber" foto modunda.
  r.get('/api/haber/ara', async (req, res) => {
    const q = String(req.query.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (q.length < 2) return res.status(400).json({ error: 'en az 2 harflik anahtar kelime' });
    const mod = photoMode();
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    let kapandi = false;
    req.on('close', () => { kapandi = true; });
    const yaz = (o: unknown) => { if (!kapandi) res.write(JSON.stringify(o) + '\n'); };
    try {
      await haberAra(q, (o: AramaOlay) => {
        if (o.tip === 'baslik') {
          const foto = mod === 'haber' && o.foto ? (knownImageUrls.add(o.foto), `/api/img?u=${encodeURIComponent(o.foto)}`) : null;
          return yaz({ ...o, foto });
        }
        if (o.tip === 'bitti') return yaz({ ...o, kumeler: o.kumeler.map(k => ozet(k, mod)) });
        yaz(o);
      });
      console.log(`[haber] arama "${q}"`);
    } catch (e) {
      yaz({ tip: 'hata', hata: String((e as Error).message || e).slice(0, 160) });
    }
    res.end();
  });

  r.get('/api/haber/dunya/:id', async (req, res) => {
    const k = await kumeBul(req.params.id);
    if (!k) return res.status(404).json({ error: 'küme bulunamadı' });
    try {
      const a = await analizEt(k);
      res.json(await dunyaBasini(k, a.detay.kaynaklar));
    } catch (e) {
      console.warn('Dünya basını:', e);
      res.status(500).json({ error: String((e as Error).message || e) });
    }
  });

  // Son dakika: ilk haberi en yeni olan çok kaynaklı olay (yaşı da döner; "son dakika" sayılıp sayılmayacağına istemci karar verir)
  r.get('/api/haber/son-dakika', async (_req, res) => {
    // En az 3 kaynak (tek iki sitenin verdiği küçük haber "son dakika" olmasın); yoksa 2 kaynaklı en yeni
    const tum = (await guncelKumeler()).sort((a, b) => b.ilk.localeCompare(a.ilk));
    const k = tum.find(x => x.kaynaklar.length >= 3) ?? tum.find(x => x.kaynaklar.length >= 2);
    res.json(k ? { kume: ozet(k, photoMode()), dakika: Math.round((Date.now() - new Date(k.ilk).getTime()) / 60_000) } : { kume: null, dakika: null });
  });

  // Basın özeti: her kaynağın baş haberi ve hangi olaya ait olduğu
  r.get('/api/haber/basin', async (_req, res) => {
    const kumeler = await guncelKumeler();
    const mod = photoMode();
    const kumeOf = (url: string) => kumeler.find(k => k.haberler.some(h => h.url === url));
    const kaynaklar = [...kaynakMansetleri().entries()].map(([kaynak, h]) => {
      const k = kumeOf(h.url);
      return { kaynak, baslik: h.title, saat: h.published_at, url: h.url, kumeId: k && k.kaynaklar.length >= 2 ? k.id : null };
    });
    // Aynı olayı öne çıkaranlar (en az 2 kaynak), çoktan aza
    const grup = new Map<string, number>();
    for (const x of kaynaklar) if (x.kumeId) grup.set(x.kumeId, (grup.get(x.kumeId) ?? 0) + 1);
    const ortak = [...grup].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ kume: ozet(kumeler.find(k => k.id === id)!, mod), sayi: n }));
    // Çok kaynağın verdiği ama hiçbir kaynağın baş haberi olmayan olay
    const ondeki = new Set(kaynaklar.map(x => x.kumeId).filter(Boolean));
    const yok = kumeler.filter(k => k.kaynaklar.length >= 5 && !ondeki.has(k.id)).sort((a, b) => b.kaynaklar.length - a.kaynaklar.length)[0];
    res.json({ kaynaklar, ortak, mansetteYok: yok ? ozet(yok, mod) : null, at: new Date().toISOString() });
  });

  // Dünyada bugün: dünya kategorisindeki çok kaynaklı olaylar, başlıkta geçen yerleriyle (yeri bulunamayan atlanır)
  r.get('/api/haber/dunya-bugun', async (_req, res) => {
    const mod = photoMode();
    const olaylar = (await guncelKumeler()).filter(k => k.kategori === 'dunya' && k.kaynaklar.length >= 2)
      .map(k => ({ k, y: yerBul(k.baslik) })).filter(x => x.y)
      .filter((x, i, l) => l.findIndex(z => z.y!.yer === x.y!.yer) === i).slice(0, 8)
      .map(({ k, y }) => ({ kume: ozet(k, mod), yer: y!.yer, konum: y!.konum }));
    res.json({ olaylar, at: new Date().toISOString() });
  });

  // Takip
  r.get('/api/haber/takip', (_req, res) => res.json({ takip: takipListesi().map(t => ({ id: t.id, baslik: t.baslik, eklendi: t.eklendi, kaynak: t.kaynaklar.length })) }));
  r.post('/api/haber/takip/:id', async (req, res) => {
    const k = await kumeBul(req.params.id);
    if (!k) return res.status(404).json({ error: 'küme bulunamadı' });
    res.json({ takip: takibeAl(k) });
  });
  r.delete('/api/haber/takip/:id', (req, res) => res.json({ ok: takiptenCik(req.params.id) }));

  r.get('/api/haber/sabah', async (_req, res) => {
    const [hava, piyasa, trafik, kumeler] = await Promise.all([getWeather(), getMarkets(), getTrafik(), guncelKumeler().catch(() => [])]);
    const mod = photoMode();
    res.json({ hava, piyasa, trafik, gundem: kumeler.filter(k => k.kaynaklar.length >= 2).slice(0, 5).map(k => ozet(k, mod)), ajanda: null, at: new Date().toISOString() });
  });

  return r;
}
