// Gece Gökyüzü · tuval çizimi. Sıra (video için): 1 fotoğraf gelir · 2 tarama çizgisi geçer · 3 yıldızlar halkalarla
// tek tek belirir, isimleri yazılır · 4 takımyıldız çizgileri sırayla çizilir · 5 gezegenler ayrı renkte, büyük halkayla.
// Konumlar sahneden (WCS + katalog) gelir; burada yalnızca çizilir.
import { yildizRengi } from './katalog';
import type { Sahne, SahneCisim, SahneYildiz } from './sahne';

export interface Gorunum { s: number; ox: number; oy: number }

export const CYAN = '77, 225, 255';
export const AMBER = '255, 181, 71';
const AY_RENK = '235, 240, 255';

/** Animasyon zamanları (saniye) */
export const Z = { foto: 0.7, taramaBas: 0.6, taramaSure: 2.2, cizgiAra: 0.45, cizgiSure: 0.9 };
export const popZamani = (x: number, w: number) => Z.taramaBas + Z.taramaSure * Math.min(1, Math.max(0, x / w)) + 0.05;
export const cizgiBas = () => Z.taramaBas + Z.taramaSure + 0.3;
/** Takımyıldızlar arası gecikme: çok takımyıldız varsa çizgi aşaması ~3 sn'ye sığar */
export const cizgiAralik = (n: number) => Math.min(Z.cizgiAra, 3 / Math.max(1, n));
export const gezegenBas = (nTakim: number) => cizgiBas() + nTakim * cizgiAralik(nTakim) + 0.6;
/** Bütün animasyonun bittiği an */
export const sonZaman = (s: Sahne) => gezegenBas(s.takimyildizlar.length) + 0.4 * s.cisimler.length + 1;

const sinir = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const easeOutBack = (x: number) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/** Yıldız halkasının yarıçapı (ekran px) */
export const halka = (kadir: number) => sinir(5 + (3.5 - kadir) * 2.3, 5, 15);

export const ekran = (g: Gorunum, x: number, y: number) => ({ x: g.ox + (x + 0.5) * g.s, y: g.oy + (y + 0.5) * g.s });

export interface CizimVeri {
  W: number;
  H: number;
  foto: CanvasImageSource | null;
  sahne: Sahne;
  g: Gorunum;
  /** Açılıştan beri geçen süre (s); Infinity = animasyonsuz */
  t: number;
  secili: number | string | null;
  imlec: number | string | null;
  /** Simülasyon: fotoğraf yerine gece göğü zemini (ufuk ve yönler simulasyon.ts'te çizilir) */
  sim?: boolean;
  /** Etiket sayısı sınırı (dikey ekranda daha az) */
  etiketSiniri: number;
  /** Seçimin başladığı an (s): halka nabzı */
  seciliT: number;
}

