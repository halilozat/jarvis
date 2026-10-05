import type { Gorsel, JarvisReply } from '../../lib/types';

/** Görselin başlığa en uygun alanı. */
function visualTitle(g: Gorsel): string | null {
  switch (g.tip) {
    case 'baslik': return g.metin;
    case 'sayi': return g.etiket;
    case 'grafik': return g.baslik;
    case 'harita': return g.etiket;
    case 'karsilastirma': return g.olay;
    case 'liste': return g.baslik;
    case 'zaman': return g.olaylar[0]?.metin ?? null;
    case 'ikon': return g.baslik;
    case 'kart': return g.baslik;
    case 'adimlar': return g.baslik;
    case 'alinti': return g.kaynak || g.metin;
    case 'kisi_yer': return g.baslik;
    default: return null;
  }
}

export interface AgendaItem { title: string; start: number; end: number }

/**
 * Görseli olan her sahne bir madde; görselsiz yorum sahneleri bir önceki maddenin parçası sayılır.
 * (start, end) = maddenin kapsadığı sahne aralığı.
 */
export function buildAgenda(reply: JarvisReply): AgendaItem[] {
  const starts = reply.sahneler
    .map((s, i) => ({ i, title: visualTitle(s.gorsel) }))
    .filter((x): x is { i: number; title: string } => !!x.title);
  return starts.map((x, k) => ({ title: x.title, start: x.i, end: starts[k + 1]?.i ?? reply.sahneler.length }));
}
