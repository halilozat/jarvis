// El Kontrolü · yüz HUD kilidi: kamera yüzü bulunca etrafında hedef çerçevesi ve "AD · TANINDI · YETKİ: TAM".
// ÖNEMLİ: Bu yüz TANIMA değil, yüz ALGILAMA (MediaPipe BlazeFace). Kim olduğunu bilmez; biyometrik veri yok, kare
// hiçbir yere gitmez. Etiket yalnızca kameraya en yakın (en büyük) yüze verilir; kadrajdaki diğer yüzler
// "KİŞİ · TANIMLANMADI" olarak işaretlenir, böylece bir misafir kullanıcının adıyla etiketlenmez.
import type { FaceDetector } from '@mediapipe/tasks-vision';
import { makeMapper } from './tracker';

const LOCAL_MODEL = '/models/blaze_face_short_range.tflite';
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const WASM = '/mediapipe/wasm';

export interface FaceBox { x: number; y: number; w: number; h: number; score: number; nose: { x: number; y: number } | null }

async function modelPath(): Promise<string> {
  try {
    const r = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) return LOCAL_MODEL;
  } catch { /* yerel yok */ }
  return REMOTE_MODEL;
}

export async function loadFaceDetector(): Promise<FaceDetector> {
  const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks(WASM);
  const path = await modelPath();
  const make = (delegate: 'GPU' | 'CPU') =>
    FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.6 });
  try { return await make('GPU'); } catch { return make('CPU'); }
}

/** Yüzler ekran pikselinde (ayna ve object-fit: cover hesaba katılır), büyükten küçüğe */
export function detectFaces(det: FaceDetector, video: HTMLVideoElement, ts: number, W: number, H: number): FaceBox[] {
  const vw = video.videoWidth, vh = video.videoHeight;
  const map = makeMapper(vw, vh, W, H);
  const res = det.detectForVideo(video, ts);
  return res.detections
    .map(d => {
      const b = d.boundingBox!;
      const a = map(b.originX / vw, b.originY / vh), c = map((b.originX + b.width) / vw, (b.originY + b.height) / vh);
      const nose = d.keypoints?.[2] ? map(d.keypoints[2].x, d.keypoints[2].y) : null;
      return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y), score: d.categories?.[0]?.score ?? 0, nose };
    })
    .sort((p, q) => q.w * q.h - p.w * p.h);
}

/** Kamerasız demo: ekranın üst ortasında hafifçe gezinen sahte yüz */
export function demoFace(t: number, W: number, H: number): FaceBox[] {
  const s = Math.min(W, H) * 0.26;
  const cx = W / 2 + Math.sin(t * 0.6) * W * 0.06, cy = H * 0.36 + Math.cos(t * 0.45) * H * 0.03;
  // 9 sn'de bir kısa kayıp: yeniden kilitlenme animasyonu da görünsün
  if (t % 9 > 8.2) return [];
  return [{ x: cx - s / 2, y: cy - s * 0.6, w: s, h: s * 1.2, score: 0.97, nose: { x: cx, y: cy } }];
}

// ---------------------------------------------------------------- Çizim

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

interface Track { x: number; y: number; w: number; h: number; score: number; nose: { x: number; y: number } | null; since: number; seen: number; locked: boolean }

/**
 * Hedef kilidi: köşe parantezleri geniş bir kareden yüze kapanır (0,7 sn), amber "KİLİTLENİYOR" → mavi-beyaz
 * "TANINDI". Dönen kesikli halka, nişan çizgileri, burun ucunda hedef noktası ve daktiloyla yazılan etiket.
 */
