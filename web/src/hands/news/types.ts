// Haber Modu · sunucudan gelen veri (server/src/newsCenter.ts, newsAnalysis.ts, factcheck.ts ile aynı biçim)

export type Kategori = 'gundem' | 'ekonomi' | 'dunya' | 'spor' | 'teknoloji' | 'bilim';
export const KATEGORI_AD: Record<Kategori, string> = { gundem: 'GÜNDEM', ekonomi: 'EKONOMİ', dunya: 'DÜNYA', spor: 'SPOR', teknoloji: 'TEKNOLOJİ', bilim: 'BİLİM' };
export const KATEGORI_RENK: Record<Kategori, string> = { gundem: '#ff4d5e', ekonomi: '#3ee08f', dunya: '#5fb4ff', spor: '#ffb340', teknoloji: '#b58cff', bilim: '#4ff0e0' };
export const KATEGORI_SIRA: Kategori[] = ['gundem', 'ekonomi', 'dunya', 'spor', 'teknoloji', 'bilim'];

export interface KumeOzet {
  id: string; baslik: string; kategori: Kategori; kaynakSayisi: number; kaynaklar: string[];
  ilk: string; son: string; foto: string | null; sonDakika: boolean; kokler: string[];
  url: string; kaynak: string;
  /** Olay takipte */
  takipte?: boolean;
}
export interface Merkez {
  kumeler: KumeOzet[];
  kategoriler: { id: Kategori; ad: string; sayi: number }[];
  kaynaklar: { toplam: number; calisan: number };
  at: string;
}
export interface TemelKume { ozet: KumeOzet; haberler: { kaynak: string; baslik: string; ozet: string; saat: string; url: string }[] }

export interface KaynakMetin { kaynak: string; baslik: string; ilkCumle: string; saat: string; url: string; metin: string; tam: boolean }
export interface Alinti { kaynak: string; metin: string }
export type MaddeTur = 'ortak' | 'vurgu' | 'bazilari' | 'sayilar';
export interface KarsilastirmaMadde { tur: MaddeTur; baslik: string; alintilar: Alinti[]; gecen?: string[]; gecmeyen?: string[] }
export type BoslukTur = 'ne-zaman' | 'nerede' | 'neden' | 'maliyet' | 'kaynaksiz-sayi' | 'celiski' | 'takip';
export interface Soru { soru: string; bosluk: BoslukTur; not: string; kanit?: Alinti }
export interface OncekiHaber { tarih: string; baslik: string; kaynaklar: { ad: string; baslik: string; url: string; saat: string; ozet: string }[]; benzerlik: number }
export interface Detay {
  id: string; baslik: string; kategori: Kategori;
  kaynaklar: KaynakMetin[];
  ozet: string[];
  sayilar: { deger: string; baglam: string; kaynak: string }[];
  sehirler: string[];
  zaman: { saat: string; metin: string }[];
  onceki: OncekiHaber[];
}
export interface Analiz { detay: Detay; karsilastirma: { maddeler: KarsilastirmaMadde[]; anlatim: string[] }; sorular: Soru[]; model: boolean; at: string }

export type Etiket = 'VERİYLE UYUMLU' | 'VERİYLE ÇELİŞİYOR' | 'EKSİK BAĞLAM' | 'DOĞRULANAMADI';
export interface IddiaSonuc {
  id: string; kaynak: string; alinti: string; haberUrl: string; etiket: Etiket; aciklama: string;
  veri: { ad: string; url: string; tarih: string; deger?: string; birim?: string; seri?: { etiket: string; deger: number }[] };
  ilgili: { ad: string; baslik: string; url: string; tarih: string }[];
}

export interface Sabah {
  hava: { city: string; temp: number; description: string; today: { max: number; min: number; rain_prob: number | null }; hourly: { time: string; temp: number; rain_prob: number | null }[] } | null;
  piyasa: { items: { code: string; name: string; value: number; change_pct: number | null }[]; date: string; source: string } | null;
  trafik: { sehir: string; genel: number; anadolu: number; avrupa: number; durum: string; seri: { saat: string; deger: number }[]; kaynak: string; url: string } | null;
  gundem: KumeOzet[];
  ajanda: null;
  at: string;
}

// ———————————————— Arama (server/src/newsSearch.ts) ————————————————
export type Dil = 'tr' | 'en';
export type AramaOlay =
  | { tip: 'basla'; q: string; yayinlar: { ad: string; dil: Dil; konum: [number, number] }[]; arsivGun: number }
  | { tip: 'adim'; ad: string }
  | { tip: 'sorguEn'; qEn: string | null }
  | { tip: 'kaynak'; ad: string; dil: Dil; grup: 'kendi' | 'dunya' | 'arsiv' | 'google'; adet: number; konum: [number, number] | null }
  | { tip: 'baslik'; baslik: string; kaynak: string; saat: string; dil: Dil; foto: string | null }
  | { tip: 'bitti'; kumeler: KumeOzet[]; sayac: { yayin: number; haber: number; olay: number; arsiv: number }; sure: number }
  | { tip: 'hata'; hata: string };

// ———————————————— Dünya basını (server/src/worldNews.ts) ————————————————
export interface DunyaAlinti { kaynak: string; metin: string; ceviri?: string }
export interface DunyaYayin { kaynak: string; ulke: string; baslik: string; baslikTr: string | null; url: string; saat: string; vurgu: string | null; alinti: DunyaAlinti | null; tam: boolean }
export interface DunyaMadde { baslik: string; tr: DunyaAlinti | null; en: DunyaAlinti | null }
export interface DunyaBasini {
  durum: 'bulundu' | 'yok' | 'model-yok';
  taranan: { yayin: number; haber: number; google: number };
  yayinlar: DunyaYayin[];
  basliklar: { kaynak: string; baslik: string; url: string; saat: string }[];
  ortak: DunyaMadde[]; cerceve: DunyaMadde[]; yalnizDunya: DunyaMadde[]; yalnizTurk: DunyaMadde[];
  sorgu: string; at: string;
}

// ———————————————— Haber merkezi komutları (server/src/newsCenter.ts) ————————————————
export interface SonDakika { kume: KumeOzet | null; dakika: number | null }
export interface Basin {
  kaynaklar: { kaynak: string; baslik: string; saat: string; url: string; kumeId: string | null }[];
  ortak: { kume: KumeOzet; sayi: number }[];
  mansetteYok: KumeOzet | null;
  at: string;
}
export interface DunyaBugun { olaylar: { kume: KumeOzet; yer: string; konum: [number, number] }[]; at: string }
