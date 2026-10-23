// Uzay Modu · gök cisimleri ve Jarvis'in hazır cümleleri. Cümleler seçili seslendiriciyle çalınır; uzay modu açılınca
// hepsi önceden yüklenir (voice.preload), komut gelince ses beklemeden başlar.
// Zamanla değişen sayılar (uydu sayısı gibi) bilerek yok.
import { labCumleleri } from './labText';

export type Govde = 'merkur' | 'venus' | 'dunya' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptun' | 'ay' | 'gunes' | 'europa' | 'ganymede' | 'enceladus' | 'titan';

export interface GovdeBilgi {
  ad: string;
  /** Gerçek ortalama yarıçap (km): "gerçek boyutlarda göster" */
  km: number;
  /** Ekranda eldeki boyuta göre çarpan (gerçek oran değil; elle oynamaya uygun) */
  olcek: number;
  /** Bilgi kartındaki tek satır */
  kart: string;
  /** Eksen eğikliği (derece, görsel) */
  egim: number;
}

export const GOVDE: Record<Govde, GovdeBilgi> = {
  merkur: { ad: 'Merkür', km: 2440, olcek: 0.62, kart: "Güneş'e en yakın gezegen", egim: 0 },
  venus: { ad: 'Venüs', km: 6052, olcek: 0.95, kart: 'En sıcak gezegen · ters yöne döner', egim: 177 },
  dunya: { ad: 'Dünya', km: 6371, olcek: 1, kart: 'Yüzeyinde sıvı su bulunan tek bilinen gezegen', egim: 23.4 },
  mars: { ad: 'Mars', km: 3390, olcek: 0.72, kart: 'Kızıl gezegen · Olympus Dağı burada', egim: 25.2 },
  jupiter: { ad: 'Jüpiter', km: 69911, olcek: 1.35, kart: 'En büyük gezegen · bir gaz devi', egim: 3.1 },
  saturn: { ad: 'Satürn', km: 58232, olcek: 1.2, kart: 'Halkaları buz ve kaya parçalarından', egim: 26.7 },
  uranus: { ad: 'Uranüs', km: 25362, olcek: 1.05, kart: 'Yan yatmış dönen bir buz devi', egim: 97.8 },
  neptun: { ad: 'Neptün', km: 24622, olcek: 1.05, kart: "Güneş'e en uzak gezegen · çok rüzgârlı", egim: 28.3 },
  ay: { ad: 'Ay', km: 1737, olcek: 0.45, kart: "Dünya'nın tek doğal uydusu", egim: 6.7 },
  gunes: { ad: 'Güneş', km: 696340, olcek: 1.5, kart: 'Bir G tipi yıldız · sistemin merkezi', egim: 7.25 },
  europa: { ad: 'Europa', km: 1561, olcek: 0.45, kart: "Jüpiter'in buzlu uydusu · altında okyanus işareti", egim: 0 },
  ganymede: { ad: 'Ganymede', km: 2634, olcek: 0.55, kart: 'Güneş sistemindeki en büyük uydu', egim: 0 },
  enceladus: { ad: 'Enceladus', km: 252, olcek: 0.4, kart: "Satürn'ün su püskürten uydusu", egim: 0 },
  titan: { ad: 'Titan', km: 2575, olcek: 0.55, kart: 'Kalın atmosferli tek uydu · metan gölleri', egim: 0 },
};

/** Güneş sistemi sırası */
export const GEZEGEN_SIRASI: Govde[] = ['merkur', 'venus', 'dunya', 'mars', 'jupiter', 'saturn', 'uranus', 'neptun'];

