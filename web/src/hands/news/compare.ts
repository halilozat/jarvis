// Haber Modu · kaynak karşılaştırması: aynı olay için her kaynağın kartı yelpaze gibi açılıp duvara dizilir.
// Altta tarafsız, renk kodlu şerit: ortak bilgi · farklı vurgu · sadece bazı kaynaklarda · farklı sayılar.
// Bir karta dokununca (☝️) o kaynağın metninde ilgili alıntılar vurgulanır. Jarvis 2-3 cümleyle, yorumsuz anlatır.
import { alanAdi, esc, saatYaz } from './channel';
import type { Analiz, KarsilastirmaMadde, MaddeTur } from './types';

export const MADDE_AD: Record<MaddeTur, string> = { ortak: 'ORTAK BİLGİ', vurgu: 'FARKLI VURGU', bazilari: 'SADECE BAZI KAYNAKLARDA', sayilar: 'FARKLI SAYILAR' };
export const MADDE_RENK: Record<MaddeTur, string> = { ortak: '#3ee08f', vurgu: '#ffb340', bazilari: '#5fb4ff', sayilar: '#ff5468' };
const SIRA: MaddeTur[] = ['ortak', 'vurgu', 'bazilari', 'sayilar'];

/** En fazla 8 kaynak: tam metni olanlar önce */
export const duvarKaynaklari = (a: Analiz) => [...a.detay.kaynaklar].sort((x, y) => Number(y.tam) - Number(x.tam)).slice(0, 8);

function madde(m: KarsilastirmaMadde): string {
  const alt = m.tur === 'bazilari' && m.gecen
    ? `<p class="hb-gecen">geçiyor: <b>${esc(m.gecen.join(', '))}</b> · geçmiyor: ${esc(m.gecmeyen!.slice(0, 5).join(', '))}${m.gecmeyen!.length > 5 ? '…' : ''}</p>`
    : m.alintilar.slice(0, 3).map(a => `<p><em>${esc(a.kaynak)}</em> “${esc(a.metin)}”</p>`).join('');
  return `<div class="hb-madde" style="--m:${MADDE_RENK[m.tur]}"><b>${MADDE_AD[m.tur]}</b><h5>${esc(m.baslik)}</h5>${alt}</div>`;
}

export function karsilastirmaHtml(a: Analiz): string {
  const ks = duvarKaynaklari(a);
  const kartlar = ks.map((k, i) => `
    <article class="hb-kaynak" style="--i:${i};--n:${ks.length}" data-kaynak="${esc(k.kaynak)}">
      <header><b>${esc(k.kaynak)}</b><time>${saatYaz(k.saat)}</time></header>
      <h3>${esc(k.baslik)}</h3>
      <p class="hb-ilk">${esc(k.ilkCumle)}</p>
      <div class="hb-metin"></div>
      <u>${esc(alanAdi(k.url))}</u>
    </article>`).join('');
  const maddeler = SIRA.flatMap(t => a.karsilastirma.maddeler.filter(m => m.tur === t).slice(0, 2));
  return `
  <div class="hb-karsilastir">
    <h2>KAYNAK KARŞILAŞTIRMASI <span>${ks.length} kaynak · ${esc(a.detay.baslik)}</span></h2>
    <div class="hb-duvar">${kartlar}</div>
    <div class="hb-serit-alt">${maddeler.map(madde).join('') || '<div class="hb-madde"><h5>Karşılaştırılabilir ayrıntı bulunamadı.</h5></div>'}</div>
  </div>`;
}

/** Dokunulan kaynağın metni: ilgili alıntılar madde rengiyle vurgulanır */
export function vurguluMetin(a: Analiz, kaynak: string): string {
  const k = a.detay.kaynaklar.find(x => x.kaynak === kaynak);
  if (!k) return '';
  const parcalar = a.karsilastirma.maddeler.flatMap(m => m.alintilar.filter(x => x.kaynak === kaynak).map(x => ({ metin: x.metin, renk: MADDE_RENK[m.tur] })));
  // Alıntının geçtiği cümleler (en fazla 3) ve vurgu
  const cumleler = k.metin.split(/(?<=[.!?…])\s+/);
  const secili = cumleler.filter(c => parcalar.some(p => c.toLocaleLowerCase('tr').includes(p.metin.toLocaleLowerCase('tr').slice(0, 30)))).slice(0, 3);
  if (!secili.length) return `<p>${esc(k.ilkCumle)}</p>`;
  return secili.map(c => {
    let h = esc(c);
    for (const p of parcalar) {
      const e = esc(p.metin);
      const i = h.toLocaleLowerCase('tr').indexOf(e.toLocaleLowerCase('tr'));
      if (i >= 0) h = `${h.slice(0, i)}<mark style="--m:${p.renk}">${h.slice(i, i + e.length)}</mark>${h.slice(i + e.length)}`;
    }
    return `<p>${h}</p>`;
  }).join('');
}
