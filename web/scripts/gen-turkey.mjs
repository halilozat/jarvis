import fs from 'fs';
import { feature } from 'topojson-client';
const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
const fc = feature(topo, topo.objects.countries);
const tr = fc.features.find(f => f.id === '792');
// bounds
const W=1000, LON0=25.6, LON1=45, LAT0=35.7, LAT1=42.2;
const k = Math.cos(39*Math.PI/180);
const sx = W/((LON1-LON0)*k); const H = Math.round((LAT1-LAT0)*sx);
const P=([lon,lat])=>[((lon-LON0)*k*sx).toFixed(1), ((LAT1-lat)*sx).toFixed(1)];
let d='';
const polys = tr.geometry.type==='Polygon'?[tr.geometry.coordinates]:tr.geometry.coordinates;
for (const poly of polys) for (const ring of poly){ if(ring.length<8) continue; d+= 'M'+ring.map(c=>P(c).join(',')).join('L')+'Z'; }
const out = `// Otomatik üretildi (world-atlas 50m, Natural Earth – public domain)
export const TR_W = ${W};
export const TR_H = ${H};
export const TR_PATH = "${d}";
export function project(lon: number, lat: number): [number, number] {
  const k = Math.cos((39 * Math.PI) / 180);
  const sx = ${sx};
  return [(lon - ${LON0}) * k * sx, (${LAT1} - lat) * sx];
}
`;
fs.mkdirSync('src/data',{recursive:true});
fs.writeFileSync('src/data/turkey.ts', out);
console.log(W,H,d.length);
