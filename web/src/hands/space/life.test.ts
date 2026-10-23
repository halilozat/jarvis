// Yaşam izi taraması testleri. Çalıştır: npm run test:lab
// ESI (Schulze-Makuch 2011), sıvı su hesabı, taşınan Dünya, ve hiçbir çıktıda yaşam olasılığı yüzdesi olmaması.
import { GEZEGENLER, UYDULAR, VERI, ortUzaklikAU, type Cisim } from './data';
import { esi, kaynamaC, ozet, tara, type Tarama } from './life';
import { LabHafiza, adDe, adE, adI, kisisellestir } from './narration';
import { C, dengeT } from './physics';

let fail = 0, n = 0;
const ok = (name: string, cond: boolean, detail: string) => { n++; if (!cond) fail++; console.log(`${cond ? '✓' : '✗'} ${name} · ${detail}`); };

// 1) ESI: Dünya = 1,00; yayınlanan değerlerle aynı girdiler (Mars ≈227 K → 0,70; Merkür 0,60; Venüs 0,44; Titan 0,24)
{
  const d = esi(6371, 5514, 11.186, 288);
  ok('ESI Dünya', Math.abs(d - 1) < 1e-9, d.toFixed(3));
  const m = esi(3389.5, 3934, 5.03, 227);
  ok('ESI Mars (yayınlanan girdiler)', Math.abs(m - 0.70) <= 0.01, `${m.toFixed(3)} · yayınlanan 0,70`);
  const me = esi(2439.7, 5427, 4.25, 440), ve = esi(6051.8, 5243, 10.36, 737), ti = esi(2574.7, 1882, 2.639, 94);
  ok('ESI Merkür, Venüs, Titan', Math.abs(me - 0.60) <= 0.01 && Math.abs(ve - 0.44) <= 0.01 && Math.abs(ti - 0.24) <= 0.01, `${me.toFixed(3)} · ${ve.toFixed(3)} · ${ti.toFixed(3)}`);
}

// Simülasyondaki yüzey sıcaklığı (lab.ts yuzeyC ile aynı): denge sıcaklığı + bugünkü sera farkı
const sera = (c: Cisim, a: number) => { const d = VERI[c].sicaklik + 273.15 - dengeT(a, VERI[c].albedo); return VERI[c].kaya ? Math.max(0, d) : d; };
const Tsim = (c: Cisim, a0: number, r: number) => C(dengeT(r, VERI[c].albedo) + sera(c, a0));
const dunya = (r: number, ayYok = false) => tara('dunya', { r, Tc: Tsim('dunya', 1, r), degisti: r !== 1, ayYok });

// 2) Sıvı su ve taşınan Dünya
{
  ok('kaynama 1 atm', Math.abs(kaynamaC(1.01325) - 100) < 0.01, `${kaynamaC(1.01325).toFixed(2)} °C`);
  const su = (t: Tarama) => t.maddeler.find(m => m.ad === 'Yüzeyde sıvı su')!;
  const d1 = dunya(1);
  ok('Dünya: sıvı su ✓', su(d1).durum === 'evet' && d1.esi > 0.99, `${su(d1).deger} · ESI ${d1.esi.toFixed(2)}`);
  const dm = dunya(1.524);
  ok("Dünya Mars'ın yerinde: donmuş, ESI düşer", su(dm).durum === 'hayir' && su(dm).deger.includes('donmuş') && dm.esi < d1.esi - 0.1, `${su(dm).deger} · ESI ${dm.esi.toFixed(2)}`);
  const dv = dunya(0.723);
  ok("Dünya Venüs'ün yerinde: kaçak sera", su(dv).durum === 'hayir' && su(dv).deger.includes('kaçak sera'), su(dv).deger);
  const mars = tara('mars', { r: 1.524, Tc: -65, degisti: false, ayYok: false });
  ok('Mars: basınç üçlü noktanın altında', su(mars).durum === 'hayir' && su(mars).deger.includes('basınç'), `${su(mars).deger} · ESI ${mars.esi.toFixed(2)}`);
  const ay = dunya(1, true);
  ok('Ay kaldırılınca iklim maddesi', ay.maddeler.some(m => m.ad.startsWith('İklim kararlılığı')), `${ay.maddeler.length} madde`);
  const eu = tara('europa', { r: 5.2, Tc: -171, degisti: false, ayYok: false });
  ok('Europa: yüzeyde ✗, yer altında ✓, okyanus katmanı', su(eu).durum === 'hayir' && eu.maddeler.some(m => m.ad === 'Yer altında sıvı su' && m.durum === 'evet') && eu.okyanusKatman >= 0, `ESI ${eu.esi.toFixed(2)} · ${eu.esiNot}`);
}

