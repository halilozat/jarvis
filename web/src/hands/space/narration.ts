// Uzay Laboratuvarı · Jarvis'in hafızası ve samimi anlatımı. Oturumda neler yapıldığını (taşınan gezegenler, kaldırılan
// Ay, önceki taramalar) hatırlar; tarama cümlelerine bunlara gönderme yapan, aynı cümleyi tekrarlamayan bir ton katar.
// Son taramalar bu cihazda saklanır ("geçen sefer Europa'ya bakmıştık"). Saf fonksiyonlar; yaşam olasılığı yok.
import type { Cisim } from './data';
import type { Tarama } from './life';
import { sayi } from './sentences';

export interface TaramaKaydi { cisim: Cisim; ad: string; esi: number; suYuzey: string; suAlti: string | null; r: number; Tc: number; degisti: boolean; at: number }
export interface Olay { tip: 'tasi' | 'yaklastir' | 'kaldir' | 'firlat' | 'carpisma' | 'tarih' | 'sifirla'; cisim?: Cisim; metin: string; at: number }

const ANAHTAR = 'jarvis.lab.taramalar';

export class LabHafiza {
  taramalar: TaramaKaydi[] = [];
  olaylar: Olay[] = [];
  /** Önceki oturumlardan (bu cihazda saklanan) son taramalar */
  onceki: TaramaKaydi[] = [];
  constructor() {
    try { this.onceki = JSON.parse(localStorage.getItem(ANAHTAR) || '[]'); } catch { this.onceki = []; }
  }
  olay(o: Omit<Olay, 'at'>) { this.olaylar.push({ ...o, at: Date.now() }); if (this.olaylar.length > 30) this.olaylar.shift(); }
  kaydet(t: Tarama) {
    const k: TaramaKaydi = {
      cisim: t.cisim, ad: t.ad, esi: t.esi, r: t.girdi.r, Tc: t.girdi.Tc, degisti: t.girdi.degisti, at: Date.now(),
      suYuzey: t.maddeler.find(m => m.ad === 'Yüzeyde sıvı su')?.durum ?? 'hayir',
      suAlti: t.maddeler.find(m => m.ad === 'Yer altında sıvı su')?.durum ?? null,
    };
    this.taramalar.push(k);
    try { localStorage.setItem(ANAHTAR, JSON.stringify([...this.onceki, ...this.taramalar].slice(-12))); } catch { /* yok */ }
  }
  /** Sıfırlayınca oturumun taşıma olayları unutulur, taramalar hatırlanır */
  sifirla() { this.olay({ tip: 'sifirla', metin: 'sıfırlandı' }); }
  /** Jarvis'in sohbet bağlamı için */
  ozet() {
    return {
      bu_oturumdaki_taramalar: this.taramalar.map(k => `${k.ad}: ESI ${sayi(k.esi, 2)}, yüzeyde su ${k.suYuzey === 'evet' ? 'var' : 'yok'}${k.degisti ? ' (yeri değiştirilmişti)' : ''}`),
      onceki_oturumlar: this.onceki.slice(-4).map(k => `${k.ad}: ESI ${sayi(k.esi, 2)}`),
      son_hareketler: this.olaylar.slice(-6).map(o => o.metin),
    };
  }
}

// ------------------------------------------------------------------ Türkçe ekler

