import { getNews, type GetNewsArgs } from './news.js';
import { getMarkets, getWeather } from './dashboard.js';
import { wikiLookup } from './wiki.js';

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
  return JSON.stringify({ error: `Bilinmeyen araç: ${name}` });
}