/** "Bana X hakkında bir şey söyle" (Venüs ve Jüpiter cümleleri doğruluk için yeniden yazıldı) */
export const BILGI: Record<Govde | 'karadelik' | 'theia', string> = {
  merkur: "Merkür Güneş'e en yakın gezegen, ama en sıcağı değil efendim. O unvan Venüs'ün.",
  venus: "Venüs kendi ekseni etrafında, Güneş'in çevresinde döndüğünden daha yavaş döner efendim. Üstelik ters yöne.",
  dunya: 'Yüzeyinde sıvı su bulunduğunu bildiğimiz tek gezegen, efendim.',
  mars: "Olympus Dağı, Everest'in yaklaşık iki buçuk katı yüksekliğinde efendim.",
  jupiter: "Kütlesi Dünya'nın 318 katı efendim. Büyük Kırmızı Leke ise Dünya'dan geniş, yüzyıllardır dinmeyen bir fırtına.",
  saturn: 'Ortalama yoğunluğu sudan düşük efendim. Yeterince büyük bir küvet bulursanız yüzerdi.',
  uranus: 'Yan yatmış döner efendim. Ekseni yaklaşık 98 derece eğik.',
  neptun: "Rüzgârları saatte 2.000 kilometreyi aşar efendim.",
  gunes: "Güneş sistemindeki kütlenin yüzde 99,8'i tek başına onda, efendim.",
  ay: "Ay her yıl Dünya'dan yaklaşık 3,8 santimetre uzaklaşıyor efendim.",
  europa: "Europa'nın buz kabuğunun altında küresel, tuzlu bir okyanus olduğuna dair güçlü işaretler var efendim.",
  ganymede: "Ganymede, kendi manyetik alanı olan bilinen tek uydu efendim.",
  enceladus: "Enceladus'un güney kutbundaki çatlaklardan uzaya su püskürüyor efendim; Cassini bu püskürmelerin içinden geçti.",
  titan: "Titan, yüzeyinde sıvı gölleri olan Dünya dışındaki tek bilinen yer efendim; ama gölleri sudan değil, metan ve etandan.",
  karadelik: "Samanyolu'nun merkezindeki kara delik, Güneş'in yaklaşık 4 milyon katı kütleye sahip efendim.",
  theia: "Ay'ın da böyle oluştuğu düşünülüyor efendim. Yaklaşık 4,5 milyar yıl önce Mars büyüklüğünde bir gök cismi Dünya'ya çarptı; saçılan enkaz bir araya gelip Ay'ı oluşturdu.",
};

/** Kısa onaylar */
export const ONAY = {
  govde: (g: Govde) => `${GOVDE[g].ad}, efendim.`,
  modAc: 'Uzay modu, efendim.',
  modKapat: 'Uzay modu kapandı efendim.',
  sistem: 'Güneş sistemi, efendim.',
  olcek: 'Gerçek boyutlar, efendim.',
  karadelik: 'Kara delik, efendim.',
  theia: 'Theia yola çıktı, efendim.',
  kayan: 'Bir dilek tutun, efendim.',
  arkaUzay: 'Arka plan uzay, efendim.',
  arkaOda: 'Oda geri geldi, efendim.',
  temizle: 'Temizlendi, efendim.',
};

/** Uzay modu açılınca önceden yüklenecek bütün cümleler */
export function tumCumleler(): string[] {
  const govdeler = Object.keys(GOVDE) as Govde[];
  return [
    ...govdeler.map(ONAY.govde),
    ...Object.values(BILGI),
    ONAY.modAc, ONAY.modKapat, ONAY.sistem, ONAY.olcek, ONAY.karadelik, ONAY.theia, ONAY.kayan, ONAY.arkaUzay, ONAY.arkaOda, ONAY.temizle,
    ...labCumleleri(),
  ];
}

// ------------------------------------------------------------------ Yaşam izi taraması: bilinen veriler
// Her kartın ve maddenin kaynağı yanında. Bu veriler "ne bulundu" sorusunu cevaplar; yaşam olasılığı (yüzde) vermez.
// Durum: KANITLANDI · GÜÇLÜ İŞARET · TARTIŞMALI · BULUNMADI.

export type KesifDurum = 'KANITLANDI' | 'GÜÇLÜ İŞARET' | 'TARTIŞMALI' | 'BULUNMADI';
export interface Kesif { durum: KesifDurum; cumle: string; yil: string; gorev: string }
export type Var = 'evet' | 'hayir' | 'belirsiz';
export interface Bilinen { durum: Var; not: string }

type CisimAd = 'merkur' | 'venus' | 'dunya' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptun' | 'ay' | 'europa' | 'ganymede' | 'enceladus' | 'titan';
const GAZ_DEVI: Kesif[] = [{ durum: 'BULUNMADI', cumle: 'Katı yüzeyi yok; yaşama uygun koşul bulunmadı.', yil: '—', gorev: '—' }];

