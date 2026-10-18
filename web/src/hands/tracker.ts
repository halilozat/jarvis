// El Kontrolü · kamera ve MediaPipe el takibi. Tamamen tarayıcıda çalışır; kare sunucuya gitmez.
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { P } from './gestures';

/** Model önce yerelden (npm run el-modeli ile indirilmişse), yoksa Google'ın sunucusundan */
const LOCAL_MODEL = '/models/hand_landmarker.task';
const REMOTE_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
/** wasm dosyaları vite.config.ts'teki eklentiyle node_modules'tan sunulur */
const WASM = '/mediapipe/wasm';

export interface RawHand { id: string; pts: P[]; score: number }

export interface CameraInfo { deviceId: string; label: string }

export async function listCameras(): Promise<CameraInfo[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
  } catch { return []; }
}

export async function openCamera(video: HTMLVideoElement, deviceId?: string): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
      width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch (e) {
    // "play() request was interrupted by a new load request": aynı video öğesine başka bir akış bağlandı (bileşen
    // ikinci kez başladı ya da kamera değişti). Bu bir kamera hatası değil; akışı yine döndür, çağıran karar versin.
    if ((e as Error)?.name !== 'AbortError') { stream.getTracks().forEach(t => t.stop()); throw e; }
    return stream;
  }
  if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
  return stream;
}

async function modelPath(): Promise<string> {
  try {
    const r = await fetch(LOCAL_MODEL, { method: 'HEAD' });
    const type = r.headers.get('content-type') || '';
    // Vite bilinmeyen yolda index.html döndürür: gerçekten model mi diye bak
    if (r.ok && !type.includes('text/html')) return LOCAL_MODEL;
  } catch { /* yerel yok */ }
  return REMOTE_MODEL;
}

export async function loadLandmarker(onStatus?: (s: string) => void): Promise<{ lm: HandLandmarker; delegate: 'GPU' | 'CPU' }> {
  onStatus?.('el takip modeli yükleniyor…');
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks(WASM);
  const path = await modelPath();
  const make = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: path, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return { lm: await make('GPU'), delegate: 'GPU' };
  } catch (e) {
    console.warn('[el] GPU açılamadı, CPU ile devam', e);
    return { lm: await make('CPU'), delegate: 'CPU' };
  }
}

/** Videodaki normalize noktayı (0..1) ekran pikseline çevirir: object-fit: cover + ayna */
export function makeMapper(vw: number, vh: number, W: number, H: number, mirror = true) {
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  return (u: number, v: number): P => {
    const x = ox + u * dw;
    return { x: mirror ? W - x : x, y: oy + v * dh };
  };
}

/** Bir kare: ekrandaki eller (kimlik = MediaPipe'ın sağ/sol etiketi) */
export function detect(lm: HandLandmarker, video: HTMLVideoElement, ts: number, W: number, H: number): RawHand[] {
  const res = lm.detectForVideo(video, ts);
  const map = makeMapper(video.videoWidth, video.videoHeight, W, H);
  const out: RawHand[] = [];
  res.landmarks.forEach((pts, i) => {
    const cat = res.handedness[i]?.[0];
    let id = cat?.categoryName || `h${i}`;
    if (out.some(h => h.id === id)) id = id + '2'; // aynı etiketli iki el (nadir)
    out.push({ id, score: cat?.score ?? 1, pts: pts.map(q => ({ ...map(q.x, q.y), z: q.z })) });
  });
  return out;
}
