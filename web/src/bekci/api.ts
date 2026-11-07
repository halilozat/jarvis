// Bekçi · sunucu çağrıları ve tipler (server/src/bekci).
import { headers } from '../lib/api';

export type AdimAd = 'link' | 'whois' | 'usom' | 'liste' | 'metin' | 'sandbox';
export interface Adim { durum: 'bekliyor' | 'calisiyor' | 'tamam' | 'atlandi' | 'hata'; not: string }

export interface Analiz {
  id: string;
  kaynak: 'sms' | 'imessage' | 'rcs' | 'mail' | 'el' | 'demo';
  gonderen: string;
  zaman: string;
  puan: number;
  seviye: 'tehlikeli' | 'supheli' | 'temiz';
  marka: string | null;
  gerekceler: string[];
  linkler: { goster: string; alan: string; resmi: boolean; yasGun: number | null; yasTarih: string | null; usom: boolean }[];
  adimlar: Record<AdimAd, Adim>;
  model: string | null;
  sandbox: { uuid: string; ekran: string; formAlanlari: string[]; durum: string } | null;
  sureMs: number;
  uyari: string;
  cevap: string;
  tiklasaydim: string;
  demo?: boolean;
  log?: string[];
  guvenliIsaretli?: boolean;
}

export interface Durum {
  etkin: boolean;
  sms: { ok: boolean; hata?: string; kurulum?: string };
  mail: { hesap: number; hata?: string; durumlar: { ad: string; ok: boolean; hata?: string }[] };
  usom: boolean;
  anahtarlar: { gsb: boolean; vt: boolean; urlscan: boolean; ntfy: boolean };
  son: Analiz[];
}

const post = async <T,>(yol: string, govde: object): Promise<T> => {
  const r = await fetch(yol, { method: 'POST', headers: headers(), body: JSON.stringify(govde) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || `HTTP ${r.status}`);
  return j;
};

export const bekciDurum = async (): Promise<Durum> => { const r = await fetch('/api/bekci/durum', { headers: headers() }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
export const bekciAnaliz = (metin: string) => post<Analiz>('/api/bekci/analiz', { metin });
export const bekciDemo = (tur: 'sms' | 'mail') => post<{ ok: boolean }>('/api/bekci/demo', { tur });
export const bekciGuvenli = (id: string) => post<Analiz>('/api/bekci/guvenli', { id });
export const bekciBeyaz = (d: { gonderen?: string; alan?: string }) => post<{ gonderenler: string[]; alanlar: string[] }>('/api/bekci/beyaz', d);
export const bekciBildirimTesti = () => post<{ ok: boolean; hata?: string }>('/api/bekci/bildirim-testi', {});