const SESLI = 'aeıioöuü';
const sonSesli = (s: string) => { const l = s.toLocaleLowerCase('tr'); for (let i = l.length - 1; i >= 0; i--) if (SESLI.includes(l[i])) return l[i]; return 'e'; };
const sesliBiter = (s: string) => SESLI.includes(s.toLocaleLowerCase('tr').slice(-1));
const dar = (s: string) => ({ a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' })[sonSesli(s)] ?? 'i';
const genis = (s: string) => ('aıou'.includes(sonSesli(s)) ? 'a' : 'e');
/** Belirtme: Dünya'yı, Mars'ı, Enceladus'u */
export const adI = (ad: string) => `${ad}'${sesliBiter(ad) ? 'y' : ''}${dar(ad)}`;
/** Yönelme: Dünya'ya, Mars'a */
export const adE = (ad: string) => `${ad}'${sesliBiter(ad) ? 'y' : ''}${genis(ad)}`;
/** Bulunma: Europa'da, Mars'ta */
export const adDe = (ad: string) => `${ad}'${'çfhkpsşt'.includes(ad.slice(-1)) ? 't' : 'd'}${genis(ad)}`;

// ------------------------------------------------------------------ Kişiselleştirme

const sec = <T,>(arr: T[], n: number) => arr[n % arr.length];

/**
 * Taramanın cümlelerine hafızadan gönderme ekle. Dönüş: yeni cümle dizisi (8 adım). hizli: yalnızca odak, ESI, sonuç.
 * Cümleler kısa kalır; sayılar taramanın hesabından gelir.
 */
export function kisisellestir(t: Tarama, h: LabHafiza, hizli: boolean): string[] {
  const out = [...(hizli ? t.hizliCumleler : t.cumleler)];
  const ad = t.ad, n = h.taramalar.length;
  const simdi = Date.now();
  const onceAyni = [...h.taramalar].reverse().find(k => k.cisim === t.cisim);
  const sonFarkli = [...h.taramalar].reverse().find(k => k.cisim !== t.cisim);
  const tasima = [...h.olaylar].reverse().find(o => (o.tip === 'tasi' || o.tip === 'yaklastir') && o.cisim === t.cisim && simdi - o.at < 10 * 60_000);
  const sifirSonra = tasima && h.olaylar.some(o => o.tip === 'sifirla' && o.at > tasima.at);
  const ayYok = t.girdi.ayYok && t.cisim === 'dunya';

  // 0 · Odak
  if (tasima && !sifirSonra && t.girdi.degisti) out[0] = `${adI(ad)} az önce ${tasima.metin} taşımıştık. Bakalım bu ona ne yaptı, efendim.`;
  else if (ayYok) out[0] = "Ay'sız bir Dünya… Açıkçası ben de merak ediyorum efendim. Taramayı başlatıyorum.";
  else if (onceAyni) out[0] = Math.abs(onceAyni.r - t.girdi.r) > 0.02 ? `${adE(ad)} ikinci kez bakıyoruz; o zamandan beri yeri değişti.` : `${adE(ad)} bir kez daha bakıyoruz. Bu sefer daha dikkatli, söz veriyorum.`;
  else if (n === 0 && h.onceki.length && h.onceki[h.onceki.length - 1].cisim !== t.cisim) out[0] = `Geçen sefer ${adE(h.onceki[h.onceki.length - 1].ad)} bakmıştık. Bugün sıra ${adDe(ad)}, efendim.`;
  else out[0] = sec([
    `Hadi bakalım, ${ad}. Taramayı başlatıyorum efendim.`,
    `${ad}, hedefe kilitlendim. Başlıyorum efendim.`,
    `${ad} için sensörleri ısıtıyorum efendim.`,
    `Sıradaki konuğumuz ${ad}. Bakalım neler saklıyor.`,
  ], n);
  if (hizli) out[0] = `Hızlı tarama: ${ad}.`;

  // 4 · Kontrol listesi: taşınmış Dünya'da önceki hâliyle karşılaştır
  const suNow = t.maddeler.find(m => m.ad === 'Yüzeyde sıvı su')?.durum;
  if (!hizli && t.cisim === 'dunya' && onceAyni && onceAyni.suYuzey === 'evet' && suNow !== 'evet') {
    out[4] += t.girdi.Tc < 0 ? ' Az önce okyanuslar sıvıydı; Güneş\'ten uzaklaşmak hepsini dondurdu.' : ' Az önce okyanuslar sıvıydı; Güneş\'e yaklaşmak onları kaybettirdi.';
  }

  // 5 · ESI: önceki taramayla karşılaştır
  const e = sayi(t.esi, 2);
  if (onceAyni && Math.abs(onceAyni.esi - t.esi) >= 0.01) out[5] = `Dünya Benzerlik Endeksi ${e}; az önce ${sayi(onceAyni.esi, 2)} idi.`;
  else if (sonFarkli) out[5] = `Dünya Benzerlik Endeksi ${e}. ${adDe(sonFarkli.ad)} ${sayi(sonFarkli.esi, 2)} görmüştük${t.esi > sonFarkli.esi + 0.2 ? '; arada büyük fark var' : t.esi < sonFarkli.esi - 0.2 ? '; bu kez çok daha düşük' : ''}.`;
  else if (t.cisim === 'dunya' && t.esi > 0.99) out[5] = `Dünya Benzerlik Endeksi ${e}. Sürpriz olmadı sanırım efendim.`;
  if (!hizli && (t.buzlu || t.cisim === 'titan')) out[5] += ' Ama bu sayı yalnızca yüzeyi ölçer, buzun altını değil.';
  if (hizli) out[5] = `Benzerlik endeksi ${e}.`;

  // 7 · Sonuç: önceki taramalara bağla
  const oncekiOkyanus = h.taramalar.find(k => k.suAlti === 'evet' && k.cisim !== t.cisim);
  const dunyaDondu = h.taramalar.find(k => k.cisim === 'dunya' && k.degisti && k.Tc < 0);
  if (t.cisim === 'dunya' && !t.girdi.degisti && t.esi > 0.99 && !ayYok) out[7] = sec(['En umut verici yer: her yer. Siz de dahil efendim.', 'En umut verici yer: burası. Evden iyisi yok efendim.'], n);
  else if (t.cisim === 'dunya' && t.girdi.Tc < 0 && oncekiOkyanus) out[7] = `Umut yine buzun altında efendim. ${adDe(oncekiOkyanus.ad)} gördüğümüz tabloya benzedi, değil mi?`;
  else if (t.buzlu && dunyaDondu && t.cisim !== 'dunya') out[7] += " Dondurduğumuz Dünya'yı hatırlayın; umut orada da buzun altındaydı.";
  return out;
}

