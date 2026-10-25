// Haber Modu · söylenen ve gerçek: iddia kontrolü.
// İddiaları model ya da kod çıkarır (alıntı kaynak metinde birebir, sorgudaki sayı alıntıda geçmek zorunda).
// Etiketi model DEĞİL, bu dosyadaki kurallar verir; her etiketin yanında veri kaynağının bağlantısı ve verinin tarihi.
// Etiketler iddiaya verilir; kaynağa ya da kişiye değil. Veri yoksa "DOĞRULANAMADI": asla tahmin yürütülmez.
//
// Kurallar (eşikler):
// - Kur (TCMB gösterge satış kuru): fark ≤ %1 uyumlu · ≤ %3 eksik bağlam (piyasa kuru gün içinde değişir) · fazlası çelişiyor
// - Deprem (AFAD): büyüklük farkı ≤ 0,1 uyumlu · ≤ 0,3 ya da haber başka kurumu (Kandilli) anıyorsa eksik bağlam · fazlası çelişiyor
// - Makro (Dünya Bankası, yıllık): tutarsa uyumlu, tutmazsa eksik bağlam (yöntem farkı: yıllık ortalama ↔ yıl sonu,
//   ulusal ↔ uluslararası tahmin). Aylık ve çeyreklik değerler için anahtarsız veri yok: doğrulanamadı.
// - Hava (Open-Meteo model verisi): fark ≤ 2 °C uyumlu, fazlası eksik bağlam (istasyon ölçümü farklı olabilir)
// - Resmî Gazete: o günün fihristinde başlık geçiyorsa uyumlu, geçmiyorsa doğrulanamadı (mükerrer sayı olabilir)
import type { Analiz, HamIddia, KaynakMetin } from './newsAnalysis.js';
import { cumleler, sehirleriBul, temizMi } from './newsAnalysis.js';
import { gunAdi } from './newsArchive.js';
import { fold } from './newsCluster.js';
import { AFAD_SAYFA, OPEN_METEO_SAYFA, WB_GOSTERGE, rgSayfa, verifyDeps, wbSayfa, type DogrulamaYazisi } from './verify.js';

export type Etiket = 'VERİYLE UYUMLU' | 'VERİYLE ÇELİŞİYOR' | 'EKSİK BAĞLAM' | 'DOĞRULANAMADI';
export interface VeriKarti { ad: string; url: string; tarih: string; deger?: string; birim?: string; seri?: { etiket: string; deger: number }[] }
export interface IddiaSonuc {
  id: string; kaynak: string; alinti: string; haberUrl: string;
  etiket: Etiket; aciklama: string; veri: VeriKarti; ilgili: DogrulamaYazisi[];
}

const tr = (v: number, d = 2) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const sayilarIn = (s: string) => [...s.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g)].map(m => Number(m[0].replace(/\./g, '').replace(',', '.')));
/** Sorgudaki sayı alıntıda geçiyor mu (model sayı uyduramasın) */
const alintidaVar = (alinti: string, deger: unknown) => typeof deger === 'number' && sayilarIn(alinti).some(v => Math.abs(v - deger) < 1e-9);
const gecerliTarih = (t: unknown, yedek: string) => (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && t <= gunAdi(Date.now()) ? t : yedek);
/** Resmî Gazete fihristinde her gün geçen kelimeler (kök, 6 harf) */
const RG_GENEL = new Set(['cumhur', 'karari', 'karar', 'yonetm', 'teblig', 'resmi', 'gazete', 'hakkin', 'iliski', 'kanun', 'kanunu', 'bakanl', 'baskan', 'genelg', 'atama', 'kurulu', 'sayili', 'tarihl', 'yayiml', 'degisi', 'kurum', 'anlasm']);
const DOVIZ: Record<string, string> = { dolar: 'USD', euro: 'EUR', avro: 'EUR', sterlin: 'GBP' };

