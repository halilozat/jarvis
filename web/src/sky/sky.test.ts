// Gece Gökyüzü testleri. Çalıştır: npm run test:gok
// Projeksiyon doğruluğu iki GERÇEK astrometry.net çözümüyle ölçülür (fixtures/: WCS + annotations; görüntü yok):
// katalogdan yansıttığımız yıldızlar astrometry.net'in kendi işaretlediği piksellerle örtüşmeli.
// Gezegenler bilinen kavuşumlarla, ufuk hesabı Kutup Yıldızı'nın irtifasıyla, ışık yolculuğu Hipparcos değerleriyle sınanır.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gokCisimleri, yildizUfuk } from './gezegen';
import { isikHesapla, olayEsle, olayYiliYaz, uzaklikYaz, yilYaz, yolaCikisYaz } from './isik';
import { katalogKur } from './katalog';
import { annotationBul, sahneKur, sapmaOlc, type Annotation } from './sahne';
import { aciUzaklik, gokPiksel, pikselGok, wcsKalibrasyondan, wcsOku, wcsOlcekle } from './wcs';

let fail = 0, n = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  n++;
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗'} ${name} · ${detail}`);
};

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const oku = (f: string) => JSON.parse(fs.readFileSync(path.join(KOK, f), 'utf8'));
const katalog = katalogKur(oku('public/gok/yildizlar.json'), oku('public/gok/takimyildizlar.json'), oku('public/gok/olaylar.json'));
const yildiz = (ad: string) => katalog.yildizlar.find(y => y.ad === ad)!;
const ISTANBUL = { lat: 41.0082, lon: 28.9784 };

// 1) Katalog
{
  const v = yildiz('Vega');
  ok('katalog', katalog.yildizlar.length > 800 && Object.keys(katalog.takimyildizlar).length === 88, `${katalog.yildizlar.length} yıldız · ${Object.keys(katalog.takimyildizlar).length} takımyıldız`);
  ok('Vega kataloğu', Math.abs(v.ra - 279.2346) < 0.001 && Math.abs(v.dec - 38.7837) < 0.001 && v.paralaks === 130.23, `RA ${v.ra} Dec ${v.dec} · paralaks ${v.paralaks} ± ${v.paralaksHata} mas`);
  ok('Türkçe adlar', katalog.takimyildizlar.UMa.ad === 'Büyükayı' && katalog.takimyildizlar.Ori.ad === 'Avcı' && katalog.takimyildizlar.Cas.ad === 'Kraliçe' && !!yildiz('Kutup Yıldızı'), 'Büyükayı · Avcı · Kraliçe · Kutup Yıldızı');
}

// 2) Gerçek astrometry.net çözümleri: katalogdan yansıtılan piksel = astrometry.net annotations
for (const [id, enAz] of [['16000029', 3], ['16000502', 30]] as const) {
  const f = oku(`src/sky/fixtures/job${id}.json`) as { wcs: string; annotations: Annotation[]; calibration: any };
  const wcs = wcsOku(f.wcs);
  const s = sahneKur({ wcs, katalog, cekim: new Date('2026-06-05T00:00:00Z'), konum: ISTANBUL });
  const sp = sapmaOlc(s, f.annotations)!;
  ok(`iş ${id}: annotations ile örtüşme`, sp.eslesen >= enAz && sp.enBuyuk < 1.5, `${sp.eslesen} yıldız eşleşti · ortanca ${sp.ortanca.toFixed(2)} px · en büyük ${sp.enBuyuk.toFixed(2)} px (görüntü ${wcs.w}×${wcs.h})`);
  const a = s.yildizlar.find(y => y.ad === 'Antares')!;
  const an = annotationBul(a, f.annotations)!;
  ok(`iş ${id}: Antares`, Math.hypot(an.pixelx - 1 - a.x, an.pixely - 1 - a.y) < 1, `hesap (${a.x.toFixed(1)}, ${a.y.toFixed(1)}) · astrometry.net (${(an.pixelx - 1).toFixed(1)}, ${(an.pixely - 1).toFixed(1)})`);
  // calibration özetinden kurulan TAN (WCS dosyası gelmezse): bozulmasız olduğu için kenarda birkaç piksel sapar
  const wk = wcsKalibrasyondan(f.calibration, wcs.w, wcs.h);
  const p = gokPiksel(wk, a.ra, a.dec)!;
  const d = Math.hypot(p.x - a.x, p.y - a.y);
  ok(`iş ${id}: yalnızca calibration ile`, d < wcs.w * 0.01, `Antares ${d.toFixed(1)} px sapma (görüntünün %${((d / wcs.w) * 100).toFixed(2)}'i)`);
  // Geri dönüş: piksel → gök → piksel
  let en = 0;
  for (const y of s.yildizlar) { const g = pikselGok(wcs, y.x, y.y); const q = gokPiksel(wcs, g.ra, g.dec)!; en = Math.max(en, Math.hypot(q.x - y.x, q.y - y.y)); }
  ok(`iş ${id}: piksel ↔ gök`, en < 0.6, `en büyük ${en.toFixed(3)} px (SIP ters katsayıları yaklaşık)`);
  // Ölçekleme: çözüm küçültülmüş görüntüde de geçerli
  const k = 0.37, wk2 = wcsOlcekle(wcs, Math.round(wcs.w * k), Math.round(wcs.h * k));
  const q = gokPiksel(wk2, a.ra, a.dec)!;
  const bek = { x: (a.x + 0.5) * (wk2.w / wcs.w) - 0.5, y: (a.y + 0.5) * (wk2.h / wcs.h) - 0.5 };
  ok(`iş ${id}: ölçekli WCS`, Math.hypot(q.x - bek.x, q.y - bek.y) < 0.5, `${wk2.w}×${wk2.h}: (${q.x.toFixed(1)}, ${q.y.toFixed(1)}) · beklenen (${bek.x.toFixed(1)}, ${bek.y.toFixed(1)})`);
  if (id === '16000502') {
    ok('geniş alan: kabul ölçütü', s.yildizlar.length >= 10 && s.takimyildizlar.length >= 1, `${s.yildizlar.length} yıldız · takımyıldızlar: ${s.takimyildizlar.map(t => t.ad).join(', ')} · alan ${s.alan.map(x => x.toFixed(0)).join('×')}°`);
  }
}

