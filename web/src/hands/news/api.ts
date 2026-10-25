// Haber Modu · sunucu istekleri (server/src/newsCenter.ts)
import { token } from '../../lib/api';
import type { Analiz, IddiaSonuc, Merkez, Sabah, TemelKume } from './types';

async function al<T>(yol: string): Promise<T> {
  const r = await fetch(yol, { headers: token ? { 'x-jarvis-token': token } : {} });
  if (!r.ok) throw new Error(`${yol}: ${r.status}`);
  return r.json() as Promise<T>;
}

export const merkezAl = (kategori?: string | null) => al<Merkez>(`/api/haber/merkez${kategori ? `?kategori=${kategori}` : ''}`);
export const kumeAl = (id: string) => al<TemelKume>(`/api/haber/kume/${id}`);
export const analizAl = (id: string) => al<Analiz>(`/api/haber/analiz/${id}`);
export const iddiaAl = (id: string) => al<{ iddialar: IddiaSonuc[] }>(`/api/haber/iddia/${id}`).then(r => r.iddialar);
export const sabahAl = () => al<Sabah>('/api/haber/sabah');

/** Görsel adresine erişim anahtarı (fotoğraf vekili de korumalı) */
export const imgUrl = (u: string) => (token && u.startsWith('/api/') ? `${u}${u.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : u);
