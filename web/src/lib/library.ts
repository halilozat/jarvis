// Kitaplık sunucu uç noktaları (server/src/library.ts). Kutular VİDEO NORMALİZE: [ymin, xmin, ymax, xmax], 0..1, aynalanmamış.
import { token } from './api';

export type Durum = 'okunacak' | 'okunuyor' | 'bitti';
export type Kutu = [number, number, number, number];

export interface Kitap {
  id: string;
  ad: string | null;
  yazar: string | null;
  kutu: Kutu | null;
  kapak: string | null;
  ozet: string | null;
  notlar: string[];
  alintilar: string[];
  durum: Durum;
  sayfa?: number;
  toplamSayfa?: number;
  emin?: number;
  elle?: boolean;
  /** Jarvis'in kitap defteri sayfaları (RouteLLM) */
  jarvis?: JarvisSayfa;
}
export interface JarvisSayfa {
  bilinmiyor?: boolean;
  anaFikirler: string[];
  yazarHakkinda: string | null;
  temalar: string[];
  nedenOku: string | null;
  kimeUygun: string | null;
  tur: string | null;
  yil: number | null;
  benzer: string[];
  at: string;
}
export interface Referans { genislik: number; yukseklik: number; kucukResim: string; at?: string }
export interface Kitaplik { kitaplar: Kitap[]; referans: Referans | null }
export interface TaramaCevabi { kitaplik: Kitaplik; bulunan: number; belirsiz: number; ms: number; model: string; parca: number; hata?: string }
/** Karenin bir parçası (JPEG) ve karedeki yeri (0..1, aynalanmamış) */
export interface TaramaParcasi { resim: string; x: number; y: number; w: number; h: number }

const headers = (): HeadersInit => ({ 'Content-Type': 'application/json', ...(token ? { 'x-jarvis-token': token } : {}) });
async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `sunucu ${r.status}`);
  return r.json();
}
const post = <T>(url: string, body: unknown) => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(r => json<T>(r));

export const getLibrary = () => fetch('/api/kitaplik', { headers: headers() }).then(r => json<Kitaplik>(r));
export const saveLibrary = (k: { kitaplar: Kitap[]; referans?: Referans | null }) => post<Kitaplik>('/api/kitaplik', k);
export const scanLibrary = (body: { parcalar: TaramaParcasi[]; genislik: number; yukseklik: number; kucukResim: string }) => post<TaramaCevabi>('/api/kitaplik/tara', body);

/**
 * Tam çözünürlüklü kareyi örtüşen parçalara böl ve büyüt. Uzaktaki sırtlar tek karede okunmuyor: gerçek rafta tam
 * kare 20 kutu / ~8 doğru ad verirken, aynı bölgenin büyütülmüş parçası tek başına 53 kutu / ~25 doğru ad verdi.
 */
export function tileFrame(frame: HTMLCanvasElement, region: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 1, h: 1 }, cols = 3, rows = 2, overlap = 0.12): TaramaParcasi[] {
  const tw = region.w / (cols - (cols - 1) * overlap), th = region.h / (rows - (rows - 1) * overlap);
  const out: TaramaParcasi[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = region.x + Math.min(region.w - tw, c * tw * (1 - overlap)), y = region.y + Math.min(region.h - th, r * th * (1 - overlap));
      const sw = tw * frame.width, sh = th * frame.height;
      const k = Math.min(2, 1600 / sw);
      const cv = document.createElement('canvas');
      cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
      const g = cv.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(frame, x * frame.width, y * frame.height, sw, sh, 0, 0, cv.width, cv.height);
      out.push({ resim: cv.toDataURL('image/jpeg', 0.88), x, y, w: tw, h: th });
    }
  }
  return out;
}

/** Önceki haritadaki kutuların kapsadığı bölge (+%5 pay): yeniden taramada parçalar yalnızca rafı kapsar, sırtlar büyür */
export function shelfRegion(books: Kitap[]): { x: number; y: number; w: number; h: number } | undefined {
  const k = books.map(b => b.kutu).filter((v): v is Kutu => !!v);
  if (k.length < 5) return undefined;
  const m = 0.05;
  const y0 = Math.max(0, Math.min(...k.map(v => v[0])) - m), x0 = Math.max(0, Math.min(...k.map(v => v[1])) - m);
  const y1 = Math.min(1, Math.max(...k.map(v => v[2])) + m), x1 = Math.min(1, Math.max(...k.map(v => v[3])) + m);
  // Kamera kıpırdamışsa eski bölge yanlış olabilir: çok küçükse tüm kare
  return (x1 - x0) * (y1 - y0) < 0.15 ? undefined : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export const addBook = (ad: string, yazar?: string) => post<{ kitap: Kitap; yeni: boolean }>('/api/kitaplik/yeni', { ad, yazar });
/** Telefonla yakından çekilmiş raf fotoğrafı: okunan kitaplar kitaplığa eklenir */
export const addFromPhoto = (resim: string) => post<{ eklenen: string[]; zatenVar: string[] }>('/api/kitaplik/fotograf', { resim });
export const addNote = (id: string, metin: string, tur: 'not' | 'alinti' = 'not') => post<{ kitap: Kitap }>(`/api/kitaplik/${encodeURIComponent(id)}/not`, { metin, tur });
export const patchBook = (id: string, patch: Partial<Kitap>) => post<{ kitap: Kitap }>(`/api/kitaplik/${encodeURIComponent(id)}`, patch);
export const deleteBook = (id: string) => fetch(`/api/kitaplik/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() }).then(r => json<{ ok: true }>(r));
/** Jarvis sayfalarını (özet, ana fikirler, yazar, temalar, benzerler) doldur; again: yeniden yaz */
export const fillBook = (id: string, again = false) => post<{ kitap: Kitap; bilinmiyor?: boolean }>(`/api/kitaplik/${encodeURIComponent(id)}/doldur${again ? '?yenile=1' : ''}`, {});
export const uploadCover = (id: string, resim: string) => post<{ kitap: Kitap }>(`/api/kitaplik/${encodeURIComponent(id)}/kapak`, { resim });
/** <img src> için (token sorgu parametresiyle); v: önbelleği kırmak için */
export const coverUrl = (id: string, v = '') => `/api/kitaplik/${encodeURIComponent(id)}/kapak?${new URLSearchParams({ ...(token ? { token } : {}), ...(v ? { v } : {}) })}`;

/** Görsel adı: "Otostopçunun Galaksi Rehberi · Adams" (yazarın soyadı) */
export function shortLabel(k: Pick<Kitap, 'ad' | 'yazar'>): string {
  const ad = k.ad || 'BELİRSİZ';
  // Birden çok yazar varsa ilki ("Nir Eyal & Julie Li" → Eyal)
  const last = k.yazar ? k.yazar.split(/[&,]| ve /)[0].trim().split(/\s+/).pop() : '';
  return (last ? `${ad} · ${last}` : ad).toLocaleUpperCase('tr');
}
