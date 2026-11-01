// `npm run test:beyin`: sağlayıcı seçimi, ayar önceliği (dosya > .env > demo), bağlantı testi ve demo niyetleri.
// Gerçek ağ isteği yok; .env'deki gerçek anahtarlar boşaltılır (dotenv dolu değişkeni ezmez).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beyin-'));
process.env.BEYIN_DOSYA = path.join(dir, 'beyin.json');
for (const k of ['ABACUS_API_KEY', 'AI_PROVIDER', 'AI_API_KEY', 'AI_BASE_URL', 'CHAT_MODEL', 'VISION_MODEL', 'STT_MODEL', 'TTS_MODEL', 'TTS_VOICE', 'IMAGE_MODEL', 'MOCK', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE', 'ROUTELLM_BASE_URL'])
  process.env[k] = '';

const P = await import('./providers.js');
const R = await import('./routellm.js');
const B = await import('./beyin.js');
const T = await import('./tts.js');
const M = await import('./mock.js');

let ok = 0, fail = 0;
const t = (ad: string, kosul: unknown, ayrinti?: unknown) => {
  if (kosul) { ok++; console.log(`✓ ${ad}`); } else { fail++; console.log(`✗ ${ad}`, ayrinti ?? ''); }
};
const s = (id: string) => P.saglayici(id)!;

// ---------------------------------------------------------------- Model seçimi
const gemini = ['models/gemini-2.5-flash', 'models/gemini-3.5-flash', 'models/gemini-3.5-flash-lite', 'models/gemini-4.0-flash-preview', 'models/gemini-2.5-pro', 'models/embedding-001'];
const gIds = P.modelKimlikleri({ data: gemini.map(id => ({ id })) });
t('model kimlikleri: Gemini "models/" öneki atılır', gIds.includes('gemini-3.5-flash') && !gIds.some(m => m.startsWith('models/')), gIds);
t('Gemini sohbet: en yeni kararlı flash (preview ve lite değil)', P.modelSec(s('gemini'), 'chat', gIds) === 'gemini-3.5-flash', P.modelSec(s('gemini'), 'chat', gIds));
t('liste boşsa varsayılan model', P.modelSec(s('gemini'), 'chat', []) === 'gemini-2.5-flash');
const claude = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-sonnet-4-5-20250929', 'claude-sonnet-5-5', 'claude-opus-5-5'];
t('Claude: en yeni sonnet (tarih eki sürüm sayılmaz)', P.modelSec(s('anthropic'), 'chat', claude) === 'claude-sonnet-5-5', P.modelSec(s('anthropic'), 'chat', claude));
t('Claude: sonnet 4.5 > sonnet 4 (tarih eki)', P.modelSec(s('anthropic'), 'chat', claude.slice(0, 3)) === 'claude-sonnet-4-5-20250929', P.modelSec(s('anthropic'), 'chat', claude.slice(0, 3)));
const groq = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'whisper-large-v3', 'whisper-large-v3-turbo', 'meta-llama/llama-4-scout-17b-16e-instruct'];
t('Groq: sohbet gpt-oss, ses tanıma whisper turbo, görüntü llama-4', P.modelSec(s('groq'), 'chat', groq) === 'openai/gpt-oss-120b' && P.modelSec(s('groq'), 'stt', groq) === 'whisper-large-v3-turbo' && P.modelSec(s('groq'), 'vision', groq) === 'meta-llama/llama-4-scout-17b-16e-instruct');
const oa = ['gpt-4o-mini', 'gpt-5-mini', 'gpt-5.1-mini', 'gpt-4o-mini-tts', 'tts-1', 'whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-mini-audio-preview'];
t('OpenAI: sohbet gpt-5.1-mini, ses gpt-4o-mini-tts, tanıma transcribe', P.modelSec(s('openai'), 'chat', oa) === 'gpt-5.1-mini' && P.modelSec(s('openai'), 'tts', oa) === 'gpt-4o-mini-tts' && P.modelSec(s('openai'), 'stt', oa) === 'gpt-4o-mini-transcribe');

// ---------------------------------------------------------------- Ayar önceliği
t('hiç ayar yok: demo, kurulum ekranı gerekli', R.MOCK && R.KAYNAK === 'yok' && B.beyinDurumu().kurulumGerekli);
t('demoda varsayılan ses tarayıcı sesi', T.defaultVoice().sel.model === T.BROWSER && !T.ttsEnabled(T.defaultVoice().sel));

delete process.env.IMAGE_MODEL; // boş = görsel üretim kapalı; tanımsız = sağlayıcının varsayılanı
process.env.ABACUS_API_KEY = 'abc-test-1234';
process.env.CHAT_MODEL = 'route-llm';
R.beyinYukle();
t('.env ABACUS_API_KEY: Abacus (geriye uyum), modeller eskisi gibi', R.PROVIDER.id === 'abacus' && !R.MOCK && R.CHAT_MODEL === 'route-llm' && R.VISION_MODEL === 'gemini-3.8-flash' && R.PHOTO_MODEL === 'route-llm' && R.STT_MODEL === 'gemini-2.5-flash' && R.IMAGE_MODEL === 'flux2' && R.KAYNAK === 'env');
t('Abacus: seslendirme sağlayıcıdan (katalog)', T.ttsEnabled({ model: 'gpt-audio-1.5', voice: 'onyx', speed: 1 }));
t('maskelenmiş anahtar yalnızca son 4 hane', B.beyinDurumu().aktif.anahtar === '••••1234' && !JSON.stringify(B.beyinDurumu()).includes('abc-test'));

process.env.AI_PROVIDER = 'gemini';
process.env.AI_API_KEY = 'gm-test-9999';
R.beyinYukle();
t('.env AI_PROVIDER=gemini: eski route-llm adı Gemini\'ye taşınmaz', R.PROVIDER.id === 'gemini' && R.CHAT_MODEL === 'gemini-2.5-flash' && R.BASE_URL.includes('generativelanguage'), R.CHAT_MODEL);
t('Gemini: görsel üretim kapalı, seslendirme yok, ses tanıma var', R.IMAGE_MODEL === '' && !R.PROVIDER.tts && R.STT_MODEL === 'gemini-2.5-flash');
t('Gemini: eski gpt-audio sesi çalışmaz (cümleler sessiz kalmasın)', !T.ttsEnabled({ model: 'gpt-audio-1.5', voice: 'onyx', speed: 1 }) && T.providerVoices().length === 0);
t('Gemini: varsayılan ses tarayıcı sesi (ElevenLabs yok)', T.defaultVoice().sel.model === T.BROWSER);

R.beyinKaydet({ saglayici: 'openai', anahtar: 'sk-test-5678', modeller: { chat: 'gpt-5.1-mini' } });
t('dosya .env\'yi ezer: OpenAI', R.PROVIDER.id === 'openai' && R.KAYNAK === 'dosya' && R.CHAT_MODEL === 'gpt-5.1-mini' && R.VISION_MODEL === 'gpt-5.1-mini' && R.TTS_MODEL === 'gpt-4o-mini-tts');
t('OpenAI: sesler /audio/speech listesinden, varsayılan onyx', T.providerVoices().some(v => v.voice === 'onyx' && v.model === 'gpt-4o-mini-tts') && T.defaultVoice().sel.voice === 'onyx');
t('dosya izinleri yalnızca sahibine', (fs.statSync(process.env.BEYIN_DOSYA!).mode & 0o077) === 0);

R.beyinKaydet({ saglayici: 'anthropic', anahtar: 'sk-ant-test' });
t('Anthropic: x-api-key ve sürüm başlığı', R.yetki()['x-api-key'] === 'sk-ant-test' && R.yetki()['anthropic-version'] === '2023-06-01' && R.yetki().Authorization === 'Bearer sk-ant-test');
t('Anthropic: ses tanıma yok (tarayıcı)', R.STT_MODEL === '');

R.beyinKaydet(null);
t('demo seçildi: .env anahtarı olsa da demo', R.MOCK && R.KAYNAK === 'demo' && !B.beyinDurumu().kurulumGerekli);
R.beyinSifirla();
t('uygulama ayarı silinince .env geri gelir', R.PROVIDER.id === 'gemini' && !R.MOCK && R.KAYNAK === 'env');

let dinlendi = 0;
R.beyinDinle(() => { dinlendi++; });
R.beyinYukle();
t('sağlayıcı değişince dinleyiciler çalışır (kayıtta + değişimde)', dinlendi === 2, dinlendi);

// ---------------------------------------------------------------- Bağlantı testi (sahte fetch)
const cevap = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const istekler: string[] = [];
const sahte = (models: Response | (() => Response), chat: Response | (() => Response)) => (async (u: string | URL | Request) => {
  istekler.push(String(u));
  const r = String(u).endsWith('/models') ? models : chat;
  return typeof r === 'function' ? r() : r;
}) as typeof fetch;

const t1 = await B.beyinTest({ saglayici: 'gemini', anahtar: 'x' }, sahte(cevap(401, 'no'), cevap(200, {})));
t('test: 401 → anahtar geçersiz', !t1.ok && /Anahtar geçersiz/.test(t1.hata ?? ''), t1);
const t2 = await B.beyinTest({ saglayici: 'gemini', anahtar: 'x' }, sahte(cevap(200, { data: gemini.map(id => ({ id })) }), cevap(200, { choices: [{ message: { content: 'Hazırım efendim.' } }] })));
t('test: model listesi + sohbet → önerilen modeller', t2.ok && t2.secilen.chat === 'gemini-3.5-flash' && t2.secilen.stt === 'gemini-3.5-flash' && !t2.secilen.tts && t2.cevap === 'Hazırım efendim.', t2);
const t3 = await B.beyinTest({ saglayici: 'groq', anahtar: 'x' }, sahte(cevap(200, { data: [] }), cevap(429, 'rate')));
const t7 = await B.beyinTest({ saglayici: 'gemini', anahtar: 'x' }, sahte(cevap(400, '[{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}]'), cevap(200, {})));
t('test: Gemini 400 "API key not valid" → anahtar geçersiz', !t7.ok && /Anahtar geçersiz/.test(t7.hata ?? ''), t7);
t('test: 429 → kota cümlesi', !t3.ok && /Kota/.test(t3.hata ?? ''), t3);
const t4 = await B.beyinTest({ saglayici: 'openrouter', anahtar: 'x' }, sahte(cevap(500, ''), cevap(200, { choices: [{ message: { content: 'ok' } }] })));
t('test: liste alınamazsa varsayılan modelle denenir', t4.ok && t4.secilen.chat === 'openrouter/auto', t4);
const t5 = await B.beyinTest({ saglayici: 'ozel', anahtar: 'x' }, sahte(cevap(200, {}), cevap(200, {})));
t('test: özel sağlayıcıda adres zorunlu', !t5.ok && /adres/i.test(t5.hata ?? ''));
const t6 = await B.beyinTest({ saglayici: 'gemini', anahtar: 'x' }, (async () => { throw new Error('ağ yok'); }) as typeof fetch);
t('test: ağ hatası → servise ulaşılamadı', !t6.ok && /ulaşılamadı/.test(t6.hata ?? ''), t6);

// ---------------------------------------------------------------- Demo niyetleri
const niyet: [string, string][] = [
  ['Jarvis, aydınlat beni', 'brifing'], ['gündemde ne var', 'brifing'], ['hava nasıl', 'hava'], ['bugün yağmur yağacak mı', 'hava'],
  ['dolar kaç', 'doviz'], ['euro ne kadar', 'doviz'], ['salon ışığını aç', 'ev'], ['çalışma odasının lambasını kapat', 'ev'],
  ['bana bir kitap öner', 'kitap'], ['kimsin sen', 'tanit'], ['neler yapabilirsin', 'tanit'], ['günaydın', 'selam'],
  ['saat kaç', 'saat'], ['teşekkürler', 'tesekkur'], ['Atatürk kimdir', 'wiki'], ['Kapadokya nerede', 'wiki'],
  ['bana bir şiir yaz', 'bilinmiyor'],
];
for (const [cumle, beklenen] of niyet) t(`demo niyeti: "${cumle}" → ${beklenen}`, M.demoNiyet(cumle) === beklenen, M.demoNiyet(cumle));
t('wiki konusu: "Mars hakkında bilgi ver" → mars', M.wikiKonusu('Mars hakkında bilgi ver') === 'mars', M.wikiKonusu('Mars hakkında bilgi ver'));

t('bulunma eki: ses uyumu', M.bulunma('İstanbul') === "İstanbul'da" && M.bulunma('İzmir') === "İzmir'de" && M.bulunma('Tokat') === "Tokat'ta" && M.bulunma('Eskişehir') === "Eskişehir'de" && M.bulunma('Ankara') === "Ankara'da");
const bilinmeyen = await M.mockReply('bana bir şiir yaz', 'masaustu', () => {});
t('demo: anlaşılmayan soruda anahtarın yeri söylenir', /Beyin/.test(bilinmeyen.sahneler[0].ses) && /Gemini/.test(bilinmeyen.detay));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${ok} beyin testi geçti${fail ? `, ${fail} BAŞARISIZ` : ''}.`);
process.exit(fail ? 1 : 0);
