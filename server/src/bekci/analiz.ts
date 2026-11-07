// Bekçi · analiz hattı. Katmanlar paralel ve her biri zaman aşımlı (biri düşerse diğerleri devam eder):
//   LİNK (çıkarma, kısaltıcı çözme, marka eşleşmesi) → WHOIS (alan adı yaşı) · USOM · LİSTELER (GSB/VT) · METİN (LLM)
//   → puan → SANDBOX (urlscan; sonuç sonradan gelir, analiz güncellenir).
// Mesaj metni saklanmaz: sonuçta yalnızca gönderen, alan adları (defang), puan ve gerekçeler kalır.
import { alanYasi, onbellekli, safeBrowsing, urlscanBaslat, urlscanSonuc, usomEslesme, usomHazir, usomSorgu, usomYukle, virusTotal, type Sandbox, type Yas } from './kaynaklar.js';
import { htmlLinkleri, linkKur, linkleriCikar, yonlendirmeCoz, type Link } from './link.js';
import { metniAnalizEt, type MetinSonucu } from './llm.js';
import { defang, gunOnce, maskele } from './metin.js';
import { ayarOku, markalariOku, puanla, resmiMi, type Ayar, type LinkBulgu, type MailBulgu, type Sinyal } from './puan.js';
import { UYARI_MAIL, UYARI_SMS } from './kaliplar.js';

export type Kaynak = 'sms' | 'imessage' | 'rcs' | 'mail' | 'el' | 'demo';

/** Analize giren mesaj (bellekte; diske yazılmaz) */
export interface Mesaj {
  id: string;
  kaynak: Kaynak;
  gonderen: string;
  zaman: string;
  metin: string;
  konu?: string;
  mail?: MailBulgu & { htmlLinkler: Link[]; qrLinkler: Link[] };
}

export type AdimAd = 'link' | 'whois' | 'usom' | 'liste' | 'metin' | 'sandbox';
export interface Adim { durum: 'bekliyor' | 'calisiyor' | 'tamam' | 'atlandi' | 'hata'; not: string }

export interface Analiz {
  id: string;
  kaynak: Kaynak;
  gonderen: string;
  zaman: string;
  puan: number;
  seviye: 'tehlikeli' | 'supheli' | 'temiz';
  marka: string | null;
  gerekceler: string[];
  sinyaller: Sinyal[];
  linkler: { goster: string; alan: string; resmi: boolean; yasGun: number | null; yasTarih: string | null; usom: boolean }[];
  adimlar: Record<AdimAd, Adim>;
  model: string | null;
  sandbox: Sandbox | null;
  sureMs: number;
  /** Otomatik uyarıda söylenecek kısa cümle */
  uyari: string;
  /** "Bu mesaj güvenli mi?" cevabı: olgusal, 1–3 kısa cümle */
  cevap: string;
  /** "Tıklasaydım ne olurdu?" cevabı (kanıta göre) */
  tiklasaydim: string;
  demo?: boolean;
  log: string[];
}

/** Demo ve testler için dış kaynakların yerine geçen sonuçlar (ağ isteği yapılmaz) */
export interface Fikstur {
  yas?: Record<string, Yas>;
  usom?: string[];
  gsb?: string[];
  metin?: MetinSonucu | null;
  sandbox?: Sandbox | null;
  yonlendirme?: Record<string, string>;
  adimMs?: number;
}

const bos = (): Record<AdimAd, Adim> => ({ link: { durum: 'bekliyor', not: '' }, whois: { durum: 'bekliyor', not: '' }, usom: { durum: 'bekliyor', not: '' }, liste: { durum: 'bekliyor', not: '' }, metin: { durum: 'bekliyor', not: '' }, sandbox: { durum: 'bekliyor', not: '' } });
const zamanli = <T>(p: Promise<T>, ms: number, yedek: T): Promise<T> => Promise.race([p.catch(() => yedek), new Promise<T>(r => setTimeout(() => r(yedek), ms))]);
const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface AnalizSecenek {
  fikstur?: Fikstur;
  /** Adım ilerledikçe (arayüz için) */
  ilerleme?: (a: Analiz) => void;
  /** Sandbox sonucu sonradan gelince */
  guncel?: (a: Analiz) => void;
  f?: typeof fetch;
  ayar?: Ayar;
}

