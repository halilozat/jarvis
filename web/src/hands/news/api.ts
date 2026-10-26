// Haber Modu · sunucu istekleri (server/src/newsCenter.ts)
import { token } from '../../lib/api';
import type { Analiz, AramaOlay, Basin, DunyaBasini, DunyaBugun, IddiaSonuc, Merkez, Sabah, SonDakika, TemelKume } from './types';

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

export const dunyaAl = (id: string) => al<DunyaBasini>(`/api/haber/dunya/${id}`);
export const sonDakikaAl = () => al<SonDakika>('/api/haber/son-dakika');
export const basinAl = () => al<Basin>('/api/haber/basin');
export const dunyaBugunAl = () => al<DunyaBugun>('/api/haber/dunya-bugun');
/** Olay takibi: açık → takibe al, kapalı → takipten çıkar */
export async function takipEt(id: string, ac: boolean): Promise<void> {
  const r = await fetch(`/api/haber/takip/${id}`, { method: ac ? 'POST' : 'DELETE', headers: token ? { 'x-jarvis-token': token } : {} });
  if (!r.ok) throw new Error(`takip: ${r.status}`);
}

/** Arama: sunucu her adımı bir satır olarak akıtır; her olay geldiği an bildirilir */
export async function ara(q: string, olay: (o: AramaOlay) => void, signal?: AbortSignal): Promise<void> {
  const r = await fetch(`/api/haber/ara?q=${encodeURIComponent(q)}`, { headers: token ? { 'x-jarvis-token': token } : {}, signal });
  if (!r.ok || !r.body) throw new Error(`arama: ${r.status}`);
  const okur = r.body.getReader(), dec = new TextDecoder();
  let tampon = '';
  for (;;) {
    const { value, done } = await okur.read();
    if (done) break;
    tampon += dec.decode(value, { stream: true });
    let i: number;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const satir = tampon.slice(0, i).trim();
      tampon = tampon.slice(i + 1);
      if (satir) { try { olay(JSON.parse(satir) as AramaOlay); } catch { /* yarım satır */ } }
    }
  }
}

/** Görsel adresine erişim anahtarı (fotoğraf vekili de korumalı) */
export const imgUrl = (u: string) => (token && u.startsWith('/api/') ? `${u}${u.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : u);
