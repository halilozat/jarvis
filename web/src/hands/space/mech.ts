// Uzay Laboratuvarı · mekanik HUD parçaları (Jarvis havası). İşlevsel değil, görsel: kendini çizen çerçeveler,
// köşe kıskaçları, dönen dişli halkalar, harf harf çözülen yazılar, kayan veri sütunları, damgalar.
// Hepsi saf çizim fonksiyonları; zamanı (ms) dışarıdan alırlar, durum tutmazlar.

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeBack = (t: number) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export const M_CYAN = 'rgb(95,242,255)';
export const M_DIM = 'rgba(95,242,255,0.35)';
export const M_FAINT = 'rgba(95,242,255,0.12)';
const GLYPH = '01▮▯◆◇+×#%&$@ABCDEFGHJKLMNPRSTUVXYZ0123456789';

/** Kesirli rastgele (tohumlu, kare kare değişmesin) */
export const rnd = (seed: number) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** Çerçeve kenarı kendini çizer (p: 0..1, sol üstten saat yönünde), köşelerde kısa çentikler */
export function drawBorder(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number, color = M_CYAN, cut = 14) {
  const pts: [number, number][] = [[x + cut, y], [x + w, y], [x + w, y + h - cut], [x + w - cut, y + h], [x, y + h], [x, y + cut], [x + cut, y]];
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * clamp(p, 0, 1);
  g.save();
  g.strokeStyle = color; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const k = Math.min(1, left / seg[i - 1]);
    g.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k);
    left -= seg[i - 1];
  }
  g.stroke();
  g.restore();
}

/** Mekanik panel: önce kenar çizilir, sonra arka plan kepenk gibi açılır; üstte başlık şeridi ve adım blokları */
export function mechPanel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, age: number, title: string, code: string, step: number, steps: number) {
  const pb = clamp(age / 320, 0, 1), pf = easeOut((age - 200) / 280);
  g.save();
  if (pf > 0) {
    const hh = h * pf;
    g.fillStyle = 'rgba(2,14,22,0.82)';
    g.beginPath(); g.moveTo(x + 14, y); g.lineTo(x + w, y); g.lineTo(x + w, y + hh - 14); g.lineTo(x + w - 14, y + hh); g.lineTo(x, y + hh); g.lineTo(x, y + 14); g.closePath(); g.fill();
    // İnce tarama çizgileri
    g.globalAlpha = 0.05;
    g.fillStyle = M_CYAN;
    for (let yy = y + 3; yy < y + hh; yy += 4) g.fillRect(x, yy, w, 1);
    g.globalAlpha = 1;
  }
  drawBorder(g, x, y, w, h * Math.max(pf, 0.02), pb);
  // Başlık şeridi
  if (pf > 0.3) {
    const a = clamp((pf - 0.3) / 0.4, 0, 1);
    g.globalAlpha = a;
    g.fillStyle = 'rgba(95,242,255,0.14)';
    g.fillRect(x + 14, y + 1, w - 15, 30);
    g.fillStyle = M_CYAN; g.font = '700 15px Rajdhani, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(decode(title, (age - 300) / 400, 7), x + 22, y + 16);
    g.fillStyle = M_DIM; g.font = '600 12px Rajdhani, sans-serif'; g.textAlign = 'right';
    g.fillText(code, x + w - 12 - steps * 11 - 8, y + 16);
    // Adım blokları
    for (let i = 0; i < steps; i++) {
      g.fillStyle = i < step ? M_CYAN : i === step ? `rgba(95,242,255,${0.45 + 0.4 * Math.sin(age / 90)})` : M_FAINT;
      g.fillRect(x + w - 12 - (steps - i) * 11, y + 11, 8, 10);
    }
  }
  g.restore();
}

/** Harf harf çözülme: p 0..1; henüz çözülmemiş harfler rastgele simge, çözülen sonda imleç */
export function decode(text: string, p: number, seed = 1): string {
  const n = Math.floor(text.length * clamp(p, 0, 1));
  if (n >= text.length) return text;
  const t = Math.floor(performance.now() / 45);
  let out = text.slice(0, n);
  for (let i = n; i < Math.min(text.length, n + 4); i++) out += text[i] === ' ' ? ' ' : GLYPH[Math.floor(rnd(seed + i * 3.1 + t) * GLYPH.length)];
  return out + '▌';
}

