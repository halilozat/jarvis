import { getNews, type GetNewsArgs } from './news.js';
import { getMarkets, getWeather } from './dashboard.js';
import { wikiLookup } from './wiki.js';
import { addMemory, removeMemory } from './profile.js';
import { checkVideo, findHighlights, latestFromChannel, searchVideos, videoIdFrom } from './youtube.js';
import { lookAtCamera } from './camera.js';
import { control, homeMode, homeState, type DeviceId } from './home.js';
import { addBook, addBookNote, fillInBackground, findBook, setBookStatus } from './library.js';
import { controlPower, getSystemStats, killApp, launchApp, setVolume } from './system.js';
import { searchWeb } from './websearch.js';
import { addReminder, addTodo, completeTodo, deleteTodo, listReminders, listTodos } from './reminders.js';
import { getFinancialMarkets } from './finance.js';
import { sendTelegramMessage, showNotification } from './notifications.js';
import { getRecentFiles, organizeDesktop, searchLocalFiles } from './filemanager.js';
import { setLocation, saveSettings, loadSettings } from './settings.js';
import { listProjects, getProject, createOrUpdateProject, updateProjectStatus, deleteProject, type ProjectType, type CodingCli } from './projects.js';
import { runCodingTask, isProjectBusy } from './clibridge.js';
import { auditProject, startProjectServer, stopProjectServer } from './inspector.js';

