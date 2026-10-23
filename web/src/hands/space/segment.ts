// Uzay Modu · sizi odadan ayırma (tam uzay arka planı). MediaPipe ImageSegmenter, selfie_segmenter_landscape modeli
// (144×256, görüntülü görüşme gibi yatay kareler için), VIDEO modu. Görüntü tarayıcıda işlenir, hiçbir yere gitmez.
//
// Kamera görüntüsü kopyalanmaz (kendi <video> katmanında, ekran kartında kalır). Yıldız katmanı videonun üstündedir;
// kişi maskesiyle yıldızlarda bir "delik" açılır, siz o delikten görünürsünüz. Model 256 px'e küçültülmüş kareyle
// çalışır (her 2 karede bir); küçük maske zamanla yumuşatılır (titreme olmaz), hafifçe bulanıklaştırılır ve ekrana
// büyütülürken kenarı kendiliğinden tüylenir. (Videoyu tuvale filtreyle çizmek kare başına ~50 ms sürüyordu.)
import type { ImageSegmenter } from '@mediapipe/tasks-vision';

const LOCAL_MODEL = '/models/selfie_segmenter_landscape.tflite';
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';
const WASM = '/mediapipe/wasm';
const IN_W = 256;

async function modelPath(): Promise<string> {
  try {
    const r = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) return LOCAL_MODEL;
  } catch { /* yerel yok */ }
  return REMOTE_MODEL;
}

export async function loadSegmenter(): Promise<ImageSegmenter> {
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks(WASM);
  const path = await modelPath();
  const make = (delegate: 'GPU' | 'CPU') =>
    ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: path, delegate }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
  try { return await make('GPU'); } catch { return make('CPU'); }
}

export class PersonCutout {
  private seg: ImageSegmenter;
  private mask: Float32Array | null = null;
  private tmp: Float32Array | null = null;
  private mw = 0; private mh = 0;
  private maskCanvas = document.createElement('canvas');
  private maskCtx = this.maskCanvas.getContext('2d')!;
  private maskImg: ImageData | null = null;
  private inCanvas = document.createElement('canvas');
  private inCtx = this.inCanvas.getContext('2d')!;
  private frame = 0;
  private lastT = -1;
  private vw = 0; private vh = 0;
  /** Maske hazır (ilk sonuç geldi) */
  ready = false;

  constructor(seg: ImageSegmenter) { this.seg = seg; }

  /** Yeni kamera karesi geldiyse (2 karede bir) maskeyi güncelle */
  update(video: HTMLVideoElement, now: number) {
    if (video.readyState < 2 || !video.videoWidth || video.currentTime === this.lastT) return;
    this.lastT = video.currentTime;
    if (this.frame++ % 2) return;
    this.vw = video.videoWidth; this.vh = video.videoHeight;
    const iw = IN_W, ih = Math.round((IN_W * video.videoHeight) / video.videoWidth);
    if (this.inCanvas.width !== iw || this.inCanvas.height !== ih) { this.inCanvas.width = iw; this.inCanvas.height = ih; }
    this.inCtx.drawImage(video, 0, 0, iw, ih);
    try {
      this.seg.segmentForVideo(this.inCanvas, now, res => {
        const ms = res.confidenceMasks;
        if (!ms?.length) return;
        // Selfie modeli tek maske döndürür: kişi olasılığı (portreyle denendi: kişi 0,91, arka plan 0). İki gelirse 1 = kişi.
        const m = ms.length > 1 ? ms[1] : ms[0];
        const data = m.getAsFloat32Array();
        if (!this.mask || this.mw !== m.width || this.mh !== m.height) {
          this.mw = m.width; this.mh = m.height;
          this.mask = new Float32Array(data);
          this.tmp = new Float32Array(data.length);
          this.maskCanvas.width = m.width; this.maskCanvas.height = m.height;
          this.maskImg = this.maskCtx.createImageData(m.width, m.height);
        } else {
          // Zamanla yumuşatma: titreme olmasın
          const a = this.mask;
          for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.45 + data[i] * 0.55;
        }
        this.paint();
        this.ready = true;
      });
    } catch (e) { console.warn('[uzay] segmentasyon', e); }
  }

  /** Maske → alfa (yumuşak eşik) → küçük kutu bulanıklığı (kenar tüyü) */
  private paint() {
    const m = this.mask!, t = this.tmp!, W = this.mw, H = this.mh;
    for (let i = 0; i < m.length; i++) { const v = m[i]; t[i] = v <= 0.3 ? 0 : v >= 0.7 ? 1 : (v - 0.3) / 0.4; }
    const d = this.maskImg!.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const l = t[i - (x > 0 ? 1 : 0)], r = t[i + (x < W - 1 ? 1 : 0)];
        const u = t[i - (y > 0 ? W : 0)], b = t[i + (y < H - 1 ? W : 0)];
        d[i * 4 + 3] = Math.round(((t[i] * 2 + l + r + u + b) / 6) * 255);
      }
    }
    this.maskCtx.putImageData(this.maskImg!, 0, 0);
  }

  /** Yıldız katmanında kişinin olduğu yere delik aç (video ile aynı yerleşim: object-fit: cover + ayna) */
  punch(g: CanvasRenderingContext2D, W: number, H: number) {
    if (!this.ready || !this.vw) return;
    const s = Math.max(W / this.vw, H / this.vh);
    const dw = this.vw * s, dh = this.vh * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.translate(W, 0); g.scale(-1, 1);
    g.drawImage(this.maskCanvas, ox, oy, dw, dh);
    g.restore();
  }

  close() { this.seg.close(); }
}
