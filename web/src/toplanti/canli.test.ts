// Toplantı Odası · VAD ve yankı testleri (sentetik ses enerjisi). Çalıştır: npx tsx web/src/toplanti/canli.test.ts
import { benzerlik, SozToplayici, Vad, yankiMi, type SrSonuc } from './vad';
let fail = 0, n = 0;
const ok = (ad: string, k: boolean, a = '') => { n++; if (!k) fail++; console.log(`${k ? '✓' : '✗'} ${ad}${a ? ` · ${a}` : ''}`); };
const ADIM = 30; // canli.ts 30 ms'de bir ölçer
/** rms(t) fonksiyonunu 0..sure ms boyunca VAD'den geçir */
function oynat(v: Vad, sure: number, rms: (t: number) => number, karakter: (t: number) => boolean, t0 = 0) {
  const olay: { t: number; r: any }[] = [];
  for (let t = t0; t <= t0 + sure; t += ADIM) { const r = v.adim(rms(t), t, karakter(t)); if (r) olay.push({ t, r }); }
  return olay;
}
// Ortam gürültüsü tabanı (oda: ~0.004) öğrenilsin
const v = new Vad(700);
oynat(v, 3000, () => 0.004 + Math.random() * 0.001, () => false);
// 1) Araya girme: karakter konuşurken kullanıcı 1000. ms'de konuşmaya başlar (konuşma rms ~0.12)
{
  const o = oynat(v, 2000, t => (t >= 4000 ? 0.12 : 0.03), () => true, 3000);
  const ag = o.find(x => x.r.tur === 'basladi' && x.r.araGirme);
  const gecikme = ag ? ag.t - 4000 : Infinity;
  ok('araya girme ≤ 200 ms', gecikme <= 200, `${gecikme} ms (ölçüm aralığı ${ADIM} ms)`);
}
// 2) Hoparlör sesi (yankı engellemeden kaçan, ~0.03 rms) karakter konuşurken tetiklemez
{
  const v2 = new Vad(700);
  oynat(v2, 3000, () => 0.004, () => false);
  const o = oynat(v2, 20_000, t => 0.02 + 0.015 * Math.abs(Math.sin(t / 90)), () => true, 3000);
  ok('hoparlör sesi yanlış tetiklemez', !o.some(x => x.r.tur === 'basladi'), `${o.length} olay`);
}
// 3) Kullanıcı susunca 700 ms sonra tur biter; sustu = sessizliğin başı
{
  const v3 = new Vad(700);
  oynat(v3, 3000, () => 0.004, () => false);
  const o = oynat(v3, 3000, t => (t >= 3500 && t < 5000 ? 0.1 : 0.004), () => false, 3000);
  const b = o.find(x => x.r.tur === 'bitti');
  ok('sessizlik 700 ms → tur biter', !!b && b.t - 5000 >= 690 && b.t - 5000 <= 760 && Math.abs(b.r.sustu - 5010) <= 30, b ? `${b.t - 5000} ms sonra · sustu ${b.r.sustu}` : 'yok');
}
// 4) Yankı süzgeci: tanıma son çalınan cümleyi yakaladıysa atılır
ok('yankı süzgeci', yankiMi('maaşı brüt konuşuyorsun ama yol öğle yemeği', ['Jarvis, maaşı brüt konuşuyorsun ama yol, öğle yemeği ve trafik net kazancı eritir.']) && !yankiMi('Friday sence hibrit nasıl olur', ['Jarvis, maaşı brüt konuşuyorsun.']), `${benzerlik('maaşı brüt konuşuyorsun ama yol öğle yemeği', 'Jarvis, maaşı brüt konuşuyorsun ama yol, öğle yemeği ve trafik net kazancı eritir.').toFixed(2)}`);
// 5) İlk söz: kullanıcı sustuğunda tanıma metni henüz yoksa atılmaz, gelince gönderilir
{
  const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));
  const sr = (...x: [string, boolean][]): SrSonuc[] => x.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f }) as unknown as SrSonuc);
  const giden: [string, number][] = [];
  const tp = new SozToplayici((m, s) => giden.push([m, s]), 120, 20);
  tp.sustu(1000); // VAD: sustu; metin yok
  await bekle(30);
  ok('metin gelmeden söz atılmaz', giden.length === 0 && tp.bekliyor);
  tp.sonuc(sr(['bu iş teklifini', false]));
  tp.sonuc(sr(['bu iş teklifini kabul edeyim mi', true]));
  ok('geç gelen kesin sonuç hemen gönderilir (susma anıyla)', giden.length === 1 && giden[0][0] === 'bu iş teklifini kabul edeyim mi' && giden[0][1] === 1000, JSON.stringify(giden));
  // Aynı tanıma oturumunda sonraki söz öncekini içermez
  tp.sonuc(sr(['bu iş teklifini kabul edeyim mi', true], ['maaş yüzde yirmi fazla', false]));
  tp.sustu(3000);
  ok('sonraki söz yalnızca yeni sonuçlar', giden.length === 2 && giden[1][0] === 'maaş yüzde yirmi fazla', JSON.stringify(giden[1]));
  // Kesin sonuç gelmezse ara sonuç kısa süre sonra gönderilir
  tp.sustu(5000);
  tp.sonuc(sr(['bu iş teklifini kabul edeyim mi', true], ['maaş yüzde yirmi fazla', true], ['ofise gitmem', false]));
  await bekle(40);
  ok('ara sonuç kısa beklemeyle gönderilir', giden.length === 3 && giden[2][0] === 'ofise gitmem', JSON.stringify(giden[2]));
  // Hiç metin gelmezse bekleme süresi sonunda boş söz gönderilmez
  tp.sustu(7000);
  await bekle(150);
  ok('hiç metin yoksa sessizce bırakılır', giden.length === 3 && !tp.bekliyor);
  // Karakter konuşurken gelen (hoparlör) metni sonraki söze karışmaz; tanıma yeniden başlarsa toplanan metin korunur
  const tp2 = new SozToplayici((m, s) => giden.push([m, s]), 120, 20);
  tp2.sonuc(sr(['maaşı brüt konuşuyorsun', true]), true);
  tp2.sonuc(sr(['maaşı brüt konuşuyorsun', true], ['Friday', false]));
  tp2.yenidenBasladi();
  tp2.sonuc(sr(['sence hibrit olur mu', true]));
  tp2.sustu(9000);
  ok('hoparlör metni atılır, yeniden başlatmada metin korunur', giden.length === 4 && giden[3][0] === 'Friday sence hibrit olur mu', JSON.stringify(giden[3]));
  // VAD konuşmayı hiç yakalamasa (sessiz mikrofon / gürültüde takılı) da söz kaybolmaz
  const tp3 = new SozToplayici((m, s) => giden.push([m, s]), 120, 20, 60, 100);
  tp3.sonuc(sr(['ışığı', false]), false, 100);
  tp3.sonuc(sr(['ışığı kapat', true]), false, 300);
  await bekle(30);
  ok('VAD olmadan: kesin sonuçtan hemen sonra gönderilmez (devam edebilir)', giden.length === 4);
  tp3.sonuc(sr(['ışığı kapat', true], ['ve perdeyi', false]), false, 330);
  await bekle(70);
  ok('VAD olmadan: konuşma sürerken gönderilmez', giden.length === 4);
  tp3.sonuc(sr(['ışığı kapat', true], ['ve perdeyi çek', true]), false, 400);
  await bekle(90);
  ok('VAD olmadan: tanıma kesinleştirip yeni sonuç gelmeyince gönderilir', giden.length === 5 && giden[4][0] === 'ışığı kapat ve perdeyi çek', JSON.stringify(giden[4]));
  tp3.sonuc(sr(['ışığı kapat', true], ['ve perdeyi çek', true], ['teşekkürler', false]), false, 500);
  await bekle(130);
  ok('VAD olmadan: ara sonuç bayatlayınca gönderilir', giden.length === 6 && giden[5][0] === 'teşekkürler', JSON.stringify(giden[5]));
}
console.log(`${n - fail}/${n} canlı dinleme testi geçti`);
if (fail) process.exit(1);
