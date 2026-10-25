// Kitaplık testi: görüntü modelinin cevabı sahte (geçersiz JSON, taşan kutu, boş sonuç…). Gerçek kitaplığa dokunmaz.
// Çalıştır: npm run test:kitaplik
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitaplik-'));
process.env.KITAPLIK_DATA = dir;
process.env.ACCESS_TOKEN = '';
const { default: express } = await import('express');
const lib = await import('./library.js');
const parts = await import('./libraryParts.js');

let ok = 0;
const t = async (name: string, fn: () => unknown) => { await fn(); ok++; console.log(`✓ ${name}`); };

// ---------------------------------------------------------------- parseScan
await t('geçersiz JSON → boş liste', () => {
  assert.deepEqual(lib.parseScan('Üzgünüm, göremiyorum.'), []);
  assert.deepEqual(lib.parseScan('[{"ad": "Körlük", "kutu": [1,2,3'), []);
  assert.deepEqual(lib.parseScan('{"ad":"x"}'), []);
});
await t('taşan, ters, sayı olmayan ve çok geniş kutular atılır', () => {
  const r = lib.parseScan(JSON.stringify([
    { ad: 'Taşan', kutu: [100, 200, 1200, 260], emin: 0.9 },
    { ad: 'Negatif', kutu: [-5, 200, 400, 260], emin: 0.9 },
    { ad: 'Ters', kutu: [500, 300, 100, 340], emin: 0.9 },
    { ad: 'Yazı', kutu: ['a', 1, 2, 3], emin: 0.9 },
    { ad: 'Üç sayı', kutu: [1, 2, 3], emin: 0.9 },
    { ad: 'Raf', kutu: [100, 0, 400, 900], emin: 0.9 },
    { ad: 'Körlük', yazar: 'José Saramago', kutu: [100, 400, 420, 430], emin: 0.92 },
  ]));
  assert.equal(r.length, 1);
  assert.equal(r[0].ad, 'Körlük');
  assert.deepEqual(r[0].kutu, [0.1, 0.4, 0.42, 0.43]);
});
await t('```json çiti, düşük güven → belirsiz, aynı kutu tek, soldan sağa sıralı', () => {
  const r = lib.parseScan('İşte sonuç:\n```json\n' + JSON.stringify([
    { ad: 'Mülksüzler', yazar: 'Le Guin', kutu: [100, 500, 400, 530], emin: 0.8 },
    { ad: 'Mülksüzler (tekrar)', kutu: [101, 501, 401, 531], emin: 0.5 },
    { ad: 'Belki Oblomov', yazar: 'X', kutu: [100, 100, 400, 140], emin: 0.2 },
    { ad: 'null', yazar: null, kutu: [100, 300, 400, 330], emin: 0.9 },
  ]) + '\n```');
  assert.equal(r.length, 3);
  assert.deepEqual(r.map(x => x.ad), [null, null, 'Mülksüzler']);
  assert.equal(r[0].yazar, null);
});

// ---------------------------------------------------------------- mergeScan
await t('yeniden tarama: notlar adla, elle düzeltilen ad yerle korunur; bulunmayan kutusuz kalır', () => {
  const old = [
    { id: 'a1', ad: 'Mülksüzler', yazar: 'Le Guin', kutu: [0.1, 0.5, 0.4, 0.53], kapak: null, ozet: 'özet', notlar: ['not'], alintilar: [], durum: 'okunuyor' },
    { id: 'b2', ad: 'Davranış', yazar: 'Sapolsky', kutu: [0.1, 0.2, 0.4, 0.24], kapak: null, ozet: null, notlar: [], alintilar: [], durum: 'okunacak', elle: true },
    { id: 'c3', ad: 'Kayıp', yazar: null, kutu: [0.5, 0.2, 0.8, 0.24], kapak: null, ozet: null, notlar: ['kayıp not'], alintilar: [], durum: 'okunacak' },
  ] as any;
  const m = lib.mergeScan(old, [
    { ad: 'Mülksüzler', yazar: 'Ursula K. Le Guin', kutu: [0.11, 0.6, 0.41, 0.63], emin: 0.9 },
    { ad: null, yazar: null, kutu: [0.1, 0.2, 0.4, 0.24], emin: 0.1 },
    { ad: 'Yeni Kitap', yazar: null, kutu: [0.1, 0.8, 0.4, 0.83], emin: 0.9 },
  ]);
  const by = (id: string) => m.find(b => b.id === id)!;
  assert.equal(by('a1').notlar[0], 'not');
  assert.deepEqual(by('a1').kutu, [0.11, 0.6, 0.41, 0.63]);
  assert.equal(by('b2').ad, 'Davranış');
  assert.equal(by('c3').kutu, null);
  assert.equal(m.length, 4);
});

