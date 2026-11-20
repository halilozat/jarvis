// Toplantı Odası · prompt değerlendirmesi (GERÇEK modellerle; token harcar, ses üretmez).
// 10 karar sorusunda Jarvis ve Friday tartışır. Ölçülenler:
//   - Friday her tartışmada en az bir somut itiraz/eksik getirdi mi (hakem modeline sorulur) ya da açıkça
//     "itirazım yok, çünkü…" dedi mi (Senaryo D: soruların en az yarısında somut itiraz beklenir)
//   - Tekrar: aynı karakterin ardışık turları birbirine çok benziyor mu (kelime örtüşmesi ≥ %50)
//   - İlk token / ilk cümle gecikmesi
// Çalıştır: npm run eval:toplanti (server/)
import { routellmStream } from './routellm.js';
import { Toplanti } from './toplanti/motor.js';
import { jsonAyikla } from './toplanti/oturum.js';

const SORULAR = [
  'Bu iş teklifini kabul edeyim mi? Maaş yüzde 20 fazla ama ofise gitmem gerekiyor.',
  'Kirada oturmaya devam mı edeyim, kredi çekip ev mi alayım?',
  'Yurt dışından telefon alıp IMEI kayıt harcını ödemek mantıklı mı, yoksa Türkiye\'den mi almalıyım?',
  'Yazılım kursu için 6 aylık yoğun bir bootcamp mi, yoksa kendi kendime online kurslarla mı öğreneyim?',
  'YouTube kanalım için bir sonraki video konusu yapay zekâ araçları mı olsun, kişisel verimlilik mi?',
  'Arabamı satıp toplu taşımaya mı geçeyim?',
  'Yüksek lisansa başlamalı mıyım, yoksa iş deneyimi mi kazanmalıyım?',
  'Birikimimi dövize mi yatırayım, altına mı?',
  'Şehir merkezinden daha ucuz bir banliyöye taşınmalı mıyım?',
  'Kendi işimi kurmak için maaşlı işimden ayrılmalı mıyım?',
];

const kelime = (s: string) => new Set(s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w.length > 3));
/** Ortak kelime oranı; sorunun kendi kelimeleri (konu) sayılmaz: konu kelimesini her tur anmak tekrar değildir */
const ortusme = (a: string, b: string, konu = '') => { const k = kelime(konu); const x = new Set([...kelime(a)].filter(w => !k.has(w))), y = new Set([...kelime(b)].filter(w => !k.has(w))); if (!x.size || !y.size) return 0; let o = 0; for (const w of x) if (y.has(w)) o++; return o / Math.min(x.size, y.size); };

async function itirazVarMi(hakem: string, konu: string, jarvis: string, friday: string): Promise<{ somut: boolean; acikcaYok: boolean }> {
  if (/itiraz[ıi]m yok/i.test(friday)) return { somut: false, acikcaYok: true };
  const r = await routellmStream({
    model: hakem, temperature: 0, max_tokens: 60,
    messages: [{ role: 'system', content: 'Yalnızca JSON döndür: {"somut_itiraz": true|false}. Friday\'in konuşması Jarvis\'in görüşüne somut bir itiraz, risk ya da gözden kaçan bir nokta (gerekçesiyle) getiriyor mu? Genel laf ya da tekrar ise false.' },
      { role: 'user', content: `Konu: ${konu}\nJarvis: ${jarvis}\nFriday: ${friday}` }],
  }).catch(() => null);
  return { somut: jsonAyikla(r?.content ?? '')?.somut_itiraz === true, acikcaYok: false };
}

const sonuc: { soru: string; somut: boolean; acikcaYok: boolean; tekrar: number; tur: number; ilkCumle: number[]; token: number }[] = [];
// İsteğe bağlı: yalnızca bazı sorular (sıra numaraları, 1'den): npm run eval:toplanti -- 3 8
const secili = process.argv.slice(2).map(Number).filter(Boolean);
for (const soru of secili.length ? SORULAR.filter((_, i) => secili.includes(i + 1)) : SORULAR) {
  const ilk: number[] = [];
  let bitti = false;
  const ses = () => ({ model: 'browser', voice: 'tr', speed: 1 });
  const t = new Toplanti('tartisma', soru, (e: any) => {
    if (e.olay === 'konusma_son' && e.gecikme?.ilkCumle) ilk.push(e.gecikme.ilkCumle);
    if (e.olay === 'durum' && e.durum === 'bitti') bitti = true;
  }, { jarvis: ses, friday: ses });
  await t.baslat();
  for (let i = 0; i < 900 && !bitti; i++) await new Promise(r => setTimeout(r, 200));
  const tr = t.oturum.transcript;
  const fr = tr.filter(s => s.konusan === 'friday');
  const jv = tr.filter(s => s.konusan === 'jarvis');
  let somut = false, acikcaYok = false;
  for (const f of fr) {
    const i = tr.indexOf(f);
    const once = [...tr.slice(0, i)].reverse().find(s => s.konusan === 'jarvis')?.metin ?? '';
    const r = await itirazVarMi(t.m.hakem, soru, once, f.metin);
    somut ||= r.somut; acikcaYok ||= r.acikcaYok;
  }
  let tekrar = 0;
  for (const k of [fr, jv]) for (let i = 1; i < k.length; i++) tekrar = Math.max(tekrar, ortusme(k[i - 1].metin, k[i].metin, soru));
  sonuc.push({ soru, somut, acikcaYok, tekrar, tur: t.oturum.round, ilkCumle: ilk, token: t.maliyet.token });
  console.log(`${somut ? '✓ itiraz ' : acikcaYok ? '○ itirazı yok (açıkça)' : '✗ itiraz yok'} · tekrar %${Math.round(tekrar * 100)} · ${t.oturum.round} tur · ilk cümle ${ilk.join('/')} ms · ≈${t.maliyet.token} token · ${soru.slice(0, 60)}`);
}
const somutSayi = sonuc.filter(s => s.somut).length;
const tekrarli = sonuc.filter(s => s.tekrar >= 0.5).length;
const tum = sonuc.flatMap(s => s.ilkCumle).sort((a, b) => a - b);
console.log(`\nSomut itiraz: ${somutSayi}/${sonuc.length} (hedef ≥ ${Math.ceil(sonuc.length / 2)}) · açıkça itirazı yok: ${sonuc.filter(s => !s.somut && s.acikcaYok).length} · tekrarlı tartışma: ${tekrarli}`);
console.log(`İlk cümle (model): medyan ${tum[tum.length >> 1]} ms · p90 ${tum[Math.ceil(tum.length * 0.9) - 1]} ms · toplam ≈${sonuc.reduce((a, s) => a + s.token, 0)} token`);
process.exit(somutSayi >= Math.ceil(sonuc.length / 2) && tekrarli === 0 ? 0 : 1);