export const KESIFLER: Record<CisimAd, Kesif[]> = {
  // Yaşamın en eski kabul gören izleri: ≈3,5 milyar yıllık stromatolitler (Pilbara, Avustralya)
  dunya: [{ durum: 'KANITLANDI', cumle: 'Yaşam var: okyanuslarda, karada ve havada. Bildiğimiz tek yaşamlı dünya.', yil: '≈3,5 milyar yıllık fosiller', gorev: 'jeoloji' }],
  mars: [
    // Mangold ve ark. 2021, Science 374: Perseverance, Jezero deltasının göl tortuları
    { durum: 'GÜÇLÜ İŞARET', cumle: 'Jezero kraterinde eski bir göl deltası: bir zamanlar yüzeyde sıvı su aktı.', yil: '2021', gorev: 'Perseverance' },
    // Webster ve ark. 2018, Science 360 (Curiosity, mevsimsel metan); Korablev ve ark. 2019, Nature 568 (TGO, < 0,05 ppb)
    { durum: 'TARTIŞMALI', cumle: 'Atmosferde dönemsel metan: Curiosity ölçtü, yörüngedeki TGO bulamadı.', yil: '2018-2019', gorev: 'Curiosity · ExoMars TGO' },
    // Hurowitz ve ark. 2025, Nature; NASA JPL 10.09.2025: "potential biosignature", doğrulanmadı.
    // Mars Sample Return Ocak 2026 bütçe yasasıyla iptal edildi (CNN, 12.10.2026)
    { durum: 'TARTIŞMALI', cumle: "Sapphire Canyon örneğinde olası biyo-imza; doğrulanmadı, örnek Dünya'ya getirilemiyor.", yil: '2025', gorev: 'Perseverance' },
  ],
  // Greaves ve ark. 2020, Nature Astronomy 5; SOFIA (Cordiner 2022) ve ALMA yeniden analizleri sinyali doğrulayamadı
  venus: [{ durum: 'TARTIŞMALI', cumle: 'Bulutlarda fosfin iddiası; başka ekipler sinyali doğrulayamadı.', yil: '2020', gorev: 'JCMT · ALMA' }],
  // Khurana ve ark. 1998, Nature 395; Kivelson ve ark. 2000, Science 289 (indüklenmiş manyetik alan)
  europa: [{ durum: 'GÜÇLÜ İŞARET', cumle: 'Manyetik alan ölçümleri buz kabuğunun altında küresel, tuzlu bir okyanusa işaret ediyor.', yil: '1998-2000', gorev: 'Galileo' }],
  enceladus: [
    // Porco ve ark. 2006, Science 311 (Cassini, 2005 yakın geçişleri)
    { durum: 'KANITLANDI', cumle: 'Güney kutbundaki çatlaklardan uzaya su buzu ve buhar püskürüyor.', yil: '2005', gorev: 'Cassini' },
    // Postberg ve ark. 2018, Nature 558 (> 200 u kütleli organik moleküller)
    { durum: 'KANITLANDI', cumle: 'Püskürmelerde büyük organik moleküller bulundu.', yil: '2018', gorev: 'Cassini' },
    // Postberg ve ark. 2023, Nature 618 (Cassini CDA, sodyum fosfatlar)
    { durum: 'KANITLANDI', cumle: 'Okyanustan gelen buz tanelerinde fosfat bulundu.', yil: '2023', gorev: 'Cassini verisi' },
    // Hsu ve ark. 2015, Nature 519 (silika nanoparçacıkları); Waite ve ark. 2017, Science 356 (moleküler hidrojen)
    { durum: 'GÜÇLÜ İŞARET', cumle: 'Silika parçacıkları ve hidrojen, deniz tabanında hidrotermal etkinliğe işaret ediyor.', yil: '2015-2017', gorev: 'Cassini' },
  ],
  titan: [
    // Stofan ve ark. 2007, Nature 445 (radar, göller); Brown ve ark. 2008, Nature 454 (Ontario Lacus'ta sıvı etan)
    { durum: 'KANITLANDI', cumle: 'Kutuplarda sıvı metan ve etan gölleri var.', yil: '2006-2008', gorev: 'Cassini' },
    // Iess ve ark. 2012, Science 337 (okyanus); Petricca ve ark. 2025, Nature (gelgit kaybı okyanusu dışlıyor, yumuşak buz)
    { durum: 'TARTIŞMALI', cumle: 'Yer altı su okyanusu: 2012 ölçümü okyanus dedi, 2025 yeniden analizi itiraz etti.', yil: '2012 · 2025', gorev: 'Cassini' },
  ],
  // Saur ve ark. 2015, JGR Space Physics 120 (Hubble, kutup ışığı salınımı 2,0°; okyanussuz model 5,8°)
  ganymede: [{ durum: 'GÜÇLÜ İŞARET', cumle: 'Kutup ışıklarının salınımı tuzlu bir yer altı okyanusuna işaret ediyor.', yil: '2015', gorev: 'Hubble' }],
  ay: [{ durum: 'BULUNMADI', cumle: 'Yaşama uygun koşul bulunmadı: atmosfer ve sıvı su yok.', yil: '—', gorev: '—' }],
  merkur: [{ durum: 'BULUNMADI', cumle: 'Yaşama uygun koşul bulunmadı: atmosfer ve sıvı su yok.', yil: '—', gorev: '—' }],
  jupiter: GAZ_DEVI, saturn: GAZ_DEVI, uranus: GAZ_DEVI, neptun: GAZ_DEVI,
};