// ---------------------------------------------------------------- HTTP
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(parts.libraryPartsRouter());
app.use(lib.libraryRouter());
const server = app.listen(0);
const port = (server.address() as any).port;
const api = (p: string, body?: unknown) => fetch(`http://localhost:${port}${p}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const jpeg = 'data:image/jpeg;base64,' + Buffer.from('sahte').toString('base64');
const scan = (vision: string) => { lib.deps.vision = async () => vision; return api('/api/kitaplik/tara', { resim: jpeg, genislik: 1920, yukseklik: 1080, kucukResim: 'AAAA' }); };

await t('tara: eksik/bozuk istek → 400', async () => {
  assert.equal((await api('/api/kitaplik/tara', { resim: 'merhaba', genislik: 1920, yukseklik: 1080 })).status, 400);
  assert.equal((await api('/api/kitaplik/tara', { resim: jpeg })).status, 400);
});
await t('tara: geçerli cevap kaydedilir (belirsiz sayılır)', async () => {
  const r = await scan(JSON.stringify([
    { ad: 'Davranış', yazar: 'Robert Sapolsky', kutu: [100, 200, 420, 240], emin: 0.9 },
    { ad: 'Tahıla Karşı', yazar: 'James C. Scott', kutu: [100, 250, 420, 280], emin: 0.85 },
    { ad: null, kutu: [100, 290, 420, 310], emin: 0.1 },
    { ad: 'Taşan', kutu: [100, 990, 420, 1100], emin: 0.9 },
  ]));
  assert.equal(r.status, 200);
  assert.equal(r.body.bulunan, 2);
  assert.equal(r.body.belirsiz, 1);
  assert.equal(r.body.kitaplik.kitaplar.length, 3);
  assert.equal(r.body.kitaplik.referans.genislik, 1920);
  assert.ok(fs.existsSync(path.join(dir, 'kitaplik.json')));
});
await t('tara: boş sonuç ve geçersiz JSON eski haritayı silmez, hata döner', async () => {
  for (const v of ['[]', 'Bu bir kitaplık fotoğrafı.', '']) {
    const r = await scan(v);
    assert.equal(r.status, 200);
    assert.ok(r.body.hata);
    assert.equal(r.body.kitaplik.kitaplar.length, 3);
  }
});
await t('tara: model hata verirse 502', async () => {
  lib.deps.vision = async () => { throw new Error('RouteLLM 500'); };
  const r = await api('/api/kitaplik/tara', { resim: jpeg, genislik: 1920, yukseklik: 1080 });
  assert.equal(r.status, 502);
});
await t('Jarvis aracı: "Davranış\'a not ekle", alıntı, durum; talimattaki kitaplık bölümü', async () => {
  const n = lib.addBookNote("Davranış'a", 'Stres bölümünü videoda kullan.', 'not') as any;
  assert.equal(n.ok, true);
  assert.equal(n.kitap, 'Davranış');
  assert.equal((lib.addBookNote('tahıla karşı', 'Tahıl devlet kurar.', 'alinti') as any).tur, 'alinti');
  // Kitaplıkta olmayan kitaba not: kitap eklenir (rafta yeri olmadan), not kaydedilir
  const y = lib.addBookNote('Var Olmayan Kitap', 'ilk not', 'not', 'Biri') as any;
  assert.equal(y.yeniKitap, true);
  assert.equal((lib.addBookNote('Var Olmayan Kitap', 'ikinci not', 'not') as any).toplam, 2);
  assert.ok('hata' in lib.addBookNote('Davranış', '', 'not'));
  const s = lib.setBookStatus('Tahıla Karşı', { sayfa: 96, toplam_sayfa: 280 }) as any;
  assert.equal(s.durum, 'okunuyor');
  const p = lib.libraryForPrompt();
  assert.match(p, /Davranış · Robert Sapolsky/);
  assert.match(p, /Stres bölümünü/);
  assert.match(p, /1 sırt okunamadı/);
});
await t('elle kaydet: kutu doğrulanır, notlar korunur; kitap güncelle ve sil', async () => {
  const cur = (await api('/api/kitaplik')).body;
  const d = cur.kitaplar.find((b: any) => b.ad === 'Davranış');
  const r = await api('/api/kitaplik', { kitaplar: [...cur.kitaplar.map((b: any) => (b.id === d.id ? { ...b, kutu: [0.1, 0.2, 0.5, 0.25] } : b)), { id: 'yeni1234', ad: 'Elle Eklenen', kutu: [2, 0, 3, 1] }] });
  assert.equal(r.status, 200);
  const nd = r.body.kitaplar.find((b: any) => b.id === d.id);
  assert.deepEqual(nd.kutu, [0.1, 0.2, 0.5, 0.25]);
  assert.equal(nd.notlar.length, 1);
  assert.equal(r.body.kitaplar.find((b: any) => b.id === 'yeni1234').kutu, null);
  const u = await api(`/api/kitaplik/${d.id}`, { durum: 'bitti', ad: 'Davranış (düzeltildi)' });
  assert.equal(u.body.kitap.durum, 'bitti');
  assert.equal(u.body.kitap.elle, true);
  assert.equal((await fetch(`http://localhost:${port}/api/kitaplik/yeni1234`, { method: 'DELETE' })).status, 200);
  assert.equal((await api('/api/kitaplik/yok-boyle/ozet', {})).status, 404);
});

