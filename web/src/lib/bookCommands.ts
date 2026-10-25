// Açık kitap için sesli komutlar (yerelde eşleşir, modele gitmez). El Kontrolü'nde açık kitap ya da Kitaplığım'da
// açık kitap kartı varken: "okundu listesine ekle", "okuyorum", "120. sayfadayım", "bu kitaba şu alıntıyı ekle: …",
// "şu notu ekle: …", "bu kitabın adı …", "bunu özetle". Not ve alıntı metni söylendiği gibi (büyük harfleriyle) kalır.
import type { Durum } from './library';

export type KitapKomut =
  | { tip: 'not'; metin: string }
  | { tip: 'alinti'; metin: string }
  | { tip: 'durum'; durum: Durum }
  | { tip: 'sayfa'; sayfa: number; toplam?: number }
  | { tip: 'ad'; ad: string }
  | { tip: 'ozetle' };

const ON = String.raw`^\s*(?:(?:hey\s+)?jarvis[,\s]+)?`;
const AYIR = String.raw`\s*[:,.\-–]?\s*`;
const KITABA = String.raw`(?:(?:bu\s+kitaba|kitaba|buna|bunu|şunu|sunu)\s+)?(?:şu\s+|su\s+|bir\s+)?`;

const ALINTI = new RegExp(`${ON}${KITABA}(?:al[ıi]nt[ıi](?:y[ıi]|m[ıi]|lara)?)\\s+(?:ekle|al|kaydet|yaz|olarak\\s+ekle)${AYIR}(.+)$`, 'iu');
const NOT = new RegExp(`${ON}${KITABA}(?:notu|notumu|notlara|not)\\s+(?:ekle|al|yaz|kaydet|düş|dus)${AYIR}(.+)$`, 'iu');
const SUNU_NOT = new RegExp(`${ON}(?:şunu|sunu)\\s+not\\s+(?:al|et|düş|dus)${AYIR}(.+)$`, 'iu');
const AD = /(^|\s)(bu\s+)?kitab[ıi]n\s+ad[ıi](?:\s*[:,]\s*|\s+)["“']?(?!(?:ne|nedir|neydi)\s*\??\s*$)([^?]+?)["”']?[.!]?\s*$/iu;
const OZETLE = /(^|\s)(bunu|kitab[ıi]|bu kitab[ıi])\s+(özetle|özetler misin|anlat|oku)(?=$|[\s,.!?])|(^|\s)özetini\s+(oku|söyle)/iu;

const BITTI = /(okundu(?:lar)?\s+(?:listesine|listeme|olarak|diye)\s+(?:ekle|al|işaretle|isaretle|kaydet|geç|gec)|okuduklar[ıi]m?a\s+ekle|okunanlara\s+ekle|bitti\s+(?:olarak\s+)?işaretle|(?:^|\s)(?:bu\s+kitab[ıi]\s+)?(?:bitirdim|okudum|okuyup\s+bitirdim)(?=$|[\s,.!])|okumay[ıi]\s+bitirdim)/iu;
const OKUNUYOR = /(okunuyor\s+(?:listesine|olarak)\s+(?:ekle|al|işaretle|isaretle)|okuduklar[ıi]m\s+aras[ıi]na|(?:^|\s)(?:şu\s+an\s+|şimdi\s+)?(?:bu\s+kitab[ıi]\s+)?okuyorum(?=$|[\s,.!])|okumaya\s+başlad[ıi]m|okumaya\s+basladim)/iu;
const OKUNACAK = /(okunacak(?:lar)?(?:a|\s+listesine|\s+listeme)?\s+(?:ekle|al|koy)|okuma\s+listeme\s+(?:ekle|al)|sonra\s+okuyaca[ğg][ıi]m|okunacak\s+olarak\s+işaretle)/iu;
const SAYFA = /(\d{1,4})\s*\.?\s*sayfa(?:s[ıi]na|ya|da|de)?\s*(?:day[ıi]m|deyim|ya\s+geldim|ya\s+kadar\s+okudum|da\s+kald[ıi]m|y[ıi]\s+okuyorum|y[ıi]\s+bitirdim)|sayfa\s*(\d{1,4})['’]?\s*(?:day[ıi]m|deyim|da|de|ya\s+geldim)/iu;
const TOPLAM = /(?:toplam|kitap|tamam[ıi])\s*(\d{1,4})\s*sayfa/iu;

/** Komut yoksa null (cümle normal Jarvis'e gider) */
export function matchBookCommand(text: string): KitapKomut | null {
  const t = text.trim();
  if (!t) return null;
  // Not ve alıntı önce: metnin içinde "okudum" gibi kelimeler geçebilir
  const a = ALINTI.exec(t);
  if (a) return { tip: 'alinti', metin: temizle(a[1]) };
  const n = NOT.exec(t) ?? SUNU_NOT.exec(t);
  if (n) return { tip: 'not', metin: temizle(n[1]) };
  const ad = AD.exec(t);
  if (ad) return { tip: 'ad', ad: ad[3].trim() };
  const s = SAYFA.exec(t);
  if (s) {
    const sayfa = Number(s[1] ?? s[2]);
    const top = TOPLAM.exec(t);
    if (sayfa > 0) return { tip: 'sayfa', sayfa, ...(top ? { toplam: Number(top[1]) } : {}) };
  }
  if (BITTI.test(t)) return { tip: 'durum', durum: 'bitti' };
  if (OKUNACAK.test(t)) return { tip: 'durum', durum: 'okunacak' };
  if (OKUNUYOR.test(t)) return { tip: 'durum', durum: 'okunuyor' };
  if (OZETLE.test(t)) return { tip: 'ozetle' };
  return null;
}

/** Sonundaki nokta ve tırnaklar atılır, ilk harf korunur */
const temizle = (s: string) => s.trim().replace(/^["“'‘]+|["”'’]+$/g, '').replace(/[.。]+$/, '').trim();

/** Jarvis'in kısa onayı */
export function onayCumlesi(k: KitapKomut, ad: string | null): string {
  const kitap = ad ? `${ad}` : 'Kitaba';
  switch (k.tip) {
    case 'not': return 'Not aldım efendim.';
    case 'alinti': return 'Alıntıyı ekledim efendim.';
    case 'durum': return k.durum === 'bitti' ? `${kitap} okunanlar listenizde efendim.` : k.durum === 'okunuyor' ? 'Okuduklarınız arasına aldım efendim.' : 'Okunacaklar listenize ekledim efendim.';
    case 'sayfa': return `Sayfa ${k.sayfa}, kaydettim efendim.`;
    case 'ad': return 'Tamamdır efendim, ekliyorum.';
    case 'ozetle': return '';
  }
}

// ---------------------------------------------------------------- Kitap sohbeti

export type SohbetKomut = { tip: 'basla'; kitap: string | null } | { tip: 'bitir' };

const SOHBET_BASLA = /^\s*(?:(?:hey\s+)?jarvis[,\s]+)?(?:seninle\s+)?(.+?)\s+(?:kitab[ıi]\s+)?(?:hakk[ıi]nda|üzerine)\s+(?:biraz\s+)?(?:sohbet\s+edelim|konuşal[ıi]m|muhabbet\s+edelim|sohbet\s+etmek\s+istiyorum|konuşmak\s+istiyorum|sohbet\s+eder\s+misin|konuşur\s+musun)\b/iu;
const SOHBET_GENEL = /(^|\s)kitap\s+sohbet(?:i|ini)?\s+(?:başlat|aç|yapal[ıi]m)|okuduğum\s+kitap\s+(?:hakk[ıi]nda|üzerine)/iu;
const SOHBET_BITIR = /(?:kitap\s+)?sohbet(?:i|imizi|ini)?\s+(?:bitir|kapat|sonland[ıi]r)|sohbeti\s+bitirelim|kitap\s+sohbetinden\s+ç[ıi]k/iu;
const GENEL_AD = /^(?:şu\s+an\s+|şimdi\s+)?(?:okuduğum|okumakta\s+olduğum|bu|şu|açık|kitab[ıi]m|okuduğum\s+kitap|bu\s+kitap|kitap)(?:\s+kitap)?$/iu;

/** "Tutunamayanlar hakkında sohbet edelim", "okuduğum kitap hakkında konuşalım", "kitap sohbetini bitir" */
export function matchBookChat(text: string): SohbetKomut | null {
  const t = text.trim();
  if (SOHBET_BITIR.test(t)) return { tip: 'bitir' };
  const m = SOHBET_BASLA.exec(t);
  if (m) {
    const ad = m[1].replace(/^(?:bu\s+)?(?:kitab[ıi]\s+)?/iu, '').replace(/\s+kitab[ıi]$/iu, '').trim();
    return { tip: 'basla', kitap: !ad || GENEL_AD.test(ad) ? null : ad };
  }
  if (SOHBET_GENEL.test(t)) return { tip: 'basla', kitap: null };
  return null;
}
