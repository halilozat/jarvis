export type Device = 'masaustu' | 'tablet' | 'telefon';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source: string;
  published_at: string;
  url: string;
  image_url: string | null;
}

export type Gorsel =
  | { tip: 'yok' }
  | { tip: 'baslik'; kategori?: string; metin: string; kaynaklar?: string[] }
  | { tip: 'sayi'; deger: number; birim?: string; etiket: string; yon?: 'yukari' | 'asagi' | 'sabit'; kaynak?: string }
  | { tip: 'grafik'; baslik: string; seri: { etiket: string; deger: number }[]; birim?: string; kaynak?: string }
  | { tip: 'harita'; sehirler: string[]; etiket: string; noktalar?: { ad: string; lat: number; lon: number }[] }
  | { tip: 'karsilastirma'; olay: string; taraflar: { kaynak: string; ozet: string }[] }
  | { tip: 'zaman'; olaylar: { zaman: string; metin: string }[] }
  | { tip: 'liste'; baslik: string; maddeler: string[] }
  | { tip: 'ikon'; ikon: string; baslik: string; alt?: string }
  | { tip: 'kart'; baslik: string; maddeler: { ikon: string; metin: string }[] }
  | { tip: 'adimlar'; baslik: string; adimlar: string[] }
  | { tip: 'alinti'; metin: string; kaynak: string }
  | { tip: 'kisi_yer'; baslik: string; ozet: string };

/** wiki: sahnenin dayandığı wiki_lookup sonucunun başlığı (fotoğraf oradan gelir; model URL yazmaz). */
export type GorselWithPhoto = Gorsel & { haber_id?: string; foto_arama?: string; wiki?: string; foto?: Photo | null };

export interface Photo {
  url: string;
  credit: string;
  kind: 'haber' | 'stok' | 'temsili' | 'wiki';
}

export interface Sahne {
  ses: string;
  gorsel: GorselWithPhoto;
}

export interface JarvisReply {
  id: string;
  sahneler: Sahne[];
  detay: string;
  model: string | null;
  tool_log: string[];
  device: Device;
  created_at: string;
  /** Cevap başlarken sabitlenen ses: cevap sürerken Ayarlar'dan değişse de bu cevap tek sesle biter. */
  voice?: { model: string; voice: string; speed: number };
  /** İstekte kullanılan model adı (route-llm ya da Jarvis router'ı); `model` ise gerçekten çalışan alt model. */
  router?: string;
}

export interface StoredMessage {
  role: 'user' | 'assistant';
  text: string; // assistant için sahnelerin ses metni birleştirilmiş
  device: Device;
  at: string;
  reply?: JarvisReply;
}
