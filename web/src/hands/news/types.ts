// Haber Modu · sunucudan gelen veri (server/src/newsCenter.ts, newsAnalysis.ts, factcheck.ts ile aynı biçim)

export type Kategori = 'gundem' | 'ekonomi' | 'dunya' | 'spor' | 'teknoloji' | 'bilim';
export const KATEGORI_AD: Record<Kategori, string> = { gundem: 'GÜNDEM', ekonomi: 'EKONOMİ', dunya: 'DÜNYA', spor: 'SPOR', teknoloji: 'TEKNOLOJİ', bilim: 'BİLİM' };
export const KATEGORI_RENK: Record<Kategori, string> = { gundem: '#ff4d5e', ekonomi: '#3ee08f', dunya: '#5fb4ff', spor: '#ffb340', teknoloji: '#b58cff', bilim: '#4ff0e0' };
export const KATEGORI_SIRA: Kategori[] = ['gundem', 'ekonomi', 'dunya', 'spor', 'teknoloji', 'bilim'];

export interface KumeOzet {
  id: string; baslik: string; kategori: Kategori; kaynakSayisi: number; kaynaklar: string[];
  ilk: string; son: string; foto: string | null; sonDakika: boolean; kokler: string[];
  url: string; kaynak: string;
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
