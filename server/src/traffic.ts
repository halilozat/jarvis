// Sabah özeti · trafik: İBB Trafik İndeksi (İstanbul geneli, Anadolu ve Avrupa yakası; 0-100; 5 dakikada bir).
// Kaynak: İBB Açık Veri Portalı "Trafik İndeks Değeri Web Servisi" (data.ibb.gov.tr/dataset/trafik-indeks-degeri-web-servisi),
// İBB Açık Veri Lisansı, anahtarsız ve ücretsiz. Güzergâh süresi vermez; yalnızca şehir geneli yoğunluk.

const ANLIK = 'https://api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndex_Sc1_Cont';
const GECMIS = 'https://api.ibb.gov.tr/tkmservices/api/TrafficData/v1/TrafficIndexHistory/1/5M';
export const IBB_SAYFA = 'https://data.ibb.gov.tr/dataset/trafik-indeks-degeri-web-servisi';

export interface Trafik {
  sehir: 'İstanbul';
  genel: number;
  anadolu: number;
  avrupa: number;
  /** Akıcı / orta / yoğun / çok yoğun (eşikler: 25, 45, 65) */
  durum: string;
  /** Son 2 saat (5 dakikalık) */
  seri: { saat: string; deger: number }[];
  kaynak: string;
  url: string;
  at: string;
}

export const trafikDurumu = (ti: number) => (ti < 25 ? 'akıcı' : ti < 45 ? 'orta' : ti < 65 ? 'yoğun' : 'çok yoğun');

let cache: { at: number; v: Trafik | null } | null = null;

export async function getTrafik(): Promise<Trafik | null> {
  if (cache && Date.now() - cache.at < (cache.v ? 120_000 : 30_000)) return cache.v;
  let v: Trafik | null = null;
  try {
    const [a, g] = await Promise.all([
      fetch(ANLIK, { signal: AbortSignal.timeout(8000) }).then(r => r.json() as Promise<{ TI: number; TI_An: number; TI_Av: number }>),
      fetch(GECMIS, { signal: AbortSignal.timeout(8000) }).then(r => r.json() as Promise<{ TrafficIndex: number; TrafficIndexDate: string }[]>).catch(() => []),
    ]);
    if (typeof a?.TI === 'number') {
      const seri = [...g].sort((x, y) => x.TrafficIndexDate.localeCompare(y.TrafficIndexDate)).slice(-24).map(x => ({ saat: x.TrafficIndexDate.slice(11, 16), deger: x.TrafficIndex }));
      v = { sehir: 'İstanbul', genel: a.TI, anadolu: a.TI_An, avrupa: a.TI_Av, durum: trafikDurumu(a.TI), seri, kaynak: 'İBB Trafik İndeksi', url: IBB_SAYFA, at: new Date().toISOString() };
    }
  } catch (e) {
    console.warn('Trafik alınamadı:', e instanceof Error ? e.message : e);
  }
  cache = { at: Date.now(), v };
  return v;
}
