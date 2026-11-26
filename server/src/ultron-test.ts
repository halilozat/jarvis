// Ultron Paketi · sunucu testleri (ağ yok; kaydedilmiş örnek yanıtlar). Çalıştır: npm run test:ultron (server/)
// Kapsam: her veri servisinin ayrıştırması, kaynak çökünce "VERİ YOK" / "eski veri", anlatımdaki her sayının özet JSON'la
// eşleşmesi (uyuşmazlıkta şablona düşme), haversine, uydu konumu (bilinen TLE + zaman → referans), tehlike skoru, komutlar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sat from 'satellite.js';
import { afadAyristir, firmsAyristir, havaAyristir, Katman, kandilliAyristir, openskyAyristir, siberOzet, tleAyristir, trOzet, usgsAyristir } from './ultron/goz/katmanlar.js';
import { haversine, ilgiEki, karadaMi, noktaAdi, usgsYer } from './ultron/goz/cografya.js';
import { anlat, niyet, sablon, sayilar, sayilarTutarli, type Konu } from './ultron/goz/anlatim.js';
import { cevreOzeti, dunyaOzeti, enTehlikeliYer, uyduKonumu, type Katmanlar } from './ultron/goz/ozet.js';

let fail = 0, n = 0;
const ok = (ad: string, k: boolean, a = '') => { n++; if (!k) fail++; console.log(`${k ? '✓' : '✗'} ${ad}${a ? ` · ${a}` : ''}`); };
const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ultron', 'goz', 'fixtures');
const oku = (f: string) => fs.readFileSync(path.join(FX, f), 'utf8');

// ---------------------------------------------------------------- Ayrıştırma
{
  const j = JSON.parse(oku('usgs-all_hour.json'));
  const simdi = j.metadata.generated;
  const r = usgsAyristir(j, simdi);
  ok('USGS: bütün depremler okunur', r.items.length === j.features.filter((f: any) => typeof f.properties.mag === 'number').length, `${r.items.length}`);
  ok('USGS: son 1 saat sayısı', r.summary.quakes_1h === r.items.filter(d => simdi - d.t <= 3_600_000).length);
  ok('USGS: en büyük', r.summary.max_mag_24h === Math.max(...r.items.map(d => Math.round(d.mag * 10) / 10)));
  ok('USGS: yer adı Türkçeleşir', r.items.every(d => !/ km [NSEW]{1,3} of /.test(d.yer)), r.items[0]?.yer);
}
{
  const a = afadAyristir(JSON.parse(oku('afad.json')));
  ok('AFAD: 25 olay, UTC zaman', a.length === 25 && a.every(d => Number.isFinite(d.t) && d.lat > 30 && d.lat < 45));
  const o = trOzet(a, 'AFAD', Math.max(...a.map(d => d.t)) + 60_000);
  ok('AFAD: özet', o.summary.tr_quakes_24h === a.length && o.summary.tr_max_mag === Math.max(...a.map(d => Math.round(d.mag * 10) / 10)));
  const k = kandilliAyristir(oku('kandilli.txt'));
  ok('Kandilli: sabit sütunlar okunur', k.length >= 25 && k.every(d => d.mag > 0 && d.yer.length > 2), `${k.length} · ${k[0]?.yer} ${k[0]?.mag}`);
  ok('Kandilli: Türkiye saati → UTC', k.every(d => new Date(d.t).getUTCHours() >= 0) && k[0].t < Date.now() + 86_400_000);
}
{
  const j = JSON.parse(oku('opensky-turkiye.json'));
  const r = openskyAyristir(j, 5000);
  const havada = j.states.filter((s: any) => s[8] !== true && typeof s[6] === 'number').length;
  ok('OpenSky: yerdekiler sayılmaz', r.summary.flights_now === havada, `${havada}`);
  ok('OpenSky: Türkiye kutusu', (r.summary.tr_flights as number) > 0 && (r.summary.tr_flights as number) <= havada);
  const az = openskyAyristir(j, 10);
  ok('OpenSky: dünya görünümünde örnekleme', az.items.length <= Math.max(10, az.summary.tr_flights as number) && az.summary.flights_now === havada);
}
{
  const r = firmsAyristir(oku('firms.csv'));
  ok('FIRMS: düşük güvenli tespit sayılmaz', r.summary.fires_24h === 4);
  ok('FIRMS: Amazon ve Türkiye', r.summary.fires_24h_amazon === 2 && r.summary.fires_24h_tr === 1);
  let hata = '';
  try { firmsAyristir('Invalid MAP_KEY.'); } catch (e) { hata = (e as Error).message; }
  ok('FIRMS: geçersiz anahtar açık hata', /Invalid MAP_KEY/.test(hata), hata);
}
{
  const u = tleAyristir(oku('celestrak-stations.txt'), 'istasyon');
  ok('CelesTrak: TLE üçlüleri', u.length >= 10 && u.some(x => x.ad.startsWith('ISS (ZARYA)')), `${u.length}`);
}
{
  const s = [{ ad: 'İstanbul', lat: 41.01, lon: 28.97 }, { ad: 'Ankara', lat: 39.93, lon: 32.86, ev: true }];
  const r = havaAyristir(JSON.parse(oku('open-meteo.json')), s);
  ok('Open-Meteo: çoklu konum', r.items.length === 2 && typeof r.items[0].sicaklik === 'number' && r.summary.home_city === 'Ankara');
}
{
  const bugun = new Date().toISOString();
  const r = siberOzet([
    { zaman: bugun, seviye: 'tehlikeli', linkler: [{}, {}] }, { zaman: bugun, seviye: 'supheli', linkler: [{}] },
    { zaman: bugun, seviye: 'temiz', linkler: [{}] }, { zaman: bugun, seviye: 'tehlikeli', linkler: [{}], demo: true },
    { zaman: '2020-01-01T10:00:00Z', seviye: 'tehlikeli', linkler: [{}] },
  ], 1588, null);
  ok('Siber: yalnızca bugünün gerçek şüpheli kayıtları', r.summary.malicious_messages_today === 2 && r.summary.malicious_links_today === 3 && r.summary.usom_list_size === 1588);
  ok('Siber: içerik yok, yalnızca sayılar', r.items.length === 0 && Object.values(r.summary).every(v => v == null || typeof v === 'number'));
}

