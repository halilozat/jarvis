// Kitaplık · bölümler, taramayı tamamlama ve telefon kamerası.
// - Bölümler (6): her bölümün yakın çekim fotoğrafları server/data/kitaplik-bolumler/ altında (git'e girmez).
//   Her fotoğraftan kitaplar raf (yukarıdan aşağı) ve sıra (soldan sağa) bilgisiyle okunur; okunamayan sırt da
//   sırası korunsun diye "ad: null" olarak listede kalır. Bir bölüme birden çok fotoğraf eklenebilir.
// - Tamamlama: sabit kameranın taramasında adı okunamayan sırtlar, o bölümün kamera kırpıntısı (numaralı kutular
//   çizili) ve yakın çekim listesiyle görüntü modeline sorulur. Model YALNIZCA listedeki adlardan birini seçebilir;
//   emin değilse null. Kod da denetler: ad listede mi, bu kitap başka bir sırta zaten yerleşmiş mi.
// - Tahmini yerleştirme: hâlâ adsız kalan sırtlara rafta yeri olmayan kayıtlı kitaplar (model tahmini, sonra
//   eklenme sırası); kitap "tahmini" işaretlenir, sonraki taramada adı okunursa düzelir.
// - Telefon kamerası: karede görünen kayıtlı kitaplar kutularıyla. Kitaplıkta olmayan ama adı net okunan (emin ≥
//   YENI_EMIN) kitaplar kitaplığa eklenir (rafta yeri olmadan); aynı ad ikinci kez eklenmez.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { addBook, BOLUM_SAYISI, DATA_DIR, deps, foldTitle, normTitle, parseDataUrl, readLibrary, str, validBox, writeLibrary, type Bolum, type Kitap, type Kutu } from './library.js';

const FOTO_DIR = path.join(DATA_DIR, 'kitaplik-bolumler');
const fotoFile = (bolum: number, id: string) => path.join(FOTO_DIR, `${bolum}-${id.replace(/[^\w-]/g, '')}.jpg`);
const bolumNo = (v: unknown) => { const n = Math.round(Number(v)); return n >= 1 && n <= BOLUM_SAYISI ? n : null; };

