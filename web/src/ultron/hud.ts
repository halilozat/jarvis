// Ultron Paketi · 2B üst katman (HUD): uyarı, "ERİŞİM REDDEDİLDİ", sistem bütünlüğü, sekme etiketleri, parola, flaş.
// Canlıda ve kayıtta aynı çizim (deterministik). Kayıtta uygulama arkada olmadığından sekmelerin kopyası çizilir.
// Kayıt "temiz plaka"dır: altyazı yok.
import { karma, SEKMELER, type Durum, type SekmeAd } from './zaman';

export interface HudSecenek {
  w: number; h: number; olcek: number; font: string;
  kayit: boolean; kutular: Record<SekmeAd, DOMRect[]> | null; altyazi: boolean;
  parola?: { metin: string; yazilan: string; dinliyor: boolean } | null;
}
const TURUNCU = '#ff6a1a', KIRMIZI = '#ff3b1f', MAVI = '#3db4ff';
const AD: Record<SekmeAd, string> = { haber: 'HABER', bekci: 'BEKÇİ', ev: 'AKILLI EV', toplanti: 'FRIDAY' };

export function hudCiz(g: CanvasRenderingContext2D, d: Durum, o: HudSecenek) {
  const { w, h } = o, s = o.olcek;
  const dikey = h > w * 1.05;
  g.clearRect(0, 0, w, h);
  g.textBaseline = 'middle';
  const yazi = (agirlik: number, boy: number) => `${agirlik} ${Math.round(boy * s)}px ${o.font}`;
  const kare = Math.floor(d.t * 30);

  // Uyarı (yazı makinesi gibi)
  if (d.uyari) {
    const metin = '⚠ ' + d.uyari.metin;
    const n = Math.min(metin.length, Math.floor(d.uyari.yas * 34));
    const a = Math.min(1, d.uyari.yas * 4) * (1 - Math.max(0, d.uyari.yas - 3.8) / 0.7);
    g.save(); g.globalAlpha = a;
    g.font = yazi(700, dikey ? 34 : 30);
    const tw = g.measureText(metin).width + 56 * s;
    const x = (w - tw) / 2, y = h * (dikey ? 0.21 : 0.13);
    const yanip = Math.floor(d.uyari.yas * 3) % 2 === 0;
    g.fillStyle = 'rgba(40,6,2,0.78)'; g.fillRect(x, y - 34 * s, tw, 68 * s);
    g.strokeStyle = yanip ? KIRMIZI : TURUNCU; g.lineWidth = 3 * s; g.strokeRect(x, y - 34 * s, tw, 68 * s);
    g.fillStyle = '#ffd7c2'; g.fillText(metin.slice(0, n) + (n < metin.length && yanip ? '▌' : ''), x + 28 * s, y + 2 * s);
    g.restore();
  }

  // ERİŞİM REDDEDİLDİ damgaları
  d.reddedildi.forEach((yas, i) => {
    const k = Math.min(1, yas / 0.12);
    const a = (1 - Math.max(0, yas - 0.9) / 0.7) * (karma(kare, i + 40) > 0.15 ? 1 : 0.4);
    const olc = 1.35 - 0.35 * k;
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.translate(w * (dikey ? 0.5 : 0.36), h * (dikey ? 0.38 : 0.5) + (i - 1) * 78 * s);
    g.rotate(-0.04 + i * 0.03); g.scale(olc, olc);
    g.font = yazi(800, dikey ? 46 : 40);
    const tw = g.measureText('ERİŞİM REDDEDİLDİ').width + 40 * s;
    g.fillStyle = 'rgba(60,0,0,0.55)'; g.fillRect(-tw / 2, -32 * s, tw, 64 * s);
    g.strokeStyle = KIRMIZI; g.lineWidth = 4 * s; g.strokeRect(-tw / 2, -32 * s, tw, 64 * s);
    g.fillStyle = '#ff5a4a'; g.textAlign = 'center'; g.fillText('ERİŞİM REDDEDİLDİ', 0, 2 * s);
    g.restore();
  });

  // Sistem bütünlüğü
  if (d.butunluk != null) {
    const v = d.butunluk;
    const x = dikey ? w / 2 - 190 * s : 54 * s, y = dikey ? 92 * s : 66 * s, bw = 380 * s;
    const renk = v > 70 ? MAVI : v > 40 ? TURUNCU : KIRMIZI;
    const yanip = v <= 40 && Math.floor(d.t * 4) % 2 === 0;
    g.save();
    g.font = yazi(600, 20); g.fillStyle = 'rgba(220,240,255,0.85)'; g.textAlign = 'left';
    g.fillText('SİSTEM BÜTÜNLÜĞÜ', x, y);
    g.textAlign = 'right'; g.fillStyle = yanip ? '#fff' : renk; g.font = yazi(800, 26); g.fillText(`%${v}`, x + bw, y);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y + 18 * s, bw, 12 * s);
    g.fillStyle = renk; g.shadowColor = renk; g.shadowBlur = 14 * s; g.fillRect(x, y + 18 * s, (bw * v) / 100, 12 * s);
    g.restore();
  }

  // Sekmeler
  if (o.kayit || !o.kutular) kopyaSekmeler(g, d, o, dikey);
  else for (const sk of SEKMELER) {
    const { ele, glitch } = d.sekme[sk];
    if (ele <= 0.01) continue;
    for (const r of o.kutular[sk]) {
      const gx = (karma(kare, sk.length) - 0.5) * 16 * glitch * s;
      g.save(); g.globalAlpha = ele;
      g.strokeStyle = TURUNCU; g.lineWidth = 2 * s; g.shadowColor = TURUNCU; g.shadowBlur = 16 * s;
      g.strokeRect(r.x - 3 + gx, r.y - 3, r.width + 6, r.height + 6);
      g.shadowBlur = 0; g.font = yazi(800, 13); g.fillStyle = TURUNCU;
      const ty = r.y > 24 * s ? r.y - 12 * s : r.bottom + 12 * s;
      g.textAlign = 'center'; g.fillText('ULTRON', r.x + r.width / 2 + gx, ty);
      g.restore();
    }
  }

  // Final B: parola
  if (d.parolaBekle && o.parola) {
    g.save(); g.textAlign = 'center';
    g.font = yazi(700, 30); g.fillStyle = '#9fe6ff'; g.fillText('KAPATMA PAROLASI BEKLENİYOR', w / 2, h * 0.7);
    g.font = yazi(500, 20); g.fillStyle = 'rgba(200,235,255,0.75)';
    g.fillText(o.parola.dinliyor ? 'Söyleyin ya da yazıp Enter’a basın' : 'Yazıp Enter’a basın', w / 2, h * 0.7 + 40 * s);
    if (o.parola.yazilan) { g.font = yazi(700, 26); g.fillStyle = '#fff'; g.fillText(o.parola.yazilan, w / 2, h * 0.7 + 84 * s); }
    g.restore();
  }

  // Altyazı (yalnız canlıda ve ses yoksa; kayıt temiz plakadır)
  if (o.altyazi && !o.kayit && d.altyazi) {
    g.save(); g.textAlign = 'center';
    const y = dikey ? h - 400 * s : h * 0.9;
    g.font = yazi(700, 24); g.fillStyle = d.altyazi.kim === 'ultron' ? TURUNCU : MAVI;
    g.fillText(d.altyazi.kim === 'ultron' ? 'ULTRON' : 'JARVIS', w / 2, y - 34 * s);
    g.font = yazi(500, 28); g.fillStyle = '#f2f6fa'; g.fillText(d.altyazi.metin, w / 2, y);
    g.restore();
  }

  if (d.flas > 0.001) { g.fillStyle = `rgba(255,246,235,${(d.flas * 0.85).toFixed(3)})`; g.fillRect(0, 0, w, h); }
}

