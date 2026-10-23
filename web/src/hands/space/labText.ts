// Uzay Laboratuvarı · sabit cümleler ve zaman hızları. Küçük, bağımsız dosya: App uzay moduna geçince bu cümleleri
// seçili sesle önceden yükler (komutta ses beklemez) ve laboratuvar kodunu ana pakete çekmez.

/** Zaman hızları (gün / gerçek saniye). Eksi: geri akar. */
export const HIZLAR = [-365, -30, -7, -1, 0.1, 1, 7, 30, 365];

/** Laboratuvarın sabit cümleleri (açılışta seçili sesle önceden yüklenir) */
export const LAB_ONAY = {
  ac: 'Uzay laboratuvarı, efendim. Gezegenler bugünkü gerçek yerlerinde.',
  kapat: 'Laboratuvar kapandı efendim.',
  gosteri: 'Gösteri modu, efendim.',
  sifirla: 'Laboratuvar sıfırlandı efendim; gezegenler bugünkü yerlerinde.',
  durdu: 'Zaman durdu, efendim.',
  devam: 'Zaman akıyor, efendim.',
  hiz: HIZLAR.map(d => {
    const a = Math.abs(d);
    const t = a >= 365 ? 'Saniyede bir yıl' : a >= 30 ? 'Saniyede bir ay' : a >= 7 ? 'Saniyede bir hafta' : a >= 1 ? 'Saniyede bir gün' : 'Saniyede iki buçuk saat';
    return `${t}${d < 0 ? ', geriye doğru' : ''}, efendim.`;
  }),
  ybAc: 'Yaşanabilir bölge, efendim. Sıvı suyun mümkün olduğu kuşak.',
  ybKapat: 'Yaşanabilir bölge gizlendi, efendim.',
  ic: 'İç gezegenler, efendim.',
  tum: 'Bütün Güneş sistemi, efendim.',
  yok: 'O gezegen şu an laboratuvarda yok efendim.',
};

/** Önceden yüklenecek bütün sabit cümleler */
export function labCumleleri(): string[] {
  return [LAB_ONAY.ac, LAB_ONAY.kapat, LAB_ONAY.gosteri, LAB_ONAY.sifirla, LAB_ONAY.durdu, LAB_ONAY.devam, ...new Set(LAB_ONAY.hiz), LAB_ONAY.ybAc, LAB_ONAY.ybKapat, LAB_ONAY.ic, LAB_ONAY.tum, LAB_ONAY.yok];
}
