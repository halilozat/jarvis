// Haber Modu sesli komut eşleştirici testi. Çalıştır: npm run test:haber
import { matchNewsCommand, type HaberCmd } from './commands';

const CASES: [string, HaberCmd | null][] = [
  // Mod
  ['Jarvis, haber modunu aç', { tip: 'haber', ac: true }],
  ['haber modu aç', { tip: 'haber', ac: true }],
  ['carvis haber modunu başlat', { tip: 'haber', ac: true }],
  ['Jarvis haber modunu kapat', { tip: 'haber', ac: false }],
  ['haber modundan çık', { tip: 'haber', ac: false }],
  ['haber merkezini aç', { tip: 'haber', ac: true }],
  ['Jarvis haber merkezi', { tip: 'haber', ac: true }],
  // Sabah özeti
  ['Jarvis, günümü özetle', { tip: 'sabah' }],
  ['günümü özetler misin', { tip: 'sabah' }],
  ['sabah özetini göster', { tip: 'sabah' }],
  ['günün özeti', { tip: 'sabah' }],
  // Kategori
  ['Jarvis, ekonomi haberlerini göster', { tip: 'kategori', kategori: 'ekonomi' }],
  ['spor haberlerine geç', { tip: 'kategori', kategori: 'spor' }],
  ['dünya haberlerini getir', { tip: 'kategori', kategori: 'dunya' }],
  ['teknoloji haberleri neler', { tip: 'kategori', kategori: 'teknoloji' }],
  ['bilim haberlerini aç', { tip: 'kategori', kategori: 'bilim' }],
  ['gündem haberlerini göster', { tip: 'kategori', kategori: 'gundem' }],
  ['ekonomi hakkında ne var', { tip: 'kategori', kategori: 'ekonomi' }],
  // Konu
  ['Jarvis, deprem hakkında ne var?', { tip: 'konu', q: 'deprem' }],
  ['asgari ücret hakkında neler var', { tip: 'konu', q: 'asgari ucret' }],
  ['merkez bankası ile ilgili ne var', { tip: 'konu', q: 'merkez bankasi' }],
  ['peki seçim hakkında ne diyorlar', { tip: 'konu', q: 'secim' }],
  // Gezinme
  ['sonraki', { tip: 'sonraki' }],
  ['Jarvis sonraki haber', { tip: 'sonraki' }],
  ['sıradaki haber', { tip: 'sonraki' }],
  ['önceki haber', { tip: 'onceki' }],
  ['önceki', { tip: 'onceki' }],
  ['geri dön', { tip: 'geri' }],
  ['kartı kapat', { tip: 'geri' }],
  // Özet ve detay
  ['Jarvis, bu haberi özetle', { tip: 'ozetle' }],
  ['bu haberi anlat', { tip: 'ozetle' }],
  ['detayını aç', { tip: 'detay' }],
  ['ayrıntılarını göster', { tip: 'detay' }],
  // Karşılaştırma
  ['Jarvis, bu haberi karşılaştır', { tip: 'karsilastir' }],
  ['bu haberi kimler nasıl verdi?', { tip: 'karsilastir' }],
  ['kimler nasıl yazdı', { tip: 'karsilastir' }],
  ['kaynakları kıyasla', { tip: 'karsilastir' }],
  // İddia kontrolü
  ['Jarvis, bunu kontrol et', { tip: 'kontrol' }],
  ['bu doğru mu?', { tip: 'kontrol' }],
  ['bu iddiayı doğrula', { tip: 'kontrol' }],
  ['gerçekten öyle mi', { tip: 'kontrol' }],
  // Sorulmamış sorular
  ['Jarvis, burada ne sorulmamış?', { tip: 'sorular' }],
  ['neler sorulmamış', { tip: 'sorular' }],
  ['kimsenin sormadığı sorular', { tip: 'sorular' }],
  // Komut olmayanlar
  ['bugün hava nasıl', null],
  ['Jarvis aydınlat beni', null],
  ['uzay modunu aç', null],
  ['dolar ne kadar', null],
];

let fail = 0;
for (const [text, want] of CASES) {
  const got = matchNewsCommand(text);
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail++;
    console.log(`✗ "${text}" → ${JSON.stringify(got)} (beklenen ${JSON.stringify(want)})`);
  }
}
console.log(`${CASES.length - fail}/${CASES.length} haber komutu doğru eşleşti`);
if (fail) throw new Error(`${fail} haber komutu testi başarısız`);
