// Uzay Laboratuvarı · göstergeler (tuvale çizilir, her karede). Yerleşim Reels/Shorts güvenli alanına göre:
// üstte %10, altta %20, sağda %8 boş bırakılır (uygulama düğmeleri ve altyazı oraya biner).
//  · sağ üst: seçili gezegen paneli (canlı)      · sol alt: tarih, zaman hızı, ölçek, dürüstlük etiketi
//  · üst orta: sonuç bandı (fırlatma, çarpışma…)  · gezegen yanında: sıcaklık etiketi (tutarken)

export const CYAN = 'rgb(95,242,255)';
export const TEXT = 'rgba(223,251,255,0.94)';
export const DIM = 'rgba(150,200,215,0.85)';
const BG = 'rgba(3,12,18,0.74)';
const LINE = 'rgba(95,242,255,0.55)';

export interface Guvenli { x0: number; y0: number; x1: number; y1: number }
export function guvenliAlan(W: number, H: number): Guvenli {
  return { x0: Math.max(16, W * 0.04), y0: H * 0.1, x1: W - Math.max(16, W * 0.08), y1: H * 0.8 };
}

export interface Satir { k: string; v: string; renk?: string }

/** Başlıklı bilgi paneli; sağ üst köşesi (x, y). Yüksekliği döner. */
export function panel(g: CanvasRenderingContext2D, xRight: number, y: number, baslik: string, alt: string, rows: Satir[], alpha = 1, w = 290): number {
  const h = 54 + rows.length * 22 + 8;
  const x = xRight - w;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = BG; g.strokeStyle = LINE; g.lineWidth = 1;
  g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill(); g.stroke();
  g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillStyle = CYAN; g.font = '700 22px Rajdhani, sans-serif';
  g.fillText(baslik, x + 16, y + 10);
  g.fillStyle = DIM; g.font = '500 13px Rajdhani, sans-serif';
  g.fillText(alt, x + 16, y + 34);
  rows.forEach((r, i) => {
    const ry = y + 56 + i * 22;
    g.fillStyle = DIM; g.font = '500 14px Rajdhani, sans-serif'; g.textAlign = 'left';
    g.fillText(r.k, x + 16, ry);
    g.fillStyle = r.renk ?? TEXT; g.font = '700 15px Rajdhani, sans-serif'; g.textAlign = 'right';
    g.fillText(r.v, x + w - 16, ry);
  });
  g.restore();
  return h;
}

/** Üst ortada sonuç bandı: büyük başlık + alt satır */
export function band(g: CanvasRenderingContext2D, cx: number, y: number, baslik: string, alt: string, renk: string, alpha: number) {
  g.save();
  g.globalAlpha = alpha;
  g.font = '700 26px Rajdhani, sans-serif';
  const w1 = g.measureText(baslik).width;
  g.font = '500 15px Rajdhani, sans-serif';
  const w2 = g.measureText(alt).width;
  const w = Math.max(w1, w2) + 44, h = alt ? 64 : 42;
  g.fillStyle = BG; g.strokeStyle = renk; g.lineWidth = 1.5;
  g.beginPath(); g.roundRect(cx - w / 2, y, w, h, 10); g.fill(); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillStyle = renk; g.font = '700 26px Rajdhani, sans-serif';
  g.fillText(baslik, cx, y + 8);
  if (alt) { g.fillStyle = TEXT; g.font = '500 15px Rajdhani, sans-serif'; g.fillText(alt, cx, y + 38); }
  g.restore();
}

/** Küçük etiket kutusu (gezegenin yanında) */
export function etiket(g: CanvasRenderingContext2D, x: number, y: number, lines: [string, string][], alpha = 1, sag = true) {
  g.save();
  g.globalAlpha = alpha;
  g.font = '700 15px Rajdhani, sans-serif';
  const w = Math.max(...lines.map(([t]) => g.measureText(t).width)) + 22;
  const h = lines.length * 19 + 10;
  const bx = sag ? x : x - w;
  g.fillStyle = BG; g.strokeStyle = LINE; g.lineWidth = 1;
  g.beginPath(); g.roundRect(bx, y - h / 2, w, h, 7); g.fill(); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'top';
  lines.forEach(([t, c], i) => { g.fillStyle = c; g.fillText(t, bx + 11, y - h / 2 + 6 + i * 19); });
  g.restore();
}

/** Sol alt: tarih, hız, ölçek, dürüstlük etiketi */
export function altBilgi(g: CanvasRenderingContext2D, x: number, yBottom: number, tarih: string, hiz: string, olcek: string, durdu: boolean) {
  g.save();
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = TEXT; g.font = '700 30px Rajdhani, sans-serif';
  g.fillText(tarih, x, yBottom - 52);
  g.fillStyle = durdu ? 'rgb(255,190,90)' : CYAN; g.font = '700 17px Rajdhani, sans-serif';
  g.fillText(hiz, x, yBottom - 28);
  g.fillStyle = DIM; g.font = '500 13px Rajdhani, sans-serif';
  g.fillText(olcek, x, yBottom - 10);
  g.fillText('mesafeler ölçekli · boyutlar büyütülmüş · basitleştirilmiş model', x, yBottom + 8);
  g.restore();
}

/** Basılı tutma halkası (✊ duraklat, ✋ ayrıntı kartı) */
export function holdRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, p: number, label: string) {
  g.save();
  g.strokeStyle = 'rgba(95,242,255,0.25)'; g.lineWidth = 4;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = CYAN;
  g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p)); g.stroke();
  g.fillStyle = TEXT; g.font = '700 13px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillText(label, x, y + r + 8);
  g.restore();
}
