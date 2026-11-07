// Bekçi: gelen SMS / iMessage / RCS ve e-postaları gelir gelmez, kullanıcı sormadan analiz eder; dolandırıcılık
// şüphesi varsa Jarvis'in sesiyle uyarır ve telefona bildirim gönderir. Linki engellemez, UYARIR.
//   ≥ tehlikeli eşik: sesli uyarı + push + panel · ≥ şüpheli eşik: yalnızca push (sessiz) + panelde işaret · altı: log
// Mesaj içeriği diske yazılmaz; son analiz edilen mesaj takip soruları için yalnızca bellekte tutulur.
import { execFile } from 'node:child_process';
import os from 'node:os';
import { Router } from 'express';
import { analizEt, type Analiz, type Fikstur, type Mesaj } from './analiz.js';
import { beyazdaMi, beyazEkle, bildirimGonder, kayitEkle, kayitGuncelle, kayitlariOku, sessizMi, tekrarMi } from './depo.js';
import { demoMail, demoSms } from './demo.js';
import { usomHazir, usomYukle } from './kaynaklar.js';
import { hesaplariOku, MailIzleyici } from './mail.js';
import { katla } from './metin.js';
import { ayarOku } from './puan.js';
import { SmsIzleyici } from './sms.js';

let notify: (e: object) => void = () => {};
let sms: SmsIzleyici | null = null;
const mailler: MailIzleyici[] = [];
let mailHata: string | undefined;
/** Takip soruları için son analiz (bellekte) */
let son: { mesaj: Mesaj; analiz: Analiz } | null = null;
const islenen = new Set<string>();
const etkin = () => process.env.BEKCI_ENABLED !== 'false';

export function initBekci(broadcast: (e: object) => void) {
  notify = broadcast;
  if (!etkin()) { console.log('[bekçi] kapalı (BEKCI_ENABLED=false)'); return; }
  void usomYukle().then(r => console.log(`[bekçi] USOM listesi: ${r.ok ? `${r.satir} kayıt` : r.hata}`));
  setInterval(() => void usomYukle(), 6 * 3600_000).unref();
  if (process.env.BEKCI_SMS_ENABLED !== 'false' && os.platform() === 'darwin') {
    sms = new SmsIzleyici(m => void isle(m));
    sms.baslat();
  }
  if (process.env.BEKCI_MAIL_ENABLED !== 'false') {
    const { hesaplar, hata } = hesaplariOku();
    mailHata = hata;
    if (hata) console.warn(`[bekçi] ${hata}`);
    for (const h of hesaplar) { const m = new MailIzleyici(h, x => void isle(x)); mailler.push(m); void m.baslat(); }
  }
  if (process.argv.includes('--bekci-demo') || process.env.BEKCI_DEMO === '1') setTimeout(() => void demoBaslat('sms'), 6000);
}

/** Bir mesajı analiz et ve sonuca göre uyar. elle: kullanıcı kendisi sordu (otomatik uyarı ve push yok) */
export async function isle(m: Mesaj, o: { fikstur?: Fikstur; elle?: boolean } = {}): Promise<Analiz | null> {
  if (islenen.has(m.id)) return null;
  islenen.add(m.id);
  if (islenen.size > 2000) islenen.clear();
  const ayar = ayarOku();
  const t0 = Date.now();
  notify({ type: 'bekci', olay: 'basla', id: m.id, kaynak: m.kaynak, gonderen: m.gonderen, zaman: m.zaman, demo: !!o.fikstur, ac: !!o.fikstur || !!o.elle });
  const a = await analizEt(m, {
    fikstur: o.fikstur ? { ...o.fikstur, adimMs: o.fikstur.adimMs ?? ayar.demo_adim_ms } : undefined,
    ilerleme: x => notify({ type: 'bekci', olay: 'adim', analiz: x }),
    guncel: x => { kayitGuncelle(x.id, x); if (son?.analiz.id === x.id) son.analiz = x; notify({ type: 'bekci', olay: 'guncel', analiz: x }); },
    ayar,
  });
  son = { mesaj: m, analiz: a };
  const beyaz = beyazdaMi(m.gonderen, a.linkler.map(l => l.alan.split(' ')[0]));
  kayitEkle(a, ayar);
  console.log(`[bekçi] ${m.kaynak} · ${a.puan}/100 ${a.seviye}${beyaz ? ' (beyaz liste)' : ''} · ${Date.now() - t0} ms · ${a.linkler.map(l => l.goster).join(' ') || 'link yok'}`);
  let ses = false, push = false;
  if (!o.elle && !beyaz && a.seviye !== 'temiz' && !tekrarMi(a, ayar.birlestirme_dk)) {
    push = true;
    ses = a.seviye === 'tehlikeli' && !sessizMi(ayar.sessiz_saatler);
  }
  if (o.fikstur) { ses = a.seviye === 'tehlikeli'; push = !!process.env.NTFY_TOPIC && a.seviye !== 'temiz'; }
  if (push) void bildirimGonder(a).then(r => { if (!r.ok) console.warn(`[bekçi] bildirim: ${r.hata}`); });
  notify({ type: 'bekci', olay: 'sonuc', analiz: a, ses, ac: ses || !!o.fikstur || !!o.elle || a.seviye === 'tehlikeli', beyaz });
  return a;
}

export function demoBaslat(tur: 'sms' | 'mail' = 'sms') {
  const d = tur === 'mail' ? demoMail() : demoSms();
  return isle(d.mesaj, { fikstur: d.fikstur });
}

