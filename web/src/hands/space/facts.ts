// Uzay Modu · gök cisimleri ve Jarvis'in hazır cümleleri. Cümleler seçili seslendiriciyle çalınır; uzay modu açılınca
// hepsi önceden yüklenir (voice.preload), komut gelince ses beklemeden başlar.
// Zamanla değişen sayılar (uydu sayısı gibi) bilerek yok.

export type Govde = 'merkur' | 'venus' | 'dunya' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptun' | 'ay' | 'gunes';

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
  ];
}