/** Koruyucu atmosfer / manyetik alan (bilinen veri; NSSDCA ve NASA gezegen sayfaları; Ganymede: Kivelson 1996, Galileo) */
export const KORUMA: Record<CisimAd, Bilinen> = {
  dunya: { durum: 'evet', not: 'Kalın atmosfer ve küresel manyetik alan' },
  mars: { durum: 'hayir', not: 'İnce atmosfer (0,006 bar); küresel manyetik alanı yok' },
  venus: { durum: 'belirsiz', not: 'Çok kalın atmosfer; iç kaynaklı manyetik alanı yok' },
  merkur: { durum: 'belirsiz', not: 'Zayıf manyetik alanı var; atmosferi yok' },
  ay: { durum: 'hayir', not: 'Atmosfer ve küresel manyetik alan yok' },
  europa: { durum: 'belirsiz', not: 'Atmosfer yok; okyanusu buz kabuğu korur' },
  ganymede: { durum: 'belirsiz', not: 'Kendi manyetik alanı olan tek uydu; atmosfer yok' },
  enceladus: { durum: 'belirsiz', not: 'Atmosfer yok; okyanusu buz kabuğu korur' },
  titan: { durum: 'evet', not: "Dünya'dan kalın azot atmosferi (1,5 bar)" },
  jupiter: { durum: 'belirsiz', not: 'Güçlü manyetik alan; katı yüzey yok' },
  saturn: { durum: 'belirsiz', not: 'Güçlü manyetik alan; katı yüzey yok' },
  uranus: { durum: 'belirsiz', not: 'Manyetik alanı var; katı yüzey yok' },
  neptun: { durum: 'belirsiz', not: 'Manyetik alanı var; katı yüzey yok' },
};

/**
 * Yaşamın temel elementleri ve organik moleküller (bilinen tespitler).
 * Mars: Eigenbrode ve ark. 2018, Science 360 (Curiosity); Perseverance SHERLOC 2023, Nature 619.
 * Merkür: MESSENGER, kutup kraterlerinde su buzu ve koyu, organik olabilecek madde (Paige ve ark. 2013, Science 339).
 * Ay: LCROSS, kutup kraterinde su buzu (Colaprete ve ark. 2010, Science 330).
 * Enceladus: Waite ve ark. 2009, Nature 460 (amonyak); Postberg 2018, 2023. Titan: Cassini-Huygens (Niemann 2005).
 */
export const ORGANIK: Record<CisimAd, Bilinen> = {
  dunya: { durum: 'evet', not: 'Yaşamın bütün elementleri ve organik kimya' },
  mars: { durum: 'evet', not: 'Kayalarda organik moleküller (Curiosity, Perseverance)' },
  venus: { durum: 'belirsiz', not: 'Fosfin iddiası tartışmalı; organik tespit yok' },
  merkur: { durum: 'belirsiz', not: 'Kutup kraterlerinde su buzu ve koyu, organik olabilecek madde' },
  ay: { durum: 'belirsiz', not: 'Kutup kraterlerinde su buzu (LCROSS, 2009)' },
  europa: { durum: 'belirsiz', not: 'Yüzeyde tuzlar; organik molekül henüz doğrudan bulunmadı' },
  ganymede: { durum: 'belirsiz', not: 'Yüzeyde tuzlar; organik kimya belirsiz' },
  enceladus: { durum: 'evet', not: 'Organik moleküller, fosfat, amonyak ve karbondioksit' },
  titan: { durum: 'evet', not: 'Atmosferde ve yüzeyde karmaşık organik moleküller' },
  jupiter: { durum: 'belirsiz', not: 'Atmosferde metan ve amonyak; yaşamla ilgili tespit yok' },
  saturn: { durum: 'belirsiz', not: 'Atmosferde metan ve amonyak; yaşamla ilgili tespit yok' },
  uranus: { durum: 'belirsiz', not: 'Atmosferde metan; yaşamla ilgili tespit yok' },
  neptun: { durum: 'belirsiz', not: 'Atmosferde metan; yaşamla ilgili tespit yok' },
};

