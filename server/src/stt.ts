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

/**
 * "Jarvis"in yanlış duyulmuş biçimleri (cümlenin başında, hitap olarak). Yalnızca gerçek bir Türkçe kelime olmayanlar:
 * "Ceviz" ya da "Charlie" gerçek kelime olabilir, onları sistem talimatı bağlamdan anlar.
 */
const YANLIS_HITAP = /^(\s*(?:hey\s+)?)(?:cervis|cerviz|çarvis|çarviz|şarvis|carvis|carviz|jervis|jerviz|jarviz|jarvıs|jarus|jarvus|garvis|javis|jarves|jarbis|ciervis|carves)(?=[\s,.!?]|$)/iu;
export const hitapDuzelt = (text: string) => text.replace(YANLIS_HITAP, '$1Jarvis');

/** Ses tanımaya verilen bağlam: konuşmanın son mesajları (kısa) */
export function sttIstemi(baglam: string[]): string {
  const son = baglam.map(x => x.replace(/\s+/g, ' ').trim().slice(0, 220)).filter(Boolean).slice(-4);
  return 'Bu Türkçe konuşmayı kelimesi kelimesine yazıya dök. Sadece duyduğun metni yaz; tırnak, açıklama ya da başlık ekleme. Konuşma yoksa hiçbir şey yazma.\n' +
    'Konuşan kişi "Jarvis" adlı yapay zekâ asistanıyla konuşuyor; cümle çoğu zaman "Jarvis" diye başlar (Ceviz, Charlie, Cervis değil).' +
    (son.length
      ? '\nKonuşmanın son mesajları aşağıda. Bunu YALNIZCA belirsiz duyduğun kelimeyi doğru seçmek için kullan (ör. önceki konu bir kitapsa "ağır gelmesi", "yağmur gelmesi" değil). ' +
        'Duymadığın bir şeyi ekleme, bu mesajları tekrar yazma.\n' + son.map(x => `- ${x}`).join('\n')
      : '');
}

export async function transcribe(audio: Buffer, mime: string, baglam: string[] = []): Promise<{ text: string; model: string; ms: number }> {
  const t0 = Date.now();
  const format = audioFormat(mime);
  if (!format) throw new Error(`desteklenmeyen ses biçimi: ${mime}`);

  if (transcriptionsEndpoint !== false) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `kayit.${format}`);
    form.append('model', STT_MODEL);
    form.append('language', 'tr');
    form.append('prompt', ['Jarvis', ...baglam.slice(-2)].join('. ').slice(0, 600));
    const r = await fetch(`${BASE_URL}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${API_KEY}` }, body: form }).catch(() => null);
    if (r?.ok) {
      transcriptionsEndpoint = true;
      const j: any = await r.json();
      return { text: hitapDuzelt(String(j.text ?? '').trim()), model: STT_MODEL, ms: Date.now() - t0 };
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
          { type: 'text', text: sttIstemi(baglam) },
        ],
      },
    ],
  });
  const raw = String(resp.choices?.[0]?.message?.content ?? '').trim();
  // Model bazen {"text": "..."} biçiminde dönüyor
  let text = (/^\{\s*"(?:text|transcript(?:ion)?)"\s*:\s*"([\s\S]*)"\s*\}$/.exec(raw)?.[1] ?? raw).replace(/^["“]|["”]$/g, '').trim();
  // Sessiz kayıtta model bazen kendi talimatını geri döndürüyor ("Türkçeyi kelimesi kelimesine yazıya dök"):
  // bu, kullanıcının sözü değil. Boş say (istemci "Sizi duyamadım" der).
  const f = text.toLocaleLowerCase('tr');
  if (/kelimesi kelimesine|yazıya dök|duyduğun metni|konuşma yok|ses yok|son mesajları|^\W*$/.test(f)) text = '';
  // Sessiz kayıtta bağlamdaki bir mesajı geri döndürdüyse o da kullanıcının sözü değil
  if (text && baglam.some(b => b.trim().toLocaleLowerCase('tr') === f)) text = '';
  return { text: hitapDuzelt(text), model: resp.model ?? STT_MODEL, ms: Date.now() - t0 };
}
