// Gece Gökyüzü Modu · katalog derleyici. Çıktı: web/public/gok/yildizlar.json ve takimyildizlar.json (repoda hazır durur;
// yalnızca kaynak güncellenirse yeniden çalıştırılır).
//
//   node scripts/gok-katalog.mjs <klasör>
//
// <klasör> içinde beklenen kaynaklar (internetten bir kez indirilir):
//   hyg.csv     HYG Database v4.1 (CC BY-SA 4.0) · https://github.com/astronexus/HYG-Database (hyg/CURRENT/hygdata_v41.csv)
//   hip2.csv    Hipparcos yeni indirgeme (van Leeuwen 2007) paralaks + hata · ESA Gaia arşivi TAP:
//               SELECT hip, plx, e_plx, hp_mag FROM public.hipparcos_newreduction WHERE hp_mag < 5.6
//   constellations.lines.json, constellations.json   d3-celestial (BSD-3) · https://github.com/ofrohn/d3-celestial (data/)
//
// Uzaklık HYG'den değil, doğrudan Hipparcos paralaksından hesaplanır (uygulama hatayı da gösterir).
import fs from 'node:fs';
import path from 'node:path';

const KADIR_SINIRI = 4.5;
const dir = process.argv[2];
if (!dir) { console.error('kullanım: node scripts/gok-katalog.mjs <kaynak klasörü>'); process.exit(1); }
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'web', 'public', 'gok');
fs.mkdirSync(out, { recursive: true });

/** Tırnaklı alanları destekleyen küçük CSV ayrıştırıcı */
function csv(metin) {
  const satirlar = [];
  for (const l of metin.split(/\r?\n/)) {
    if (!l) continue;
    const r = []; let s = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { s += '"'; i++; } else if (c === '"') q = false; else s += c; }
      else if (c === '"') q = true; else if (c === ',') { r.push(s); s = ''; } else s += c;
    }
    r.push(s); satirlar.push(r);
  }
  const [bas, ...govde] = satirlar;
  return govde.map(r => Object.fromEntries(bas.map((k, i) => [k, r[i] ?? ''])));
}

// 88 takımyıldızın Türkçe adları (yaygın kullanım; Büyükayı, Kraliçe, Lir gibi)
const TR = {
  And: 'Andromeda', Ant: 'Hava Tulumbası', Aps: 'Cennetkuşu', Aqr: 'Kova', Aql: 'Kartal', Ara: 'Sunak', Ari: 'Koç', Aur: 'Arabacı',
  Boo: 'Çoban', Cae: 'Oyma Kalemi', Cam: 'Zürafa', Cnc: 'Yengeç', CVn: 'Av Köpekleri', CMa: 'Büyükköpek', CMi: 'Küçükköpek',
  Cap: 'Oğlak', Car: 'Karina', Cas: 'Kraliçe', Cen: 'Erboğa', Cep: 'Kral', Cet: 'Balina', Cha: 'Bukalemun', Cir: 'Pergel',
  Col: 'Güvercin', Com: 'Berenis\'in Saçı', CrA: 'Güney Tacı', CrB: 'Kuzey Tacı', Crv: 'Karga', Crt: 'Kupa', Cru: 'Güney Haçı',
  Cyg: 'Kuğu', Del: 'Yunus', Dor: 'Kılıçbalığı', Dra: 'Ejderha', Equ: 'Tay', Eri: 'Irmak', For: 'Ocak', Gem: 'İkizler',
  Gru: 'Turna', Her: 'Herkül', Hor: 'Saat', Hya: 'Suyılanı', Hyi: 'Küçük Suyılanı', Ind: 'Hintli', Lac: 'Kertenkele', Leo: 'Aslan',
  LMi: 'Küçükaslan', Lep: 'Tavşan', Lib: 'Terazi', Lup: 'Kurt', Lyn: 'Vaşak', Lyr: 'Lir', Men: 'Masa', Mic: 'Mikroskop',
  Mon: 'Tekboynuz', Mus: 'Sinek', Nor: 'Gönye', Oct: 'Oktant', Oph: 'Yılancı', Ori: 'Avcı', Pav: 'Tavus', Peg: 'Kanatlı At',
  Per: 'Kahraman', Phe: 'Anka', Pic: 'Ressam', Psc: 'Balıklar', PsA: 'Güney Balığı', Pup: 'Pupa', Pyx: 'Pusula', Ret: 'Ağ',
  Sge: 'Ok', Sgr: 'Yay', Sco: 'Akrep', Scl: 'Heykeltıraş', Sct: 'Kalkan', Ser: 'Yılan', Sex: 'Sekstant', Tau: 'Boğa',
  Tel: 'Teleskop', Tri: 'Üçgen', TrA: 'Güney Üçgeni', Tuc: 'Tukan', UMa: 'Büyükayı', UMi: 'Küçükayı', Vel: 'Yelken', Vir: 'Başak',
  Vol: 'Uçan Balık', Vul: 'Tilki',
};

