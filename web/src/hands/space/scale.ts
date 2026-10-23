// Uzay Laboratuvarı · ekran ölçeği. Bütün dönüşümler burada: fizik AU'da, ekran pikselde.
//
// Uzaklıklar sıkıştırılır: ekrandaki yarıçap ∝ √(AU). Böylece Merkür (0,39 AU) ile Neptün (30 AU) aynı ekrana sığar
// ve iç gezegenler birbirine karışmaz. Yön korunur; yalnızca Güneş'ten uzaklık sıkıştırılır.
// Bakış: sistemin kuzeyinden, 25° eğik (derinlik hissi için düzlem dikeyde cos 25° kadar basılır).
// Ekranda +x sağ, +y aşağı; ekliptikte +y ekranın yukarısına düşer (gezegenler saat yönünün tersine döner).

export const EGIM = (25 * Math.PI) / 180;
const CE = Math.cos(EGIM);

export class Olcek {
  /** Güneş'in ekrandaki yeri */
  cx = 0; cy = 0;
  /** 1 AU'nun ekrandaki yarıçapı (px): r_ekran = K · √r */
  K = 100;

  /** Düzlem (AU, Güneş merkezli) → ekran (px) */
  ekran(x: number, y: number): { X: number; Y: number } {
    const r = Math.hypot(x, y);
    if (r < 1e-12) return { X: this.cx, Y: this.cy };
    const s = (this.K * Math.sqrt(r)) / r;
    return { X: this.cx + x * s, Y: this.cy - y * s * CE };
  }

  /** Ekran (px) → düzlem (AU, Güneş merkezli). ekran()'ın tam tersi. */
  duzlem(X: number, Y: number): { x: number; y: number } {
    const sx = X - this.cx, sy = -(Y - this.cy) / CE;
    const rs = Math.hypot(sx, sy);
    if (rs < 1e-9) return { x: 0, y: 0 };
    const r = (rs / this.K) ** 2;
    return { x: (sx / rs) * r, y: (sy / rs) * r };
  }

  /** r AU'luk dairenin ekrandaki yatay yarıçapı (dikeyi × cos 25°) */
  yaricap(r: number) { return this.K * Math.sqrt(r); }
  get basik() { return CE; }

  /** Ekrandaki bir hızın (px/s) düzlemdeki yönü (birim vektör) */
  yon(X: number, Y: number, VX: number, VY: number): { x: number; y: number } {
    const e = 0.004;
    const a = this.duzlem(X, Y), b = this.duzlem(X + VX * e, Y + VY * e);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
}

/** Gezegenin ekrandaki yarıçapı (px): boyutlar büyütülmüş, √ yerine 0,45 üs (Jüpiter Dünya'nın 3 katı görünür) */
export function govdePx(km: number, base: number) {
  return base * Math.pow(km / 6371, 0.45);
}