// Not: `strict` alanı bilerek yok (RouteLLM 400 döndürebiliyor).
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_news',
      description:
        "Türkiye ve dünya gündeminden güncel haberleri birden fazla kaynaktan getirir. Gündem, haber veya 'bugün ne oldu' sorularında mutlaka kullanılır.",
      parameters: {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            items: { type: 'string', enum: ['gundem', 'ekonomi', 'teknoloji', 'spor', 'dunya', 'bilim', 'kultur-sanat', 'saglik'] },
            description: 'İstenen kategoriler. Boş bırakılırsa tüm kategoriler.',
          },
          exclude_categories: { type: 'array', items: { type: 'string' }, description: "Hariç tutulacak kategoriler (ör. 'spor yok')." },
          since_hours: { type: 'integer', description: 'Kaç saat öncesine kadar. Varsayılan 18.' },
          limit: { type: 'integer', description: 'En fazla kaç haber. Varsayılan 30.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_markets',
      description:
        "TCMB'nin açıkladığı döviz satış kurları (USD, EUR, GBP): son değer, bir önceki iş gününe göre yüzde değişim ve son 7 iş gününün geçmişi (history). Dolar, euro, sterlin ve kur sorularında kullanılır.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Kullanıcının şehri için anlık hava durumu ve bugünün tahmini (sıcaklık, hissedilen, en yüksek/en düşük, yağış olasılığı, rüzgâr).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wiki_lookup',
      description:
        "Türkçe Wikipedia'dan (yoksa İngilizce) bir kişi, yer, kurum ya da kavramın özetini, lisanslı fotoğrafının olup olmadığını ve koordinatını getirir. Gerçek kişi/yer/kurum sorularında ve nüfus, yükseklik, tarih gibi sayısal bilgilerde kullanılır.",
      parameters: {
        type: 'object',
        properties: { baslik: { type: 'string', description: 'Sayfa başlığı, ör. "Albert Einstein", "Ankara", "Boğaziçi Köprüsü"' } },
        required: ['baslik'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kameraya_bak',
      description: "Evdeki kamera cihazından (Jarvis'in gözü) anlık bir kare alır ve görüntü modeline sorar. 'Mutfakta ne var', 'kahve makinesinin önünde fincan var mı', 'kapıya bak' gibi isteklerde kullanılır.",
      parameters: {
        type: 'object',
        properties: {
          kamera: { type: 'string', description: 'Kamera etiketi ya da konumu (ör. "CAM-01", "mutfak"). Belirtilmediyse boş bırak.' },
          soru: { type: 'string', description: 'Karede neye bakılacağı, kullanıcının sorusu' },
        },
        required: ['soru'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ev_kontrol',
      description: "Akıllı ev cihazlarını kontrol eder ya da durumlarını söyler: salon ışığı, çalışma odası ışığı, Türk kahve makinesi, filtre kahve makinesi. 'Salonun ışığını aç', 'çalışma odasını yüzde 30 yap', 'ışıkları kapat', 'filtre kahveyi demle', 'kahve hazır mı' gibi isteklerde kullanılır.",
      parameters: {
        type: 'object',
        properties: {
          cihaz: { type: 'string', enum: ['salon_isik', 'calisma_isik', 'tum_isiklar', 'turk_kahve', 'filtre_kahve', 'hepsi'], description: '"hepsi" yalnızca durum sormak için' },
          islem: { type: 'string', enum: ['ac', 'kapat', 'ayarla', 'pisir', 'demle', 'durum'] },
          parlaklik: { type: 'integer', description: 'Işık için 1-100' },
          ton: { type: 'string', enum: ['sicak', 'notr', 'soguk'], description: 'Işık rengi' },
          kopuk: { type: 'string', enum: ['az', 'orta', 'bol'], description: 'Türk kahvesi köpüğü' },
          seker: { type: 'string', enum: ['sade', 'az', 'orta', 'sekerli'], description: 'Türk kahvesi şekeri' },
          fincan: { type: 'integer', description: 'Filtre kahve için 1-4 fincan' },
        },
        required: ['cihaz', 'islem'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hafiza_ekle',
      description: 'Kullanıcı hakkında kalıcı bir notu hafızaya ekler ("unutma", "aklında tut" dediğinde ya da kendisi hakkında yeni ve kalıcı bir bilgi verdiğinde). Hassas bilgi ekleme.',
      parameters: {
        type: 'object',
        properties: { not: { type: 'string', description: 'Üçüncü şahıs, tek cümle. Ör. "Cuma günleri çekim yapıyor."' } },
        required: ['not'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hafiza_sil',
      description: 'Hafızadaki bir notu kimliğiyle siler ("unut", "bunu sil" dendiğinde ya da not artık doğru değilse).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Hafıza bölümündeki köşeli parantez içindeki kimlik' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kitaplik_ekle',
      description: "Kitaplığa bir kitap ekler (rafta yeri olmadan; El Kontrolü'nde K ile rafa yerleştirilir) ve Jarvis sayfalarını (özet, ana fikirler, yazar, temalar, benzer kitaplar) arka planda doldurur. 'Kitaplığıma Davranış'ı ekle', 'kitabın adı Davranış', 'Sapolsky'nin Davranış kitabı bende var' gibi isteklerde kullanılır.",
      parameters: {
        type: 'object',
        properties: {
          kitap: { type: 'string', description: 'Kitabın adı' },
          yazar: { type: 'string', description: 'Yazar (söylendiyse)' },
        },
        required: ['kitap'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kitaplik_doldur',
      description: "Kitaplıktaki bir kitabın Jarvis sayfalarını (özet, ana fikirler, yazar hakkında, temalar, neden okumalı, benzer kitaplar) arka planda doldurur ya da yeniden yazar. 'Davranış'ın sayfalarını doldur', 'şu kitabın içini doldur' gibi.",
      parameters: { type: 'object', properties: { kitap: { type: 'string', description: 'Kitabın adı' } }, required: ['kitap'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kitaplik_not_ekle',
      description: "Kitaplıktaki bir kitaba not ya da alıntı ekler. 'Davranış'a not ekle: …', 'Mülksüzler'e şu alıntıyı ekle: …' gibi isteklerde kullanılır. Notlar kitap El Kontrolü'nde açılınca sayfalarda görünür.",
      parameters: {
        type: 'object',
        properties: {
          kitap: { type: 'string', description: 'Kitabın adı (kitaplık bölümündeki gibi), ör. "Otostopçunun Galaksi Rehberi"' },
          metin: { type: 'string', description: 'Notun ya da alıntının kendisi; kullanıcının söylediği gibi, kısa' },
          tur: { type: 'string', enum: ['not', 'alinti'], description: 'Varsayılan not. Kitaptan bir cümle aktarılıyorsa alinti.' },
          yazar: { type: 'string', description: 'Kitap kitaplıkta yoksa eklenirken kullanılacak yazar (söylendiyse)' },
        },
        required: ['kitap', 'metin'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kitaplik_durum',
      description: "Kitaplıktaki bir kitabın okuma durumunu ya da kaldığı sayfayı günceller. 'Tahıla Karşı'yı bitirdim', 'Oblomov'da 120. sayfadayım', 'Anna Karenina'yı okumaya başladım' gibi.",
      parameters: {
        type: 'object',
        properties: {
          kitap: { type: 'string', description: 'Kitabın adı' },
          durum: { type: 'string', enum: ['okunacak', 'okunuyor', 'bitti'] },
          sayfa: { type: 'integer', description: 'Kaldığı sayfa' },
          toplam_sayfa: { type: 'integer', description: 'Kitabın toplam sayfası (söylendiyse)' },
        },
        required: ['kitap'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mac_ozeti_bul',
      description: "Bir takımın en yeni maç özeti videosunu resmi YouTube kanallarında bulur (beIN SPORTS Türkiye, TRT SPOR, LaLiga, Serie A, UEFA, Premier League, büyük kulüplerin kanalları). 'Fener maçının özetini aç', 'Barça maçını aç' gibi isteklerde kullanılır.",
      parameters: {
        type: 'object',
        properties: {
          takim: { type: 'string', description: 'Takım adı, ör. "Fenerbahçe", "Galatasaray", "PSG"' },
          brans: { type: 'string', enum: ['futbol', 'basketbol', 'voleybol'], description: 'Varsayılan futbol. Basketbol/voleybol yalnızca açıkça istenirse.' },
        },
        required: ['takim'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kanal_son_video',
      description: "Bir YouTube kanalının en son videolarını getirir. 'Son videomu aç', '<kullanıcının adı> son videoyu aç', 'S Sport'un son videosu' gibi isteklerde kullanılır. Kullanıcının kendi kanalı için 'son video' varsayılan olarak son Shorts'tur.",
      parameters: {
        type: 'object',
        properties: {
          kanal: { type: 'string', description: 'Kanal adı. Kullanıcının kendi kanalı için "benim".' },
          tur: { type: 'string', enum: ['shorts', 'video', 'hepsi'], description: 'Yalnızca kullanıcı açıkça "uzun video", "normal video" ya da "shorts" derse ver. Boş bırakılırsa kendi kanalında shorts, diğerlerinde hepsi.' },
        },
        required: ['kanal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'youtube_ara',
      description: 'YouTube\'da video arar (Jarvis içinde oynatılabilen videolar). "… videosunu aç", "… ile ilgili bir video göster" gibi isteklerde kullanılır.',
      parameters: {
        type: 'object',
        properties: { sorgu: { type: 'string', description: 'Arama sorgusu, ör. "James Webb teleskobu yeni görüntüler"' } },
        required: ['sorgu'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'youtube_ac',
      description: 'Kullanıcının verdiği YouTube linkini (ya da video kimliğini) doğrular; Jarvis içinde oynatılabiliyorsa bilgisini döndürür.',
      parameters: {
        type: 'object',
        properties: { link: { type: 'string', description: 'YouTube linki' } },
        required: ['link'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sistem_kontrol',
      description: 'Bilgisayar sistemini kontrol eder: ses seviyesi ayarlama/kısma/açma, sistem kaynakları (CPU, RAM, Disk), bilgisayarı kilitleme/uykuya alma/kapatma ve uygulama açıp kapatma.',
      parameters: {
        type: 'object',
        properties: {
          islem: { type: 'string', enum: ['ses', 'kaynaklar', 'kilitle', 'uyku', 'kapat', 'yeniden_baslat', 'uygulama_ac', 'uygulama_kapat'], description: 'Yapılacak sistem eylemi' },
          seviye: { type: 'number', description: 'Ses seviyesi (0-100)' },
          mute: { type: 'boolean', description: 'Sessize al ya da sesi aç' },
          uygulama: { type: 'string', description: 'Açılacak veya kapatılacak uygulama adı (ör. spotify, chrome, code, notepad)' },
          dakika: { type: 'number', description: 'Kapatma veya yeniden başlatma için gecikme dakikası' },
        },
        required: ['islem'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_arama',
      description: 'Canlı internet araması yapar. Wikipedia ve haberler dışında güncel maç sonuçları, fiyatlar, sinema, bilgi ve anlık internet sorguları için kullanılır.',
      parameters: {
        type: 'object',
        properties: {
          sorgu: { type: 'string', description: 'İnternette aranacak ifade veya soru' },
          limit: { type: 'number', description: 'Getirilecek sonuç sayısı (varsayılan 5)' },
        },
        required: ['sorgu'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hatirlatici_ve_gorev',
      description: 'Hatırlatıcı kurma, geri sayım sayacı başlatma ve yapılacaklar (todo) listesi yönetimi.',
      parameters: {
        type: 'object',
        properties: {
          islem: { type: 'string', enum: ['hatirlatici_ekle', 'hatirlaticilari_listele', 'gorev_ekle', 'gorevleri_listele', 'gorev_tamamla', 'gorev_sil'], description: 'İşlem türü' },
          metin: { type: 'string', description: 'Hatırlatılacak not veya görev metni' },
          dakika: { type: 'number', description: 'Hatırlatıcı için kaç dakika sonra çalacağı' },
          oncelik: { type: 'string', enum: ['dusuk', 'normal', 'yuksek'], description: 'Görev önceliği' },
          tamamlananlari_goster: { type: 'boolean', description: 'Tamamlanan görevleri de göster' },
        },
        required: ['islem'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finans_ve_piyasa',
      description: 'Canlı altın fiyatları (gram, çeyrek, cumhuriyet), borsa (BIST 100), kripto para ve serbest piyasa döviz verilerini getirir.',
      parameters: {
        type: 'object',
        properties: {
          kategori: { type: 'string', enum: ['altin', 'doviz', 'borsa', 'hepsi'], description: 'İstenen finansal kategori' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bildirim_gonder',
      description: 'Windows masaüstüne toast bildirimi çıkarır veya kullanıcının Telegram telefonuna mesaj iletir.',
      parameters: {
        type: 'object',
        properties: {
          kanal: { type: 'string', enum: ['masaustu', 'telegram'], description: 'Bildirim kanalı' },
          baslik: { type: 'string', description: 'Bildirim başlığı' },
          mesaj: { type: 'string', description: 'Gönderilecek metin' },
        },
        required: ['mesaj'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dosya_yonetimi',
      description: 'Masaüstü ve İndirilenler klasöründeki dosyaları arar, en son indirilenleri gösterir veya masaüstünü otomatik düzenler.',
      parameters: {
        type: 'object',
        properties: {
          islem: { type: 'string', enum: ['son_indirilenler', 'dosya_ara', 'masaustunu_duzenle'], description: 'Dosya işlemi' },
          klasor: { type: 'string', enum: ['desktop', 'downloads', 'documents'], description: 'Hedef klasör' },
          sorgu: { type: 'string', description: 'Aranacak dosya adı veya uzantısı' },
          limit: { type: 'number', description: 'Dosya sayısı limiti' },
        },
        required: ['islem'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ayar_ve_konum',
      description: 'Kullanıcının konumunu (ör. "Trabzon", "İzmir", "otomatik") ve sistem ayarlarını günceller. Kullanıcı "biz Trabzondayız", "konumumu güncelle" dediğinde mutlaka çağrılır.',
      parameters: {
        type: 'object',
        properties: {
          islem: { type: 'string', enum: ['konum_guncelle', 'ayar_guncelle', 'ayarlari_goster'], description: 'Ayar işlemi' },
          sehir: { type: 'string', description: 'Kullanıcının bulunduğu şehir adı (ör. Trabzon) veya "otomatik"' },
          kullanici_adi: { type: 'string', description: 'Kullanıcının hitap ismi' },
          anahtar: { type: 'string', description: 'Özel ayar anahtarı' },
          deger: { type: 'string', description: 'Özel ayar değeri' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proje_sicili',
      description: 'Projeleri listeler, projelerin port/amaç/dizin bilgilerini sorgular veya yeni bir projeyi sicil defterine kaydeder. Kullanıcı mevcut projeleri sorduğunda veya yeni proje açılacağında kullanılır.',
      parameters: {
        type: 'object',
        properties: {
          islem: { type: 'string', enum: ['listele', 'bilgi', 'olustur', 'guncelle', 'sil'], description: 'Yapılacak işlem' },
          proje_adi: { type: 'string', description: 'Proje adı (örn: Kripto Takipçisi)' },
          proje_id: { type: 'string', description: 'Proje benzersiz kimliği (kebab-case, örn: kripto-takip)' },
          hedef: { type: 'string', description: 'Projenin ne amaca hizmet ettiği' },
          tur: { type: 'string', enum: ['web', 'desktop', 'cli', 'api'], description: 'Proje türü' },
          port: { type: 'number', description: 'Çalışacağı yerel port (örn: 3000, 5173)' },
          komut: { type: 'string', description: 'Çalıştırma komutu (örn: npm run dev)' },
          cli: { type: 'string', enum: ['claude', 'agy'], description: 'Projeyi geliştirecek ana CLI' },
          teknolojiler: { type: 'array', items: { type: 'string' }, description: 'Kullanılacak teknolojiler (örn: ["React", "Vite", "Tailwind"])' },
        },
        required: ['islem'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kod_gorevi_ver',
      description: 'Belirtilen projeye Claude Code CLI veya Antigravity CLI üzerinden kodlama görevi verir. Claude Code önceliklidir; hata alırsa otomatik Antigravity devreye girer. Proje daha önce başlatıldıysa bağlamı (/resume) korur. Asenkron çalışır ve bittiğinde bildirim gönderir.',
      parameters: {
        type: 'object',
        properties: {
          proje: { type: 'string', description: 'Proje adı veya ID değeri' },
          talimat: { type: 'string', description: 'CLI için hazırlanmış adım adım teknik şartname ve kodlama görevi' },
          cli_tercihi: { type: 'string', enum: ['claude', 'agy'], description: 'Özel CLI tercihi (opsiyonel)' },
        },
        required: ['proje', 'talimat'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'projeyi_denetle',
      description: 'Projenin geliştirme sunucusunu ayağa kaldırır, portunu doğrular, Microsoft Edge ile gerçek ekran görüntüsünü alır ve olası hataları tarar.',
      parameters: {
        type: 'object',
        properties: {
          proje: { type: 'string', description: 'Proje adı veya ID değeri' },
          islem: { type: 'string', enum: ['denetle', 'baslat', 'durdur'], description: 'Denetim veya sunucu işlemi (varsayılan: denetle)' },
        },
        required: ['proje'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hafizadan_hatirla',
      description: 'Kullanıcının geçmiş sohbet oturumlarında, eski konuşmalarında bahsettiği konuları, tercihleri, kararları, notları veya bilgileri arar ve bulur.',
      parameters: {
        type: 'object',
        properties: {
          sorgu: {
            type: 'string',
            description: 'Aranacak anahtar kelime, konu, soru veya terim (ör. "kripto projesi renk teması", "dünkü borsa yorumu", "favori kitap")',
          },
        },
        required: ['sorgu'],
      },
    },
  },
] as const;

export type ToolProgress = (line: string) => void;

export async function runTool(name: string, rawArgs: string, progress: ToolProgress = () => {}): Promise<string> {
  let args: any = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }
  if (name === 'get_news') {
    progress('haber kaynakları taranıyor');
    const res = await getNews(args as GetNewsArgs);
    progress(`${res.sources_scanned} kaynak tarandı · ${res.items.length} haber bulundu`);
    // Modele giden çıktıyı sade tut: fotoğraf URL'si göndermiyoruz.
    return JSON.stringify({
      ...res,
      items: res.items.map(({ image_url, url, ...rest }) => ({ ...rest, has_photo: !!image_url })),
    });
  }
  if (name === 'get_markets') {
    progress('piyasa verileri alınıyor');
    const m = await getMarkets();
    return JSON.stringify(m ?? { error: 'Piyasa verisi şu an alınamıyor. Rakam söyleme.' });
  }
  if (name === 'get_weather') {
    progress('hava durumu alınıyor');
    const w = await getWeather();
    return JSON.stringify(w ?? { error: 'Hava durumu şu an alınamıyor. Rakam söyleme.' });
  }
  if (name === 'wiki_lookup') {
    const baslik = String(args.baslik ?? args.title ?? '');
    progress(`wikipedia: ${baslik}`);
    const w = await wikiLookup(baslik).catch(() => null);
    if (!w) return JSON.stringify({ error: `Wikipedia'da bulunamadı: ${baslik}. Bu konuda rakam söyleme.` });
    // Modele fotoğraf adresi gitmez (model URL yazmaz); fotoğrafı sunucu "wiki" alanındaki başlıktan ekler.
    const { foto, ...rest } = w;
    return JSON.stringify({ ...rest, foto: foto ? { var: true, lisans: foto.lisans, yazar: foto.yazar } : null });
  }
  if (name === 'mac_ozeti_bul') {
    const takim = String(args.takim ?? '');
    progress(`maç özeti aranıyor: ${takim}`);
    const brans = ['futbol', 'basketbol', 'voleybol'].includes(args.brans) ? args.brans : 'futbol';
    const r = await findHighlights(takim, brans).catch(e => ({ videolar: [] as unknown[], taranan: [] as string[], hata: String(e.message) }));
    progress(r.videolar.length ? `${r.videolar.length} video bulundu` : 'özet bulunamadı');
    return JSON.stringify(r.videolar.length ? r : {
      ...r,
      sonuc: `Taranan kanallarda bu takımın ${brans} videosu yok. Uydurma; bulamadığını söyle. "diger_brans" varsa (ör. basketbol) bunu söyleyip açmayı yalnızca TEKLİF ET, kendiliğinden açma.`,
    });
  }
  if (name === 'youtube_ara') {
    const sorgu = String(args.sorgu ?? '');
    progress(`youtube: ${sorgu}`);
    const r = await searchVideos(sorgu).catch(e => ({ hata: String(e.message) }));
    if (r === null) return JSON.stringify({ hata: 'YouTube araması kurulmadı (YOUTUBE_API_KEY yok). Kullanıcıya bunu söyle; bir YouTube linki verirse onu açabileceğini ekle.' });
    if ('hata' in r) return JSON.stringify(r);
    progress(`${r.length} video bulundu`);
    return JSON.stringify(r.length ? { videolar: r } : { sonuc: 'Sonuç yok.' });
  }
  if (name === 'kanal_son_video') {
    const kanal = String(args.kanal ?? '');
    const tur = ['shorts', 'video', 'hepsi'].includes(args.tur) ? args.tur : undefined;
    progress(`kanal: ${kanal}${tur ? ` · ${tur}` : ''}`);
    const r = await latestFromChannel(kanal, tur).catch(e => ({ hata: String(e.message) }));
    if (!('hata' in r)) progress(`${r.videolar.length} video bulundu`);
    return JSON.stringify(r);
  }
  if (name === 'youtube_ac') {
    const id = videoIdFrom(String(args.link ?? ''));
    if (!id) return JSON.stringify({ hata: 'Bu bir YouTube linkine benzemiyor.' });
    progress('video kontrol ediliyor');
    const r = await checkVideo(id).catch(() => ({ hata: 'Video kontrol edilemedi.' }));
    return JSON.stringify(r);
  }
  if (name === 'kameraya_bak') {
    progress(`kameraya bakılıyor${args.kamera ? `: ${args.kamera}` : ''}`);
    const r: any = await lookAtCamera(String(args.kamera ?? ''), String(args.soru ?? ''));
    progress(r.hata ? 'kamera: görüntü yok' : `${r.kamera} karesi yorumlandı`);
    return JSON.stringify(r);
  }
  if (name === 'ev_kontrol') {
    const cihaz = String(args.cihaz ?? '');
    const ids: DeviceId[] = cihaz === 'tum_isiklar' ? ['salon_isik', 'calisma_isik'] : cihaz === 'hepsi' ? [] : [cihaz as DeviceId];
    if (cihaz === 'hepsi' || args.islem === 'durum') {
      const all = homeState().devices;
      return JSON.stringify({ mod: homeMode(), cihazlar: cihaz === 'hepsi' ? all : all.filter(d => ids.includes(d.id)) });
    }
    const out = ids.map(id => {
      const r = control(id, args);
      return 'hata' in r ? { cihaz: id, hata: r.hata } : { cihaz: r.cihaz.ad, sonuc: r.ozet };
    });
    progress(out.map(o => ('hata' in o ? `${o.cihaz}: ${o.hata}` : `${o.cihaz}: ${o.sonuc}`)).join(' · '));
    return JSON.stringify({ mod: homeMode(), sonuclar: out });
  }
  if (name === 'kitaplik_ekle') {
    const r: any = addBook(String(args.kitap ?? ''), args.yazar ? String(args.yazar) : null);
    progress('hata' in r ? `kitaplık: ${r.hata}` : r.yeni ? `kitaplığa eklendi: ${r.kitap.ad}` : `zaten kitaplıkta: ${r.kitap.ad}`);
    if ('hata' in r) return JSON.stringify(r);
    const dolduruluyor = !r.kitap.jarvis;
    if (dolduruluyor) fillInBackground(r.kitap.id);
    return JSON.stringify({ ok: true, kitap: r.kitap.ad, yazar: r.kitap.yazar, yeni: r.yeni, raftaYeri: !!r.kitap.kutu, sayfalarDolduruluyor: dolduruluyor });
  }
  if (name === 'kitaplik_doldur') {
    const f: any = findBook(String(args.kitap ?? ''));
    if ('hata' in f) return JSON.stringify(f);
    fillInBackground(f.kitap.id);
    progress(`${f.kitap.ad}: sayfalar dolduruluyor`);
    return JSON.stringify({ ok: true, kitap: f.kitap.ad, sayfalarDolduruluyor: true });
  }
  if (name === 'kitaplik_not_ekle') {
    const r: any = addBookNote(String(args.kitap ?? ''), String(args.metin ?? ''), args.tur === 'alinti' ? 'alinti' : 'not', args.yazar ? String(args.yazar) : undefined);
    progress(r.hata ? `kitaplık: ${r.hata}` : `${r.kitap}: ${r.tur === 'alinti' ? 'alıntı' : 'not'} eklendi`);
    console.log(`[kitaplık] ${r.hata ? `not eklenemedi: ${r.hata}` : `${r.kitap} · ${r.tur} eklendi`}`);
    return JSON.stringify(r);
  }
  if (name === 'kitaplik_durum') {
    const r: any = setBookStatus(String(args.kitap ?? ''), args);
    progress(r.hata ? `kitaplık: ${r.hata}` : `${r.kitap}: ${r.durum}${r.sayfa ? `, s. ${r.sayfa}` : ''}`);
    return JSON.stringify(r);
  }
  if (name === 'hafiza_ekle') {
    const item = addMemory(String(args.not ?? ''));
    progress(item ? `hafızaya eklendi: ${item.text}` : 'not zaten hafızada');
    console.log(`[hafıza] ${item ? `eklendi [${item.id}] ${item.text}` : 'eklenmedi (boş ya da tekrar)'}`);
    return JSON.stringify(item ? { ok: true, id: item.id } : { ok: false, sebep: 'boş ya da zaten var' });
  }
  if (name === 'hafiza_sil') {
    const item = removeMemory(String(args.id ?? ''));
    progress(item ? `hafızadan silindi: ${item.text}` : 'not bulunamadı');
    console.log(`[hafıza] ${item ? `silindi [${item.id}] ${item.text}` : `silinemedi: ${args.id}`}`);
    return JSON.stringify(item ? { ok: true } : { ok: false, sebep: 'bu kimlikte not yok' });
  }

  // ---- YENİ EKLENEN YETENEKLER ----

  if (name === 'sistem_kontrol') {
    const islem = String(args.islem ?? '');
    progress(`sistem: ${islem}`);
    if (islem === 'ses') {
      const r = await setVolume(Number(args.seviye ?? 50), Boolean(args.mute));
      return JSON.stringify(r);
    }
    if (islem === 'kaynaklar' || islem === 'durum') {
      const stats = await getSystemStats();
      return JSON.stringify(stats);
    }
    if (islem === 'uygulama_ac') {
      const r = await launchApp(String(args.uygulama ?? ''));
      return JSON.stringify(r);
    }
    if (islem === 'uygulama_kapat') {
      const r = await killApp(String(args.uygulama ?? ''));
      return JSON.stringify(r);
    }
    if (['lock', 'sleep', 'shutdown', 'restart', 'kilitle', 'uyku', 'kapat', 'yeniden_baslat'].includes(islem)) {
      const actionMap: Record<string, 'lock' | 'sleep' | 'shutdown' | 'restart'> = {
        kilitle: 'lock', lock: 'lock',
        uyku: 'sleep', sleep: 'sleep',
        kapat: 'shutdown', shutdown: 'shutdown',
        yeniden_baslat: 'restart', restart: 'restart'
      };
      const r = await controlPower(actionMap[islem] || 'lock', Number(args.dakika ?? 0));
      return JSON.stringify(r);
    }
    return JSON.stringify({ hata: `Bilinmeyen sistem işlemi: ${islem}` });
  }

  if (name === 'web_arama') {
    const sorgu = String(args.sorgu ?? '');
    progress(`web araması: ${sorgu}`);
    const r = await searchWeb(sorgu, Number(args.limit ?? 5));
    progress(`web: ${r.results.length} sonuç bulundu`);
    return JSON.stringify(r);
  }

  if (name === 'hatirlatici_ve_gorev') {
    const islem = String(args.islem ?? '');
    progress(`hatırlatıcı/görev: ${islem}`);
    if (islem === 'hatirlatici_ekle') {
      const r = addReminder(String(args.metin ?? ''), Number(args.dakika ?? 5));
      return JSON.stringify(r);
    }
    if (islem === 'hatirlaticilari_listele') {
      return JSON.stringify({ hatirlaticilar: listReminders() });
    }
    if (islem === 'gorev_ekle') {
      const r = addTodo(String(args.metin ?? ''), args.oncelik);
      return JSON.stringify(r);
    }
    if (islem === 'gorevleri_listele') {
      return JSON.stringify({ gorevler: listTodos(Boolean(args.tamamlananlari_goster)) });
    }
    if (islem === 'gorev_tamamla') {
      const r = completeTodo(String(args.metin ?? args.id ?? ''));
      return JSON.stringify(r);
    }
    if (islem === 'gorev_sil') {
      const r = deleteTodo(String(args.metin ?? args.id ?? ''));
      return JSON.stringify(r);
    }
    return JSON.stringify({ hata: `Bilinmeyen işlem: ${islem}` });
  }

  if (name === 'finans_ve_piyasa') {
    progress('canlı piyasa ve altın verileri alınıyor');
    const r = await getFinancialMarkets(args.kategori);
    return JSON.stringify(r);
  }

  if (name === 'bildirim_gonder') {
    const kanal = String(args.kanal ?? 'masaustu');
    const baslik = String(args.baslik ?? 'Jarvis');
    const mesaj = String(args.mesaj ?? '');
    progress(`bildirim (${kanal})`);
    if (kanal === 'telegram') {
      const r = await sendTelegramMessage(mesaj);
      return JSON.stringify(r);
    } else {
      await showNotification(baslik, mesaj);
      return JSON.stringify({ success: true, message: 'Masaüstü bildirimi gösterildi.' });
    }
  }

  if (name === 'dosya_yonetimi') {
    const islem = String(args.islem ?? '');
    progress(`dosya: ${islem}`);
    if (islem === 'son_indirilenler' || islem === 'son_dosyalar') {
      const r = await getRecentFiles(args.klasor || 'downloads', Number(args.limit ?? 10));
      return JSON.stringify(r);
    }
    if (islem === 'dosya_ara') {
      const r = await searchLocalFiles(String(args.sorgu ?? ''), args.klasor || 'desktop');
      return JSON.stringify(r);
    }
    if (islem === 'masaustunu_duzenle') {
      const r = await organizeDesktop();
      return JSON.stringify(r);
    }
    return JSON.stringify({ hata: `Bilinmeyen dosya işlemi: ${islem}` });
  }

  if (name === 'ayar_ve_konum') {
    const islem = String(args.islem ?? 'konum_guncelle');
    progress(`ayar: ${islem}`);
    if (islem === 'konum_guncelle' || args.sehir) {
      const r = await setLocation(args.sehir);
      return JSON.stringify(r);
    }
    if (islem === 'ayar_guncelle') {
      const updated: any = {};
      if (args.kullanici_adi) updated.userName = args.kullanici_adi;
      if (args.telegram_token) updated.telegramBotToken = args.telegram_token;
      if (args.telegram_chat_id) updated.telegramChatId = args.telegram_chat_id;
      if (args.anahtar && args.deger !== undefined) {
        updated.custom = { ...(loadSettings().custom || {}), [args.anahtar]: args.deger };
      }
      const s = saveSettings(updated);
      return JSON.stringify({ success: true, message: 'Ayarlar güncellendi.', settings: s });
    }
    if (islem === 'ayarlari_goster') {
      return JSON.stringify(loadSettings());
    }
    return JSON.stringify({ hata: `Bilinmeyen ayar işlemi: ${islem}` });
  }

  if (name === 'proje_sicili') {
    const islem = String(args.islem ?? 'listele');
    progress(`proje sicili: ${islem}`);
    if (islem === 'listele') {
      const list = listProjects();
      return JSON.stringify({
        toplam: list.length,
        projeler: list.map((p) => ({
          id: p.id,
          name: p.name,
          tur: p.type,
          port: p.port,
          hedef: p.purpose,
          cli: p.activeCli,
          durum: p.status,
          oturum_sayisi: p.sessionCount,
          son_gorev: p.lastTask,
          son_denetim: p.lastAudit?.ok ? 'Başarılı' : p.lastAudit ? 'Hatalı' : 'Yapılmadı',
        })),
      });
    }
    if (islem === 'bilgi') {
      const p = getProject(args.proje_adi || args.proje_id);
      return JSON.stringify(p ?? { hata: 'Proje bulunamadı.' });
    }
    if (islem === 'olustur' || islem === 'kaydet' || islem === 'guncelle') {
      const p = createOrUpdateProject({
        name: String(args.proje_adi || args.proje_id || 'isimsiz-proje'),
        id: args.proje_id,
        purpose: args.hedef,
        type: args.tur,
        port: args.port ? Number(args.port) : undefined,
        devCommand: args.komut,
        activeCli: args.cli,
        techStack: args.teknolojiler,
      });
      return JSON.stringify({ success: true, mesaj: `"${p.name}" projesi sicil defterine kaydedildi. Dizin: ${p.path}`, proje: p });
    }
    if (islem === 'sil') {
      const ok = deleteProject(args.proje_id || args.proje_adi);
      return JSON.stringify({ success: ok, mesaj: ok ? 'Proje sicil defterinden silindi.' : 'Proje bulunamadı.' });
    }
    return JSON.stringify({ hata: `Bilinmeyen proje sicil işlemi: ${islem}` });
  }

  if (name === 'kod_gorevi_ver') {
    const projeHedef = String(args.proje || '');
    const talimat = String(args.talimat || '');
    progress(`kodlama görevi: ${projeHedef}`);
    try {
      const res = await runCodingTask(projeHedef, talimat, args.cli_tercihi, (p) => {
        progress(`${p.cli.toUpperCase()}: ${p.line.slice(0, 60)}`);
      });
      return JSON.stringify({
        success: res.success,
        kullanilan_cli: res.cliUsed,
        baglam_devami: res.resumed,
        sonuc_ozeti: res.output.slice(-1500),
        mesaj: res.success ? `Görev ${res.cliUsed.toUpperCase()} tarafından başarıyla tamamlandı.` : 'Görev çalıştırılırken bir hata oluştu.',
      });
    } catch (e: any) {
      return JSON.stringify({ success: false, hata: e.message });
    }
  }

  if (name === 'projeyi_denetle') {
    const projeHedef = String(args.proje || '');
    const islem = String(args.islem ?? 'denetle');
    progress(`denetim: ${projeHedef} (${islem})`);
    try {
      if (islem === 'baslat') {
        const res = await startProjectServer(projeHedef);
        return JSON.stringify(res);
      }
      if (islem === 'durdur') {
        const res = await stopProjectServer(projeHedef);
        return JSON.stringify(res);
      }
      const res = await auditProject(projeHedef);
      return JSON.stringify({
        success: res.success,
        port: res.port,
        ekran_goruntusu_url: res.screenshotUrl,
        notlar: res.notes,
        mesaj: res.notes,
      });
    } catch (e: any) {
      return JSON.stringify({ success: false, hata: e.message });
    }
  }

  if (name === 'hafizadan_hatirla') {
    const sorgu = String(args.sorgu || '');
    progress(`hafıza taranıyor: ${sorgu}`);
    try {
      const { searchSessionsHistory } = await import('./sessions.js');
      const sonuclar = searchSessionsHistory(sorgu, 6);
      if (sonuclar.length === 0) {
        return JSON.stringify({
          bulundu: false,
          mesaj: `Geçmiş konuşmalarda "${sorgu}" ile ilgili bir kayıt bulunamadı.`,
        });
      }
      return JSON.stringify({
        bulundu: true,
        toplam: sonuclar.length,
        eslesmeler: sonuclar.map(s => ({
          oturum: s.sessionTitle,
          tarih: s.date,
          kim: s.role === 'user' ? 'Kullanıcı' : 'Jarvis',
          icerik_kesiti: s.snippet,
        })),
        mesaj: `Geçmiş oturumlarda ${sonuclar.length} adet ilgili bilgi bulundu.`,
      });
    } catch (e: any) {
      return JSON.stringify({ bulundu: false, hata: e.message });
    }
  }

  return JSON.stringify({ error: `Bilinmeyen araç: ${name}` });
}