// Türkçede yaygın kullanılan yıldız adları (diğerleri IAU adıyla)
const YILDIZ_TR = { Polaris: 'Kutup Yıldızı', Arcturus: 'Arktürüs', Sirius: 'Sirius', Alcyone: 'Alkione' };

const YUNAN = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ',
  Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};
const bayerYaz = b => { const m = /^([A-Z][a-z]{1,2})(?:-?(\d))?$/.exec(b); if (!m || !YUNAN[m[1]]) return ''; return YUNAN[m[1]] + (m[2] ? '¹²³⁴⁵⁶⁷⁸⁹'[+m[2] - 1] : ''); };

const hyg = csv(fs.readFileSync(path.join(dir, 'hyg.csv'), 'utf8'));
const hip2 = new Map(csv(fs.readFileSync(path.join(dir, 'hip2.csv'), 'utf8')).map(r => [r.hip, { plx: +r.plx, e: +r.e_plx }]));

const yildizlar = [];
let paralakssiz = 0;
for (const r of hyg) {
  const mag = +r.mag;
  if (!r.hip || !(mag < KADIR_SINIRI)) continue;
  const p = hip2.get(r.hip);
  if (!p) paralakssiz++;
  const by = bayerYaz(r.bayer);
  yildizlar.push([
    +r.hip,
    +(+r.ra * 15).toFixed(5), // saat → derece
    +(+r.dec).toFixed(5),
    +mag.toFixed(2),
    p ? p.plx : null, // mas
    p ? p.e : null,
    r.ci === '' ? null : +(+r.ci).toFixed(2), // B-V renk ölçüsü
    r.con,
    YILDIZ_TR[r.proper] ?? (r.proper || ''),
    by ? `${by} ${r.con}` : r.flam ? `${r.flam} ${r.con}` : '',
  ]);
}
yildizlar.sort((a, b) => a[3] - b[3]);
fs.writeFileSync(path.join(out, 'yildizlar.json'), JSON.stringify({
  kaynak: 'HYG Database v4.1 (CC BY-SA 4.0, astronexus) · paralaks: Hipparcos yeni indirgeme (van Leeuwen 2007, ESA)',
  kadirSiniri: KADIR_SINIRI,
  alanlar: ['hip', 'ra', 'dec', 'kadir', 'paralaks', 'paralaksHata', 'renk', 'takimyildiz', 'ad', 'tanim'],
  yildizlar,
}).replace(/\],\[/g, '],\n['));

const cizgiler = JSON.parse(fs.readFileSync(path.join(dir, 'constellations.lines.json'), 'utf8'));
const adlar = JSON.parse(fs.readFileSync(path.join(dir, 'constellations.json'), 'utf8'));
const ra = l => +(l < 0 ? l + 360 : l).toFixed(4);
const takim = {};
for (const f of adlar.features) {
  const id = f.id;
  takim[id] = { ad: TR[id] ?? f.properties.tr ?? f.properties.name, la: f.properties.name, merkez: [ra(f.properties.display[0]), f.properties.display[1]], cizgiler: [] };
}
for (const f of cizgiler.features) {
  if (!takim[f.id]) continue;
  takim[f.id].cizgiler = f.geometry.coordinates.map(cz => cz.map(([l, b]) => [ra(l), +b.toFixed(4)]));
}
fs.writeFileSync(path.join(out, 'takimyildizlar.json'), JSON.stringify({
  kaynak: 'd3-celestial (BSD-3, Olaf Frohn) · Türkçe adlar: Jarvis',
  takimyildizlar: takim,
}));
console.log(`${yildizlar.length} yıldız (kadir < ${KADIR_SINIRI}, paralakssız ${paralakssiz}), ${Object.keys(takim).length} takımyıldız → ${out}`);
