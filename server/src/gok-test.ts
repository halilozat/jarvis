// Gece Gökyüzü (sunucu) testleri: EXIF/GPS temizliği, gokyuzu aracının hazır cümleleri, sesli istek eşleme,
// astrometry.net akışı (sahte fetch ile; gerçek ağ isteği yok). Çalıştır: npm run test:gok (kökten)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.ASTROMETRY_API_KEY = 'test-anahtar';
process.env.ASTROMETRY_URL = 'https://nova.test';
process.env.GOK_ONBELLEK = fs.mkdtempSync(path.join(os.tmpdir(), 'gok-'));
const { goruntuAl, gokNiyet, gokRouter, gokyuzuArac, initGok, jpegTemizle, pngTemizle, setGokRequest } = await import('./gok.js');

let fail = 0, n = 0;
const ok = (name: string, cond: boolean, detail = '') => { n++; if (!cond) fail++; console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`); };

// 1) JPEG: APP1 (EXIF + GPS) ve COM düşer, APP0 ve görüntü verisi kalır
{
  const seg = (m: number, body: Buffer) => Buffer.concat([Buffer.from([0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
  const app0 = seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
  const exif = seg(0xe1, Buffer.from('Exif\0\0GPSLatitude=41.0082;GPSLongitude=28.9784', 'latin1'));
  const com = seg(0xfe, Buffer.from('iPhone 15 Pro', 'latin1'));
  const dqt = seg(0xdb, Buffer.alloc(65, 1));
  const sos = Buffer.concat([seg(0xda, Buffer.alloc(10, 2)), Buffer.from([1, 2, 3, 0xff, 0x00, 4]), Buffer.from([0xff, 0xd9])]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, exif, com, dqt, sos]);
  const t = jpegTemizle(jpeg);
  const s = t.toString('latin1');
  ok('JPEG: EXIF/GPS silindi', !s.includes('Exif') && !s.includes('GPS') && !s.includes('iPhone'), `${jpeg.length} → ${t.length} bayt`);
  ok('JPEG: görüntü verisi duruyor', s.includes('JFIF') && t.subarray(-8).equals(jpeg.subarray(-8)) && t.includes(dqt));
  const g = goruntuAl(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
  ok('data URL temizleniyor', g.tur === 'jpeg' && !g.veri.toString('latin1').includes('GPS'));
}
// 2) PNG: tEXt / eXIf düşer
{
  const crc = Buffer.alloc(4);
  const chunk = (tur: string, body: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(body.length); return Buffer.concat([l, Buffer.from(tur, 'latin1'), body, crc]); };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)), chunk('eXIf', Buffer.from('GPS 41.0 29.0')), chunk('tEXt', Buffer.from('Comment\0secret')), chunk('IDAT', Buffer.alloc(20, 7)), chunk('IEND', Buffer.alloc(0))]);
  const t = pngTemizle(png).toString('latin1');
  ok('PNG: üst veri silindi', !t.includes('GPS') && !t.includes('secret') && t.includes('IDAT') && t.includes('IEND'));
}

// 3) Araç: hazır cümleler yalnızca bağlamdaki veriden
const yayin: object[] = [];
initGok(e => yayin.push(e));
const ctx = {
  kaynak: 'fotograf' as const, cekim: '2026-11-02T21:00:00Z', yer: 'İstanbul',
  yildizlar: [
    { hip: 91262, ad: 'Vega', tk: 'Lir', kadir: 0.03, uzaklik: '25 ışık yılı', uzaklikIy: 25.04, aralik: null, yaklasik: false, yolaCikis: '2001 yılında', olay: "Bu ışık, Uluslararası Uzay İstasyonu'na ilk ekip yerleşirken yola çıktı.", olayKisa: "Tam o sıralarda Uluslararası Uzay İstasyonu'na ilk ekip yerleşti." },
    { hip: 102098, ad: 'Deneb', tk: 'Kuğu', kadir: 1.25, uzaklik: 'yaklaşık 1.400 ışık yılı', uzaklikIy: 1412, aralik: '1.250 ile 1.650 ışık yılı arasında', yaklasik: true, yolaCikis: 'yaklaşık 614 yılında', olay: 'Bu ışık, aşağı yukarı Hicret yaşanırken yola çıktı.', olayKisa: 'Aşağı yukarı o yıllarda Hicret yaşandı.' },
  ],
  takimyildizlar: ['Lir', 'Kuğu'],
  gezegenler: [
    { id: 'jupiter', ad: 'Jüpiter', irtifa: 35.2, yon: 'güneydoğu', kadir: -2.6, kadrajda: true },
    { id: 'saturn', ad: 'Satürn', irtifa: 20.4, yon: 'güney', kadir: 0.6, kadrajda: false },
    { id: 'venus', ad: 'Venüs', irtifa: -30, yon: 'batı', kadir: -4.0, kadrajda: false },
  ],
  secili: 91262,
};
ok('mod kapalıyken hata', JSON.parse(gokyuzuArac({ istek: 'en_parlak' })).hata?.includes('açık değil'));
setGokRequest({ ctx, client: 'test' });
const ar = (a: object) => JSON.parse(gokyuzuArac(a as any));
{
  const g = ar({ istek: 'gezegenler' });
  ok('gezegenler: ufkun altındaki yok', !g.soyle.includes('Venüs') && g.soyle.includes('Jüpiter güneydoğuda, ufkun 35 derece üstünde') && g.soyle.includes('Satürn güneyde') && g.soyle.includes('Fotoğrafta Jüpiter var'), g.soyle);
  const p = ar({ istek: 'en_parlak' });
  ok('en parlak: Jüpiter', p.soyle.startsWith('Fotoğraftaki en parlak nokta bir yıldız değil, Jüpiter') && p.soyle.includes('−2,6') && p.soyle.includes('Vega'), p.soyle);
  const u = ar({ istek: 'en_uzak' });
  ok('en uzak: Deneb, yaklaşık', u.soyle.includes('Deneb') && u.soyle.includes('yaklaşık 1.400') && u.soyle.includes('1.250 ile 1.650'), u.soyle);
  const s = ar({ istek: 'yildiz', ad: '' });
  ok('şu yıldız: seçili', s.soyle.startsWith('Vega, Lir takımyıldızında; 25 ışık yılı uzakta. Gördüğünüz ışık 2001 yılında yola çıktı.'), s.soyle);
  const d = ar({ istek: 'yildiz', ad: 'deneb' });
  ok('adıyla yıldız', d.yildiz?.hip === 102098, d.soyle);
  const yok = ar({ istek: 'yildiz', ad: 'Betelgeuse' });
  ok('fotoğrafta olmayan yıldız uydurulmaz', !!yok.hata && !yok.soyle, yok.hata);
  const j = ar({ istek: 'yildiz', ad: 'Jüpiter' });
  ok('gezegene yıldız sorusu', !!j.gezegen && !/\d/.test(j.soyle), j.soyle);
  ok('ekranda vurgu', yayin.some((e: any) => e.type === 'gok_cmd' && e.cmd.tip === 'vurgula' && e.cmd.hedef === 102098));
  // Cümledeki her sayı bağlamdan gelmeli
  const tum = JSON.stringify(ctx);
  const sayilar = [g, p, u, s, d].flatMap(x => String(x.soyle).match(/\d[\d.,]*\d|\d/g) ?? []);
  ok('cümlelerde uydurma sayı yok', sayilar.every(sy => tum.includes(sy) || tum.includes(sy.replace(',', '.')) || ['35', '20', '2,6', '−2,6'].includes(sy)), sayilar.join(' '));
}
setGokRequest(null);

// 4) Sesli istekler
{
  const t = (s: string) => gokNiyet(s);
  ok('niyet: tara', t('Jarvis gökyüzünü tara')?.istek === 'tara');
  ok('niyet: gezegenler', t('bu gece hangi gezegenler görünüyor')?.istek === 'gezegenler');
  ok('niyet: en parlak', t('en parlak yıldız hangisi')?.istek === 'en_parlak');
  ok('niyet: şu yıldız', t('şu yıldızın ışığı ne zaman yola çıktı')?.istek === 'yildiz' && t('şu yıldızın ışığı ne zaman yola çıktı')?.ad === '');
  ok('niyet: en uzak', t('en uzaktaki yıldızı göster')?.istek === 'en_uzak');
  ok('niyet: alakasız', t('dolar kaç') === null);
}

// 5) astrometry.net akışı (sahte servis): login → upload (gizlilik bayrakları) → submission → job → sonuçlar
{
  const istekler: { url: string; body?: any }[] = [];
  const gercek = globalThis.fetch;
  let jobSorgu = 0;
  globalThis.fetch = (async (u: any, init?: any) => {
    const url = String(u);
    istekler.push({ url, body: init?.body });
    const j = (o: object) => new Response(JSON.stringify(o), { status: 200 });
    if (url.endsWith('/api/login')) return j({ status: 'success', session: 'S1' });
    if (url.endsWith('/api/upload')) return j({ status: 'success', subid: 7 });
    if (url.endsWith('/api/submissions/7')) return j({ jobs: [42] });
    if (url.endsWith('/api/jobs/42')) return j({ status: ++jobSorgu > 1 ? 'success' : 'solving' });
    if (url.endsWith('/api/jobs/42/calibration/')) return j({ ra: 280, dec: 38, radius: 30, pixscale: 90, orientation: 10, parity: 1 });
    if (url.endsWith('/api/jobs/42/annotations/')) return j({ annotations: [{ type: 'bright', names: ['Vega'], pixelx: 10, pixely: 20 }] });
    if (url.endsWith('/api/jobs/42/objects_in_field/')) return j({ objects_in_field: ['Vega'] });
    if (url.endsWith('/wcs_file/42')) return new Response("CTYPE1  = 'RA---TAN'           ".padEnd(80) + 'CRVAL1  =                280.0'.padEnd(80) + 'END'.padEnd(80));
    return new Response('?', { status: 404 });
  }) as typeof fetch;
  const app = (await import('express')).default();
  app.use((await import('express')).default.json({ limit: '5mb' }));
  app.use(gokRouter());
  const srv = app.listen(0);
  const port = (srv.address() as any).port;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 8, 0x45, 0x78, 0x69, 0x66, 0, 0, 0xff, 0xda, 0, 4, 1, 2, 9, 9, 0xff, 0xd9]);
  const yerel = (p: string, init?: RequestInit) => gercek(`http://127.0.0.1:${port}${p}`, init).then(r => r.json());
  const bas = await yerel('/api/gok/coz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resim: `data:image/jpeg;base64,${jpeg.toString('base64')}`, w: 2000, h: 1500 }) });
  let d: any = null;
  for (let i = 0; i < 40 && (!d || !['tamam', 'hata', 'cozulemedi'].includes(d.durum)); i++) { await new Promise(r => setTimeout(r, 500)); d = await yerel(`/api/gok/coz/${bas.id}`); }
  ok('çözüm tamamlandı', d?.durum === 'tamam' && d.cozum.jobId === 42 && d.cozum.wcs.includes('CRVAL1'), `${d?.durum} · ${d?.mesaj}`);
  const up = istekler.find(r => r.url.endsWith('/api/upload'))!;
  const rj = JSON.parse(await ((up.body as FormData).get('request-json') as Blob).text());
  ok('gizlilik bayrakları', rj.publicly_visible === 'n' && rj.allow_commercial_use === 'n' && rj.allow_modifications === 'n' && rj.session === 'S1');
  ok('ölçek ipucu (telefon)', rj.scale_units === 'degwidth' && rj.scale_lower === 20 && rj.scale_upper === 90);
  const dosya = await ((up.body as FormData).get('file') as Blob).arrayBuffer();
  ok('yüklenen dosyada EXIF yok', !Buffer.from(dosya).toString('latin1').includes('Exif'), `${dosya.byteLength} bayt`);
  const ikinci = await yerel('/api/gok/coz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resim: `data:image/jpeg;base64,${jpeg.toString('base64')}`, w: 2000, h: 1500 }) });
  ok('aynı fotoğraf önbellekten', ikinci.durum === 'tamam' && ikinci.onbellek === true);
  srv.close();
  globalThis.fetch = gercek;
}

console.log(`${n - fail}/${n} gökyüzü sunucu testi geçti`);
if (fail) process.exit(1);
process.exit(0);
