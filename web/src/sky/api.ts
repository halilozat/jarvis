// Gece Gökyüzü · sunucu çağrıları (server/src/gok.ts): astrometry.net çözümü başlat ve izle.
import { headers } from '../lib/api';

export interface Cozum {
  jobId: number;
  calibration: { ra: number; dec: number; radius: number; pixscale: number; orientation: number; parity: number };
  wcs: string;
  annotations: { type: string; names: string[]; pixelx: number; pixely: number; vmag?: number }[];
  objects_in_field: string[];
  w: number;
  h: number;
}

export type CozumDurumu = { durum: string; mesaj: string; sure?: number; cozum?: Cozum; hata?: string; anahtarYok?: boolean };

export async function gokDurum(): Promise<{ astrometry: boolean }> {
  const r = await fetch('/api/gok/durum', { headers: headers() });
  return r.ok ? r.json() : { astrometry: false };
}

/** Çözümü başlatır ve bitene kadar izler. ilerleme her yoklamada çağrılır. iptal: AbortSignal */
export async function coz(f: { resim: string; w: number; h: number; olcek: [number, number] | null }, ilerleme: (d: CozumDurumu) => void, iptal?: AbortSignal): Promise<CozumDurumu> {
  const r = await fetch('/api/gok/coz', { method: 'POST', headers: headers(), body: JSON.stringify({ resim: f.resim, w: f.w, h: f.h, ...(f.olcek ? { olcek: f.olcek } : {}) }), signal: iptal });
  const j = await r.json().catch(() => ({ hata: `HTTP ${r.status}` }));
  if (!r.ok) return { durum: 'hata', mesaj: j.hata || 'çözüm başlatılamadı', hata: j.hata, anahtarYok: !!j.anahtarYok };
  if (j.durum === 'tamam') return j;
  ilerleme(j);
  for (;;) {
    await new Promise(ok => setTimeout(ok, 1500));
    if (iptal?.aborted) return { durum: 'iptal', mesaj: 'iptal edildi' };
    const d: CozumDurumu = await fetch(`/api/gok/coz/${j.id}`, { headers: headers(), signal: iptal }).then(x => x.json()).catch(() => ({ durum: 'bekliyor', mesaj: 'bağlantı bekleniyor' }));
    ilerleme(d);
    if (['tamam', 'hata', 'cozulemedi'].includes(d.durum)) return d;
  }
}
