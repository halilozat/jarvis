// Haber Modu · analiz: haber detayı, kaynak karşılaştırması, sorulmamış sorular (iddia kontrolü factcheck.ts'te).
//
// Doğruluk kuralları (tarafsızlık için en önemli kısım):
// - Model yalnızca öneri yapar; her alıntı kaynak metinde birebir aranır (büyük/küçük harf ve tırnak farkı hariç),
//   bulunamayan madde atılır. Jarvis'in kendi cümlelerindeki her sayı ve şehir kaynak metinlerde geçmek zorunda.
// - "Farklı sayılar" ve "sadece bazı kaynaklarda" kodla da çıkarılır; model yoksa (demo) bile karşılaştırma çalışır.
// - Sorulmamış sorular, kodla bulunan somut boşluklara bağlıdır (5N1K'dan eksik olan, kaynağı belirtilmeyen sayı,
//   kaynaklar arası çelişki, arşivde takibi yapılmamış söz). Model yalnızca soruyu cümleye döker.
// - Değerlendirici dil ("propaganda", "yalan", "taraflı" …) Jarvis'in hiçbir cümlesinde geçemez; geçen madde atılır.
import { tamMetin } from './article.js';
import { analizKaydet, arsivKume, oncekiler, type OncekiHaber } from './newsArchive.js';
import { fold, type Kume } from './newsCluster.js';
import { CHAT_MODEL, MOCK, routellm, type ChatResponse } from './routellm.js';

// ———————————————————— Türler (web/src/hands/news/types.ts ile aynı) ————————————————————

export interface KaynakMetin { kaynak: string; baslik: string; ilkCumle: string; saat: string; url: string; metin: string; tam: boolean }
export interface Alinti { kaynak: string; metin: string }
export type MaddeTur = 'ortak' | 'vurgu' | 'bazilari' | 'sayilar';
export interface KarsilastirmaMadde { tur: MaddeTur; baslik: string; alintilar: Alinti[]; gecen?: string[]; gecmeyen?: string[] }
export type BoslukTur = 'ne-zaman' | 'nerede' | 'neden' | 'maliyet' | 'kaynaksiz-sayi' | 'celiski' | 'takip';
export interface Bosluk { id: string; tur: BoslukTur; not: string; kanit?: Alinti; onceki?: { tarih: string; url: string } }
export interface Soru { soru: string; bosluk: BoslukTur; not: string; kanit?: Alinti }
export interface Sayi { deger: string; baglam: string; kaynak: string }
export interface Detay {
  id: string; baslik: string; kategori: string;
  kaynaklar: KaynakMetin[];
  ozet: string[];
  sayilar: Sayi[];
  sehirler: string[];
  zaman: { saat: string; metin: string }[];
  onceki: OncekiHaber[];
}
export interface Karsilastirma { maddeler: KarsilastirmaMadde[]; anlatim: string[] }
/** Modelin çıkardığı iddia: factcheck.ts doğrular */
export interface HamIddia { kaynak: string; alinti: string; tur: string; sorgu: Record<string, unknown> }
export interface Analiz { detay: Detay; karsilastirma: Karsilastirma; sorular: Soru[]; iddialar: HamIddia[]; model: boolean; at: string; surum: number }
/** Analiz kuralları değişince artar: arşivdeki eski analizler yeniden yapılır */
export const ANALIZ_SURUM = 4;

// ———————————————————— Metin yardımcıları ————————————————————

