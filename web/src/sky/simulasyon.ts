// Gece Gökyüzü · SİMÜLASYON (yedek mod): fotoğraf çözülemezse ya da hava bulutluysa gökyüzü konum ve saate göre
// katalogdan çizilir. Ekranda açıkça "SİMÜLASYON" yazar; gerçek fotoğraf çözümüyle karışmaz.
// Görüş: bakılan yön (azimut, irtifa) etrafında gnomonik projeksiyon; telefonda pusula (DeviceOrientation) yönü çevirir.
import { gokCisimleri, ufukDonusturucu, type Konum } from './gezegen';
import { isikHesapla, olayEsle } from './isik';
import { yildizAdi, type Katalog } from './katalog';
import type { Sahne, SahneCisim, SahneTakim, SahneYildiz } from './sahne';

export interface Bakis { az: number; alt: number; /** yatay görüş açısı (derece) */ fov: number }

const RAD = Math.PI / 180;

/** (az, alt) → ekran: bakış yönü merkezde, sağa doğru azimut artar (güneye bakınca batı sağda) */
export function ufukProjeksiyonu(b: Bakis, W: number, H: number) {
  const f = W / 2 / Math.tan((b.fov / 2) * RAD);
  const a0 = b.az * RAD, h0 = b.alt * RAD;
  return (az: number, alt: number): { x: number; y: number } | null => {
    const a = az * RAD, h = alt * RAD;
    const cosc = Math.sin(h0) * Math.sin(h) + Math.cos(h0) * Math.cos(h) * Math.cos(a - a0);
    if (cosc <= 0.15) return null;
    const x = (Math.cos(h) * Math.sin(a - a0)) / cosc;
    const y = (Math.cos(h0) * Math.sin(h) - Math.sin(h0) * Math.cos(h) * Math.cos(a - a0)) / cosc;
    return { x: W / 2 + x * f, y: H / 2 - y * f };
  };
}

export interface SimSahne extends Sahne { proj: ReturnType<typeof ufukProjeksiyonu> }

/** Önbellek: aynı an ve konum için yatay koordinatlar bir kez hesaplanır (bakış değişince yalnızca projeksiyon) */
let onbellek: { anahtar: string; yildiz: { az: number; alt: number }[]; cizgi: Record<string, { az: number; alt: number }[][]>; cisim: ReturnType<typeof gokCisimleri> } | null = null;

export function simSahne(k: Katalog, t: Date, konum: Konum, b: Bakis, W: number, H: number): SimSahne {
  const anahtar = `${Math.round(t.getTime() / 20_000)}|${konum.lat.toFixed(3)}|${konum.lon.toFixed(3)}`;
  if (onbellek?.anahtar !== anahtar) {
    const u = ufukDonusturucu(t, konum);
    const hz = (ra: number, dec: number) => { const r = u(ra, dec); return { az: r.azimut, alt: r.irtifa }; };
    onbellek = {
      anahtar,
      yildiz: k.yildizlar.map(y => hz(y.ra, y.dec)),
      cizgi: Object.fromEntries(Object.values(k.takimyildizlar).map(tk => [tk.id, tk.cizgiler.map(c => c.map(([ra, dec]) => hz(ra, dec)))])),
      cisim: gokCisimleri(t, konum),
    };
  }
  const o = onbellek;
  const proj = ufukProjeksiyonu(b, W, H);
  const icinde = (p: { x: number; y: number }) => p.x > -20 && p.y > -20 && p.x < W + 20 && p.y < H + 20;

  const yildizlar: SahneYildiz[] = [];
  k.yildizlar.forEach((y, i) => {
    const h = o.yildiz[i];
    if (h.alt < -0.5) return;
    const p = proj(h.az, h.alt);
    if (!p || !icinde(p)) return;
    const isik = isikHesapla(y, t);
    yildizlar.push({
      hip: y.hip, ad: yildizAdi(y), adli: !!y.ad, tanim: y.tanim, tk: y.tk, tkAd: k.takimyildizlar[y.tk]?.ad ?? y.tk,
      x: p.x, y: p.y, kadir: y.kadir, renk: y.renk, ra: y.ra, dec: y.dec, isik, olay: isik ? olayEsle(isik, k.olaylar) : null,
    });
  });
  yildizlar.sort((a, b2) => a.kadir - b2.kadir);

  const takimyildizlar: SahneTakim[] = [];
  for (const tk of Object.values(k.takimyildizlar)) {
    const seg: SahneTakim['segmentler'] = [];
    const ic: { x: number; y: number }[] = [];
    for (const c of o.cizgi[tk.id]) for (let i = 1; i < c.length; i++) {
      if (c[i - 1].alt < 0 || c[i].alt < 0) continue;
      const a = proj(c[i - 1].az, c[i - 1].alt), bb = proj(c[i].az, c[i].alt);
      if (!a || !bb || (!icinde(a) && !icinde(bb))) continue;
      seg.push([a.x, a.y, bb.x, bb.y]);
      if (icinde(a)) ic.push(a);
    }
    if (seg.length < 2 || !ic.length) continue;
    takimyildizlar.push({ id: tk.id, ad: tk.ad, segmentler: seg, etiket: { x: ic.reduce((s, p) => s + p.x, 0) / ic.length, y: ic.reduce((s, p) => s + p.y, 0) / ic.length } });
  }

  const gorunenCisimler = o.cisim.filter(c => c.irtifa > 0);
  const cisimler: SahneCisim[] = [];
  for (const c of gorunenCisimler) { const p = proj(c.azimut, c.irtifa); if (p && icinde(p)) cisimler.push({ ...c, x: p.x, y: p.y }); }

  const vfov = (2 * Math.atan(Math.tan((b.fov / 2) * RAD) * (H / W))) / RAD;
  return {
    w: W, h: H, cekim: t.toISOString(), konum, merkez: { ra: NaN, dec: NaN }, alan: [b.fov, vfov],
    yildizlar, takimyildizlar, cisimler, gorunenCisimler, kaynak: k.kaynak, proj,
  };
}

