// Kitaplık: rafın haritası (her kitabın video karesindeki kutusu), kapaklar, özetler ve notlar.
// Hepsi server/data altında durur (git'e girmez). Kutular VİDEO NORMALİZE koordinattadır (0..1, aynalanmamış):
// pencere boyutu değişse de istemci makeMapper ile doğru ekran konumunu bulur.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Request, type Response } from 'express';
import { CHAT_MODEL, MOCK, routellm, type ChatResponse } from './routellm.js';
import { VISION_MODEL } from './camera.js';

// KITAPLIK_DATA: testte geçici klasör (gerçek kitaplık bozulmasın)
const DATA = process.env.KITAPLIK_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DATA, 'kitaplik.json');
const COVERS = path.join(DATA, 'kapaklar');

export type Durum = 'okunacak' | 'okunuyor' | 'bitti';
/** [ymin, xmin, ymax, xmax], 0..1 */
export type Kutu = [number, number, number, number];

export interface Kitap {
  id: string;
  /** null: sırtı okunamadı (belirsiz); kitaplık ayar modunda elle yazılır */
  ad: string | null;
  yazar: string | null;
  /** null: rafta yeri bilinmiyor (son taramada bulunamadı); notları ve özeti korunur */
  kutu: Kutu | null;
  /** Kapak kaynağı: 'openlibrary' | 'yuklendi' | null (yok; istemci sırttan kapak üretir) */
  kapak: string | null;
  ozet: string | null;
  notlar: string[];
  alintilar: string[];
  durum: Durum;
  sayfa?: number;
  toplamSayfa?: number;
  /** Tarayan modelin okuma güveni 0..1 */
  emin?: number;
  /** Adı ya da kutusu elle düzeltildi: yeniden taramada model bunu ezmez */
  elle?: boolean;
  /** Open Library'de son arama (bulunamadıysa her açılışta tekrar sorulmasın) */
  kapakArandi?: number;
  /** Jarvis'in kitap defteri sayfaları (RouteLLM); kullanıcının notlarından ayrı */
  jarvis?: JarvisSayfa;
  /** Kitaplığın hangi bölümünde (1-6); bölüm fotoğrafından ya da elle */
  bolum?: number;
  /** Adı kamera taramasında bölüm listesinden tamamlandı */
  tamamlandi?: boolean;
  /** Rafta yeri tahmini: sırtı okunamadı, kayıtlı kitap olasılığa (ya da eklenme sırasına) göre yerleştirildi.
   *  Sonraki taramada sırtın adı okunursa düzelir; elle düzeltince kalkar. */
  tahmini?: boolean;
  /** Rafta değil (öneriden okuma listesine eklendi): tahmini yerleştirmede bir sırta konmaz */
  rafDisi?: boolean;
  /** "Okundu" olduğu an (istatistik: bu yıl okunanlar) */
  bittiAt?: string;
  /** Kayıt geçmişi (Kitaplığım'daki zaman çizelgesi): not, alıntı, durum ve sayfa değişiklikleri */
  kayitlar?: KitapKayit[];
}

export interface KitapKayit { tur: 'not' | 'alinti' | 'durum' | 'sayfa'; metin: string; at: string }

/** Kitaplığın bir bölümü: yakın çekim fotoğrafları ve onlardan okunan sıralı kitap listesi */
export interface Bolum {
  id: number;
  ad: string;
  /** Sabit kameradaki yeri (video normalize, aynalanmamış); El Kontrolü'nde K ayar modunda çizilir */
  alan: Kutu | null;
  fotograflar: { id: string; at: string; okunan: number; belirsiz: number }[];
  /** Fotoğraflardan okunan kitaplar: raf (yukarıdan) ve sıra (soldan); ad null: okunamadı ama sırası belli */
  liste: { foto: string; raf: number; sira: number; ad: string | null; yazar: string | null; kitapId: string | null }[];
}

export interface JarvisSayfa {
  /** Model kitabı tanımadı: sayfa uydurulmadı */
  bilinmiyor?: boolean;
  anaFikirler: string[];
  yazarHakkinda: string | null;
  temalar: string[];
  nedenOku: string | null;
  kimeUygun: string | null;
  tur: string | null;
  yil: number | null;
  /** Kullanıcının kitaplığından benzer kitaplar (yalnızca kayıtlı olanlar) */
  benzer: string[];
  at: string;
}

export interface Referans {
  /** Tarama karesinin çözünürlüğü */
  genislik: number;
  yukseklik: number;
  /** Rafın küçük gri resmi (base64, 96×54 bayt): kamera kıpırdadı mı karşılaştırması için */
  kucukResim: string;
  at: string;
}

export interface Kitaplik { kitaplar: Kitap[]; referans: Referans | null; bolumler: Bolum[] }

export const BOLUM_SAYISI = 6;
const bosBolum = (id: number): Bolum => ({ id, ad: `Bölüm ${id}`, alan: null, fotograflar: [], liste: [] });

const DURUMLAR: Durum[] = ['okunacak', 'okunuyor', 'bitti'];
const MAX_BOOKS = 400;
const MAX_TEXT = 600;
const MAX_ITEMS = 40;

// ---------------------------------------------------------------- Dosya

function bolumler(v: unknown): Bolum[] {
  const list = Array.isArray(v) ? (v as Bolum[]) : [];
  return Array.from({ length: BOLUM_SAYISI }, (_, i) => {
    const b = list.find(x => x?.id === i + 1);
    return b ? { ...bosBolum(i + 1), ...b } : bosBolum(i + 1);
  });
}
function read(): Kitaplik {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { kitaplar: Array.isArray(d.kitaplar) ? d.kitaplar : [], referans: d.referans ?? null, bolumler: bolumler(d.bolumler) };
  } catch {
    return { kitaplar: [], referans: null, bolumler: bolumler(null) };
  }
}
/** Bölüm modülü (libraryParts.ts) için */
export const readLibrary = () => read();
export const writeLibrary = (k: Kitaplik) => write(k);
export const DATA_DIR = DATA;
function write(k: Kitaplik) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(k, null, 2));
  notify();
}

let notify: () => void = () => {};
/** Kitaplık değişince tüm ekranlara haber ver (El Kontrolü ve Ayarlar yeniden yükler) */
export function initLibrary(broadcast: (e: object) => void) { notify = () => broadcast({ type: 'kitaplik' }); }

export const getLibrary = (): Kitaplik => read();

