// Toplantı Odası testleri: orkestratör kuralları (tur sınırı, uzlaşma eşiği, söz sırası, isimle hitap, kısa soruda
// tartışma yok, cümle sınırı) ve motorun demo senaryosuyla uçtan uca akışı (LLM yok). Çalıştır: npm run test:toplanti
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.MEETING_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'toplanti-'));
process.env.MOCK = '1';
for (const k of ['ELEVENLABS_API_KEY', 'JARVIS_MODEL', 'FRIDAY_MODEL', 'JUDGE_MODEL', 'MEETING_MAX_TURNS', 'MEETING_MAX_TOKENS']) delete process.env[k];
const ayar = path.join(process.env.MEETING_DATA, 'meeting.json');
const asil = JSON.parse(fs.readFileSync(new URL('../config/meeting.json', import.meta.url), 'utf8'));
fs.writeFileSync(ayar, JSON.stringify({ ...asil, demo: { cumle_arasi_ms: 0, tur_arasi_ms: 0, hakem_ms: 0 } }));
process.env.MEETING_AYAR = ayar;

const { DebateSession, siraEtiketi, ilkKonusan, sonrakiKonusan, dogalTalimat, hitapEdilen, ikisineBirden, hakemDogrula, uzlasmaDogrula, uzlasmaSozu, sinirla, cumleler, kararSorusuMu } = await import('./toplanti/oturum.js');
const { modelleriSec, aile } = await import('./toplanti/modeller.js');
const { Toplanti } = await import('./toplanti/motor.js');
const { sonTutanak, sonKararlarSozu, tutanakDogrula } = await import('./toplanti/tutanak.js');
const { toplantiNiyet } = await import('./toplanti/index.js');

let fail = 0, n = 0;
const ok = (ad: string, kosul: boolean, ayrinti = '') => { n++; if (!kosul) fail++; console.log(`${kosul ? '✓' : '✗'} ${ad}${ayrinti ? ` · ${ayrinti}` : ''}`); };

