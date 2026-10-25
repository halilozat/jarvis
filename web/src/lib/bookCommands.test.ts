// Açık kitap sesli komutları testi. Çalıştır: npm run test:kitap
import { matchBookChat, matchBookCommand, type KitapKomut, type SohbetKomut } from './bookCommands';

const CASES: [string, KitapKomut | null][] = [
  // Alıntı
  ['Jarvis, bu kitaba şu alıntıyı ekle: Hayat, insanın başına gelenlerden ibarettir.', { tip: 'alinti', metin: 'Hayat, insanın başına gelenlerden ibarettir' }],
  ['alıntı ekle: Bilmek, sevmektir', { tip: 'alinti', metin: 'Bilmek, sevmektir' }],
  ['bu kitaba alıntı ekle "Her şey bir ilk adımla başlar"', { tip: 'alinti', metin: 'Her şey bir ilk adımla başlar' }],
  ['alıntılara ekle Selim kendini anlatamıyordu', { tip: 'alinti', metin: 'Selim kendini anlatamıyordu' }],
  ['Jarvis şu alıntıyı kaydet: Okudum ve anladım.', { tip: 'alinti', metin: 'Okudum ve anladım' }],
  // Not
  ['Jarvis, bu kitaba şu notu ekle: ikinci bölüm çok yavaş', { tip: 'not', metin: 'ikinci bölüm çok yavaş' }],
  ['not al: Selim Işık karakteri ilginç', { tip: 'not', metin: 'Selim Işık karakteri ilginç' }],
  ['bu kitaba bir not ekle tekrar okunacak', { tip: 'not', metin: 'tekrar okunacak' }],
  ['şunu not al bitirdim ama sonu açık', { tip: 'not', metin: 'bitirdim ama sonu açık' }],
  ['notlara ekle: karakterler çok gerçekçi', { tip: 'not', metin: 'karakterler çok gerçekçi' }],
  ['Jarvis not ekle videoda gösterilecek', { tip: 'not', metin: 'videoda gösterilecek' }],
  // Durum: okundu
  ['Jarvis, bu kitabı okundu listesine ekle', { tip: 'durum', durum: 'bitti' }],
  ['okundu olarak işaretle', { tip: 'durum', durum: 'bitti' }],
  ['bu kitabı bitirdim', { tip: 'durum', durum: 'bitti' }],
  ['okudum', { tip: 'durum', durum: 'bitti' }],
  ['okuduklarıma ekle', { tip: 'durum', durum: 'bitti' }],
  // Durum: okunuyor
  ['şu an okuyorum', { tip: 'durum', durum: 'okunuyor' }],
  ['bu kitabı okuyorum', { tip: 'durum', durum: 'okunuyor' }],
  ['okumaya başladım', { tip: 'durum', durum: 'okunuyor' }],
  // Durum: okunacak
  ['okunacaklara ekle', { tip: 'durum', durum: 'okunacak' }],
  ['bunu okunacak listesine ekle', { tip: 'durum', durum: 'okunacak' }],
  ['okuma listeme ekle', { tip: 'durum', durum: 'okunacak' }],
  ['sonra okuyacağım', { tip: 'durum', durum: 'okunacak' }],
  // Sayfa
  ['120. sayfadayım', { tip: 'sayfa', sayfa: 120 }],
  ['Jarvis 45. sayfaya geldim', { tip: 'sayfa', sayfa: 45 }],
  ['sayfa 88deyim', { tip: 'sayfa', sayfa: 88 }],
  ['200. sayfadayım, toplam 724 sayfa', { tip: 'sayfa', sayfa: 200, toplam: 724 }],
  // Ad ve özet
  ['Jarvis, bu kitabın adı Davranış', { tip: 'ad', ad: 'Davranış' }],
  ['bunu özetle', { tip: 'ozetle' }],
  ['kitabı anlat', { tip: 'ozetle' }],
  // Komut değil
  ['bu kitabın adı ne?', null],
  ['bugün hava nasıl', null],
  ['sayfayı çevir', null],
  ['okumak istiyorum ama vaktim yok', null],
];

const SOHBET: [string, SohbetKomut | null][] = [
  ['Jarvis, Tutunamayanlar hakkında sohbet edelim', { tip: 'basla', kitap: 'Tutunamayanlar' }],
  ['Saatleri Ayarlama Enstitüsü kitabı hakkında konuşalım', { tip: 'basla', kitap: 'Saatleri Ayarlama Enstitüsü' }],
  ['okuduğum kitap hakkında konuşalım', { tip: 'basla', kitap: null }],
  ['Jarvis seninle şu an okuduğum kitap hakkında biraz sohbet etmek istiyorum', { tip: 'basla', kitap: null }],
  ['bu kitap hakkında konuşalım', { tip: 'basla', kitap: null }],
  ['kitap sohbetini başlat', { tip: 'basla', kitap: null }],
  ['Dune üzerine konuşalım', { tip: 'basla', kitap: 'Dune' }],
  ['sohbeti bitir', { tip: 'bitir' }],
  ['kitap sohbetini kapat', { tip: 'bitir' }],
  ['tamam sohbeti bitirelim', { tip: 'bitir' }],
  ['deprem hakkında ne var', null],
  ['bana bir kitap öner', null],
];

let fail = 0;
for (const [text, want] of SOHBET) {
  const got = matchBookChat(text);
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ sohbet "${text}" → ${JSON.stringify(got)} (beklenen ${JSON.stringify(want)})`); }
}
for (const [text, want] of CASES) {
  const got = matchBookCommand(text);
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`✗ "${text}" → ${JSON.stringify(got)} (beklenen ${JSON.stringify(want)})`); }
}
console.log(`${CASES.length + SOHBET.length - fail}/${CASES.length + SOHBET.length} kitap komutu doğru eşleşti`);
if (fail) throw new Error(`${fail} kitap komutu testi başarısız`);
