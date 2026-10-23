// Uzay Modu ve Uzay Laboratuvarı · sesli komut eşleştirici. Sunucuya gitmez; Web Speech ara sonuçlarında da çalışır (gecikme yok).
// Türkçe eklere ve STT hatalarına dayanıklı: "dünyayı", "dünya'yı", "mars'ı", "jüpiteri", "jupiter", "satürnü"…
// Önce metin sadeleştirilir: küçük harf, şapka/nokta farkı yok (ü→u, ş→s, ı→i…), noktalama ve kesme işareti yok.
import type { KutleAd } from './extra/moonHolePhysics';
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
  | { tip: 'temizle' }
  // Uzay Laboratuvarı
  | { tip: 'lab'; ac: boolean }
  | { tip: 'gosteri' }
  | { tip: 'sifirla' }
  | { tip: 'yaklastir'; govde: Govde; yakin: boolean }
  | { tip: 'tasi'; govde: Govde; hedef: Govde; yanina: boolean }
  | { tip: 'mesaj'; hedef: Govde; kaynak: Govde }
  | { tip: 'karsilastir'; a: Govde | null; b: Govde | null }
  | { tip: 'kesit'; govde: Govde | null }
  | { tip: 'zaman'; islem: 'hizlandir' | 'yavaslat' | 'durdur' | 'devam' | 'geri' }
  | { tip: 'tarih'; yil: number; ay?: number; gun?: number; fark?: undefined }
  | { tip: 'tarih'; fark: number; yil?: undefined; ay?: undefined; gun?: undefined }
  | { tip: 'yasanabilir'; goster: boolean }
  | { tip: 'gorunum'; ic: boolean }
  | { tip: 'kilo'; kg: number }
  // Yaşam izi taraması: hedef null → seçili cisim, 'odak' → bölgedeki bütün cisimler. surucu: Jarvis'in sahneleri yürütür.
  | { tip: 'tara'; hedef: Govde | 'odak' | null; hizli: boolean; surucu?: boolean }
  | { tip: 'odak'; govde: Govde }
  | { tip: 'kaldir'; govde: Govde }
  // Ekstra sahne: numara null → yalnızca sahneyi aç. halka: başın çevresinde halka; boyutKm: asteroit çapı; yakin: kara delik geçişi;
  // kutle: Ay yerine konan kara deliği büyüt / küçült ya da bir basamağa getir; kat: "10 kat büyüt"
  | { tip: 'ekstra'; numara: 'ay' | 'asteroit' | 'kizildev' | 'karadelik' | 'aykaradelik' | null; halka?: boolean; boyutKm?: number; yakin?: 'yakin' | 'uzak'; kutle?: 'buyut' | 'kucult' | KutleAd; kat?: number };

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
  // Uydular (STT "Europa"yı çoğunlukla "Avrupa" yazar)
  ['europa', /^(europa|avrupa|oropa|yuropa|evropa)/],
  ['ganymede', /^(ganymed|ganimed|ganimet|ganymet|ganimid)/],
  ['enceladus', /^(enceladus|enseladus|enkeladus|ensaladus|enceladu)/],
  ['titan', /^titan/],
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

/** Metindeki bütün gövdeler, geçtikleri sırayla (Güneş hariç; "ay" yalnızca ekli biçimleriyle) */
function govdeler(words: string[]): Govde[] {
  const out: Govde[] = [];
  for (const w of words) {
    let g: Govde | null = null;
    for (const [k, re] of KOKLER) if (re.test(w)) { g = k; break; }
    if (!g && /^(ayi|aya|ayin|ayla)$/.test(w)) g = 'ay';
    if (g && g !== 'gunes' && !out.includes(g)) out.push(g);
  }
  return out;
}

const AYLAR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const AY_RE = AYLAR.join('|');
const GIT = '(git|gidelim|gec|atla|ilerle|don|goster|getir)';

