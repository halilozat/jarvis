// Ultron'un Gözü · ülke sınırları verisi: world-atlas countries-110m (Natural Earth, kamu malı) → web/src/data/borders.ts
// Yalnızca ülkeler arası ortak sınırlar (kıyılar zaten data/world.ts'de). 0,25° yuvarlanır. Çalıştır: node scripts/ultron-sinirlar.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const topo = require('world-atlas/countries-110m.json');
const { mesh } = await import(require.resolve('topojson-client'));
const m = mesh(topo, topo.objects.countries, (a, b) => a !== b);
const yuv = x => Math.round(x * 4) / 4;
const satir = m.coordinates.map(cizgi => {
  const p = [];
  for (const [lo, la] of cizgi) { const a = yuv(lo), b = yuv(la); if (p.length >= 2 && p[p.length - 2] === a && p[p.length - 1] === b) continue; p.push(a, b); }
  return p.length >= 4 ? p.join(',') : null;
}).filter(Boolean);
fs.writeFileSync(new URL('../web/src/data/borders.ts', import.meta.url), `// Otomatik üretildi (scripts/ultron-sinirlar.mjs): world-atlas countries-110m ortak sınırları (Natural Earth, kamu malı). "boylam,enlem,..." (0,25°)\nexport const BORDERS: string[] = ${JSON.stringify(satir)};\n`);
console.log(`${satir.length} sınır çizgisi yazıldı`);
