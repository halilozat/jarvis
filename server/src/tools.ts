import { getNews, type GetNewsArgs } from './news.js';
import { getMarkets, getWeather } from './dashboard.js';
import { wikiLookup } from './wiki.js';
import { addMemory, removeMemory } from './profile.js';
import { checkVideo, findHighlights, latestFromChannel, searchVideos, videoIdFrom } from './youtube.js';
import { lookAtCamera } from './camera.js';
import { control, homeMode, homeState, type DeviceId } from './home.js';
import { addBook, addBookNote, fillInBackground, findBook, setBookStatus } from './library.js';
import { yasamIziTara } from './lab.js';

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
      name: 'yasam_izi_tara',
      description: "Uzay Laboratuvarı açıkken bir gök cisminde (ya da yakınlaşılan bölgedeki bütün cisimlerde) yaşam izi taraması yapar: ekranda animasyonu başlatır ve simülasyondaki koşullardan hesaplanmış sonucu döndürür (kontrol listesi, Dünya Benzerlik Endeksi, bugüne kadar bulunanlar, en umut verici bölge, sıradaki görev). 'Europa'da hayat olabilir mi, tara', 'bu bölgede yaşam izi ara' gibi isteklerde kullanılır. Yaşam olasılığı vermez.",
      parameters: {
        type: 'object',
        properties: {
          hedef: { type: 'string', description: "Cisim adı (Dünya, Mars, Venüs, Europa, Ganymede, Enceladus, Titan, Ay…) ya da yakınlaşılan bölge için 'odak'" },
          hizli: { type: 'boolean', description: 'Kısa tarama (≈7 sn)' },
        },
        required: ['hedef'],
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
] as const;

export type ToolProgress = (line: string) => void;

export async function runTool(name: string, rawArgs: string, progress: ToolProgress): Promise<string> {
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
  if (name === 'yasam_izi_tara') {
    const out = yasamIziTara(args);
    progress(out.includes('"hata"') ? 'yaşam izi taraması: laboratuvar kapalı ya da cisim yok' : `yaşam izi taraması: ${args.hedef}`);
    return out;
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
  return JSON.stringify({ error: `Bilinmeyen araç: ${name}` });
}
