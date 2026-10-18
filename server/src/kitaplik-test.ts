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

server.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${ok} test geçti.`);
