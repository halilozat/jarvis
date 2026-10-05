// API anahtarı yokken (ya da MOCK=1) arayüzü geliştirmek için demo cevaplar.
// Haberler KURGUSALDIR; kaynak adları bilerek "Demo ..." şeklindedir.
import { __setCacheForTest } from './news.js';
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

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function mockReply(text: string, device: Device, progress: ToolProgress) {
  const toolLog: string[] = [];
  const log = (l: string) => (toolLog.push(l), progress(l));
  log('düşünüyor');
  await wait(500);

  if (!/ayd[ıi]nlat\s*beni|devam/i.test(text)) {
    return {
      sahneler: [{ ses: `Demo modundayım. ${device === 'telefon' ? 'Telefondan' : 'Buradan'} sizi duyuyorum efendim ama gerçek cevaplar için API anahtarını eklemeniz gerekiyor.`, gorsel: { tip: 'yok' } }] as Sahne[],
      detay: '`.env` dosyasına `ABACUS_API_KEY` ekleyip sunucuyu yeniden başlat.',
      toolLog,
      toolText: '',
    };
  }

  __setCacheForTest(DEMO_NEWS);
  log('haber kaynakları taranıyor');
  await wait(900);
  log('4 kaynak tarandı · 5 haber bulundu');
  await wait(400);
  log('cevabı hazırlıyor');
  await wait(500);

  const sahneler: Sahne[] = [
    { ses: 'Merhaba efendim, kahvenizi aldıysanız başlıyorum.', gorsel: { tip: 'yok' } },
    { ses: 'Merkez Bankası faizi yüzde 38,5 seviyesinde sabit bıraktı.', gorsel: { tip: 'sayi', deger: 38.5, birim: '%', etiket: 'Politika faizi', yon: 'sabit', kaynak: 'Demo Ajans', haber_id: 'n1', foto_arama: 'central bank building' } },
    { ses: 'Dolar ise hafta boyunca yavaş ama istikrarlı bir yükselişle 41 lira 85 kuruşa geldi.', gorsel: { tip: 'grafik', baslik: 'Dolar/TL · bu hafta', birim: '₺', kaynak: 'Demo Finans', seri: [{ etiket: 'Pzt', deger: 41.62 }, { etiket: 'Sal', deger: 41.7 }, { etiket: 'Çar', deger: 41.75 }, { etiket: 'Per', deger: 41.81 }, { etiket: 'Cum', deger: 41.85 }], haber_id: 'n2', foto_arama: 'currency exchange money' } },
    { ses: "İzmir açıklarında 4,6 büyüklüğünde bir deprem oldu. Neyse ki hasar bildirilmedi.", gorsel: { tip: 'harita', sehirler: ['İzmir'], etiket: '4,6 büyüklüğünde deprem', haber_id: 'n3', foto_arama: 'izmir coast city' } },
    { ses: 'Yeni vergi düzenlemesi Meclis gündeminde. Taraflar bunu çok farklı yorumluyor, ikisini de ekrana koydum.', gorsel: { tip: 'karsilastirma', olay: 'Vergi düzenlemesi', taraflar: [{ kaynak: 'Hükümet', ozet: 'Gelir adaletini artıracak.' }, { kaynak: 'Muhalefet', ozet: 'Orta sınıfa ek yük getirecek.' }], haber_id: 'n4', foto_arama: 'parliament building' } },
    { ses: 'Sporda da milli takım kadrosu açıklandı, iki yeni isim var.', gorsel: { tip: 'baslik', kategori: 'spor', metin: 'Milli takımın 26 kişilik kadrosu açıklandı', kaynaklar: ['Demo Spor'], haber_id: 'n5', foto_arama: 'football stadium' } },
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

> Bu bir **demo** cevabıdır; haberler kurgusaldır.`;

  return { sahneler, detay, toolLog, toolText: JSON.stringify(DEMO_NEWS) };
}
