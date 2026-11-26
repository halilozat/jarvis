// Ultron'un Gözü · yan paneldeki katman satırları (canlı ve kayıt HUD'u ortak kullanır)
import type { GozVeri, KatmanAd, KatmanVeri } from '../api';
import type { GorselKatman } from './kure';

export interface Satir { id: string; gorsel: GorselKatman; veri: KatmanAd; ad: string; ikon: string; anahtar: string; birim: string }
export const SATIRLAR: Satir[] = [
  { id: 'ucus', gorsel: 'ucus', veri: 'ucus', ad: 'Uçuşlar', ikon: '✈', anahtar: 'flights_now', birim: 'uçak havada' },
  { id: 'deprem_dunya', gorsel: 'deprem', veri: 'deprem_dunya', ad: 'Depremler · dünya', ikon: '◎', anahtar: 'quakes_1h', birim: 'son 1 saatte' },
  { id: 'deprem_tr', gorsel: 'deprem', veri: 'deprem_tr', ad: 'Depremler · Türkiye', ikon: '◉', anahtar: 'tr_quakes_24h', birim: 'son 24 saatte' },
  { id: 'yangin', gorsel: 'yangin', veri: 'yangin', ad: 'Yangınlar', ikon: '▲', anahtar: 'fires_24h', birim: 'aktif nokta (24 sa)' },
  { id: 'uydu', gorsel: 'uydu', veri: 'uydu', ad: 'Uydular', ikon: '◈', anahtar: 'uydu_sayisi', birim: 'izleniyor' },
  { id: 'haber', gorsel: 'haber', veri: 'haber', ad: 'Son dakika', ikon: '▤', anahtar: 'breaking_now', birim: 'manşet' },
  { id: 'siber', gorsel: 'siber', veri: 'siber', ad: 'Siber', ikon: '⚡', anahtar: 'malicious_links_today', birim: 'zararlı link bugün' },
  { id: 'hava', gorsel: 'hava', veri: 'hava', ad: 'Hava', ikon: '☁', anahtar: 'weather_alerts', birim: 'uyarı' },
];

const saat = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
export function satirDurumu(s: Satir, v: GozVeri | null): { deger: string; etiket: string; durum: KatmanVeri['durum'] | 'yukleniyor' } {
  const k = v?.katmanlar[s.veri];
  if (!k) return { deger: '…', etiket: '', durum: 'yukleniyor' };
  if (k.durum === 'yok') return { deger: 'VERİ YOK', etiket: `${k.kaynak}${k.hata ? ` · ${k.hata.slice(0, 40)}` : ''}`, durum: 'yok' };
  const d = k.summary[s.anahtar];
  return { deger: typeof d === 'number' ? d.toLocaleString('tr-TR') : String(d ?? '—'), etiket: `${k.kaynak} · ${saat(k.updatedAt)}${k.durum === 'eski' ? ' · ESKİ VERİ' : ''}`, durum: k.durum };
}
