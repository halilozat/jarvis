// Ses tanıma (STT) RouteLLM'den: tarayıcının Web Speech API'si iPhone'da güvenilir değil, yalnızca yedek.
// Ölçüm (5 Ekim 2026): /audio/transcriptions RouteLLM'de yok (404). Ses girdili sohbet modelleri arasında
// gemini-2.5-flash 2,7 sn'de birebir doğru yazdı; gemini-2.5-pro 9 sn; gpt-audio-1.5 metni bozdu.
import { API_KEY, BASE_URL, routellm, type ChatResponse } from './routellm.js';

export const STT_MODEL = process.env.STT_MODEL || 'gemini-2.5-flash';
let transcriptionsEndpoint: boolean | null = null; // ilk denemeden sonra hafızada

/** MediaRecorder MIME türü → RouteLLM input_audio biçimi */
export function audioFormat(mime: string): string | null {
  const m = mime.toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return null;
}

export async function transcribe(audio: Buffer, mime: string): Promise<{ text: string; model: string; ms: number }> {
  const t0 = Date.now();
  const format = audioFormat(mime);
  if (!format) throw new Error(`desteklenmeyen ses biçimi: ${mime}`);

  if (transcriptionsEndpoint !== false) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `kayit.${format}`);
    form.append('model', STT_MODEL);
    form.append('language', 'tr');
    const r = await fetch(`${BASE_URL}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${API_KEY}` }, body: form }).catch(() => null);
    if (r?.ok) {
      transcriptionsEndpoint = true;
      const j: any = await r.json();
      return { text: String(j.text ?? '').trim(), model: STT_MODEL, ms: Date.now() - t0 };
    }
    transcriptionsEndpoint = false;
  }

  const resp = await routellm<ChatResponse>('/chat/completions', {
    model: STT_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'input_audio', input_audio: { data: audio.toString('base64'), format } },
          { type: 'text', text: 'Bu Türkçe konuşmayı kelimesi kelimesine yazıya dök. Sadece duyduğun metni yaz; tırnak, açıklama ya da başlık ekleme. Konuşma yoksa hiçbir şey yazma.' },
        ],
      },
    ],
  });
  const raw = String(resp.choices?.[0]?.message?.content ?? '').trim();
  // Model bazen {"text": "..."} biçiminde dönüyor
  const text = (/^\{\s*"(?:text|transcript(?:ion)?)"\s*:\s*"([\s\S]*)"\s*\}$/.exec(raw)?.[1] ?? raw).replace(/^["“]|["”]$/g, '').trim();
  return { text, model: resp.model ?? STT_MODEL, ms: Date.now() - t0 };
}
