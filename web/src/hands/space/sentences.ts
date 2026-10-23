// Uzay Laboratuvarı · Jarvis'in cümleleri. Hepsi o anki hesaplardan kurulur (modele gitmez, gecikme olmaz).
// Seste sayılar konuşma diline çevrilir: AU yerine milyon kilometre, ondalık virgülle, eksi sayılar "eksi".
import { AU_KM, VERI, YB_DIS, YB_IC, type Cisim, type Gezegen } from './data';
import type { Elements } from './physics';

export type Durum = 'buz' | 'su' | 'kaynayan' | 'kizgin' | 'kaya' | 'gaz';

const DURUM_AD: Record<Durum, string> = {
  buz: 'okyanuslar donmuş', su: 'sıvı su', kaynayan: 'okyanuslar kaynıyor', kizgin: 'kızgın kaya', kaya: 'kaya yüzey', gaz: 'katı yüzey yok',
};
/** Yüzey hâlinin adı (okyanusu olmayan gövdelerde buz "buzla kaplı") */
export const durumAd = (g: Gezegen, d: Durum) => (d === 'buz' && g !== 'dunya' ? 'buzla kaplı' : DURUM_AD[d]);

/** Sayı (Türkçe biçim): 0,72 · 1.240 */
export const sayi = (v: number, ondalik = 0) => v.toLocaleString('tr-TR', { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
/** Sıcaklık sesli: "eksi 18 derece" */
const derece = (c: number) => `${c < 0 ? 'eksi ' : ''}${sayi(Math.abs(Math.round(c)))} derece`;
/** Uzaklık sesli: "108 milyon kilometre" ya da "1,2 milyar kilometre" */
export const uzakSoz = (au: number) => {
  const mkm = (au * AU_KM) / 1e6;
  return mkm >= 1000 ? `${sayi(mkm / 1000, 1)} milyar kilometre` : `${sayi(mkm)} milyon kilometre`;
};
/** Süre sesli: "12 dakika 31 saniye", "1 saat 10 dakika" */
export const sureSoz = (sn: number) => {
  const s = Math.round(sn);
  if (s < 60) return `${s} saniye`;
  const dk = Math.floor(s / 60), kalan = s % 60;
  if (dk < 60) return kalan ? `${dk} dakika ${kalan} saniye` : `${dk} dakika`;
  const sa = Math.floor(dk / 60), d2 = dk % 60;
  return d2 ? `${sa} saat ${d2} dakika` : `${sa} saat`;
};
/** "12 dakika 31 saniyede" (bulunma ekiyle) */
const sureDe = (sn: number) => { const t = sureSoz(sn); return t + (t.endsWith('saat') ? 'te' : t.endsWith('dakika') ? 'da' : 'de'); };
/** Gün sayısı sesli: "259 gün", "2,4 yıl" */
export const gunSoz = (gun: number) => (gun < 730 ? `${sayi(gun)} gün` : `${sayi(gun / 365.25, 1)} yıl`);

const ybMi = (r: number) => r >= YB_IC && r <= YB_DIS;

/** Gezegen yeni (dairesel) yörüngesine yerleşti */
export function yerlesti(g: Gezegen, r: number, Tc: number, durum: Durum): string {
  const v = VERI[g];
  const yer = `${v.ad} şimdi Güneş'ten ${uzakSoz(r)} uzakta efendim.`;
  if (!v.kaya) return `${yer} Bulut tepelerinde sıcaklık yaklaşık ${derece(Tc)}; katı bir yüzeyi yok.`;
  const T = `Ortalama yüzey sıcaklığı yaklaşık ${derece(Tc)}`;
  if (g === 'dunya') {
    const yb = ybMi(r) ? ' Yaşanabilir bölgenin içinde.' : r < YB_IC ? ' Yaşanabilir bölgenin iç sınırını geçti; su buharı zamanla uzaya kaçar.' : ' Yaşanabilir bölgenin dışında.';
    const ne = durum === 'buz' ? 'okyanuslar donar.' : durum === 'su' ? 'okyanuslar sıvı kalır.' : durum === 'kaynayan' ? 'okyanuslar kaynar.' : 'okyanuslar çoktan buharlaştı, yüzey kızgın kaya.';
    return `${yer} ${T}; ${ne}${yb}`;
  }
  const ek = durum === 'kizgin' ? ' Yüzey kızgın kaya.' : durum === 'buz' ? ' Yüzey buzla kaplanır.' : '';
  return `${yer} ${T}.${ek}${ybMi(r) ? ' Yaşanabilir bölgenin içinde, ama sıvı suyu yok.' : ''}`;
}

/** Fırlatma sonucu (tahminden) */
export function firlatma(g: Gezegen, sonuc: 'dustu' | 'kacti' | 'yorunge', el: Elements, hizKat: number): string {
  const ad = VERI[g].ad;
  if (sonuc === 'kacti') return `${ad} kaçış hızını aştı efendim; dairesel hızının ${sayi(hizKat, 1)} katıyla Güneş sisteminden kaçıyor.`;
  if (sonuc === 'dustu') return `${ad} Güneş'e düşüyor efendim.`;
  if (el.e < 0.05) return `${ad} neredeyse dairesel bir yörüngeye oturdu efendim.`;
  return `${ad} basık bir yörüngede efendim: Güneş'e en yakın ${uzakSoz(el.q)}, en uzak ${uzakSoz(el.Q)}. Bir turu ${gunSoz(el.P * 365.25)} sürer.`;
}

export const dustuSoz = (g: Gezegen) => `${VERI[g].ad} Güneş'e düştü efendim.`;
export const kactiSoz = (g: Gezegen) => `${VERI[g].ad} Güneş sisteminden kaçtı efendim.`;

/** Işık ipi: iki gezegen arası */
export function ip(a: Gezegen, b: Gezegen, isikSn: number, hohmann: number): string {
  return `${ad5(a)} ${ad3(b)} ışık ${sureDe(isikSn)} ulaşır efendim. En az yakıtla yolculuk ise ${gunSoz(hohmann)} sürer.`;
}

/** Mesaj gönderildi */
export const mesaj = (a: Gezegen, b: Gezegen, isikSn: number) => `Mesaj yolda efendim. ${ad5(a)} ${ad3(b)} ${sureDe(isikSn)} ulaşacak.`;

/** Karşılaştırma: b'deki çekim ve ağırlık hissi */
export function karsilastir(a: Cisim, b: Cisim, kg: number): string {
  const va = VERI[a], vb = VERI[b];
  const oran = vb.cekim / va.cekim;
  const his = Math.round((kg * vb.cekim) / VERI.dunya.cekim);
  const cap = vb.yaricap / va.yaricap;
  const boy = `${vb.ad}, ${ad5(a)} ${sayi(cap >= 1 ? cap : 1 / cap, cap >= 10 ? 0 : 1)} kat ${cap >= 1 ? 'büyük' : 'küçük'}`;
  return `${boy} efendim. Yerçekimi ${va.adIn} yüzde ${sayi(oran * 100)}'${yuzdeEk(Math.round(oran * 100))}; ${kg} kiloluk biri orada ${his} kilo gibi hisseder.`;
}

/** Çarpışma */
export function carpisma(a: Gezegen, b: Gezegen, hizKmS: number, birlesti: boolean): string {
  const s = `${VERI[a].ad} ile ${VERI[b].ad} çarpıştı efendim. Çarpma hızı saniyede yaklaşık ${sayi(hizKmS)} kilometre.`;
  return birlesti ? `${s} Kütleleri yakın: ikisi erimiş tek bir gezegende birleşti.` : `${s} Saçılan enkaz yörüngede toplanıp bir uydu oluşturabilir; Ay'ın da böyle oluştuğu düşünülüyor.`;
}

/** Kesit */
export function kesit(g: Cisim): string {
  const v = VERI[g];
  const k = v.katmanlar[0];
  const km = Math.round((k.r * v.yaricap) / 10) * 10;
  return `${v.adIn} kesiti efendim. En içte ${k.ad.replace(/\s*\(.*\)$/, '').toLocaleLowerCase('tr')}, yarıçapı yaklaşık ${sayi(km)} kilometre.`;
}

/** Tarih */
export const tarihSoz = (d: Date) => `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}, efendim. Gezegenler o günkü yerlerinde.`;

// ------------------------------------------------------------------ Türkçe ekler (gezegen adları için)

const SESLI = 'aeıioöuü';
const sonSesli = (s: string) => { for (let i = s.length - 1; i >= 0; i--) if (SESLI.includes(s[i])) return s[i]; return 'e'; };
const kalin = (s: string) => 'aıou'.includes(sonSesli(s.toLocaleLowerCase('tr')));
const sertSon = (s: string) => 'çfhkpsşt'.includes(s.toLocaleLowerCase('tr').slice(-1));
const sesliyleBiter = (s: string) => SESLI.includes(s.toLocaleLowerCase('tr').slice(-1));
/** -dan/-den/-tan/-ten */
const ekDen = (ad: string) => `'${sertSon(ad) ? 't' : 'd'}${kalin(ad) ? 'a' : 'e'}n`;
/** "Dünya'dan" */
const ad5 = (g: Cisim) => `${VERI[g].ad}${ekDen(VERI[g].ad)}`;
/** -a/-e/-ya/-ye: "Mars'a", "Dünya'ya" */
const ad3 = (g: Gezegen) => { const a = VERI[g].ad; return `${a}'${sesliyleBiter(a) ? 'y' : ''}${kalin(a) ? 'a' : 'e'}`; };
/** "yüzde 38'i" eki: sayının okunuşuna göre */
function yuzdeEk(n: number): string {
  const son = n % 10, onlar = Math.floor(n / 10) % 10;
  if (n === 0) return 'ı';
  if (n % 100 === 0) return 'ü';
  const ek: Record<number, string> = { 1: 'i', 2: 'si', 3: 'ü', 4: 'ü', 5: 'i', 6: 'sı', 7: 'si', 8: 'i', 9: 'u' };
  if (son) return ek[son];
  const onEk: Record<number, string> = { 1: 'u', 2: 'si', 3: 'u', 4: 'ı', 5: 'si', 6: 'ı', 7: 'i', 8: 'i', 9: 'ı' };
  return onEk[onlar];
}