function jsonDizi(text: string): unknown[] {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  try { const v = JSON.parse(s.slice(a, b + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ———————————————————— Bölüm fotoğrafı ————————————————————

export const BOLUM_PROMPT =
  'Bu, bir kitaplık bölümünün yakından çekilmiş fotoğrafı. Rafları YUKARIDAN AŞAĞI, her raftaki kitapları SOLDAN SAĞA sırayla listele.\n' +
  'YALNIZCA bir JSON dizisi döndür, başka hiçbir şey yazma: [{"raf": 1, "sira": 1, "ad": "...", "yazar": "...", "emin": 0.0}]\n' +
  '- raf: 1 en üst raf. sira: o raftaki soldan sırası (1, 2, 3 …).\n' +
  '- ad: kitabın ADI, sırtta ya da kapakta gerçekten okuduğun yazı. Okuyamadığın sırtı da sırası korunsun diye "ad": null ile yaz. Tahmin etme, seriden doldurma.\n' +
  '- yazar: okunuyorsa, yoksa null. Yalnızca yazar adı okunuyorsa "ad": null bırak.\n' +
  '- emin: adı ne kadar net okuduğun (0-1).\n' +
  '- Seri kitaplarında her cildi ayrı yaz. Kitap olmayan nesneleri ekleme.';

export interface BolumOkunan { raf: number; sira: number; ad: string | null; yazar: string | null; emin: number }

export function parseBolum(text: string): BolumOkunan[] {
  const out: BolumOkunan[] = [];
  for (const it of jsonDizi(text).slice(0, 300)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const raf = Math.round(Number(o.raf)), sira = Math.round(Number(o.sira));
    if (!(raf >= 1 && raf <= 30 && sira >= 1 && sira <= 200)) continue;
    const emin = typeof o.emin === 'number' ? Math.max(0, Math.min(1, o.emin)) : 0.5;
    const ad = emin < 0.45 ? null : str(o.ad, 160);
    out.push({ raf, sira, ad, yazar: ad ? str(o.yazar, 120) : null, emin });
  }
  return out.sort((a, b) => a.raf - b.raf || a.sira - b.sira);
}

/** Bölüme fotoğraf ekle: okunanlar kitaplığa girer (yoksa), bölümün sıralı listesine eklenir */
export async function bolumFotografi(no: number, jpeg: Buffer) {
  const id = randomUUID().slice(0, 8);
  fs.mkdirSync(FOTO_DIR, { recursive: true });
  fs.writeFileSync(fotoFile(no, id), jpeg);
  const okunan = parseBolum(await deps.vision(jpeg.toString('base64'), BOLUM_PROMPT));
  const k = readLibrary();
  const bolum = k.bolumler.find(b => b.id === no)!;
  const eklenen: string[] = [], zatenVar: string[] = [];
  const at = new Date().toISOString();
  for (const o of okunan) {
    let kitapId: string | null = null;
    if (o.ad) {
      const f = foldTitle(o.ad);
      // Aynı kitap bu bölümün başka bir fotoğrafında zaten okunduysa listeye ikinci kez girmez
      if (bolum.liste.some(x => x.ad && foldTitle(x.ad) === f)) { zatenVar.push(o.ad); continue; }
      let b = k.kitaplar.find(x => x.ad && foldTitle(x.ad) === f);
      if (b) { zatenVar.push(b.ad!); if (!b.bolum) b.bolum = no; }
      else {
        b = { id: randomUUID().slice(0, 8), ad: o.ad, yazar: o.yazar, kutu: null, kapak: null, ozet: null, notlar: [], alintilar: [], durum: 'okunacak', bolum: no, kayitlar: [{ tur: 'durum', metin: 'eklendi', at }] };
        k.kitaplar.push(b);
        eklenen.push(o.ad);
      }
      kitapId = b.id;
    }
    bolum.liste.push({ foto: id, raf: o.raf, sira: o.sira, ad: o.ad, yazar: o.yazar, kitapId });
  }
  const belirsiz = okunan.filter(o => !o.ad).length;
  bolum.fotograflar.push({ id, at, okunan: okunan.length - belirsiz, belirsiz });
  writeLibrary(k);
  console.log(`[kitaplık] ${bolum.ad} · fotoğraf · ${okunan.length - belirsiz} okundu · ${belirsiz} belirsiz · ${eklenen.length} yeni`);
  return { bolum, eklenen, zatenVar, okunan: okunan.length - belirsiz, belirsiz };
}

export function bolumFotografiSil(no: number, fotoId: string) {
  const k = readLibrary();
  const b = k.bolumler.find(x => x.id === no)!;
  if (!b.fotograflar.some(f => f.id === fotoId)) return null;
  b.fotograflar = b.fotograflar.filter(f => f.id !== fotoId);
  b.liste = b.liste.filter(x => x.foto !== fotoId);
  fs.rmSync(fotoFile(no, fotoId), { force: true });
  writeLibrary(k);
  return b;
}

// ———————————————————— Taramayı bölüm listesiyle tamamla ————————————————————

/** Model için liste: fotoğraf ve raf sırasıyla, okunamayanlar "(okunamadı)" */
export function listeMetni(b: Bolum): string {
  const satirlar: string[] = [];
  b.fotograflar.forEach((f, fi) => {
    const rafs = new Map<number, string[]>();
    for (const x of b.liste.filter(y => y.foto === f.id)) {
      if (!rafs.has(x.raf)) rafs.set(x.raf, []);
      rafs.get(x.raf)!.push(x.ad ? `"${x.ad}"` : '(okunamadı)');
    }
    for (const [raf, adlar] of [...rafs].sort((p, q) => p[0] - q[0])) satirlar.push(`Fotoğraf ${fi + 1}, raf ${raf} (soldan sağa): ${adlar.join(', ')}`);
  });
  return satirlar.join('\n');
}

export const tamamlaPrompt = (b: Bolum, n: number) =>
  `Bu görüntü, sabit bir kameradan görülen kitaplık bölümü: "${b.ad}". Görüntüde 1'den ${n}'e kadar NUMARALI kutular var; her biri adı okunamamış bir kitap sırtı.\n` +
  'Bu bölümdeki kitaplar yakın çekim fotoğraflardan biliniyor (raf raf, soldan sağa):\n' +
  `${listeMetni(b)}\n` +
  'Her numaralı kutu için listedeki kitaplardan hangisi olduğunu bul. Sırtın rengi, kalınlığı, yazının düzeni ve rafta komşularına göre yeri ipucudur.\n' +
  'YALNIZCA bir JSON dizisi döndür: [{"n": 1, "ad": "listedeki ad, yazıldığı gibi", "emin": 0.0}]\n' +
  '- ad YALNIZCA yukarıdaki listede tırnak içinde yazan adlardan biri olabilir. Listede olmayan ad yazma.\n' +
  '- Emin değilsen "ad": null ver; tahmin etme. Bir kitabı yalnızca bir kutuya ver.';

export function parseTamamla(text: string, n: number, adlar: string[]): { n: number; ad: string; emin: number }[] {
  const izinli = new Map(adlar.map(a => [foldTitle(a), a]));
  const enIyi = new Map<string, { n: number; ad: string; emin: number }>();
  const kutuDolu = new Set<number>();
  const adaylar: { n: number; ad: string; emin: number }[] = [];
  for (const it of jsonDizi(text)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const no = Math.round(Number(o.n));
    const emin = typeof o.emin === 'number' ? o.emin : 0;
    const ad = typeof o.ad === 'string' ? izinli.get(foldTitle(o.ad)) : undefined;
    if (!(no >= 1 && no <= n) || !ad || emin < 0.6) continue;
    adaylar.push({ n: no, ad, emin });
  }
  // Bir kitap tek kutuya, bir kutu tek kitaba: en emin olanlar önce
  for (const a of adaylar.sort((p, q) => q.emin - p.emin)) {
    const key = foldTitle(a.ad);
    if (enIyi.has(key) || kutuDolu.has(a.n)) continue;
    enIyi.set(key, a); kutuDolu.add(a.n);
  }
  return [...enIyi.values()].sort((p, q) => p.n - q.n);
}

/**
 * Bölümün belirsiz sırtlarını tamamla. kutular: kırpıntıda çizili numaralar → haritadaki kitap kimlikleri.
 * Kural: listedeki kitabın kayıtlı bir kaydı varsa ve rafta yeri yoksa, kayıt (notları, özeti) o sırta taşınır;
 * zaten başka bir sırta yerleşmişse atlanır. Kaydı yoksa sırta ad yazılır.
 */
export async function tamamla(no: number, jpeg: Buffer, kutular: { n: number; id: string }[]) {
  const k0 = readLibrary();
  const b = k0.bolumler.find(x => x.id === no)!;
  const adlar = b.liste.map(x => x.ad).filter((x): x is string => !!x);
  if (!adlar.length || !kutular.length) return { tamamlanan: [], kitaplik: k0 };
  const text = await deps.vision(jpeg.toString('base64'), tamamlaPrompt(b, kutular.length));
  const eslesen = parseTamamla(text, kutular.length, adlar);
  const k = readLibrary();
  const tamamlanan: { id: string; ad: string }[] = [];
  for (const e of eslesen) {
    const yerId = kutular.find(x => x.n === e.n)?.id;
    const yer = k.kitaplar.find(x => x.id === yerId);
    if (!yer || yer.ad || !yer.kutu) continue; // bu arada elle adlandırılmış
    const f = foldTitle(e.ad);
    const kayit = k.kitaplar.find(x => x.ad && foldTitle(x.ad) === f);
    const liste = b.liste.find(x => x.ad && foldTitle(x.ad) === f);
    if (kayit?.kutu) continue; // bu kitap zaten başka bir sırtta
    if (kayit) {
      // Kayıt sırta taşınır (notları ve özeti korunur), yer tutucu silinir
      Object.assign(kayit, { kutu: yer.kutu, emin: yer.emin, tamamlandi: true, bolum: no });
      k.kitaplar = k.kitaplar.filter(x => x.id !== yer.id);
      tamamlanan.push({ id: kayit.id, ad: kayit.ad! });
    } else {
      Object.assign(yer, { ad: e.ad, yazar: liste?.yazar ?? null, tamamlandi: true, bolum: no });
      tamamlanan.push({ id: yer.id, ad: e.ad });
    }
  }
  writeLibrary(k);
  console.log(`[kitaplık] ${b.ad} · tamamlama · ${kutular.length} belirsiz · ${tamamlanan.length} tamamlandı`);
  return { tamamlanan, kitaplik: k };
}

// ———————————————————— Tahmini yerleştirme ————————————————————

export const yerlestirPrompt = (n: number, adlar: string[]) =>
  `Bu görüntü, sabit bir kameradan uzaktan görülen bir kitaplık. Görüntüde 1'den ${n}'e kadar NUMARALI kutular var; her biri adı okunamamış bir kitap sırtı.\n` +
  'Kullanıcının kitaplığında olup rafta yeri henüz bilinmeyen kitaplar aşağıda (kabaca rafta eklendikleri sırayla):\n' +
  `${adlar.map(a => `"${a}"`).join(', ')}\n` +
  'Her numaralı kutu için listedeki kitaplardan EN OLASI olanı seç. Okunabilen harfler, kelime uzunluğu, sırtın rengi ve kalınlığı, ' +
  'yayınevi logosu, aynı serinin yan yana durması ve listedeki sıra ipucudur. Tam emin olmasan da en iyi tahminini ver.\n' +
  'YALNIZCA bir JSON dizisi döndür: [{"n": 1, "ad": "listedeki ad, yazıldığı gibi", "emin": 0.0}]\n' +
  '- ad YALNIZCA listedeki adlardan biri olabilir. Bir kitabı yalnızca bir kutuya ver.\n' +
  '- emin: tahminin ne kadar güçlü (0-1). Hiçbir ipucu yoksa o kutuyu yazma.';

/** Model tahminleri: listedeki adlar, bir kitap tek kutuya, bir kutu tek kitaba (en güçlü tahmin önce) */
export function parseYerlestir(text: string, n: number, adlar: string[]): { n: number; ad: string; emin: number }[] {
  const izinli = new Map(adlar.map(a => [foldTitle(a), a]));
  const adaylar: { n: number; ad: string; emin: number }[] = [];
  for (const it of jsonDizi(text)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const no = Math.round(Number(o.n));
    const ad = typeof o.ad === 'string' ? izinli.get(foldTitle(o.ad)) : undefined;
    if (!(no >= 1 && no <= n) || !ad) continue;
    adaylar.push({ n: no, ad, emin: typeof o.emin === 'number' ? Math.max(0, Math.min(1, o.emin)) : 0.3 });
  }
  const kitapDolu = new Set<string>(), kutuDolu = new Set<number>(), out: typeof adaylar = [];
  for (const a of adaylar.sort((p, q) => q.emin - p.emin)) {
    const key = foldTitle(a.ad);
    if (kitapDolu.has(key) || kutuDolu.has(a.n)) continue;
    kitapDolu.add(key); kutuDolu.add(a.n); out.push(a);
  }
  return out.sort((p, q) => p.n - q.n);
}

/**
 * Taramadan (ve bölüm tamamlamasından) sonra hâlâ adsız kalan sırtlara, rafta yeri olmayan kayıtlı kitapları
 * TAHMİNİ yerleştir. kutular: görüntüde çizili numaralar → haritadaki adsız sırtlar, okuma sırasıyla (raf raf, soldan
 * sağa). Önce görüntü modelinin tahmini; model yerleştiremediği kitaplar kalan sırtlara eklenme sırasıyla dağıtılır
 * (telefonla raf raf eklendiği için sıra rafın sırasına yakındır). Kayıt (notlar, özet) sırta taşınır, yer tutucu
 * silinir; kitap "tahmini" işaretlenir.
 */
export async function tahminiYerlestir(jpeg: Buffer | null, kutular: { n: number; id: string }[]) {
  const k0 = readLibrary();
  const yersiz = k0.kitaplar.filter(b => b.ad && !b.kutu && !b.rafDisi);
  if (!yersiz.length || !kutular.length) return { yerlesen: [], kitaplik: k0 };
  const adlar = yersiz.map(b => b.ad!).slice(0, 400);
  let tahmin: { n: number; ad: string; emin: number }[] = [];
  if (jpeg) {
    try { tahmin = parseYerlestir(await deps.vision(jpeg.toString('base64'), yerlestirPrompt(kutular.length, adlar)), kutular.length, adlar); }
    catch (e) { console.warn('[kitaplık] tahmini yerleştirme: model', (e as Error).message); }
  }
  const k = readLibrary();
  const yerlesen: { id: string; ad: string; emin: number; sirayla: boolean }[] = [];
  const dolu = new Set<number>();
  const tasi = (no: number, kayit: Kitap, emin: number, sirayla: boolean) => {
    const yer = k.kitaplar.find(x => x.id === kutular.find(y => y.n === no)?.id);
    if (!yer || yer.ad || !yer.kutu || kayit.kutu) return false; // bu arada adlandırılmış ya da kitap yerleşmiş
    Object.assign(kayit, { kutu: yer.kutu, emin, tahmini: true });
    // Yer tutucunun notu yoksa silinir (notlu bir yer tutucu kalır, yalnızca sırtı kayda geçer)
    if (!yer.notlar.length && !yer.alintilar.length) k.kitaplar = k.kitaplar.filter(x => x.id !== yer.id);
    else yer.kutu = null;
    dolu.add(no);
    yerlesen.push({ id: kayit.id, ad: kayit.ad!, emin, sirayla });
    return true;
  };
  const kayitBul = (ad: string) => k.kitaplar.find(x => x.ad && !x.kutu && !x.rafDisi && foldTitle(x.ad) === foldTitle(ad));
  for (const t of tahmin) { const kayit = kayitBul(t.ad); if (kayit) tasi(t.n, kayit, t.emin, false); }
  // Kalanlar: eklenme sırasıyla boş sırtlara (okuma sırası)
  const kalanKutu = kutular.map(x => x.n).filter(n => !dolu.has(n)).sort((p, q) => p - q);
  const kalanKitap = k.kitaplar.filter(x => x.ad && !x.kutu && yersiz.some(y => y.id === x.id));
  for (const no of kalanKutu) {
    const kayit = kalanKitap.shift();
    if (!kayit) break;
    if (!tasi(no, kayit, 0, true)) kalanKitap.unshift(kayit);
  }
  writeLibrary(k);
  console.log(`[kitaplık] tahmini yerleştirme · ${kutular.length} adsız sırt · ${yersiz.length} yersiz kitap · ${yerlesen.filter(x => !x.sirayla).length} model tahmini · ${yerlesen.filter(x => x.sirayla).length} sırayla`);
  return { yerlesen, kitaplik: k };
}

// ———————————————————— Telefon kamerası ————————————————————

export const kameraPrompt = (adlar: string[]) =>
  'Bu, bir kitaplığın telefonla çekilmiş fotoğrafı. Aşağıda kullanıcının kitaplığındaki kitapların listesi var.\n' +
  'Fotoğrafta sırtı ya da kapağı görünen ve adını OKUYABİLDİĞİN her kitabı bul.\n' +
  'YALNIZCA bir JSON dizisi döndür: [{"ad": "kitabın adı", "yazar": "yazarı ya da null", "yeni": false, "kutu": [ymin, xmin, ymax, xmax], "emin": 0.0}]\n' +
  '- Kitap listede varsa ad listedeki gibi yazılır ve yeni: false olur.\n' +
  '- Listede yoksa ad sırtta/kapakta yazdığı gibi (yayınevi adı değil, kitabın adı), yazar sırtta yazıyorsa o, yeni: true.\n' +
  '- kutu: o kitabın görünen sırtını ya da kapağını saran dikdörtgen, 0-1000 arası normalize.\n' +
  '- emin: adı ne kadar net okuduğun. Okuyamadığın kitabı tahmin etme, yazma.\n' +
  (adlar.length ? `Liste: ${adlar.map(a => `"${a}"`).join(', ')}` : 'Liste: (boş)');

export interface KameraBulunan { id: string; ad: string; yazar: string | null; kutu: Kutu; emin: number; yeni?: boolean }
/** Yeni kitap ancak bu kadar net okunduysa eklenir (yanlış okunan ad kitaplığa girmesin) */
export const YENI_EMIN = 0.75;

/** Kayıtlı kitaplar (id'siyle) ve kitaplıkta olmayan, net okunan yeni adlar (id boş) */
export function parseKamera(text: string, kitaplar: Kitap[]): { bulunan: KameraBulunan[]; yeniler: Omit<KameraBulunan, 'id'>[] } {
  const adla = new Map(kitaplar.filter(b => b.ad).map(b => [foldTitle(b.ad!), b]));
  const normla = new Map(kitaplar.filter(b => b.ad).map(b => [normTitle(b.ad!), b]));
  const bulunan: KameraBulunan[] = [], yeniler: Omit<KameraBulunan, 'id'>[] = [];
  for (const it of jsonDizi(text).slice(0, 120)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const ad = str(o.ad, 160);
    const k = Array.isArray(o.kutu) && o.kutu.length === 4 && o.kutu.every(v => typeof v === 'number' && v >= 0 && v <= 1000) ? validBox((o.kutu as number[]).map(v => v / 1000)) : null;
    const emin = typeof o.emin === 'number' ? o.emin : 0.5;
    if (!ad || !k || emin < 0.5) continue;
    const b = adla.get(foldTitle(ad)) ?? normla.get(normTitle(ad));
    if (b) {
      if (!bulunan.some(x => x.id === b.id)) bulunan.push({ id: b.id, ad: b.ad!, yazar: b.yazar, kutu: k, emin });
    } else if (emin >= YENI_EMIN && ad.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 && !yeniler.some(x => foldTitle(x.ad) === foldTitle(ad))) {
      yeniler.push({ ad, yazar: str(o.yazar, 120), kutu: k, emin, yeni: true });
    }
  }
  return { bulunan, yeniler };
}

/** Karede görünen kayıtlı kitaplar; kitaplıkta olmayan ama net okunanlar kitaplığa eklenir (rafta yeri olmadan) */
export async function kameraTani(jpeg: Buffer): Promise<{ bulunan: KameraBulunan[]; eklenen: Kitap[] }> {
  const kitaplar = readLibrary().kitaplar.filter(b => b.ad);
  const text = await deps.vision(jpeg.toString('base64'), kameraPrompt(kitaplar.slice(0, 400).map(b => b.ad!)));
  const { bulunan, yeniler } = parseKamera(text, kitaplar);
  const eklenen: Kitap[] = [];
  for (const y of yeniler.slice(0, 40)) {
    const r = addBook(y.ad, y.yazar);
    if ('hata' in r) continue;
    if (r.yeni) eklenen.push(r.kitap);
    if (!bulunan.some(x => x.id === r.kitap.id)) bulunan.push({ ...y, id: r.kitap.id, ad: r.kitap.ad!, yazar: r.kitap.yazar, yeni: r.yeni });
  }
  if (bulunan.length || eklenen.length) console.log(`[kitaplık] telefon kamerası · ${bulunan.length} kitap · ${eklenen.length} yeni eklendi`);
  return { bulunan, eklenen };
}

// ———————————————————— HTTP ————————————————————

/** libraryRouter'dan ÖNCE bağlanır ("/api/kitaplik/:id" bu yolları yakalamasın) */
export function libraryPartsRouter(): Router {
  const r = Router();

  r.get('/api/kitaplik/bolum/:n/foto/:pid', (req, res) => {
    const no = bolumNo(req.params.n);
    const file = no ? fotoFile(no, String(req.params.pid)) : '';
    if (!file || !fs.existsSync(file)) return res.status(404).end();
    res.type('jpeg').set('Cache-Control', 'private, max-age=86400').send(fs.readFileSync(file));
  });

  r.post('/api/kitaplik/bolum/:n/foto', async (req, res) => {
    const no = bolumNo(req.params.n);
    const img = parseDataUrl(req.body?.resim);
    if (!no || !img || img.length > 8e6) return res.status(400).json({ error: 'bölüm (1-6) ve resim (JPEG data URL) gerekli' });
    try { res.json(await bolumFotografi(no, img)); }
    catch (e) { res.status(502).json({ error: `Fotoğraf okunamadı: ${String((e as Error).message).slice(0, 120)}` }); }
  });

  r.delete('/api/kitaplik/bolum/:n/foto/:pid', (req, res) => {
    const no = bolumNo(req.params.n);
    const b = no ? bolumFotografiSil(no, String(req.params.pid)) : null;
    if (!b) return res.status(404).json({ error: 'fotoğraf yok' });
    res.json({ bolum: b });
  });

  // Bölümün adı ya da kameradaki alanı
  r.post('/api/kitaplik/bolum/:n', (req, res) => {
    const no = bolumNo(req.params.n);
    if (!no) return res.status(400).json({ error: 'bölüm 1-6' });
    const k = readLibrary();
    const b = k.bolumler.find(x => x.id === no)!;
    if ('ad' in (req.body ?? {})) b.ad = str(req.body.ad, 40) ?? `Bölüm ${no}`;
    if ('alan' in (req.body ?? {})) b.alan = req.body.alan === null ? null : validBox(req.body.alan) ?? b.alan;
    writeLibrary(k);
    res.json({ bolum: b });
  });

  // Tarama sonrası: bölümün kamera kırpıntısı (numaralı kutular çizili) + numara → kitap kimliği
  r.post('/api/kitaplik/tamamla', async (req, res) => {
    const no = bolumNo(req.body?.bolum);
    const img = parseDataUrl(req.body?.resim);
    const kutular = Array.isArray(req.body?.kutular) ? req.body.kutular.filter((x: any) => Number.isInteger(x?.n) && typeof x?.id === 'string').slice(0, 120) : [];
    if (!no || !img) return res.status(400).json({ error: 'bolum, resim ve kutular gerekli' });
    try { res.json(await tamamla(no, img, kutular)); }
    catch (e) { res.status(502).json({ error: `Tamamlanamadı: ${String((e as Error).message).slice(0, 120)}` }); }
  });

  // Tahmini yerleştirme: adsız sırtlar (numaralı görüntü) → rafta yeri olmayan kayıtlı kitaplar
  r.post('/api/kitaplik/yerlestir', async (req, res) => {
    const img = parseDataUrl(req.body?.resim);
    const kutular = Array.isArray(req.body?.kutular)
      ? (req.body.kutular as unknown[]).slice(0, 300).flatMap((x: any, i) => (typeof x?.id === 'string' ? [{ n: Number(x.n) || i + 1, id: x.id }] : []))
      : [];
    if (!kutular.length || (img && img.length > 8e6)) return res.status(400).json({ error: 'kutular gerekli ([{ n, id }]), resim isteğe bağlı' });
    try { res.json(await tahminiYerlestir(img, kutular)); }
    catch (e) { res.status(502).json({ error: `Yerleştirilemedi: ${String((e as Error).message).slice(0, 120)}` }); }
  });

  // Telefon kamerası: karede görünen kayıtlı kitaplar; net okunan yeni kitaplar eklenir
  r.post('/api/kitaplik/kamera', async (req, res) => {
    const img = parseDataUrl(req.body?.resim);
    if (!img || img.length > 6e6) return res.status(400).json({ error: 'resim (JPEG data URL) gerekli' });
    try { res.json(await kameraTani(img)); }
    catch (e) { res.status(502).json({ error: `Tanınamadı: ${String((e as Error).message).slice(0, 120)}` }); }
  });

  return r;
}