// ---------------------------------------------------------------- Doğrulama

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const str = (v: unknown, max = MAX_TEXT): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t || /^(null|none|yok|bilinmiyor|okunamadı|\?+|-)$/i.test(t)) return null;
  return t.slice(0, max);
};
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => str(x)).filter((x): x is string => !!x).slice(0, MAX_ITEMS) : [];
const posInt = (v: unknown, max = 100000): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
};

/** 0..1 kutuyu doğrula: sıralı, taşmayan, sıfır olmayan */
export function validBox(k: unknown): Kutu | null {
  if (!Array.isArray(k) || k.length !== 4 || !k.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  const [y0, x0, y1, x1] = k as number[];
  if ([y0, x0, y1, x1].some(v => v < -0.001 || v > 1.001)) return null;
  if (y1 - y0 < 0.01 || x1 - x0 < 0.002) return null;
  return [clamp01(y0), clamp01(x0), clamp01(y1), clamp01(x1)];
}

/** Editörden ya da Ayarlar'dan gelen bir kitabı temizle (bilinmeyen alanlar atılır) */
function clean(b: any, prev?: Kitap): Kitap {
  return {
    id: typeof b?.id === 'string' && /^[\w-]{4,40}$/.test(b.id) ? b.id : prev?.id ?? randomUUID().slice(0, 8),
    ad: b && 'ad' in b ? str(b.ad, 160) : prev?.ad ?? null,
    yazar: b && 'yazar' in b ? str(b.yazar, 120) : prev?.yazar ?? null,
    kutu: b && 'kutu' in b ? validBox(b.kutu) : prev?.kutu ?? null,
    kapak: prev?.kapak ?? null,
    ozet: b && 'ozet' in b ? str(b.ozet, 1200) : prev?.ozet ?? null,
    notlar: b && 'notlar' in b ? strList(b.notlar) : prev?.notlar ?? [],
    alintilar: b && 'alintilar' in b ? strList(b.alintilar) : prev?.alintilar ?? [],
    durum: DURUMLAR.includes(b?.durum) ? b.durum : prev?.durum ?? 'okunacak',
    sayfa: b && 'sayfa' in b ? posInt(b.sayfa) : prev?.sayfa,
    toplamSayfa: b && 'toplamSayfa' in b ? posInt(b.toplamSayfa) : prev?.toplamSayfa,
    emin: prev?.emin ?? (typeof b?.emin === 'number' ? clamp01(b.emin) : undefined),
    elle: b?.elle === true || prev?.elle || undefined,
    kapakArandi: prev?.kapakArandi,
    jarvis: prev?.jarvis,
    bolum: b && 'bolum' in b ? (posInt(b.bolum, BOLUM_SAYISI) ?? undefined) : prev?.bolum,
    tamamlandi: prev?.tamamlandi,
    rafDisi: prev?.rafDisi,
    // Ayar modunda adı ya da yeri elle değişen kitabın yeri artık tahmini değil
    tahmini: prev?.tahmini && b?.elle !== true && (!(b && 'ad' in b) || str(b.ad, 160) === prev.ad) ? true : undefined,
    bittiAt: prev?.bittiAt,
    kayitlar: prev?.kayitlar,
  };
}

/** Kayıt geçmişine ekle (en fazla 200) ve "okundu" anını tut */
export function kayitli(prev: Kitap, next: Kitap): Kitap {
  const at = new Date().toISOString();
  const add: KitapKayit[] = [];
  if (next.durum !== prev.durum) add.push({ tur: 'durum', metin: next.durum, at });
  if (next.sayfa !== prev.sayfa && next.sayfa) add.push({ tur: 'sayfa', metin: String(next.sayfa), at });
  for (const n of next.notlar) if (!prev.notlar.includes(n)) add.push({ tur: 'not', metin: n, at });
  for (const a of next.alintilar) if (!prev.alintilar.includes(a)) add.push({ tur: 'alinti', metin: a, at });
  const bittiAt = next.durum === 'bitti' ? (prev.durum === 'bitti' ? prev.bittiAt : at) : undefined;
  if (!add.length && bittiAt === prev.bittiAt) return next;
  return { ...next, bittiAt, kayitlar: [...(prev.kayitlar ?? []), ...add].slice(-200) };
}

// ---------------------------------------------------------------- Tarama

export interface Bulunan { ad: string | null; yazar: string | null; kutu: Kutu; emin: number }

const iou = (a: Kutu, b: Kutu) => {
  const ix = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const iy = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const i = ix * iy;
  const u = (a[3] - a[1]) * (a[2] - a[0]) + (b[3] - b[1]) * (b[2] - b[0]) - i;
  return u > 0 ? i / u : 0;
};

/**
 * Görüntü modelinin cevabını ayrıştır. Beklenen: [{ ad, yazar, kutu: [ymin, xmin, ymax, xmax] (0-1000), emin }].
 * Geçersiz JSON → boş liste. Taşan, ters ya da sayı olmayan kutular atılır; üst üste binen aynı kutu tek kalır.
 */
export function parseScan(text: string): Bulunan[] {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  let arr: unknown;
  try { arr = JSON.parse(s.slice(a, b + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: Bulunan[] = [];
  for (const it of arr.slice(0, MAX_BOOKS)) {
    if (!it || typeof it !== 'object') continue;
    const k = (it as any).kutu;
    if (!Array.isArray(k) || k.length !== 4 || !k.every(v => typeof v === 'number' && Number.isFinite(v))) continue;
    if (k.some((v: number) => v < 0 || v > 1000)) continue; // taşan değer
    const kutu = validBox(k.map((v: number) => v / 1000));
    if (!kutu) continue;
    // Bir sırt karenin yarısından geniş olamaz (raf ya da çerçeve kutusu)
    if (kutu[3] - kutu[1] > 0.5) continue;
    const emin = typeof (it as any).emin === 'number' ? clamp01((it as any).emin) : 0.5;
    // Model "emin değilim" diyorsa adı yazmayalım: belirsiz olarak işaretlenir, elle düzeltilir
    const ad = emin < 0.35 ? null : str((it as any).ad, 160);
    out.push({ ad, yazar: ad ? str((it as any).yazar, 120) : null, kutu, emin });
  }
  const uniq: Bulunan[] = [];
  for (const f of out.sort((p, q) => q.emin - p.emin)) if (!uniq.some(u => iou(u.kutu, f.kutu) > 0.7)) uniq.push(f);
  return uniq.sort((p, q) => p.kutu[1] - q.kutu[1] || p.kutu[0] - q.kutu[0]);
}

/** Karşılaştırma için: küçük harf, şapka/nokta farkı yok (Fâtih = Fatih, VINCI = Vinci), yalnızca harf ve rakam */
export const foldTitle = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Sorgu için ("Davranış'a not ekle" → davranış): ek atılır */
export const normTitle = (s: string) => foldTitle(s.replace(/['’`][^\s]*/g, ''));

/**
 * Yeni taramayı eski haritayla birleştir: aynı kitap (aynı ad ya da elle düzeltilmiş aynı yer) kimliğini, notlarını,
 * özetini ve kapağını korur. Bu taramada bulunamayanlar silinmez; kutusuz kalır (notlar kaybolmasın).
 */
export function mergeScan(old: Kitap[], found: Bulunan[]): Kitap[] {
  const used = new Set<string>();
  const out: Kitap[] = found.map(f => {
    let hit = f.ad ? old.find(o => !used.has(o.id) && o.ad && foldTitle(o.ad) === foldTitle(f.ad!)) : undefined;
    // Model adı okuyamadı ama bu yerde elle adı yazılmış bir kitap vardı
    // (Tahmini yer elle düzeltme sayılmaz: sırtın gerçek adı okunduysa tahmin bırakılır)
    if (!hit) hit = old.find(o => !used.has(o.id) && o.kutu && iou(o.kutu, f.kutu) > 0.5 && ((o.elle && !o.tahmini) || !f.ad));
    if (hit) {
      used.add(hit.id);
      const keepName = hit.elle || !f.ad;
      // Ad bu sırtta okunduysa yeri artık tahmini değil; okunamadıysa tahmini yer korunur
      return { ...hit, ad: keepName ? hit.ad : f.ad, yazar: keepName ? hit.yazar : f.yazar ?? hit.yazar, kutu: f.kutu, emin: f.emin, tahmini: f.ad ? undefined : hit.tahmini };
    }
    return { id: randomUUID().slice(0, 8), ad: f.ad, yazar: f.yazar, kutu: f.kutu, kapak: null, ozet: null, notlar: [], alintilar: [], durum: 'okunacak', emin: f.emin };
  });
  for (const o of old) if (!used.has(o.id) && (o.ad || o.notlar.length)) out.push({ ...o, kutu: null, tahmini: undefined });
  return out;
}

const SCAN_PROMPT_TABAN =
  'Bu, sabit bir kameradan çekilmiş bir kitaplık görüntüsünün bir parçası. Görünen HER kitabı bul: rafta dik duran kitapların sırtlarını ve kapağı öne dönük duranları.\n' +
  'YALNIZCA bir JSON dizisi döndür, başka hiçbir şey yazma:\n' +
  '[{"ad": "...", "yazar": "...", "kutu": [ymin, xmin, ymax, xmax], "emin": 0.0}]\n' +
  'Kurallar:\n' +
  '- kutu: TEK bir kitabın görünen sırtını (ya da kapağını) sıkıca saran dikdörtgen; 0-1000 arası normalize (görüntünün genişliği ve yüksekliği 1000). Sırtlar dar dikey şeritlerdir; yan yana birden çok kitabı tek kutuya alma, her sırt ayrı kutu.\n' +
  '- ad: kitabın ADI. YALNIZCA sırtta gerçekten okuyabildiğin yazı. Okuyamıyorsan ya da emin değilsen "ad": null ver. Tahmin etme, uydurma, benzer kitaplardan ya da seriden doldurma.\n' +
  '- yazar: sırtta okunan yazar adı, yoksa null. Sırtta yalnızca yazar adı okunuyorsa onu "yazar"a yaz, "ad": null bırak (yazar adını kitap adı yapma).\n' +
  '- emin: adı ne kadar net okuduğun (0-1).\n' +
  '- Okunamasa da her sırtı listele (ad: null).\n' +
  '- Kitap olmayan nesneleri ekleme: tablo, çerçeveli resim, kutu, fener, bitki, oyuncak, biblo, duvar yazısı.';

/**
 * Tarama istemi. Kayıtlı kitapların listesi verilirse model, uzaktan tam okunamayan bir sırtı (yarım okunan yazı,
 * yazar, yayınevi, sırt rengi ve yazı düzeni) listedeki bir kitapla eşleştirebilir. Kod denetler: listedeki ada
 * daha yüksek güven gerekir (LISTE_EMIN) ve bir ad yalnızca bir sırta verilir (tekilAdlar).
 */
export const scanPrompt = (adlar: string[]) =>
  SCAN_PROMPT_TABAN +
  (adlar.length
    ? '\n\nKullanıcının kitaplığında kayıtlı kitaplar aşağıda. Bir sırttaki yazıyı tam okuyamasan da okuyabildiğin harfler, ' +
      'kelime uzunlukları ve yazar adı listedeki bir kitapla AÇIKÇA uyuşuyorsa "ad" alanına listedeki adı aynen yaz. ' +
      'Uyuşma zayıfsa ya da birden çok kitaba benziyorsa "ad": null ver. Listedeki bir adı yalnızca bir sırta ver. ' +
      'Listede olmayan ama net okuduğun kitabın adını da yazabilirsin.\n' +
      `Liste: ${adlar.map(x => `"${x}"`).join(', ')}`
    : '');
const SCAN_PROMPT = scanPrompt([]);
/** Kayıtlı listeden eşleştirilen ad için gereken en düşük güven */
export const LISTE_EMIN = 0.6;

/**
 * Aynı ad birden çok sırta verildiyse en emin olanda kalır, ötekiler belirsiz olur. Kayıtlı listedeki bir ad
 * LISTE_EMIN'den düşük güvenle geldiyse belirsiz olur (yanlış sırta yerleşmesin).
 */
export function tekilAdlar(found: Bulunan[], adlar: string[]): Bulunan[] {
  const kayitli = new Set(adlar.map(foldTitle));
  const enIyi = new Map<string, Bulunan>();
  for (const f of found) {
    if (!f.ad) continue;
    const k = foldTitle(f.ad);
    if (kayitli.has(k) && f.emin < LISTE_EMIN) continue;
    const o = enIyi.get(k);
    if (!o || f.emin > o.emin) enIyi.set(k, f);
  }
  return found.map(f => (f.ad && enIyi.get(foldTitle(f.ad)) === f ? f : f.ad ? { ...f, ad: null, yazar: null } : f));
}

/** Telefonla yakından çekilmiş raf fotoğrafı: yalnızca okunan kitaplar (kutu gerekmez) */
const PHOTO_PROMPT =
  'Bu, bir kitaplığın yakından çekilmiş fotoğrafı. Sırtında ya da kapağında adı okunabilen HER kitabı listele.\n' +
  'YALNIZCA bir JSON dizisi döndür, başka hiçbir şey yazma: [{"ad": "...", "yazar": "...", "emin": 0.0}]\n' +
  '- ad: kitabın ADI, sırtta/kapakta gerçekten okuduğun yazı. Okuyamadığın kitabı listeye koyma; tahmin etme, seriden doldurma.\n' +
  '- yazar: okunuyorsa, yoksa null. Yalnızca yazar adı okunuyorsa o kitabı listeye koyma (yazar adını kitap adı yapma).\n' +
  '- Seri kitaplarında her cildi ayrı yaz (ör. "Savaş ve Barış I", "Savaş ve Barış II").\n' +
  '- Kitap olmayan nesneleri ekleme: tablo, çerçeve, kutu, oyun, biblo.';

/** Görüntü modeli çağrısı (testte sahte cevapla değiştirilir) */
export const deps = {
  async vision(jpegBase64: string, prompt = SCAN_PROMPT): Promise<string> {
    const r = await routellm<ChatResponse>('/chat/completions', {
      model: VISION_MODEL,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } }] }],
    });
    return String(r.choices?.[0]?.message?.content ?? '');
  },
};

/** Yakın çekim raf fotoğrafındaki kitapları kitaplığa ekle (rafta yeri olmadan). Zaten olanlar tekrar eklenmez. */
export async function addFromPhoto(jpegBase64: string): Promise<{ eklenen: string[]; zatenVar: string[] }> {
  const text = await deps.vision(jpegBase64, PHOTO_PROMPT);
  const s = text.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  let arr: any[] = [];
  try { arr = a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : []; } catch { arr = []; }
  const eklenen: string[] = [], zatenVar: string[] = [];
  for (const it of Array.isArray(arr) ? arr.slice(0, 200) : []) {
    if (!it || typeof it !== 'object' || (typeof it.emin === 'number' && it.emin < 0.4)) continue;
    const ad = str(it.ad, 160);
    if (!ad) continue;
    const r = addBook(ad, typeof it.yazar === 'string' ? it.yazar : null);
    if ('hata' in r) continue;
    (r.yeni ? eklenen : zatenVar).push(r.kitap.ad!);
  }
  console.log(`[kitaplık] fotoğraftan · ${eklenen.length} yeni · ${zatenVar.length} zaten vardı`);
  return { eklenen, zatenVar };
}

export interface TaramaCevabi { kitaplik: Kitaplik; bulunan: number; belirsiz: number; ms: number; model: string; parca: number; hata?: string }

/** Karenin bir parçası: JPEG ve karedeki yeri (0..1, aynalanmamış) */
export interface Parca { jpegBase64: string; x: number; y: number; w: number; h: number }

const area = (k: Kutu) => (k[2] - k[0]) * (k[3] - k[1]);
/**
 * İki parçanın örtüşen bölgesinde aynı kitap iki kez bulunur: aynı mı? Kutular örtüşüyorsa ya da (model iki parçada
 * kutuyu biraz farklı çizdiyse) aynı ad, aynı raf hizası ve birkaç sırt genişliği içinde.
 */
function sameBook(a: Bulunan, b: Bulunan) {
  const p = a.kutu, q = b.kutu;
  const ix = Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));
  const iy = Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0]));
  if (iou(p, q) > 0.4 || (ix * iy) / Math.min(area(p), area(q)) > 0.7) return true;
  if (!a.ad || !b.ad || foldTitle(a.ad) !== foldTitle(b.ad)) return false;
  const vy = iy / Math.min(p[2] - p[0], q[2] - q[0]);
  const dx = Math.abs((p[1] + p[3]) / 2 - (q[1] + q[3]) / 2);
  return vy > 0.5 && dx < Math.max(p[3] - p[1], q[3] - q[1]) * 3;
}

