// Haber Modu · dünya basını: aynı olayın Türk basınında ve dünya basınında nasıl verildiği, yan yana.
// Solda Türk basınının özeti, sağda dünya yayınlarının kartları (özgün başlık, Türkçe çevirisi, öne çıkardığı olgu,
// birebir alıntı ve çevirisi). Altta tarafsız, renk kodlu şerit: ortak · farklı çerçeve · yalnızca dünya basınında ·
// yalnızca Türk basınında. Alıntılar kendi dilinde birebir; çeviriler "ÇEVİRİ" diye işaretli (server/src/worldNews.ts).
import { alanAdi, esc, saatYaz } from './channel';
import type { Analiz, DunyaAlinti, DunyaBasini, DunyaMadde, KumeOzet } from './types';

const SERIT: [keyof Pick<DunyaBasini, 'ortak' | 'cerceve' | 'yalnizDunya' | 'yalnizTurk'>, string, string][] = [
  ['ortak', 'İKİ TARAFTA DA', '#3ee08f'],
  ['cerceve', 'FARKLI ÇERÇEVE', '#ffb340'],
  ['yalnizDunya', 'YALNIZCA DÜNYA BASININDA', '#5fb4ff'],
  ['yalnizTurk', 'YALNIZCA TÜRK BASININDA', '#ff7a8a'],
];

const alinti = (a: DunyaAlinti | null, dil: 'tr' | 'en') => (a
  ? `<p class="hb-dn-al ${dil}"><em>${esc(a.kaynak)}</em> “${esc(a.metin)}”${a.ceviri ? `<span class="hb-dn-ceviri"><i>ÇEVİRİ</i> ${esc(a.ceviri)}</span>` : ''}</p>`
  : '');

function madde(m: DunyaMadde, renk: string, ad: string): string {
  return `<div class="hb-madde" style="--m:${renk}"><b>${ad}</b><h5>${esc(m.baslik)}</h5>${alinti(m.tr, 'tr')}${alinti(m.en, 'en')}</div>`;
}

export function dunyaHtml(k: KumeOzet, a: Analiz | null, d: DunyaBasini | null, hata: string | null): string {
  const tr = `
    <section class="hb-dn-tr">
      <h4>TÜRK BASINI <span>${k.kaynakSayisi} kaynak</span></h4>
      ${a ? a.detay.ozet.map(c => `<p>${esc(c)}</p>`).join('') : `<p>${esc(k.baslik)}</p>`}
      <div class="hb-dn-cipler">${k.kaynaklar.slice(0, 12).map(x => `<i>${esc(x)}</i>`).join('')}</div>
    </section>`;
  if (!d) {
    return `<div class="hb-dunya"><h2>DÜNYA BASINI <span>${esc(k.baslik)}</span></h2><div class="hb-dn-ic">${tr}
      <section class="hb-dn-yayinlar bekle"><div class="hb-analiz"><i></i><span>${hata ? 'Alınamadı: ' + esc(hata) : 'DÜNYA BASINI TARANIYOR · BBC · Guardian · NYT · NPR · DW · Spiegel · France 24 · Le Monde · Euronews · Al Jazeera · Google News'}</span></div></section></div></div>`;
  }
  const taranan = `${d.taranan.yayin} yayın · ${d.taranan.haber} başlık (son 4 gün)${d.taranan.google ? ` · Google News ${d.taranan.google}` : ''}`;
  if (d.durum !== 'bulundu') {
    const neden = d.durum === 'model-yok' ? 'Dünya basını karşılaştırması için model (RouteLLM) gerekiyor; başlıklar eşleştirilemedi.' : 'Bu olay dünya basınında bulunamadı. Yerel bir gelişme olabilir ya da henüz yazılmamış olabilir.';
    return `<div class="hb-dunya"><h2>DÜNYA BASINI <span>${esc(taranan)}</span></h2><div class="hb-dn-ic">${tr}<section class="hb-dn-yayinlar bos"><p>${neden}</p></section></div></div>`;
  }
  const kartlar = d.yayinlar.map((y, i) => `
    <article class="hb-dn-kart" style="--i:${i}">
      <header><b>${esc(y.kaynak)}</b><span>${esc(y.ulke)}</span><time>${saatYaz(y.saat)}</time></header>
      <h3 lang="en">${esc(y.baslik)}</h3>
      ${y.baslikTr ? `<p class="hb-dn-baslik-tr"><i>ÇEVİRİ</i> ${esc(y.baslikTr)}</p>` : ''}
      ${y.vurgu ? `<p class="hb-dn-vurgu"><b>Öne çıkardığı:</b> ${esc(y.vurgu)}</p>` : ''}
      ${alinti(y.alinti, 'en')}
      <u>${esc(alanAdi(y.url))}${y.tam ? '' : ' · yalnızca özet okundu'}</u>
    </article>`).join('');
  // Tür başına bir madde (üst satıra yer kalsın; tamamı Jarvis'in anlatımında)
  const serit = SERIT.flatMap(([key, ad, renk]) => d[key].slice(0, 1).map(m => madde(m, renk, ad))).join('');
  const diger = d.basliklar.length
    ? `<footer class="hb-dn-diger"><b>BAŞLIK DÜZEYİNDE (metin okunmadı)</b>${d.basliklar.slice(0, 8).map(b => `<span title="${esc(b.baslik)}"><em>${esc(b.kaynak)}</em> ${esc(b.baslik.slice(0, 70))}${b.baslik.length > 70 ? '…' : ''}</span>`).join('')}</footer>`
    : '';
  return `
  <div class="hb-dunya">
    <h2>DÜNYA BASINI <span>${d.yayinlar.length} yayında bulundu · taranan: ${esc(taranan)}</span><em>Alıntılar kendi dilinde birebir · çeviriler Jarvis'in</em></h2>
    <div class="hb-dn-ic">${tr}<section class="hb-dn-yayinlar">${kartlar || '<p class="bos">Dünya yayınlarında eşleşen metin yok; başlık düzeyinde bulunanlar aşağıda.</p>'}</section></div>
    ${serit ? `<div class="hb-serit-alt">${serit}</div>` : ''}
    ${diger}
  </div>`;
}