/** Köşe kıskaçları: t=0 geniş (ekran köşeleri), t=1 hedefe kilitli; kilitte kısa parlama */
export function lockBrackets(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, W: number, H: number, now: number) {
  const k = easeBack(t);
  const L = r * 0.32;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  g.save();
  g.strokeStyle = t >= 1 ? M_CYAN : 'rgba(95,242,255,0.8)';
  g.lineWidth = 2.2;
  for (const [sx, sy] of corners) {
    const fx = sx < 0 ? 30 : W - 30, fy = sy < 0 ? 30 : H - 30;
    const tx = cx + sx * r * 1.18, ty = cy + sy * r * 1.18;
    const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k;
    g.beginPath(); g.moveTo(x, y - sy * L); g.lineTo(x, y); g.lineTo(x - sx * L, y); g.stroke();
  }
  // Kilitlenince köşelerde kısa nabız
  if (t >= 1) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    g.fillStyle = `rgba(95,242,255,${0.35 + 0.4 * pulse})`;
    for (const [sx, sy] of corners) g.fillRect(cx + sx * r * 1.18 - 2, cy + sy * r * 1.18 - 2, 4, 4);
  }
  g.restore();
}

/** Dişli halka: dış kenarda çentikler, belli aralıklarla uzun çentik ve kısa boşluklar; rot radyan */
export function gearRing(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number, n: number, len: number, color: string, gapEvery = 0) {
  g.save();
  g.strokeStyle = color; g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    if (gapEvery && i % gapEvery === 0) continue;
    const a = rot + (i / n) * TAU;
    const l = i % 5 === 0 ? len * 1.8 : len;
    g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.lineTo(cx + Math.cos(a) * (r + l), cy + Math.sin(a) * (r + l));
  }
  g.stroke();
  g.restore();
}

/** Parçalı yay: n parça, aralarında boşluk; rot ile döner */
export function segArcs(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number, n: number, fill: number, width: number, color: string) {
  g.save();
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * TAU, a1 = a0 + (TAU / n) * fill;
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  }
  g.restore();
}

/** Nişangâh: dönen halkalar, artı çizgileri, yön etiketleri. on: 0..1 (açılış) */
export function reticle(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, now: number, on: number) {
  if (on <= 0) return;
  const t = now / 1000, k = easeOut(on);
  g.save();
  g.globalAlpha = k;
  gearRing(g, cx, cy, r * 1.14, t * 0.12, 120, 4, 'rgba(95,242,255,0.45)', 30);
  segArcs(g, cx, cy, r * 1.26, -t * 0.35, 6, 0.55, 2, 'rgba(95,242,255,0.55)');
  segArcs(g, cx, cy, r * 1.32, t * 0.22, 24, 0.3, 4, 'rgba(95,242,255,0.18)');
  // Dış ince halka ve dört yön oku
  g.strokeStyle = 'rgba(95,242,255,0.25)'; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, r * 1.42 * (0.9 + 0.1 * k), 0, TAU); g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4 + Math.sin(t * 0.7) * 0.04;
    const R = r * 1.42;
    g.fillStyle = M_CYAN;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2));
    g.lineTo(cx + Math.cos(a + 0.03) * (R + 14), cy + Math.sin(a + 0.03) * (R + 14));
    g.lineTo(cx + Math.cos(a - 0.03) * (R + 14), cy + Math.sin(a - 0.03) * (R + 14));
    g.fill();
  }
  // Artı çizgileri (gövdenin dışında)
  g.strokeStyle = 'rgba(95,242,255,0.3)';
  g.beginPath();
  g.moveTo(cx - r * 1.62, cy); g.lineTo(cx - r * 1.2, cy);
  g.moveTo(cx + r * 1.2, cy); g.lineTo(cx + r * 1.62, cy);
  g.moveTo(cx, cy - r * 1.62); g.lineTo(cx, cy - r * 1.2);
  g.moveTo(cx, cy + r * 1.2); g.lineTo(cx, cy + r * 1.62);
  g.stroke();
  // Değişen telemetri
  g.fillStyle = M_DIM; g.font = '600 11px Rajdhani, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const az = ((t * 23.7) % 360).toFixed(1), el = (12 + Math.sin(t * 0.8) * 6).toFixed(2);
  g.fillText(`AZ ${az}°`, cx + r * 1.66, cy - 8);
  g.fillText(`EL ${el}°`, cx + r * 1.66, cy + 8);
  g.textAlign = 'right';
  g.fillText(`KİLİT ${Math.floor(97 + rnd(Math.floor(t * 4)) * 3)}`, cx - r * 1.66, cy - 8);
  g.fillText(`SNR ${(38 + rnd(Math.floor(t * 3) + 7) * 4).toFixed(1)}`, cx - r * 1.66, cy + 8);
  g.restore();
}

