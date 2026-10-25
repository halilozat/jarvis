// Haber Modu · sabah özeti: elle (✋ dikey savurma) kaydırılan dikey kartlar: hava, döviz, trafik, gündemin ilk 5 olayı,
// ajanda (varsa). Her kart öne gelince Jarvis tek cümleyle seslendirir.
import { esc, saatYaz } from './channel';
import { KATEGORI_AD, KATEGORI_RENK, type Sabah } from './types';

export interface SabahKart { id: string; baslik: string; html: string; soz: string }

/** Bulunma eki: İstanbul'da, İzmir'de, Ankara'da, Tokat'ta */
const deEki = (ad: string) => {
  const unlu = [...ad.toLocaleLowerCase('tr')].reverse().find(c => 'aıoueiöü'.includes(c)) ?? 'a';
  const sert = /[çfhkpsşt]$/i.test(ad);
  return `${ad}'${sert ? 't' : 'd'}${'aıou'.includes(unlu) ? 'a' : 'e'}`;
};
const tr = (v: number, d = 0) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function sabahKartlari(s: Sabah): SabahKart[] {
  const out: SabahKart[] = [];
  const h = s.hava;
  if (h) {
    const saatlik = h.hourly.slice(0, 8).map(x => `<li><time>${esc(x.time)}</time><b>${tr(x.temp)}°</b>${x.rain_prob !== null ? `<em>%${x.rain_prob}</em>` : ''}</li>`).join('');
    out.push({
      id: 'hava', baslik: 'HAVA',
      html: `<div class="hb-buyuk">${tr(h.temp)}°</div><p>${esc(h.city)} · ${esc(h.description)} · en yüksek ${tr(h.today.max)}°, en düşük ${tr(h.today.min)}°${h.today.rain_prob !== null ? ` · yağış ihtimali %${h.today.rain_prob}` : ''}</p><ul class="hb-saatlik">${saatlik}</ul><u>Open-Meteo</u>`,
      soz: `${deEki(h.city)} hava ${tr(h.temp)} derece, ${h.description.toLocaleLowerCase('tr')}; gün içinde en yüksek ${tr(h.today.max)} derece.`,
    });
  }
  const p = s.piyasa;
  if (p?.items.length) {
    const satir = p.items.map(x => `<li><b>${esc(x.code)}</b><strong>${tr(x.value, 4)}</strong>${x.change_pct !== null ? `<em class="${x.change_pct >= 0 ? 'art' : 'az'}">${x.change_pct >= 0 ? '▲' : '▼'} %${tr(Math.abs(x.change_pct), 2)}</em>` : ''}</li>`).join('');
    const usd = p.items.find(x => x.code === 'USD');
    out.push({
      id: 'doviz', baslik: 'DÖVİZ',
      html: `<ul class="hb-kurlar">${satir}</ul><p>Altın verisi şu an bağlı değil.</p><u>TCMB gösterge kurları · ${esc(p.date)}</u>`,
      soz: usd ? `TCMB'nin dolar kuru ${tr(usd.value, 2)} lira${usd.change_pct !== null ? `, bir önceki güne göre yüzde ${tr(Math.abs(usd.change_pct), 2)} ${usd.change_pct >= 0 ? 'yukarıda' : 'aşağıda'}` : ''}.` : 'Döviz kurları ekranda.',
    });
  }
  const t = s.trafik;
  if (t) {
    const max = Math.max(60, ...t.seri.map(x => x.deger));
    const cubuk = t.seri.map(x => `<i style="height:${(x.deger / max) * 100}%" title="${esc(x.saat)}"></i>`).join('');
    out.push({
      id: 'trafik', baslik: 'TRAFİK',
      html: `<div class="hb-buyuk">${t.genel}<small>/100</small></div><p>${esc(t.sehir)} geneli <b>${esc(t.durum)}</b> · Anadolu ${t.anadolu} · Avrupa ${t.avrupa}</p><div class="hb-cubuk">${cubuk}</div><u>${esc(t.kaynak)} · son 2 saat</u>`,
      soz: `İstanbul'da trafik ${t.durum}; yoğunluk endeksi ${t.genel}, Anadolu yakası ${t.anadolu}, Avrupa yakası ${t.avrupa}.`,
    });
  }
  if (s.gundem.length) {
    out.push({
      id: 'gundem', baslik: 'GÜNDEMİN 5 OLAYI',
      html: `<ol class="hb-gundem5">${s.gundem.map(k => `<li><b style="color:${KATEGORI_RENK[k.kategori]}">${KATEGORI_AD[k.kategori]}</b><p>${esc(k.baslik)}</p><em>${k.kaynakSayisi} kaynak · ${saatYaz(k.son)} · ${esc(k.kaynak)}</em></li>`).join('')}</ol>`,
      soz: `Gündemin başında ${s.gundem[0].kaynakSayisi} kaynağın verdiği haber var: ${s.gundem[0].baslik}.`,
    });
  }
  // Ajanda: Jarvis'te henüz takvim bağlantısı yok; varsa burada görünür
  return out;
}

export function sabahHtml(kartlar: SabahKart[], i: number, yukleniyor: boolean): string {
  if (yukleniyor) return `<div class="hb-sabah"><h2>GÜNAYDIN · SABAH ÖZETİ</h2><div class="hb-analiz"><i></i><span>HAVA · DÖVİZ · TRAFİK · GÜNDEM</span></div></div>`;
  return `
  <div class="hb-sabah">
    <h2>GÜNAYDIN · SABAH ÖZETİ <span>✋ ↕ kaydır</span></h2>
    <div class="hb-yigin">${kartlar.map((k, j) => `<section class="hb-sabah-kart ${j === i ? 'on' : j < i ? 'gecti' : ''}" style="--d:${j - i}"><h3>${k.baslik}</h3>${k.html}</section>`).join('')}</div>
    <ol class="hb-sabah-nokta">${kartlar.map((k, j) => `<li class="${j === i ? 'on' : ''}">${k.baslik}</li>`).join('')}</ol>
  </div>`;
}