export async function analizEt(m: Mesaj, o: AnalizSecenek = {}): Promise<Analiz> {
  const t0 = Date.now();
  const ayar = o.ayar ?? ayarOku();
  const markalar = markalariOku();
  const fx = o.fikstur;
  const f = o.f ?? fetch;
  const ms = ayar.zaman_asimi_ms;
  const a: Analiz = {
    id: m.id, kaynak: m.kaynak, gonderen: m.gonderen, zaman: m.zaman, puan: 0, seviye: 'temiz', marka: null, gerekceler: [], sinyaller: [], linkler: [],
    adimlar: bos(), model: null, sandbox: null, sureMs: 0, uyari: '', cevap: '', tiklasaydim: '', demo: !!fx, log: [],
  };
  const yay = () => o.ilerleme?.(structuredClone(a));
  const adim = async (ad: AdimAd, durum: Adim['durum'], not: string, log?: string) => {
    a.adimlar[ad] = { durum, not };
    if (log) a.log.push(log);
    yay();
    if (fx?.adimMs && durum !== 'calisiyor') await bekle(fx.adimMs);
  };

  // 1) LİNK
  await adim('link', 'calisiyor', 'linkler çıkarılıyor', `> ${m.kaynak.toUpperCase()} · ${m.gonderen} · analiz başladı`);
  const tum = [...linkleriCikar(`${m.konu ?? ''} ${m.metin}`), ...(m.mail?.htmlLinkler ?? []), ...(m.mail?.qrLinkler ?? [])];
  const tek = new Map<string, Link>();
  for (const l of tum) if (!tek.has(l.url) || l.gorunen || l.qr) tek.set(l.url, l);
  const linkler: LinkBulgu[] = [...tek.values()].slice(0, 8).map(link => ({ link }));
  await Promise.all(linkler.map(async b => {
    if (!ayar.kisaltici_alanlar.includes(b.link.alan) && !ayar.kisaltici_alanlar.includes(b.link.host)) return;
    const son = fx ? fx.yonlendirme?.[b.link.url] : (await yonlendirmeCoz(b.link.url, f, ms - 500)).son;
    const c = son ? linkKur(son) : null;
    if (c && c.alan !== b.link.alan) b.cozulen = c;
  }));
  for (const b of linkler) b.resmiMarka = resmiMi((b.cozulen ?? b.link).alan, markalar)?.ad ?? null;
  const supheli = linkler.filter(b => !b.resmiMarka);
  await adim('link', 'tamam', linkler.length ? `${linkler.length} link · ${[...new Set(linkler.map(b => (b.cozulen ?? b.link).alan))].join(', ')}` : 'link yok',
    linkler.length ? `LİNK  ${linkler.map(b => defang((b.cozulen ?? b.link).url)).join('  ')}` : 'LİNK  mesajda link yok');

  // 2) Paralel katmanlar
  const alanlar = [...new Set(supheli.map(b => (b.cozulen ?? b.link).alan))].filter(x => !/^\d|:/.test(x)).slice(0, 3);
  const whois = (async () => {
    if (!alanlar.length) return adim('whois', 'atlandi', linkler.length ? 'resmî alan adı' : 'link yok');
    await adim('whois', 'calisiyor', `${alanlar.join(', ')} sorgulanıyor`);
    const sonuc = await Promise.all(alanlar.map(async al => [al, fx ? (fx.yas?.[al] ?? { gun: null, tarih: null, kaynak: null, hata: 'bulunamadı' }) : await zamanli(onbellekli(`yas:${al}`, ayar.onbellek_saat, () => alanYasi(al, f, ms)), ms, { gun: null, tarih: null, kaynak: null, hata: 'zaman aşımı' } as Yas)] as const));
    for (const b of supheli) b.yas = sonuc.find(([al]) => al === (b.cozulen ?? b.link).alan)?.[1];
    const ilk = sonuc[0][1];
    await adim('whois', 'tamam', ilk.gun !== null ? `${alanlar[0]} · ${gunOnce(ilk.gun)} (${ilk.tarih})` : `${alanlar[0]} · kayıt tarihi bilinmiyor`,
      `WHOIS ${sonuc.map(([al, y]) => `${al}: ${y.gun !== null ? `${y.gun} gün (${y.tarih}, ${y.kaynak})` : `bilinmiyor (${y.hata})`}`).join(' · ')}`);
  })();
  const usomK = (async () => {
    if (!supheli.length) return adim('usom', 'atlandi', 'kontrol edilecek link yok');
    await adim('usom', 'calisiyor', 'USOM listesi');
    if (fx) { for (const b of supheli) b.usom = usomEslesme((b.cozulen ?? b.link).host, new Set(fx.usom ?? [])); }
    else {
      // Yerel küme (son 7 gün) + canlı sorgu (bütün liste); biri düşerse diğeri yeter
      void usomYukle(f);
      const canli = await Promise.all(supheli.map(b => { const l = b.cozulen ?? b.link; return onbellekli(`usom:${l.host}`, ayar.onbellek_saat, () => usomSorgu(l.host, l.alan, f, ms)); }));
      supheli.forEach((b, i) => (b.usom = canli[i].eslesme ?? usomEslesme((b.cozulen ?? b.link).host)));
      const hata = canli.find(c => c.hata)?.hata;
      if (hata && !usomHazir() && !supheli.some(b => b.usom)) return adim('usom', 'hata', `sorgulanamadı: ${hata}`, `USOM  sorgulanamadı: ${hata}`);
    }
    const es = supheli.filter(b => b.usom);
    await adim('usom', 'tamam', es.length ? `LİSTEDE: ${es.map(b => b.usom).join(', ')}` : 'listede yok', `USOM  ${es.length ? `eşleşme: ${es.map(b => b.usom).join(', ')}` : 'eşleşme yok (henüz listede değil)'}`);
  })();
  const listeK = (async () => {
    const urls = supheli.map(b => (b.cozulen ?? b.link).url);
    if (fx) {
      if (!urls.length) return adim('liste', 'atlandi', 'link yok');
      for (const b of supheli) b.gsb = (fx.gsb ?? []).includes((b.cozulen ?? b.link).alan);
      return adim('liste', 'tamam', supheli.some(b => b.gsb) ? 'zararlı' : 'temiz (örnek)', 'GSB   örnek sonuç');
    }
    if (!urls.length || (!process.env.GSB_API_KEY && !process.env.VT_API_KEY)) return adim('liste', 'atlandi', urls.length ? 'anahtar yok (GSB/VT)' : 'link yok');
    await adim('liste', 'calisiyor', 'Safe Browsing / VirusTotal');
    const [gsb, vt] = await Promise.all([
      zamanli(safeBrowsing(urls, f, ms), ms, null),
      zamanli(Promise.all(supheli.slice(0, 2).map(b => virusTotal((b.cozulen ?? b.link).url, f, ms))), ms, [] as ({ zararli: number; supheli: number; toplam: number } | null)[]),
    ]);
    for (const b of supheli) b.gsb = !!gsb?.eslesen.includes((b.cozulen ?? b.link).url);
    supheli.slice(0, 2).forEach((b, i) => (b.vt = vt[i] ?? null));
    const k = supheli.filter(b => b.gsb || (b.vt?.zararli ?? 0) >= 2);
    await adim('liste', 'tamam', k.length ? 'zararlı bulundu' : 'temiz', `LİSTE GSB ${gsb ? (gsb.eslesen.length ? 'eşleşme' : 'temiz') : '—'} · VT ${vt.filter(Boolean).map(v => `${v!.zararli}/${v!.toplam}`).join(' ') || '—'}`);
  })();
  let metinSonucu: MetinSonucu | null = null;
  const metinK = (async () => {
    await adim('metin', 'calisiyor', 'metin analiz ediliyor');
    const maskeli = maskele(`${m.konu ? `Konu: ${m.konu}\n` : ''}${m.metin}`);
    metinSonucu = fx ? (fx.metin ?? null) : await metniAnalizEt(maskeli, ms);
    const ms2 = metinSonucu as MetinSonucu | null;
    a.model = ms2?.model ?? 'kural tabanlı';
    await adim('metin', 'tamam', ms2 ? `%${ms2.scam_likelihood} · ${ms2.tactics.join(', ') || 'taktik yok'}` : 'kural tabanlı (beyin yok ya da zaman aşımı)',
      `METİN ${a.model} · ${ms2 ? `%${ms2.scam_likelihood} ${ms2.short_reason_tr}` : 'kural tabanlı'}`);
  })();
  await Promise.all([whois, usomK, listeK, metinK]);

  // 3) Puan
  const p = puanla({ metin: `${m.konu ?? ''} ${m.metin}`, linkler, metinSonucu, mail: m.mail ?? null, markalar, ayar });
  a.puan = p.puan; a.seviye = p.seviye; a.marka = p.marka; a.sinyaller = p.sinyaller;
  a.gerekceler = p.sinyaller.map(s => s.gerekce);
  a.linkler = linkler.map(b => { const l = b.cozulen ?? b.link; return { goster: defang(l.url), alan: l.unicode === l.host ? l.alan : `${l.alan} (${l.unicode})`, resmi: !!b.resmiMarka, yasGun: b.yas?.gun ?? null, yasTarih: b.yas?.tarih ?? null, usom: !!b.usom }; });
  cumleler(a, linkler, metinSonucu);
  a.log.push(`PUAN  ${a.puan}/100 · ${a.seviye.toUpperCase()}`);

  // 4) Sandbox (yalnızca şüpheli linkte; sonuç sonradan gelir)
  const hedef = supheli[0];
  if (fx?.sandbox !== undefined && hedef) {
    a.sandbox = fx.sandbox;
    await adim('sandbox', fx.sandbox ? 'tamam' : 'atlandi', fx.sandbox?.formAlanlari.length ? `form: ${fx.sandbox.formAlanlari.join(', ')}` : 'örnek sonuç yok', fx.sandbox ? `SANDBOX sayfada ${fx.sandbox.formAlanlari.join(', ') || 'form yok'}` : undefined);
    if (fx.sandbox?.formAlanlari.length) { kartFormuEkle(a, ayar); cumleler(a, linkler, metinSonucu); }
  } else if (hedef && a.puan >= ayar.esikler.supheli && process.env.URLSCAN_API_KEY) {
    a.adimlar.sandbox = { durum: 'calisiyor', not: 'urlscan.io (unlisted)' };
    void sandboxIzle(a, (hedef.cozulen ?? hedef.link).url, f, ayar, linkler, metinSonucu, o.guncel);
  } else a.adimlar.sandbox = { durum: 'atlandi', not: process.env.URLSCAN_API_KEY ? 'gerek yok' : 'anahtar yok (urlscan)' };
  a.sureMs = Date.now() - t0;
  yay();
  return a;
}

