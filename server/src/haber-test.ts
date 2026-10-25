// Haber Modu testleri. Çalıştır: npm run test:haber (internet ve model gerekmez; veri kaynakları ve model sahte)
// 1) Karşılaştırma: her "farklı vurgu" ve "farklı sayı" alıntısı kaynak metinde birebir; uydurma alıntı atılır
// 2) İddia kontrolü: her etiketin kaynak bağlantısı ve tarihi var; veri yoksa "DOĞRULANAMADI"
// 3) Sorular: her soru kaynaklardaki somut bir boşluğa dayanıyor
// 4) Değerlendirici dil: Jarvis'in hiçbir cümlesinde "propaganda", "yalan", "taraflı" … yok
// 5) Kümeleme ve tam metin çıkarma
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.HABER_ARSIV = fs.mkdtempSync(path.join(os.tmpdir(), 'haber-arsiv-'));
const A = await import('./newsAnalysis.js');
const F = await import('./factcheck.js');
const V = await import('./verify.js');
const C = await import('./newsCluster.js');
const T = await import('./article.js');

let fail = 0, n = 0;
const ok = (ad: string, kosul: boolean, ek = '') => { n++; if (!kosul) fail++; console.log(`${kosul ? '✓' : '✗'} ${ad}${ek ? ' · ' + ek : ''}`); };

// ———————————————— Sahte küme ————————————————
const saat = '2026-10-23T09:00:00.000Z';
const km: import('./newsAnalysis.js').KaynakMetin[] = [
  { kaynak: 'Ajans A', baslik: 'Kentte silahlı saldırı: 7 ölü', ilkCumle: '', saat, url: 'https://a.example/1', tam: true,
    metin: "Kentte silahlı saldırı: 7 ölü. Valilik açıklamasına göre saldırıda 7 kişi hayatını kaybetti, 27 kişi yaralandı. Saldırganların yakalanması için çalışma başlatıldı. Dolar 41,25 lira seviyesinde işlem gördü." },
  { kaynak: 'Gazete B', baslik: 'Saldırıda 7 kişi öldü', ilkCumle: '', saat, url: 'https://b.example/1', tam: true,
    metin: "Saldırıda 7 kişi öldü. İlk belirlemelere göre 7 kişi hayatını kaybetti, 34 kişi yaralandı. Olay yerinde yayın yasağı getirildi." },
  { kaynak: 'Servis C', baslik: 'Saldırı sonrası soruşturma', ilkCumle: '', saat, url: 'https://c.example/1', tam: false,
    metin: "Saldırı sonrası soruşturma. Yetkililer 7 kişinin hayatını kaybettiğini bildirdi. Yaralıların durumu ciddi." },
];

