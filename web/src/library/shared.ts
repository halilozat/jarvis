// Kitaplığım · ortak sabitler ve yardımcılar (bileşen dosyaları yalnızca bileşen dışa aktarsın: hızlı yenileme)
import type { Durum } from '../lib/library';

export const DURUM_AD: Record<Durum, string> = { okunacak: 'Okunacak', okunuyor: 'Okunuyor', bitti: 'Okundu' };

/** Sesle eklenen son kayıt (yalnızca o kitapta kalemle yazılır) */
export interface YeniKayit { tip: 'not' | 'alinti' | 'durum' | 'sayfa'; metin?: string; n: number }

/** Dosya adından bölüm: "bolum3.jpg", "3-raf.jpg", "B5.jpeg" → 3, 3, 5; yoksa sıra */
export function bolumTahmin(ad: string, sira: number, n = 6): number {
  const m = /(?:^|[^0-9])([1-6])(?:[^0-9]|$)/.exec(ad.replace(/\.[a-z]+$/i, ''));
  return m ? Number(m[1]) : (sira % n) + 1;
}