/** Karşılaştırma için sadeleştir: küçük harf, tek tip tırnak ve boşluk */
export const sade = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/[“”„«»″]/g, '"').replace(/[‘’`´′]/g, "'").replace(/\s+/g, ' ').trim();

/** Alıntı kaynak metinde birebir geçiyor mu (büyük/küçük harf, tırnak ve boşluk farkı hariç) */
export const birebir = (alinti: string, metin: string) => alinti.trim().length >= 8 && sade(metin).includes(sade(alinti));

export const cumleler = (s: string) => s.split(/(?<=[.!?…])\s+(?=["“'‘A-ZÇĞİÖŞÜ0-9])/).map(c => c.trim()).filter(Boolean);

/** Jarvis'in cümlelerinde geçemeyecek değerlendirici ifadeler */
export const DEGERLENDIRICI = /propaganda|\byalan(cı|cılık|lar)?\b|manip[uü]l|tarafl[ıi]|\byanl[ıi]\b|doğru söylü|yanlış söylü|çarpıt|dezenformasyon|algı operasyon|gerçeği gizl|kandır|uydur(ma|du)/i;
/** Sorularda ima ve yönlendirme */
const IMA = /gizl[ei]|saklan|sakla(dı|yor)|örtbas|perde arkası|komplo|neden sus|acaba|aslında|gerçekte ne|kim kazan[ıi]yor/i;

export const temizMi = (s: string) => !DEGERLENDIRICI.test(s);

// Sayılar: 1.250 · 3,2 · %12 · yüzde 4,5
const SAYI = /(?:%|yüzde\s*)?\d{1,3}(?:\.\d{3})+(?:,\d+)?|(?:%|yüzde\s*)?\d+(?:,\d+)?/gi;
const AYLAR = 'ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık';
const TARIH_SAYI = new RegExp(`^(\\d{1,2})\\s+(${AYLAR})|^(19|20)\\d{2}\\b`, 'i');

/** Metindeki sayılar (tarih, saat ve yıl hariç), cümlesi ve ardından gelen iki kelimenin kökü */
export function sayilariBul(metin: string): { deger: number; ham: string; birim: string; anahtar: string; cumle: string }[] {
  const out: { deger: number; ham: string; birim: string; anahtar: string; cumle: string }[] = [];
  for (const c of cumleler(metin)) {
    // Geçmişteki başka bir olayı anlatan cümle ("10 kişi hayatını kaybetmişti") bugünkü sayılarla karışmasın
    if (/m[ıiuü]şt[ıiuü]\b/i.test(c)) continue;
    for (const m of c.matchAll(SAYI)) {
      const ham = m[0].trim();
      const i = m.index ?? 0;
      const sonra = c.slice(i + m[0].length);
      const once = c.slice(Math.max(0, i - 3), i);
      if (/^[:.]\d/.test(sonra) || /\d[:.]$/.test(once)) continue; // saat 14:30, 1.2.3
      if (TARIH_SAYI.test(c.slice(i).toLocaleLowerCase('tr'))) continue; // 23 Ekim, 29 EKİM'DE, 2026
      const yuzde = /^(%|yüzde)/i.test(ham);
      const deger = Number(ham.replace(/^(%|yüzde\s*)/i, '').replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(deger)) continue;
      const kelimeler = fold(sonra).trim().split(/\s+/).filter(Boolean);
      // Kök: 4 harf ("kişi", "kişinin" → "kisi"; "yaralandı", "yaralı" → "yara")
      const birim = yuzde ? 'yuzde' : (kelimeler[0] ?? '').slice(0, 4);
      if (!birim || /^\d/.test(birim)) continue;
      const anahtar = `${birim}|${(kelimeler[yuzde ? 0 : 1] ?? '').slice(0, 4)}`;
      out.push({ deger, ham, birim, anahtar, cumle: c });
    }
  }
  return out;
}

/** Uzun cümleden sayının çevresi (alıntı birebir kalır: cümlenin bir parçası) */
function pencere(cumle: string, ham: string, n = 170): string {
  if (cumle.length <= n) return cumle;
  const i = Math.max(0, cumle.indexOf(ham) - 60);
  return cumle.slice(i, i + n).trim();
}

// İller (haritada yalnızca metinde birebir geçenler gösterilir). "Ordu" ve "Batman" gibi cins ad da olabilenler
// yalnızca kesme işaretli ekle ("Ordu'da") sayılır.
const ILLER = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];
const CINS = new Set(['Ordu', 'Batman', 'Van', 'Bolu', 'Kars', 'Muş']);
export function sehirleriBul(metin: string): string[] {
  return ILLER.filter(il => {
    const kes = `${il}['’][a-zçğıöşü]+`;
    const re = new RegExp(CINS.has(il) ? `(^|[^\\p{L}])${kes}` : `(^|[^\\p{L}])${il}(?![\\p{L}])|(^|[^\\p{L}])${kes}`, 'u');
    return re.test(metin);
  });
}

