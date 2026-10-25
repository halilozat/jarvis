// Kitaplık taramasından sonra görüntü modeline gönderilen numaralı kırpıntı: adı okunamamış sırtlar karede çerçevelenip
// numaralanır, model "3 numaralı kutu şu kitap" diye cevap verir. Bölüm tamamlaması ve tahmini yerleştirme kullanır.
import type { Kitap, Kutu } from '../lib/library';

/** Karenin alan (0..1, [ymin, xmin, ymax, xmax]) kısmını kırp, büyüt; kutuları sırayla 1'den numaralayarak çiz */
export function numaraliKirpinti(c: HTMLCanvasElement, alan: Kutu, kutular: Kutu[], enGenis: number): HTMLCanvasElement {
  const sx = alan[1] * c.width, sy = alan[0] * c.height, sw = (alan[3] - alan[1]) * c.width, sh = (alan[2] - alan[0]) * c.height;
  const s = Math.min(1.6, enGenis / sw);
  const crop = document.createElement('canvas');
  crop.width = Math.round(sw * s); crop.height = Math.round(sh * s);
  const g = crop.getContext('2d')!;
  g.drawImage(c, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
  kutular.forEach(([y0, x0, y1, x1], i) => {
    const rx = (x0 * c.width - sx) * s, ry = (y0 * c.height - sy) * s, rw = (x1 - x0) * c.width * s, rh = (y1 - y0) * c.height * s;
    g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.strokeRect(rx, ry, rw, rh);
    const fs = Math.max(16, Math.min(30, rw * 0.9));
    g.font = `700 ${fs}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const ly = Math.max(fs * 0.6, ry - fs * 0.6);
    const lw = Math.max(fs * 1.4, g.measureText(String(i + 1)).width + 8);
    g.fillStyle = '#000'; g.fillRect(rx + rw / 2 - lw / 2, ly - fs * 0.6, lw, fs * 1.2);
    g.fillStyle = '#ffeb3b'; g.fillText(String(i + 1), rx + rw / 2, ly);
  });
  return crop;
}

/** Okuma sırası: raf raf (yukarıdan aşağı), rafta soldan sağa. Dikey merkezi yarım sırt boyundan yakın olanlar aynı raf. */
export function okumaSirasi(kitaplar: Kitap[]): Kitap[] {
  const list = kitaplar.filter(b => b.kutu).sort((a, b) => (a.kutu![0] + a.kutu![2]) - (b.kutu![0] + b.kutu![2]));
  const raflar: Kitap[][] = [];
  for (const b of list) {
    const cy = (b.kutu![0] + b.kutu![2]) / 2, h = b.kutu![2] - b.kutu![0];
    const raf = raflar.at(-1);
    const rcy = raf ? raf.reduce((t, x) => t + (x.kutu![0] + x.kutu![2]) / 2, 0) / raf.length : -1;
    if (raf && Math.abs(cy - rcy) < h / 2) raf.push(b); else raflar.push([b]);
  }
  return raflar.flatMap(r => r.sort((a, b) => a.kutu![1] - b.kutu![1]));
}