// 3) Hiçbir çıktıda yaşam olasılığı yüzdesi yok; her madde HESAPLANDI ya da BİLİNEN VERİ etiketli
{
  const cisimler: Cisim[] = [...GEZEGENLER, 'ay', ...UYDULAR];
  const metinler: string[] = [];
  let etiketsiz = 0, sayac = 0;
  for (const c of cisimler) {
    const a0 = c in { europa: 1, ganymede: 1 } ? 5.2 : c in { enceladus: 1, titan: 1 } ? 9.58 : c === 'ay' ? 1 : ortUzaklikAU(c as typeof GEZEGENLER[number]);
    for (const k of [0.3, 0.7, 1, 1.5, 3]) {
      for (const ayYok of [false, true]) {
        const t = tara(c, { r: a0 * k, Tc: Tsim(c, a0, a0 * k), degisti: k !== 1, ayYok });
        sayac++;
        metinler.push(...t.cumleler, ...t.hizliCumleler, t.esiNot, t.sonuc.bolge, t.sonuc.neden, t.sonuc.sonraki, JSON.stringify(ozet(t)));
        for (const m of t.maddeler) { metinler.push(m.ad, m.deger); if (m.etiket !== 'HESAPLANDI' && m.etiket !== 'BİLİNEN VERİ') etiketsiz++; }
        for (const kk of t.kesifler) metinler.push(kk.cumle, kk.yil, kk.gorev);
      }
    }
  }
  const yuzde = metinler.filter(s => /%/.test(s));
  const olasilik = metinler.filter(s => /(yaşam|hayat)[^.]{0,60}(olasılı|ihtimal|şans)|(olasılı|ihtimal|şans)[^.]{0,60}(yaşam|hayat)/i.test(s));
  ok('çıktılarda "%" yok', yuzde.length === 0, `${metinler.length} metin, ${sayac} tarama${yuzde.length ? ` · örnek: ${yuzde[0].slice(0, 80)}` : ''}`);
  ok('yaşam olasılığı ifadesi yok', olasilik.length === 0, olasilik[0]?.slice(0, 80) ?? 'temiz');
  ok('her madde etiketli', etiketsiz === 0, `${etiketsiz} etiketsiz`);
}

// 4) Hafıza ve samimi anlatım: önceki taramaya ve taşımaya gönderme, Türkçe ekler, yine yüzde yok
{
  ok('Türkçe ekler', adI('Dünya') === "Dünya'yı" && adI('Enceladus') === "Enceladus'u" && adE('Mars') === "Mars'a" && adDe('Europa') === "Europa'da" && adDe('Mars') === "Mars'ta", `${adI('Ganymede')} · ${adE('Venüs')} · ${adDe('Titan')}`);
  const h = new LabHafiza();
  const eu = tara('europa', { r: 5.2, Tc: -171, degisti: false, ayYok: false });
  h.kaydet(eu);
  h.olay({ tip: 'tasi', cisim: 'dunya', metin: "Mars'ın yörüngesine" });
  const dm = dunya(1.524);
  const cs = kisisellestir(dm, h, false);
  ok('taşımayı hatırlar', cs[0].includes("az önce Mars'ın yörüngesine"), cs[0]);
  ok('önceki ESI ile karşılaştırır', cs[5].includes("Europa'da 0,26"), cs[5]);
  ok('önceki okyanusa bağlar', cs[7].includes("Europa'da"), cs[7]);
  h.kaydet(dm);
  const dm2 = kisisellestir(dunya(1), h, false);
  ok('aynı cismi yeniden tarayınca', dm2[5].includes('az önce 0,88 idi'), `${dm2[0]} · ${dm2[5]}`);
  ok('anlatımda yüzde yok', ![...cs, ...dm2].some(x => /%|olasılı|ihtimal/.test(x)), 'temiz');
}

console.log(`${n - fail}/${n} yaşam taraması testi geçti`);
if (fail) throw new Error(`${fail} yaşam taraması testi başarısız`);
