// Uzay Laboratuvarı · gezegen kesiti: dörtte biri kesilmiş küre, iç katmanlar gerçek oranlarda (data.ts), etiketli;
// yanında atmosfer bileşimi halka grafiği. Gezegen ekranın ortasında büyür, kesik dilim açılır.
import { VERI, type Cisim } from './data';
import type { Body, BodyRenderer } from './planets';
import { sayi } from './sentences';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const ATM_RENK = ['#7fd6ff', '#9dffb0', '#ffd27f', '#ff9f7f', '#c9a0ff', '#ffffff'];

/** Kesik açısı: sağ üst çeyrek (ekranda) */
const A0 = -Math.PI / 2, A1 = 0;

export function drawSection(g: CanvasRenderingContext2D, b: Body, govde: Cisim, cx: number, cy: number, R: number, open: number, renderer: BodyRenderer, now: number, dpr: number) {
  const v = VERI[govde];
  const k = ease(open);
  // Gezegenin kendisi (noktalı yüzey)
  b.x = b.tx = cx; b.y = b.ty = cy; b.r = b.tr = R;
  renderer.draw(g, b, now, dpr);
  if (k <= 0.01) return;
  // Kesilen dilim: önce siyah boşluk, sonra katmanlar içten dışa
  g.save();
  const a1 = A0 + (A1 - A0) * k;
  g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * 1.004, A0, a1); g.closePath();
  g.fillStyle = '#05080c'; g.fill();
  for (let i = v.katmanlar.length - 1; i >= 0; i--) {
    const L = v.katmanlar[i];
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * L.r, A0, a1); g.closePath();
    const gr = g.createRadialGradient(cx - R * 0.1, cy + R * 0.1, 0, cx, cy, R * L.r);
    gr.addColorStop(0, L.renk); gr.addColorStop(1, shade(L.renk, 0.7));
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
  }
  // Katman etiketleri: dilimin içinden sağa doğru çizgiyle
  g.globalAlpha = clamp((open - 0.5) * 2, 0, 1);
  g.font = '600 14px Rajdhani, sans-serif';
  g.textBaseline = 'middle';
  let prev = 0;
  v.katmanlar.forEach((L, i) => {
    const mid = (prev + L.r) / 2;
    prev = L.r;
    const ang = -Math.PI / 4;
    const px = cx + Math.cos(ang) * R * mid, py = cy + Math.sin(ang) * R * mid;
    const lx = cx + R * 1.18, ly = cy - R * 0.95 + i * 40;
    g.strokeStyle = 'rgba(95,242,255,0.6)';
    g.beginPath(); g.moveTo(px, py); g.lineTo(lx - 8, ly); g.lineTo(lx, ly); g.stroke();
    g.fillStyle = L.renk;
    g.beginPath(); g.arc(px, py, 2.5, 0, Math.PI * 2); g.fill();
    const km = Math.round((L.r * v.yaricap) / 10) * 10;
    g.fillStyle = 'rgba(223,251,255,0.95)';
    g.fillText(L.ad, lx + 6, ly - 7);
    g.fillStyle = 'rgba(150,200,215,0.85)';
    g.font = '500 12px Rajdhani, sans-serif';
    g.fillText(i === v.katmanlar.length - 1 ? `yüzey · yarıçap ${sayi(v.yaricap)} km` : `merkezden ≈${sayi(km)} km`, lx + 6, ly + 9);
    g.font = '600 14px Rajdhani, sans-serif';
  });
  g.restore();
}

/** Atmosfer bileşimi halka grafiği (hacimce %) */
export function drawAtmosphere(g: CanvasRenderingContext2D, govde: Cisim, x: number, y: number, r: number, alpha: number) {
  const v = VERI[govde];
  g.save();
  g.globalAlpha = alpha;
  g.font = '700 14px Rajdhani, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgb(95,242,255)';
  g.fillText('ATMOSFER', x, y - r - 18);
  if (!v.atmosfer.length) {
    g.strokeStyle = 'rgba(150,200,215,0.4)'; g.lineWidth = r * 0.32;
    g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(223,251,255,0.9)'; g.font = '600 13px Rajdhani, sans-serif';
    g.fillText('yok denecek kadar ince', x, y);
    g.restore();
    return;
  }
  const total = v.atmosfer.reduce((s, [, p]) => s + p, 0);
  let a = -Math.PI / 2;
  v.atmosfer.forEach(([ad, p], i) => {
    const da = (p / total) * Math.PI * 2;
    g.strokeStyle = ATM_RENK[i % ATM_RENK.length];
    g.lineWidth = r * 0.32;
    g.beginPath(); g.arc(x, y, r * 0.8, a, a + Math.max(da, 0.02)); g.stroke();
    a += da;
    // Lejant
    const ly = y + r + 22 + i * 18;
    g.fillStyle = ATM_RENK[i % ATM_RENK.length];
    g.fillRect(x - r, ly - 5, 10, 10);
    g.fillStyle = 'rgba(223,251,255,0.92)';
    g.textAlign = 'left'; g.font = '600 13px Rajdhani, sans-serif';
    g.fillText(`${ad}  %${sayi(p, p < 1 ? 2 : 1)}`, x - r + 16, ly);
    g.textAlign = 'center';
  });
  g.fillStyle = 'rgba(223,251,255,0.95)';
  g.font = '700 15px Rajdhani, sans-serif';
  g.fillText(v.basinc === null ? 'yüzey yok' : `${sayi(v.basinc, v.basinc < 0.1 ? 3 : v.basinc < 10 ? 2 : 0)} bar`, x, y);
  g.restore();
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}
