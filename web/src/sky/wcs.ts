// Gece Gökyüzü · WCS (FITS dünya koordinatları): astrometry.net çözümündeki TAN (gnomonik) projeksiyon + SIP bozulması.
// Saf fonksiyonlar (tarayıcı gerektirmez, test edilir). Piksel çıktısı GÖRÜNTÜ koordinatıdır: sol üst (0,0), y aşağı;
// FITS pikseli 1 tabanlı olduğu için 1 çıkarılır. Doğruluk testi: sky.test.ts (gerçek bir astrometry.net işinin
// annotations çıktısıyla karşılaştırılır).

export interface Sip { a: number[][]; b: number[][]; ap?: number[][]; bp?: number[][] }

export interface Wcs {
  /** Referans noktasının RA/Dec'i (derece) */
  crval: [number, number];
  /** Referans pikseli (FITS, 1 tabanlı) */
  crpix: [number, number];
  /** Piksel → ara dünya koordinatı matrisi (derece/piksel) */
  cd: [[number, number], [number, number]];
  /** Çözülen görüntünün boyutu (piksel) */
  w: number;
  h: number;
  sip?: Sip;
}

const RAD = Math.PI / 180;

/** FITS başlığı (80 karakterlik kartlar, satır sonu olsun olmasın) → anahtar/değer */
export function fitsKartlari(metin: string): Record<string, string | number> {
  const satirlar = metin.includes('\n') ? metin.split(/\r?\n/) : metin.match(/.{1,80}/g) ?? [];
  const out: Record<string, string | number> = {};
  for (const s of satirlar) {
    const m = /^([A-Z0-9_-]{1,8})\s*=\s*('(?:[^']|'')*'|[^/]+)/.exec(s);
    if (!m) continue;
    const ham = m[2].trim();
    if (ham.startsWith("'")) out[m[1]] = ham.slice(1, -1).replace(/''/g, "'").trim();
    else {
      const n = Number(ham.replace(/D/i, 'E'));
      out[m[1]] = Number.isFinite(n) ? n : ham;
    }
  }
  return out;
}

function sipMatris(k: Record<string, string | number>, ad: string): number[][] | undefined {
  const sira = Number(k[`${ad}_ORDER`]);
  if (!Number.isFinite(sira) || sira < 1) return undefined;
  const m: number[][] = Array.from({ length: sira + 1 }, () => Array(sira + 1).fill(0));
  for (let p = 0; p <= sira; p++) for (let q = 0; q <= sira - p; q++) m[p][q] = Number(k[`${ad}_${p}_${q}`] ?? 0) || 0;
  return m;
}

/** astrometry.net wcs_file (FITS başlığı) → Wcs */
export function wcsOku(metin: string): Wcs {
  const k = fitsKartlari(metin);
  const n = (a: string, v = 0) => (typeof k[a] === 'number' ? (k[a] as number) : v);
  if (!String(k.CTYPE1 ?? '').includes('TAN')) throw new Error(`desteklenmeyen projeksiyon: ${k.CTYPE1}`);
  let cd: Wcs['cd'];
  if ('CD1_1' in k) cd = [[n('CD1_1'), n('CD1_2')], [n('CD2_1'), n('CD2_2')]];
  else {
    // CDELT + PC (ya da CROTA2) biçimi
    const c1 = n('CDELT1', 1), c2 = n('CDELT2', 1);
    if ('PC1_1' in k) cd = [[c1 * n('PC1_1', 1), c1 * n('PC1_2')], [c2 * n('PC2_1'), c2 * n('PC2_2', 1)]];
    else {
      const r = n('CROTA2') * RAD;
      cd = [[c1 * Math.cos(r), -c2 * Math.sin(r)], [c1 * Math.sin(r), c2 * Math.cos(r)]];
    }
  }
  const a = sipMatris(k, 'A'), b = sipMatris(k, 'B');
  return {
    crval: [n('CRVAL1'), n('CRVAL2')],
    crpix: [n('CRPIX1'), n('CRPIX2')],
    cd,
    w: n('IMAGEW', n('NAXIS1')),
    h: n('IMAGEH', n('NAXIS2')),
    sip: a && b ? { a, b, ap: sipMatris(k, 'AP'), bp: sipMatris(k, 'BP') } : undefined,
  };
}

/**
 * WCS dosyası yoksa astrometry.net calibration özetinden yaklaşık TAN (bozulmasız).
 * orientation: görüntünün yukarısının kuzeyden doğuya açısı (derece); parity: 1 normal, -1 ayna.
 */
export function wcsKalibrasyondan(c: { ra: number; dec: number; orientation: number; pixscale: number; parity: number }, w: number, h: number): Wcs {
  const s = c.pixscale / 3600;
  const t = c.orientation * RAD;
  // nova'nın orientation'ı y aşağı görüntüde: CD = s·[[−cos θ, sin θ], [−sin θ, −cos θ]] (iki gerçek işin WCS'iyle doğrulandı).
  // parity −1 (ayna görüntü, ör. ön kamera) x ekseni ters çevrilmiş kabul edilir.
  const p = c.parity >= 0 ? 1 : -1;
  const cd: Wcs['cd'] = [[-p * s * Math.cos(t), s * Math.sin(t)], [p * -s * Math.sin(t), -s * Math.cos(t)]];
  return { crval: [c.ra, c.dec], crpix: [w / 2 + 0.5, h / 2 + 0.5], cd, w, h };
}