export function bekciDurum() {
  const { hesaplar } = hesaplariOku();
  return {
    etkin: etkin(),
    sms: os.platform() !== 'darwin' ? { ok: false, hata: 'SMS yalnızca macOS\'ta izlenebilir' } : sms?.durum ?? { ok: false, hata: process.env.BEKCI_SMS_ENABLED === 'false' ? 'kapalı (BEKCI_SMS_ENABLED=false)' : 'başlatılmadı' },
    mail: { hesap: hesaplar.length, hata: mailHata, durumlar: mailler.map(m => m.durum) },
    usom: usomHazir(),
    anahtarlar: { gsb: !!process.env.GSB_API_KEY, vt: !!process.env.VT_API_KEY, urlscan: !!process.env.URLSCAN_API_KEY, ntfy: !!process.env.NTFY_TOPIC },
    son: kayitlariOku().slice(0, 40),
  };
}

// ---------------------------------------------------------------- Sohbet aracı (Jarvis'in sesli/yazılı cevabı)

/** macOS panosu (yalnızca kullanıcı "panodaki/kopyaladığım" dediğinde) */
const pano = () => new Promise<string>(ok => (os.platform() === 'darwin' ? execFile('pbpaste', { timeout: 2000 }, (_e, out) => ok(String(out ?? '').slice(0, 5000))) : ok('')));

export async function bekciArac(args: { istek?: string; metin?: string; kaynak?: string }): Promise<string> {
  const istek = String(args.istek ?? 'kontrol');
  if (istek === 'tiklasaydim') {
    if (!son) return JSON.stringify({ hata: 'Henüz analiz edilmiş bir mesaj yok' });
    notify({ type: 'bekci', olay: 'goster', id: son.analiz.id });
    return JSON.stringify({ ok: true, kanit: son.analiz.sandbox?.formAlanlari ?? [], soyle: son.analiz.tiklasaydim });
  }
  let metin = String(args.metin ?? '').trim();
  if (!metin && /pano/.test(String(args.kaynak ?? ''))) metin = (await pano()).trim();
  if (metin) {
    const a = await isle({ id: `el-${Date.now()}`, kaynak: 'el', gonderen: 'yapıştırılan metin', zaman: new Date().toISOString(), metin }, { elle: true });
    if (!a) return JSON.stringify({ hata: 'analiz edilemedi' });
    return JSON.stringify(ozet(a));
  }
  if (!son) return JSON.stringify({ hata: 'Henüz gelen bir mesaj yok. Kullanıcı mesajı yapıştırabilir ya da kopyalayıp "panodaki mesaj güvenli mi" diyebilir.' });
  notify({ type: 'bekci', olay: 'goster', id: son.analiz.id });
  return JSON.stringify(ozet(son.analiz));
}
const ozet = (a: Analiz) => ({ ok: true, puan: a.puan, seviye: a.seviye, kaynak: a.kaynak, gerekceler: a.gerekceler.slice(0, 4), linkler: a.linkler.map(l => ({ alan: l.alan, gun: l.yasGun, usom: l.usom })), soyle: a.cevap });

/** Demo modunda (beyin yok) araç doğrudan: "bu mesaj güvenli mi", "tıklasaydım ne olurdu" */
export function bekciNiyet(t: string): { istek: string } | null {
  const k = katla(t);
  if (/tiklasaydim|tiklasaydin|tiklasam ne ol|acsaydim ne ol/.test(k)) return { istek: 'tiklasaydim' };
  if (/(mesaj|mail|sms|link|e-?posta)\w* (guvenli|guvenilir) mi|son mesaji kontrol|mesaji kontrol et|bu (mesaj|link|mail) (sahte|dolandirici)/.test(k)) return { istek: 'kontrol' };
  return null;
}

// ---------------------------------------------------------------- HTTP

export function bekciRouter() {
  const r = Router();
  r.get('/api/bekci/durum', (_req, res) => res.json(bekciDurum()));
  r.post('/api/bekci/analiz', async (req, res) => {
    const metin = String(req.body?.metin ?? '').trim().slice(0, 10_000);
    if (!metin) return res.status(400).json({ hata: 'metin boş' });
    const a = await isle({ id: `el-${Date.now()}`, kaynak: 'el', gonderen: 'yapıştırılan metin', zaman: new Date().toISOString(), metin }, { elle: true });
    res.json(a);
  });
  r.post('/api/bekci/demo', async (req, res) => {
    const tur = req.body?.tur === 'mail' ? 'mail' : 'sms';
    res.json({ ok: true });
    void demoBaslat(tur);
  });
  r.post('/api/bekci/guvenli', (req, res) => {
    const k = kayitGuncelle(String(req.body?.id ?? ''), { guvenliIsaretli: true });
    if (!k) return res.status(404).json({ hata: 'kayıt yok' });
    notify({ type: 'bekci', olay: 'liste' });
    res.json(k);
  });
  r.post('/api/bekci/beyaz', (req, res) => {
    const gonderen = typeof req.body?.gonderen === 'string' ? req.body.gonderen.slice(0, 200) : undefined;
    const alan = typeof req.body?.alan === 'string' ? req.body.alan.toLowerCase().slice(0, 200) : undefined;
    if (!gonderen && !alan) return res.status(400).json({ hata: 'gönderen ya da alan adı gerekli' });
    const b = beyazEkle({ gonderen, alan });
    notify({ type: 'bekci', olay: 'liste' });
    res.json(b);
  });
  r.post('/api/bekci/bildirim-testi', async (_req, res) => {
    const a = { puan: 0, seviye: 'supheli', kaynak: 'sms', gerekceler: ['Bu bir deneme bildirimidir.'], linkler: [] } as unknown as Analiz;
    res.json(await bildirimGonder(a));
  });
  return r;
}