await t('parçalı tarama: parça içi kutu kareye taşınır, örtüşmedeki aynı kitap tek kalır (adı okunan/kesilmemiş olan)', async () => {
  // İki parça: sol [0, 0.6] ve sağ [0.4, 1.0] (yatayda örtüşme 0.4-0.6). "Körlük" ikisinde de var; solda kesik ve adsız.
  const left = JSON.stringify([
    { ad: 'Sol Kitap', kutu: [100, 100, 500, 150], emin: 0.9 },
    { ad: null, kutu: [100, 900, 500, 1000], emin: 0.1 }, // kare x: 0.54-0.60 (kesik)
  ]);
  const right = JSON.stringify([
    { ad: 'Körlük', yazar: 'José Saramago', kutu: [100, 230, 500, 330], emin: 0.9 }, // kare x: 0.538-0.598
    { ad: 'Sağ Kitap', kutu: [100, 800, 500, 850], emin: 0.9 },
  ]);
  const replies = [left, right];
  let i = 0;
  lib.deps.vision = async () => replies[i++];
  const r = await api('/api/kitaplik/tara', { genislik: 1920, yukseklik: 1080, parcalar: [{ resim: jpeg, x: 0, y: 0, w: 0.6, h: 1 }, { resim: jpeg, x: 0.4, y: 0, w: 0.6, h: 1 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.parca, 2);
  const names = r.body.kitaplik.kitaplar.filter((b: any) => b.kutu).map((b: any) => b.ad);
  assert.deepEqual(names, ['Sol Kitap', 'Körlük', 'Sağ Kitap']);
  const k = r.body.kitaplik.kitaplar.find((b: any) => b.ad === 'Körlük');
  assert.ok(Math.abs(k.kutu[1] - 0.538) < 0.001 && Math.abs(k.kutu[3] - 0.598) < 0.001);
  // Geçersiz parça yeri → 400
  assert.equal((await api('/api/kitaplik/tara', { genislik: 1920, yukseklik: 1080, parcalar: [{ resim: jpeg, x: 0.8, y: 0, w: 0.6, h: 1 }] })).status, 400);
});
await t('fotoğraftan ekle: okunan kitaplar eklenir, olanlar tekrar eklenmez, yazar adı/düşük güven atlanır; elle ekle; açık kitaba not', async () => {
  lib.deps.vision = async () => '```json\n' + JSON.stringify([
    { ad: 'Körlük', yazar: 'José Saramago', emin: 0.9 },
    { ad: 'Davranış', yazar: 'Robert Sapolsky', emin: 0.9 },
    { ad: 'Belki Bir Kitap', emin: 0.2 },
    { ad: null, yazar: 'Ayn Rand', emin: 0.9 },
  ]) + '\n```';
  const r = await api('/api/kitaplik/fotograf', { resim: jpeg });
  assert.equal(r.status, 200);
  // Körlük önceki taramadan zaten var; Davranış önceki testte yeniden adlandırıldığı için yeni
  assert.deepEqual(r.body.eklenen, ['Davranış']);
  assert.deepEqual(r.body.zatenVar, ['Körlük']);
  lib.deps.vision = async () => 'okunamadı';
  assert.deepEqual((await api('/api/kitaplik/fotograf', { resim: jpeg })).body.eklenen, []);
  assert.equal((await api('/api/kitaplik/fotograf', { resim: 'x' })).status, 400);
  const e = await api('/api/kitaplik/yeni', { ad: 'Mülksüzler', yazar: 'Ursula K. Le Guin' });
  assert.equal(e.body.yeni, true);
  assert.equal(e.body.kitap.kutu, null);
  assert.equal((await api('/api/kitaplik/yeni', { ad: 'mülksüzler' })).body.yeni, false);
  assert.equal((await api('/api/kitaplik/yeni', { ad: '  ' })).status, 400);
  const n = await api(`/api/kitaplik/${e.body.kitap.id}/not`, { metin: 'Anarres dili', tur: 'not' });
  assert.deepEqual(n.body.kitap.notlar, ['Anarres dili']);
  const q = await api(`/api/kitaplik/${e.body.kitap.id}/not`, { metin: 'Bir alıntı', tur: 'alinti' });
  assert.deepEqual(q.body.kitap.alintilar, ['Bir alıntı']);
  assert.equal((await api('/api/kitaplik/yok-boyle/not', { metin: 'x' })).status, 400);
  assert.match(lib.libraryForPrompt(), /Mülksüzler · Ursula K\. Le Guin · okunacak · notlar: "Anarres dili" · 1 alıntı · rafta yeri bilinmiyor/);
});

await t('Jarvis sayfaları: tanınan kitap dolar (benzer yalnızca kitaplıktan), tanınmayan uydurulmaz, ad değişince sıfırlanır', async () => {
  const add = await api('/api/kitaplik/yeni', { ad: 'Davranış', yazar: 'Robert Sapolsky' });
  const id = add.body.kitap.id;
  let calls = 0;
  lib.chatDeps.chat = async () => { calls++; return 'Tabii:\n```json\n' + JSON.stringify({
    biliyorum: true, yazar: 'Robert M. Sapolsky', tur: 'popüler bilim', yil: 2017, ozet: 'Bir. İki. Üç.',
    anaFikirler: ['Davranış saniyeler öncesinden milyon yıllar öncesine uzanan nedenlerle açıklanır.', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi'],
    yazarHakkinda: 'Nörobiyolog.', temalar: ['beyin', 'evrim'], nedenOku: 'Çünkü.', kimeUygun: 'Meraklılara.',
    benzer: ['Körlük', 'Olmayan Kitap', 'mülksüzler'],
  }) + '\n```'; };
  const r = await api(`/api/kitaplik/${id}/doldur`, {});
  assert.equal(r.status, 200);
  const j = r.body.kitap.jarvis;
  assert.equal(j.anaFikirler.length, 6);
  assert.deepEqual(j.benzer, ['Körlük', 'Mülksüzler']);
  assert.equal(j.yil, 2017);
  assert.equal(r.body.kitap.ozet, 'Bir. İki. Üç.');
  assert.equal(r.body.kitap.yazar, 'Robert Sapolsky'); // kullanıcının yazdığı korunur
  // İkinci çağrı modeli tekrar çağırmaz; ?yenile=1 çağırır
  await api(`/api/kitaplik/${id}/doldur`, {});
  assert.equal(calls, 1);
  // Ad değişince eski özet ve Jarvis sayfaları silinir
  const ren = await api(`/api/kitaplik/${id}`, { ad: 'Başka Kitap' });
  assert.equal(ren.body.kitap.jarvis, undefined);
  assert.equal(ren.body.kitap.ozet, null);
  lib.chatDeps.chat = async () => '{"biliyorum": false}';
  const u = await api(`/api/kitaplik/${id}/doldur`, {});
  assert.equal(u.body.bilinmiyor, true);
  assert.equal(u.body.kitap.ozet, null);
  lib.chatDeps.chat = async () => 'bozuk cevap';
  const add2 = await api('/api/kitaplik/yeni', { ad: 'Üçüncü Kitap' });
  assert.equal((await api(`/api/kitaplik/${add2.body.kitap.id}/doldur`, {})).body.bilinmiyor, true);
});

// ---------------------------------------------------------------- Bölümler, tamamlama, telefon kamerası, kayıtlar
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('sahte-jpeg').toString('base64');
await t('bölüm fotoğrafı: raf ve sıra, okunamayan sırası korunur, aynı kitap iki kez girmez', async () => {
  lib.deps.vision = async () => '```json\n' + JSON.stringify([
    { raf: 1, sira: 2, ad: 'Tutunamayanlar', yazar: 'Oğuz Atay', emin: 0.9 },
    { raf: 1, sira: 1, ad: 'Körlük', emin: 0.9 },
    { raf: 1, sira: 3, ad: null, emin: 0.2 },
    { raf: 2, sira: 1, ad: 'Bulanık', emin: 0.3 },
    { raf: 0, sira: 1, ad: 'Geçersiz raf', emin: 0.9 },
  ]) + '\n```';
  const r = await api('/api/kitaplik/bolum/2/foto', { resim: JPEG });
  assert.equal(r.status, 200);
  assert.equal(r.body.okunan, 2);
  assert.equal(r.body.belirsiz, 2);
  assert.deepEqual(r.body.bolum.liste.map((x: any) => x.ad), ['Körlük', 'Tutunamayanlar', null, null]);
  assert.ok(r.body.eklenen.includes('Tutunamayanlar'));
  // İkinci fotoğraf aynı kitabı yeniden listelemez
  lib.deps.vision = async () => JSON.stringify([{ raf: 1, sira: 1, ad: 'Tutunamayanlar', emin: 0.9 }, { raf: 1, sira: 2, ad: 'Saatleri Ayarlama Enstitüsü', emin: 0.8 }]);
  const r2 = await api('/api/kitaplik/bolum/2/foto', { resim: JPEG });
  assert.equal(r2.body.bolum.fotograflar.length, 2);
  assert.equal(r2.body.bolum.liste.filter((x: any) => x.ad === 'Tutunamayanlar').length, 1);
  const k = (await api('/api/kitaplik')).body;
  assert.equal(k.bolumler.length, 6);
  assert.equal(k.kitaplar.find((b: any) => b.ad === 'Saatleri Ayarlama Enstitüsü').bolum, 2);
  // Fotoğraf silinince listesi de gider (kitaplar kalır)
  const foto = r2.body.bolum.fotograflar[1].id;
  const d = await fetch(`http://localhost:${port}/api/kitaplik/bolum/2/foto/${foto}`, { method: 'DELETE' }).then(x => x.json());
  assert.ok(!d.bolum.liste.some((x: any) => x.ad === 'Saatleri Ayarlama Enstitüsü'));
});
await t('bölüm adı ve kameradaki alanı; geçersiz bölüm reddedilir', async () => {
  const r = await api('/api/kitaplik/bolum/2', { ad: 'Türk Edebiyatı', alan: [0.1, 0.4, 0.5, 0.7] });
  assert.equal(r.body.bolum.ad, 'Türk Edebiyatı');
  assert.deepEqual(r.body.bolum.alan, [0.1, 0.4, 0.5, 0.7]);
  assert.equal((await api('/api/kitaplik/bolum/9', { ad: 'x' })).status, 400);
});
await t('tamamlama: yalnızca listedeki adlar, emin ≥ 0,6, bir kitap tek sırta; kayıt sırta taşınır (notlarıyla)', async () => {
  // Rafta üç belirsiz sırt; "Tutunamayanlar" kayıtlı ama rafta yeri yok (notlu), "Körlük" zaten başka bir sırtta
  const cur = (await api('/api/kitaplik')).body;
  const tut = cur.kitaplar.find((b: any) => b.ad === 'Tutunamayanlar');
  assert.equal(tut.kutu, null);
  assert.ok(cur.kitaplar.find((b: any) => b.ad === 'Körlük').kutu, 'Körlük rafta');
  await api(`/api/kitaplik/${tut.id}/not`, { metin: 'Selim Işık' });
  const yer1 = { id: 'yer00001', ad: null, kutu: [0.2, 0.45, 0.4, 0.47] }, yer2 = { id: 'yer00002', ad: null, kutu: [0.2, 0.48, 0.4, 0.5] }, yer3 = { id: 'yer00003', ad: null, kutu: [0.2, 0.51, 0.4, 0.53] };
  const now = (await api('/api/kitaplik')).body;
  await api('/api/kitaplik', { kitaplar: [...now.kitaplar, yer1, yer2, yer3] });
  lib.deps.vision = async () => JSON.stringify([
    { n: 1, ad: 'tutunamayanlar', emin: 0.85 },
    { n: 2, ad: 'Listede Olmayan Kitap', emin: 0.95 },
    { n: 3, ad: 'Körlük', emin: 0.9 },
    { n: 2, ad: 'Tutunamayanlar', emin: 0.7 },
  ]);
  const r = await api('/api/kitaplik/tamamla', { bolum: 2, resim: JPEG, kutular: [{ n: 1, id: 'yer00001' }, { n: 2, id: 'yer00002' }, { n: 3, id: 'yer00003' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.tamamlanan.map((x: any) => x.ad), ['Tutunamayanlar']);
  const kb = r.body.kitaplik.kitaplar.find((b: any) => b.ad === 'Tutunamayanlar');
  assert.deepEqual(kb.kutu, [0.2, 0.45, 0.4, 0.47]);
  assert.equal(kb.tamamlandi, true);
  assert.ok(kb.notlar.includes('Selim Işık'));
  assert.ok(!r.body.kitaplik.kitaplar.some((b: any) => b.id === 'yer00001'), 'yer tutucu silindi');
  assert.equal(r.body.kitaplik.kitaplar.find((b: any) => b.id === 'yer00002').ad, null, 'listede olmayan ad yazılmaz');
  assert.equal(r.body.kitaplik.kitaplar.find((b: any) => b.id === 'yer00003').ad, null, 'başka sırttaki kitap taşınmaz');
});
await t('telefon kamerası: kayıtlılar tanınır, net okunan yeniler eklenir, geçersiz kutu atlanır', async () => {
  lib.deps.vision = async () => JSON.stringify([
    { ad: 'tutunamayanlar', kutu: [100, 200, 800, 260], emin: 0.8 },
    { ad: 'Kayıtsız Kitap', yazar: 'Bir Yazar', yeni: true, kutu: [100, 300, 800, 360], emin: 0.9 },
    { ad: 'Bulanık Ad', yeni: true, kutu: [100, 500, 800, 560], emin: 0.6 },
    { ad: 'Körlük', kutu: [100, 400, 1200, 460], emin: 0.9 },
  ]);
  const r = await api('/api/kitaplik/kamera', { resim: JPEG });
  assert.deepEqual(r.body.bulunan.map((x: any) => x.ad), ['Tutunamayanlar', 'Kayıtsız Kitap']);
  assert.deepEqual(r.body.bulunan[0].kutu, [0.1, 0.2, 0.8, 0.26]);
  assert.deepEqual(r.body.eklenen.map((x: any) => [x.ad, x.yazar, x.kutu]), [['Kayıtsız Kitap', 'Bir Yazar', null]]);
  assert.equal(r.body.bulunan[1].yeni, true);
  const k = (await api('/api/kitaplik')).body.kitaplar;
  assert.ok(k.some((b: any) => b.ad === 'Kayıtsız Kitap'), 'yeni kitap kitaplıkta');
  assert.ok(!k.some((b: any) => b.ad === 'Bulanık Ad'), 'emin olunmayan ad eklenmez');
  // İkinci tarama: aynı kitap artık kayıtlı, tekrar eklenmez
  const r2 = await api('/api/kitaplik/kamera', { resim: JPEG });
  assert.equal(r2.body.eklenen.length, 0);
  assert.ok(r2.body.bulunan.some((x: any) => x.ad === 'Kayıtsız Kitap' && !x.yeni));
});
await t('kayıt geçmişi: not, alıntı, durum ve sayfa; okundu anı', async () => {
  const k = (await api('/api/kitaplik')).body.kitaplar.find((b: any) => b.ad === 'Tutunamayanlar');
  await api(`/api/kitaplik/${k.id}/not`, { metin: 'Turgut Özben', tur: 'not' });
  await api(`/api/kitaplik/${k.id}/not`, { metin: 'Kendimi ifade edemiyorum.', tur: 'alinti' });
  await api(`/api/kitaplik/${k.id}`, { durum: 'okunuyor', sayfa: 120 });
  const r = await api(`/api/kitaplik/${k.id}`, { durum: 'bitti' });
  const tur = r.body.kitap.kayitlar.map((x: any) => x.tur);
  assert.deepEqual(tur.slice(-5), ['not', 'alinti', 'durum', 'sayfa', 'durum']);
  assert.ok(r.body.kitap.bittiAt);
});

// ---------------------------------------------------------------- Kitap danışmanı: öneri, tarz, sohbet notu
const adv = await import('./bookAdvisor.js');
app.use(adv.advisorRouter()); // testte sona bağlandı: yalnızca fonksiyonlar denenir
await t('ruh haline öneri: yalnızca okunmamış kitaplardan, listede olmayan ad atılır', async () => {
  lib.chatDeps.chat = async () => JSON.stringify({ oneriler: [{ ad: 'Uydurma Kitap', neden: 'x' }, { ad: 'saatleri ayarlama enstitüsü', neden: 'Bugün gülümsetir.' }] });
  const r = await adv.ruhHalineOner('yorgunum, hafif bir şey', 1);
  assert.deepEqual(r.oneriler.map(o => o.ad), ['Saatleri Ayarlama Enstitüsü']);
  assert.equal(r.oneriler[0].neden, 'Bugün gülümsetir.');
  assert.ok(r.aday > 0);
  // Model listedeki satırı kopyalarsa ("Ad · Yazar") da eşleşir
  lib.chatDeps.chat = async () => '```json\n' + JSON.stringify({ oneriler: [{ ad: 'Saatleri Ayarlama Enstitüsü · Ahmet Hamdi Tanpınar · roman', neden: 'Hafif ve komik.' }] }) + '\n```';
  const r1 = await adv.ruhHalineOner('neşelenmek istiyorum', 1);
  assert.equal(r1.oneriler[0]?.ad, 'Saatleri Ayarlama Enstitüsü');
  // Okunmuş kitap önerilmez (okunmamış varken)
  lib.chatDeps.chat = async () => JSON.stringify({ oneriler: [{ ad: 'Tutunamayanlar', neden: 'x' }] });
  const r2 = await adv.ruhHalineOner('hüzünlüyüm', 1);
  assert.notEqual(r2.oneriler[0]?.ad, 'Tutunamayanlar', 'okundu olan kitap önerilmedi');
});
await t('tarz analizi: kitaplıkta olan ve Open Library\'de bulunamayan öneriler atılır', async () => {
  lib.chatDeps.chat = async () => JSON.stringify({ ozet: 'Klasik Türk edebiyatını seviyorsunuz.', oneriler: [
    { ad: 'Tutunamayanlar', yazar: 'Oğuz Atay', neden: 'zaten var', benzer: [] },
    { ad: 'Huzur', yazar: 'Ahmet Hamdi Tanpınar', neden: 'Saatleri Ayarlama Enstitüsü sevdiyseniz.', benzer: ['Saatleri Ayarlama Enstitüsü', 'Olmayan Kitap'] },
    { ad: 'Hiç Yazılmamış Roman', yazar: 'Uydurma Yazar', neden: 'x', benzer: [] },
    { ad: 'Kürk Mantolu Madonna', yazar: 'Sabahattin Ali', neden: 'y', benzer: [] },
  ] });
  adv.advisorDeps.openLibrary = async (ad: string) => ad.startsWith('Hiç') ? { var: false, kapak: null, yil: null, key: null } : { var: true, kapak: 'https://covers.openlibrary.org/b/id/1-M.jpg', yil: 1949, key: '/works/x' };
  const r = await adv.tarzaGoreOner(5);
  assert.deepEqual(r.oneriler.map(o => o.ad), ['Huzur', 'Kürk Mantolu Madonna']);
  assert.deepEqual(r.oneriler[0].benzer, ['Saatleri Ayarlama Enstitüsü'], 'benzer yalnızca kitaplıktakiler');
  assert.equal(r.elenen, 1);
  assert.equal(r.ozet, 'Klasik Türk edebiyatını seviyorsunuz.');
  assert.ok(r.profil.toplam > 0 && r.profil.okundu >= 1);
});
await t('kitap sohbeti notu: kaldığı yer, notlar, spoiler kuralı', async () => {
  const k = (await api('/api/kitaplik')).body.kitaplar.find((b: any) => b.ad === 'Saatleri Ayarlama Enstitüsü');
  await api(`/api/kitaplik/${k.id}`, { durum: 'okunuyor', sayfa: 120, toplamSayfa: 400 });
  await api(`/api/kitaplik/${k.id}/not`, { metin: 'Hayri İrdal çok komik' });
  const n = adv.kitapSohbetiNotu(k.id, true)!;
  assert.ok(n.includes('120. sayfada') && n.includes('%30'));
  assert.ok(n.includes('Hayri İrdal çok komik'));
  assert.ok(/SPOILER/.test(n) && /İLK mesajı/.test(n));
  assert.equal(adv.kitapSohbetiNotu('yok-boyle', false), null);
});

await t('tara: kayıtlı adlar modele aday verilir; rafta yeri olmayan kayıt sırta yerleşir, bir ad tek sırta, düşük güvenli liste adı atılır', async () => {
  await api('/api/kitaplik/yeni', { ad: 'Uzaktaki Kitap', yazar: 'Yazar A' });
  await api('/api/kitaplik/yeni', { ad: 'Bulanık Kitap' });
  let istem = '';
  lib.deps.vision = async (_j: string, p?: string) => { istem = p ?? ''; return JSON.stringify([
    { ad: 'Uzaktaki Kitap', kutu: [100, 100, 500, 130], emin: 0.7 },
    { ad: 'uzaktaki kitap', kutu: [100, 300, 500, 330], emin: 0.65 },
    { ad: 'Bulanık Kitap', kutu: [100, 500, 500, 530], emin: 0.45 },
    { ad: 'Net Okunan Yeni', kutu: [100, 700, 500, 730], emin: 0.5 },
  ]); };
  const r = await api('/api/kitaplik/tara', { resim: jpeg, genislik: 1920, yukseklik: 1080, kucukResim: 'AAAA' });
  assert.equal(r.status, 200);
  assert.ok(istem.includes('"Uzaktaki Kitap"') && istem.includes('Liste:'), 'kayıtlı adlar istemde');
  const kutulu = r.body.kitaplik.kitaplar.filter((b: any) => b.kutu);
  assert.deepEqual(kutulu.map((b: any) => b.ad), ['Uzaktaki Kitap', null, null, 'Net Okunan Yeni']);
  const u = r.body.kitaplik.kitaplar.filter((b: any) => b.ad === 'Uzaktaki Kitap');
  assert.equal(u.length, 1, 'aynı kitap iki kez oluşmaz');
  assert.equal(u[0].yazar, 'Yazar A', 'kayıt korunur (kimlik ve yazar)');
  assert.ok(Math.abs(u[0].kutu[1] - 0.1) < 0.001, 'en emin sırta yerleşir');
  assert.equal(r.body.kitaplik.kitaplar.find((b: any) => b.ad === 'Bulanık Kitap').kutu, null, 'düşük güvenli liste adı yerleşmez');
});
await t('tahmini yerleştirme: model tahmini, kalanlar eklenme sırasıyla, raf dışı kitap konmaz; sonraki taramada okunan ad tahmini ezer', async () => {
  const kb = (id: string, ad: string | null, kutu: number[] | null, ek: object = {}) => ({ id, ad, yazar: null, kutu, kapak: null, ozet: null, notlar: [], alintilar: [], durum: 'okunacak', elle: !!ad, ...ek });
  const k0 = lib.readLibrary();
  lib.writeLibrary({ ...k0, kitaplar: [
    kb('rafta001', 'Rafta Duran', [0.1, 0.0, 0.4, 0.03]),
    kb('kayit001', 'Birinci', null), kb('kayit002', 'İkinci', null), kb('kayit003', 'Üçüncü', null),
    kb('oneri001', 'Öneri Kitabı', null, { rafDisi: true }),
    kb('yerT0001', null, [0.1, 0.1, 0.4, 0.13]), kb('yerT0002', null, [0.1, 0.2, 0.4, 0.23]),
    kb('yerT0003', null, [0.1, 0.3, 0.4, 0.33]), kb('yerT0004', null, [0.1, 0.4, 0.4, 0.43]),
  ] as any });
  let istem = '';
  lib.deps.vision = async (_j: string, p?: string) => { istem = p ?? ''; return JSON.stringify([
    { n: 2, ad: 'ikinci', emin: 0.4 },
    { n: 3, ad: 'Öneri Kitabı', emin: 0.9 },
    { n: 1, ad: 'Yok Böyle', emin: 0.9 },
  ]); };
  const kutular = [1, 2, 3, 4].map(n => ({ n, id: `yerT000${n}` }));
  assert.equal((await api('/api/kitaplik/yerlestir', { kutular: [] })).status, 400);
  const r = await api('/api/kitaplik/yerlestir', { resim: JPEG, kutular });
  assert.equal(r.status, 200);
  assert.ok(istem.includes('"Birinci"') && !istem.includes('Öneri Kitabı'), 'raf dışı kitap modele aday verilmez');
  const yer = (id: string) => r.body.kitaplik.kitaplar.find((b: any) => b.id === id);
  assert.deepEqual(yer('kayit002').kutu, [0.1, 0.2, 0.4, 0.23], 'model tahmini');
  assert.deepEqual(yer('kayit001').kutu, [0.1, 0.1, 0.4, 0.13], 'sırayla: ilk boş sırt');
  assert.deepEqual(yer('kayit003').kutu, [0.1, 0.3, 0.4, 0.33], 'sırayla: sonraki boş sırt');
  assert.ok(yer('kayit001').tahmini && yer('kayit002').tahmini);
  assert.equal(yer('oneri001').kutu, null, 'raf dışı kitap yerleşmez');
  assert.ok(!yer('yerT0001') && !yer('yerT0002') && !yer('yerT0003'), 'yer tutucular silindi');
  assert.ok(yer('yerT0004'), 'kitap kalmayınca sırt belirsiz kalır');
  assert.deepEqual(r.body.yerlesen.map((x: any) => [x.ad, x.sirayla]), [['İkinci', false], ['Birinci', true], ['Üçüncü', true]]);
  // Sonraki tarama: İkinci'nin sırtında gerçek ad okundu, Birinci'ninki yine okunamadı
  lib.deps.vision = async () => JSON.stringify([
    { ad: null, kutu: [100, 100, 400, 130], emin: 0.2 },
    { ad: 'Gerçek Ad', kutu: [100, 200, 400, 230], emin: 0.9 },
    { ad: null, kutu: [100, 500, 400, 530], emin: 0.2 },
  ]);
  const t2 = await api('/api/kitaplik/tara', { resim: jpeg, genislik: 1920, yukseklik: 1080, kucukResim: 'AAAA' });
  const b2 = (ad: string) => t2.body.kitaplik.kitaplar.find((b: any) => b.ad === ad);
  assert.ok(b2('Birinci').kutu && b2('Birinci').tahmini, 'okunamayan sırtta tahmin korunur');
  assert.equal(b2('İkinci').kutu, null, 'gerçek ad okununca tahmin bırakılır');
  assert.ok(b2('Gerçek Ad').kutu && !b2('Gerçek Ad').tahmini);
  // Model hata verirse yalnızca sırayla yerleşir
  lib.deps.vision = async () => { throw new Error('model yok'); };
  const r3 = await api('/api/kitaplik/yerlestir', { kutular: t2.body.kitaplik.kitaplar.filter((b: any) => b.kutu && !b.ad).map((b: any, i: number) => ({ n: i + 1, id: b.id })) });
  assert.equal(r3.status, 200);
  // Bu taramada görünmeyen sırtların kitapları da yersiz kaldı; sıradaki ilk kitap boş sırta yerleşir
  assert.deepEqual(r3.body.yerlesen.map((x: any) => [x.ad, x.sirayla]), [['Rafta Duran', true]]);
  assert.deepEqual(r3.body.kitaplik.kitaplar.find((b: any) => b.ad === 'Rafta Duran').kutu, [0.1, 0.5, 0.4, 0.53]);
});
server.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${ok} test geçti.`);
