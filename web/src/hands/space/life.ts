// Uzay Laboratuvarı · yaşam izi taraması: hesap kısmı (saf fonksiyonlar, tarayıcı gerektirmez; life.test.ts).
//
// Tarama "yaşam için koşullar ne kadar uygun?" ve "bugüne kadar ne bulundu?" sorularını cevaplar. Yaşam olasılığı
// (yüzde) VERMEZ; bilim bunu hiçbir gök cismi için veremez. Her madde ya simülasyondan HESAPLANIR ya da BİLİNEN VERİ'dir.
//
// Dünya Benzerlik Endeksi (ESI): Schulze-Makuch ve ark. 2011, Astrobiology 11(10):1041-1052. Biçim ve ağırlıklar:
// Kashyap ve ark. 2017 (arXiv:1702.03678) Tablo 1. ESI = Π (1 − |(x − x₀)/(x + x₀)|)^(wᵢ/n), n = 4:
// yarıçap 0,57 · yoğunluk 1,07 · kaçış hızı 0,70 · yüzey sıcaklığı 5,58 (Dünya: 1 Dünya birimi ve 288 K).
// ESI yüzey koşullarını ölçer; buz altındaki okyanusları kapsamaz.
import { VERI, YB_IC, type Cisim, type Gezegen } from './data';
import { IC_ENERJI, KESIFLER, KORUMA, ORGANIK, SONUC, YERALTI_SOZ, YERALTI_SU, YUZEY_SOZ, type Bilinen, type Kesif, type Var } from './facts';
import { sayi, uzakSoz } from './sentences';

const ESI_W = { r: 0.57, d: 1.07, v: 0.7, t: 5.58 };
const ESI_REF = { r: 6371, d: 5514, v: 11.186, t: 288 };

/** Dünya Benzerlik Endeksi (0..1): yarıçap (km), yoğunluk (kg/m³), kaçış hızı (km/s), yüzey sıcaklığı (K) */
export function esi(r: number, d: number, v: number, T: number): number {
  const f = (x: number, x0: number, w: number) => Math.pow(1 - Math.abs((x - x0) / (x + x0)), w / 4);
  return f(r, ESI_REF.r, ESI_W.r) * f(d, ESI_REF.d, ESI_W.d) * f(v, ESI_REF.v, ESI_W.v) * f(T, ESI_REF.t, ESI_W.t);
}

/** Suyun üçlü noktası (bar): bunun altında buz eriyemez, doğrudan buhara döner */
export const UCLU_NOKTA = 0.00611;
/** Suyun bu basınçtaki kaynama noktası (°C), Clausius-Clapeyron (L = 40,66 kJ/mol) */
export function kaynamaC(P: number): number {
  const invT = 1 / 373.15 - (8.314 / 40660) * Math.log(P / 1.01325);
  return 1 / invT - 273.15;
}
/** Güneş sabiti (W/m², 1 AU) */
export const GUNES_SABITI = 1361;

export type Etiket = 'HESAPLANDI' | 'BİLİNEN VERİ';
export interface Madde { ad: string; durum: Var; etiket: Etiket; deger: string }

export interface TaramaGirdi {
  /** Gövdenin (uyduysa gezegeninin) Güneş'e uzaklığı (AU) */
  r: number;
  /** Simülasyondaki ortalama yüzey sıcaklığı (°C) */
  Tc: number;
  /** Kullanıcı yerini değiştirdi mi */
  degisti: boolean;
  /** Ay kaldırıldı mı */
  ayYok: boolean;
}

export interface Tarama {
  cisim: Cisim;
  ad: string;
  girdi: TaramaGirdi;
  /** Atmosfer (hacimce %) ve basınç */
  atmosfer: [string, number][];
  basinc: number | null;
  maddeler: Madde[];
  esi: number;
  esiNot: string;
  kesifler: Kesif[];
  sonuc: { bolge: string; neden: string; sonraki: string };
  /** Kesitte vurgulanacak okyanus katmanı (yoksa -1) */
  okyanusKatman: number;
  /** Buzlu yüzey (çatlaklar), güney kutbundan püskürme */
  buzlu: boolean;
  puskurme: boolean;
  /** Jarvis'in adım cümleleri: 0 odak · 1 yüzey · 2 spektrum · 3 yer altı · 4 kontrol · 5 ESI · 6 keşifler · 7 sonuç */
  cumleler: string[];
  /** Hızlı tarama: yalnızca odak, ESI ve sonuç konuşulur */
  hizliCumleler: string[];
}

