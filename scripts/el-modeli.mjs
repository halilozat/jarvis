// El Kontrolü modelini (MediaPipe Hand Landmarker, ~7,5 MB) web/public/models altına indirir.
// İsteğe bağlı: indirilmezse model ilk açılışta Google'ın sunucusundan yüklenir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Yüz HUD kilidi için yüz algılama modeli (BlazeFace, ~0,2 MB) de indirilir.
const MODELS = [
  ['https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', 'hand_landmarker.task'],
  ['https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', 'blaze_face_short_range.tflite'],
];
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'models');
fs.mkdirSync(dir, { recursive: true });
for (const [url, name] of MODELS) {
  const r = await fetch(url);
  if (!r.ok) { console.error(`İndirilemedi (${name}): HTTP ${r.status}`); process.exit(1); }
  const out = path.join(dir, name);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log(`Model indirildi: ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}