/**
 * İç enerji: gelgit ısınması, jeotermal, hidrotermal (bilinen veri).
 * Venüs: Herrick ve Hensley 2023, Science 379 (Magellan verisinde volkanik değişim). Europa: gelgit ısınması (NASA).
 * Titan: Petricca ve ark. 2025, Nature (güçlü gelgit enerjisi kaybı).
 */
export const IC_ENERJI: Partial<Record<CisimAd, Bilinen>> = {
  dunya: { durum: 'evet', not: 'Jeotermal ısı ve deniz tabanı hidrotermal bacaları' },
  mars: { durum: 'belirsiz', not: 'İç ısı bugün zayıf; eski volkanlar var' },
  venus: { durum: 'belirsiz', not: 'Yakın zamanda volkanik etkinlik işaretleri (Magellan verisi)' },
  merkur: { durum: 'hayir', not: 'Bilinen etkin iç ısı kaynağı yok' },
  ay: { durum: 'hayir', not: 'İç ısısı çok düşük' },
  europa: { durum: 'evet', not: "Jüpiter'in gelgit kuvvetleri içini ısıtıyor" },
  ganymede: { durum: 'belirsiz', not: 'Gelgit ısınması bugün zayıf' },
  enceladus: { durum: 'evet', not: 'Gelgit ısınması; hidrotermal etkinlik işaretleri' },
  titan: { durum: 'evet', not: "Satürn'ün gelgitleri iç kısmı ısıtıyor" },
};

/** Yer altında sıvı su (bilinen veri; yalnızca verisi olanlar) — kaynaklar KESIFLER'de */
export const YERALTI_SU: Partial<Record<CisimAd, Bilinen>> = {
  europa: { durum: 'evet', not: 'Küresel tuzlu okyanus: güçlü işaret (Galileo)' },
  ganymede: { durum: 'evet', not: 'Tuzlu okyanus: güçlü işaret (Hubble)' },
  // Thomas ve ark. 2016, Icarus 264: salınım ölçümü küresel okyanus gerektiriyor
  enceladus: { durum: 'evet', not: 'Küresel okyanus; püskürmeler oradan geliyor (Cassini)' },
  titan: { durum: 'belirsiz', not: 'Tartışmalı: okyanus mu, su cepleri mi (Cassini, 2012 ve 2025)' },
};

/**
 * En umut verici bölge, nedeni ve sıradaki görev (Ekim 2026 itibarıyla doğrulandı):
 * Rosalind Franklin: NASA 16.04.2026, Falcon Heavy ile 2028, iniş Kasım 2030. DAVINCI: Aralık 2030 hedefi (2026 bütçesi
 * sürdürüyor). EnVision: ESA, 2031. Europa Clipper: Ekim 2024 fırlatıldı, Nisan 2030 Jüpiter. JUICE: Temmuz 2031 Jüpiter,
 * Aralık 2034 Ganymede yörüngesi (ESA). Dragonfly: Temmuz 2028 fırlatma, 2034 varış (NASA/APL). ESA L4: Enceladus seçildi,
 * çalışma aşamasında, 2042 fırlatma düşünülüyor (ESA).
 */
