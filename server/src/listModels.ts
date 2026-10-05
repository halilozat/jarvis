// RouteLLM'de kullanılabilen modelleri kategorize eder ve önerilen .env değerlerini yazar: `npm run models`
// Kategori, /models'in kendi alanlarından gelir (model_type + input/output_modalities); ad tahmini yok.
import { API_KEY, routellm } from './routellm.js';
import { bestVoice, pitchSpread, rankedVoices, usableVoices } from './tts.js';

if (!API_KEY) {
  console.error('ABACUS_API_KEY yok. server/.env dosyasına ekle.');
  process.exit(1);
}

interface M { id: string; model_type?: string; input_modalities?: string[]; output_modalities?: string[] }
const all = (await routellm<{ data: M[] }>('/models')).data;
const has = (m: M, side: 'input_modalities' | 'output_modalities', x: string) => !!m[side]?.includes(x);

const groups: [string, (m: M) => boolean][] = [
  ['Yönlendirici (route-llm)', m => m.id.startsWith('route-llm')],
  ['Metin', m => m.model_type === 'text_generation' && !m.id.startsWith('route-llm') && !has(m, 'input_modalities', 'image')],
  ['Görsel girdi (fotoğraf analizi)', m => m.model_type === 'text_generation' && !m.id.startsWith('route-llm') && has(m, 'input_modalities', 'image')],
  ['Ses girdisi (STT olarak kullanılabilir)', m => has(m, 'input_modalities', 'audio') && has(m, 'output_modalities', 'text')],
  ['Ses üretimi (TTS)', m => m.model_type === 'audio_generation'],
  ['Görsel üretimi', m => m.model_type === 'image_generation'],
  ['Video üretimi', m => m.model_type === 'video_generation'],
];

for (const [title, test] of groups) {
  const ids = all.filter(test).map(m => m.id).sort();
  console.log(`\n■ ${title} (${ids.length})\n  ${ids.join(', ') || '—'}`);
}

const ids = new Set(all.map(m => m.id));
const pick = (...c: string[]) => c.find(x => ids.has(x)) ?? '';
// .env'deki ses doğrulanmışsa öneri odur; değilse en kararlı ses.
const envOk = usableVoices().find(v => v.model === process.env.TTS_MODEL && v.voice === process.env.TTS_VOICE);
const voice = envOk ?? bestVoice();
console.log(`
Toplam ${all.length} model.

Önerilen .env (ölçümlere göre, 5 Ekim 2026):
CHAT_MODEL=route-llm                     # ya da Abacus'ta kurduğun Jarvis router'ının adı (README)
TTS_MODEL=${voice?.model ?? pick('gpt-audio-1.5')}               # sabit ses; Gemini TTS her istekte farklı perde üretiyor
TTS_VOICE=${voice?.voice ?? 'onyx'}${voice ? '' : '                        # npm run voices ile doğrulanmış seslerden seç'}
STT_MODEL=${pick('gemini-2.5-flash', 'gemini-3.5-flash')}               # /audio/transcriptions yok; ses girdili sohbet modeli
IMAGE_MODEL=${pick('flux2', 'flux_pro')}                        # temsili görseller (~8 sn)
VISION_MODEL=                            # boş = CHAT_MODEL (route-llm görsel girdiyi destekliyor)`);
console.log(`\nEn kararlı doğrulanmış sesler (npm run voices):`);
for (const v of rankedVoices().slice(0, 6)) console.log(`  ${v.id.padEnd(32)} ±${pitchSpread(v)} Hz · ${v.f0!.length} ölçüm · ~${Math.round(v.f0!.reduce((a, b) => a + b, 0) / v.f0!.length)} Hz`);
