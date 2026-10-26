// Haber Modu · holografik dünya küresi (arama animasyonu ve "dünyada bugün"). Noktalı enlem-boylam ağı, Türkiye
// nabzı, Türkiye'den yayınlara ışık yayları, yayın noktaları ve olay işaretleri. Dik izdüşüm: y ekseni etrafında
// dönüş (donus, derece), x ekseninde eğim (egim, radyan); yalnızca ön yüz çizilir.
export const TR: [number, number] = [39.0, 35.0];
export const RAD = Math.PI / 180;

export interface Yay { a: [number, number]; b: [number, number]; at: number; guc: number; dil: 'tr' | 'en' }
export interface Nokta { ad: string; konum: [number, number]; dil: 'tr' | 'en'; adet: number; at: number }
/** Olay işareti ("dünyada bugün"): yerinde iğne, odaktaki büyür ve etiket taşır */
export interface Isaret { konum: [number, number]; etiket: string; odak: number }

/** Küre üstünde (enlem, boylam) → birim vektör */
export const vek = ([lat, lon]: [number, number]) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];

/** Bir konumu ön yüzün ortasına getiren dönüş (derece) ve eğim (radyan) */
export const odakla = ([lat, lon]: [number, number]) => ({ donus: -lon, egim: Math.max(-0.9, Math.min(0.9, lat * RAD)) });

export interface KureSecenek {
  now: number; cx: number; cy: number; r: number; donus: number; egim: number;
  yaylar?: Yay[]; noktalar?: Nokta[]; isaretler?: Isaret[]; isin?: boolean;
}