const GAZ_AD: Record<string, string> = { 'N₂': 'azot', 'O₂': 'oksijen', 'CO₂': 'karbondioksit', 'CH₄': 'metan', 'H₂': 'hidrojen', He: 'helyum', Ar: 'argon', CO: 'karbonmonoksit' };

/** Yüzeyde sıvı su: simülasyondaki sıcaklık + basınçtan (ve Dünya için Kopparapu iç sınırından) */
function yuzeySu(c: Cisim, g: TaramaGirdi): Madde {
  const v = VERI[c];
  const ad = 'Yüzeyde sıvı su';
  const T = `≈ ${sayi(Math.round(g.Tc))} °C`;
  if (!v.kaya) return { ad, durum: 'hayir', etiket: 'HESAPLANDI', deger: 'katı yüzey yok' };
  const P = v.basinc ?? 0;
  if (P < UCLU_NOKTA) return { ad, durum: 'hayir', etiket: 'HESAPLANDI', deger: `${T} · basınç çok düşük: buz eriyemez, buhara döner` };
  if (g.Tc < 0) return { ad, durum: 'hayir', etiket: 'HESAPLANDI', deger: `${T} · donmuş` };
  const kb = kaynamaC(P);
  if (g.Tc >= kb) return { ad, durum: 'hayir', etiket: 'HESAPLANDI', deger: `${T} · ${sayi(P, P < 10 ? 2 : 0)} bar'da su ${sayi(Math.round(kb))} °C'de kaynar` };
  // Okyanuslu bir dünya yaşanabilir bölgenin iç sınırını geçerse su buharı üst atmosferde parçalanıp uzaya kaçar
  if (c === 'dunya' && g.r < YB_IC) return { ad, durum: 'hayir', etiket: 'HESAPLANDI', deger: `${T} · kaçak sera: okyanuslar zamanla uzaya kaçar` };
  return { ad, durum: 'evet', etiket: 'HESAPLANDI', deger: `${T} · ${sayi(P, 2)} bar` };
}

const DURUM_SIRA: Record<Kesif['durum'], number> = { 'KANITLANDI': 0, 'GÜÇLÜ İŞARET': 1, 'TARTIŞMALI': 2, 'BULUNMADI': 3 };