// ———————————————— 1) Karşılaştırma ————————————————
const bos = A.bosluklar(km, 'gundem', []);
const ham = {
  ozet: ['Saldırıda 7 kişi hayatını kaybetti.', 'Bu bir propaganda haberidir.', 'Saldırıda 9 kişi öldü.'],
  ortak: [{ bilgi: '7 kişi hayatını kaybetti', alintilar: { 'Ajans A': '7 kişi hayatını kaybetti', 'Gazete B': '7 kişi hayatını kaybetti', 'Servis C': '7 kişinin hayatını kaybettiğini' } }],
  vurgu: [
    { konu: 'Yaralı sayısı', alintilar: { 'Ajans A': '27 kişi yaralandı', 'Gazete B': '34 kişi yaralandı' } },
    { konu: 'Uydurma vurgu', alintilar: { 'Ajans A': 'bu cümle metinde yok', 'Gazete B': 'bu da yok' } },
    { konu: 'Kaynak taraflı anlatıyor', alintilar: { 'Ajans A': '27 kişi yaralandı', 'Gazete B': '34 kişi yaralandı' } },
  ],
  bazilari: [{ bilgi: 'Yayın yasağı getirildi', anahtar: 'yayın yasağı', alintilar: { 'Gazete B': 'Olay yerinde yayın yasağı getirildi.' } }],
  iddialar: [
    { kaynak: 'Ajans A', alinti: 'Dolar 41,25 lira seviyesinde işlem gördü.', tur: 'sayi', sorgu: { tip: 'kur', doviz: 'USD', deger: 41.25, tarih: '2026-10-23' } },
    { kaynak: 'Gazete B', alinti: '34 kişi yaralandı', tur: 'sayi', sorgu: { tip: 'yok' } },
    { kaynak: 'Gazete B', alinti: '34 kişi yaralandı', tur: 'sayi', sorgu: { tip: 'kur', doviz: 'USD', deger: 50, tarih: '2026-10-23' } },
    { kaynak: 'Ajans A', alinti: 'metinde olmayan iddia', tur: 'sayi', sorgu: { tip: 'yok' } },
  ],
  sorular: [
    { bosluk: 'b99', soru: 'Var olmayan boşluk?' },
    { bosluk: bos.find(b => b.tur === 'celiski')?.id, soru: 'Acaba gerçek sayı gizleniyor mu?' },
    { bosluk: bos.find(b => b.tur === 'celiski')?.id, soru: 'Resmî olarak açıklanan yaralı sayısı hangisi?' },
  ],
};
const s = A.suz(ham, km, bos);
const maddeler = [...s.maddeler, ...A.farkliSayilar(km)];
const alintiHepsi = maddeler.flatMap(m => m.alintilar.map(a => ({ m, a })));
ok('her alıntı kaynak metinde birebir', alintiHepsi.every(({ a }) => A.birebir(a.metin, km.find(k => k.kaynak === a.kaynak)!.metin)), `${alintiHepsi.length} alıntı`);
ok('farklı vurgu ve farklı sayı maddeleri birebir alıntılı', maddeler.filter(m => m.tur === 'vurgu' || m.tur === 'sayilar').every(m => m.alintilar.length >= 2 && m.alintilar.every(a => A.birebir(a.metin, km.find(k => k.kaynak === a.kaynak)!.metin))));
ok('uydurma alıntılı vurgu atıldı', !s.maddeler.some(m => m.baslik === 'Uydurma vurgu'));
ok('değerlendirici başlıklı madde atıldı', !s.maddeler.some(m => /taraflı/.test(m.baslik)));
ok('kodla farklı sayı bulundu (27 · 34)', A.farkliSayilar(km).some(m => /27/.test(m.baslik) && /34/.test(m.baslik)));
const baz = s.maddeler.find(m => m.tur === 'bazilari');
ok('"sadece bazı kaynaklarda": geçen ve geçmeyen kodla', !!baz && baz.gecen!.join() === 'Gazete B' && baz.gecmeyen!.length === 2);
ok('özet: propaganda ve metinde olmayan sayı atıldı', s.ozet.length === 1 && s.ozet[0].startsWith('Saldırıda 7'), JSON.stringify(s.ozet));
ok('metinde olmayan iddia atıldı', !s.iddialar.some(i => i.alinti === 'metinde olmayan iddia'));

