// Haber Modu · kimsenin sormadığı sorular. Kart açıkken soru işaretleri kartın çevresinden süzülüp sırayla yerleşir;
// her sorunun yanında hangi boşluktan çıktığı ("hiçbir kaynakta maliyet bilgisi yok") küçük notla görünür.
import { esc } from './channel';
import type { BoslukTur, Soru } from './types';

export const BOSLUK_AD: Record<BoslukTur, string> = {
  'ne-zaman': 'NE ZAMAN', nerede: 'NEREDE', neden: 'NEDEN', maliyet: 'MALİYET', 'kaynaksiz-sayi': 'KAYNAKSIZ SAYI', celiski: 'ÇELİŞKİ', takip: 'TAKİP',
};

export function sorularHtml(list: Soru[] | null, hata: string | null): string {
  if (!list) return `<div class="hb-sorular"><h2>KİMSENİN SORMADIĞI SORULAR</h2><div class="hb-analiz"><i></i><span>${hata ? esc(hata) : 'BOŞLUKLAR ARANIYOR · 5N1K · kaynaksız sayılar · çelişkiler · arşiv'}</span></div></div>`;
  if (!list.length) return `<div class="hb-sorular"><h2>KİMSENİN SORMADIĞI SORULAR</h2><p class="hb-bos">Kaynaklarda belirgin bir boşluk bulunamadı.</p></div>`;
  const isaretler = Array.from({ length: 9 }, (_, i) => `<i style="--i:${i}">?</i>`).join('');
  return `
  <div class="hb-sorular">
    <div class="hb-isaretler">${isaretler}</div>
    <h2>KİMSENİN SORMADIĞI SORULAR <span>kaynaklardaki somut boşluklardan</span></h2>
    <ol>${list.map((s, i) => `
      <li style="--i:${i}">
        <b>?</b>
        <div><p>${esc(s.soru)}</p><em><span>${BOSLUK_AD[s.bosluk]}</span>${esc(s.not)}</em>${s.kanit ? `<q>${esc(s.kanit.kaynak)}: “${esc(s.kanit.metin.slice(0, 140))}”</q>` : ''}</div>
      </li>`).join('')}
    </ol>
  </div>`;
}
