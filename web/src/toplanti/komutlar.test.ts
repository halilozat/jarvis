// Toplantı Odası komut testleri. Çalıştır: npx tsx web/src/toplanti/komutlar.test.ts
import { toplantiKomutu } from './komutlar';
let fail = 0, n = 0;
const ok = (ad: string, k: boolean, a = '') => { n++; if (!k) fail++; console.log(`${k ? '✓' : '✗'} ${ad}${a ? ` · ${a}` : ''}`); };
const t = (s: string, acik = false) => JSON.stringify(toplantiKomutu(s, acik));
ok('toplantı başlat', t('Toplantı başlat') === '{"tip":"ac"}' && t('Jarvis, toplantı odasını aç') === '{"tip":"ac"}');
ok('tartışsın: konu', t('Jarvis ve Friday tartışsın: yeni video konusu ne olsun?') === '{"tip":"tartis","konu":"yeni video konusu ne olsun?"}', t('Jarvis ve Friday tartışsın: yeni video konusu ne olsun?'));
ok('ikiniz tartışın', toplantiKomutu('İkiniz tartışın: yurt dışından telefon alayım mı?')?.tip === 'tartis');
ok('toplantıyı bitir (yalnızca açıkken)', t('Toplantıyı bitir', true) === '{"tip":"bitir"}' && toplantiKomutu('Toplantıyı bitir') === null);
ok('dur (açıkken)', t('Bekle', true) === '{"tip":"dur"}' && toplantiKomutu('Bekle') === null);
ok('alakasız', toplantiKomutu('Saat kaç?') === null && toplantiKomutu('Işığı aç') === null && toplantiKomutu('tartışma programı ne zaman') === null);
console.log(`${n - fail}/${n} toplantı komut testi geçti`);
if (fail) process.exit(1);
