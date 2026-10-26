// Haber Modu · "dünyada bugün ne oldu?" için yer bulma. Türkçe başlıkta geçen ülke, şehir ya da kurum adından küredeki
// konum (başkent ya da olayın bilinen yeri). Başlıkta ilk geçen yer seçilir; bulunamayan olay küreye konmaz (uydurma yok).
import { fold } from './newsCluster.js';

type Yer = [string, number, number, string[]];
/** [ekranda görünen ad, enlem, boylam, başlıkta aranan adlar (sadeleştirilmiş, kelime başı)] */
const YERLER: Yer[] = [
  ['Gazze', 31.5, 34.47, ['gazze', 'hamas', 'refah', 'han yunus']],
  ['Batı Şeria', 31.95, 35.2, ['bati seria', 'ramallah', 'cenin', 'nablus']],
  ['İsrail', 32.08, 34.78, ['israil', 'tel aviv', 'netanyahu', 'kudus']],
  ['Lübnan', 33.89, 35.5, ['lubnan', 'beyrut', 'hizbullah']],
  ['Suriye', 33.51, 36.29, ['suriye', 'sam ', 'halep', 'idlib', 'sara ']],
  ['Irak', 33.31, 44.36, ['irak', 'bagdat', 'erbil', 'musul']],
  ['İran', 35.69, 51.39, ['iran', 'tahran', 'hamaney', 'pezeskiyan']],
  ['Suudi Arabistan', 24.71, 46.68, ['suudi', 'riyad', 'mekke', 'cidde']],
  ['Yemen', 15.37, 44.19, ['yemen', 'husi', 'sana ', 'aden']],
  ['Katar', 25.29, 51.53, ['katar', 'doha']],
  ['BAE', 24.45, 54.38, ['bae ', 'birlesik arap', 'dubai', 'abu dabi']],
  ['Mısır', 30.04, 31.24, ['misir', 'kahire', 'sisi']],
  ['Libya', 32.89, 13.19, ['libya', 'trablus', 'bingazi', 'hafter']],
  ['Sudan', 15.5, 32.56, ['sudan', 'hartum']],
  ['Pakistan', 33.68, 73.05, ['pakistan', 'islamabad', 'karaci', 'lahor']],
  ['Afganistan', 34.53, 69.17, ['afganistan', 'kabil', 'taliban']],
  ['Hindistan', 28.61, 77.21, ['hindistan', 'yeni delhi', 'modi', 'mumbai']],
  ['Çin', 39.9, 116.4, ['cin ', 'cinli', 'pekin', 'sangay', 'si cinping']],
  ['Tibet', 29.65, 91.1, ['tibet']],
  ['Tayvan', 25.03, 121.56, ['tayvan', 'taipei']],
  ['Japonya', 35.68, 139.69, ['japonya', 'tokyo']],
  ['Güney Kore', 37.57, 126.98, ['guney kore', 'seul']],
  ['Kuzey Kore', 39.04, 125.76, ['kuzey kore', 'pyongyang', 'kim jong']],
  ['Rusya', 55.75, 37.62, ['rusya', 'moskova', 'kremlin', 'putin', 'rus ']],
  ['Ukrayna', 50.45, 30.52, ['ukrayna', 'kiev', 'kyiv', 'zelenski', 'harkiv', 'odessa']],
  ['Azerbaycan', 40.41, 49.87, ['azerbaycan', 'baku', 'aliyev']],
  ['Ermenistan', 40.18, 44.51, ['ermenistan', 'erivan', 'pasinyan']],
  ['Gürcistan', 41.72, 44.79, ['gurcistan', 'tiflis']],
  ['Yunanistan', 37.98, 23.73, ['yunanistan', 'atina', 'yunan']],
  ['Kıbrıs', 35.17, 33.36, ['kibris', 'lefkosa', 'kktc', 'gkry']],
  ['Bulgaristan', 42.7, 23.32, ['bulgaristan', 'sofya']],
  ['Sırbistan', 44.79, 20.45, ['sirbistan', 'belgrad', 'vucic']],
  ['Macaristan', 47.5, 19.04, ['macaristan', 'budapeste', 'orban']],
  ['Polonya', 52.23, 21.01, ['polonya', 'varsova']],
  ['Almanya', 52.52, 13.4, ['almanya', 'berlin', 'merz', 'alman']],
  ['Fransa', 48.86, 2.35, ['fransa', 'paris', 'macron', 'fransiz']],
  ['İngiltere', 51.51, -0.13, ['ingiltere', 'birlesik krallik', 'londra', 'starmer', 'ingiliz']],
  ['İtalya', 41.9, 12.5, ['italya', 'roma ', 'meloni']],
  ['Vatikan', 41.9, 12.45, ['vatikan', 'papa ']],
  ['İspanya', 40.42, -3.7, ['ispanya', 'madrid', 'barselona']],
  ['Brüksel', 50.85, 4.35, ['avrupa birligi', 'ab ', 'bruksel', 'nato', 'avrupa komisyonu']],
  ['Washington', 38.9, -77.04, ['abd', 'amerika', 'washington', 'beyaz saray', 'trump', 'pentagon', 'kongre']],
  ['New York', 40.75, -73.97, ['new york', 'birlesmis milletler', 'bm ', 'bm guvenlik']],
  ['Kanada', 45.42, -75.7, ['kanada', 'ottawa', 'toronto']],
  ['Meksika', 19.43, -99.13, ['meksika']],
  ['Venezuela', 10.48, -66.9, ['venezuela', 'karakas', 'maduro']],
  ['Kolombiya', 4.71, -74.07, ['kolombiya', 'bogota']],
  ['Brezilya', -15.79, -47.88, ['brezilya', 'lula', 'sao paulo', 'rio de janeiro']],
  ['Arjantin', -34.6, -58.38, ['arjantin', 'buenos aires', 'milei']],
  ['Güney Afrika', -25.75, 28.19, ['guney afrika', 'johannesburg']],
  ['Nijerya', 9.08, 7.4, ['nijerya', 'abuja', 'lagos']],
  ['Avustralya', -35.28, 149.13, ['avustralya', 'sidney', 'kanberra']],
];

/** Başlıkta ilk geçen yer (sadeleştirilmiş metinde kelime başı). Yoksa null. */
export function yerBul(metin: string): { yer: string; konum: [number, number] } | null {
  const t = ` ${fold(metin).replace(/\s+/g, ' ').trim()} `;
  let en: { i: number; y: Yer } | null = null;
  for (const y of YERLER) {
    for (const ad of y[3]) {
      const i = t.indexOf(` ${ad}`);
      if (i >= 0 && (!en || i < en.i)) en = { i, y };
    }
  }
  return en ? { yer: en.y[0], konum: [en.y[1], en.y[2]] } : null;
}
