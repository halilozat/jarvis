// Ultron'un Gözü · kayıt modu HUD'u (2B tuval). Canlıda DOM paneli var; kayıtta aynı bilgiler tuvale çizilir (temiz plaka:
// altyazı yok). 9:16'da önemli öğeler alt ~350 px ve sağ ~120 px dışında.
import type { GozVeri } from '../api';
import { SATIRLAR, satirDurumu } from './satirlar';

export function gozHudCiz(g: CanvasRenderingContext2D, o: { w: number; h: number; t: number; veri: GozVeri; seviye: number; etiketler: { x: number; y: number; metin: string; tur: string }[]; font: string; acilis: number }) {
  const { w, h } = o;
  const dikey = h > w * 1.05;
  const s = Math.min(w, h) / 1080 * (dikey ? 1.1 : 1.2);
  g.clearRect(0, 0, w, h);
  g.textBaseline = 'middle';
  const yazi = (a: number, b: number) => `${a} ${Math.round(b * s)}px ${o.font}`;
  const gor = Math.min(1, Math.max(0, (o.acilis - 0.6) / 0.8));
  g.globalAlpha = gor;

  // Etiketler
  for (const e of o.etiketler) {
    g.font = yazi(e.tur === 'haber' ? 500 : 600, 15);
    const m = e.metin.length > 46 ? e.metin.slice(0, 45) + '…' : e.metin;
    const tw = g.measureText(m).width;
    const x = e.x + 10 * s, y = e.y - 22 * s;
    if (e.tur !== 'uydu') { g.fillStyle = 'rgba(30,8,2,0.72)'; g.fillRect(x, y - 13 * s, tw + 14 * s, 26 * s); g.fillStyle = e.tur === 'siber' ? '#ff3b1f' : '#ff6a1a'; g.fillRect(x, y - 13 * s, 3 * s, 26 * s); }
    g.fillStyle = e.tur === 'uydu' ? '#ffd27a' : e.tur === 'siber' ? '#ffb0a0' : '#ffe3d2';
    g.fillText(m, x + 8 * s, y);
  }

  // Başlık + reaktör
  const rx = (dikey ? 70 : 70) * s, ry = (dikey ? 120 : 64) * s;
  for (let i = 0; i < 3; i++) {
    g.save(); g.translate(rx, ry); g.rotate(o.t * (1.2 + i * 0.7) * (i % 2 ? -1 : 1));
    g.strokeStyle = ['#ff6a1a', '#ff3b1f', '#ffd27a'][i]; g.lineWidth = 2 * s; g.globalAlpha = gor * 0.8;
    g.beginPath(); g.arc(0, 0, (30 - i * 9) * s * (1 + o.seviye * 0.25), 0.4, Math.PI * 1.7); g.stroke(); g.restore();
  }
  g.globalAlpha = gor;
  const gr = g.createRadialGradient(rx, ry, 0, rx, ry, (14 + o.seviye * 12) * s);
  gr.addColorStop(0, '#fff2d8'); gr.addColorStop(0.5, '#ff6a1a'); gr.addColorStop(1, 'rgba(255,106,26,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(rx, ry, (14 + o.seviye * 12) * s, 0, Math.PI * 2); g.fill();
  g.textAlign = 'left';
  g.font = yazi(700, 30); g.fillStyle = '#ff6a1a'; g.shadowColor = 'rgba(255,106,26,0.6)'; g.shadowBlur = 18 * s;
  g.fillText("ULTRON'UN GÖZÜ", rx + 52 * s, ry - 10 * s); g.shadowBlur = 0;
  g.font = yazi(500, 15); g.fillStyle = 'rgba(255,160,110,0.75)';
  g.fillText(`CANLI VERİ · ${new Date(o.veri.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`, rx + 52 * s, ry + 20 * s);

  // Katman paneli: 16:9 sağda sütun; 9:16 üstte iki sütun (sağ 120 px boş)
  const bw = dikey ? (w - 32 * s - 120 * s - 10 * s) / 2 : 360 * s, bh = 54 * s;
  SATIRLAR.forEach((sa, i) => {
    const d = satirDurumu(sa, o.veri);
    const x = dikey ? 16 * s + (i % 2) * (bw + 10 * s) : w - bw - 30 * s;
    const y = dikey ? 190 * s + Math.floor(i / 2) * (bh + 8 * s) : 40 * s + i * (bh + 8 * s);
    const k = Math.min(1, Math.max(0, (o.acilis - 1.2 - i * 0.25) / 0.5));
    g.globalAlpha = gor * k * (d.durum === 'yok' ? 0.5 : 1);
    g.fillStyle = 'rgba(28,8,2,0.66)'; g.fillRect(x, y, bw, bh);
    g.fillStyle = d.durum === 'yok' ? '#555' : '#ff6a1a'; g.fillRect(x, y, 3 * s, bh);
    g.font = yazi(600, 13); g.fillStyle = d.durum === 'yok' ? '#999' : 'rgba(255,160,110,0.85)'; g.textAlign = 'left';
    g.fillText(sa.ad.toLocaleUpperCase('tr'), x + 14 * s, y + 17 * s);
    g.font = yazi(500, 11); g.fillStyle = 'rgba(255,180,140,0.55)'; g.fillText(d.etiket.slice(0, dikey ? 26 : 40), x + 14 * s, y + 38 * s);
    g.textAlign = 'right'; g.font = yazi(700, d.durum === 'yok' ? 14 : 22); g.fillStyle = d.durum === 'yok' ? '#9a9a9a' : '#fff1e6';
    g.fillText(d.deger, x + bw - 12 * s, y + 22 * s);
  });
  g.globalAlpha = 1; g.textAlign = 'left';
}