/** Bir cismi tara: hesaplanan ve bilinen maddeler, ESI, keşifler, sonuç ve Jarvis'in cümleleri */
export function tara(c: Cisim, g: TaramaGirdi): Tarama {
  const v = VERI[c];
  const maddeler: Madde[] = [];
  const su = yuzeySu(c, g);
  maddeler.push(su);
  const yer = YERALTI_SU[c];
  if (yer) maddeler.push({ ad: 'Yer altında sıvı su', durum: yer.durum, etiket: 'BİLİNEN VERİ', deger: yer.not });
  // Güneş ışığı (uydu ise gezegeninin uzaklığı); Dünya'ya oranla
  const W = GUNES_SABITI / (g.r * g.r);
  const oran = W / GUNES_SABITI;
  maddeler.push({
    ad: 'Enerji: güneş ışığı', durum: oran >= 0.1 ? 'evet' : oran >= 0.01 ? 'belirsiz' : 'hayir', etiket: 'HESAPLANDI',
    deger: `${sayi(W, W < 10 ? 1 : 0)} W/m² · Dünya'nın ${oran >= 1 ? sayi(oran, 1) + ' katı' : sayi(oran, oran < 0.1 ? 3 : 2) + ' katı'}`,
  });
  const ic = IC_ENERJI[c];
  if (ic) maddeler.push({ ad: 'Enerji: gelgit / iç ısı', durum: ic.durum, etiket: 'BİLİNEN VERİ', deger: ic.not });
  const k: Bilinen = KORUMA[c];
  maddeler.push({ ad: 'Koruyucu atmosfer / manyetik alan', durum: k.durum, etiket: 'BİLİNEN VERİ', deger: k.not });
  const o: Bilinen = ORGANIK[c];
  maddeler.push({ ad: 'Temel elementler ve organik moleküller', durum: o.durum, etiket: 'BİLİNEN VERİ', deger: o.not });
  // Laskar ve ark. 1993, Nature 361 (Ay olmadan eğiklik kaotik); Lissauer ve ark. 2012, Icarus 217 (değişim daha sınırlı)
  if (c === 'dunya' && g.ayYok) maddeler.push({ ad: 'İklim kararlılığı (Ay yok)', durum: 'belirsiz', etiket: 'BİLİNEN VERİ', deger: 'Eksen eğikliği çok daha fazla değişebilir; ne kadar, tartışmalı' });

  const Tk = g.Tc + 273.15;
  const e = esi(v.yaricap, v.yogunluk, v.kacis, Tk);
  const buzlu = c === 'europa' || c === 'ganymede' || c === 'enceladus';
  const esiNot = buzlu || c === 'titan'
    ? 'ESI yüzey koşullarını ölçer; buzun altındaki okyanusu kapsamaz.'
    : c === 'mars' ? 'Yayınlanan 0,70 farklı bir yüzey sıcaklığıyla (≈227 K) hesaplanmış; burada simülasyondaki sıcaklık kullanıldı.'
    : 'Yarıçap, yoğunluk, kaçış hızı ve yüzey sıcaklığından (Schulze-Makuch 2011).';

  const kesifler = [...KESIFLER[c]].sort((a, b) => DURUM_SIRA[a.durum] - DURUM_SIRA[b.durum]);
  let sonuc = { ...SONUC[c] };
  // Dünya taşındıysa sonuç değişen koşullardan
  if (c === 'dunya' && su.durum !== 'evet') {
    sonuc = g.Tc < 0
      ? { bolge: 'Buzun altındaki okyanus ve deniz tabanı kaynakları', neden: 'Yüzey donar; bu modelde yaşam ancak buzun altında sürebilir', sonraki: '—' }
      : { bolge: 'Yok', neden: 'Okyanuslar kaybolur: yüzeyde sıvı su kalmaz', sonraki: '—' };
  }
  const okyanusKatman = v.katmanlar.findIndex(L => /okyanus/i.test(L.ad));

  // ---- Jarvis'in cümleleri (yaşam olasılığı yok; yalnızca koşullar ve bulgular)
  const yuzey = c === 'dunya' && g.degisti ? dunyaYuzey(g, su) : YUZEY_SOZ[c];
  const atm = v.atmosfer;
  const spektrum = !atm.length || (v.basinc !== null && v.basinc < 0.001)
    ? 'Atmosfer yok denecek kadar ince.'
    : `Atmosferde en çok ${GAZ_AD[atm[0][0]] ?? atm[0][0]} var${atm[1] ? `, ardından ${GAZ_AD[atm[1][0]] ?? atm[1][0]}` : ''}.`;
  const yerSoz = YERALTI_SOZ[c] ?? '';
  const suSoz = su.durum === 'evet' ? 'Yüzeyde sıvı su var' : `Yüzeyde sıvı su yok${su.deger.includes('kaçak sera') ? '; kaçak sera etkisi' : su.deger.includes('donmuş') ? '; donmuş' : ''}`;
  const yerKisa = yer ? (yer.durum === 'evet' ? ', ama yer altında okyanus işareti var' : ', yer altı suyu tartışmalı') : '';
  const enerji = maddeler.filter(m => m.ad.startsWith('Enerji')).some(m => m.durum === 'evet') ? 'enerji kaynağı var' : 'enerji kaynağı zayıf';
  const kontrol = `${suSoz}${yerKisa}; ${enerji}.`;
  const esiSoz = `Dünya Benzerlik Endeksi ${sayi(e, 2)}.${buzlu || c === 'titan' ? ' Bu yalnızca yüzeyi ölçer, buzun altını değil.' : ''}`;
  const kesifSoz = kesifSozu(c, kesifler);
  const sonucSoz = sonuc.bolge === 'Yok'
    ? `Burada yaşam için umut verici bir bölge yok efendim; ${sonuc.neden.toLocaleLowerCase('tr')}.`
    : `En umut verici yer: ${sonuc.bolge.toLocaleLowerCase('tr')}.${sonuc.sonraki !== '—' ? ` Sırada ${sonraki(sonuc.sonraki)}.` : ''}`;
  const odak = `${v.ad} için yaşam izi taraması başlıyor efendim.`;
  return {
    cisim: c, ad: v.ad, girdi: g, atmosfer: atm, basinc: v.basinc, maddeler, esi: e, esiNot, kesifler, sonuc, okyanusKatman,
    buzlu, puskurme: c === 'enceladus',
    cumleler: [odak, yuzey, spektrum, yerSoz, kontrol, esiSoz, kesifSoz, sonucSoz],
    // Hızlı tarama (≈7 sn): kısa cümleler, ayrıntı sonuç kartında
    hizliCumleler: [`Hızlı tarama: ${v.ad}.`, '', '', '', '', `Benzerlik endeksi ${sayi(e, 2)}.`, '', sonuc.bolge === 'Yok' ? 'Umut verici bir bölge yok.' : `En umut verici yer: ${sonuc.bolge.toLocaleLowerCase('tr')}.`],
  };
}