/**
 * Parçaların sonuçlarını tek haritada birleştir. Parça içi kutu → kare koordinatı. Örtüşmede aynı kitap iki kez gelirse
 * adı okunmuş olan, sonra daha büyük (kesilmemiş) olan, sonra daha emin olan kalır.
 */
export function mergeParts(parts: { x: number; y: number; w: number; h: number; found: Bulunan[] }[]): Bulunan[] {
  const all: Bulunan[] = parts.flatMap(p =>
    p.found.map(f => ({ ...f, kutu: [p.y + f.kutu[0] * p.h, p.x + f.kutu[1] * p.w, p.y + f.kutu[2] * p.h, p.x + f.kutu[3] * p.w] as Kutu })),
  );
  const rank = (f: Bulunan) => (f.ad ? 10 : 0) + area(f.kutu) * 400 + f.emin;
  const out: Bulunan[] = [];
  for (const f of all.sort((a, b) => rank(b) - rank(a))) if (!out.some(o => sameBook(o, f))) out.push(f);
  return out.sort((p, q) => p.kutu[1] - q.kutu[1] || p.kutu[0] - q.kutu[0]);
}

/** Parçaları görüntü modeline aynı anda gönder (en fazla 6) */
async function visionAll(parts: Parca[], prompt: string): Promise<{ text: string; err?: string }[]> {
  const out: { text: string; err?: string }[] = new Array(parts.length);
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const i = next++;
      try { out[i] = { text: await deps.vision(parts[i].jpegBase64, prompt) }; } catch (e) { out[i] = { text: '', err: (e as Error).message }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, parts.length) }, worker));
  return out;
}

