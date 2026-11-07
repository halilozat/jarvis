// Gece Gökyüzü · el kontrolü (mevcut hands modülü: MediaPipe takip + jest tanıma). Kamera görüntüsü ekrana gelmez;
// yalnızca işaret parmağının ucu bir nişangâh olarak fotoğrafın üstünde görünür.
//   ☝️ işaret: en yakın yıldız vurgulanır · aynı yıldızda ~1 sn tut: bilgi kartı açılır
//   🤏 çimdik: o noktaya doğru yakınlaş · iki elle çimdik: aç/kapa ile yakınlaştır · ✋ 1 sn: görünümü ve kartı sıfırla
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { TrackedHand, type Gesture, type P } from '../hands/gestures';
import { detect, loadLandmarker, openCamera } from '../hands/tracker';

export interface ElDurumu { id: string; jest: Gesture; uc: P; cimdik: P; since: number }

export interface ElKaynagi { eller(now: number): ElDurumu[]; dur(): void }

/** Kamera + MediaPipe */
export async function kameraEli(video: HTMLVideoElement, boyut: () => { W: number; H: number }, durum: (s: string) => void): Promise<ElKaynagi> {
  const { lm } = await loadLandmarker(durum);
  durum('kamera açılıyor…');
  const stream = await openCamera(video);
  durum('');
  const takip = new Map<string, TrackedHand>();
  let son = performance.now(), sonTs = 0;
  return {
    eller(now) {
      if (video.readyState < 2) return [];
      const ts = Math.max(sonTs + 1, Math.round(now));
      sonTs = ts;
      const { W, H } = boyut();
      const ham = detect(lm as HandLandmarker, video, ts, W, H);
      const dt = Math.min(0.1, (now - son) / 1000);
      son = now;
      const out: ElDurumu[] = [];
      for (const h of ham) {
        let t = takip.get(h.id);
        if (!t) { t = new TrackedHand(h.id); takip.set(h.id, t); }
        t.update(h.pts, now, dt);
        out.push({ id: h.id, jest: t.gesture, uc: t.pts[8], cimdik: t.shape.pinchPt, since: t.since });
      }
      for (const [id, t] of takip) if (!ham.some(h => h.id === id) && now - t.lastSeen > 400) takip.delete(id);
      return out;
    },
    dur() { stream.getTracks().forEach(t => t.stop()); lm.close(); },
  };
}

/**
 * Demo eli (?gok=demo&isaret=demo): kamera olmadan aynı akış. Hedeflere sırayla gider, işaret edip bekler
 * (kart açılır), sonra çimdikle yakınlaşır ve açık elle sıfırlar.
 */
export function sentetikEl(hedefler: () => { x: number; y: number }[]): ElKaynagi {
  const t0 = performance.now();
  let konum: P = { x: 0, y: 0 };
  return {
    eller(now) {
      const h = hedefler();
      if (!h.length) return [];
      const t = (now - t0) / 1000;
      const adim = 6; // her hedef için saniye
      const i = Math.floor(t / adim) % h.length;
      const yerel = t % adim;
      const hedef = h[i];
      const onceki = h[(i + h.length - 1) % h.length];
      const k = Math.min(1, yerel / 1.2);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      konum = { x: onceki.x + (hedef.x - onceki.x) * e + Math.sin(t * 7) * 1.5, y: onceki.y + (hedef.y - onceki.y) * e + Math.cos(t * 6) * 1.5 };
      const jest: Gesture = yerel < 3.6 ? 'isaret' : yerel < 4.8 ? 'cimdik' : 'acik';
      const basla = now - (jest === 'isaret' ? yerel : jest === 'cimdik' ? yerel - 3.6 : yerel - 4.8) * 1000;
      return [{ id: 'demo', jest, uc: konum, cimdik: konum, since: basla }];
    },
    dur() {},
  };
}
