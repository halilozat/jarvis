// Ultron Paketi · sunucu çağrıları (server/src/ultron).
import { headers, token } from '../lib/api';
import type { Satir, ZamanDosyasi } from './zaman';
import type { SahneAyari } from './sahne';

const al = async <T,>(yol: string): Promise<T> => {
  const r = await fetch(yol, { headers: headers() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
};
const gonder = async <T,>(yol: string, govde: object): Promise<T> => {
  const r = await fetch(yol, { method: 'POST', headers: headers(), body: JSON.stringify(govde) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
/** Ses/medya adresine erişim belirteci (audio fetch'i başlık taşıyamazsa) */
export const belirtecli = (yol: string) => (token ? `${yol}${yol.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : yol);

export interface UltronDurum {
  savas: boolean; goz: boolean; final: 'A' | 'B'; parola: string; canli: boolean; oran: string;
  ses: { ultron: boolean; ultronAd: string; jarvis: boolean }; ev: string | null; anahtar: { opensky: boolean; firms: boolean };
}
export interface Ayar extends SahneAyari { kalite: { hedefFps: number; dusurEsik: number; kayitFps: number }; goz: any }
export const ultronDurum = () => al<UltronDurum>('/api/ultron/durum');
export const sahneAl = () => al<{ satirlar: Satir[]; zaman: ZamanDosyasi; ayar: Ayar }>('/api/ultron/sahne');

/** Ses dosyasını indir ve çöz (başlıkla; belirteç adreste görünmez) */
export async function sesCoz(ctx: BaseAudioContext, yol: string): Promise<AudioBuffer | null> {
  const r = await fetch(yol, { headers: headers() });
  if (r.status !== 200) return null;
  return ctx.decodeAudioData(await r.arrayBuffer());
}

// ---------------------------------------------------------------- Ultron'un Gözü

export type KatmanAd = 'deprem_dunya' | 'deprem_tr' | 'ucus' | 'yangin' | 'uydu' | 'haber' | 'siber' | 'hava';
export interface KatmanVeri { ad: KatmanAd; kaynak: string; updatedAt: string | null; durum: 'ok' | 'eski' | 'yok'; hata?: string; items: any[]; summary: Record<string, number | string | null> }
export interface GozVeri { zaman: string; ev: { ad: string; lat: number; lon: number } | null; katmanlar: Partial<Record<KatmanAd, KatmanVeri>> }
export interface SorCevap {
  niyet: { tip: 'ac' | 'kapat' | 'konu' | 'katman' | 'bilinmiyor'; konu?: string; islem?: 'kapat' | 'ac' | 'sadece'; katman?: string };
  metin?: string; kaynak?: 'llm' | 'sablon'; ozet?: Record<string, unknown>; odak?: { lat: number; lon: number; zoom: number } | null; katman?: string;
}
export const gozKatmanlar = (snapshot?: string | null) => al<GozVeri>(`/api/ultron/goz/katmanlar${snapshot ? `?snapshot=${encodeURIComponent(snapshot)}` : ''}`);
export const gozSor = (metin: string, o: { konum?: { lat: number; lon: number } | null; snapshot?: string | null; sablon?: boolean } = {}) =>
  gonder<SorCevap>('/api/ultron/goz/sor', { metin, ...(o.konum ? { konum: o.konum } : {}), ...(o.snapshot ? { snapshot: o.snapshot } : {}), ...(o.sablon ? { sablon: true } : {}) });
export const konusYolu = (metin: string) => `/api/ultron/konus?metin=${encodeURIComponent(metin)}`;

// ---------------------------------------------------------------- Kayıt

export const kayitBasla = (mod: 'war' | 'eye' | 'full', oran: string, snapshot?: string | null) => gonder<{ ad: string; snapshot: string | null }>('/api/ultron/kayit/basla', { mod, oran, ...(snapshot ? { snapshot } : {}) });
export async function kayitKare(ad: string, no: number, png: Blob) {
  const r = await fetch(`/api/ultron/kayit/kare/${ad}/${no}`, { method: 'POST', headers: { 'Content-Type': 'image/png', ...(token ? { 'x-jarvis-token': token } : {}) }, body: png });
  if (!r.ok) throw new Error(`kare ${no}: HTTP ${r.status}`);
}
export async function kayitSes(ad: string, dosya: string, w: Blob) {
  const r = await fetch(`/api/ultron/kayit/ses/${ad}/${dosya}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav', ...(token ? { 'x-jarvis-token': token } : {}) }, body: w });
  if (!r.ok) throw new Error(`${dosya}: HTTP ${r.status}`);
}
export const kayitBitir = (ad: string, bilgi: object) => gonder<{ ok: boolean; klasor: string; mp4: string | null }>(`/api/ultron/kayit/bitir/${ad}`, bilgi);