/** Radar süpürmesi: gövdenin çevresinde dönen ışık konisi */
export function sweep(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, now: number, alpha: number) {
  const a = (now / 1000) * 1.6;
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(95,242,255,${0.05 * (1 - i / 8)})`;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a - (i + 1) * 0.06, a - i * 0.06); g.closePath(); g.fill();
  }
  g.restore();
}

/** Kayan veri sütunu (ekran kenarlarında): onaltılık sayılar ve kısa kodlar */
export function dataColumn(g: CanvasRenderingContext2D, x: number, y: number, h: number, now: number, seed: number, align: CanvasTextAlign) {
  const lineH = 14, n = Math.floor(h / lineH), off = Math.floor(now / 120);
  g.save();
  g.font = '500 11px "SF Mono", Menlo, monospace'; g.textAlign = align; g.textBaseline = 'top';
  for (let i = 0; i < n; i++) {
    const v = rnd(seed + (i + off) * 1.7);
    const a = 0.08 + 0.22 * (i / n) + (v > 0.93 ? 0.4 : 0);
    g.fillStyle = `rgba(95,242,255,${a})`;
    const s = v > 0.85 ? `${['SPK', 'ALB', 'TMP', 'ESI', 'H₂O', 'MAG'][Math.floor(v * 60) % 6]}·${(v * 999).toFixed(0).padStart(3, '0')}` : (Math.floor(v * 0xffffff)).toString(16).toUpperCase().padStart(6, '0');
    g.fillText(s, x, y + i * lineH);
  }
  g.restore();
}

let hexCache: { c: HTMLCanvasElement; w: number; h: number } | null = null;
/** Soluk altıgen ızgara (önbellekli) */
export function hexGrid(g: CanvasRenderingContext2D, W: number, H: number, alpha: number) {
  if (!hexCache || hexCache.w !== W || hexCache.h !== H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    const s = 22, hgt = Math.sqrt(3) * s;
    x.strokeStyle = 'rgba(95,242,255,0.5)'; x.lineWidth = 0.6;
    x.beginPath();
    for (let row = -1; row < H / hgt + 1; row++) {
      for (let col = -1; col < W / (s * 1.5) + 1; col++) {
        const cx = col * s * 1.5, cy = row * hgt + (col % 2 ? hgt / 2 : 0);
        for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU; const px = cx + Math.cos(a) * s * 0.96, py = cy + Math.sin(a) * s * 0.96; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      }
    }
    x.stroke();
    hexCache = { c, w: W, h: H };
  }
  g.save(); g.globalAlpha = alpha; g.drawImage(hexCache.c, 0, 0); g.restore();
}

/** Damga: büyükten küçüğe "çakılır", hafif eğik, çerçeveli */
export function stamp(g: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, color: string, size = 26) {
  if (t <= 0) return;
  const k = clamp(t, 0, 1);
  const sc = 1 + (1 - easeOut(k)) * 1.6;
  g.save();
  g.translate(x, y); g.rotate(-0.08); g.scale(sc, sc);
  g.globalAlpha = Math.min(1, k * 3);
  g.font = `800 ${size}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(text).width + 24, h = size + 12;
  g.strokeStyle = color; g.lineWidth = 2.5;
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
  g.fillStyle = color; g.fillText(text, 0, 1);
  g.restore();
}

/** Lider çizgisi ve küçük etiket kutusu (gövdeden dışarı, kırık çizgi) */
export function callout(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, label: string, sub: string, p: number) {
  if (p <= 0) return;
  const k = easeOut(p);
  const mx = x0 + (x1 - x0) * 0.55;
  g.save();
  g.strokeStyle = 'rgba(95,242,255,0.7)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x0, y0);
  const ex = x0 + (mx - x0) * Math.min(1, k * 2), ey = y0 + (y1 - y0) * Math.min(1, k * 2);
  g.lineTo(ex, ey);
  if (k > 0.5) g.lineTo(mx + (x1 - mx) * ((k - 0.5) * 2), y1);
  g.stroke();
  g.fillStyle = M_CYAN; g.beginPath(); g.arc(x0, y0, 2.5, 0, TAU); g.fill();
  if (k > 0.9) {
    g.font = '700 13px Rajdhani, sans-serif'; g.textAlign = x1 > x0 ? 'left' : 'right'; g.textBaseline = 'bottom';
    g.fillStyle = 'rgba(223,251,255,0.95)'; g.fillText(decode(label, (k - 0.9) * 12, 3), x1 + (x1 > x0 ? 4 : -4), y1 - 2);
    g.textBaseline = 'top'; g.fillStyle = M_DIM; g.font = '500 11px Rajdhani, sans-serif';
    g.fillText(sub, x1 + (x1 > x0 ? 4 : -4), y1 + 2);
  }
  g.restore();
}

/** Sayaç: hedefe doğru yuvarlanan sayı (odometre hissi) */
export const odometer = (v: number, p: number) => v * easeOut(p) + (p < 1 ? (rnd(Math.floor(performance.now() / 50)) - 0.5) * 0.02 * (1 - p) : 0);