export async function scanShelf(parts: Parca[], ref: Omit<Referans, 'at'>): Promise<TaramaCevabi> {
  const t0 = Date.now();
  // Kayıtlı kitaplar (telefonla, bölüm fotoğraflarıyla ya da elle eklenenler) modele aday liste olarak verilir
  const adlar = [...new Set(read().kitaplar.filter(b => b.ad).map(b => b.ad!))].slice(0, 400);
  const res = await visionAll(parts, scanPrompt(adlar));
  if (res.every(r => r.err)) throw new Error(res[0].err);
  const found = tekilAdlar(mergeParts(parts.map((p, i) => ({ ...p, found: parseScan(res[i].text) }))), adlar);
  const text = res.map(r => r.text).join(' ');
  const cur = read();
  if (!found.length) {
    // Boş sonuç: eski harita silinmez
    console.warn(`[kitaplık] tarama boş döndü (${text.slice(0, 120).replace(/\s+/g, ' ')})`);
    return { kitaplik: cur, bulunan: 0, belirsiz: 0, ms: Date.now() - t0, model: VISION_MODEL, parca: parts.length, hata: 'Görüntü modeli kitap bulamadı. Işığı artırıp yeniden deneyin ya da kutuları elle çizin.' };
  }
  const next: Kitaplik = { ...cur, kitaplar: mergeScan(cur.kitaplar, found), referans: { ...ref, at: new Date().toISOString() } };
  write(next);
  const belirsiz = found.filter(f => !f.ad).length;
  const failed = res.filter(r => r.err).length;
  console.log(`[kitaplık] tarandı · ${parts.length} parça${failed ? ` (${failed} hata)` : ''} · ${found.length - belirsiz} tanındı · ${belirsiz} belirsiz · ${adlar.length} kayıtlı aday · ${Date.now() - t0} ms · ${VISION_MODEL}`);
  return { kitaplik: next, bulunan: found.length - belirsiz, belirsiz, ms: Date.now() - t0, model: VISION_MODEL, parca: parts.length };
}