/** Taşınmış Dünya'nın yüzeyi (simülasyondan) */
function dunyaYuzey(g: TaramaGirdi, su: Madde): string {
  const yer = `Dünya Güneş'ten ${uzakSoz(g.r)} uzakta.`;
  if (g.Tc < 0) return `${yer} Okyanuslar donmuş.`;
  if (su.deger.includes('kaçak sera')) return `${yer} Su buharı atmosferi ısıtıyor; kaçak sera etkisi başlıyor.`;
  if (su.durum !== 'evet') return `${yer} Okyanuslar kaynıyor.`;
  return `${yer} Okyanuslar hâlâ sıvı.`;
}

function kesifSozu(c: Cisim, k: Kesif[]): string {
  if (c === 'dunya') return 'Yaşam burada kanıtlandı: bildiğimiz tek yaşamlı dünya.';
  if (k.every(x => x.durum === 'BULUNMADI')) return 'Bugüne kadar yaşama uygun koşul bulunmadı.';
  const say = (d: Kesif['durum']) => k.filter(x => x.durum === d).length;
  const parca = [
    say('KANITLANDI') && `${say('KANITLANDI')} kanıtlanmış`,
    say('GÜÇLÜ İŞARET') && `${say('GÜÇLÜ İŞARET')} güçlü işaret`,
    say('TARTIŞMALI') && `${say('TARTIŞMALI')} tartışmalı`,
  ].filter(Boolean).join(', ');
  return `Bulgular: ${parca}. Yaşamın kendisi Dünya dışında henüz bulunmadı.`;
}

/** "NASA Europa Clipper: Nisan 2030'da Jüpiter'e varış" → "NASA Europa Clipper var: Nisan 2030'da Jüpiter'e varış" */
function sonraki(s: string): string {
  const i = s.indexOf(':');
  return i > 0 ? `${s.slice(0, i)} var; ${s.slice(i + 1).trim()}` : s;
}

// ------------------------------------------------------------------ Bölge taraması

/** "Bu bölgede tara": odaktaki gezegen ve uyduları ya da iç gezegenler ve Ay */
export function bolgeCisimleri(odak: Gezegen | null): Cisim[] {
  if (odak === 'jupiter') return ['jupiter', 'europa', 'ganymede'];
  if (odak === 'saturn') return ['saturn', 'enceladus', 'titan'];
  if (odak === 'dunya') return ['dunya', 'ay'];
  if (odak) return [odak];
  return ['merkur', 'venus', 'dunya', 'ay', 'mars'];
}

/** Bölge karşılaştırma cümlesi */
export function bolgeSoz(t: Tarama[]): string {
  const best = [...t].sort((a, b) => puan(b) - puan(a))[0];
  return `Karşılaştırma: koşulları en uygun görünen ${best.ad}. Bu, yaşam olduğu anlamına gelmez.`;
}
/** Sıralama için (gösterilmez): yüzey ya da yer altı suyu, enerji, organikler, sonra ESI */
function puan(t: Tarama): number {
  const p = (ad: string) => { const m = t.maddeler.find(x => x.ad.startsWith(ad)); return m ? (m.durum === 'evet' ? 1 : m.durum === 'belirsiz' ? 0.4 : 0) : 0; };
  return Math.max(p('Yüzeyde sıvı su'), p('Yer altında sıvı su')) * 3 + p('Enerji') + p('Temel elementler') + t.esi;
}

/** Laboratuvar bağlamı için kısa özet (Jarvis'in sohbet aracı bunu kullanır) */
export function ozet(t: Tarama) {
  return {
    cisim: t.ad,
    gunese_uzaklik_AU: +t.girdi.r.toFixed(3),
    yuzey_sicakligi_C: Math.round(t.girdi.Tc),
    esi: +t.esi.toFixed(2),
    esi_notu: t.esiNot,
    kontrol_listesi: t.maddeler.map(m => `${m.durum === 'evet' ? '✓' : m.durum === 'hayir' ? '✗' : '?'} ${m.ad} [${m.etiket}]: ${m.deger}`),
    kesifler: t.kesifler.map(k => `${k.durum}: ${k.cumle} (${k.yil}, ${k.gorev})`),
    en_umut_verici: `${t.sonuc.bolge}: ${t.sonuc.neden}`,
    sonraki_adim: t.sonuc.sonraki,
  };
}
