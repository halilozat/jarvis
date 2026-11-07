// Bekçi · sesli uyarı kalıpları. Mesajın kendisi asla okunmaz; yalnızca bu kısa cümleler. Sesleri sunucu açılışta
// seçili sesle önceden üretir (tts.ts warmOpening): uyarı anında, kredi harcamadan çalar.
export const UYARI_SMS = ['Efendim, son mesaj güvenli değil. Yine paranıza göz dikmişler.', 'Efendim, gelen mesajdaki link sahte. Lütfen tıklamayın.'];
export const UYARI_MAIL = ['Efendim, son mail güvenli değil. Yine paranıza göz dikmişler.', 'Efendim, gelen maildeki link sahte. Lütfen tıklamayın.'];
export const UYARI_KALIPLARI = [...UYARI_SMS, ...UYARI_MAIL];