// 3) Vega ve Kutup Yıldızı: kendi merkezli bir çözümde tam ortada, ufuk hesabıyla doğru yükseklikte
for (const ad of ['Vega', 'Kutup Yıldızı']) {
  const y = yildiz(ad);
  const w = wcsKalibrasyondan({ ra: y.ra, dec: y.dec, orientation: 30, pixscale: 90, parity: 1 }, 2000, 1500);
  const p = gokPiksel(w, y.ra, y.dec)!;
  ok(`${ad} merkezde`, Math.abs(p.x - 999.5) < 1e-6 && Math.abs(p.y - 749.5) < 1e-6, `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`);
}
{
  const u = yildizUfuk(yildiz('Kutup Yıldızı').ra, yildiz('Kutup Yıldızı').dec, new Date('2026-11-02T20:00:00Z'), ISTANBUL);
  const az = u.azimut > 180 ? u.azimut - 360 : u.azimut;
  ok('Kutup Yıldızı İstanbul\'da', Math.abs(u.irtifa - ISTANBUL.lat) < 1.2 && Math.abs(az) < 1.5, `irtifa ${u.irtifa.toFixed(2)}° (enlem ${ISTANBUL.lat}°) · azimut ${az.toFixed(2)}°`);
}

// 4) Gezegenler: bilinen kavuşumlar (yer merkezli; 0,5° ve 0,3° civarı) ve ufuk hesabının tutarlılığı
{
  const ayrim = (t: string, a: string, b: string) => {
    const c = gokCisimleri(new Date(t), ISTANBUL);
    const x = c.find(o => o.id === a)!, y = c.find(o => o.id === b)!;
    return aciUzaklik(x.ra, x.dec, y.ra, y.dec);
  };
  const vj = ayrim('2023-03-02T00:00:00Z', 'venus', 'jupiter');
  ok('Venüs–Jüpiter kavuşumu (2 Mart 2023)', vj < 0.7, `${vj.toFixed(2)}° ayrım`);
  const mj = ayrim('2024-08-14T12:00:00Z', 'mars', 'jupiter');
  ok('Mars–Jüpiter kavuşumu (14 Ağustos 2024)', mj < 0.5, `${mj.toFixed(2)}° ayrım`);
  const t = new Date('2026-11-02T21:00:00Z');
  const c = gokCisimleri(t, ISTANBUL);
  let en = 0;
  for (const o of c) { const u = yildizUfuk(o.ra, o.dec, t, ISTANBUL); en = Math.max(en, Math.abs(u.irtifa - o.irtifa)); }
  ok('gezegen irtifası iki yoldan aynı', en < 0.05, `en büyük fark ${en.toFixed(4)}°`);
  ok('gezegen listesi', c.length === 6 && c.every(o => Number.isFinite(o.kadir)), c.map(o => `${o.ad} ${o.irtifa > 0 ? '↑' : '↓'}${o.irtifa.toFixed(0)}° k${o.kadir.toFixed(1)}`).join(' · '));
  // Kadrajın ortasındaki Jüpiter: WCS ile tam merkeze düşer, renkli halka için sahnede ayrı listede
  const j = c.find(o => o.id === 'jupiter')!;
  const w = wcsKalibrasyondan({ ra: j.ra, dec: j.dec, orientation: 0, pixscale: 80, parity: 1 }, 2000, 1500);
  const s = sahneKur({ wcs: w, katalog, cekim: t, konum: ISTANBUL });
  const sj = s.cisimler.find(o => o.id === 'jupiter');
  ok('Jüpiter fotoğrafta', j.irtifa > 0 ? !!sj && Math.hypot(sj.x - 999.5, sj.y - 749.5) < 1e-6 : !sj, j.irtifa > 0 ? `irtifa ${j.irtifa.toFixed(1)}°, merkezde` : 'ufkun altında: gösterilmiyor');
  const yer = { lat: -33.9, lon: 151.2 }; // Sidney: aynı anda başka gökyüzü
  const s2 = sahneKur({ wcs: w, katalog, cekim: t, konum: yer });
  const j2 = gokCisimleri(t, yer).find(o => o.id === 'jupiter')!;
  ok('ufkun altındaki gezegen gizli', j2.irtifa > 0 ? !!s2.cisimler.find(o => o.id === 'jupiter') : !s2.cisimler.find(o => o.id === 'jupiter'), `Sidney'de Jüpiter irtifası ${j2.irtifa.toFixed(1)}°`);
}