/** Kodla bulunan iddialar (model yoksa da çalışır): kur ve deprem */
export function kodlaIddialar(km: KaynakMetin[]): HamIddia[] {
  const out: HamIddia[] = [];
  for (const k of km) {
    const tarih = gunAdi(k.saat);
    for (const c of cumleler(k.metin)) {
      if (c.length > 260) continue;
      const kur = /\b(dolar|euro|avro|sterlin)\w*[^.]{0,40}?(\d{1,3},\d{1,4})\s*(lira|TL)\b/i.exec(c);
      if (kur) out.push({ kaynak: k.kaynak, alinti: c, tur: 'sayi', sorgu: { tip: 'kur', doviz: DOVIZ[kur[1].toLocaleLowerCase('tr')], deger: Number(kur[2].replace(',', '.')), tarih } });
      const dep = /(\d,\d)\s*büyüklüğünde/i.exec(c);
      const il = sehirleriBul(c)[0];
      if (dep && il) out.push({ kaynak: k.kaynak, alinti: c, tur: 'sayi', sorgu: { tip: 'deprem', il, buyukluk: Number(dep[1].replace(',', '.')), tarih } });
    }
  }
  // Aynı sorgu birden çok kaynakta: ilki yeter
  const goruldu = new Set<string>();
  return out.filter(i => { const key = JSON.stringify(i.sorgu); if (goruldu.has(key)) return false; goruldu.add(key); return true; }).slice(0, 3);
}

