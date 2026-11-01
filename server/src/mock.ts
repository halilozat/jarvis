// DEMO modu: yapay zekâ anahtarı yokken (ya da MOCK=1) Jarvis hazır cevaplarla ve ÜCRETSİZ GERÇEK verilerle çalışır.
// Model yok: niyet basit kalıplarla bulunur. Gerçek veriler: hava (Open-Meteo), döviz (TCMB), manşetler (RSS kümeleri),
// Wikipedia, ev cihazları (simülasyon / Home Assistant) ve kitaplık. Anlaşılmayan soruda Jarvis anahtarın nereden
// ekleneceğini söyler. Haber kaynakları alınamazsa brifing KURGUSAL örnekle döner (kaynak adları "Demo …").
import { __setCacheForTest } from './news.js';
import { getMarkets, getWeather } from './dashboard.js';
import { guncelKumeler } from './newsCenter.js';
import { wikiLookup } from './wiki.js';
import { control, resolveDevice, type DeviceId, type HomeAction } from './home.js';
import { getLibrary } from './library.js';
import { BRIEF_OPENING } from './brief.js';
import type { Device, NewsItem, Sahne } from './types.js';
import type { ToolProgress } from './tools.js';

const now = () => new Date().toISOString();
const DEMO_NEWS: NewsItem[] = [
  { id: 'n1', title: 'Merkez Bankası faiz kararını açıkladı', summary: 'Politika faizi yüzde 38,5 seviyesinde sabit bırakıldı.', category: 'ekonomi', source: 'Demo Ajans', published_at: now(), url: '', image_url: null },
  { id: 'n2', title: 'Dolar/TL haftayı yatay kapattı', summary: 'Kur pazartesi 41,62, salı 41,70, çarşamba 41,75, perşembe 41,81, cuma 41,85 seviyesinde.', category: 'ekonomi', source: 'Demo Finans', published_at: now(), url: '', image_url: null },
  { id: 'n3', title: "İzmir'de 4,6 büyüklüğünde deprem", summary: 'AFAD verilerine göre deprem İzmir açıklarında yaşandı, hasar bildirilmedi.', category: 'gundem', source: 'Demo Ajans', published_at: now(), url: '', image_url: null },
  { id: 'n4', title: 'Yeni vergi düzenlemesi Meclis gündeminde', summary: 'Düzenleme bir kesime göre gelir adaletini artıracak, muhalefete göre orta sınıfa ek yük getirecek.', category: 'gundem', source: 'Demo Gazete', published_at: now(), url: '', image_url: null },
  { id: 'n5', title: 'Milli takım kadrosu açıklandı', summary: 'Teknik direktör 26 kişilik kadroyu duyurdu, iki yeni isim ilk kez davet edildi.', category: 'spor', source: 'Demo Spor', published_at: now(), url: '', image_url: null },
];