// ———————————————————— Metinler ————————————————————

/** Kümenin kaynak metinleri: tam metin çekilebildiyse o, yoksa RSS başlığı ve özeti */
export async function kaynakMetinleri(k: Kume): Promise<KaynakMetin[]> {
  const arsiv = arsivKume(k.id);
  return Promise.all(k.haberler.map(async h => {
    const kayitli = arsiv?.kaynaklar.find(s => s.url === h.url)?.metin;
    const tam = kayitli ?? (await tamMetin(h.url));
    const metin = tam && tam.length > h.summary.length ? tam : h.summary;
    const ilk = cumleler(metin)[0] ?? h.summary;
    return { kaynak: h.source, baslik: h.title, ilkCumle: ilk.slice(0, 260), saat: h.published_at, url: h.url, metin: `${h.title}. ${metin}`, tam: !!tam };
  }));
}

// ———————————————————— Kodla karşılaştırma ————————————————————

/** Aynı şeyi (birim + ardından gelen kelime) farklı sayıyla veren kaynaklar */
export function farkliSayilar(km: KaynakMetin[]): KarsilastirmaMadde[] {
  const grup = new Map<string, Map<number, Alinti[]>>();
  for (const k of km) {
    const goruldu = new Set<string>();
    for (const s of sayilariBul(k.metin)) {
      const key = s.anahtar;
      if (goruldu.has(key)) continue; // kaynak başına anahtarın ilk geçişi
      goruldu.add(key);
      if (!grup.has(key)) grup.set(key, new Map());
      const g = grup.get(key)!;
      if (!g.has(s.deger)) g.set(s.deger, []);
      g.get(s.deger)!.push({ kaynak: k.kaynak, metin: pencere(s.cumle, s.ham) });
    }
  }
  const out: KarsilastirmaMadde[] = [];
  const imzalar = new Set<string>();
  for (const [key, degerler] of grup) {
    if (degerler.size < 2) continue;
    const kaynakSayisi = new Set([...degerler.values()].flat().map(a => a.kaynak)).size;
    if (kaynakSayisi < 2) continue;
    const birim = key.split('|')[0];
    const imza = [...degerler.keys()].sort((a, b) => a - b).join('/');
    if (imzalar.has(imza)) continue;
    imzalar.add(imza);
    out.push({
      tur: 'sayilar',
      baslik: `${birim === 'yuzde' ? 'Oran' : 'Sayı'} kaynaklara göre farklı: ${[...degerler.keys()].sort((a, b) => a - b).map(v => v.toLocaleString('tr-TR')).join(' · ')}`,
      alintilar: [...degerler.values()].map(a => a[0]),
    });
  }
  return out.slice(0, 4);
}

// ———————————————————— Boşluklar (sorulmamış sorular) ————————————————————

const ZAMAN_RE = new RegExp(`\\b(dün|bugün|yarın|bu sabah|bu akşam|gece|sabah saatlerinde|akşam saatlerinde|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|${AYLAR}|saat \\d|\\d{1,2}[:.]\\d{2}|(19|20)\\d{2})`, 'i');
const NEDEN_RE = /nedeniyle|sebebiyle|yüzünden|gerekçe|amacıyla|çünkü|dolayı|sebebi|nedeni|neden olarak|kaynaklandı/i;
const PARA_RE = /\d[\d.,]*\s*(milyon|milyar|bin)?\s*(tl|lira|dolar|euro|avro|sterlin)\b|\b(maliyet|bütçe|bedel)\w*\s+\S*\d/i;
const PROJE_RE = /\b(ihale|proje|yatırım|inşaat|destek paketi|teşvik|harcama|satın al|kredi|yapılacak|kurulacak)\w*/i;
const ATIF_RE = /göre|açıkla(dı|ndı|masına|maya|mada|ması)|bildiril?di|verilerine|duyurul?du|dedi|söyledi|aktar(dı|ıldı)|kaydedil?di|belirtil?di|ifade et(ti|di)|ifade edildi|raporuna|bilgisine|tarafından yapılan/i;
const SOZ_RE = /(açıklanacak|tamamlanacak|başlayacak|yapılacak|sunulacak|getirilecek|hayata geçirilecek|yürürlüğe girecek|imzalanacak|açılacak)/i;