async function sinifla(i: HamIddia, km: KaynakMetin[]): Promise<Omit<IddiaSonuc, 'id' | 'ilgili'>> {
  const k = km.find(x => x.kaynak === i.kaynak)!;
  const yedekTarih = gunAdi(k.saat);
  const bugun = gunAdi(Date.now());
  const base = { kaynak: i.kaynak, alinti: i.alinti, haberUrl: k.url };
  const s = i.sorgu as Record<string, unknown>;
  const dogrulanamadi = (aciklama: string, veri: VeriKarti) => ({ ...base, etiket: 'DOĞRULANAMADI' as Etiket, aciklama, veri });
  try {
    if (s.tip === 'kur' && typeof s.doviz === 'string' && alintidaVar(i.alinti, s.deger)) {
      const tarih = gecerliTarih(s.tarih, yedekTarih), deger = s.deger as number;
      const v = await verifyDeps.tcmbKur(s.doviz, tarih);
      if (!v) return dogrulanamadi(`TCMB'nin ${tarih} ve öncesine ait kur verisi alınamadı.`, { ad: 'TCMB gösterge kurları', url: 'https://www.tcmb.gov.tr/kurlar/today.xml', tarih: bugun });
      const seri = (await verifyDeps.tcmbSeri(s.doviz, v.tarih, 7).catch(() => [])).map(x => ({ etiket: x.tarih.slice(5).split('-').reverse().join('.'), deger: x.deger }));
      const fark = Math.abs(deger - v.deger) / v.deger;
      const etiket: Etiket = fark <= 0.01 ? 'VERİYLE UYUMLU' : fark <= 0.03 ? 'EKSİK BAĞLAM' : 'VERİYLE ÇELİŞİYOR';
      const ek = etiket === 'EKSİK BAĞLAM' ? ' TCMB kuru günde bir kez belirlenir; piyasa kuru gün içinde değişir.' : '';
      return { ...base, etiket, aciklama: `TCMB'nin ${v.tarih} tarihli ${s.doviz} satış kuru ${tr(v.deger, 4)} TL; haberdeki değer ${tr(deger)} TL.${ek}`, veri: { ad: 'TCMB gösterge kurları', url: v.url, tarih: v.tarih, deger: tr(v.deger, 4), birim: 'TL', seri } };
    }
    if (s.tip === 'deprem' && typeof s.il === 'string' && alintidaVar(i.alinti, s.buyukluk)) {
      const tarih = gecerliTarih(s.tarih, yedekTarih), b = s.buyukluk as number;
      const liste = await verifyDeps.afadDepremler(tarih, s.il);
      if (!liste.length) return dogrulanamadi(`AFAD kataloğunda ${tarih} civarında ${s.il} için 2,5 ve üstü kayıt bulunamadı.`, { ad: 'AFAD deprem kataloğu', url: AFAD_SAYFA, tarih });
      const e = [...liste].sort((x, y) => Math.abs(x.buyukluk - b) - Math.abs(y.buyukluk - b))[0];
      const fark = Math.abs(e.buyukluk - b);
      const baskaKurum = /kandilli/i.test(i.alinti);
      const etiket: Etiket = fark <= 0.1 ? 'VERİYLE UYUMLU' : fark <= 0.3 || baskaKurum ? 'EKSİK BAĞLAM' : 'VERİYLE ÇELİŞİYOR';
      const ek = etiket === 'EKSİK BAĞLAM' ? ' Kurumlar farklı büyüklük ölçekleri kullanabilir; değerler ayrışabilir.' : '';
      return { ...base, etiket, aciklama: `AFAD kaydı: ${e.tarih.replace('T', ' ').slice(0, 16)}, ${e.yer}, büyüklük ${tr(e.buyukluk, 1)} (${e.tip}); haberdeki değer ${tr(b, 1)}.${ek}`, veri: { ad: 'AFAD deprem kataloğu', url: AFAD_SAYFA, tarih: e.tarih.slice(0, 10), deger: tr(e.buyukluk, 1), seri: liste.slice(0, 6).map(x => ({ etiket: x.tarih.slice(11, 16), deger: x.buyukluk })) } };
    }
    if (s.tip === 'makro' && typeof s.gosterge === 'string' && WB_GOSTERGE[s.gosterge] && alintidaVar(i.alinti, s.deger)) {
      const g = WB_GOSTERGE[s.gosterge], url = wbSayfa(s.gosterge);
      if (s.donem && s.donem !== 'yillik') return dogrulanamadi(`${s.donem === 'aylik' ? 'Aylık' : 'Çeyreklik'} değerler için anahtarsız resmî veri kaynağı yok (TÜİK'in açık API'si bulunmuyor).`, { ad: 'Dünya Bankası (yalnızca yıllık)', url, tarih: bugun });
      const seri = await verifyDeps.wbSeri(s.gosterge);
      const nokta = seri.find(x => x.yil === s.yil);
      const veri: VeriKarti = { ad: `Dünya Bankası · ${g.ad}`, url, tarih: nokta ? String(nokta.yil) : bugun, birim: g.birim, seri: seri.slice(-6).map(x => ({ etiket: String(x.yil), deger: +x.deger.toFixed(2) })) };
      if (!nokta) return dogrulanamadi(`Dünya Bankası'nda ${s.yil ?? 'bu yılın'} verisi henüz yok.`, veri);
      const deger = s.deger as number;
      const uyumlu = g.birim === '%' ? Math.abs(nokta.deger - deger) <= 0.15 : Math.abs(nokta.deger - deger) / nokta.deger <= 0.015;
      veri.deger = g.birim === '%' ? `%${tr(nokta.deger, 1)}` : Math.round(nokta.deger).toLocaleString('tr-TR');
      return { ...base, etiket: uyumlu ? 'VERİYLE UYUMLU' : 'EKSİK BAĞLAM', aciklama: `Dünya Bankası'na göre ${nokta.yil}: ${veri.deger}; haberdeki değer ${g.birim === '%' ? '%' + tr(deger, 1) : deger.toLocaleString('tr-TR')}.${uyumlu ? '' : ' Kurumların yöntemi farklı olabilir (yıllık ortalama ↔ yıl sonu, ulusal ↔ uluslararası tahmin).'}`, veri };
    }
    if (s.tip === 'hava' && typeof s.il === 'string' && alintidaVar(i.alinti, s.sicaklik)) {
      const tarih = gecerliTarih(s.tarih, yedekTarih), t = s.sicaklik as number;
      const g = await verifyDeps.havaGecmis(s.il);
      const d = g.find(x => x.tarih === tarih);
      const veri: VeriKarti = { ad: 'Open-Meteo (model verisi)', url: OPEN_METEO_SAYFA, tarih, birim: '°C', seri: g.map(x => ({ etiket: x.tarih.slice(5).split('-').reverse().join('.'), deger: x.max })) };
      if (!d) return dogrulanamadi(`${s.il} için ${tarih} verisi yok (son 7 gün sorgulanabiliyor).`, veri);
      const ref = t < 8 ? d.min : d.max;
      veri.deger = `${tr(ref, 1)} °C`;
      const uyumlu = Math.abs(ref - t) <= 2;
      return { ...base, etiket: uyumlu ? 'VERİYLE UYUMLU' : 'EKSİK BAĞLAM', aciklama: `${s.il} için ${tarih} günü model verisi ${t < 8 ? 'en düşük' : 'en yüksek'} ${tr(ref, 1)} °C; haberdeki değer ${t} °C.${uyumlu ? '' : ' Model verisi istasyon ölçümünden farklı olabilir.'}`, veri };
    }
    if (s.tip === 'resmi_gazete' && typeof s.anahtar === 'string') {
      const tarih = gecerliTarih(s.tarih, yedekTarih), url = rgSayfa(tarih);
      const metin = await verifyDeps.resmiGazete(tarih);
      if (!metin) return dogrulanamadi(`${tarih} tarihli Resmî Gazete fihristine ulaşılamadı.`, { ad: 'Resmî Gazete', url, tarih });
      // Her gün geçen genel kelimeler ("Cumhurbaşkanı Kararı", "Yönetmelik") yetmez: en az bir özgül kelime gerekir
      const kelimeler = fold(s.anahtar).split(/\s+/).filter(w => w.length >= 4 && !RG_GENEL.has(w.slice(0, 6)));
      if (!kelimeler.length) return dogrulanamadi(`İddiada Resmî Gazete'deki başlık belirtilmiyor ("${s.anahtar}" her gün geçen genel bir ifade); fihristle eşleştirilemedi.`, { ad: 'Resmî Gazete', url, tarih });
      const var_ = kelimeler.every(w => metin.includes(w.slice(0, 6)));
      if (!var_) return dogrulanamadi(`${tarih} tarihli Resmî Gazete fihristinde bu başlık bulunamadı (mükerrer sayıda olabilir).`, { ad: 'Resmî Gazete', url, tarih });
      return { ...base, etiket: 'VERİYLE UYUMLU', aciklama: `${tarih} tarihli Resmî Gazete fihristinde "${s.anahtar}" geçiyor.`, veri: { ad: 'Resmî Gazete', url, tarih } };
    }
  } catch (e) {
    console.warn('İddia kontrolü:', e instanceof Error ? e.message : e);
    return dogrulanamadi('Veri kaynağına şu an ulaşılamadı.', { ad: 'Veri kaynağı', url: k.url, tarih: bugun });
  }
  return dogrulanamadi('Bu iddia için anahtarsız resmî veri kaynaklarında karşılık bulunamadı.', { ad: 'Uygun açık veri yok', url: k.url, tarih: bugun });
}

const sonuclar = new Map<string, Promise<IddiaSonuc[]>>();

/** Kümenin iddialarını kontrol et (kod + model iddiaları; en fazla 5) */
export function iddialariKontrolEt(id: string, a: Analiz): Promise<IddiaSonuc[]> {
  const key = `${id}|${a.at}`;
  let p = sonuclar.get(key);
  if (p) return p;
  p = (async () => {
    const km = a.detay.kaynaklar;
    const hepsi = [...kodlaIddialar(km), ...a.iddialar];
    const tekil = hepsi.filter((x, i) => hepsi.findIndex(y => y.alinti === x.alinti) === i).slice(0, 5);
    const out = await Promise.all(tekil.map(async (i, n) => {
      const s = await sinifla(i, km);
      const ilgili = await verifyDeps.ilgiliDogrulamalar(i.alinti).catch(() => []);
      return { ...s, id: `i${n + 1}`, ilgili, aciklama: temizMi(s.aciklama) ? s.aciklama : 'Karşılaştırma yapıldı.' };
    }));
    return out;
  })();
  sonuclar.set(key, p);
  if (sonuclar.size > 200) sonuclar.delete(sonuclar.keys().next().value!);
  return p;
}
