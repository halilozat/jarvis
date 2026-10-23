// Uzay Modu · sesli komut eşleştirici. Sunucuya gitmez; Web Speech ara sonuçlarında da çalışır (gecikme yok).
// Türkçe eklere ve STT hatalarına dayanıklı: "dünyayı", "dünya'yı", "mars'ı", "jüpiteri", "jupiter", "satürnü"…
// Önce metin sadeleştirilir: küçük harf, şapka/nokta farkı yok (ü→u, ş→s, ı→i…), noktalama ve kesme işareti yok.
import type { Govde } from './facts';

export type SpaceCmd =
  | { tip: 'mod'; ac: boolean }
  | { tip: 'gezegen'; govde: Govde }
  | { tip: 'bilgi'; konu: Govde | 'karadelik' }
  | { tip: 'sistem' }
  | { tip: 'olcek' }
  | { tip: 'karadelik' }
  | { tip: 'theia' }
  | { tip: 'kayan' }
  | { tip: 'arkaplan'; tam: boolean }
  | { tip: 'temizle' };

/** Sadeleştir: "Jarvis, Dünya'yı GETİR!" → "jarvis dunyayi getir" */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Gövde kökleri (sadeleştirilmiş). STT'nin sık yaptığı yazımlar da var. "ay" kısa olduğu için ayrı ele alınır. */
const KOKLER: [Govde, RegExp][] = [
  ['merkur', /^merk[uü]r/],
  ['venus', /^ven[uü]s/],
  ['dunya', /^d[uü]nya/],
  ['mars', /^mars/],
  ['jupiter', /^j[uü]piter|^yupiter|^ciupiter/],
  ['saturn', /^sat[uü]rn/],
  ['uranus', /^uran[uü]s/],
  ['neptun', /^nept[uü]n/],
  ['gunes', /^g[uü]nes/],
];
/** "ay": yalnızca ek almış ya da tek başına kelime olarak (ayi, aya, ayin, ay) */
const AY = /^(ay|ayi|aya|ayin|ayda)$/;

function govdeBul(words: string[]): Govde | null {
  for (const w of words) {
    for (const [g, re] of KOKLER) if (re.test(w)) return g;
    if (AY.test(w)) return 'ay';
  }
  return null;
}

const has = (t: string, re: RegExp) => re.test(t);

/** Metinde bir uzay komutu var mı? Yoksa null (normal Jarvis'e gider). */
export function matchSpaceCommand(text: string): SpaceCmd | null {
  const t = fold(text).replace(/^(hey |ok )?(jarvis|carvis|cervis|jarvi|jarviz)\b\s*/, '');
  if (!t) return null;
  const w = t.split(' ');

  // Mod
  if (has(t, /\buzay mod/)) {
    if (has(t, /\b(kapat|kapa|cik|bitir|durdur)/)) return { tip: 'mod', ac: false };
    if (has(t, /\b(ac|baslat|gec|etkinlestir|calistir)/)) return { tip: 'mod', ac: true };
  }
  if (has(t, /\buzaya gec\b/)) return { tip: 'mod', ac: true };

  // Arka plan (oda / uzay)
  if (has(t, /\boda(yi|y[ia])? (geri )?(getir|goster|gelsin|ac)|\boday[ia] don/)) return { tip: 'arkaplan', tam: false };
  if (has(t, /\barka ?plan/) && has(t, /\buzay/)) return { tip: 'arkaplan', tam: true };

  // Temizle
  if (has(t, /^(temizle|hepsini (temizle|dagit|sil|kaldir)|gezegenleri (temizle|dagit|sil|kaldir)|her seyi (temizle|sil))\b/) || t === 'temizle') return { tip: 'temizle' };

  // Kayan yıldız
  if (has(t, /\bkayan yildiz|\bkayanyildiz/)) return { tip: 'kayan' };

  // Theia / çarpıştır
  if (has(t, /\b(theia|teia|teya|tea|thea|teyya|tiya)(yi|y[ia]|i|ya)?\b/) && has(t, /\b(firlat|at|gonder|carp)/)) return { tip: 'theia' };
  if (has(t, /\b(gezegenleri )?carpistir/)) return { tip: 'theia' };

  // Kara delik (bilgi sorusu değilse)
  const karadelik = has(t, /\bkara ?delik/);
  if (karadelik && has(t, /\bhakkinda/)) return { tip: 'bilgi', konu: 'karadelik' };
  if (karadelik) return { tip: 'karadelik' };

  // Güneş sistemi
  if (has(t, /\bg[uü]nes sistem/)) return { tip: 'sistem' };

  // Gerçek boyutlar
  if (has(t, /\bgercek (boyut|olcek|buyukluk)/)) return { tip: 'olcek' };

  // "Bana Mars hakkında bir şey söyle"
  const g = govdeBul(w);
  if (g && has(t, /\bhakkinda|\bne biliyorsun|\bbilgi ver/)) return { tip: 'bilgi', konu: g };

  // "Satürn getir", "Jüpiter'i göster", "Mars'a çevir"
  const fiil = /\b(getir\w*|cagir\w*|goster\w*|olustur\w*|yap|cevir\w*|donustur\w*|gelsin|olsun)\b/;
  // "ay" çok anlamlı ("bu ay ne yapalım"): yalnızca hemen ardından fiil gelirse
  if (g === 'ay') return has(t, /\b(ay|ayi|aya)\s+(getir|cagir|goster|olustur|yap|cevir|donustur)/) ? { tip: 'gezegen', govde: 'ay' } : null;
  if (g && has(t, fiil)) return { tip: 'gezegen', govde: g };
  // Yalnızca gezegen adı ("Neptün") da yeter; "ay" tek başına çok anlamlı, onu atla
  if (g && w.length <= 2) return { tip: 'gezegen', govde: g };
  return null;
}