const YON: [number, string][] = [[0, 'K'], [45, 'KD'], [90, 'D'], [135, 'GD'], [180, 'G'], [225, 'GB'], [270, 'B'], [315, 'KB']];

/** Gece göğü zemini, ufuk çizgisi, yer ve yön harfleri */
export function simZemin(ctx: CanvasRenderingContext2D, b: Bakis, W: number, H: number) {
  const proj = ufukProjeksiyonu(b, W, H);
  const zen = ctx.createLinearGradient(0, 0, 0, H);
  zen.addColorStop(0, '#02040b');
  zen.addColorStop(1, '#0a1626');
  ctx.fillStyle = zen;
  ctx.fillRect(0, 0, W, H);
  // Ufuk: bakış yönünün iki yanında
  const pts: { x: number; y: number }[] = [];
  for (let d = -90; d <= 90; d += 2) { const p = proj(b.az + d, 0); if (p) pts.push(p); }
  if (pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(pts.at(-1)!.x, H + 10);
    ctx.lineTo(pts[0].x, H + 10);
    ctx.closePath();
    ctx.fillStyle = 'rgba(3, 8, 6, 0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(77, 225, 255, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else if (b.alt < 0) { ctx.fillStyle = 'rgba(3, 8, 6, 0.96)'; ctx.fillRect(0, 0, W, H); }
  ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (const [az, ad] of YON) {
    const p = proj(az, 0);
    if (!p || p.x < 0 || p.x > W) continue;
    ctx.fillStyle = ad === 'K' ? '#ff8f8f' : 'rgba(77, 225, 255, 0.9)';
    ctx.fillText(ad, p.x, Math.min(H - 12, p.y + 22));
  }
  ctx.textAlign = 'start';
}

/** DeviceOrientation → arka kameranın baktığı yön. iOS'ta webkitCompassHeading, diğerlerinde mutlak alpha. */
export function yonelimdenBakis(e: DeviceOrientationEvent & { webkitCompassHeading?: number }): { az: number; alt: number } | null {
  if (e.beta == null || e.gamma == null) return null;
  const a = (e.alpha ?? 0) * RAD, bb = e.beta * RAD, g = e.gamma * RAD;
  // R = Rz(α)·Rx(β)·Ry(γ); kamera cihazın −z yönüne bakar → dünya çerçevesi (x doğu, y kuzey, z yukarı)
  const X = -Math.sin(g) * Math.cos(a) - Math.cos(g) * Math.sin(bb) * Math.sin(a);
  const Y = -Math.sin(g) * Math.sin(a) + Math.cos(g) * Math.sin(bb) * Math.cos(a);
  const Zu = -Math.cos(g) * Math.cos(bb);
  const alt = Math.asin(Math.max(-1, Math.min(1, Zu))) / RAD;
  let az: number;
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) az = e.webkitCompassHeading;
  else if (e.absolute || e.type === 'deviceorientationabsolute') az = ((Math.atan2(X, Y) / RAD) + 360) % 360;
  else return null; // pusulasız yönelim: kuzey bilinmez
  return { az, alt };
}
