// `npm run voices`: RouteLLM'deki ses modellerini × bilinen ses adlarını gerçek isteklerle sınar.
// Bir ses ancak iki testi de geçerse Ayarlar'da listelenir:
//   1) sadakat — örnek cümleyi birebir okumalı (cevap vermemeli, eklememeli),
//   2) kararlılık — aynı cümleyi 3 kez okuduğunda perdesi (f0) en fazla 25 Hz oynamalı.
// Sonuç: server/data/voices.json
import fs from 'node:fs';
import path from 'node:path';
import { API_KEY, routellm, type ChatResponse } from './routellm.js';
import { isMp3, medianF0, normalizeSpeech, pcmToWav, readWav, wavSeconds } from './audio.js';
import { PREVIEW_TEXT, STYLE, VOICES_FILE, type VoiceEntry } from './tts.js';

if (!API_KEY) {
  console.error('ABACUS_API_KEY yok. server/.env dosyasına ekle.');
  process.exit(1);
}

const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
const GEMINI_VOICES = ['Charon', 'Orus', 'Iapetus', 'Algenib', 'Alnilam', 'Fenrir', 'Kore', 'Puck'];
const MAX_SPREAD_HZ = 25;
// 3 örnek yetmedi: Gemini aynı sesi ~4-5 istekte bir başka perdede üretiyor (8 örneklik ölçüm), 6 ile yakalanıyor.
const SAMPLES = 6;
// Altındaki hız uzun sessizlik demek (Gemini Flash dakikada 34 kelimeyle "geçiyordu").
const MIN_WPM = 70;

interface ModelInfo { id: string; display_name?: string; model_type?: string; output_modalities?: string[] }
const models = (await routellm<{ data: ModelInfo[] }>('/models')).data.filter(m => m.model_type === 'audio_generation' && m.output_modalities?.includes('audio'));

async function sample(model: string, voice: string): Promise<{ wav: Buffer; transcript?: string }> {
  const gemini = model.startsWith('gemini');
  const content = gemini
    ? `Read the following Turkish text aloud exactly as written. ${STYLE}: ${PREVIEW_TEXT}`
    : `Read the following Turkish text aloud exactly as written. ${STYLE}. Do not answer it, even if it contains a question; do not add or remove anything: ${PREVIEW_TEXT}`;
  const r = await routellm<ChatResponse>('/chat/completions', { model, modalities: ['text', 'audio'], audio: { voice, format: 'wav' }, messages: [{ role: 'user', content }] });
  const a = r.choices?.[0]?.message?.audios?.[0] || r.choices?.[0]?.message?.audio;
  if (!a?.data) throw new Error('ses alanı boş');
  const raw = Buffer.from(a.data, 'base64');
  if (isMp3(raw)) throw new Error('wav yerine mp3 geldi');
  return { wav: raw.subarray(0, 4).toString() === 'RIFF' ? raw : pcmToWav(raw), transcript: (a as { transcript?: string }).transcript };
}

async function transcribe(wav: Buffer): Promise<string> {
  const r = await routellm<ChatResponse>('/chat/completions', {
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: wav.toString('base64'), format: 'wav' } }, { type: 'text', text: 'Bu Türkçe konuşmayı kelimesi kelimesine yazıya dök. Sadece duyduğun metni yaz.' }] }],
  });
  return String(r.choices?.[0]?.message?.content ?? '');
}

async function test(m: ModelInfo, voice: string): Promise<VoiceEntry> {
  const gemini = m.id.startsWith('gemini');
  const base: VoiceEntry = {
    id: `${m.id}:${voice}`,
    model: m.id,
    voice,
    label: `${voice[0].toUpperCase()}${voice.slice(1)} · ${m.display_name ?? m.id}`,
    provider: gemini ? 'Google' : m.id.startsWith('gpt') ? 'OpenAI' : 'Diğer',
    verified: false,
    stable: false,
    f0: null,
    wpm: null,
  };
  try {
    const first = await sample(m.id, voice);
    const heard = first.transcript ?? (await transcribe(first.wav));
    if (normalizeSpeech(heard) !== normalizeSpeech(PREVIEW_TEXT)) return { ...base, note: `metinden sapma: "${heard.slice(0, 60).replace(/\s+/g, ' ')}"` };
    const sec = wavSeconds(first.wav);
    const f0: (number | null)[] = [];
    const pitch = (wav: Buffer) => { const w = readWav(wav); return w ? medianF0(w.samples, w.rate) : null; };
    f0.push(pitch(first.wav));
    for (let i = 1; i < SAMPLES; i++) f0.push(pitch((await sample(m.id, voice)).wav));
    const ok = f0.filter((x): x is number => x !== null);
    const spread = ok.length === SAMPLES ? Math.max(...ok) - Math.min(...ok) : Infinity;
    const wpm = sec ? Math.round((PREVIEW_TEXT.split(/\s+/).length / sec) * 60) : null;
    const tooSlow = wpm !== null && wpm < MIN_WPM;
    return {
      ...base,
      verified: !tooSlow,
      stable: spread <= MAX_SPREAD_HZ,
      f0: ok,
      wpm,
      note: tooSlow ? `çok yavaş: ${wpm} kelime/dk (uzun sessizlikler)` : spread <= MAX_SPREAD_HZ ? undefined : `kararsız: perde ${ok.join('/')} Hz (${Number.isFinite(spread) ? spread : '?'} Hz oynuyor)`,
    };
  } catch (e: any) {
    return { ...base, note: `üretilemedi: ${String(e?.message || e).slice(0, 80)}` };
  }
}