export const SONUC: Record<CisimAd, { bolge: string; neden: string; sonraki: string }> = {
  dunya: { bolge: 'Her yer: okyanuslar, kara ve atmosfer', neden: 'Bildiğimiz tek yaşamlı dünya', sonraki: '—' },
  mars: { bolge: 'Jezero kraterinin eski göl tortuları', neden: 'Eski su, organik moleküller ve korunmuş tortul kayalar bir arada', sonraki: 'ESA Rosalind Franklin gezgini: 2028 fırlatma, 2 metre derine sondaj' },
  venus: { bolge: '50-60 km yükseklikteki bulut katmanı', neden: 'Orada sıcaklık ve basınç Dünya yüzeyine yakın', sonraki: 'NASA DAVINCI (Aralık 2030 hedefi) ve ESA EnVision (2031)' },
  merkur: { bolge: 'Yok', neden: 'Atmosfer ve sıvı su yok', sonraki: '—' },
  ay: { bolge: 'Yok', neden: 'Atmosfer ve sıvı su yok', sonraki: '—' },
  europa: { bolge: 'Buz kabuğunun altındaki tuzlu okyanus', neden: 'Su, kayalık deniz tabanı ve gelgit ısısı bir arada', sonraki: "NASA Europa Clipper: Nisan 2030'da Jüpiter'e varış" },
  ganymede: { bolge: 'Buz katmanları arasındaki okyanus', neden: 'Okyanus var ama kaya yerine buzla çevrili olabilir', sonraki: "ESA JUICE: 2031'de Jüpiter, Aralık 2034'te Ganymede yörüngesi" },
  enceladus: { bolge: 'Güney kutbunun altındaki okyanus', neden: 'Su, organikler, fosfat ve hidrotermal enerji işaretleri bir arada', sonraki: 'ESA L4 görevi çalışma aşamasında (onaylanmadı; 2042 fırlatma düşünülüyor)' },
  titan: { bolge: 'Metan gölleri ve buz kabuğunun altı', neden: 'Zengin organik kimya; yer altı suyu tartışmalı', sonraki: 'NASA Dragonfly: Temmuz 2028 fırlatma, 2034 varış' },
  jupiter: { bolge: 'Yok', neden: 'Katı yüzey yok; yaşama uygun koşul bilinmiyor', sonraki: '—' },
  saturn: { bolge: 'Yok', neden: 'Katı yüzey yok; yaşama uygun koşul bilinmiyor', sonraki: '—' },
  uranus: { bolge: 'Yok', neden: 'Katı yüzey yok; yaşama uygun koşul bilinmiyor', sonraki: '—' },
  neptun: { bolge: 'Yok', neden: 'Katı yüzey yok; yaşama uygun koşul bilinmiyor', sonraki: '—' },
};

/** Yüzey taraması cümlesi (yüzeyin bilinen görünüşü; Dünya'nınki simülasyondaki hâline göre ayrıca kurulur) */
export const YUZEY_SOZ: Record<CisimAd, string> = {
  dunya: 'Yüzeyin büyük bölümü sıvı su okyanusu.',
  mars: 'Yüzey kuru ve soğuk; eski nehir yatakları seçiliyor.',
  venus: 'Yüzey kalın bulutların altında, kurşunu eritecek kadar sıcak.',
  merkur: 'Havasız, kraterli bir yüzey.',
  ay: 'Havasız, kraterli bir yüzey.',
  europa: 'Buz kabuğu çatlaklarla kaplı; bazıları alttaki suyun izleri olabilir.',
  ganymede: 'Koyu ve açık renkli buz bölgeleri, oluklu araziler.',
  enceladus: 'Güney kutbundaki çatlaklardan uzaya su püskürüyor.',
  titan: 'Turuncu pusun altında metan gölleri ve kum tepeleri.',
  jupiter: 'Katı bir yüzey yok; yalnızca bulut katmanları.',
  saturn: 'Katı bir yüzey yok; yalnızca bulut katmanları.',
  uranus: 'Katı bir yüzey yok; yalnızca bulut katmanları.',
  neptun: 'Katı bir yüzey yok; yalnızca bulut katmanları.',
};

/** Yer altı adımı cümlesi (yalnızca yer altı suyu verisi olanlar) */
export const YERALTI_SOZ: Partial<Record<CisimAd, string>> = {
  europa: 'Buz kabuğunun altında küresel, tuzlu bir okyanus olduğuna dair güçlü işaretler var.',
  ganymede: 'Buz katmanlarının arasında tuzlu bir okyanus olabilir.',
  enceladus: 'Buz kabuğunun altında küresel bir okyanus var; püskürmeler oradan geliyor.',
  titan: 'Buz kabuğunun altında su okyanusu olup olmadığı tartışmalı.',
};
