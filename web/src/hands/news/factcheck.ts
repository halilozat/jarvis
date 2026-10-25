// Haber Modu · söylenen ve gerçek: iddia kontrolü görünümü. Solda iddia kartı (kaynak + alıntı), sağda veri kartı
// (resmî veri + grafik), ortada iki kartı birleştiren ışık çizgisi; sonuç etiketi animasyonla yerine oturur.
// Etiket iddiaya verilir; her etiketin yanında veri kaynağının bağlantısı ve verinin tarihi görünür.
import { alanAdi, esc } from './channel';
import type { Etiket, IddiaSonuc } from './types';

export const ETIKET_RENK: Record<Etiket, string> = {
  'VERİYLE UYUMLU': '#3ee08f', 'VERİYLE ÇELİŞİYOR': '#ff5468', 'EKSİK BAĞLAM': '#ffb340', 'DOĞRULANAMADI': '#9fb3c8',
};

function grafik(seri: { etiket: string; deger: number }[]): string {
  if (seri.length < 2) return '';
  const W = 320, H = 110, p = 10;
  const min = Math.min(...seri.map(s => s.deger)), max = Math.max(...seri.map(s => s.deger)), r = max - min || 1;
  const xy = seri.map((s, i) => [p + (i * (W - 2 * p)) / (seri.length - 1), H - p - ((s.deger - min) / r) * (H - 2 * p)] as const);
  const yol = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  return `<svg class="hb-grafik" viewBox="0 0 ${W} ${H + 18}"><path d="${yol}"/>${xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5"/>`).join('')}
    <text x="${p}" y="${H + 14}">${esc(seri[0].etiket)}</text><text x="${W - p}" y="${H + 14}" text-anchor="end">${esc(seri[seri.length - 1].etiket)}</text></svg>`;
}

export function iddiaHtml(list: IddiaSonuc[] | null, i: number, hata: string | null): string {
  if (!list) return `<div class="hb-iddia"><h2>İDDİA KONTROLÜ <span>söylenen ve gerçek</span></h2><div class="hb-analiz"><i></i><span>${hata ? esc(hata) : 'İDDİALAR ÇIKARILIYOR · TCMB · AFAD · Dünya Bankası · Resmî Gazete'}</span></div></div>`;
  if (!list.length) return `<div class="hb-iddia"><h2>İDDİA KONTROLÜ</h2><p class="hb-bos">Bu haberde doğrulanabilir bir olgusal iddia bulunamadı.</p></div>`;
  const s = list[Math.max(0, Math.min(list.length - 1, i))];
  const renk = ETIKET_RENK[s.etiket];
  return `
  <div class="hb-iddia" style="--e:${renk}">
    <h2>İDDİA KONTROLÜ <span>${i + 1} / ${list.length} · ✋ ↔ sonraki</span></h2>
    <div class="hb-terazi">
      <article class="hb-iddia-kart">
        <h4>İDDİA · ${esc(s.kaynak)}</h4>
        <blockquote>“${esc(s.alinti)}”</blockquote>
        <u>${esc(alanAdi(s.haberUrl))}</u>
      </article>
      <div class="hb-isik"><i></i><b>${esc(s.etiket)}</b></div>
      <article class="hb-veri-kart">
        <h4>VERİ · ${esc(s.veri.ad)}</h4>
        ${s.veri.deger ? `<strong>${esc(s.veri.deger)}${s.veri.birim && !s.veri.deger.includes(s.veri.birim) && s.veri.birim !== '%' ? ' ' + esc(s.veri.birim) : ''}</strong>` : ''}
        ${grafik(s.veri.seri ?? [])}
        ${!s.veri.deger && !s.veri.seri?.length ? (s.etiket === 'DOĞRULANAMADI'
          ? '<p class="hb-veri-yok">Karşılaştırılacak resmî veri bulunamadı</p><p class="hb-aranan">Aranan kaynaklar: TCMB · AFAD · Dünya Bankası · Open-Meteo · Resmî Gazete · Teyit · Malumatfuruş</p>'
          : `<p class="hb-veri-yok">${esc(s.veri.ad)} kaydı</p><p class="hb-aranan">${esc(s.aciklama)}</p>`) : ''}
        <p class="hb-kaynak-link">Veri tarihi: <b>${esc(s.veri.tarih)}</b> · <u>${esc(alanAdi(s.veri.url) || s.veri.url)}</u></p>
      </article>
    </div>
    <p class="hb-aciklama">${esc(s.aciklama)}</p>
    ${s.ilgili.length ? `<p class="hb-ilgili">Bağımsız doğrulama: ${s.ilgili.map(x => `<b>${esc(x.ad)}</b> “${esc(x.baslik)}” <u>${esc(alanAdi(x.url))}</u>`).join(' · ')}</p>` : ''}
    <ol class="hb-iddia-liste">${list.map((x, j) => `<li class="${j === i ? 'on' : ''}" style="--e:${ETIKET_RENK[x.etiket]}"><i></i>${esc(x.etiket)}</li>`).join('')}</ol>
  </div>`;
}

/** Jarvis'in okuyacağı cümle */
export const iddiaCumlesi = (s: IddiaSonuc) => `${s.etiket.toLocaleLowerCase('tr')}. ${s.aciklama}`;