/** Uzay Laboratuvarı komutları (sadeleştirilmiş metin) */
function matchLab(t: string, w: string[]): SpaceCmd | null {
  // Laboratuvar aç/kapat, gösteri
  if (has(t, /\b(uzay )?lab(oratuvar|aratuvar|ratuvar)?\w*/) && !has(t, /\bsifirla/)) {
    if (has(t, /\b(kapat|kapa|cik|bitir)/)) return { tip: 'lab', ac: false };
    if (has(t, /\b(ac|baslat|gec|calistir|don)/)) return { tip: 'lab', ac: true };
  }
  if (has(t, /\bgosteri\w*/) && has(t, /\b(mod|ac|gec|baslat)/)) return { tip: 'gosteri' };

  // Sıfırla
  if (has(t, /\b(sifirla|bastan basla|bugune don|bugune gel|reset)/)) return { tip: 'sifirla' };

  // Yaşanabilir bölge
  if (has(t, /\byasanabilir|\byasanilabilir/)) return { tip: 'yasanabilir', goster: !has(t, /\b(gizle|kapat|kaldir|sakla)/) };

  // Kilo
  const kg = /\b(kilom|agirligim|kilo(?:m)? ?(?:olarak)?)\s*(\d{2,3})|\b(\d{2,3}) (kiloyum|kilo(?:yum)?(?: geliyorum)?$)/.exec(t);
  if (kg) { const v = Number(kg[2] ?? kg[3]); if (v >= 20 && v <= 300) return { tip: 'kilo', kg: v }; }

  const gs = govdeler(w);

  // Ekstra sahne
  if (has(t, /\bekstra\w*/) && !has(t, /\b(asteroi|kizil dev|kara ?deli[kg]|ayi|halka)/)) return { tip: 'ekstra', numara: null };
  if (has(t, /\b(asteroi?t\w*|astroit\w*|gok ?tasi\w*|meteor\w*)/)) {
    const km = /(\d{1,3}(?:[.,]\d)?) ?(km|kilometre)\w*/.exec(t);
    return { tip: 'ekstra', numara: 'asteroit', ...(km ? { boyutKm: Number(km[1].replace(',', '.')) } : {}) };
  }
  if (has(t, /\bkizil ?dev\w*|\bgunesin (sonu\w*|son gun\w*|olum\w*|olecegi)|\bmilyar yil (sonra\w*|ileri)|\bbeyaz cuce/)) return { tip: 'ekstra', numara: 'kizildev' };
  if (has(t, /\bkara ?deli[kg]\w*/) && has(t, /\b(gecir\w*|gezgin|gecsin|gecer\w*|sistemden|sistemin icinden)/)) {
    return { tip: 'ekstra', numara: 'karadelik', ...(has(t, /\byakindan/) ? { yakin: 'yakin' as const } : has(t, /\buzaktan/) ? { yakin: 'uzak' as const } : {}) };
  }
  // Ay yerine kara delik: "Ay'ın yerine kara delik koy", "Ay kara delik olsaydı", "kara deliği büyüt", "Jüpiter kütlesine büyüt"
  const kd = has(t, /\bkara ?deli[kg]\w*/);
  if (kd && has(t, /\b(ay|ayin|ayi)\b/) && has(t, /\b(yerine|olsa\w*|olursa|cevir\w*|donustur\w*|donusse\w*|donusur\w*)/)) return { tip: 'ekstra', numara: 'aykaradelik' };
  const buyut = has(t, /\b(buyut\w*|buyusun|agirlastir\w*|daha buyuk)/), kucult = has(t, /\b(kucult\w*|kuculsun|hafiflet\w*|daha kucuk)/);
  const kutleHedef: KutleAd | null = has(t, /\b(samanyolu\w*|galaksi\w*|sagittarius|sagitarius|sagittarus|sgr)/) ? 'sgra' : has(t, /\bgunes\w*/) ? 'gunes'
    : gs.includes('jupiter') ? 'jupiter' : gs.includes('dunya') ? 'dunya' : has(t, /\b(ay|ayin|ayi) kutle/) ? 'ay' : null;
  if ((kd && (buyut || kucult)) || ((kd || has(t, /\bkutle\w*/)) && kutleHedef && (buyut || kucult || has(t, /\b(getir|yap|cikar|indir|ayarla|olsun)\w*/)))) {
    const km = /\b(\d+(?:[.,]\d+)?|iki|uc|bes|on|yuz|bin|milyon) kat/.exec(t);
    const sozel: Record<string, number> = { iki: 2, uc: 3, bes: 5, on: 10, yuz: 100, bin: 1000, milyon: 1e6 };
    const kat = km ? sozel[km[1]] ?? Number(km[1].replace(',', '.')) : 0;
    return { tip: 'ekstra', numara: 'aykaradelik', kutle: kutleHedef ?? (kucult ? 'kucult' : 'buyut'), ...(kat > 1 && !kutleHedef ? { kat } : {}) };
  }
  if (has(t, /\bhalka\w*/) && has(t, /\b(ekle|koy|olustur|kaldir|sil|kapat|getir)\w*/)) return { tip: 'ekstra', numara: 'ay', halka: !has(t, /\b(kaldir|sil|kapat)/) };
  if (has(t, /\b(ay|ayi)\b/) && has(t, /\b(kafam|basim|etrafim|cevrem|etrafimda|cevremde|basimin|kafamin)\w*/)) return { tip: 'ekstra', numara: 'ay' };

  // Yaşam izi taraması: "Europa'da yaşam izi tara", "bu bölgede yaşam izi tara", "hızlı tara"
  const hizli = has(t, /\bhizli/);
  if ((has(t, /\b(yasam|hayat) ?(izi|izleri|belirti\w*|isaret\w*|taramasi)/) && has(t, /\b(tara|ara|bak|kontrol|tarama)\w*/)) || /^(hizli|hizlica) tara\w*$/.test(t)) {
    const odak = has(t, /\b(bu bolge|bolgede|bolgedeki|bolgeyi|buradaki|burada|bunlarda|hepsinde)/);
    return { tip: 'tara', hedef: odak ? 'odak' : gs[0] ?? null, hizli };
  }
  // Uyduyu ya da gezegeni yakından göster: "Jüpiter'e yakınlaş", "Satürn'e odaklan"
  if (gs.length && has(t, /\b(yakinlas|odaklan|zoom|yakindan)\w*/)) return { tip: 'odak', govde: gs[0] };
  // "Ay'ı kaldır"
  if (gs.length && has(t, /\b(kaldir|yok et|sil|cikar)\w*/) && !has(t, /\bgeri/)) return { tip: 'kaldir', govde: gs[0] };

  // Tarih: "2030'a git", "1 ocak 2030'a git", "15 mart 2027 tarihine git", "10 yıl sonrasına git", "gelecek yıla git"
  const tr = new RegExp(`\\b(?:(\\d{1,2}) )?(?:(${AY_RE})\\w* )?(\\d{4})\\w*(?: (?:yil|tarih|sene)\\w*)? ${GIT}`).exec(t);
  if (tr) {
    const yil = Number(tr[3]);
    if (yil >= 1600 && yil <= 2500) {
      const ay = tr[2] ? AYLAR.indexOf(tr[2]) + 1 : undefined;
      const gun = tr[1] && ay ? Number(tr[1]) : undefined;
      return { tip: 'tarih', yil, ay, gun };
    }
  }
  const rel = new RegExp(`\\b(\\d{1,3}|bir|iki|uc|bes|on|yuz) (yil|sene)\\w* (sonra\\w*|ileri\\w*|geri\\w*|once\\w*)(?: ${GIT})?`).exec(t);
  if (rel && (rel[4] || /^(ileri|geri)/.test(rel[3]))) {
    const sozel: Record<string, number> = { bir: 1, iki: 2, uc: 3, bes: 5, on: 10, yuz: 100 };
    const nn = sozel[rel[1]] ?? Number(rel[1]);
    return { tip: 'tarih', fark: /^(geri|once)/.test(rel[3]) ? -nn : nn };
  }
  if (has(t, new RegExp(`\\b(gelecek|sonraki|seneye) (yil|sene)\\w* ${GIT}`))) return { tip: 'tarih', fark: 1 };

  // Zaman
  const zaman = has(t, /\bzaman\w*/);
  if (has(t, /\bgeri (sar|al|akit)/) && !gs.length) return { tip: 'zaman', islem: 'geri' };
  if (has(t, /\b(hizlandir|hizlansin|daha hizli|hizli akit)/) && !gs.length) return { tip: 'zaman', islem: 'hizlandir' };
  if (has(t, /\b(yavaslat|yavaslasin|daha yavas)/) && !gs.length) return { tip: 'zaman', islem: 'yavaslat' };
  if ((zaman && has(t, /\b(durdur|dursun|dondur)/)) || t === 'dur' || t === 'durdur') return { tip: 'zaman', islem: 'durdur' };
  if ((zaman && has(t, /\b(baslat|devam|akit|aksin|oynat)/)) || t === 'devam et' || t === 'devam') return { tip: 'zaman', islem: 'devam' };

  // "Dünya'yı Venüs'ün yerine koy", "Jüpiter'i Dünya'nın yanına koy", "Dünya'yı Mars'ın yörüngesine koy"
  if (gs.length >= 2 && has(t, /\b(koy|yerlestir|tasi|gotur|getir|al)\w*/) && has(t, /\b\w*(yerine|yanina|yorunge\w*)\b/)) {
    return { tip: 'tasi', govde: gs[0], hedef: gs[1], yanina: has(t, /\byanina/) };
  }

  // "Dünya'yı Güneş'e yaklaştır", "Mars'ı Güneş'ten uzaklaştır"
  const yak = has(t, /\byaklastir/), uzak = has(t, /\buzaklastir/);
  if ((yak || uzak) && gs.length) return { tip: 'yaklastir', govde: gs[0], yakin: yak };
  // Gezegensiz "yakınlaştır / uzaklaştır": görünüm
  if (has(t, /\b(yakinlas|yakinlastir|ic gezegen|zoom)/)) return { tip: 'gorunum', ic: true };
  if (uzak || has(t, /\b(tum sistem|butun sistem|tum gezegen|butun gezegen|genis aci)/)) return { tip: 'gorunum', ic: false };

  // Mesaj: "Mars'a mesaj gönder", "Jüpiter'e sinyal yolla"
  if (has(t, /\b(mesaj|sinyal|isik)\w*/) && has(t, /\b(gonder|yolla|at|ilet)\w*/)) {
    const hedef = gs.find(g => g !== 'dunya') ?? gs[0] ?? 'mars';
    const kaynak = gs.length >= 2 && gs[0] !== hedef ? gs[0] : hedef === 'dunya' ? 'mars' : 'dunya';
    return { tip: 'mesaj', hedef, kaynak };
  }

  // Karşılaştır
  if (has(t, /\bkarsilastir|\bkiyasla|\bkarsilastirma/)) return { tip: 'karsilastir', a: gs[0] ?? null, b: gs[1] ?? null };

  // Kesit: "içini aç", "Dünya'nın içini göster", "kesitini göster"
  if (has(t, /\b(icini|ic yapisini|katmanlarini|kesit\w*)/) && has(t, /\b(ac|goster|gor|bak|al)\w*|\bkesit/)) return { tip: 'kesit', govde: gs[0] ?? null };

  return null;
}

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

  // Uzay Laboratuvarı
  const lab = matchLab(t, w);
  if (lab) return lab;

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
  const karadelik = has(t, /\bkara ?deli[kg]/);
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

/**
 * Zincirleme komut: "Dünya'yı Mars'ın yerine koy, sonra yaşam izi tara". Her parça bir uzay komutuysa sırayla
 * çalışacak liste döner; parçalardan biri komut değilse null (cümle normal Jarvis'e gider).
 */
export function matchSpaceChain(text: string): SpaceCmd[] | null {
  const parts = fold(text).split(/ (?:daha sonra|ve sonra|ve ardindan|ardindan|sonrasinda|sonra) (?=\S)/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const cmds = parts.map(matchSpaceCommand);
  return cmds.every(Boolean) ? (cmds as SpaceCmd[]) : null;
}