/** Kayıtta (ve sekme bulunamazsa) sekmelerin kopyası: 16:9 sağ sütun, 9:16 üst satır (güvenli alanın içinde) */
function kopyaSekmeler(g: CanvasRenderingContext2D, d: Durum, o: HudSecenek, dikey: boolean) {
  if (d.vurus < 4 && d.tema <= 0) return;
  const s = o.olcek, kare = Math.floor(d.t * 30);
  const gor = Math.min(1, d.vurus >= 4 ? 1 : 0) * (d.kure > 0.5 ? 1 - (d.kure - 0.5) * 2 : 1);
  if (gor <= 0) return;
  SEKMELER.forEach((sk, i) => {
    const { ele, glitch } = d.sekme[sk];
    const bw = (dikey ? 172 : 210) * s, bh = 54 * s;
    const x = dikey ? (o.w - 120 * s - (4 * bw + 3 * 12 * s)) / 2 + i * (bw + 12 * s) : o.w - bw - 150 * s; // 9:16: sağ ~120 px boş
    const y = dikey ? 160 * s : o.h * 0.26 + i * (bh + 18 * s);
    const gx = (karma(kare, i + 60) - 0.5) * 18 * glitch * s;
    g.save(); g.globalAlpha = gor;
    g.fillStyle = ele > 0.5 ? 'rgba(60,18,4,0.7)' : 'rgba(4,20,36,0.7)'; g.fillRect(x + gx, y, bw, bh);
    g.strokeStyle = ele > 0.5 ? TURUNCU : MAVI; g.lineWidth = 2 * s; g.shadowColor = g.strokeStyle as string; g.shadowBlur = 12 * s * Math.max(0.3, ele);
    g.strokeRect(x + gx, y, bw, bh);
    g.shadowBlur = 0; g.font = `700 ${Math.round(20 * s)}px ${o.font}`; g.fillStyle = ele > 0.5 ? '#ffb48a' : '#bfe9ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(AD[sk], x + bw / 2 + gx, y + bh / 2);
    if (ele > 0.5) { g.font = `800 ${Math.round(12 * s)}px ${o.font}`; g.fillStyle = TURUNCU; g.fillText('ULTRON', x + bw / 2, y - 12 * s); }
    g.restore();
  });
}