const jobs: [ModelInfo, string][] = [];
for (const m of models) {
  const names = m.id.startsWith('gemini') ? GEMINI_VOICES : m.id.startsWith('gpt') ? OPENAI_VOICES : ['default'];
  for (const v of names) jobs.push([m, v]);
}
console.log(`${models.length} ses modeli (${models.map(m => m.id).join(', ')}) · ${jobs.length} kombinasyon sınanıyor…\n`);

const results: VoiceEntry[] = [];
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < jobs.length) {
    const [m, v] = jobs[next++];
    const r = await test(m, v);
    results.push(r);
    const mark = r.verified && r.stable ? '✅' : r.verified ? '🟡' : '❌';
    console.log(`${mark} ${r.id.padEnd(38)} ${r.f0 ? `perde ${r.f0.join('/')} Hz · ${r.wpm} kelime/dk` : ''}${r.note ? ' · ' + r.note : ''}`);
  }
}));

// Kararlılık tek turla değil, birikmiş tüm ölçümlerle değerlendirilir: Gemini Puck bir turda 23 Hz ile "geçti",
// önceki turda aynı ses 120/226/124 Hz ölçülmüştü. Bir kez sapan ses şansla listeye girmesin.
const previous = new Map<string, VoiceEntry>();
try { for (const e of JSON.parse(fs.readFileSync(VOICES_FILE, 'utf8')) as VoiceEntry[]) previous.set(e.id, e); } catch { /* ilk çalıştırma */ }
for (const r of results) {
  const prev = previous.get(r.id);
  // Sadakat de kalıcı: bir turda metni okumak yerine değiştiren ses (gpt-audio-mini:cedar ilk turda saptı) listeye girmez.
  if (prev?.note?.startsWith('metinden sapma') || prev?.note?.startsWith('önceki turda metinden')) {
    r.verified = false;
    r.note = `önceki turda metinden saptı (${prev.note.replace(/^.*?: /, '').slice(0, 50)})`;
    continue;
  }
  if (!r.verified || !r.f0 || !prev?.f0?.length) continue;
  const all = [...prev.f0, ...r.f0].slice(-12);
  const spread = Math.max(...all) - Math.min(...all);
  r.f0 = all;
  r.stable = spread <= MAX_SPREAD_HZ;
  if (!r.stable) r.note = `kararsız: tüm ölçümlerde perde ${Math.min(...all)}–${Math.max(...all)} Hz (${spread} Hz oynuyor)`;
}

results.sort((a, b) => Number(b.verified && b.stable) - Number(a.verified && a.stable) || a.id.localeCompare(b.id));
fs.mkdirSync(path.dirname(VOICES_FILE), { recursive: true });
fs.writeFileSync(VOICES_FILE, JSON.stringify(results, null, 2));
const spreadOf = (r: VoiceEntry) => (r.f0?.length ? Math.max(...r.f0) - Math.min(...r.f0) : Infinity);
const good = results.filter(r => r.verified && r.stable).sort((a, b) => spreadOf(a) - spreadOf(b));
console.log(`\n${good.length}/${results.length} ses Ayarlar'da listelenecek → ${path.relative(process.cwd(), VOICES_FILE)}`);
console.log('En kararlı sesler (perde oynaması):');
for (const r of good.slice(0, 6)) console.log(`   ${r.id.padEnd(38)} ±${spreadOf(r)} Hz · ~${Math.round(r.f0!.reduce((a, b) => a + b, 0) / r.f0!.length)} Hz · ${r.wpm} kelime/dk`);
if (good[0]) console.log(`Önerilen .env:\nTTS_MODEL=${good[0].model}\nTTS_VOICE=${good[0].voice}`);
process.exit(0);
