// satellite.js'in yalnızca saf JS (SGP4) kısımları. Paketin ana girişi WASM/iş parçacığı derlemesini de içeri alır ve
// Vite üretim derlemesini kırar (üst düzey await); bu yüzden alt modüller göreli yoldan alınır (paket "exports" alt yol açmaz).
export { twoline2satrec } from '../../../node_modules/satellite.js/dist/io.js';
export { propagate, gstime } from '../../../node_modules/satellite.js/dist/propagation.js';
export { eciToGeodetic, degreesLat, degreesLong } from '../../../node_modules/satellite.js/dist/transforms.js';
export type { SatRec } from '../../../node_modules/satellite.js/dist/propagation/SatRec.js';
