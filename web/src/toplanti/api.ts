// Toplantı Odası · sunucu çağrıları ve olay kanalı (server/src/toplanti).
import { clientId, headers } from '../lib/api';
import type { TOlay } from './oynatici';

const post = async <T,>(yol: string, govde: object): Promise<T> => {
  const r = await fetch(yol, { method: 'POST', headers: headers(), body: JSON.stringify(govde) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || `HTTP ${r.status}`);
  return j;
};
export const toplantiBaslat = (d: { mod: 'tartisma' | 'canli'; konu?: string; demo?: boolean }) => post<{ id: string }>('/api/toplanti/baslat', { ...d, origin: clientId });
export const toplantiSoz = (metin: string) => post<{ ok: boolean; yeni?: boolean }>('/api/toplanti/soz', { metin, origin: clientId });
export const toplantiKes = (son: { id: number; sira: number } | null) => post<{ ok: boolean }>('/api/toplanti/kes', son ?? {});
export const toplantiBitir = () => post<{ tutanak: unknown }>('/api/toplanti/bitir', {});

/**
 * Olay kanalı: App SSE'den gelen 'toplanti' olaylarını buraya yazar; panel (tembel yüklenir) bağlanınca son
 * toplantının birikmiş olaylarını da alır.
 */
type Dinleyici = (o: TOlay & { origin?: string }) => void;
let dinleyici: Dinleyici | null = null;
let birikmis: (TOlay & { origin?: string })[] = [];
export function toplantiOlayi(o: TOlay & { origin?: string }) {
  if (o.olay === 'acildi') birikmis = [];
  if (dinleyici) dinleyici(o); else birikmis.push(o);
}
export function toplantiDinle(d: Dinleyici | null) {
  dinleyici = d;
  if (d) { const b = birikmis; birikmis = []; b.forEach(d); }
}