// ---------------------------------------------------------------- Kaynak çökünce
{
  let calis = false;
  const k = new Katman<number>('deprem_dunya', 'USGS', () => 0, async () => { if (!calis) throw new Error('bağlantı yok'); return { kaynak: 'USGS', items: [1], summary: { quakes_1h: 3 } }; });
  const a = await k.getir();
  ok('Kaynak çöktü, önceki veri yok → VERİ YOK', a.durum === 'yok' && a.items.length === 0 && Object.keys(a.summary).length === 0);
  calis = true;
  const b = await k.getir(fetch, true);
  ok('Kaynak geldi → ok', b.durum === 'ok' && b.summary.quakes_1h === 3);
  calis = false;
  const c = await k.getir(fetch, true);
  ok('Kaynak yeniden çöktü → son veri "eski" etiketiyle', c.durum === 'eski' && c.summary.quakes_1h === 3 && !!c.hata);
  const oz = dunyaOzeti({ deprem_dunya: a }, null);
  ok('VERİ YOK katmanından anlatıma sayı girmez', !('quakes_1h' in oz));
}

// ---------------------------------------------------------------- Mesafe ve coğrafya
{
  const d = haversine(41.0082, 28.9784, 39.9334, 32.8597);
  ok('Haversine: İstanbul–Ankara ≈ 350 km', Math.abs(d - 350) < 5, d.toFixed(1));
  ok('Haversine: aynı nokta 0', haversine(10, 10, 10, 10) === 0);
  ok('Haversine: kutuptan kutba ≈ 20.015 km', Math.abs(haversine(90, 0, -90, 0) - 20015) < 5);
  ok('Kara/deniz: Ankara kara, Akdeniz deniz', karadaMi(39.9, 32.9) && !karadaMi(34, 20));
  ok('Nokta adı: Hint Okyanusu', noktaAdi(-20, 80).ad === 'Hint Okyanusu');
  ok('USGS yer: "204 km S of Taliwang, Indonesia"', usgsYer('204 km S of Taliwang, Indonesia') === "Endonezya, Taliwang'ın 204 km güneyinde", usgsYer('204 km S of Taliwang, Indonesia'));
  ok('İlgi eki: Kobe → Kobe\'nin', ilgiEki('Kobe') === "Kobe'nin");
  const ev = { ad: 'Denizli', lat: 37.78, lon: 29.09 };
  const k: Katmanlar = { deprem_tr: { ad: 'deprem_tr', kaynak: 'AFAD', updatedAt: '', durum: 'ok', items: [{ id: 'a', lat: 38.4, lon: 27.1, mag: 2.1, yer: 'Bornova (İzmir)', t: Date.now(), derinlik: 7 }, { id: 'b', lat: 39.9, lon: 32.8, mag: 3.0, yer: 'Ankara', t: Date.now(), derinlik: 7 }], summary: {} } };
  const c = cevreOzeti(k, ev);
  ok('En yakın deprem: mesafe ve büyüklük', c.nearest_quake_place === 'Bornova (İzmir)' && c.nearest_quake_km === Math.round(haversine(37.78, 29.09, 38.4, 27.1)) && c.near_quakes_24h === 1);
}