// 5) Işık yolculuğu ve olaylar
{
  const t = new Date('2026-11-02T21:00:00Z');
  const v = isikHesapla(yildiz('Vega'), t)!;
  ok('Vega uzaklığı', Math.abs(v.uzaklik - 25.04) < 0.05 && !v.yaklasik, `${uzaklikYaz(v)} · yola çıkış ${yolaCikisYaz(v)}`);
  const vo = olayEsle(v, katalog.olaylar)!;
  ok('Vega olayı', vo.olay.yil === 2000 && vo.cumle.startsWith('Bu ışık, '), vo.cumle);
  const b = isikHesapla(yildiz('Betelgeuse'), t)!;
  ok('Betelgeuse yaklaşık', b.yaklasik && b.aralik[1] !== null && b.aralik[1] > b.aralik[0], `${uzaklikYaz(b)} · ${yolaCikisYaz(b)} · ${olayEsle(b, katalog.olaylar)!.cumle}`);
  const d = isikHesapla(yildiz('Deneb'), t)!;
  ok('Deneb yaklaşık', d.yaklasik, `${uzaklikYaz(d)} · ${olayEsle(d, katalog.olaylar)!.cumle}`);
  const sirius = isikHesapla(yildiz('Sirius'), t)!;
  ok('Sirius kesin', !sirius.yaklasik && Math.abs(sirius.uzaklik - 8.6) < 0.05, `${uzaklikYaz(sirius)} · ${olayEsle(sirius, katalog.olaylar)!.cumle}`);
  // Cümle kalıpları
  const ol = katalog.olaylar;
  const fetih = (yil: number, yaklasik = false) => olayEsle({ uzaklik: 0, aralik: [0, 0], goreliHata: 0, yaklasik, yil, yilAralik: [yil - 60, yil + 60] }, ol)!.cumle;
  ok('cümle: tam yıl', fetih(1453) === 'Bu ışık, İstanbul fethedilirken yola çıktı.', fetih(1453));
  ok('cümle: sonra', fetih(1446) === 'Bu ışık yola çıktıktan 7 yıl sonra İstanbul fethedildi.', fetih(1446));
  ok('cümle: önce', fetih(1460) === "Bu ışık yola çıktığında İstanbul'un fethi 7 yıl geride kalmıştı.", fetih(1460));
  ok('cümle: belirsiz aralıkta', fetih(1446, true) === 'Bu ışık, aşağı yukarı İstanbul fethedilirken yola çıktı.', fetih(1446, true));
  const sezar = olayEsle({ uzaklik: 0, aralik: [0, 0], goreliHata: 0, yaklasik: false, yil: -43, yilAralik: [-43, -43] }, ol)!;
  ok('MÖ yılları', sezar.olay.yil === -44 && sezar.fark === 0 && yilYaz(-43) === 'MÖ 44' && olayYiliYaz(-44) === 'MÖ 44', `astronomik -43 = MÖ 44 · ${sezar.cumle}`);
  const sirali = ol.every((o, i) => i === 0 || ol[i - 1].yil <= o.yil);
  ok('olay listesi', ol.length >= 50 && sirali && ol.every(o => o.ad && o.iken && o.oldu), `${ol.length} olay · MÖ ${-ol[0].yil} → ${ol.at(-1)!.yil}`);
}

console.log(`${n - fail}/${n} gökyüzü testi geçti`);
if (fail) throw new Error(`${fail} gökyüzü testi başarısız`);
