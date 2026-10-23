// Uzay Laboratuvarı fizik testleri. Çalıştır: npm run test:lab
// Enerji korunumu, Hohmann, denge sıcaklığı, kaçış/bağlı ayrımı, ışık süresi (astronomy-engine ile), ölçek dönüşümü.
import { Body as AB, GeoVector } from 'astronomy-engine';
import { GUNES_YARICAP_AU, VERI } from './data';
import { indeks, sistem } from './ephemeris';
import { ADIM, C, G, Sim, daireselHiz, dengeT, elements, hohmannGun, isikSn, tahmin, YIL_GUN } from './physics';
import { Olcek } from './scale';

let fail = 0, n = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  n++;
  if (!cond) fail++;
  console.log(`${cond ? '✓' : '✗'} ${name} · ${detail}`);
};

const DATE = new Date('2026-10-23T12:00:00Z');

// 1) Enerji: gerçek Güneş sistemi 100 yıl (Dünya'nın 100 turu), çeyrek gün adımla
{
  const s = sistem(DATE);
  const E0 = s.energy();
  const t0 = performance.now();
  s.advance(100, ADIM, 1e7);
  const drift = Math.abs((s.energy() - E0) / E0);
  ok('enerji 100 tur', drift < 0.01, `kayma %${(drift * 100).toExponential(2)} · ${Math.round(performance.now() - t0)} ms`);
  // Dünya hâlâ ≈1 AU'da dönüyor mu
  const el = s.elements(indeks('dunya'));
  ok('Dünya yörüngesi 100 yıl sonra', Math.abs(el.a - 1) < 0.01 && el.e < 0.03, `a ${el.a.toFixed(4)} AU · e ${el.e.toFixed(4)}`);
}

// 2) Zaman geri akar: 10 yıl ileri + 10 yıl geri → başlangıç
{
  const s = sistem(DATE);
  const i = indeks('mars');
  const x0 = s.x[i], y0 = s.y[i];
  s.advance(10); s.advance(-10);
  const d = Math.hypot(s.x[i] - x0, s.y[i] - y0);
  ok('zaman geri sarılır', d < 1e-6, `Mars ${d.toExponential(2)} AU sapma`);
}

// 3) Hohmann Dünya → Mars ≈ 259 gün
{
  const t = hohmannGun(1, 1.524);
  ok('Hohmann Dünya→Mars', Math.abs(t - 259) <= 3, `${t.toFixed(1)} gün`);
}

// 4) Denge sıcaklığı: Dünya ≈ 255 K, sera farkıyla ≈ 15 °C
{
  const T = dengeT(1, VERI.dunya.albedo);
  ok('Dünya denge sıcaklığı', Math.abs(T - 255) <= 3, `${T.toFixed(1)} K`);
  const sera = VERI.dunya.sicaklik + 273.15 - T;
  ok('sera farkı', Math.abs(C(T + sera) - 15) < 0.01 && sera > 30 && sera < 37, `+${sera.toFixed(1)} K → ${C(T + sera).toFixed(1)} °C`);
  const venusYerinde = C(dengeT(0.723, VERI.dunya.albedo) + sera);
  ok("Dünya Venüs'ün yerinde", venusYerinde > 50 && venusYerinde < 70, `${venusYerinde.toFixed(1)} °C (sera sabit)`);
}

// 5) Kaçış / bağlı ayrımı: 1 AU'da dairesel hızın 1,5 katı kaçar, 1,3 katı bağlı kalır; Güneş'e doğru atılan düşer
{
  const mk = () => {
    const s = new Sim(2);
    s.m[0] = 1; s.m[1] = 3e-6;
    s.x[1] = 1;
    return s;
  };
  const vc = daireselHiz(1);
  const kac = tahmin(mk(), 1, 0, vc * 1.5);
  ok('1,5 × dairesel hız: kaçar', kac.sonuc === 'kacti' && !kac.el.bound, `sonuç ${kac.sonuc} · ε ${kac.el.eps.toFixed(2)}`);
  const bag = tahmin(mk(), 1, 0, vc * 1.3);
  ok('1,3 × dairesel hız: bağlı', bag.sonuc === 'yorunge' && bag.el.bound && Math.abs(bag.el.e - 0.69) < 0.01, `e ${bag.el.e.toFixed(3)} · a ${bag.el.a.toFixed(3)} AU`);
  const dus = tahmin(mk(), 1, -2, 0.01);
  ok('Güneşe doğru atılan düşer', dus.sonuc === 'dustu', `sonuç ${dus.sonuc} · günberi ${(dus.el.q / GUNES_YARICAP_AU).toFixed(2)} R☉`);
  // Simülasyonda da: kaçan 45 AU'yu geçer, düşen Güneş'le birleşir
  const s1 = mk(); s1.vy[1] = vc * 1.5; s1.advance(60, 2 / YIL_GUN);
  ok('kaçan cisim uzaklaşır', s1.rSun(1) > 45, `${s1.rSun(1).toFixed(1)} AU`);
  const s2 = mk(); s2.vx[1] = -2; s2.vy[1] = 0.01;
  const r2 = s2.advance(2);
  ok('düşen cisim Güneşle birleşir', r2.fell.includes(1) && s2.gone[1] === 1, `düşenler [${r2.fell}] · Güneş kütlesi ${s2.m[0].toFixed(7)}`);
}

// 6) Elemanlar: Kepler'in 3. yasası
{
  const el = elements(1, 0, 0, daireselHiz(1));
  ok('dairesel yörünge', el.e < 1e-9 && Math.abs(el.P - 1) < 1e-9, `e ${el.e.toExponential(1)} · P ${el.P.toFixed(6)} yıl`);
  ok('G = 4π²', Math.abs(G - 39.478) < 0.001, G.toFixed(4));
}

// 7) Işık süresi Dünya → Mars: laboratuvar (Güneş merkezli konumlar) ile astronomy-engine GeoVector karşılaştırması
{
  const s = sistem(DATE);
  const e = indeks('dunya'), m = indeks('mars');
  const d = Math.hypot(s.x[m] - s.x[e], s.y[m] - s.y[e], s.z[m] - s.z[e]);
  const ref = GeoVector(AB.Mars, DATE, false).Length();
  const lt = isikSn(d), lr = isikSn(ref);
  ok('ışık süresi Dünya→Mars', Math.abs(lt - lr) / lr < 0.002, `${(lt / 60).toFixed(2)} dk · astronomy-engine ${(lr / 60).toFixed(2)} dk`);
}

// 8) Ölçek: ekran ↔ düzlem tam ters, r_ekran ∝ √AU
{
  const o = new Olcek();
  o.cx = 960; o.cy = 520; o.K = 120;
  let worst = 0;
  for (const [x, y] of [[1, 0], [-0.3, 0.2], [5.2, -1.1], [0.01, 29.9], [-12, -12]]) {
    const p = o.ekran(x, y), b = o.duzlem(p.X, p.Y);
    worst = Math.max(worst, Math.hypot(b.x - x, b.y - y) / Math.hypot(x, y));
  }
  ok('ölçek tersinir', worst < 1e-9, `en büyük göreli hata ${worst.toExponential(1)}`);
  const r1 = o.ekran(1, 0).X - o.cx, r4 = o.ekran(4, 0).X - o.cx;
  ok('√ ölçek', Math.abs(r4 / r1 - 2) < 1e-9, `4 AU / 1 AU = ${(r4 / r1).toFixed(3)} kat`);
}

console.log(`${n - fail}/${n} fizik testi geçti`);
if (fail) throw new Error(`${fail} fizik testi başarısız`);