// ———————————————— 2) İddia kontrolü ————————————————
V.verifyDeps.tcmbKur = async (_d, t) => ({ tarih: t, deger: 41.3, url: `https://www.tcmb.gov.tr/kurlar/202610/${t}.xml` });
V.verifyDeps.tcmbSeri = async () => [{ tarih: '2026-10-22', deger: 41.2, url: 'x' }, { tarih: '2026-10-23', deger: 41.3, url: 'x' }];
V.verifyDeps.afadDepremler = async () => [];
V.verifyDeps.ilgiliDogrulamalar = async () => [];
const analiz = { detay: { kaynaklar: km }, iddialar: s.iddialar, at: 'test' } as unknown as import('./newsAnalysis.js').Analiz;
const sonuc = await F.iddialariKontrolEt('test', analiz);
ok('her etiketin kaynak bağlantısı ve tarihi var', sonuc.length > 0 && sonuc.every(r => /^https?:\/\//.test(r.veri.url) && /^\d{4}(-\d{2}-\d{2})?$/.test(r.veri.tarih)), sonuc.map(r => r.etiket).join(', '));
ok('kur %0,1 farkla: VERİYLE UYUMLU', sonuc.find(r => /Dolar/.test(r.alinti))?.etiket === 'VERİYLE UYUMLU');
ok('veri olmayan iddia: DOĞRULANAMADI', sonuc.filter(r => r.alinti === '34 kişi yaralandı').every(r => r.etiket === 'DOĞRULANAMADI'));
ok('sorgudaki sayı alıntıda yoksa veriyle karşılaştırılmaz', !sonuc.some(r => r.alinti === '34 kişi yaralandı' && r.etiket !== 'DOĞRULANAMADI'));
// Çelişki ve deprem
V.verifyDeps.tcmbKur = async (_d, t) => ({ tarih: t, deger: 49.65, url: 'https://www.tcmb.gov.tr/kurlar/x.xml' });
const celisen = await F.iddialariKontrolEt('test2', { ...analiz, at: 'test2' });
ok('kur %17 farkla: VERİYLE ÇELİŞİYOR', celisen.find(r => /Dolar/.test(r.alinti))?.etiket === 'VERİYLE ÇELİŞİYOR');
const depKm = [{ ...km[0], kaynak: 'Ajans D', metin: "İzmir'de 4,6 büyüklüğünde deprem meydana geldi." }];
V.verifyDeps.afadDepremler = async () => [{ tarih: '2026-10-23T08:12:00', il: 'İzmir', yer: 'Seferihisar (İzmir)', buyukluk: 4.6, tip: 'ML' }];
const dep = await F.iddialariKontrolEt('test3', { detay: { kaynaklar: depKm }, iddialar: [], at: 'test3' } as unknown as import('./newsAnalysis.js').Analiz);
ok('deprem kodla bulundu, AFAD ile uyumlu', dep[0]?.etiket === 'VERİYLE UYUMLU' && dep[0].veri.ad.includes('AFAD'));
V.verifyDeps.afadDepremler = async () => [];
const dep2 = await F.iddialariKontrolEt('test4', { detay: { kaynaklar: depKm }, iddialar: [], at: 'test4' } as unknown as import('./newsAnalysis.js').Analiz);
ok('AFAD kaydı yoksa DOĞRULANAMADI (çelişiyor değil)', dep2[0]?.etiket === 'DOĞRULANAMADI' && !!dep2[0].veri.url && !!dep2[0].veri.tarih);

// Resmî Gazete: genel ifade ("Cumhurbaşkanı Kararı") eşleşme sayılmaz; özgül başlık geçerse uyumlu
V.verifyDeps.resmiGazete = async () => 'cumhurbaskani karari ulastirma ve altyapi bakanligina bagli rayli sistem hatlarinda ucretsiz tasima hakkinda karar';
const rgKm = [{ ...km[0], kaynak: 'Gazete R', metin: "Karar 23 Ekim 2026 tarihli Resmi Gazete'de yayımlandı." }];
const rg = await F.iddialariKontrolEt('rg', { detay: { kaynaklar: rgKm }, iddialar: [
  { kaynak: 'Gazete R', alinti: "Karar 23 Ekim 2026 tarihli Resmi Gazete'de yayımlandı.", tur: 'tarih', sorgu: { tip: 'resmi_gazete', tarih: '2026-10-23', anahtar: 'Cumhurbaşkanı Kararı' } },
  { kaynak: 'Gazete R', alinti: 'Karar 23 Ekim 2026 tarihli', tur: 'tarih', sorgu: { tip: 'resmi_gazete', tarih: '2026-10-23', anahtar: 'raylı sistem ücretsiz taşıma' } },
], at: 'rg' } as unknown as import('./newsAnalysis.js').Analiz);
ok('Resmî Gazete: genel ifade DOĞRULANAMADI', rg[0]?.etiket === 'DOĞRULANAMADI', rg[0]?.aciklama);
ok('Resmî Gazete: özgül başlık fihristte → VERİYLE UYUMLU', rg[1]?.etiket === 'VERİYLE UYUMLU');
ok('sayılar: büyük harfli tarih ("29 EKİM\'DE") sayı sayılmaz', !A.sayilariBul("29 EKİM'DE ULAŞIM BEDAVA MI? 29 Ekim'de 4 hat ücretsiz.").some(x => x.deger === 29));

// ———————————————— 3) Sorular ————————————————
ok('model sorusu: var olmayan boşluk ve ima içeren soru atıldı', s.sorular.length === 1 && s.sorular[0].soru.startsWith('Resmî olarak'), JSON.stringify(s.sorular.map(x => x.soru)));
ok('her boşluk metinlerde gerçekten var', bos.length > 0 && bos.every(b => A.boslukGecerli(b, km)), bos.map(b => b.tur).join(', '));
ok('şablon sorular soru işaretiyle bitiyor', bos.every(b => A.sablonSoru(b).endsWith('?')));
const zamanli = km.map(k => ({ ...k, metin: k.metin + ' Olay dün akşam yaşandı.' }));
ok('zaman bilgisi varsa "ne zaman" boşluğu yok', !A.bosluklar(zamanli, 'gundem', []).some(b => b.tur === 'ne-zaman'));
const proje = [{ ...km[0], metin: 'Yeni köprü projesi için ihale yapılacak. Bakanlık açıklamasına göre çalışmalar başladı.' }];
ok('maliyet bilgisi yoksa "maliyet" boşluğu', A.bosluklar(proje, 'gundem', []).some(b => b.tur === 'maliyet' && A.boslukGecerli(b, proje)));
const projeTL = [{ ...proje[0], metin: proje[0].metin + ' Projenin maliyeti 4,2 milyar TL.' }];
ok('maliyet yazıyorsa boşluk yok', !A.bosluklar(projeTL, 'gundem', []).some(b => b.tur === 'maliyet'));
const takip = A.bosluklar(km, 'gundem', [{ tarih: '2026-10-01', baslik: 'x', benzerlik: 0.8, kaynaklar: [{ ad: 'Ajans A', baslik: 'Rapor açıklanacak', ozet: 'Soruşturma raporu ay sonunda açıklanacak.', url: 'https://a.example/eski', saat }] }]);
ok('arşivde verilen ve bugün geçmeyen söz: "takip" boşluğu', takip.some(b => b.tur === 'takip' && b.onceki?.url === 'https://a.example/eski'));

// ———————————————— 4) Değerlendirici dil ————————————————
const jarvis = [...s.ozet, ...s.maddeler.map(m => m.baslik), ...A.anlatim(km, maddeler), ...s.sorular.map(x => x.soru), ...bos.map(b => b.not + ' ' + A.sablonSoru(b)), ...sonuc.map(r => r.aciklama), ...celisen.map(r => r.aciklama)];
const yasak = /propaganda|\byalan\b|manipülasyon|taraflı|doğru söylüyor|yanlış söylüyor/i;
ok('Jarvis çıktısında değerlendirici ifade yok', jarvis.every(x => !yasak.test(x)), `${jarvis.length} cümle`);
ok('filtre: "propaganda", "yalan", "taraflı" yakalanıyor', ['Bu propaganda.', 'Bu bir yalan.', 'Kaynak taraflı.', 'X doğru söylüyor.', 'Manipülasyon var.'].every(x => !A.temizMi(x)));
ok('filtre: tarafsız cümleler geçiyor ("yalanladı" fiili alıntılarda olabilir)', ['Yedi kaynak bu olayı veriyor.', 'Bakanlık iddiaları yalanladı.'].every(A.temizMi));

// ———————————————— 5) Kümeleme ve tam metin ————————————————
const h = (source: string, title: string, summary = '') => ({ id: '', title, summary, category: 'gundem', source, published_at: saat, url: `https://${source}.example/${title.length}`, image_url: null });
const kumeler = C.kumele([
  h('a', "Ürdün'de kiliseye silahlı saldırı: 7 kişi öldü"),
  h('b', "Ürdün'de kilisede silahlı saldırı: 7 ölü, 27 yaralı"),
  h('c', "Fransa'da silahlı saldırı: 1 kişi öldü, 5 kişi yaralandı"),
  h('d', 'Merkez Bankası faiz kararını açıkladı'),
]);
ok('aynı olay tek kümede', kumeler.some(k => k.kaynaklar.length === 2 && k.kaynaklar.includes('a') && k.kaynaklar.includes('b')));
ok('farklı ülkelerdeki benzer olaylar ayrı kümede', !kumeler.some(k => k.kaynaklar.includes('c') && k.kaynaklar.length > 1));
const ld = '<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","articleBody":"' + 'Bu bir deneme haber metnidir. '.repeat(10) + 'Haberleri Google News üzerinden takip edin."}</script></html>';
const m1 = T.anaMetin(ld);
ok('tam metin: JSON-LD articleBody, tanıtım cümlesi atıldı', !!m1 && m1.startsWith('Bu bir deneme') && !/Google/.test(m1));
const p = '<article><p>Menü Ana Sayfa Gündem Ekonomi Spor Dünya Teknoloji Yaşam Sağlık Yazarlar</p><p>' + 'Valilik açıklamasına göre olay sabah saatlerinde yaşandı ve yetkililer bilgi verdi. '.repeat(3) + '</p></article>';
const m2 = T.anaMetin(p);
ok('tam metin: paragraflar, menü satırı atıldı', !!m2 && !/Menü/.test(m2));

console.log(`\n${n - fail}/${n} haber modu testi geçti`);
fs.rmSync(process.env.HABER_ARSIV!, { recursive: true, force: true });
if (fail) { console.error(`${fail} test başarısız`); process.exit(1); }
process.exit(0);