// ---------------------------------------------------------------- Uydu konumu
{
  // Vallado (2006) SGP4 doğrulama: 00005 numaralı uydu, tsince = 0 → r = (7022.46529266, −1400.08296755, 0.03995155) km
  const rec = sat.twoline2satrec('1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753', '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667');
  const p = sat.sgp4(rec, 0);
  const r = p && typeof p.position !== 'boolean' ? p.position : null;
  const fark = r ? Math.hypot(r.x - 7022.46529266, r.y - -1400.08296755, r.z - 0.03995155) : Infinity;
  ok('SGP4: referans konum (Vallado 00005, t=0)', fark < 0.01, `${fark.toExponential(2)} km`);
  const p2 = sat.sgp4(rec, 360);
  const r2 = p2 && typeof p2.position !== 'boolean' ? p2.position : null;
  const fark2 = r2 ? Math.hypot(r2.x - -7154.03120202, r2.y - -3783.17682504, r2.z - -3536.19412294) : Infinity;
  ok('SGP4: referans konum (Vallado 00005, t=360 dk)', fark2 < 0.01, `${fark2.toExponential(2)} km`);
  const iss = tleAyristir(oku('celestrak-stations.txt'), 'istasyon').find(x => x.ad.startsWith('ISS'))!;
  const k = uyduKonumu(iss, new Date());
  ok('ISS: enlem eğimi (51,6°) içinde, irtifa 350–450 km', !!k && Math.abs(k.lat) <= 51.7 && k.km > 350 && k.km < 450, k ? `${k.lat.toFixed(1)}, ${k.lon.toFixed(1)}, ${k.km.toFixed(0)} km` : '');
}

// ---------------------------------------------------------------- Tehlike skoru
{
  const s = Date.now();
  const k: Katmanlar = {
    deprem_dunya: { ad: 'deprem_dunya', kaynak: 'USGS', updatedAt: '', durum: 'ok', summary: {}, items: [
      { id: '1', lat: -10, lon: 117, mag: 6.2, yer: 'Endonezya', t: s, derinlik: 10 }, { id: '2', lat: -11, lon: 118, mag: 4.6, yer: 'Endonezya', t: s, derinlik: 10 },
      { id: '3', lat: 38, lon: 142, mag: 4.4, yer: 'Japonya', t: s, derinlik: 10 }] },
    yangin: { ad: 'yangin', kaynak: 'FIRMS', updatedAt: '', durum: 'ok', summary: {}, items: Array.from({ length: 300 }, () => [-8, -62, 5]) },
    haber: { ad: 'haber', kaynak: 'Haber', updatedAt: '', durum: 'ok', summary: {}, items: [{ baslik: 'x', kaynak: 'y', zaman: '', yer: 'Gazze', lat: 31.5, lon: 34.47, sonDakika: true }] },
  };
  const t = enTehlikeliYer(k, { hucre_derece: 15, agirlik: { deprem: 1, yangin: 0.6, haber: 0.8, hava: 1.5 }, min_buyukluk: 4 })!;
  ok('Tehlike: büyük deprem hücresi seçilir', t.ad === 'Endonezya' && t.gerekce.deprem === 2 && t.gerekce.en_buyuk === 6.2, `${t.ad} ${t.skor}`);
  ok('Tehlike: skor = Σ(M−3)²', Math.abs(t.skor - ((6.2 - 3) ** 2 + (4.6 - 3) ** 2)) < 0.01);
  const t2 = enTehlikeliYer(k, { hucre_derece: 15, agirlik: { deprem: 0.1, yangin: 0.6, haber: 0.8, hava: 1.5 }, min_buyukluk: 4 })!;
  ok('Tehlike: ağırlıklar ayarlanabilir (yangın öne geçer)', t2.gerekce.yangin === 300, `${t2.ad} ${t2.skor}`);
  ok('Tehlike: veri yoksa null', enTehlikeliYer({}, { hucre_derece: 15, agirlik: { deprem: 1, yangin: 1, haber: 1, hava: 1 }, min_buyukluk: 4 }) === null);
}

