// Ultron Paketi · arayüz çekirdeği testleri (DOM/WebGL yok). Çalıştır: server/node_modules/.bin/tsx web/src/ultron/ultron.test.ts
// Kapsam: zaman çizelgesi seslendirme süresine göre kayar; repliğe bağlı görsel olaylar sesle senkron (±100 ms);
// durum(t) deterministik; tohumlu rastgele tekrarlanabilir; sahne sonrası sekmeler birebir eski hâlinde; komutlar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { durum, karma, planKur, SEKMELER, tahminiSure, tohumlu, type Satir, type ZamanDosyasi } from './zaman';
import { hiz, sahneSuresi } from './ses';
import { temizle, uygula, type Hedef, type Hedefler } from './sekmeler';
import { ultronKomutu } from './komutlar';

let fail = 0, n = 0;
const ok = (ad: string, k: boolean, a = '') => { n++; if (!k) fail++; console.log(`${k ? '✓' : '✗'} ${ad}${a ? ` · ${a}` : ''}`); };
const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scenes', 'ultron');
const satirlar = JSON.parse(fs.readFileSync(path.join(KOK, 'script.tr.json'), 'utf8')).satirlar as Satir[];
const z = JSON.parse(fs.readFileSync(path.join(KOK, 'timeline.json'), 'utf8')) as ZamanDosyasi;

// ---------------------------------------------------------------- Zaman çizelgesi
const kisa = Object.fromEntries(satirlar.map(s => [s.id, 1.0]));
const uzun = Object.fromEntries(satirlar.map(s => [s.id, 4.0]));
const pA = planKur(satirlar, z, kisa, 'A'), pB = planKur(satirlar, z, kisa, 'B'), pU = planKur(satirlar, z, uzun, 'A');
ok('7 vuruş, sıralı ve boşluksuz', pA.vuruslar.length === 7 && pA.vuruslar.every((v, i) => i === 0 ? v.bas === 0 : v.bas === pA.vuruslar[i - 1].bit));
ok('Kısa repliklerde vuruş süreleri en az dosyadaki kadar', pA.vuruslar.every(v => v.bit - v.bas >= z.vuruslar.find(x => x.no === v.no)!.sure - 1e-9));
ok('Uzun replikler → sahne uzar (otomatik kayar)', pU.toplam > pA.toplam + 20, `${pA.toplam.toFixed(1)} → ${pU.toplam.toFixed(1)} sn`);
ok('Replikler çakışmaz (en az "ara" kadar boşluk)', pU.replikler.every((r, i) => i === 0 || r.bas >= pU.replikler[i - 1].bas + pU.replikler[i - 1].sure + z.ara - 1e-9));
ok('Her replik kendi vuruşunun içinde', pU.replikler.every(r => { const v = pU.vuruslar.find(x => x.no === r.vurus)!; return r.bas >= v.bas && r.bas + r.sure <= v.bit + 1e-9; }));
ok('Final A: u12 var, j6 yok', pA.replikler.some(r => r.id === 'u12') && !pA.replikler.some(r => r.id === 'j6'));
ok('Final B: j6 ve parola/kıvılcım olayları', pB.replikler.some(r => r.id === 'j6') && pB.olaylar.some(o => o.olay === 'parolaBekle') && pB.olaylar.some(o => o.olay === 'maviKivilcim'));
// Senkron: repliğe bağlı her olay, replik başı + ofset'te (±100 ms), süreler ne olursa olsun
for (const [ad, p] of [['kısa', pA], ['uzun', pU]] as const) {
  let enKotu = 0;
  for (const o of z.olaylar) {
    if (!('satir' in o) || (o.final && o.final !== p.final)) continue;
    const r = p.replikler.find(x => x.id === o.satir)!;
    const adaylar = p.olaylar.filter(x => x.satir === o.satir && (x.olay ?? null) === (o.olay ?? null) && (x.sfx ?? null) === (o.sfx ?? null) && (x.sekme ?? null) === (o.sekme ?? null) && (x.kare ?? null) === (o.kare ?? null));
    // Aynı repliğe bağlı benzer olaylar (3× ERİŞİM REDDEDİLDİ) olabilir: en yakın aday
    enKotu = Math.max(enKotu, Math.min(Infinity, ...adaylar.map(x => Math.abs(x.t - (r.bas + o.ofset)))));
  }
  ok(`Replik–görsel olay senkronu (${ad} sesler)`, enKotu <= 0.1, `en kötü ${(enKotu * 1000).toFixed(0)} ms`);
}
{
  const u8 = pU.replikler.find(r => r.id === 'u8')!;
  const haber = pU.olaylar.find(o => o.olay === 'sekme' && o.sekme === 'haber')!;
  ok('"Önce gözlerini…" → Haber sekmesi turuncu (replikle)', Math.abs(haber.t - (u8.bas + 0.25)) < 1e-9);
  const d = durum(pU, haber.t + 0.6);
  ok('Ele geçirilen sekme tam turuncu, diğerleri değil', d.sekme.haber.ele === 1 && d.sekme.bekci.ele === 0 && d.sekme.toplanti.ele === 0);
  const sonra = durum(pU, pU.vuruslar[5].bas + 0.1);
  ok('Vuruş 6\'da dört sekme de ele geçirilmiş, bütünlük %30', SEKMELER.every(s => sonra.sekme[s].ele === 1) && sonra.butunluk === 30);
}
ok('Ses yoksa tahmini süre makul', tahminiSure('Karanlık… sonra bir ses… sonra binlercesi.') > 2 && tahminiSure('…sonra evini.') >= 1.2);