/** Kümedeki somut boşluklar: her biri kodla kontrol edilebilir */
export function bosluklar(km: KaynakMetin[], kategori: string, onceki: OncekiHaber[]): Bosluk[] {
  const tum = km.map(k => k.metin).join('\n');
  const out: Bosluk[] = [];
  const ekle = (b: Omit<Bosluk, 'id'>) => out.push({ ...b, id: `b${out.length + 1}` });
  if (!ZAMAN_RE.test(tum)) ekle({ tur: 'ne-zaman', not: 'Hiçbir kaynakta olayın tarihi ya da saati geçmiyor' });
  if (kategori === 'gundem' && !sehirleriBul(tum).length && !/\b(ilçe|mahalle|köy|cadde|sokak|bölge)\w*/i.test(tum)) ekle({ tur: 'nerede', not: 'Hiçbir kaynakta olayın yeri belirtilmiyor' });
  if (!NEDEN_RE.test(tum) && km.length >= 2) ekle({ tur: 'neden', not: 'Hiçbir kaynakta gerekçe ya da neden açıklanmıyor' });
  if (PROJE_RE.test(tum) && !PARA_RE.test(tum)) ekle({ tur: 'maliyet', not: 'Hiçbir kaynakta maliyet bilgisi yok' });
  // Kaynağı belirtilmeyen sayı: o sayının geçtiği hiçbir kaynakta cümlede ya da bir önceki cümlede atıf yok
  const sayiAtif = new Map<string, { atifli: boolean; ornek: Alinti; ham: string }>();
  for (const k of km) {
    const cs = cumleler(k.metin);
    for (const s of sayilariBul(k.metin)) {
      if (s.birim === 'yil' || s.deger < 2) continue;
      const i = cs.indexOf(s.cumle);
      const atifli = ATIF_RE.test(s.cumle) || (i > 0 && ATIF_RE.test(cs[i - 1]));
      // Aynı sayı herhangi bir kaynakta atıfla geçiyorsa kaynağı belli sayılır (başlıklarda atıf olmaz: "7 ölü")
      const key = String(s.deger);
      const v = sayiAtif.get(key);
      if (!v) sayiAtif.set(key, { atifli, ornek: { kaynak: k.kaynak, metin: pencere(s.cumle, s.ham) }, ham: s.ham });
      else v.atifli ||= atifli;
    }
  }
  const kaynaksiz = [...sayiAtif.values()].find(v => !v.atifli);
  if (kaynaksiz) ekle({ tur: 'kaynaksiz-sayi', not: `"${kaynaksiz.ham}" sayısının kaynağı hiçbir haberde belirtilmiyor`, kanit: kaynaksiz.ornek });
  const celiski = farkliSayilar(km)[0];
  if (celiski) ekle({ tur: 'celiski', not: `Kaynaklar farklı sayılar veriyor (${celiski.alintilar.map(a => a.kaynak).join(', ')})`, kanit: celiski.alintilar[0] });
  // Arşiv: önceki haberde verilen söz, bugünkü haberlerde hiç geçmiyor
  for (const o of onceki) {
    for (const s of o.kaynaklar) {
      const c = cumleler(`${s.baslik}. ${s.ozet}`).find(x => SOZ_RE.test(x));
      if (!c) continue;
      const fiil = SOZ_RE.exec(c)![1];
      if (sade(tum).includes(sade(fiil.slice(0, -4)))) continue; // aynı fiil bugün de geçiyor: takip var
      ekle({ tur: 'takip', not: `${o.tarih} tarihli haberde söz verilmişti; bugünkü haberlerde buna dair bilgi yok`, kanit: { kaynak: s.ad, metin: c.slice(0, 220) }, onceki: { tarih: o.tarih, url: s.url } });
      break;
    }
    if (out.some(b => b.tur === 'takip')) break;
  }
  return out;
}