interface Kutu { x: number; y: number; w: number; h: number }
const cakisir = (a: Kutu, b: Kutu) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function ciz(ctx: CanvasRenderingContext2D, d: CizimVeri) {
  const { W, H, sahne: s, g, t } = d;
  if (!d.sim) ctx.clearRect(0, 0, W, H); // simülasyonda zemin (gök, ufuk) önceden çizildi

  // 1) Fotoğraf: siyahtan gelir, hafif yakınlaşmadan oturur
  const fp = sinir(t / Z.foto, 0, 1);
  if (d.foto) {
    const k = 1 + 0.04 * (1 - easeInOut(fp));
    const cx = g.ox + (s.w * g.s) / 2, cy = g.oy + (s.h * g.s) / 2;
    ctx.save();
    ctx.globalAlpha = fp;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.drawImage(d.foto, -(s.w * g.s) / 2, -(s.h * g.s) / 2, s.w * g.s, s.h * g.s);
    ctx.restore();
    // Taramadan sonra fotoğraf biraz kararır: işaretler öne çıksın
    const kar = 0.22 * sinir((t - Z.taramaBas) / Z.taramaSure, 0, 1);
    if (kar > 0) { ctx.fillStyle = `rgba(2, 6, 12, ${kar})`; ctx.fillRect(g.ox, g.oy, s.w * g.s, s.h * g.s); }
  }

  // İşaretler fotoğrafın sınırında kesilir (kadraj dışındaki takımyıldız uçları siyah alana taşmasın)
  ctx.save();
  if (!d.sim) { ctx.beginPath(); ctx.rect(g.ox, g.oy, s.w * g.s, s.h * g.s); ctx.clip(); }

  // 2) Tarama çizgisi (fotoğrafın solundan sağına)
  const tp = (t - Z.taramaBas) / Z.taramaSure;
  if (tp > 0 && tp < 1.08) {
    const x = g.ox + sinir(tp, 0, 1) * s.w * g.s;
    const y0 = Math.max(0, g.oy), y1 = Math.min(H, g.oy + s.h * g.s);
    const iz = ctx.createLinearGradient(x - 160, 0, x, 0);
    iz.addColorStop(0, `rgba(${CYAN}, 0)`);
    iz.addColorStop(1, `rgba(${CYAN}, 0.16)`);
    ctx.fillStyle = iz;
    ctx.fillRect(x - 160, y0, 160, y1 - y0);
    ctx.save();
    ctx.shadowColor = `rgba(${CYAN}, 0.9)`;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = `rgba(${CYAN}, ${tp < 1 ? 0.95 : 0.95 * (1 - (tp - 1) / 0.08)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.restore();
    // Çizgi üstünde ölçek çentikleri
    ctx.fillStyle = `rgba(${CYAN}, 0.8)`;
    for (let yy = y0 + 12; yy < y1; yy += 28) ctx.fillRect(x - 5, yy, 10, 1);
  }

  // 4) Takımyıldız çizgileri: biri bitmeden sıradaki başlar
  const cb = cizgiBas();
  s.takimyildizlar.forEach((tk, i) => {
    const p = sinir((t - (cb + i * cizgiAralik(s.takimyildizlar.length))) / Z.cizgiSure, 0, 1);
    if (p <= 0) return;
    const parca = tk.segmentler.map(([x1, y1, x2, y2]) => { const a = ekran(g, x1, y1), b = ekran(g, x2, y2); return { a, b, l: Math.hypot(b.x - a.x, b.y - a.y) }; });
    const toplam = parca.reduce((t2, q) => t2 + q.l, 0);
    let kalan = easeInOut(p) * toplam;
    ctx.save();
    ctx.strokeStyle = `rgba(${CYAN}, 0.5)`;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.shadowColor = `rgba(${CYAN}, 0.6)`;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (const q of parca) {
      if (kalan <= 0) break;
      const k = Math.min(1, kalan / (q.l || 1));
      ctx.moveTo(q.a.x, q.a.y);
      ctx.lineTo(q.a.x + (q.b.x - q.a.x) * k, q.a.y + (q.b.y - q.a.y) * k);
      kalan -= q.l;
    }
    ctx.stroke();
    ctx.restore();
    if (p > 0.55) {
      const e = ekran(g, tk.etiket.x, tk.etiket.y);
      ctx.save();
      ctx.globalAlpha = sinir((p - 0.55) / 0.45, 0, 1) * 0.9;
      ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(${CYAN}, 0.85)`;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(harfAra(tk.ad.toLocaleUpperCase('tr')), e.x, e.y);
      ctx.restore();
    }
  });

  // 3) Yıldızlar: tarama çizgisi geçince halkayla belirir
  const etiketler: Kutu[] = [];
  const isimli = new Set(etiketSec(s.yildizlar, d.etiketSiniri).map(y => y.hip));
  const ciziliYildiz: { y: SahneYildiz; e: { x: number; y: number }; r: number; a: number }[] = [];
  for (const y of s.yildizlar) {
    const tp2 = (t - popZamani(y.x, s.w)) / 0.35;
    if (tp2 <= 0) continue;
    const e = ekran(g, y.x, y.y);
    if (e.x < -30 || e.y < -30 || e.x > W + 30 || e.y > H + 30) continue;
    const r = halka(y.kadir) * easeOutBack(sinir(tp2, 0, 1));
    ciziliYildiz.push({ y, e, r, a: sinir(tp2, 0, 1) });
  }
  for (const { y, e, r, a } of ciziliYildiz) {
    // Belirme parlaması
    if (a < 1) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - a)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    const sec = d.secili === y.hip, imlec = d.imlec === y.hip;
    ctx.save();
    ctx.strokeStyle = sec ? '#ffffff' : `rgba(${CYAN}, ${imlec ? 1 : 0.85})`;
    ctx.lineWidth = sec || imlec ? 2 : 1.3;
    ctx.shadowColor = `rgba(${CYAN}, 0.8)`;
    ctx.shadowBlur = sec ? 14 : 6;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // Yıldızın rengi: halkanın içinde küçük nokta
    ctx.fillStyle = yildizRengi(y.renk);
    ctx.globalAlpha = 0.9 * a;
    ctx.beginPath(); ctx.arc(e.x, e.y, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (sec || imlec) seciliHalka(ctx, e.x, e.y, r + 7, t - d.seciliT, sec ? '255,255,255' : CYAN);
  }
  // Etiketler (çakışmasın): önce seçili, sonra parlaklık sırasıyla
  ctx.font = '500 13px Rubik, system-ui, sans-serif';
  const sirali = ciziliYildiz.filter(c => c.a >= 1 && (isimli.has(c.y.hip) || d.secili === c.y.hip || d.imlec === c.y.hip))
    .sort((p, q) => Number(d.secili === q.y.hip) - Number(d.secili === p.y.hip) || p.y.kadir - q.y.kadir);
  for (const c of ciziliYildiz) etiketler.push({ x: c.e.x - c.r, y: c.e.y - c.r, w: c.r * 2, h: c.r * 2 });
  for (const { y, e, r } of sirali) {
    const yazi = y.ad;
    const tw = ctx.measureText(yazi).width;
    const adaylar: Kutu[] = [
      { x: e.x + r + 6, y: e.y - 8, w: tw, h: 16 }, { x: e.x - r - 6 - tw, y: e.y - 8, w: tw, h: 16 },
      { x: e.x - tw / 2, y: e.y - r - 22, w: tw, h: 16 }, { x: e.x - tw / 2, y: e.y + r + 6, w: tw, h: 16 },
    ];
    const k = adaylar.find(b => b.x > 4 && b.y > 4 && b.x + b.w < W - 4 && b.y + b.h < H - 4 && !etiketler.some(o => cakisir(o, b)));
    if (!k) continue;
    etiketler.push(k);
    const yas = sinir((t - popZamani(y.x, s.w) - 0.3) / 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = yas;
    ctx.fillStyle = d.secili === y.hip ? '#ffffff' : 'rgba(232, 246, 255, 0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 5;
    ctx.fillText(yazi, k.x, k.y + 12.5);
    ctx.restore();
  }

  // 5) Gezegenler ve Ay
  const gb = gezegenBas(s.takimyildizlar.length);
  s.cisimler.forEach((c, i) => {
    const p = (t - (gb + i * 0.4)) / 0.6;
    if (p <= 0) return;
    cisimCiz(ctx, c, ekran(g, c.x, c.y), sinir(p, 0, 1), t, d.secili === c.id || d.imlec === c.id, etiketler, W, H);
  });
  ctx.restore();
}

