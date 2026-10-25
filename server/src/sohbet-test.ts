// Konuşmanın devamı: ses tanıma bağlamı ve yanlış duyulmuş hitap. Çalıştır: npm run test:sohbet
import assert from 'node:assert/strict';
import { hitapDuzelt, sttIstemi } from './stt.js';

let ok = 0;
const t = (ad: string, f: () => void) => { f(); ok++; console.log(`✓ ${ad}`); };

t('yanlış duyulmuş hitap başta "Jarvis" olur', () => {
  assert.equal(hitapDuzelt('Cervis suç ve ceza neden ağır geldi?'), 'Jarvis suç ve ceza neden ağır geldi?');
  assert.equal(hitapDuzelt('Jarus, bugün kitap okumadım.'), 'Jarvis, bugün kitap okumadım.');
  assert.equal(hitapDuzelt('hey jervis saat kaç'), 'hey Jarvis saat kaç');
  assert.equal(hitapDuzelt('Carvis'), 'Jarvis');
});
t('gerçek kelimeye ve cümle içine dokunulmaz', () => {
  assert.equal(hitapDuzelt('Ceviz kaç kalori?'), 'Ceviz kaç kalori?');
  assert.equal(hitapDuzelt('Charlie Chaplin kimdir'), 'Charlie Chaplin kimdir');
  assert.equal(hitapDuzelt('dün cervis dedim'), 'dün cervis dedim');
  assert.equal(hitapDuzelt('Jarusalem'), 'Jarusalem');
});
t('ses tanıma istemi: Jarvis adı ve son mesajlar (en çok 4, kısaltılmış)', () => {
  const p = sttIstemi(['a', 'b', 'Suç ve Ceza neden ağır geldi?', 'Suç ve Ceza bir vicdan hücresidir efendim.', 'x'.repeat(500)]);
  assert.ok(p.includes('"Jarvis"'));
  assert.ok(p.includes('- Suç ve Ceza neden ağır geldi?'));
  assert.ok(!p.includes('- a\n'), 'en eski mesaj düşer');
  assert.ok(!p.includes('x'.repeat(221)), 'uzun mesaj kısalır');
  assert.ok(!sttIstemi([]).includes('son mesajları'), 'bağlam yoksa liste yok');
});

console.log(`\n${ok} test geçti.`);