export class FaceHud {
  private g: CanvasRenderingContext2D;
  private W = 0; private H = 0; private dpr = 1;
  private main: Track | null = null;
  private others: FaceBox[] = [];
  onLock: (() => void) | null = null;
  label: string;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, name: string) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.label = `${(name || 'KULLANICI').toLocaleUpperCase('tr')} · TANINDI · YETKİ: TAM`;
  }

  resize(W: number, H: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
  }

  /** F ile kapatılınca: kilidi bırak, katmanı temizle */
  clear() {
    this.main = null;
    this.others = [];
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Yeni algılama (her karede değil; arada son kutu yumuşatılarak kullanılır) */
  update(faces: FaceBox[], now: number) {
    const f = faces[0];
    this.others = faces.slice(1, 4);
    if (!f) return;
    const m = this.main;
    // Aynı yüz mü (merkez yakın)? Değilse kilit baştan
    if (m && now - m.seen < 700 && Math.hypot(m.x + m.w / 2 - (f.x + f.w / 2), m.y + m.h / 2 - (f.y + f.h / 2)) < Math.max(m.w, f.w) * 0.8) {
      const k = 0.45;
      m.x = lerp(m.x, f.x, k); m.y = lerp(m.y, f.y, k); m.w = lerp(m.w, f.w, k); m.h = lerp(m.h, f.h, k);
      m.nose = f.nose && m.nose ? { x: lerp(m.nose.x, f.nose.x, k), y: lerp(m.nose.y, f.nose.y, k) } : f.nose;
      m.score = f.score; m.seen = now;
    } else {
      this.main = { ...f, since: now, seen: now, locked: false };
    }
  }

  render(now: number) {
    const g = this.g, { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const m = this.main;
    if (m && now - m.seen > 900) this.main = null;
    for (const o of this.others) this.drawOther(o);
    if (!this.main) return;

    const t = (now - m!.since) / 1000;
    const lockK = ease(t / 0.7);
    if (!m!.locked && lockK >= 1) { m!.locked = true; this.onLock?.(); }
    const fade = Math.max(0, 1 - Math.max(0, now - m!.seen - 300) / 600);
    const locked = m!.locked;
    const col = (a: number) => (locked ? `rgba(150,230,255,${a * fade})` : `rgba(255,190,90,${a * fade})`);
    const cx = m!.x + m!.w / 2, cy = m!.y + m!.h / 2;
    const half = Math.max(m!.w, m!.h) / 2 * lerp(1.9, 1.18, lockK);
    g.lineCap = 'square';

    // Köşe parantezleri
    const L = half * 0.32;
    g.strokeStyle = col(0.95);
    g.lineWidth = 2.5;
    g.shadowColor = col(0.9);
    g.shadowBlur = 12;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * half, y = cy + sy * half;
      g.beginPath();
      g.moveTo(x - sx * L, y); g.lineTo(x, y); g.lineTo(x, y - sy * L);
      g.stroke();
    }
    g.shadowBlur = 0;

    // Dönen kesikli halka + tikler
    const R = half * 1.08;
    g.save();
    g.translate(cx, cy);
    g.rotate(now / 1400);
    g.setLineDash([R * 0.08, R * 0.05]);
    g.lineWidth = 1.2;
    g.strokeStyle = col(locked ? 0.45 : 0.3);
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2 * lockK); g.stroke();
    g.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.moveTo(R + 4, 0); g.lineTo(R + 14, 0); g.stroke();
    }
    g.restore();

    // Nişan çizgileri (yatay, çerçevenin dışına)
    g.strokeStyle = col(0.5);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - half - 40, cy); g.lineTo(cx - half - 8, cy);
    g.moveTo(cx + half + 8, cy); g.lineTo(cx + half + 40, cy);
    g.stroke();

    // Burun ucunda hedef noktası
    if (m!.nose) {
      g.fillStyle = col(0.9);
      g.beginPath(); g.arc(m!.nose.x, m!.nose.y, 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = col(0.5);
      g.beginPath(); g.arc(m!.nose.x, m!.nose.y, 9 + 3 * Math.sin(now / 200), 0, Math.PI * 2); g.stroke();
    }

    // Etiket: çerçevenin sağında (sığmazsa solunda), kılavuz çizgiyle
    const right = cx + half + 220 < W;
    const lx = right ? cx + half + 26 : cx - half - 26;
    const ly = cy - half + 10;
    g.strokeStyle = col(0.7);
    g.beginPath(); g.moveTo(right ? cx + half : cx - half, cy - half); g.lineTo(lx, ly); g.lineTo(lx + (right ? 14 : -14), ly); g.stroke();
    const main = locked ? this.label : 'HEDEF · KİLİTLENİYOR';
    const typed = locked ? main.slice(0, Math.floor((t - 0.7) * 38) + 1) : main;
    g.textAlign = right ? 'left' : 'right';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.max(15, Math.min(22, W / 70))}px Rajdhani, "JetBrains Mono", sans-serif`;
    g.fillStyle = col(1);
    g.shadowColor = col(0.8);
    g.shadowBlur = 10;
    const tx = lx + (right ? 20 : -20);
    g.fillText(typed + (locked && typed.length < main.length ? '▌' : ''), tx, ly);
    g.shadowBlur = 0;
    g.font = `500 ${Math.max(11, Math.min(13, W / 110))}px "JetBrains Mono", monospace`;
    g.fillStyle = col(0.7);
    g.fillText(`YÜZ KİLİDİ · GÜVEN %${Math.round(m!.score * 100)}`, tx, ly + 22);
  }

  private drawOther(o: FaceBox) {
    const g = this.g;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, half = Math.max(o.w, o.h) / 2 * 1.15, L = half * 0.28;
    g.strokeStyle = 'rgba(200,210,220,0.5)';
    g.lineWidth = 1.2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * half, y = cy + sy * half;
      g.beginPath(); g.moveTo(x - sx * L, y); g.lineTo(x, y); g.lineTo(x, y - sy * L); g.stroke();
    }
    g.font = '500 12px "JetBrains Mono", monospace';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(200,210,220,0.7)';
    g.fillText('KİŞİ · TANIMLANMADI', cx, cy + half + 16);
  }
}
