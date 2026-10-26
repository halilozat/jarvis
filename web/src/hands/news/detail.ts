// Haber Modu · haber detayı: özet, önemli sayılar, harita (yalnızca metinde geçen iller), kaynakların yayın sırası,
// arşivde "daha önce" ve sonraki adımların ipuçları. Kart açılınca RSS bilgisi hemen; analiz gelince dolar.
import { cityCoord } from '../../data/cities';
import { TR_H, TR_PATH, TR_W, project } from '../../data/turkey';
import { imgUrl } from './api';
import { alanAdi, esc, saatYaz } from './channel';
import { KATEGORI_AD, KATEGORI_RENK, type Analiz, type KumeOzet, type TemelKume } from './types';

const tarihYaz = (iso: string) => new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

function harita(iller: string[]): string {
  const pts = iller.map(c => ({ c, xy: cityCoord(c) })).filter(p => p.xy) as { c: string; xy: [number, number] }[];
  if (!pts.length) return '';
  const nokta = pts.map(({ c, xy }, i) => {
    const [x, y] = project(xy[0], xy[1]);
    return `<g style="--i:${i}"><circle class="hb-nabiz" cx="${x}" cy="${y}" r="9"/><circle class="hb-il" cx="${x}" cy="${y}" r="9"/><text x="${x + 16}" y="${y - 14}">${esc(c.toLocaleUpperCase('tr'))}</text></g>`;
  }).join('');
  return `<section class="hb-harita"><h4>HARİTA · haberde geçen iller</h4><svg viewBox="0 0 ${TR_W} ${TR_H}"><path d="${TR_PATH}"/>${nokta}</svg></section>`;
}

export function detayHtml(o: KumeOzet, temel: TemelKume | null, a: Analiz | null, hata: string | null): string {
  const d = a?.detay;
  const ozet = d
    ? d.ozet.map(c => `<p>${esc(c)}</p>`).join('')
    : `${temel?.haberler[0] ? `<p class="hb-rss">${esc(temel.haberler[0].ozet.slice(0, 260))}</p>` : ''}<div class="hb-analiz"><i></i><span>${hata ? 'Analiz alınamadı: ' + esc(hata) : 'JARVIS KAYNAKLARI OKUYOR · tam metinler · karşılaştırma'}</span></div>`;
  const sayilar = d?.sayilar.length
    ? `<section class="hb-sayilar"><h4>ÖNEMLİ SAYILAR</h4>${d.sayilar.slice(0, 3).map(s => `<div><b>${esc(s.deger)}</b><p>“${esc(s.baglam)}”</p><em>${esc(s.kaynak)}</em></div>`).join('')}</section>`
    : '';
  const zaman = (d?.zaman ?? temel?.haberler.map(h => ({ saat: h.saat, metin: `${h.kaynak} verdi` })).sort((x, y) => x.saat.localeCompare(y.saat)) ?? []).slice(0, 7);
  const zamanHtml = zaman.length ? `<section class="hb-zaman"><h4>KİM NE ZAMAN VERDİ</h4><ol>${zaman.map(z => `<li><time>${saatYaz(z.saat)}</time>${esc(z.metin)}</li>`).join('')}</ol></section>` : '';
  const onceki = d?.onceki.length
    ? `<section class="hb-onceki"><h4>DAHA ÖNCE NASIL ANLATILMIŞTI</h4>${d.onceki.slice(0, 2).map(x => `<div><time>${tarihYaz(x.tarih)}</time><p>${esc(x.baslik)}</p><em>${esc(x.kaynaklar.map(k => k.ad).slice(0, 4).join(', '))}</em></div>`).join('')}</section>`
    : '';
  return `
  <div class="hb-detay" style="--k:${KATEGORI_RENK[o.kategori]}">
    ${o.foto ? `<div class="hb-detay-foto" style="background-image:url('${imgUrl(o.foto)}')"></div>` : ''}
    <header><b>${o.sonDakika ? 'SON DAKİKA' : KATEGORI_AD[o.kategori]}</b><span>${o.kaynakSayisi} KAYNAK · ${saatYaz(o.ilk)}</span><u>${esc(o.kaynak)} · ${esc(alanAdi(o.url))}</u></header>
    <h1>${esc(o.baslik)}</h1>
    <div class="hb-detay-ic">
      <div class="hb-sol"><section class="hb-ozet"><h4>ÖZET</h4>${ozet}</section>${sayilar}</div>
      <div class="hb-sag">${harita(d?.sehirler ?? [])}${zamanHtml}${onceki}</div>
    </div>
    <footer>
      <span><b>🤏 ↕</b> kaydır</span>
      <span><b>🤏 ↔</b> sonraki haber</span>
      <span><b>🤏🤏 ⟷</b> yakınlaş: kaynakları yan yana aç</span>
      <span><b>🗣</b> “dünya basını nasıl verdi?”</span>
      <span><b>🤏🤏 ↕</b> terazi: iddia kontrolü</span>
      <span class="hb-soru-ipucu"><b>☝️ ?</b> sorulmamış sorular</span>
      <span><b>👍</b> özetle</span>
      <span><b>✊ tut</b> geri</span>
    </footer>
  </div>`;
}
