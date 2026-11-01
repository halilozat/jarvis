// Ayarlar → Beyin: sağlayıcı seçimi, anahtar testi, kaydetme ve demo.
// Anahtar hiçbir cevapta tam olarak dönmez (yalnızca son 4 hanesi); kayıt server/data/beyin.json'da (git'e girmez).
// ACCESS_TOKEN yoksa ayarı yalnızca bu bilgisayardan (localhost) değiştirmek mümkün: aynı ağdaki biri anahtarı değiştiremesin.
import { Router, type Request, type Response } from 'express';
import { SAGLAYICILAR, modelKimlikleri, modelSec, saglayici, type Rol, type Saglayici } from './providers.js';
import {
  API_KEY, BASE_URL, CHAT_MODEL, KAYNAK, MOCK, PROVIDER, STT_MODEL, TTS_MODEL, VISION_MODEL, IMAGE_MODEL,
  beyinDosyasi, beyinKaydet, beyinSifirla, yetki, type BeyinAyari,
} from './routellm.js';

const ROLLER: Rol[] = ['chat', 'vision', 'stt', 'tts'];

export const maskele = (k: string) => (k ? `••••${k.slice(-4)}` : '');

/** Kurulum ekranına giden sağlayıcı listesi (kalıplar ve başlık fonksiyonları dışarı çıkmaz) */
const herkeseAcik = (s: Saglayici) => ({
  id: s.id, ad: s.ad, aciklama: s.aciklama, ucretsiz: s.ucretsiz, baseUrl: s.baseUrl, anahtarAdresi: s.anahtarAdresi,
  stt: !!s.stt, tts: !!s.tts, adresGirilir: !!s.adresGirilir, varsayilan: s.varsayilan,
});

export function beyinDurumu() {
  return {
    saglayicilar: SAGLAYICILAR.map(herkeseAcik),
    aktif: {
      saglayici: PROVIDER.id, ad: PROVIDER.ad, kaynak: KAYNAK, demo: MOCK,
      anahtar: maskele(API_KEY), adres: PROVIDER.adresGirilir ? BASE_URL : '',
      modeller: { chat: CHAT_MODEL, vision: VISION_MODEL, stt: STT_MODEL, tts: TTS_MODEL },
      yetenek: { stt: !MOCK && !!STT_MODEL, tts: !MOCK && !!PROVIDER.tts, gorselUretim: !MOCK && !!IMAGE_MODEL },
    },
    // Kurulum ekranı ilk açılışta yalnızca hiç ayar yokken gösterilir
    kurulumGerekli: KAYNAK === 'yok' && !beyinDosyasi(),
  };
}