// ---------------------------------------------------------------- Determinizm
{
  let ayni = true;
  for (let i = 0; i < 400; i++) {
    const t = (i / 400) * pU.toplam;
    if (JSON.stringify(durum(pU, t)) !== JSON.stringify(durum(pU, t))) ayni = false;
  }
  ok('durum(t): aynı t → aynı sahne (400 örnek)', ayni);
  const a = tohumlu(42), b = tohumlu(42);
  ok('Tohumlu rastgele: aynı tohum aynı dizi', Array.from({ length: 1000 }, a).join() === Array.from({ length: 1000 }, b).join());
  ok('karma(): tekrarlanabilir ve 0..1', karma(123, 4) === karma(123, 4) && karma(1, 2) !== karma(2, 1) && Array.from({ length: 500 }, (_, i) => karma(i, 7)).every(x => x >= 0 && x < 1));
  const d0 = durum(pU, 0.1), dSon = durum(pU, pU.toplam - 0.01);
  ok('Başta karartma, sonda küre (Final A)', d0.karart > 0 && d0.kure === 0 && dSon.kure === 1);
  const parola = durum(pB, pB.vuruslar[6].bas + 0.2);
  ok('Final B: parola bekleniyor, tema hâlâ turuncu', parola.parolaBekle && parola.tema === 1);
  const sonB = durum(pB, pB.toplam - 0.01);
  ok('Final B sonu: sekmeler geri, tema mavi, karartma yok', SEKMELER.every(s => sonB.sekme[s].ele === 0) && sonB.tema === 0 && sonB.karart === 0 && sonB.butunluk === 100);
}

// ---------------------------------------------------------------- Ses
ok('Ultron perdesi düşük (hız < 1)', hiz('ultron', 'soguk')[0] < 1 && hiz('jarvis', 'normal')[0] === 1);
ok('Jarvis son replikte yavaşlar', hiz('jarvis', 'bozuk')[1] < 0.7);
ok('Sahne süresi = tampon / ortalama hız', Math.abs(sahneSuresi({ tampon: null as any, bas: 0, sure: 3 }, 'jarvis', 'bozuk') - 3 / ((0.95 + 0.6) / 2)) < 1e-9);

// ---------------------------------------------------------------- Sekmeler: sahne sonrası birebir eski hâl
{
  const yap = (): Hedef & { _a: Map<string, string>; _s: Map<string, string> } => {
    const _a = new Map<string, string>([['class', 'm2-btn'], ['aria-label', 'Bekçi']]), _s = new Map<string, string>([['color', 'red']]);
    return { _a, _s, setAttribute: (k, v) => void _a.set(k, v), removeAttribute: k => void _a.delete(k), getAttribute: k => _a.get(k) ?? null,
      style: { setProperty: (k, v) => void _s.set(k, v), removeProperty: k => { const v = _s.get(k) ?? ''; _s.delete(k); return v; } } };
  };
  const h = Object.fromEntries(SEKMELER.map(s => [s, [yap(), yap()]])) as unknown as Hedefler & Record<string, ReturnType<typeof yap>[]>;
  const oncesi = JSON.stringify(SEKMELER.map(s => (h[s] as any[]).map(e => [[...e._a], [...e._s]])));
  const kok = { style: { setProperty: () => {} } };
  for (let i = 0; i < 300; i++) uygula(durum(pU, (i / 300) * pU.toplam), h, kok);
  const ortada = (h.haber as any[])[0]._a.get('data-ultron-ele');
  temizle(h);
  const sonrasi = JSON.stringify(SEKMELER.map(s => (h[s] as any[]).map(e => [[...e._a], [...e._s]])));
  ok('Sahne sırasında sekme işaretlenir', ortada === 'haber');
  ok('Sahne sonrası sekmeler birebir eski hâlinde (öznitelik + stil)', oncesi === sonrasi);
}

// ---------------------------------------------------------------- Komutlar
ok('Komut: savaş modunu başlat', ultronKomutu('Savaş modunu başlat', null)?.tip === 'savas');
ok('Komut: Ultron uyan', ultronKomutu('Ultron uyan', null)?.tip === 'savas');
ok('Komut: Ultron, dünyayı göster', ultronKomutu('Ultron, dünyayı göster', null)?.tip === 'goz');
ok("Komut: Ultron'un gözünü aç", ultronKomutu("Ultron'un gözünü aç", null)?.tip === 'goz');
ok("Komut: Jarvis'i geri getir (açıkken)", ultronKomutu("Jarvis'i geri getir", 'goz')?.tip === 'kapat');
ok("Komut: Jarvis'i geri getir (kapalıyken yok sayılır)", ultronKomutu("Jarvis'i geri getir", null) === null);
ok('Komut: alakasız söz', ultronKomutu('Bugün hava nasıl?', null) === null);

console.log(`\n${n - fail}/${n} geçti`);
process.exit(fail ? 1 : 0);
