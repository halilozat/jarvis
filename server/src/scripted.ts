// Hazır komutlar: modele sorulmadan, her seferinde birebir aynı cevap (Reels çekimi için tutarlı ve anında).
// Cümlelerin sesi seçili sesle önceden üretilip diske yazılır (warmOpening).
import type { Gorsel } from './types.js';
import { control } from './home.js';

/** Eşleşme bağlamı: fotoğraf var mı, Jarvis'in son cevabı, bağlı kamera var mı */
export interface ScriptedCtx { image: boolean; prev: string; cameraOnline: boolean }

export interface ScriptedCommand {
  name: string;
  match(folded: string, ctx: ScriptedCtx): boolean;
  /** Eşleşince yapılacak iş (ör. kahve makinesini çalıştır); cümle aynı kalır */
  run?(folded: string): void;
  sahneler: { ses: string; gorsel: Gorsel & { foto_arama?: string } }[];
  detay: string;
}

/** Küçük harf, Türkçe harfler sadeleşmiş, noktalama boşluk */
const fold = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c).replace(/[^a-z0-9]+/g, ' ').trim();

// "kahve yap", "bana bol köpüklü bir Türk kahvesi yapar mısın", "kahve hazırla". "Kahve yapmayı öğrendin mi", "kahve falı" eşleşmez.
const KAHVE = /\bkahve(si|yi|cik)?\b/;
const YAP = /\b(yap|yapar|yapsana|yapiver|yapin|yapabilir|hazirla|hazirlar|hazirlasana|hazirlayin|hazirlayiver|hazirlayabilir)\b/;
// "kahvemi bitirdim", "kahvem bitti", "kahvemi içtim"
const BITTI = /\bkahve(m|mi|yi)?\b.*\b(bitti|bitirdim|ictim|biti)\b/;
const FAL = /\bfal/;
const FAL_DAVET = 'Efendim, kahveniz bittiyse falınıza bakabilirim.';
/** Her falın son cümlesi: sunucu ekler, sesi önceden hazırdır (Halil'in isteği) */
export const FAL_SON = 'Falınızda 100 bin takipçi görüyorum efendim.';

/**
 * Fal turu mu? Davetten sonra gelen fotoğraf, fotoğrafla "fal", ya da kamera bağlıyken "falıma bak".
 * Bu turda model 2-3 sahnelik bir fal uydurur, sunucu sona FAL_SON'u ekler.
 */
export function isFalTurn(text: string, c: ScriptedCtx): boolean {
  const t = fold(text);
  if (c.image) return FAL.test(t) || fold(c.prev).includes(fold(FAL_DAVET).slice(0, 40));
  return FAL.test(t) && c.cameraOnline;
}

export const SCRIPTED: ScriptedCommand[] = [
  {
    // Etkileşim (kahve makinesi) sonra eklenecek; şimdilik yalnızca cevap (Halil'in isteği)
    name: 'kahve',
    match: (t, c) => !c.image && KAHVE.test(t) && YAP.test(t) && !FAL.test(t) && !/\bfiltre\b/.test(t),
    // Türk kahve makinesini çalıştır: köpük ve şeker sözden ("bol köpüklü", "orta şekerli"), yoksa bol köpüklü sade
    run: t => control('turk_kahve', {
      islem: 'pisir',
      kopuk: /\baz kopuk/.test(t) ? 'az' : /\borta kopuk/.test(t) ? 'orta' : 'bol',
      seker: /\bsekerli\b/.test(t) && !/\b(az|orta) sekerli/.test(t) ? 'sekerli' : /\borta sekerli/.test(t) ? 'orta' : /\baz sekerli/.test(t) ? 'az' : 'sade',
    }),
    sahneler: [
      {
        ses: 'Tabii efendim, kahveniz hazırlanıyor. Yapılışını kameradan da izleyebilirsiniz.',
        gorsel: { tip: 'ikon', ikon: 'coffee', baslik: 'Türk kahvesi', alt: 'Bol köpüklü · hazırlanıyor', foto_arama: 'turkish coffee foam cup' },
      },
    ],
    detay: '**Türk kahvesi** — hazırlanıyor. Yapılışı kamera panelinden izlenebilir.',
  },
  {
    // Kahve bitti → fal daveti. "Falıma bak" da buraya düşer, ama yalnızca bağlı kamera yokken (kamera varsa Jarvis kameradan bakar)
    name: 'fal daveti',
    match: (t, c) => !c.image && (BITTI.test(t) || (FAL.test(t) && !c.cameraOnline)),
    sahneler: [{ ses: FAL_DAVET, gorsel: { tip: 'ikon', ikon: 'coffee', baslik: 'Kahve falı', alt: 'Fincanınızın fotoğrafını gönderin', foto_arama: 'turkish coffee cup grounds' } }],
    detay: 'Fincanı ters çevirip soğuduktan sonra **Fotoğraf** düğmesiyle telvenin fotoğrafını gönderin.',
  },
];

export const findScripted = (text: string, ctx: ScriptedCtx) => {
  const t = fold(text);
  return SCRIPTED.find(s => s.match(t, ctx));
};

/** Önceden seslendirilecek cümleler */
export const SCRIPTED_LINES = [...SCRIPTED.flatMap(s => s.sahneler.map(x => x.ses)), FAL_SON];