function kartFormuEkle(a: Analiz, ayar: Ayar) {
  const k = a.sandbox!.formAlanlari;
  if (!k.length || a.sinyaller.some(s => s.kod === 'kart_formu')) return;
  a.sinyaller.unshift({ kod: 'kart_formu', agirlik: ayar.agirliklar.kart_formu ?? 30, gerekce: `Sayfa güvenli ortamda açıldı: ${k.join(', ')} istiyor.` });
  a.gerekceler = a.sinyaller.map(s => s.gerekce);
  a.puan = Math.min(100, a.puan + (ayar.agirliklar.kart_formu ?? 30));
  a.seviye = a.puan >= ayar.esikler.tehlikeli ? 'tehlikeli' : a.puan >= ayar.esikler.supheli ? 'supheli' : 'temiz';
}

async function sandboxIzle(a: Analiz, url: string, f: typeof fetch, ayar: Ayar, linkler: LinkBulgu[], ms: MetinSonucu | null, guncel?: (a: Analiz) => void) {
  try {
    const s = await urlscanBaslat(url, f);
    if (!s) return;
    for (let i = 0; i < 12; i++) {
      await bekle(i === 0 ? 12_000 : 5000);
      const r = await urlscanSonuc(s.uuid, f).catch(() => null);
      if (!r || r.durum === 'bekliyor') continue;
      a.sandbox = r;
      a.adimlar.sandbox = { durum: r.durum === 'tamam' ? 'tamam' : 'hata', not: r.formAlanlari.length ? `form: ${r.formAlanlari.join(', ')}` : r.hata ?? 'hassas form yok' };
      a.log.push(`SANDBOX ${r.formAlanlari.length ? `sayfada ${r.formAlanlari.join(', ')}` : 'hassas form alanı yok'}`);
      kartFormuEkle(a, ayar);
      cumleler(a, linkler, ms);
      guncel?.(structuredClone(a));
      return;
    }
    a.adimlar.sandbox = { durum: 'hata', not: 'zaman aşımı' };
    guncel?.(structuredClone(a));
  } catch (e: any) { a.adimlar.sandbox = { durum: 'hata', not: e?.message || 'urlscan hatası' }; guncel?.(structuredClone(a)); }
}

