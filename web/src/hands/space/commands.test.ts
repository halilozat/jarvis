// Uzay Modu sesli komut eşleştirici testi. Çalıştır: npm run test:uzay
// Her komut için ekli, eksiz ve STT hatalı yazımlar.
import { matchSpaceCommand, type SpaceCmd } from './commands';

const CASES: [string, SpaceCmd | null][] = [
  // Mod
  ['Jarvis, uzay modunu aç', { tip: 'mod', ac: true }],
  ['uzay modu aç', { tip: 'mod', ac: true }],
  ['carvis uzay modunu başlat', { tip: 'mod', ac: true }],
  ['Jarvis uzay modunu kapat', { tip: 'mod', ac: false }],
  ['uzay modundan çık', { tip: 'mod', ac: false }],
  ['Uzay modunu kapa', { tip: 'mod', ac: false }],
  // Gezegen getir
  ['Jarvis, Satürn getir', { tip: 'gezegen', govde: 'saturn' }],
  ["Satürn'ü göster", { tip: 'gezegen', govde: 'saturn' }],
  ['saturnu cagir', { tip: 'gezegen', govde: 'saturn' }],
  ["Jarvis Dünya'yı getir", { tip: 'gezegen', govde: 'dunya' }],
  ['dünyayı göster', { tip: 'gezegen', govde: 'dunya' }],
  ['DUNYA GETIR', { tip: 'gezegen', govde: 'dunya' }],
  ["Mars'ı çağır", { tip: 'gezegen', govde: 'mars' }],
  ['marsa çevir', { tip: 'gezegen', govde: 'mars' }],
  ['jarvis mars', { tip: 'gezegen', govde: 'mars' }],
  ["Jüpiter'i getir", { tip: 'gezegen', govde: 'jupiter' }],
  ['jupiter göster', { tip: 'gezegen', govde: 'jupiter' }],
  ['yupiteri getir', { tip: 'gezegen', govde: 'jupiter' }],
  ['Neptün', { tip: 'gezegen', govde: 'neptun' }],
  ["neptünü göster", { tip: 'gezegen', govde: 'neptun' }],
  ['neptun getir', { tip: 'gezegen', govde: 'neptun' }],
  ["Uranüs'ü getir", { tip: 'gezegen', govde: 'uranus' }],
  ['uranusu göster', { tip: 'gezegen', govde: 'uranus' }],
  ['uranüs çağır', { tip: 'gezegen', govde: 'uranus' }],
  ["Merkür'ü getir", { tip: 'gezegen', govde: 'merkur' }],
  ['merkuru goster', { tip: 'gezegen', govde: 'merkur' }],
  ['merkür çağır', { tip: 'gezegen', govde: 'merkur' }],
  ["Venüs'ü getir", { tip: 'gezegen', govde: 'venus' }],
  ['venusu goster', { tip: 'gezegen', govde: 'venus' }],
  ['venüs çağır', { tip: 'gezegen', govde: 'venus' }],
  ["Ay'ı getir", { tip: 'gezegen', govde: 'ay' }],
  ['ayı göster', { tip: 'gezegen', govde: 'ay' }],
  ['jarvis aya çevir', { tip: 'gezegen', govde: 'ay' }],
  ["Güneş'i getir", { tip: 'gezegen', govde: 'gunes' }],
  ['güneşi göster', { tip: 'gezegen', govde: 'gunes' }],
  ['gunes cagir', { tip: 'gezegen', govde: 'gunes' }],
  // Güneş sistemi
  ['Jarvis, güneş sistemini göster', { tip: 'sistem' }],
  ['güneş sistemi', { tip: 'sistem' }],
  ['gunes sistemini getir', { tip: 'sistem' }],
  // Gerçek boyutlar
  ['Jarvis, gerçek boyutlarda göster', { tip: 'olcek' }],
  ['gerçek boyutları göster', { tip: 'olcek' }],
  ['gercek olcekte goster', { tip: 'olcek' }],
  // Kara delik
  ['Jarvis, kara delik oluştur', { tip: 'karadelik' }],
  ['karadelik aç', { tip: 'karadelik' }],
  ['bir kara delik yap', { tip: 'karadelik' }],
  // Theia
  ["Jarvis, Theia'yı fırlat", { tip: 'theia' }],
  ['teyayı fırlat', { tip: 'theia' }],
  ['tea yı at', { tip: 'theia' }],
  ['gezegenleri çarpıştır', { tip: 'theia' }],
  ['çarpıştır', { tip: 'theia' }],
  // Kayan yıldız
  ['Jarvis, kayan yıldız', { tip: 'kayan' }],
  ['bir kayan yıldız göster', { tip: 'kayan' }],
  ['kayanyıldız', { tip: 'kayan' }],
  // Bilgi
  ['Jarvis, bana Satürn hakkında bir şey söyle', { tip: 'bilgi', konu: 'saturn' }],
  ["Mars'ın hakkında ne biliyorsun", { tip: 'bilgi', konu: 'mars' }],
  ['bana jupiter hakkinda bir sey soyle', { tip: 'bilgi', konu: 'jupiter' }],
  ['ay hakkında bilgi ver', { tip: 'bilgi', konu: 'ay' }],
  ['kara delik hakkında bir şey söyle', { tip: 'bilgi', konu: 'karadelik' }],
  // Arka plan
  ['Jarvis, arka planı uzaya çevir', { tip: 'arkaplan', tam: true }],
  ['arkaplanı uzay yap', { tip: 'arkaplan', tam: true }],
  ['arka plan uzay olsun', { tip: 'arkaplan', tam: true }],
  ['Jarvis, odayı geri getir', { tip: 'arkaplan', tam: false }],
  ['odayı göster', { tip: 'arkaplan', tam: false }],
  ['odaya dön', { tip: 'arkaplan', tam: false }],
  // Temizle
  ['Jarvis, temizle', { tip: 'temizle' }],
  ['hepsini dağıt', { tip: 'temizle' }],
  ['gezegenleri temizle', { tip: 'temizle' }],
  // Komut olmayanlar (normal Jarvis'e gitmeli)
  ['Jarvis bu ay ne yapalım', null],
  ['hava nasıl', null],
  ['dünya kupası ne zaman', null],
  ['bugün güneşli mi', null],
  ['ayın kaçı bugün', null],
];

let fail = 0;
for (const [text, want] of CASES) {
  const got = matchSpaceCommand(text);
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail++;
    console.log(`✗ "${text}" → ${JSON.stringify(got)} (beklenen ${JSON.stringify(want)})`);
  }
}
console.log(`${CASES.length - fail}/${CASES.length} uzay komutu doğru eşleşti`);
if (fail) throw new Error(`${fail} komut testi başarısız`);