export function kureCiz(g: CanvasRenderingContext2D, o: KureSecenek) {
  const { now, cx, cy, r, egim } = o;
  const don = o.donus * RAD;
  const yaylarL = o.yaylar ?? [], noktalarL = o.noktalar ?? [];
  // Dönen küre: y ekseni etrafında dönüş, x ekseninde eğim → ekran (z > 0 ön yüz)
  const proj = (v: number[]) => {
    const x1 = v[0] * Math.cos(don) + v[2] * Math.sin(don), z1 = -v[0] * Math.sin(don) + v[2] * Math.cos(don);
    const y2 = v[1] * Math.cos(egim) - z1 * Math.sin(egim), z2 = v[1] * Math.sin(egim) + z1 * Math.cos(egim);
    return { x: cx + x1 * r, y: cy - y2 * r, z: z2 };
  };
  // Hale
  const hale = g.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.25);
  hale.addColorStop(0, 'rgba(60,170,255,0.25)'); hale.addColorStop(1, 'rgba(60,170,255,0)');
  g.fillStyle = hale; g.beginPath(); g.arc(cx, cy, r * 1.25, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(4,16,34,0.85)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  // Noktalı enlem-boylam ağı
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += 6) {
      const p = proj(vek([lat, lon]));
      if (p.z <= 0) continue;
      g.fillStyle = `rgba(95,242,255,${0.12 + p.z * 0.35})`;
      g.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    g.beginPath();
    let ilk = true;
    for (let lat = -90; lat <= 90; lat += 5) {
      const p = proj(vek([lat, lon]));
      if (p.z <= 0) { ilk = true; continue; }
      if (ilk) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      ilk = false;
    }
    g.strokeStyle = 'rgba(95,242,255,0.10)'; g.lineWidth = 1; g.stroke();
  }
  // Türkiye
  const trp = proj(vek(TR));
  if (trp.z > 0) {
    const nab = (now / 900) % 1;
    g.strokeStyle = `rgba(255,77,94,${1 - nab})`; g.lineWidth = 2;
    g.beginPath(); g.arc(trp.x, trp.y, 4 + nab * 18, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ff4d5e'; g.beginPath(); g.arc(trp.x, trp.y, 4, 0, Math.PI * 2); g.fill();
  }
  // Yaylar: Türkiye'den yayına; ışık başı ilerler, sonra iz kalır
  for (const y of yaylarL) {
    const t = (now - y.at) / 900;
    if (t <= 0) continue;
    const A = vek(y.a), B = vek(y.b);
    const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
    const om = Math.acos(dot) || 1e-6;
    const ad = Math.min(1, t);
    g.beginPath();
    let ilk = true, bas: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i <= 40; i++) {
      const u = (i / 40) * ad;
      const s1 = Math.sin((1 - u) * om) / Math.sin(om), s2 = Math.sin(u * om) / Math.sin(om);
      const yuk = 1 + Math.sin(Math.PI * u) * Math.min(0.35, om * 0.25);
      const p = proj([(A[0] * s1 + B[0] * s2) * yuk, (A[1] * s1 + B[1] * s2) * yuk, (A[2] * s1 + B[2] * s2) * yuk]);
      if (p.z < -0.15) { ilk = true; continue; }
      if (ilk) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      ilk = false; bas = p;
    }
    const renk = y.dil === 'en' ? '255,179,64' : '95,242,255';
    g.strokeStyle = `rgba(${renk},${(0.25 + 0.6 * y.guc) * (t < 1 ? 1 : Math.max(0.35, 1 - (t - 1) * 0.15))})`;
    g.lineWidth = y.guc > 0.5 ? 1.8 : 1;
    g.stroke();
    if (bas && t < 1.2) { g.fillStyle = `rgba(${renk},1)`; g.beginPath(); g.arc(bas.x, bas.y, 3, 0, Math.PI * 2); g.fill(); }
  }
  // Yayınların yeri: ulaşılınca parlar, bulduğu haber sayısı kadar büyür
  for (const n of noktalarL) {
    const p = proj(vek(n.konum));
    if (p.z <= 0 || n.adet < 0) continue;
    const taze = Math.max(0, 1 - (now - n.at) / 1200);
    const renk = n.dil === 'en' ? '255,179,64' : '95,242,255';
    g.fillStyle = `rgba(${renk},${0.5 + 0.5 * p.z})`;
    g.beginPath(); g.arc(p.x, p.y, 2.2 + Math.min(6, n.adet) * 0.8 + taze * 6, 0, Math.PI * 2); g.fill();
    if (n.dil === 'en' && n.adet > 0) {
      g.font = '600 11px Rajdhani, sans-serif'; g.fillStyle = `rgba(255,220,170,${0.5 + 0.5 * p.z})`;
      g.fillText(n.ad.toLocaleUpperCase('tr'), p.x + 7, p.y - 6);
    }
  }
  // Tarama ışını (bitene kadar)
  if (o.isin) {
    const a = (now / 1400) % 1 * Math.PI * 2;
    const isin = g.createConicGradient?.(a, cx, cy);
    if (isin) {
      isin.addColorStop(0, 'rgba(95,242,255,0.22)'); isin.addColorStop(0.08, 'rgba(95,242,255,0)'); isin.addColorStop(1, 'rgba(95,242,255,0)');
      g.fillStyle = isin; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
  }
  // Olay işaretleri: iğne, odaktaki büyür, etiketli
  for (const m of o.isaretler ?? []) {
    const p = proj(vek(m.konum));
    if (p.z <= 0.05) continue;
    const nab = (now / 700) % 1;
    g.strokeStyle = `rgba(255,77,94,${(1 - nab) * (0.4 + m.odak * 0.6)})`; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x, p.y, 5 + nab * (14 + m.odak * 26), 0, Math.PI * 2); g.stroke();
    g.fillStyle = m.odak > 0.5 ? '#ff4d5e' : 'rgba(255,120,130,0.9)';
    g.beginPath(); g.arc(p.x, p.y, 4 + m.odak * 4, 0, Math.PI * 2); g.fill();
    g.font = `700 ${11 + m.odak * 5}px Rajdhani, sans-serif`;
    g.fillStyle = `rgba(255,235,238,${0.55 + 0.45 * Math.max(m.odak, p.z)})`;
    g.fillText(m.etiket.toLocaleUpperCase('tr'), p.x + 9, p.y - 8);
  }
  g.strokeStyle = 'rgba(95,242,255,0.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
}