/** Boşluk gerçekten var mı (test ve güvenlik): her tür kendi koşuluyla metinlerde yeniden kontrol edilir */
export function boslukGecerli(b: Bosluk, km: KaynakMetin[]): boolean {
  const tum = km.map(k => k.metin).join('\n');
  switch (b.tur) {
    case 'ne-zaman': return !ZAMAN_RE.test(tum);
    case 'nerede': return !sehirleriBul(tum).length && !/\b(ilçe|mahalle|köy|cadde|sokak|bölge)\w*/i.test(tum);
    case 'neden': return !NEDEN_RE.test(tum);
    case 'maliyet': return PROJE_RE.test(tum) && !PARA_RE.test(tum);
    case 'kaynaksiz-sayi': {
      const k = km.find(x => x.kaynak === b.kanit?.kaynak);
      return !!k && !!b.kanit && birebir(b.kanit.metin, k.metin);
    }
    case 'celiski': return farkliSayilar(km).length > 0;
    case 'takip': return !!b.kanit && !!b.onceki?.url;
  }
}

/** Model yoksa ya da cümlesi kurallara uymazsa: boşluğun kendi sorusu */
export function sablonSoru(b: Bosluk): string {
  switch (b.tur) {
    case 'ne-zaman': return 'Bu olay tam olarak ne zaman yaşandı?';
    case 'nerede': return 'Olay tam olarak nerede yaşandı?';
    case 'neden': return 'Bunun nedeni ne olarak açıklandı?';
    case 'maliyet': return 'Bunun maliyeti ne kadar ve kim karşılayacak?';
    case 'kaynaksiz-sayi': return `${/"([^"]+)"/.exec(b.not)?.[1] ?? 'Verilen'} sayısı hangi kaynağa dayanıyor?`;
    case 'celiski': return 'Kaynaklar farklı sayılar veriyor; resmî olarak açıklanan sayı hangisi?';
    case 'takip': return `${b.onceki?.tarih ?? 'Önceki'} tarihli haberde söz edilen adımda son durum ne?`;
  }
}

// ———————————————————— Model ————————————————————

/** Model çağrısı (testte sahte cevapla değiştirilir) */
export const analysisDeps = {
  async chat(prompt: string): Promise<string> {
    if (MOCK) return '';
    const r = await routellm<ChatResponse>('/chat/completions', { model: CHAT_MODEL, messages: [{ role: 'user', content: prompt }] });
    return String(r.choices?.[0]?.message?.content ?? '');
  },
};

