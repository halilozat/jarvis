// Ay yerine kara delik · hesap testleri. Çalıştır: npm run test:lab
// Beklenen değerler yayımlanmış ya da elle doğrulanabilir sayılar: Güneş'in Schwarzschild yarıçapı ≈2,95 km,
// Güneş kütleli kara deliğin Hawking sıcaklığı ≈6,2×10⁻⁸ K, Ay'ın denge gelgiti ≈0,54 m, ortak kütle merkezi ≈4.670 km.
import * as F from './moonHolePhysics';

let fail = 0, n = 0;
function yakin(ad: string, got: number, want: number, tol: number) {
  n++;
  const ok = Math.abs(got - want) <= Math.abs(want) * tol;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${ad} · ${got.toPrecision(4)} (beklenen ${want.toPrecision(4)} ±%${tol * 100})`);
}
function dogru(ad: string, kosul: boolean, ek = '') {
  n++;
  if (!kosul) fail++;
  console.log(`${kosul ? '✓' : '✗'} ${ad}${ek ? ' · ' + ek : ''}`);
}

yakin("Güneş'in Schwarzschild yarıçapı (m)", F.rs(F.M_GUNES), 2953, 0.005);
yakin('Ay kütleli kara delik: ufuk yarıçapı (mm)', F.rs(F.M_AY) * 1000, 0.109, 0.01);
yakin('Dünya kütleli kara delik: ufuk yarıçapı (mm)', F.rs(F.M_DUNYA) * 1000, 8.87, 0.01);
yakin('Ay kütlesinde dönem bugünkü ay (gün)', F.donemGun(F.M_AY), 27.32, 0.005);
yakin('Ay kütlesinde gelgit bugünkü gelgit (m)', F.gelgitM(F.M_AY), 0.54, 0.05);
yakin('Ortak kütle merkezi Dünya merkezinden (km)', F.agirlikMerkezi(F.M_AY) / 1000, 4670, 0.01);
yakin('Ay yörünge hızı (km/s)', F.yorungeHizi(F.M_AY), 1.022, 0.01);
yakin('Güneş kütleli kara delik: Hawking sıcaklığı (K)', F.hawkingK(F.M_GUNES), 6.17e-8, 0.01);
yakin('Dünyayı parçalayan kütle (M☉)', F.PARCALAMA_M / F.M_GUNES, 0.33, 0.02);
yakin('Ufkun Ay yörüngesini aştığı kütle (M☉)', F.UFUK_M / F.M_GUNES, 1.30e5, 0.01);
yakin('Güneş kütlesinde Einstein halkası (derece)', F.einsteinSn(F.M_GUNES) / 3600, 0.2246, 0.01);

dogru('Ay kütlesi CMB\'den soğuk: buharlaşmaz', F.hawkingK(F.M_AY) < F.CMB_K, `${F.hawkingK(F.M_AY).toFixed(2)} K`);
dogru('Ay kütlesinde gelgit aynı', Math.abs(F.gelgitKat(F.M_AY) - 1) < 1e-12);
dogru('Ay kütlesinde Dünya parçalanmaz', !F.parcalanir(F.M_AY));
dogru('Jüpiter kütlesinde Dünya parçalanmaz', !F.parcalanir(F.M_JUPITER));
dogru('Güneş kütlesinde Dünya parçalanır', F.parcalanir(F.M_GUNES));
dogru('Güneş kütlesinde ufuk yörüngenin içinde', !F.ufukIcinde(F.M_GUNES));
dogru('Sgr A* kütlesinde Dünya ufkun içinde', F.ufukIcinde(F.M_SGRA), `${(F.rs(F.M_SGRA) / F.D).toFixed(0)} kat`);
dogru('Ortak merkez Ay kütlesinde Dünya\'nın içinde, Dünya kütlesinde dışında', F.agirlikMerkezi(F.M_AY) < F.R_DUNYA && F.agirlikMerkezi(F.M_DUNYA) > F.R_DUNYA);

const yazi: [string, string, string][] = [
  ['Ay ufku', F.uzunlukSoz(2 * F.rs(F.M_AY)), '0,22 milimetre'],
  ['Dünya ufku', F.uzunlukSoz(2 * F.rs(F.M_DUNYA)), '1,8 santimetre'],
  ['Jüpiter ufku', F.uzunlukSoz(2 * F.rs(F.M_JUPITER)), '5,6 metre'],
  ['Güneş ufku', F.uzunlukSoz(2 * F.rs(F.M_GUNES)), '5,9 kilometre'],
  ['kütle adı', F.kutleSoz(F.M_JUPITER), 'Jüpiter kütlesi'],
  ['kütle katı', F.kutleSoz(F.M_DUNYA * 10), "Dünya'nın 10 katı"],
];
for (const [ad, got, want] of yazi) dogru(`yazı: ${ad}`, got === want, got);

console.log(`${n - fail}/${n} Ay yerine kara delik testi geçti`);
if (fail) throw new Error(`${fail} test başarısız`);