const poli = (m: number[][], u: number, v: number) => {
  let s = 0;
  for (let p = 0; p < m.length; p++) for (let q = 0; q < m[p].length; q++) if (m[p][q]) s += m[p][q] * u ** p * v ** q;
  return s;
};

/** RA/Dec (derece) → standart (gnomonik) koordinat ξ, η (derece). Teğet düzlemin arkasındaysa null. */
export function gnomonik(wcs: Wcs, ra: number, dec: number): [number, number] | null {
  const [a0, d0] = [wcs.crval[0] * RAD, wcs.crval[1] * RAD];
  const [a, d] = [ra * RAD, dec * RAD];
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  if (cosc <= 0.05) return null; // ~87°'den uzak: projeksiyon anlamsız
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
  return [xi / RAD, eta / RAD];
}

/** RA/Dec (derece) → görüntü pikseli (0 tabanlı, y aşağı). Projeksiyonun arkasındaysa null. */
export function gokPiksel(wcs: Wcs, ra: number, dec: number): { x: number; y: number } | null {
  const g = gnomonik(wcs, ra, dec);
  if (!g) return null;
  const [[c11, c12], [c21, c22]] = wcs.cd;
  const det = c11 * c22 - c12 * c21;
  const U = (c22 * g[0] - c12 * g[1]) / det;
  const V = (-c21 * g[0] + c11 * g[1]) / det;
  let u = U, v = V;
  const sip = wcs.sip;
  if (sip?.ap && sip.bp) { u = U + poli(sip.ap, U, V); v = V + poli(sip.bp, U, V); }
  else if (sip) {
    // Ters katsayı yoksa ileri SIP'i yineleyerek çöz
    for (let i = 0; i < 8; i++) { u = U - poli(sip.a, u, v); v = V - poli(sip.b, u, v); }
  }
  return { x: u + wcs.crpix[0] - 1, y: v + wcs.crpix[1] - 1 };
}

/** Görüntü pikseli (0 tabanlı) → RA/Dec (derece) */
export function pikselGok(wcs: Wcs, x: number, y: number): { ra: number; dec: number } {
  let u = x + 1 - wcs.crpix[0], v = y + 1 - wcs.crpix[1];
  if (wcs.sip) { const du = poli(wcs.sip.a, u, v), dv = poli(wcs.sip.b, u, v); u += du; v += dv; }
  const xi = (wcs.cd[0][0] * u + wcs.cd[0][1] * v) * RAD;
  const eta = (wcs.cd[1][0] * u + wcs.cd[1][1] * v) * RAD;
  const [a0, d0] = [wcs.crval[0] * RAD, wcs.crval[1] * RAD];
  const rho = Math.hypot(xi, eta);
  const c = Math.atan(rho);
  const dec = rho === 0 ? d0 : Math.asin(Math.cos(c) * Math.sin(d0) + (eta * Math.sin(c) * Math.cos(d0)) / rho);
  const ra = a0 + Math.atan2(xi * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - eta * Math.sin(d0) * Math.sin(c));
  return { ra: ((ra / RAD) % 360 + 360) % 360, dec: dec / RAD };
}

/** Görüntünün başka bir boyuta ölçeklenmiş hâli (ör. çözüm 2000 px'te, ekranda 1000 px) */
export function wcsOlcekle(wcs: Wcs, w: number, h: number): Wcs {
  const kx = w / wcs.w, ky = h / wcs.h;
  if (Math.abs(kx - 1) < 1e-9 && Math.abs(ky - 1) < 1e-9) return wcs;
  const k = (kx + ky) / 2;
  // u_yeni = k·u: CD k'ya bölünür, CRPIX ölçeklenir; SIP katsayısı A_pq → A_pq·k^(1-p-q) (ters katsayılar da aynı)
  const sipOl = (m?: number[][]) => m?.map((r, p) => r.map((c, q) => c * k ** (1 - p - q)));
  return {
    crval: wcs.crval,
    crpix: [(wcs.crpix[0] - 0.5) * kx + 0.5, (wcs.crpix[1] - 0.5) * ky + 0.5],
    cd: [[wcs.cd[0][0] / k, wcs.cd[0][1] / k], [wcs.cd[1][0] / k, wcs.cd[1][1] / k]],
    w, h,
    sip: wcs.sip ? { a: sipOl(wcs.sip.a)!, b: sipOl(wcs.sip.b)!, ap: sipOl(wcs.sip.ap), bp: sipOl(wcs.sip.bp) } : undefined,
  };
}

/** İki gök noktası arasındaki açı (derece) */
export function aciUzaklik(ra1: number, d1: number, ra2: number, d2: number): number {
  const c = Math.sin(d1 * RAD) * Math.sin(d2 * RAD) + Math.cos(d1 * RAD) * Math.cos(d2 * RAD) * Math.cos((ra1 - ra2) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, c))) / RAD;
}
