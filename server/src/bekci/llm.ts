// Bekçi · metin analizi (LLM). Jarvis'in seçili beyni kullanılır (Ayarlar → Beyin: Abacus RouteLLM, Gemini, Groq,
// OpenAI uyumlu herhangi bir servis). Modele YALNIZCA maskelenmiş metin gider. Düşük sıcaklık, JSON çıktı, şema
// doğrulaması; zaman aşımında ya da beyin yoksa kural tabanlı sonuçla devam edilir.
import { CHAT_MODEL, MOCK, routellm } from '../routellm.js';

export const TAKTIKLER = ['aciliyet', 'odeme_talebi', 'ceza_tehdidi', 'odul_vaadi', 'kimlik_veya_kart_talebi', 'hesap_askiya_alma', 'kargo_teslim_edilemedi'] as const;
export type Taktik = (typeof TAKTIKLER)[number];

export interface MetinSonucu { scam_likelihood: number; tactics: Taktik[]; impersonated_brand: string | null; short_reason_tr: string; model: string }

const SISTEM = `Sen Türkçe SMS ve e-postalarda dolandırıcılık (oltalama) tespiti yapan bir denetçisin.
Mesajdaki kişisel bilgiler maskelenmiştir ([TELEFON], [E-POSTA], [IBAN], [KART], [TC]).
Dolandırıcılar sık sık Türkçe karakter kullanmadan yazar ("Gonderiniz teslim edilemedi", "odeme yapmaniz gerekmektedir"); bunu da tanı.
Yaygın taktikler: aciliyet ("24 saat icinde"), küçük tutarlı ödeme talebi, ceza/haciz tehdidi, ödül/çekiliş vaadi, kimlik veya kart bilgisi isteme, hesabın askıya alınması, kargonun teslim edilememesi.
Meşru mesajlar: link içermeyen tek kullanımlık doğrulama kodları ("şifrenizi kimseyle paylaşmayın"), kişisel sohbet, bilinen resmî adreslere giden bilgilendirmeler.
Yalnızca şu JSON nesnesini döndür, başka hiçbir şey yazma:
{"scam_likelihood": 0-100 tamsayı, "tactics": [${TAKTIKLER.map(t => `"${t}"`).join(', ')} değerlerinden uygun olanlar], "impersonated_brand": "taklit edilen kurum ya da null", "short_reason_tr": "en fazla bir cümle"}`;

const ORNEKLER: [string, object][] = [
  ['PTT: Gonderiniz adres bilgisi eksik oldugu icin teslim edilemedi. 24 saat icinde 7,90 TL odeme yapmazsaniz iade edilecektir: ptt-teslim.example/odeme',
    { scam_likelihood: 95, tactics: ['kargo_teslim_edilemedi', 'aciliyet', 'odeme_talebi'], impersonated_brand: 'PTT', short_reason_tr: 'Kargo bahanesiyle küçük bir ödeme isteyip resmî olmayan bir linke yönlendiriyor.' }],
  ['Dogrulama kodunuz: 482913. Bu kodu kimseyle paylasmayin. B001',
    { scam_likelihood: 3, tactics: [], impersonated_brand: null, short_reason_tr: 'Link içermeyen sıradan bir doğrulama kodu mesajı.' }],
  ['e-Devlet: Adiniza 2.450 TL trafik cezasi kesilmistir. Haciz islemi baslamadan odeme icin: edevlet-ceza.example',
    { scam_likelihood: 97, tactics: ['ceza_tehdidi', 'aciliyet', 'odeme_talebi'], impersonated_brand: 'e-Devlet', short_reason_tr: 'Ceza ve haciz tehdidiyle e-Devlet olmayan bir adrese ödeme istiyor.' }],
  ['Aksam 8 gibi bizdeyiz, ekmek alir misin?',
    { scam_likelihood: 1, tactics: [], impersonated_brand: null, short_reason_tr: 'Kişisel bir mesaj.' }],
];

/** Modelin cevabı → doğrulanmış sonuç (şemaya uymayan alanlar atılır) */
export function sonucuDogrula(ham: string, model: string): MetinSonucu | null {
  const m = /\{[\s\S]*\}/.exec(ham);
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const p = Number(j.scam_likelihood);
  if (!Number.isFinite(p)) return null;
  return {
    scam_likelihood: Math.round(Math.min(100, Math.max(0, p))),
    tactics: Array.isArray(j.tactics) ? j.tactics.filter((t: unknown): t is Taktik => (TAKTIKLER as readonly string[]).includes(String(t))) : [],
    impersonated_brand: typeof j.impersonated_brand === 'string' && j.impersonated_brand.trim() && !/^null$/i.test(j.impersonated_brand) ? j.impersonated_brand.trim().slice(0, 60) : null,
    short_reason_tr: String(j.short_reason_tr ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    model,
  };
}

/** Beyin yoksa ya da zaman aşımında null döner (çağıran kural tabanlı sonuçla devam eder) */
export async function metniAnalizEt(maskeliMetin: string, ms = 4000): Promise<MetinSonucu | null> {
  if (MOCK) return null;
  const model = process.env.BEKCI_MODEL?.trim() || CHAT_MODEL;
  const messages = [
    { role: 'system', content: SISTEM },
    ...ORNEKLER.flatMap(([u, a]) => [{ role: 'user', content: u }, { role: 'assistant', content: JSON.stringify(a) }]),
    { role: 'user', content: maskeliMetin.slice(0, 3000) },
  ];
  const istek = routellm<any>('/chat/completions', { model, messages, temperature: 0.1, max_tokens: 220 });
  const zaman = new Promise<null>(r => setTimeout(() => r(null), ms));
  const j = await Promise.race([istek.catch(() => null), zaman]);
  if (!j) return null;
  return sonucuDogrula(String(j.choices?.[0]?.message?.content ?? ''), String(j.model || model));
}