// ---------------------------------------------------------------- Cümleler (hazır kalıp; model üretmez)


function cumleler(a: Analiz, linkler: LinkBulgu[], ms: MetinSonucu | null) {
  const mail = a.kaynak === 'mail';
  const sahteLink = a.sinyaller.some(s => ['marka_uyusmazligi', 'homograf', 'typosquat', 'usom', 'gsb'].includes(s.kod));
  a.uyari = (mail ? UYARI_MAIL : UYARI_SMS)[sahteLink ? 1 : 0];

  const c: string[] = [];
  const sup = linkler.filter(b => !b.resmiMarka);
  const l = sup[0];
  if (!linkler.length) c.push('Mesajda link yok.');
  else if (!sup.length) c.push(`Link resmî ${linkler[0].resmiMarka} adresine gidiyor.`);
  else {
    if (a.marka) c.push(`Bu link ${a.marka} adresi değil.`);
    if (l.yas?.gun !== null && l.yas?.gun !== undefined && l.yas.gun < 365) c.push(`Alan adı ${gunOnce(l.yas.gun)} alınmış.`);
    if (sup.some(b => b.usom)) c.push("USOM'un zararlı bağlantı listesinde var.");
    else if (sup.some(b => b.gsb)) c.push('Google zararlı olarak işaretlemiş.');
    else c.push(c.length ? 'Ve henüz hiçbir listede yok.' : 'Kontrol ettiğim listelerde henüz yok.');
  }
  if (a.seviye === 'temiz') c.unshift('Bu mesajda bir tuzak görmedim efendim.');
  else if (c.length < 3 && ms?.short_reason_tr) c.push(ms.short_reason_tr);
  a.cevap = c.slice(0, 3).join(' ');

  const k = a.sandbox?.formAlanlari ?? [];
  if (k.includes('kart numarası') || k.includes('CVV')) a.tiklasaydim = 'Tıklasaydınız, kart bilgileriniz çalınacaktı efendim.';
  else if (k.length) a.tiklasaydim = `Tıklasaydınız, sizden ${k.join(' ve ')} isteyecekti efendim.`;
  else if (a.seviye === 'temiz') a.tiklasaydim = 'Bu linkte tehlikeli bir şey bulmadım efendim.';
  else a.tiklasaydim = 'Bunu kesin söyleyemem efendim; sayfayı güvenli bir ortamda inceleme fırsatım olmadı. Ama mesaj sizden ödeme ya da bilgi istediği için, büyük ihtimalle bu bilgileri toplamak için hazırlanmış bir sayfaydı.';
}
