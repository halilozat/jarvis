// Haber Modu · jestler. Eller her karede buraya gelir; çıkan olayları sahne (scene.ts) uygular.
//   ✋ yana savur → karusel döner · ✋ dikey savur → kategori (karuselde) / geri (detayda, yukarı)
//   ☝️ işaret → üstündeki kart vurgulanır · 🤏 kartı tut ve kendine çek → detay
//   🤏🤏 iki elle tut, yana aç → kaynak karşılaştırması · 🤏🤏 elleri ters yönde yukarı-aşağı ("terazi") → iddia kontrolü
//   👍 1 sn → Jarvis özetler · ✊ 1 sn → kartı kapat / sesi kes · ✌️ → mikrofon
// Savurma eşiği el büyüklüğüyle ölçeklenir (kameraya yakın el daha hızlı görünür).
import type { HoldState } from '../fx';
import type { P, TrackedHand } from '../gestures';

export type JestOlay =
  | { tip: 'savur'; yon: 'sag' | 'sol' | 'yukari' | 'asagi'; hiz: number }
  | { tip: 'isaret'; p: P | null }
  | { tip: 'tut'; p: P; id: string }
  | { tip: 'cek'; p: P }
  | { tip: 'birak' }
  | { tip: 'yelpaze' }
  | { tip: 'terazi' }
  | { tip: 'basparmak' }
  | { tip: 'yumruk' }
  | { tip: 'mikrofon' };

const HOLD_MS = 1000;
const MIC_MS = 600;
const SAVUR_BEKLE = 520;

interface ElDurum {
  savurAt: number;
  tutBas: { p: P; size: number; at: number } | null;
  cekildi: boolean;
  holdFired: number;
}

export class HaberJest {
  private el = new Map<string, ElDurum>();
  /** İki elle tutuş: başlangıç uzaklığı ve terazi salınımı */
  private cift: { d0: number; at: number; isaret: number; gecis: number; tepe: number; bitti: boolean } | null = null;
  H = 1080;

  private durum(id: string): ElDurum {
    let d = this.el.get(id);
    if (!d) { d = { savurAt: 0, tutBas: null, cekildi: false, holdFired: -1 }; this.el.set(id, d); }
    return d;
  }

  update(hands: TrackedHand[], now: number, holds: HoldState[]): JestOlay[] {
    const out: JestOlay[] = [];
    for (const id of [...this.el.keys()]) if (!hands.some(h => h.id === id)) this.el.delete(id);
    const pinching = hands.filter(h => h.gesture === 'cimdik');

    // 🤏🤏 iki elle: yelpaze (yana açılma) ya da terazi (ters yönde dikey salınım)
    if (pinching.length === 2) {
      const [a, b] = pinching;
      const pa = a.shape.pinchPt, pb = b.shape.pinchPt;
      const d = Math.abs(pa.x - pb.x), dy = pa.y - pb.y;
      const sz = (a.shape.size + b.shape.size) / 2;
      if (!this.cift) this.cift = { d0: d, at: now, isaret: Math.sign(dy) || 1, gecis: 0, tepe: Math.abs(dy), bitti: false };
      const c = this.cift;
      if (!c.bitti) {
        // Terazi: dikey fark işaret değiştirir (en az iki geçiş), her geçişte genlik el büyüklüğünün yarısını aşar
        const s = Math.sign(dy);
        c.tepe = Math.max(c.tepe, Math.abs(dy));
        if (s && s !== c.isaret && c.tepe > sz * 0.45) { c.gecis++; c.isaret = s; c.tepe = 0; }
        if (c.gecis >= 2 && now - c.at < 4000) { c.bitti = true; out.push({ tip: 'terazi' }); }
        // Yelpaze: eller yatayda açıldı, dikey salınım yok
        else if (d - c.d0 > Math.max(sz * 1.4, this.H * 0.18) && c.gecis === 0) { c.bitti = true; out.push({ tip: 'yelpaze' }); }
      }
      for (const h of pinching) this.durum(h.id).tutBas = null;
    } else this.cift = null;

    for (const h of hands) {
      const d = this.durum(h.id);
      const sz = h.shape.size;
      // ✋ savurma: açık el, hızı el büyüklüğüne göre
      if (h.gesture === 'acik' && now - d.savurAt > SAVUR_BEKLE) {
        const vx = h.vel.x, vy = h.vel.y, esik = Math.max(700, sz * 9);
        if (Math.abs(vx) > esik && Math.abs(vx) > Math.abs(vy) * 1.5) { d.savurAt = now; out.push({ tip: 'savur', yon: vx > 0 ? 'sag' : 'sol', hiz: Math.abs(vx) / esik }); }
        else if (Math.abs(vy) > esik && Math.abs(vy) > Math.abs(vx) * 1.5) { d.savurAt = now; out.push({ tip: 'savur', yon: vy > 0 ? 'asagi' : 'yukari', hiz: Math.abs(vy) / esik }); }
      }
      // ☝️ işaret parmağı ucu
      if (h.gesture === 'isaret') out.push({ tip: 'isaret', p: h.pts[8] });
      // 🤏 tek elle tut ve çek (kendine: el büyür ya da aşağı iner)
      if (h.gesture === 'cimdik' && pinching.length === 1) {
        const p = h.shape.pinchPt;
        if (!d.tutBas) { d.tutBas = { p, size: sz, at: now }; d.cekildi = false; out.push({ tip: 'tut', p, id: h.id }); }
        else if (!d.cekildi && (sz > d.tutBas.size * 1.15 || p.y - d.tutBas.p.y > Math.max(sz * 0.9, this.H * 0.1))) { d.cekildi = true; out.push({ tip: 'cek', p }); }
      } else if (d.tutBas) { d.tutBas = null; out.push({ tip: 'birak' }); }
      // Basılı tutma: 👍 1 sn · ✊ 1 sn · ✌️ 0,6 sn
      const sure = h.gesture === 'basparmak' || h.gesture === 'yumruk' ? HOLD_MS : h.gesture === 'zafer' ? MIC_MS : 0;
      if (sure && d.holdFired !== h.since) {
        const pr = (now - h.since - 120) / sure;
        if (pr >= 1) {
          d.holdFired = h.since;
          out.push({ tip: h.gesture === 'basparmak' ? 'basparmak' : h.gesture === 'yumruk' ? 'yumruk' : 'mikrofon' });
        } else if (pr > 0) {
          holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: sz * 1.1, p: pr, label: h.gesture === 'basparmak' ? '👍 ÖZETLE' : h.gesture === 'yumruk' ? '✊ KAPAT' : '🎙 DİNLE', done: 0 });
        }
      }
    }
    if (!hands.some(h => h.gesture === 'isaret')) out.push({ tip: 'isaret', p: null });
    return out;
  }
}