function seciliHalka(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, dt: number, renk: string) {
  ctx.save();
  ctx.strokeStyle = `rgba(${renk}, 0.9)`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -dt * 18;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // Nabız
  const n = (dt % 1.4) / 1.4;
  ctx.strokeStyle = `rgba(${renk}, ${0.6 * (1 - n)})`;
  ctx.beginPath(); ctx.arc(x, y, r + n * 22, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function cisimCiz(ctx: CanvasRenderingContext2D, c: SahneCisim, e: { x: number; y: number }, p: number, t: number, sec: boolean, etiketler: Kutu[], W: number, H: number) {
  const renk = c.id === 'ay' ? AY_RENK : AMBER;
  const r = (c.id === 'ay' ? 30 : 20) * easeOutBack(p);
  ctx.save();
  ctx.shadowColor = `rgba(${renk}, 0.9)`;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = `rgba(${renk}, 1)`;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
  // Dört çentik (nişangâh)
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(a) * (r + 4), e.y + Math.sin(a) * (r + 4));
    ctx.lineTo(e.x + Math.cos(a) * (r + 12), e.y + Math.sin(a) * (r + 12));
    ctx.stroke();
  }
  ctx.restore();
  // Dalga: gezegen olduğunu hissettirir
  const n = ((t * 0.7) % 1);
  ctx.strokeStyle = `rgba(${renk}, ${0.5 * (1 - n) * p})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(e.x, e.y, r + 6 + n * 30, 0, Math.PI * 2); ctx.stroke();
  if (sec) seciliHalka(ctx, e.x, e.y, r + 18, t, renk);
  if (p < 1) return;
  ctx.font = '700 15px Rubik, system-ui, sans-serif';
  const ad = c.ad.toLocaleUpperCase('tr');
  const alt = c.id === 'ay' ? `AY · %${Math.round((c.evre ?? 0) * 100)} aydınlık` : `GEZEGEN · ışığı ${Math.round(c.isikDk)} dk önce yola çıktı`;
  const tw = Math.max(ctx.measureText(ad).width, alt.length * 6.4);
  const adaylar: Kutu[] = [{ x: e.x + r + 16, y: e.y - 20, w: tw, h: 36 }, { x: e.x - r - 16 - tw, y: e.y - 20, w: tw, h: 36 }, { x: e.x - tw / 2, y: e.y + r + 14, w: tw, h: 36 }, { x: e.x - tw / 2, y: e.y - r - 50, w: tw, h: 36 }];
  const k = adaylar.find(b => b.x > 4 && b.y > 4 && b.x + b.w < W - 4 && b.y + b.h < H - 4 && !etiketler.some(o => cakisir(o, b))) ?? adaylar[0];
  etiketler.push(k);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = `rgb(${renk})`;
  ctx.fillText(ad, k.x, k.y + 15);
  ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = `rgba(${renk}, 0.85)`;
  ctx.fillText(alt, k.x, k.y + 32);
  ctx.restore();
}

/** Harf aralığı (HUD yazısı) */
const harfAra = (s: string) => s.split('').join(' ');

/** Hangi yıldızlara isim yazılır: adı olanlar ve en parlaklar */
export function etiketSec(ys: SahneYildiz[], sinir2: number): SahneYildiz[] {
  return ys.filter(y => y.adli || y.kadir < 2.2).slice(0, sinir2);
}

/** Ekran noktasına en yakın yıldız ya da gezegen (dokunma ve el ile işaret) */
export function enYakin(s: Sahne, g: Gorunum, x: number, y: number, yaricap: number, t = Infinity): { id: number | string; d: number } | null {
  let en: { id: number | string; d: number } | null = null;
  for (const c of s.cisimler) {
    const e = ekran(g, c.x, c.y);
    const dd = Math.hypot(e.x - x, e.y - y) - 12; // gezegen halkası büyük: biraz öncelik
    if (dd < yaricap && (!en || dd < en.d)) en = { id: c.id, d: dd };
  }
  for (const s2 of s.yildizlar) {
    if (t < popZamani(s2.x, s.w)) continue;
    const e = ekran(g, s2.x, s2.y);
    const dd = Math.hypot(e.x - x, e.y - y);
    if (dd < yaricap && (!en || dd < en.d)) en = { id: s2.hip, d: dd };
  }
  return en;
}