// ---------------------------------------------------------------- Kapak (Open Library)

const UA = { 'User-Agent': 'Jarvis kisisel asistan (kitaplik kapagi)' };
const coverFile = (id: string) => path.join(COVERS, `${id.replace(/[^\w-]/g, '')}.jpg`);

/** Open Library'ye aynı anda en fazla 4 istek (Kitaplığım yüzlerce kapağı birden ister) */
let olAktif = 0;
const olSira: (() => void)[] = [];
async function olSirada<T>(f: () => Promise<T>): Promise<T> {
  if (olAktif >= 4) await new Promise<void>(r => olSira.push(r));
  olAktif++;
  try { return await f(); } finally { olAktif--; olSira.shift()?.(); }
}

function openLibraryCover(ad: string, yazar: string | null): Promise<Buffer | null> {
  return olSirada(() => openLibraryCoverAra(ad, yazar));
}

async function openLibraryCoverAra(ad: string, yazar: string | null): Promise<Buffer | null> {
  const tries = [
    new URLSearchParams({ title: ad, ...(yazar ? { author: yazar } : {}), limit: '5', fields: 'cover_i,title' }),
    new URLSearchParams({ q: `${ad} ${yazar ?? ''}`.trim(), limit: '5', fields: 'cover_i,title' }),
  ];
  for (const q of tries) {
    try {
      const r = await fetch(`https://openlibrary.org/search.json?${q}`, { headers: UA, signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const d: any = await r.json();
      const doc = (d.docs ?? []).find((x: any) => x.cover_i);
      if (!doc) continue;
      const img = await fetch(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`, { headers: UA, signal: AbortSignal.timeout(9000) });
      const buf = Buffer.from(await img.arrayBuffer());
      if (img.ok && (img.headers.get('content-type') || '').startsWith('image/') && buf.length > 2000) return buf;
    } catch { /* ağ yok ya da zaman aşımı */ }
  }
  return null;
}

function update(id: string, fn: (b: Kitap) => Kitap): Kitap | null {
  const k = read();
  const i = k.kitaplar.findIndex(b => b.id === id);
  if (i < 0) return null;
  k.kitaplar[i] = kayitli(k.kitaplar[i], fn(k.kitaplar[i]));
  write(k);
  return k.kitaplar[i];
}

// ---------------------------------------------------------------- Özet

// ---------------------------------------------------------------- Jarvis'in kitap defteri (RouteLLM)

const fillPrompt = (b: Kitap, shelf: string[]) =>
  `"${b.ad}"${b.yazar ? ` (${b.yazar})` : ''} kitabı için, okuyan birinin kitap defteri gibi Türkçe içerik hazırla. YALNIZCA JSON döndür, başka hiçbir şey yazma:\n` +
  '{"biliyorum": true, "yazar": "...", "tur": "roman | deneme | biyografi | ...", "yil": 1974, "ozet": "...", "anaFikirler": ["..."], "yazarHakkinda": "...", "temalar": ["..."], "nedenOku": "...", "kimeUygun": "...", "benzer": ["..."]}\n' +
  'Alanlar:\n' +
  '- ozet: tam 3 cümle; konusu, ana fikri, neden önemli. Sürprizleri (spoiler) verme.\n' +
  '- anaFikirler: 4-6 madde, her biri 1-2 kısa cümle; kitabın öne çıkan fikirleri ya da (romansa) olay örgüsünü bozmadan ana hatları.\n' +
  '- yazarHakkinda: 2-3 cümle. temalar: 3-5 kısa ifade. nedenOku: 2 cümle. kimeUygun: 1 cümle. yil: ilk yayın yılı (emin değilsen null).\n' +
  `- benzer: aşağıdaki kitaplıktan bu kitapla en ilgili EN FAZLA 4 kitabın adı, listede yazıldığı gibi; uygun yoksa boş dizi. Kitaplık: ${shelf.join(' | ')}\n` +
  'Kurallar: Kitabı tanımıyorsan ya da hangi kitap olduğundan emin değilsen YALNIZCA {"biliyorum": false} döndür; uydurma. ' +
  'Kitaptan birebir alıntı yazma (cümle aktarma yok, kendi cümlelerinle anlat). Türkçe yaz.';

/** Sohbet modeli çağrısı (testte sahte cevapla değiştirilir) */
export const chatDeps = {
  async chat(prompt: string): Promise<string> {
    if (MOCK) return JSON.stringify({ biliyorum: true, ozet: 'Örnek özet: gerçek içerik için ABACUS_API_KEY gerekir. Bu bir deneme metnidir. Kitap kaydedildi.', anaFikirler: ['Deneme fikri bir.', 'Deneme fikri iki.', 'Deneme fikri üç.', 'Deneme fikri dört.'], yazarHakkinda: null, temalar: ['deneme'], nedenOku: null, kimeUygun: null, benzer: [] });
    const r = await routellm<ChatResponse>('/chat/completions', { model: CHAT_MODEL, messages: [{ role: 'user', content: prompt }] });
    return String(r.choices?.[0]?.message?.content ?? '');
  },
};

const filling = new Map<string, Promise<Kitap | null>>();

/**
 * Kitabın Jarvis sayfalarını doldur: özet (yoksa), ana fikirler, yazar, temalar, neden okumalı, kime uygun ve
 * kullanıcının kitaplığından benzer kitaplar. Model kitabı tanımıyorsa uydurmaz (bilinmiyor işaretlenir).
 * Aynı kitap için aynı anda tek istek.
 */
export function fillBook(id: string, again = false): Promise<Kitap | null> {
  const cur = read().kitaplar.find(b => b.id === id);
  if (!cur || !cur.ad) return Promise.resolve(cur ?? null);
  if (cur.jarvis && !again) return Promise.resolve(cur);
  if (filling.has(id)) return filling.get(id)!;
  const job = (async () => {
    const shelf = read().kitaplar.filter(b => b.ad && b.id !== id).map(b => b.ad!).slice(0, 220);
    const text = await chatDeps.chat(fillPrompt(cur, shelf));
    const s = text.replace(/```(?:json)?/gi, '');
    const a = s.indexOf('{'), z = s.lastIndexOf('}');
    let j: any = null;
    try { j = a >= 0 && z > a ? JSON.parse(s.slice(a, z + 1)) : null; } catch { j = null; }
    const at = new Date().toISOString();
    if (!j || j.biliyorum !== true) {
      console.log(`[kitaplık] doldur · ${cur.ad} · model kitabı tanımadı`);
      return update(id, x => ({ ...x, jarvis: { bilinmiyor: true, anaFikirler: [], yazarHakkinda: null, temalar: [], nedenOku: null, kimeUygun: null, tur: null, yil: null, benzer: [], at } }));
    }
    const list = (v: unknown, n: number, max = 300) => strList(v).slice(0, n).map(x => x.slice(0, max));
    const names = new Map(shelf.map(t => [foldTitle(t), t]));
    const yil = Math.round(Number(j.yil));
    const page: JarvisSayfa = {
      anaFikirler: list(j.anaFikirler, 6),
      yazarHakkinda: str(j.yazarHakkinda, 500),
      temalar: list(j.temalar, 5, 60),
      nedenOku: str(j.nedenOku, 400),
      kimeUygun: str(j.kimeUygun, 250),
      tur: str(j.tur, 40),
      yil: Number.isFinite(yil) && yil > -3000 && yil <= new Date().getFullYear() ? yil : null,
      // Yalnızca gerçekten kitaplıkta olanlar
      benzer: strList(j.benzer).map(t => names.get(foldTitle(t))).filter((t): t is string => !!t).slice(0, 4),
      at,
    };
    const nb = update(id, x => ({ ...x, ozet: x.ozet ?? str(j.ozet, 1200), yazar: x.yazar ?? str(j.yazar, 120), jarvis: page }));
    console.log(`[kitaplık] doldur · ${cur.ad} · ${page.anaFikirler.length} fikir · ${page.benzer.length} benzer`);
    return nb;
  })().finally(() => filling.delete(id));
  filling.set(id, job);
  return job;
}

/** Sesle eklenince bekletmeden arka planda doldur (bitince SSE ile ekranlar yenilenir) */
export function fillInBackground(id: string) {
  fillBook(id).catch(e => console.warn('[kitaplık] doldurulamadı', (e as Error).message));
}

// ---------------------------------------------------------------- Jarvis için (talimat + araçlar)

/** Kitap adından kitabı bul ("Davranış'a not ekle" → Davranış). Birden çok aday varsa hepsini döndür. */
export function findBook(q: string): { kitap: Kitap } | { hata: string; adaylar?: string[] } {
  const list = read().kitaplar.filter(b => b.ad);
  const n = normTitle(q);
  if (!n) return { hata: 'Kitap adı boş.' };
  const exact = list.filter(b => normTitle(b.ad!) === n);
  if (exact.length === 1) return { kitap: exact[0] };
  const words = n.split(' ').filter(w => w.length > 2);
  const scored = list
    .map(b => {
      const t = normTitle(b.ad!), y = b.yazar ? normTitle(b.yazar) : '';
      let s = 0;
      if (t.startsWith(n) || n.startsWith(t)) s += 3;
      else if (t.includes(n)) s += 2;
      for (const w of words) if (t.includes(w.slice(0, Math.max(4, w.length - 2)))) s += 1; else if (y.includes(w)) s += 0.5;
      return { b, s };
    })
    .filter(x => x.s >= 1.5)
    .sort((p, q2) => q2.s - p.s);
  if (!scored.length) return { hata: `Kitaplıkta "${q}" bulunamadı.` };
  if (scored.length > 1 && scored[1].s === scored[0].s) return { hata: 'Birden fazla kitap uyuyor; hangisi?', adaylar: scored.slice(0, 5).map(x => x.b.ad!) };
  return { kitap: scored[0].b };
}

/** Kitabı kitaplığa ekle (rafta yeri olmadan; K ayarında bir kutuya yerleştirilebilir). Varsa olanı döndürür. */
export function addBook(ad: string, yazar?: string | null, ek: Partial<Pick<Kitap, 'rafDisi'>> = {}): { kitap: Kitap; yeni: boolean } | { hata: string } {
  const t = str(ad, 160);
  if (!t) return { hata: 'Kitap adı boş.' };
  const k = read();
  const old = k.kitaplar.find(b => b.ad && foldTitle(b.ad) === foldTitle(t));
  if (old) return { kitap: old, yeni: false };
  const b: Kitap = { id: randomUUID().slice(0, 8), ad: t, yazar: str(yazar ?? null, 120), kutu: null, kapak: null, ozet: null, notlar: [], alintilar: [], durum: 'okunacak', elle: true, ...ek, kayitlar: [{ tur: 'durum', metin: 'eklendi', at: new Date().toISOString() }] };
  write({ ...k, kitaplar: [...k.kitaplar, b] });
  console.log(`[kitaplık] eklendi · ${t}${b.yazar ? ` (${b.yazar})` : ''}`);
  return { kitap: b, yeni: true };
}

function appendNote(id: string, metin: string, tur: 'not' | 'alinti'): Kitap | null {
  const t = str(metin);
  if (!t) return null;
  return update(id, x => {
    const key = tur === 'alinti' ? 'alintilar' : 'notlar';
    if (x[key].some(v => v.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))) return x;
    return { ...x, [key]: [...x[key], t].slice(-MAX_ITEMS) };
  });
}

/** Jarvis aracı: kitap kitaplıkta yoksa önce eklenir (kitap kaydettikçe Jarvis'in hafızası güncellenir) */
export function addBookNote(kitap: string, metin: string, tur: 'not' | 'alinti', yazar?: string) {
  if (!str(metin)) return { hata: 'Not boş.' };
  let f = findBook(kitap);
  let yeniKitap = false;
  if ('hata' in f) {
    if ('adaylar' in f && f.adaylar) return f;
    const a = addBook(kitap, yazar);
    if ('hata' in a) return a;
    f = { kitap: a.kitap };
    yeniKitap = true;
  }
  const b = appendNote(f.kitap.id, metin, tur)!;
  return { ok: true, kitap: b.ad, tur, toplam: tur === 'alinti' ? b.alintilar.length : b.notlar.length, ...(yeniKitap ? { yeniKitap: true, bilgi: 'Kitap kitaplıkta yoktu, eklendi (rafta yeri yok).' } : {}) };
}

export function setBookStatus(kitap: string, a: { durum?: string; sayfa?: unknown; toplam_sayfa?: unknown }) {
  const f = findBook(kitap);
  if ('hata' in f) return f;
  const b = update(f.kitap.id, x => {
    const sayfa = posInt(a.sayfa) ?? x.sayfa;
    let durum = DURUMLAR.includes(a.durum as Durum) ? (a.durum as Durum) : x.durum;
    // Sayfa söylendiyse okunuyor demektir (bitti demediyse)
    if (a.sayfa !== undefined && !a.durum && durum === 'okunacak') durum = 'okunuyor';
    return { ...x, durum, sayfa, toplamSayfa: posInt(a.toplam_sayfa) ?? x.toplamSayfa };
  })!;
  return { ok: true, kitap: b.ad, durum: b.durum, sayfa: b.sayfa ?? null, toplamSayfa: b.toplamSayfa ?? null };
}

/** Talimata girecek kitaplık bölümü: Jarvis kitaplığı kayıt edildikçe kendiliğinden bilir */
export function libraryForPrompt(): string {
  const all = read().kitaplar;
  const named = all.filter(b => b.ad);
  if (!named.length) return '(kitaplık henüz taranmadı)';
  const order = { okunuyor: 0, bitti: 1, okunacak: 2 } as const;
  const lines = [...named]
    .sort((a, b) => order[a.durum] - order[b.durum] || (b.notlar.length + b.alintilar.length) - (a.notlar.length + a.alintilar.length))
    .slice(0, 160)
    .map(b => {
      const bits = [`${b.ad}${b.yazar ? ` · ${b.yazar}` : ''}`, b.durum + (b.sayfa ? ` (s. ${b.sayfa}${b.toplamSayfa ? `/${b.toplamSayfa}` : ''})` : '')];
      if (b.notlar.length) bits.push(`notlar: ${b.notlar.slice(-3).map(x => `"${x.slice(0, 100)}"`).join(', ')}`);
      if (b.alintilar.length) bits.push(`${b.alintilar.length} alıntı`);
      if (!b.kutu) bits.push('rafta yeri bilinmiyor');
      return `- ${bits.join(' · ')}`;
    });
  const belirsiz = all.length - named.length;
  return lines.join('\n') + (named.length > 160 ? `\n(+${named.length - 160} kitap daha)` : '') + (belirsiz ? `\n(${belirsiz} sırt okunamadı)` : '');
}

// ---------------------------------------------------------------- HTTP

export const parseDataUrl = (s: unknown): Buffer | null => {
  const m = typeof s === 'string' ? /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(s) : null;
  return m ? Buffer.from(m[2], 'base64') : null;
};

export function libraryRouter(): Router {
  const r = Router();
  const coverBusy = new Map<string, Promise<boolean>>();

  r.get('/api/kitaplik', (_req, res) => res.json(read()));

  // Kitaplık ayar modu: tüm haritayı kaydet (kutular, adlar). Notlar/özetler istemcide eksikse eskisi korunur.
  r.post('/api/kitaplik', (req, res) => {
    const body = req.body ?? {};
    if (!Array.isArray(body.kitaplar)) return res.status(400).json({ error: 'kitaplar dizisi gerekli' });
    const cur = read();
    const kitaplar = body.kitaplar.slice(0, MAX_BOOKS).map((b: any) => clean(b, cur.kitaplar.find(o => o.id === b?.id)));
    let referans = cur.referans;
    if (body.referans && typeof body.referans.kucukResim === 'string') {
      const g = posInt(body.referans.genislik, 10000), y = posInt(body.referans.yukseklik, 10000);
      if (g && y && body.referans.kucukResim.length < 20000) referans = { genislik: g, yukseklik: y, kucukResim: body.referans.kucukResim, at: new Date().toISOString() };
    }
    // Bölüm alanları (K ayar modunda çizilir); fotoğraflar ve listeler korunur
    const bol = cur.bolumler.map(b => {
      const g = Array.isArray(body.bolumler) ? body.bolumler.find((x: any) => x?.id === b.id) : null;
      return g && 'alan' in g ? { ...b, alan: g.alan === null ? null : validBox(g.alan) ?? b.alan } : b;
    });
    const next = { kitaplar, referans, bolumler: bol };
    write(next);
    console.log(`[kitaplık] elle kaydedildi · ${kitaplar.length} kitap`);
    res.json(next);
  });

  // Tarama: istemci tam çözünürlüklü kareyi örtüşen parçalara bölüp büyütür (uzaktaki sırtlar ancak böyle okunuyor);
  // parçalar: [{ resim, x, y, w, h }] (karedeki yeri 0..1). Tek parça için yalnızca "resim" de olur.
  r.post('/api/kitaplik/tara', async (req, res) => {
    const genislik = posInt(req.body?.genislik, 10000), yukseklik = posInt(req.body?.yukseklik, 10000);
    const kucukResim = typeof req.body?.kucukResim === 'string' && req.body.kucukResim.length < 20000 ? req.body.kucukResim : '';
    const raw: any[] = Array.isArray(req.body?.parcalar) ? req.body.parcalar.slice(0, 12) : req.body?.resim ? [{ resim: req.body.resim, x: 0, y: 0, w: 1, h: 1 }] : [];
    const parts: Parca[] = [];
    for (const p of raw) {
      const img = parseDataUrl(p?.resim);
      const box = validBox([p?.y, p?.x, Number(p?.y) + Number(p?.h), Number(p?.x) + Number(p?.w)]);
      if (!img || !box) return res.status(400).json({ error: 'parça geçersiz: resim (JPEG data URL) ve karedeki yeri (x, y, w, h: 0..1) gerekli' });
      parts.push({ jpegBase64: img.toString('base64'), x: box[1], y: box[0], w: box[3] - box[1], h: box[2] - box[0] });
    }
    if (!parts.length || !genislik || !yukseklik) return res.status(400).json({ error: 'resim ya da parcalar, genislik ve yukseklik gerekli' });
    try {
      res.json(await scanShelf(parts, { genislik, yukseklik, kucukResim }));
    } catch (e) {
      console.warn('[kitaplık] tarama hatası', (e as Error).message);
      res.status(502).json({ error: `Tarama yapılamadı: ${String((e as Error).message).slice(0, 120)}` });
    }
  });

  // Elle ekle (Ayarlar → Kitaplık): rafta yeri olmadan
  r.post('/api/kitaplik/yeni', (req, res) => {
    const a = addBook(String(req.body?.ad ?? ''), req.body?.yazar ?? null);
    if ('hata' in a) return res.status(400).json({ error: a.hata });
    res.json(a);
  });

  // Telefonla yakından çekilmiş raf fotoğrafı → okunan kitaplar eklenir
  r.post('/api/kitaplik/fotograf', async (req, res) => {
    const img = parseDataUrl(req.body?.resim);
    if (!img) return res.status(400).json({ error: 'resim (JPEG data URL) gerekli' });
    try {
      res.json(await addFromPhoto(img.toString('base64')));
    } catch (e) {
      res.status(502).json({ error: `Fotoğraf okunamadı: ${String((e as Error).message).slice(0, 120)}` });
    }
  });

  // Açık kitaba not/alıntı ekle ("Jarvis, not al: …")
  r.post('/api/kitaplik/:id/not', (req, res) => {
    const b = appendNote(String(req.params.id), String(req.body?.metin ?? ''), req.body?.tur === 'alinti' ? 'alinti' : 'not');
    if (!b) return res.status(400).json({ error: 'kitap yok ya da not boş' });
    res.json({ kitap: b });
  });

  r.post('/api/kitaplik/:id', (req, res) => {
    const b = update(String(req.params.id), x => {
      const n = clean({ ...req.body, id: x.id, elle: 'ad' in (req.body ?? {}) || 'kutu' in (req.body ?? {}) ? true : undefined }, x);
      // Kitabın adı değişti: eski kitaba ait özet, Jarvis sayfaları ve kapak geçersiz
      if (n.ad && (!x.ad || foldTitle(n.ad) !== foldTitle(x.ad))) {
        fs.rmSync(coverFile(x.id), { force: true });
        return { ...n, ozet: 'ozet' in (req.body ?? {}) ? n.ozet : null, jarvis: undefined, kapak: null, kapakArandi: undefined };
      }
      return n;
    });
    if (!b) return res.status(404).json({ error: 'kitap yok' });
    res.json({ kitap: b });
  });

  r.delete('/api/kitaplik/:id', (req, res) => {
    const k = read();
    const hit = k.kitaplar.find(b => b.id === req.params.id);
    if (!hit) return res.status(404).json({ error: 'kitap yok' });
    write({ ...k, kitaplar: k.kitaplar.filter(b => b.id !== hit.id) });
    fs.rmSync(coverFile(hit.id), { force: true });
    res.json({ ok: true });
  });

  // Kapak: önbellekte varsa onu, yoksa Open Library'de ad + yazarla ara. Bulunamazsa 404 (istemci sırttan kapak üretir).
  r.get('/api/kitaplik/:id/kapak', async (req, res) => {
    const id = String(req.params.id);
    const b = read().kitaplar.find(x => x.id === id);
    if (!b) return res.status(404).end();
    const file = coverFile(id);
    if (fs.existsSync(file)) return res.type('jpeg').set('Cache-Control', 'no-cache').send(fs.readFileSync(file));
    const DAY = 864e5;
    if (!b.ad || (b.kapakArandi && Date.now() - b.kapakArandi < 7 * DAY)) return res.status(404).end();
    if (!coverBusy.has(id)) {
      coverBusy.set(id, openLibraryCover(b.ad, b.yazar).then(buf => {
        if (buf) { fs.mkdirSync(COVERS, { recursive: true }); fs.writeFileSync(file, buf); }
        update(id, x => ({ ...x, kapakArandi: Date.now(), kapak: buf ? 'openlibrary' : x.kapak }));
        console.log(`[kitaplık] kapak · ${b.ad} · ${buf ? `Open Library (${Math.round(buf.length / 1024)} KB)` : 'bulunamadı'}`);
        return !!buf;
      }).finally(() => coverBusy.delete(id)));
    }
    const ok = await coverBusy.get(id);
    if (ok && fs.existsSync(file)) return res.type('jpeg').send(fs.readFileSync(file));
    res.status(404).end();
  });

  // Kapak yükleme (Türkçe baskılar Open Library'de çoğu zaman yok): telefondan çekilmiş fotoğraf
  r.post('/api/kitaplik/:id/kapak', (req, res) => {
    const id = String(req.params.id);
    const img = parseDataUrl(req.body?.resim);
    if (!img || img.length > 6e6) return res.status(400).json({ error: 'resim (JPEG/PNG data URL) gerekli' });
    if (!read().kitaplar.some(x => x.id === id)) return res.status(404).json({ error: 'kitap yok' });
    fs.mkdirSync(COVERS, { recursive: true });
    fs.writeFileSync(coverFile(id), img);
    const b = update(id, x => ({ ...x, kapak: 'yuklendi' }));
    res.json({ kitap: b });
  });

  // Jarvis sayfaları + özet (yoksa). ?yenile=1 yeniden yazar. Eski /ozet adı da aynı işi yapar.
  const fill = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const b = read().kitaplar.find(x => x.id === id);
    if (!b) return res.status(404).json({ error: 'kitap yok' });
    if (!b.ad) return res.status(400).json({ error: 'Kitabın adı bilinmiyor; önce adını yazın.' });
    try {
      const again = req.query.yenile === '1';
      if (again) update(id, x => ({ ...x, ozet: null }));
      const nb = await fillBook(id, again);
      res.json({ kitap: nb, bilinmiyor: !!nb?.jarvis?.bilinmiyor });
    } catch (e) {
      res.status(502).json({ error: `Jarvis sayfaları yazılamadı: ${String((e as Error).message).slice(0, 120)}` });
    }
  };
  r.post('/api/kitaplik/:id/doldur', fill);
  r.post('/api/kitaplik/:id/ozet', fill);

  return r;
}