export const DEMO_NOTU = "Bu bir demo cevabıdır. Jarvis'e serbest soru sormak için **Ayarlar → Beyin**'den ücretsiz bir Google Gemini ya da Groq anahtarı ekleyin (kart istemez, iki dakika sürer).";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const kucuk = (s: string) => s.toLocaleLowerCase('tr').replace(/[’'`]/g, '').replace(/\s+/g, ' ').trim();
const virgul = (n: number, basamak = 2) => n.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
const saatTR = () => new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
/** Bulunma eki, ses uyumuyla: İstanbul'da, İzmir'de, Ankara'da, Trabzon'da, Bursa'da, Tokat'ta */
export function bulunma(ad: string): string {
  const k = ad.toLocaleLowerCase('tr');
  const unlu = [...k].reverse().find(c => 'aeıioöuü'.includes(c)) ?? 'a';
  const sert = /[fstkçşhp]$/.test(k);
  return `${ad}'${sert ? 't' : 'd'}${'aıou'.includes(unlu) ? 'a' : 'e'}`;
}
const ilkCumleler = (s: string, n: number) => (s.match(/[^.!?]+[.!?]+/g) ?? [s]).slice(0, n).join(' ').trim();

export interface MockSonuc { sahneler: Sahne[]; detay: string; toolLog: string[]; toolText: string }

/** Demo niyetleri: sıra önemli (önce dar kalıplar). Testler ayrı ayrı çağırabilsin diye dışarı açık. */
export function demoNiyet(text: string):
  | 'brifing' | 'selam' | 'saat' | 'tanit' | 'hava' | 'doviz' | 'ev' | 'kitap' | 'tesekkur' | 'wiki' | 'bilinmiyor' {
  const t = kucuk(text).replace(/^(hey\s+)?jarvis[,\s]*/, '');
  if (/ayd[ıi]nlat\s*beni|gündem|gundem|brifing|manşet|manset|haberler|neler oluyor|^devam/.test(t)) return 'brifing';
  if (/kimsin|kendini tanıt|kendini tanit|neler yapabilirsin|ne yapabilirsin|ne işe yarıyorsun|özelliklerin/.test(t)) return 'tanit';
  if (/hava|yağmur|yagmur|sıcaklık|sicaklik|derece|şemsiye|semsiye/.test(t)) return 'hava';
  if (/dolar|euro|avro|sterlin|döviz|doviz|\bkur\b|kurlar/.test(t)) return 'doviz';
  if (/(ışı|isi|ışık|isik|lamba|filtre kahve)/.test(t) && /(aç|ac|yak|kapat|söndür|sondur|demle|hazırla|kıs|azalt|artır)/.test(t)) return 'ev';
  if (/kitap/.test(t) && /(öner|oner|ne okuyayım|ne okusam|okuyacak)/.test(t)) return 'kitap';
  if (/saat kaç|saat kac|bugün günlerden|tarih ne|bugünün tarihi/.test(t)) return 'saat';
  if (/teşekkür|tesekkur|sağ ol|sag ol|eyvallah|süpersin/.test(t)) return 'tesekkur';
  if (/^(merhaba|selam|günaydın|gunaydin|iyi akşamlar|iyi aksamlar|iyi geceler|naber|nasılsın|nasilsin)/.test(t)) return 'selam';
  if (wikiKonusu(t)) return 'wiki';
  return 'bilinmiyor';
}

/** "Atatürk kimdir", "Kapadokya nerede", "Mars hakkında bilgi ver" → konu */
export function wikiKonusu(text: string): string | null {
  const t = kucuk(text).replace(/^(hey\s+)?jarvis[,\s]*/, '').replace(/[?.!]+$/, '').trim();
  const m = /^(.{2,60}?)\s+(kimdir|kim|nedir|ne demek|nerede|neresi|nerededir)$/.exec(t)
    ?? /^(.{2,60}?)\s+hakkında(?: bana)? (?:bilgi ver|ne biliyorsun|anlat)$/.exec(t)
    ?? /^bana\s+(.{2,60}?)\s+(?:hakkında bilgi ver|anlat)$/.exec(t);
  return m ? m[1].replace(/['’]?(n[ıi]n|[ıi]n|in|un|ün)$/u, '').trim() : null;
}

function selam(device: Device): Sahne[] {
  const h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }));
  const s = h < 11 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
  return [{ ses: `${s} efendim. ${device === 'telefon' ? 'Telefondan' : 'Buradan'} sizi duyuyorum. Demo modundayım ama hava, döviz, gündem ve Wikipedia sorularınıza gerçek verilerle cevap verebilirim.`, gorsel: { tip: 'ikon', ikon: 'smile', baslik: 'Jarvis · Demo', alt: '"Jarvis, aydınlat beni" deyin' } }];
}

function tanit(): Sahne[] {
  return [
    { ses: 'Ben Jarvis, kişisel yapay zekâ asistanınız. Şu an demo modundayım, yani beynim henüz takılmadı ama ellerim boş değil.', gorsel: { tip: 'ikon', ikon: 'sparkles', baslik: 'Jarvis', alt: 'Demo modu' } },
    { ses: 'Demo modunda bile gerçek verilerle çalışırım: güncel hava, Merkez Bankası kurları, onlarca kaynaktan gündem, Wikipedia, haber merkezi ve El Kontrolü.', gorsel: { tip: 'kart', baslik: 'Demoda çalışanlar', maddeler: [{ ikon: 'cloud', metin: 'Hava durumu (Open-Meteo)' }, { ikon: 'wallet', metin: 'Döviz kurları (TCMB)' }, { ikon: 'newspaper', metin: 'Gündem ve haber merkezi' }, { ikon: 'hand', metin: 'El Kontrolü ve Uzay Laboratuvarı' }] } },
    { ses: 'Serbest sohbet, fotoğraf yorumlama ve ses tanıma için Ayarlar, Beyin bölümünden bir anahtar eklemeniz yeterli. Google Gemini ve Groq ücretsiz.', gorsel: { tip: 'ikon', ikon: 'cpu', baslik: 'Beyin ekle', alt: 'Ayarlar → Beyin · Gemini / Groq ücretsiz' } },
  ];
}

async function hava(log: (l: string) => void) {
  log('hava durumu alınıyor');
  const w = await getWeather().catch(() => null);
  if (!w) return null;
  const temp = Math.round(w.temp), max = Math.round(w.today.max), min = Math.round(w.today.min);
  const yagis = w.today.rain_prob;
  const sahneler: Sahne[] = [
    { ses: `${bulunma(w.city)} şu an ${temp} derece, ${w.description.toLocaleLowerCase('tr')}. Bugün en yüksek ${max}, en düşük ${min} derece.`, gorsel: { tip: 'sayi', deger: temp, birim: '°C', etiket: `${w.city} · ${w.description}`, kaynak: 'Open-Meteo' } },
  ];
  if (yagis != null) sahneler.push({
    ses: yagis >= 50 ? `Yağış ihtimali yüzde ${yagis}. Şemsiyenizi almanızı öneririm efendim.` : `Yağış ihtimali yüzde ${yagis}; şemsiyeye gerek yok gibi görünüyor.`,
    gorsel: { tip: 'grafik', baslik: 'Önümüzdeki saatler', birim: '°C', kaynak: 'Open-Meteo', seri: w.hourly.slice(0, 8).map(x => ({ etiket: x.time.slice(11, 16) || x.time, deger: Math.round(x.temp) })) },
  });
  return { sahneler, toolText: JSON.stringify({ ...w, yuvarlak: { temp, max, min, saatlik: w.hourly.slice(0, 8).map(x => Math.round(x.temp)) } }) };
}

async function doviz(text: string, log: (l: string) => void) {
  log('TCMB kurları alınıyor');
  const m = await getMarkets().catch(() => null);
  if (!m?.items.length) return null;
  const t = kucuk(text);
  const kod = /euro|avro/.test(t) ? 'EUR' : /sterlin|pound/.test(t) ? 'GBP' : 'USD';
  const it = m.items.find(i => i.code === kod) ?? m.items[0];
  const deger = Math.round(it.value * 100) / 100;
  const degisim = it.change_pct == null ? '' : it.change_pct > 0.05 ? `, dünden bu yana yüzde ${virgul(it.change_pct)} yükselişte` : it.change_pct < -0.05 ? `, dünden bu yana yüzde ${virgul(Math.abs(it.change_pct))} düşüşte` : ', dünle neredeyse aynı';
  const diger = m.items.filter(i => i !== it).map(i => `${i.name} ${virgul(i.value)}`).join(', ');
  const seri = it.history.slice(-7).map(h => ({ etiket: h.date.slice(5).split('-').reverse().join('.'), deger: Math.round(h.value * 100) / 100 }));
  const sahneler: Sahne[] = [
    { ses: `${it.name} şu an ${virgul(deger)} lira${degisim}.`, gorsel: { tip: 'sayi', deger, birim: '₺', etiket: `${it.name} · TCMB`, yon: it.change_pct == null ? undefined : it.change_pct > 0.05 ? 'yukari' : it.change_pct < -0.05 ? 'asagi' : 'sabit', kaynak: 'TCMB' } },
  ];
  if (seri.length >= 3) sahneler.push({ ses: diger ? `Diğerleri: ${diger}.` : 'Son günlerin seyri ekranda.', gorsel: { tip: 'grafik', baslik: `${it.name} · son günler`, birim: '₺', kaynak: 'TCMB', seri } });
  return { sahneler, toolText: JSON.stringify({ ...m, yuvarlak: { deger, seri: seri.map(s => s.deger) } }) };
}

/** Brifing: gerçek manşetler, en çok kaynağın verdiği olaylar önce. Yorum yok: "N kaynak veriyor: başlık". */
async function brifing(log: (l: string) => void) {
  log('haber kaynakları taranıyor');
  const kumeler = await Promise.race([guncelKumeler().catch(() => []), wait(12_000).then(() => [])]);
  const secilen = kumeler.filter(k => k.baslik).sort((a, b) => b.kaynaklar.length - a.kaynaklar.length || b.son.localeCompare(a.son)).slice(0, 5);
  if (secilen.length < 3) return null;
  log(`${kumeler.length} olay bulundu · en çok konuşulan ${secilen.length} olay`);
  const sahneler: Sahne[] = [{ ses: BRIEF_OPENING, gorsel: { tip: 'yok' } }];
  secilen.forEach((k, i) => {
    const n = k.kaynaklar.length;
    const giris = i === 0 ? (n > 1 ? `Günün en çok konuşulan haberi; ${n} kaynak veriyor: ` : 'Önce şu: ') : n > 1 ? `${n} kaynak veriyor: ` : `${k.kaynaklar[0]} bildiriyor: `;
    // Sondaki " - Kaynak Adı" yalnızca gerçekten kaynak adıysa atılır ("Fenerbahçe - Galatasaray" kalır)
    const son = /\s+[-|–]\s+([^-|–]+)$/.exec(k.baslik);
    const baslik = son && k.kaynaklar.some(x => x.toLocaleLowerCase('tr') === son[1].trim().toLocaleLowerCase('tr')) ? k.baslik.slice(0, son.index) : k.baslik;
    sahneler.push({ ses: `${giris}${baslik.replace(/[.!?…]+$/, '')}.`, gorsel: { tip: 'baslik', kategori: k.kategori, metin: k.baslik, kaynaklar: k.kaynaklar.slice(0, 4) } });
  });
  sahneler.push({ ses: 'Şimdilik bu kadar efendim. Ayrıntı için haber merkezini açabilirsiniz.', gorsel: { tip: 'yok' } });
  const detay = secilen.map(k => `- **${k.baslik}** · ${k.kaynaklar.slice(0, 5).join(', ')}${k.haberler[0]?.url ? ` · [haber](${k.haberler[0].url})` : ''}`).join('\n')
    + "\n\n> Demo brifingi: manşetler gerçek, sıralama kaynak sayısına göre; yorum ve özet için **Ayarlar → Beyin**'den anahtar ekleyin.";
  return { sahneler, detay, toolText: JSON.stringify(secilen.map(k => ({ baslik: k.baslik, kaynaklar: k.kaynaklar }))) };
}

function ev(text: string): Sahne[] | null {
  const t = kucuk(text);
  const id: DeviceId = resolveDevice(t) ?? (/filtre/.test(t) ? 'filtre_kahve' : 'salon_isik');
  const kapat = /(kapat|söndür|sondur)/.test(t);
  const a: HomeAction = { islem: kapat ? 'kapat' : id === 'filtre_kahve' ? 'demle' : 'ac' };
  const p = /%\s*(\d{1,3})|yüzde\s*(\d{1,3})/.exec(t);
  if (p) a.parlaklik = Number(p[1] ?? p[2]);
  if (/sıcak|sicak/.test(t)) a.ton = 'sicak';
  else if (/soğuk|soguk|beyaz/.test(t)) a.ton = 'soguk';
  const r = control(id, a);
  if ('hata' in r) return null;
  const ad = r.cihaz.ad;
  const ses = id === 'filtre_kahve'
    ? kapat ? 'Filtre kahve makinesini kapattım efendim.' : `Filtre kahve demleniyor efendim, ${r.ozet.replace(/^demleniyor · /, '')}.`
    : kapat ? `${ad} kapatıldı.` : `${ad} açıldı efendim${p ? `, parlaklık yüzde ${a.parlaklik}` : ''}.`;
  return [{ ses, gorsel: { tip: 'ikon', ikon: id === 'filtre_kahve' ? 'coffee' : 'lightbulb', baslik: ad, alt: r.ozet } }];
}

function kitap(): Sahne[] {
  const k = getLibrary().kitaplar.filter(b => b.ad);
  const aday = k.filter(b => b.durum === 'okunacak');
  if (!k.length) return [{ ses: 'Kitaplığınız henüz boş efendim. El Kontrolü\'nde Kitaplık\'ı açıp rafınızı taratabilir ya da elle kitap ekleyebilirsiniz.', gorsel: { tip: 'ikon', ikon: 'book-open', baslik: 'Kitaplık boş' } }];
  const sec = (aday.length ? aday : k)[Math.floor(Math.random() * (aday.length || k.length))];
  return [{
    ses: `Rafınızda ${k.length} kitap var${aday.length ? `, ${aday.length} tanesi okunmayı bekliyor` : ''}. Sıradaki için ${sec.ad}${sec.yazar ? `, ${sec.yazar}` : ''} öneririm efendim.`,
    gorsel: { tip: 'ikon', ikon: 'book-open', baslik: sec.ad!, alt: sec.yazar ?? undefined },
  }];
}

async function wiki(text: string, log: (l: string) => void) {
  const konu = wikiKonusu(text);
  if (!konu) return null;
  log(`wikipedia: ${konu}`);
  const w = await wikiLookup(konu).catch(() => null);
  if (!w?.ozet) return null;
  const ozet = ilkCumleler(w.ozet, 2);
  const sahneler: Sahne[] = [{ ses: ilkCumleler(w.ozet, 1).slice(0, 260), gorsel: { tip: 'kisi_yer', baslik: w.baslik, ozet, wiki: w.baslik } as Sahne['gorsel'] }];
  return { sahneler, detay: `${w.ozet}\n\n*Kaynak: [Wikipedia](${w.sayfa})*`, toolText: JSON.stringify(w) };
}

/** Haber kaynakları alınamazsa: kurgusal örnek brifing (kaynak adları "Demo …") */
function kurguBrifing() {
  __setCacheForTest(DEMO_NEWS);
  const sahneler: Sahne[] = [
    { ses: BRIEF_OPENING, gorsel: { tip: 'yok' } },
    { ses: 'Merkez Bankası faizi yüzde 38,5 seviyesinde sabit bıraktı.', gorsel: { tip: 'sayi', deger: 38.5, birim: '%', etiket: 'Politika faizi', yon: 'sabit', kaynak: 'Demo Ajans', haber_id: 'n1', foto_arama: 'central bank building' } as Sahne['gorsel'] },
    { ses: 'Dolar ise hafta boyunca yavaş ama istikrarlı bir yükselişle 41 lira 85 kuruşa geldi.', gorsel: { tip: 'grafik', baslik: 'Dolar/TL · bu hafta', birim: '₺', kaynak: 'Demo Finans', seri: [{ etiket: 'Pzt', deger: 41.62 }, { etiket: 'Sal', deger: 41.7 }, { etiket: 'Çar', deger: 41.75 }, { etiket: 'Per', deger: 41.81 }, { etiket: 'Cum', deger: 41.85 }], haber_id: 'n2', foto_arama: 'currency exchange money' } as Sahne['gorsel'] },
    { ses: "İzmir açıklarında 4,6 büyüklüğünde bir deprem oldu. Neyse ki hasar bildirilmedi.", gorsel: { tip: 'harita', sehirler: ['İzmir'], etiket: '4,6 büyüklüğünde deprem', haber_id: 'n3', foto_arama: 'izmir coast city' } as Sahne['gorsel'] },
    { ses: 'Yeni vergi düzenlemesi Meclis gündeminde. Taraflar bunu çok farklı yorumluyor, ikisini de ekrana koydum.', gorsel: { tip: 'karsilastirma', olay: 'Vergi düzenlemesi', taraflar: [{ kaynak: 'Hükümet', ozet: 'Gelir adaletini artıracak.' }, { kaynak: 'Muhalefet', ozet: 'Orta sınıfa ek yük getirecek.' }], haber_id: 'n4', foto_arama: 'parliament building' } as Sahne['gorsel'] },
    { ses: 'Sporda da milli takım kadrosu açıklandı, iki yeni isim var.', gorsel: { tip: 'baslik', kategori: 'spor', metin: 'Milli takımın 26 kişilik kadrosu açıklandı', kaynaklar: ['Demo Spor'], haber_id: 'n5', foto_arama: 'football stadium' } as Sahne['gorsel'] },
    { ses: 'Şimdilik bu kadar. Geri kalan detaylar aşağıda.', gorsel: { tip: 'yok' } },
  ];
  const detay = `### Ekonomi
- **Faiz sabit** — Politika faizi %38,5'te bırakıldı. *Kaynak: Demo Ajans*
- **Dolar/TL** — Hafta 41,62'den açıldı, 41,85'ten kapandı. *Kaynak: Demo Finans*

### Gündem
- **İzmir'de deprem** — 4,6 büyüklüğünde, hasar bildirilmedi. *Kaynak: Demo Ajans*
- **Vergi düzenlemesi** — Meclis'te; taraflar farklı yorumluyor. *Kaynak: Demo Gazete*

### Spor
- **Milli takım kadrosu** — 26 kişi, iki yeni isim. *Kaynak: Demo Spor*

> Haber kaynaklarına şu an ulaşılamadı; bu **kurgusal** bir demo brifingidir.`;
  return { sahneler, detay, toolText: JSON.stringify(DEMO_NEWS) };
}

export async function mockReply(text: string, device: Device, progress: ToolProgress): Promise<MockSonuc> {
  const toolLog: string[] = [];
  const log = (l: string) => (toolLog.push(l), progress(l));
  log('düşünüyor');
  await wait(250);
  const sonuc = (sahneler: Sahne[], detay = '', toolText = ''): MockSonuc => ({ sahneler, detay: detay ? `${detay}\n\n${DEMO_NOTU}` : DEMO_NOTU, toolLog, toolText });

  switch (demoNiyet(text)) {
    case 'brifing': {
      const b = await brifing(log);
      if (b) return { ...b, toolLog };
      log('kaynaklara ulaşılamadı · örnek brifing');
      return { ...kurguBrifing(), toolLog };
    }
    case 'selam': return sonuc(selam(device));
    case 'tanit': return sonuc(tanit());
    case 'tesekkur': return sonuc([{ ses: 'Rica ederim efendim, her zaman.', gorsel: { tip: 'yok' } }]);
    case 'saat': {
      const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long' });
      return sonuc([{ ses: `Saat ${saatTR()} efendim, bugün ${tarih}.`, gorsel: { tip: 'ikon', ikon: 'clock', baslik: saatTR(), alt: tarih } }]);
    }
    case 'hava': {
      const h = await hava(log);
      if (h) return sonuc(h.sahneler, '', h.toolText);
      break;
    }
    case 'doviz': {
      const d = await doviz(text, log);
      if (d) return sonuc(d.sahneler, '', d.toolText);
      break;
    }
    case 'ev': {
      const e = ev(text);
      if (e) return sonuc(e);
      break;
    }
    case 'kitap': return sonuc(kitap());
    case 'wiki': {
      const w = await wiki(text, log);
      if (w) return sonuc(w.sahneler, w.detay, w.toolText);
      break;
    }
  }
  return sonuc([
    { ses: 'Demo modundayım efendim, bu soruyu cevaplayacak bir beynim henüz yok. Ayarlar, Beyin bölümünden ücretsiz bir Gemini ya da Groq anahtarı eklerseniz her şeyi sorabilirsiniz.', gorsel: { tip: 'ikon', ikon: 'cpu', baslik: 'Beyin ekleyin', alt: 'Ayarlar → Beyin · Gemini / Groq ücretsiz' } },
    { ses: 'Şimdilik hava, döviz, gündem, Wikipedia ve ev komutlarında yardımcı olabilirim. Örneğin: Jarvis, aydınlat beni.', gorsel: { tip: 'kart', baslik: 'Demoda deneyin', maddeler: [{ ikon: 'newspaper', metin: '"Jarvis, aydınlat beni"' }, { ikon: 'cloud', metin: '"Hava nasıl?"' }, { ikon: 'wallet', metin: '"Dolar kaç?"' }, { ikon: 'globe', metin: '"Kapadokya nerede?"' }] } },
  ]);
}