function jsonAl(s: string): any {
  const m = /\{[\s\S]*\}/.exec(s.replace(/```json|```/g, ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function istem(baslik: string, km: KaynakMetin[], bos: Bosluk[]): string {
  const metinler = km.map(k => `### ${k.kaynak}\n${k.metin.slice(0, 1800)}`).join('\n\n');
  const boslukListesi = bos.map(b => `- ${b.id} (${b.tur}): ${b.not}`).join('\n') || '- (yok)';
  return `Aşağıda aynı olayı anlatan ${km.length} haber kaynağının metinleri var. Olay: "${baslik}".
Görevin TARAFSIZ bir karşılaştırma. Yorum yapma, taraf tutma, hiçbir kaynağı ya da kişiyi değerlendirme.
"Propaganda", "yalan", "manipülasyon", "taraflı", "doğru/yanlış söylüyor" gibi ifadeler YASAK.
Kişiler hakkında suçlama ya da niyet okuması yok. Metinlerde olmayan bilgi ekleme.
Her "alinti" ilgili kaynağın metninden BİREBİR kopyalanmış, 8-200 karakterlik bir parça olmalı (değiştirme, kısaltma).

Yalnızca şu JSON'u döndür:
{
 "ozet": ["olayı anlatan 2-3 kısa, tarafsız cümle; yalnızca metinlerdeki olgular"],
 "ortak": [{"bilgi": "tüm kaynaklarda geçen olgu (kısa)", "alintilar": {"Kaynak adı": "birebir alıntı"}}],
 "vurgu": [{"konu": "aynı olgunun farklı ifade edildiği konu (kısa)", "alintilar": {"Kaynak A": "birebir", "Kaynak B": "birebir"}}],
 "bazilari": [{"bilgi": "yalnızca bazı kaynaklarda geçen bilgi (kısa)", "anahtar": "o bilgiyi gösteren 1-3 kelime, metinde geçtiği gibi", "alintilar": {"Kaynak": "birebir"}}],
 "iddialar": [{"kaynak": "Kaynak", "alinti": "birebir", "tur": "sayi|oran|tarih|ilk|rekor|degisim", "sorgu": SORGU}],
 "sorular": [{"bosluk": "b1", "soru": "tarafsız, cevaplanabilir, ima içermeyen soru?"}]
}
"ortak" en fazla 3, "vurgu" en fazla 3, "bazilari" en fazla 3, "iddialar" en fazla 4, "sorular" en fazla 3 madde.
İddialar yalnızca doğrulanabilir olgusal ifadeler (sayı, oran, tarih, "ilk kez", "en yüksek", "arttı/azaldı"); görüşler değil.
SORGU şunlardan biri (sayılar alıntıda geçtiği gibi):
 {"tip":"kur","doviz":"USD|EUR|GBP","deger":41.2,"tarih":"YYYY-AA-GG"}
 {"tip":"deprem","il":"İzmir","buyukluk":4.6,"tarih":"YYYY-AA-GG"}
 {"tip":"makro","gosterge":"enflasyon|buyume|issizlik|nufus","yil":2025,"deger":44.4,"donem":"yillik|aylik|ceyrek"}
 {"tip":"hava","il":"Ankara","sicaklik":38,"tarih":"YYYY-AA-GG"}
 {"tip":"resmi_gazete","tarih":"YYYY-AA-GG","anahtar":"karar ya da yönetmeliğin adı"}
 {"tip":"yok"}
Sorular yalnızca şu boşluklardan çıksın; her soru bir boşluk kimliğine bağlı olsun:
${boslukListesi}

${metinler}`;
}

// ———————————————————— Doğrulama ————————————————————

const sayilar = (s: string) => [...s.matchAll(/\d+(?:[.,]\d+)*/g)].map(m => m[0].replace(/\./g, '').replace(',', '.'));
/** Jarvis cümlesindeki her sayı ve şehir kaynak metinlerde geçmeli; değerlendirici dil olmamalı */
export function cumleGecerli(c: string, km: KaynakMetin[]): boolean {
  if (!c || c.length > 260 || !temizMi(c)) return false;
  const tum = km.map(k => k.metin).join('\n');
  const tumSayi = new Set(sayilar(tum));
  if (!sayilar(c).every(n => tumSayi.has(n))) return false;
  const tumIl = new Set(sehirleriBul(tum));
  return sehirleriBul(c).every(il => tumIl.has(il));
}

function alintilar(x: unknown, km: KaynakMetin[]): Alinti[] {
  if (!x || typeof x !== 'object') return [];
  const out: Alinti[] = [];
  for (const [kaynak, metin] of Object.entries(x as Record<string, unknown>)) {
    const k = km.find(y => y.kaynak === kaynak);
    if (!k || typeof metin !== 'string' || metin.length > 260 || !birebir(metin, k.metin)) continue;
    out.push({ kaynak, metin: metin.trim() });
  }
  return out;
}

/** Model önerisini kurallarla süz */
export function suz(ham: any, km: KaynakMetin[], bos: Bosluk[]) {
  const ozet = (Array.isArray(ham?.ozet) ? ham.ozet : []).filter((c: unknown): c is string => typeof c === 'string' && cumleGecerli(c, km)).slice(0, 3);
  const maddeler: KarsilastirmaMadde[] = [];
  for (const o of (Array.isArray(ham?.ortak) ? ham.ortak : []).slice(0, 3)) {
    const a = alintilar(o?.alintilar, km);
    // Ortak bilgi: en az iki kaynakta ve kaynakların çoğunda alıntıyla
    if (typeof o?.bilgi !== 'string' || !cumleGecerli(o.bilgi, km) || a.length < Math.max(2, Math.ceil(km.length * 0.6))) continue;
    maddeler.push({ tur: 'ortak', baslik: o.bilgi, alintilar: a });
  }
  for (const v of (Array.isArray(ham?.vurgu) ? ham.vurgu : []).slice(0, 3)) {
    const a = alintilar(v?.alintilar, km);
    if (typeof v?.konu !== 'string' || !cumleGecerli(v.konu, km) || a.length < 2) continue;
    maddeler.push({ tur: 'vurgu', baslik: v.konu, alintilar: a });
  }
  for (const b of (Array.isArray(ham?.bazilari) ? ham.bazilari : []).slice(0, 3)) {
    const a = alintilar(b?.alintilar, km);
    const an = typeof b?.anahtar === 'string' ? sade(b.anahtar) : '';
    if (typeof b?.bilgi !== 'string' || !cumleGecerli(b.bilgi, km) || !a.length || an.length < 3) continue;
    // Anahtar kodla kontrol: geçtiği ve geçmediği kaynaklar metinden
    const gecen = km.filter(k => sade(k.metin).includes(an)).map(k => k.kaynak);
    const gecmeyen = km.filter(k => !gecen.includes(k.kaynak)).map(k => k.kaynak);
    if (!gecen.length || !gecmeyen.length) continue;
    maddeler.push({ tur: 'bazilari', baslik: b.bilgi, alintilar: a.filter(x => gecen.includes(x.kaynak)), gecen, gecmeyen });
  }
  const iddialar: HamIddia[] = [];
  for (const i of (Array.isArray(ham?.iddialar) ? ham.iddialar : []).slice(0, 4)) {
    const k = km.find(y => y.kaynak === i?.kaynak);
    if (!k || typeof i?.alinti !== 'string' || !birebir(i.alinti, k.metin) || typeof i?.sorgu !== 'object' || !i.sorgu) continue;
    iddialar.push({ kaynak: k.kaynak, alinti: i.alinti.trim(), tur: String(i.tur || 'sayi'), sorgu: i.sorgu });
  }
  const sorular: Soru[] = [];
  for (const s of (Array.isArray(ham?.sorular) ? ham.sorular : [])) {
    const b = bos.find(x => x.id === s?.bosluk);
    if (!b || sorular.some(x => x.bosluk === b.tur) || typeof s?.soru !== 'string') continue;
    const soru = s.soru.trim();
    if (!soru.endsWith('?') || soru.length > 160 || IMA.test(soru) || !cumleGecerli(soru, km)) continue;
    sorular.push({ soru, bosluk: b.tur, not: b.not, kanit: b.kanit });
    if (sorular.length >= 3) break;
  }
  return { ozet, maddeler, iddialar, sorular };
}

// ———————————————————— Anlatım (kodla, yorumsuz) ————————————————————

const SAYI_AD = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz', 'On'];
export function anlatim(km: KaynakMetin[], maddeler: KarsilastirmaMadde[]): string[] {
  const n = km.length;
  const out = [`${SAYI_AD[n] ?? n} kaynak bu olayı veriyor.`];
  const ortak = maddeler.find(m => m.tur === 'ortak');
  if (ortak) out.push(`Ortak olan bilgi: ${ortak.baslik.replace(/[.]$/, '')}.`);
  const sayi = maddeler.find(m => m.tur === 'sayilar');
  const baz = maddeler.find(m => m.tur === 'bazilari');
  if (sayi) out.push(`${sayi.baslik.replace(/[.]$/, '')}.`);
  else if (baz) out.push(`${baz.baslik.replace(/[.]$/, '')} bilgisi yalnızca ${baz.gecen!.join(', ')} haberinde geçiyor.`);
  else if (maddeler.some(m => m.tur === 'vurgu')) out.push('Bazı olgular kaynaklarda farklı ifadelerle anlatılıyor.');
  return out.filter(temizMi).slice(0, 3);
}

// ———————————————————— Analiz ————————————————————

const surecte = new Map<string, Promise<Analiz>>();

/** Kümenin analizi: tam metinler, kodla bulunanlar, tek model çağrısı, süzme. Arşive kaydedilir; yeniden açılınca hazır. */
export function analizEt(k: Kume): Promise<Analiz> {
  const kayitli = arsivKume(k.id)?.analiz as Analiz | undefined;
  if (kayitli?.detay && kayitli.surum === ANALIZ_SURUM && kayitli.detay.kaynaklar.length >= k.haberler.length) return Promise.resolve(kayitli);
  let p = surecte.get(k.id);
  if (p) return p;
  p = (async () => {
    const km = await kaynakMetinleri(k);
    const onceki = oncekiler(k.kokler, k.id);
    const bos = bosluklar(km, k.kategori, onceki);
    let ham: any = null;
    try { ham = jsonAl(await analysisDeps.chat(istem(k.baslik, km, bos))); } catch (e) { console.warn('Haber analizi (model):', e instanceof Error ? e.message : e); }
    const s = suz(ham, km, bos);
    const sayi = farkliSayilar(km);
    const maddeler = [...s.maddeler, ...sayi.filter(x => !s.maddeler.some(m => m.tur === 'sayilar' && m.baslik === x.baslik))];
    // Model sorusu olmayan boşluklar: kendi soruları (en fazla 3)
    const sorular = [...s.sorular];
    for (const b of bos) {
      if (sorular.length >= 3) break;
      if (!sorular.some(x => x.bosluk === b.tur)) sorular.push({ soru: sablonSoru(b), bosluk: b.tur, not: b.not, kanit: b.kanit });
    }
    const tum = km.map(x => x.metin).join('\n');
    const enUzun = [...km].sort((a, b) => b.metin.length - a.metin.length)[0];
    const detay: Detay = {
      id: k.id, baslik: k.baslik, kategori: k.kategori,
      kaynaklar: km,
      ozet: s.ozet.length ? s.ozet : [`${km.length} kaynak bu olayı veriyor.`, `${enUzun.kaynak}: "${enUzun.ilkCumle}"`],
      sayilar: tekilSayilar(km),
      sehirler: sehirleriBul(tum),
      zaman: [...km].sort((a, b) => a.saat.localeCompare(b.saat)).map(x => ({ saat: x.saat, metin: `${x.kaynak} verdi` })),
      onceki,
    };
    const a: Analiz = { detay, karsilastirma: { maddeler, anlatim: anlatim(km, maddeler) }, sorular, iddialar: s.iddialar, model: !!ham, at: new Date().toISOString(), surum: ANALIZ_SURUM };
    analizKaydet(k.id, a, Object.fromEntries(km.map(x => [x.url, x.tam ? x.metin.slice(x.baslik.length + 2) : null])));
    return a;
  })().finally(() => surecte.delete(k.id));
  surecte.set(k.id, p);
  return p;
}

/** Detaydaki "önemli sayılar": her anahtardan bir tane, en çok kaynakta geçenler önce */
function tekilSayilar(km: KaynakMetin[]): Sayi[] {
  const say = new Map<string, { s: Sayi; n: number }>();
  for (const k of km) for (const x of sayilariBul(k.metin)) {
    if (x.deger < 2 && x.birim !== 'yuzde') continue;
    const key = `${x.birim}|${x.deger}`;
    const v = say.get(key);
    if (v) v.n++;
    else say.set(key, { s: { deger: x.birim === 'yuzde' ? `%${x.ham.replace(/^(%|yüzde\s*)/i, '')}` : x.ham, baglam: pencere(x.cumle, x.ham, 140), kaynak: k.kaynak }, n: 1 });
  }
  return [...say.values()].sort((a, b) => b.n - a.n).slice(0, 4).map(v => v.s);
}
