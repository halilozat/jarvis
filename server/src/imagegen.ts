// RouteLLM görsel modeliyle TEMSİLİ görsel üretimi (fotoğraf zincirinin 3. adımı).
// Kural: gerçek kişi veya gerçek olay sahnesi asla üretilmez. Yalnızca sembolik konular için çağrılır
// (photos.ts karar verir) ve istem bunu ayrıca zorlar. Üretilen görsel "temsili görsel · yapay zeka" etiketi taşır.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK, routellm, type ChatResponse } from './routellm.js';
import type { Photo } from './types.js';

export const IMAGE_MODEL = process.env.IMAGE_MODEL ?? 'flux2';
export const IMG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'img');

const inflight = new Map<string, Promise<Photo | null>>();

const PROMPT = (q: string) =>
  `Symbolic, abstract editorial illustration of: ${q}. Dark cinematic background with cyan (#4de1ff) and amber accents. ` +
  'No real people, no faces, no recognizable persons, no logos, no text, no letters, no news event scene.';

/** Aynı istem için diskteki görseli döndürür ya da bir kez üretir. */
export function generateImage(query: string): Promise<Photo | null> {
  const q = query.trim().toLocaleLowerCase('en');
  if (!IMAGE_MODEL || MOCK || !q) return Promise.resolve(null);
  const hash = createHash('sha1').update(`${IMAGE_MODEL}\u0000${q}`).digest('hex').slice(0, 20);
  const file = `${hash}.png`;
  const photo: Photo = { url: `/api/genimg/${file}`, credit: 'yapay zeka', kind: 'temsili' };
  if (fs.existsSync(path.join(IMG_DIR, file))) return Promise.resolve(photo);
  let job = inflight.get(hash);
  if (!job) {
    job = (async () => {
      const t0 = Date.now();
      try {
        const r = await routellm<ChatResponse & { choices: { message: { images?: { image_url?: { url?: string }; url?: string }[] } }[] }>('/chat/completions', {
          model: IMAGE_MODEL,
          modalities: ['image'],
          messages: [{ role: 'user', content: PROMPT(q) }],
        });
        const img = r.choices?.[0]?.message?.images?.[0];
        const url = img?.image_url?.url ?? img?.url ?? '';
        const m = /^data:image\/\w+;base64,(.+)$/.exec(url);
        if (!m) throw new Error('görsel gelmedi');
        fs.mkdirSync(IMG_DIR, { recursive: true });
        fs.writeFileSync(path.join(IMG_DIR, file), Buffer.from(m[1], 'base64'));
        console.log(`[görsel] ${IMAGE_MODEL} · "${q}" · ${Date.now() - t0} ms`);
        return photo;
      } catch (e: any) {
        console.warn(`[görsel] ${IMAGE_MODEL} · "${q}" · başarısız: ${String(e?.message || e).slice(0, 100)}`);
        return null;
      } finally {
        inflight.delete(hash);
      }
    })();
    inflight.set(hash, job);
  }
  return job;
}
