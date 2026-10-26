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
  ['Jarvis, haber ajansını aç', { tip: 'haber', ac: true }],
  ['haber ajansı', { tip: 'haber', ac: true }],
  ['haber ajansını kapat', { tip: 'haber', ac: false }],
  ['Anadolu Ajansı ne diyor', null],
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
  ['asgari ücret hakkında neler var', { tip: 'konu', q: 'asgari ücret' }],
  ['merkez bankası ile ilgili ne var', { tip: 'konu', q: 'merkez bankası' }],
  ['peki seçim hakkında ne diyorlar', { tip: 'konu', q: 'seçim' }],
  // Anahtar kelimeyle haber getir (her yerden)
  ['Jarvis, Gazze hakkında haber getir', { tip: 'ara', q: 'Gazze' }],
  ['bana İran haberlerini bul', { tip: 'ara', q: 'İran' }],
  ['internette deprem haberlerini tara', { tip: 'ara', q: 'deprem' }],
  ['asgari ücret ile ilgili haberleri getir', { tip: 'ara', q: 'asgari ücret' }],
  ['Jarvis, yapay zeka hakkında son haberleri bul', { tip: 'ara', q: 'yapay zeka' }],
  ['internette Ümit Kocasakal ara', { tip: 'ara', q: 'Ümit Kocasakal' }],
  ['haber ara Fenerbahçe', { tip: 'ara', q: 'Fenerbahçe' }],
  ['ekonomi haberlerini bul', { tip: 'kategori', kategori: 'ekonomi' }],
  // Dünya basını
  ['Jarvis, dünya basını bunu nasıl verdi?', { tip: 'dunya' }],
  ['yabancı basında ne yazıyor', { tip: 'dunya' }],
  ['dünya bunu nasıl gördü', { tip: 'dunya' }],
  ['yabancı basın ne diyor?', { tip: 'dunya' }],
  ['Jarvis, dış basın ne yazıyor', { tip: 'dunya' }],
  ['basın ne diyor', { tip: 'basin' }],
  ['son haberleri getir', null],
  // Haber merkezi komutları
  ['Jarvis, canlı yayına geç', { tip: 'yayin', ac: true }],
  ['yayına gir', { tip: 'yayin', ac: true }],
  ['ana haber bültenini başlat', { tip: 'yayin', ac: true }],
  ['yayını bitir', { tip: 'yayin', ac: false }],
  ['bülteni kapat', { tip: 'yayin', ac: false }],
  ['Jarvis, son dakika!', { tip: 'sonDakika' }],
  ['son dakika ne var', { tip: 'sonDakika' }],
  ['manşetleri ver', { tip: 'mansetler' }],
  ['günün manşetleri', { tip: 'mansetler' }],
  ['Jarvis, dünyada bugün ne oldu?', { tip: 'dunyaBugun' }],
  ['dünyada neler oluyor', { tip: 'dunyaBugun' }],
  ['basın özetini ver', { tip: 'basin' }],
  ['gazeteler ne yazıyor', { tip: 'basin' }],
  ['bunu takibe al', { tip: 'takip', ac: true }],
  ['Jarvis bu olayı takip et', { tip: 'takip', ac: true }],
  ['gelişme olursa haber ver', { tip: 'takip', ac: true }],
  ['takibi bırak', { tip: 'takip', ac: false }],
  ['ekranı böl', { tip: 'duvar' }],
  ['haber duvarını aç', { tip: 'duvar' }],
  ['3 numarayı aç', { tip: 'numara', n: 3 }],
  ['üçüncüyü aç', { tip: 'numara', n: 3 }],
  ['yedi numaralı haberi aç', { tip: 'numara', n: 7 }],
  ['beşi aç', null],
  ['bugünün haberlerini bul', null],
  ['bana bugünkü haberleri getir', null],
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