/** Sağlayıcı hata kodu → kullanıcıya söylenecek cümle */
export function hataCumlesi(status: number | null, govde = '', model = ''): string {
  if (status === null) return 'Servise ulaşılamadı. İnternet bağlantısını ve (özel sağlayıcıda) adresi kontrol edin.';
  // Gemini geçersiz anahtarda 400 + "API key not valid" döndürüyor
  if (status === 401 || status === 403 || /api.?key|invalid.{0,20}(key|token)|unauthori[sz]ed|authentication/i.test(govde)) return 'Anahtar geçersiz ya da bu servise yetkisi yok. Anahtarı yeniden kopyalayın.';
  if (status === 429) return 'Kota doldu ya da çok sık istek gönderildi (ücretsiz katman sınırı). Biraz bekleyip tekrar deneyin.';
  if (status === 402) return 'Hesapta kredi yok. Sağlayıcının faturalandırma sayfasından kredi ekleyin ya da ücretsiz bir sağlayıcı seçin.';
  if (status === 404) return `Model bulunamadı${model ? `: ${model}` : ''}. Model listesinden başka birini seçin.`;
  return `Servis hata verdi (HTTP ${status})${govde ? `: ${govde.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`;
}

export interface TestSonucu {
  ok: boolean;
  hata?: string;
  ms?: number;
  /** Sağlayıcının model listesi (alınabildiyse) */
  modeller: string[];
  /** Rol başına önerilen model */
  secilen: Partial<Record<Rol, string>>;
  cevap?: string;
}

/** Bağlantı testi: model listesi + tek cümlelik gerçek bir sohbet isteği (anahtarın gerçekten çalıştığını gösterir). */
export async function beyinTest(cfg: BeyinAyari, f: typeof fetch = fetch): Promise<TestSonucu> {
  const s = saglayici(cfg.saglayici);
  if (!s) return { ok: false, hata: 'Bilinmeyen sağlayıcı', modeller: [], secilen: {} };
  const adres = (cfg.adres?.trim() || s.baseUrl).replace(/\/+$/, '');
  if (!adres) return { ok: false, hata: 'Servis adresini girin (ör. https://api.deepseek.com/v1)', modeller: [], secilen: {} };
  if (!cfg.anahtar?.trim()) return { ok: false, hata: 'Anahtarı yapıştırın', modeller: [], secilen: {} };
  const h = { ...yetki(cfg.anahtar.trim(), s), 'Content-Type': 'application/json' };

  let liste: string[] = [];
  const lr = await f(`${adres}/models`, { headers: h, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (lr?.ok) liste = modelKimlikleri(await lr.json().catch(() => ({})));
  else if (lr) {
    const govde = await lr.text().catch(() => '');
    if (/Anahtar geçersiz/.test(hataCumlesi(lr.status, govde))) return { ok: false, hata: hataCumlesi(lr.status, govde), modeller: [], secilen: {} };
  }

  const secilen: Partial<Record<Rol, string>> = {};
  for (const r of ROLLER) {
    const m = cfg.modeller?.[r] || (liste.length ? modelSec(s, r, liste) : s.varsayilan[r]);
    if (m) secilen[r] = m;
  }
  if (!s.stt) delete secilen.stt;
  if (s.tts !== 'speech') delete secilen.tts;
  if (!secilen.chat) return { ok: false, hata: 'Sohbet modelini seçin', modeller: liste, secilen };

  const t0 = Date.now();
  const cr = await f(`${adres}/chat/completions`, {
    method: 'POST', headers: h, signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({ model: secilen.chat, messages: [{ role: 'user', content: 'Yalnızca "Hazırım efendim." yaz.' }] }),
  }).catch(() => null);
  if (!cr?.ok) return { ok: false, hata: hataCumlesi(cr?.status ?? null, cr ? await cr.text().catch(() => '') : '', secilen.chat), modeller: liste, secilen };
  const j = await cr.json().catch(() => null);
  const cevap = String(j?.choices?.[0]?.message?.content ?? '').trim().slice(0, 80);
  return { ok: true, ms: Date.now() - t0, modeller: liste.slice(0, 400), secilen, cevap };
}

/** ACCESS_TOKEN yoksa yalnızca bu bilgisayardan (Vite vekili de Host başlığını korur) */
function yereldenMi(req: Request) {
  const ip = req.socket.remoteAddress ?? '';
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
  return /^(::1|127\.|::ffff:127\.)/.test(ip) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
}

/** İstekteki ayar: anahtar boşsa ve sağlayıcı aynıysa kayıtlı anahtar kullanılır (yeniden yapıştırmak gerekmez) */
function istektenAyar(b: any): BeyinAyari | null {
  const s = saglayici(b?.saglayici);
  if (!s) return null;
  const anahtar = String(b.anahtar ?? '').trim() || (s.id === PROVIDER.id ? API_KEY : '');
  const modeller: Partial<Record<Rol, string>> = {};
  for (const r of ROLLER) if (typeof b.modeller?.[r] === 'string' && b.modeller[r].trim()) modeller[r] = b.modeller[r].trim().slice(0, 120);
  const adres = s.adresGirilir ? String(b.adres ?? '').trim().slice(0, 300) : undefined;
  if (adres && !/^https?:\/\//.test(adres)) return null;
  return { saglayici: s.id, anahtar, adres, modeller };
}

export function beyinRouter(o: { korumali: boolean; degisti: () => void }) {
  const r = Router();
  const izin = (req: Request, res: Response) => {
    if (o.korumali || yereldenMi(req)) return true;
    res.status(403).json({ error: 'Beyin ayarı yalnızca Jarvis\'in çalıştığı bilgisayardan değiştirilebilir (ya da ACCESS_TOKEN tanımlayın).' });
    return false;
  };

  r.get('/api/beyin', (_req, res) => res.json(beyinDurumu()));

  r.post('/api/beyin/test', async (req, res) => {
    if (!izin(req, res)) return;
    const cfg = istektenAyar(req.body);
    if (!cfg) return res.status(400).json({ ok: false, hata: 'Geçersiz sağlayıcı ya da adres' });
    res.json(await beyinTest(cfg));
  });

  r.post('/api/beyin', async (req, res) => {
    if (!izin(req, res)) return;
    const cfg = istektenAyar(req.body);
    if (!cfg || !cfg.anahtar) return res.status(400).json({ error: 'Sağlayıcı ve anahtar gerekli' });
    if (!cfg.modeller?.chat && !saglayici(cfg.saglayici)?.varsayilan.chat) return res.status(400).json({ error: 'Sohbet modelini seçin' });
    beyinKaydet(cfg);
    console.log(`[beyin] ${PROVIDER.ad} · sohbet ${CHAT_MODEL} · görüntü ${VISION_MODEL} · ses tanıma ${STT_MODEL || 'tarayıcı'} · anahtar ${maskele(API_KEY)}`);
    o.degisti();
    res.json(beyinDurumu());
  });

  r.post('/api/beyin/demo', (req, res) => {
    if (!izin(req, res)) return;
    beyinKaydet(null);
    console.log('[beyin] demo modu seçildi');
    o.degisti();
    res.json(beyinDurumu());
  });

  // Uygulamadaki ayarı siler; .env'deki ayar (varsa) geri gelir
  r.delete('/api/beyin', (req, res) => {
    if (!izin(req, res)) return;
    beyinSifirla();
    console.log(`[beyin] uygulama ayarı silindi · ${MOCK ? 'demo' : `${PROVIDER.ad} (.env)`}`);
    o.degisti();
    res.json(beyinDurumu());
  });

  return r;
}