// ---------------------------------------------------------------- Anlatım: rakamlar koddan
{
  const o = { flights_now: 11482, quakes_1h: 23, nearest_quake_km: 140, nearest_quake_mag: 3.8, home_city: 'Denizli', fires_24h_amazon: 340, malicious_links_today: 57, iss_over: 'Hint Okyanusu' };
  ok('Sayı ayrıştırma: 11.482 ve 3,8', JSON.stringify(sayilar('11.482 uçak, 3,8 büyüklük, 140 km')) === '[11482,3.8,140]');
  ok('Tutarlı metin geçer', sayilarTutarli('Şu an gökyüzünde 11.482 uçak var. Son bir saatte 23 deprem oldu; biri 140 kilometre uzakta, büyüklüğü 3,8.', o).ok);
  ok('Uydurma sayı reddedilir', !sayilarTutarli('Şu an 12.000 uçak var.', o).ok);
  ok('Yazıyla sayı reddedilir', !sayilarTutarli('Yüzlerce yangın var.', o).ok && !sayilarTutarli('İki deprem oldu.', o).ok);
  ok('"bir" kelimesi sayı sayılmaz', sayilarTutarli('Bir şey daha: 23 deprem.', o).ok);
  const sahte = async () => 'Şu an 99.999 uçak var ve 12 deprem oldu.';
  const a1 = await anlat('acilis', o, sahte);
  ok('Uydurma LLM çıktısı → şablon', a1.kaynak === 'sablon' && a1.metin === sablon('acilis', o) && /uydurma/.test(a1.red ?? ''), a1.red);
  const iyi = async () => 'Gökyüzünde 11.482 uçak süzülüyor. Son bir saatte 23 deprem. Her şeyi görüyorum.';
  const a2 = await anlat('acilis', o, iyi);
  ok('Doğru LLM çıktısı kullanılır', a2.kaynak === 'llm');
  const a3 = await anlat('acilis', o, async () => { throw new Error('zaman aşımı'); });
  ok('LLM hatası → şablon', a3.kaynak === 'sablon');
  ok('LLM yok → şablon', (await anlat('acilis', o, null)).kaynak === 'sablon');
  ok('Açılış şablonu', /11\.482 uçak/.test(sablon('acilis', o)) && /Amazon'da 340/.test(sablon('acilis', o)) && /Hint Okyanusu/.test(sablon('acilis', o)), sablon('acilis', o));
  // Her şablonun kendi sayıları JSON'da olmalı
  const genis = { ...o, tr_quakes_24h: 160, tr_max_mag: 3.1, tr_max_place: 'Sivrice (Elazığ)', tr_flights: 182, fires_24h_tr: 3, hottest_city: 'Antalya', hottest_temp: 19.2, coldest_city: 'Erzurum', coldest_temp: -1.1, breaking_now: 5, near_quakes_24h: 4, radius_km: 300, flights_overhead: 5, near_fires: 0, home_temp: 10.8, home_alerts: 'yok', max_mag_24h: 5.5, max_place_24h: 'Endonezya', quakes_24h: 223, iss_km: 421, turk_uydu: 10, malicious_messages_today: 3, usom_list_size: 1588, fires_24h: 4000, weather_alerts: 2, danger_place: 'Endonezya', danger_quakes: 2, danger_max_mag: 6.2, danger_fires: 0, danger_score: 12.8 };
  for (const k of ['acilis', 'turkiye', 'cevre', 'deprem', 'iss', 'turksat', 'ucus', 'siber', 'yangin', 'hava', 'tehlike'] as Konu[]) {
    const m = sablon(k, genis);
    ok(`Şablon sayıları JSON'da: ${k}`, sayilarTutarli(m, genis).ok, sayilarTutarli(m, genis).yabanci.join(',') || m.slice(0, 60));
  }
  ok('Veri yoksa söyler, uydurmaz', sablon('acilis', {}) === 'Bu konuda şu an elimde veri yok.');
}

// ---------------------------------------------------------------- Komutlar
{
  const c = (m: string) => JSON.stringify(niyet(m));
  ok('Komut: dünyayı göster', niyet('Ultron, dünyayı göster').tip === 'ac');
  ok('Komut: Jarvis\'i geri getir', niyet("Jarvis'i geri getir").tip === 'kapat');
  ok('Komut: Türkiye', c("Ultron, Türkiye'de şu an ne oluyor?").includes('turkiye'));
  ok('Komut: çevrem', c('Ultron, çevremde ne var?').includes('cevre'));
  ok('Komut: en büyük deprem', c('Şu an en büyük deprem nerede?').includes('deprem'));
  ok('Komut: ISS', c('ISS şu an nerede?').includes('"iss"'));
  ok('Komut: Türksat', c('Türksat uyduları nerede?').includes('turksat'));
  ok('Komut: zararlı link', c('Bugün kaç zararlı link yakalandı?').includes('siber'));
  ok('Komut: kaç uçak', c('Kaç uçak havada?').includes('ucus'));
  ok('Komut: en tehlikeli', c('Dünyanın en tehlikeli yeri neresi?').includes('tehlike'));
  ok('Komut: katmanı kapat', c('Katmanı kapat: uçuşlar') === JSON.stringify({ tip: 'katman', islem: 'kapat', katman: 'ucus' }));
  ok('Komut: sadece depremler', c('Sadece depremleri göster') === JSON.stringify({ tip: 'katman', islem: 'sadece', katman: 'deprem' }));
}

console.log(`\n${n - fail}/${n} geçti`);
process.exit(fail ? 1 : 0);