// 1) Senaryo A sırası: Jarvis açar → Friday → Jarvis → hakem → … → uzlaşma
{
  const s = new DebateSession('İş teklifini kabul edeyim mi?');
  const sira: string[] = [];
  const hakem = [{ agreement: 40, new_point_raised: true, should_continue: true }, { agreement: 60, new_point_raised: true, should_continue: true }, { agreement: 70, new_point_raised: true, should_continue: true }];
  for (let i = 0; i < 30; i++) {
    const a = s.siradaki();
    if (a.tur === 'bitti') break;
    sira.push(a.tur === 'konus' ? a.kim : a.tur);
    if (a.tur === 'konus') s.ekle(a.kim, `${a.kim} konuştu ${i}`);
    else if (a.tur === 'hakem') s.hakemSonucu(hakem[s.round] ?? hakem[2]);
    else if (a.tur === 'uzlasma') s.uzlasmaSonucu({ agreed: ['x'], disagreed: [], recommendation: 'y', confidence: 'orta' });
  }
  ok('Senaryo A sırası ve en fazla 3 tur', sira.join(' ') === 'jarvis friday jarvis hakem friday jarvis hakem friday jarvis hakem uzlasma' && s.round === 3 && s.state === 'closed', sira.join(' '));
}
{
  const s = new DebateSession('Kurs seçimi');
  s.ekle('jarvis', 'a'); s.siradaki(); s.ekle('friday', 'b'); s.siradaki(); s.ekle('jarvis', 'c');
  s.siradaki();
  s.hakemSonucu({ agreement: 85, new_point_raised: true, should_continue: true });
  ok('uzlaşma eşiği (≥ 80) → consensus', s.state === 'consensus' && s.siradaki().tur === 'uzlasma');
  const s2 = new DebateSession('x');
  s2.ekle('jarvis', 'a'); s2.siradaki(); s2.ekle('friday', 'b'); s2.ekle('jarvis', 'c');
  s2.hakemSonucu({ agreement: 50, new_point_raised: false, should_continue: true });
  ok('yeni nokta yoksa → consensus', s2.state === 'consensus');
}
// 2) Söz sırası (canlı)
ok('isimle hitap: Friday', hitapEdilen('Friday, sen ne düşünüyorsun?') === 'friday' && hitapEdilen('fraydi sence') === 'friday');
ok('isimle hitap: Jarvis (ses tanıma yazımı)', hitapEdilen('cervis bunu nasıl buldun') === 'jarvis');
ok('"cuma" yalnızca başta hitap', hitapEdilen('cuma günü toplantı var') === 'friday' && hitapEdilen('toplantı cuma günü') === null);
// Doğal söz sırası: model sözü kime bıraktığını [SIRA: …] ile seçer
{
  const e = siraEtiketi('Bence acele etme. Friday, sen ne dersin? [SIRA: friday]');
  ok('sıra etiketi ayrışır ve metinden silinir', e.sira === 'friday' && e.temiz === 'Bence acele etme. Friday, sen ne dersin?', JSON.stringify(e));
  ok('sıra etiketi: kullanıcı / Jarvis / küçük harf', siraEtiketi('Tamam. [sıra: Kullanıcı]').sira === 'user' && siraEtiketi('Peki. [SIRA:jarvis]').sira === 'jarvis');
  ok('etiket yoksa seçim yok', siraEtiketi('Sadece bir cümle.').sira === null);
  ok('akışta yarım etiket seslendirilmez', siraEtiketi('Haklısın. [SIRA: fri').temiz === 'Haklısın.' && siraEtiketi('Haklısın. [SI').temiz === 'Haklısın.');
  ok('sinirla etiketi de temizler', sinirla('Bir. İki. [SIRA: friday]', 3) === 'Bir. İki.');
  ok('ilk konuşan: hitap edilen', ilkKonusan('Friday, sence?', 'friday') === 'friday');
  ok('ilk konuşan: ikisine → Jarvis; değilse son konuşanın diğeri', ilkKonusan('Siz ne düşünüyorsunuz?', 'jarvis') === 'jarvis' && ilkKonusan('Bütçe 50 bin', 'jarvis') === 'friday' && ilkKonusan('Bütçe 50 bin', null) === 'jarvis');
  ok('sonraki: modelin seçimi', sonrakiKonusan({ kim: 'jarvis', secim: 'friday', ardisik: 1, sinir: 4 }) === 'friday' && sonrakiKonusan({ kim: 'friday', secim: 'jarvis', ardisik: 2, sinir: 4 }) === 'jarvis');
  ok('sonraki: Jarvis de sözü kullanıcıya bırakabilir', sonrakiKonusan({ kim: 'jarvis', secim: 'user', ardisik: 1, sinir: 4 }) === 'user');
  ok('sonraki: kendine söz veremez, etiketsiz → kullanıcı', sonrakiKonusan({ kim: 'friday', secim: 'friday', ardisik: 1, sinir: 4 }) === 'user' && sonrakiKonusan({ kim: 'friday', secim: null, ardisik: 1, sinir: 4 }) === 'user');
  ok('sonraki: sınır dolunca kullanıcı', sonrakiKonusan({ kim: 'jarvis', secim: 'friday', ardisik: 4, sinir: 4 }) === 'user');
  ok('sonraki: kimseye hitap edilmediyse diğeri de mutlaka konuşur', sonrakiKonusan({ kim: 'jarvis', secim: 'user', ardisik: 1, sinir: 4, ikiDe: true }) === 'friday' && sonrakiKonusan({ kim: 'jarvis', secim: null, ardisik: 1, sinir: 4, ikiDe: true }) === 'friday');
  ok('sonraki: ikisi konuştuktan sonra seçim yine modelde', sonrakiKonusan({ kim: 'friday', secim: 'user', ardisik: 2, sinir: 4, ikiDe: true }) === 'user' && sonrakiKonusan({ kim: 'friday', secim: 'jarvis', ardisik: 2, sinir: 4, ikiDe: true }) === 'jarvis');
  ok('talimat: ikinci konuşan tekrar etmez', dogalTalimat('friday', 1, 4, 'patron').includes('tekrar etme') && !dogalTalimat('jarvis', 0, 4, 'efendim').includes('tekrar etme'));
  ok('talimat: son konuşmada söz kullanıcıya, öncesinde seçim serbest', dogalTalimat('jarvis', 3, 4, 'efendim').includes('[SIRA: kullanıcı]') && !dogalTalimat('jarvis', 3, 4, 'efendim').includes('[SIRA: friday]') && dogalTalimat('jarvis', 0, 4, 'efendim').includes('[SIRA: friday]'));
}
// Duraklamayla bölünen söz birleşir (arada karakter konuşmadıysa ve yeniyse)
{
  const o = new DebateSession('', { canli: true });
  o.ekle('jarvis', 'Buyurun efendim.');
  o.ekle('user', 'İlgimi çekecek bir kitap nasıl');
  ok('bölünen söz birleşir', o.devamiMi('bulacağım') === 'İlgimi çekecek bir kitap nasıl bulacağım' && o.transcript.length === 1);
  o.ekle('user', 'Roman seviyorum');
  ok('aynı söz iki kez gelirse tekrarlanmaz', o.devamiMi('roman seviyorum.') === 'Roman seviyorum' && o.transcript.length === 1);
  o.ekle('user', 'Roman seviyorum');
  ok('eski söz birleşmez', o.devamiMi('ve tarih', Date.now() + 11_000) === null && o.transcript.length === 2);
  o.ekle('friday', 'Patron, hangi tür?');
  ok('arada karakter konuştuysa birleşmez', o.devamiMi('Bilim kurgu') === null);
}
// 3) Kısa soru (Senaryo E) ve karar sorusu
for (const q of ['Saat kaç?', 'Işığı aç', 'Hava nasıl?', 'Dolar kaç?', 'Kahve yap']) ok(`kısa soru tartışma başlatmaz: ${q}`, !kararSorusuMu(q));
for (const q of ['Bu iş teklifini kabul edeyim mi? Maaş yüzde 20 fazla ama ofise gitmem gerekiyor.', 'Kirada mı kalayım ev mi alayım, hangisi daha mantıklı?', 'Yurt dışından telefon almak mantıklı mı?', 'Python kursu mu React kursu mu, hangisini seçmeliyim?']) ok(`karar sorusu: ${q.slice(0, 32)}…`, kararSorusuMu(q));
// 4) Metin
ok('cümle sınırı (3) ve markdown temizliği', sinirla('**Jarvis:** Bir. İki! Üç? Dört. Beş.', 3) === 'Bir. İki! Üç?', sinirla('**Jarvis:** Bir. İki! Üç? Dört.', 3));
ok('cümle bölme (sayı ve kısaltma)', cumleler('Maaş 3.5 kat arttı. Dr. Ali geldi. Tamam.').length === 3, cumleler('Maaş 3.5 kat arttı. Dr. Ali geldi. Tamam.').join(' | '));
ok('hakem JSON doğrulama', hakemDogrula('Sonuç: {"agreement": 120, "new_point_raised": false, "should_continue": true}')?.agreement === 100 && hakemDogrula('bilmiyorum') === null);
const u = uzlasmaDogrula('{"agreed":["Net hesap şart"],"disagreed":["Kariyer getirisi"],"recommendation":"Hibrit çalışmayı isteyin.","confidence":"Yüksek"}')!;
ok('uzlaşma doğrulama', u.confidence === 'yüksek' && u.agreed.length === 1);
ok('uzlaşma sözü (Senaryo A kalıbı)', uzlasmaSozu(u) === 'Anlaştığımız nokta şu efendim: Net hesap şart. Anlaşamadığımız nokta şu: Kariyer getirisi. Önerimiz şu: Hibrit çalışmayı isteyin.', uzlasmaSozu(u));
ok('tutanak doğrulama', tutanakDogrula('{"title":"T","summary":"Ö","decisions":["a"],"action_items":[{"who":"K","what":"w"}]}')?.action_items[0].what === 'w');
// 5) Farklı modeller
{
  const m = modelleriSec(['claude-sonnet-5-5', 'gpt-6.2-sol', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gpt-audio-mini', 'route-llm'], {}, 'route-llm');
  ok('varsayılan: farklı aileler', aile(m.jarvis) !== aile(m.friday) && !m.ayniAile && /flash-lite/.test(m.hakem), `${m.jarvis} / ${m.friday} / ${m.hakem}`);
  const e = modelleriSec([], { jarvis: 'a-model', friday: 'b-model', hakem: 'c' });
  ok('.env modelleri öncelikli', e.jarvis === 'a-model' && e.friday === 'b-model' && e.kaynak === 'env');
}
// 6) Motor: demo senaryosu uçtan uca (LLM yok; olaylar sırayla)
{
  const olaylar: any[] = [];
  const ses = () => ({ model: 'browser', voice: 'tr', speed: 1 });
  const demo = JSON.parse(fs.readFileSync(new URL('../config/meeting-demo.json', import.meta.url), 'utf8'));
  const t = new Toplanti('tartisma', demo.konu, e => olaylar.push(e), { jarvis: ses, friday: ses }, demo);
  await t.baslat();
  for (let i = 0; i < 200 && !olaylar.some(e => e.olay === 'durum' && e.durum === 'bitti'); i++) await new Promise(r => setTimeout(r, 20));
  const sira = olaylar.filter(e => ['konusma', 'hakem', 'uzlasma'].includes(e.olay)).map(e => (e.olay === 'konusma' ? e.kim : e.olay));
  ok('demo: tartışma akışı', sira.join(' ') === 'jarvis friday jarvis hakem friday jarvis hakem uzlasma jarvis', sira.join(' '));
  ok('demo: cümleler tek tek', olaylar.filter(e => e.olay === 'cumle').length >= 12 && olaylar.find(e => e.olay === 'cumle')?.sira === 0);
  ok('demo: uzlaşma sözü', olaylar.filter(e => e.olay === 'cumle').map(e => e.metin).join(' ').includes('Anlaştığımız nokta şu efendim'));
  ok('demo: hakem %', olaylar.filter(e => e.olay === 'hakem').map(e => e.agreement).join() === '55,88');
  const tut = await t.bitir();
  const son = sonTutanak();
  ok('tutanak dosyası (Senaryo C)', !!son && son.decisions.length === 2 && fs.readdirSync(process.env.MEETING_DATA!).some(f => /^\d{4}-\d{2}-\d{2}_\d{4}_is-teklifi-degerlendirmesi\.md$/.test(f)), son?.dosya);
  ok('tutanak özeti sesli', olaylar.some(e => e.olay === 'cumle' && e.metin.includes('net kazancı hesaplayıp')) && tut?.summary === demo.tutanak.summary);
  ok('son toplantının kararları', sonKararlarSozu(son).startsWith('Son toplantı "İş teklifi değerlendirmesi" konusundaydı efendim. Alınan kararlar:') && toplantiNiyet('son toplantının kararları neydi')?.istek === 'son_kararlar', sonKararlarSozu(son).slice(0, 90));
  const md = fs.readFileSync(path.join(process.env.MEETING_DATA!, son!.dosya), 'utf8');
  ok('tutanak içeriği', md.includes('## Kararlar') && md.includes('## Yapılacaklar') && md.includes('**Kullanıcı:**') && md.includes('## Döküm'));
}
// 7) Araya girme: transkript seslendirilen kısma iner, sonraki konuşmalar atılır
{
  const olaylar: any[] = [];
  const ses = () => ({ model: 'browser', voice: 'tr', speed: 1 });
  const demo = JSON.parse(fs.readFileSync(new URL('../config/meeting-demo.json', import.meta.url), 'utf8'));
  const t = new Toplanti('tartisma', demo.konu, e => olaylar.push(e), { jarvis: ses, friday: ses }, demo);
  await t.baslat();
  for (let i = 0; i < 200 && !olaylar.some(e => e.olay === 'hakem'); i++) await new Promise(r => setTimeout(r, 10));
  const ilk = olaylar.find(e => e.olay === 'konusma' && e.kim === 'jarvis');
  t.kes({ id: ilk.id, sira: 0 }); // kullanıcı Jarvis'in ilk cümlesinden sonra araya girdi
  const tr = t.oturum.transcript;
  ok('araya girme: yalnızca çalınan cümle kalır', tr.length === 2 && tr[1].konusan === 'jarvis' && tr[1].metin === demo.turlar[0].metin.split('. ')[0] + '.', tr.map(s => `${s.konusan}:${s.metin.slice(0, 30)}`).join(' | '));
  ok('araya girme olayı', olaylar.some(e => e.olay === 'kesildi'));
}
// 8) Sınır: tur sınırı dolunca Jarvis kibarca uyarır ve tutanakla kapatır
{
  process.env.MEETING_MAX_TURNS = '2';
  const olaylar: any[] = [];
  const ses = () => ({ model: 'browser', voice: 'tr', speed: 1 });
  const demo = JSON.parse(fs.readFileSync(new URL('../config/meeting-demo.json', import.meta.url), 'utf8'));
  const t = new Toplanti('tartisma', demo.konu, e => olaylar.push(e), { jarvis: ses, friday: ses }, demo);
  await t.baslat();
  for (let i = 0; i < 300 && !olaylar.some(e => e.olay === 'durum' && e.durum === 'kapandi'); i++) await new Promise(r => setTimeout(r, 10));
  ok('tur sınırı → uyarı + tutanak', olaylar.some(e => e.olay === 'cumle' && e.metin.includes('sınıra ulaştık')) && olaylar.some(e => e.olay === 'tutanak'));
  delete process.env.MEETING_MAX_TURNS;
}

// 9) --meeting-record: gerçek toplantının transkripti ve zamanlaması demo senaryosu olarak kaydedilir ve oynatılabilir
{
  const olaylar: any[] = [];
  const ses = () => ({ model: 'browser', voice: 'tr', speed: 1 });
  const demo = JSON.parse(fs.readFileSync(new URL('../config/meeting-demo.json', import.meta.url), 'utf8'));
  const t = new Toplanti('tartisma', demo.konu, e => olaylar.push(e), { jarvis: ses, friday: ses }, demo, true);
  await t.baslat();
  for (let i = 0; i < 300 && !olaylar.some(e => e.olay === 'durum' && e.durum === 'bitti'); i++) await new Promise(r => setTimeout(r, 10));
  await t.bitir();
  const f = fs.readdirSync(process.env.MEETING_DATA!).find(x => /^kayit-\d+\.json$/.test(x));
  const k = f ? JSON.parse(fs.readFileSync(path.join(process.env.MEETING_DATA!, f), 'utf8')) : null;
  ok('kayıt: demo senaryosu biçiminde', !!k && k.konu === demo.konu && k.turlar.length >= 6 && k.turlar.every((x: any) => typeof x.bekle === 'number') && k.hakemler.length === 2, f);
}

console.log(`${n - fail}/${n} Toplantı Odası testi geçti`);
if (fail) process.exit(1);
process.exit(0);
