// İl merkezlerinin yaklaşık koordinatları [boylam, enlem]
export const CITIES: Record<string, [number, number]> = {
  adana: [35.32, 37.0], adıyaman: [38.28, 37.76], afyonkarahisar: [30.54, 38.76], ağrı: [43.05, 39.72], aksaray: [34.03, 38.37],
  amasya: [35.83, 40.65], ankara: [32.85, 39.93], antalya: [30.71, 36.89], ardahan: [42.7, 41.11], artvin: [41.82, 41.18],
  aydın: [27.84, 37.85], balıkesir: [27.88, 39.65], bartın: [32.34, 41.63], batman: [41.13, 37.88], bayburt: [40.23, 40.26],
  bilecik: [29.98, 40.14], bingöl: [40.5, 38.88], bitlis: [42.11, 38.4], bolu: [31.61, 40.73], burdur: [30.29, 37.72],
  bursa: [29.06, 40.18], çanakkale: [26.41, 40.15], çankırı: [33.62, 40.6], çorum: [34.95, 40.55], denizli: [29.09, 37.78],
  diyarbakır: [40.23, 37.91], düzce: [31.16, 40.84], edirne: [26.56, 41.68], elazığ: [39.22, 38.67], erzincan: [39.49, 39.75],
  erzurum: [41.27, 39.9], eskişehir: [30.52, 39.78], gaziantep: [37.38, 37.07], giresun: [38.39, 40.91], gümüşhane: [39.48, 40.46],
  hakkari: [43.74, 37.57], hatay: [36.16, 36.2], ığdır: [44.04, 39.92], ısparta: [30.55, 37.76], isparta: [30.55, 37.76], istanbul: [28.98, 41.01],
  izmir: [27.14, 38.42], kahramanmaraş: [36.94, 37.58], karabük: [32.62, 41.2], karaman: [33.22, 37.18], kars: [43.1, 40.6],
  kastamonu: [33.78, 41.38], kayseri: [35.49, 38.73], kırıkkale: [33.51, 39.85], kırklareli: [27.22, 41.73], kırşehir: [34.16, 39.15],
  kilis: [37.12, 36.72], kocaeli: [29.92, 40.77], izmit: [29.92, 40.77], konya: [32.49, 37.87], kütahya: [29.98, 39.42], malatya: [38.31, 38.35],
  manisa: [27.43, 38.61], mardin: [40.74, 37.31], mersin: [34.63, 36.81], muğla: [28.36, 37.22], bodrum: [27.43, 37.04], muş: [41.49, 38.75],
  nevşehir: [34.71, 38.62], niğde: [34.68, 37.97], ordu: [37.88, 40.98], osmaniye: [36.25, 37.07], rize: [40.52, 41.02],
  sakarya: [30.4, 40.69], samsun: [36.33, 41.29], siirt: [41.94, 37.93], sinop: [35.15, 42.03], sivas: [37.02, 39.75],
  şanlıurfa: [38.79, 37.16], urfa: [38.79, 37.16], şırnak: [42.46, 37.52], tekirdağ: [27.51, 40.98], tokat: [36.55, 40.31], trabzon: [39.72, 41.0],
  tunceli: [39.55, 39.11], uşak: [29.41, 38.68], van: [43.38, 38.5], yalova: [29.27, 40.65], yozgat: [34.81, 39.82], zonguldak: [31.79, 41.45],
};

export function cityCoord(name: string): [number, number] | null {
  const k = name.toLocaleLowerCase('tr').trim().replace(/['’].*$/, '');
  return CITIES[k] ?? null;
}
