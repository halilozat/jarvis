// Bekçi · açıklanabilir risk puanı. Her sinyal bir ağırlık (config/bekci.json) ve kullanıcıya gösterilecek Türkçe
// bir gerekçe üretir. Kesin kurallar: USOM ya da Safe Browsing eşleşmesi → en az 90; bütün linkler resmî alan adına
// gidiyor ve başka sinyal yoksa → en fazla 20.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gorunenFarkli, iskelet, karisikYazi, type Link } from './link.js';
import type { MetinSonucu, Taktik } from './llm.js';
import { gunOnce, katla, levenshtein } from './metin.js';

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config');

export interface Ayar {
  esikler: { tehlikeli: number; supheli: number };
  agirliklar: Record<string, number>;
  kurallar: { liste_eslesmesi_en_az: number; resmi_alan_en_fazla: number };
  riskli_uzantilar: string[];
  kisaltici_alanlar: string[];
  sessiz_saatler: { bas: string; bit: string };
  birlestirme_dk: number;
  saklama_gun: number;
  zaman_asimi_ms: number;
  onbellek_saat: number;
  demo_adim_ms: number;
}
export interface Marka { ad: string; varyantlar: string[]; resmi: string[]; verified: boolean }

export const ayarOku = (): Ayar => JSON.parse(fs.readFileSync(process.env.BEKCI_AYAR || path.join(KOK, 'bekci.json'), 'utf8'));
export const markalariOku = (): Marka[] => JSON.parse(fs.readFileSync(process.env.BEKCI_MARKALAR || path.join(KOK, 'brands.json'), 'utf8')).markalar;

export interface Sinyal { kod: string; agirlik: number; gerekce: string }

/** Link başına toplanan bulgular */
export interface LinkBulgu {
  link: Link;
  /** Kısaltılmış linkin çözüldüğü hedef */
  cozulen?: Link;
  yas?: { gun: number | null; tarih: string | null; hata?: string };
  usom?: string | null;
  gsb?: boolean;
  vt?: { zararli: number; supheli: number; toplam: number } | null;
  resmiMarka?: string | null;
}

export interface MailBulgu {
  fromAlan: string | null;
  gorunenAd: string | null;
  replyToAlan: string | null;
  auth: { spf?: string; dkim?: string; dmarc?: string } | null;
  ekler: { ad: string; tur: string }[];
}

/** Metinde geçen markalar (kelime sınırıyla; Türkçe karakter ve büyük harf farkı gözetilmez) */
export function markalariBul(metin: string, markalar: Marka[]): Marka[] {
  const k = ` ${katla(metin).replace(/[^a-z0-9.-]+/g, ' ')} `;
  return markalar.filter(m => m.varyantlar.some(v => k.includes(` ${katla(v)} `) || k.includes(` ${katla(v).replace(/\s+/g, '')} `)));
}

/** Kayıtlı alan adı bir markanın resmî listesinde mi */
export const resmiMi = (alan: string, markalar: Marka[]) => markalar.find(m => m.resmi.some(r => alan === r || alan.endsWith(`.${r}`))) ?? null;

const RISKLI_EK = /\.(html?|zip|iso|img|exe|scr|js|vbs|bat|cmd|lnk|msi|jar|docm|xlsm|pptm|dotm|xlam)$/i;

/** Kural tabanlı taktik tespiti (LLM yokken ya da zaman aşımında) */
export function kuralTaktikleri(metin: string): Taktik[] {
  const k = katla(metin);
  const t: Taktik[] = [];
  if (/\b(24|48) saat|hemen|derhal|son gun|bugun icinde|acil\b/.test(k)) t.push('aciliyet');
  if (/odeme|ucret|borc|\d+[.,]?\d* ?tl\b|tahsil/.test(k)) t.push('odeme_talebi');
  if (/ceza|haciz|icra|dava|yasal islem/.test(k)) t.push('ceza_tehdidi');
  if (/kazandiniz|hediye|cekilis|odul|bedava|iade edilecek/.test(k)) t.push('odul_vaadi');
  if (/kart bilgi|cvv|tc kimlik|sifreniz|kimlik bilgi/.test(k)) t.push('kimlik_veya_kart_talebi');
  if (/askiya|bloke|kapatil|dondurul|kisitlan/.test(k)) t.push('hesap_askiya_alma');
  if (/kargo|gonderi(niz)?|teslim edilemedi|adres (bilgi|eksik)/.test(k)) t.push('kargo_teslim_edilemedi');
  return t;
}

const TAKTIK_AD: Record<Taktik, string> = {
  aciliyet: 'aciliyet baskısı', odeme_talebi: 'ödeme talebi', ceza_tehdidi: 'ceza tehdidi', odul_vaadi: 'ödül vaadi',
  kimlik_veya_kart_talebi: 'kimlik ya da kart bilgisi isteği', hesap_askiya_alma: 'hesap askıya alma tehdidi', kargo_teslim_edilemedi: 'teslim edilemeyen kargo bahanesi',
};

export interface Puan { puan: number; seviye: 'tehlikeli' | 'supheli' | 'temiz'; sinyaller: Sinyal[]; marka: string | null; resmiLinkler: number }

export function puanla(g: { metin: string; linkler: LinkBulgu[]; metinSonucu: MetinSonucu | null; mail?: MailBulgu | null; markalar: Marka[]; ayar: Ayar }): Puan {
  const { ayar, markalar } = g;
  const A = ayar.agirliklar;
  const s: Sinyal[] = [];
  const ekle = (kod: string, gerekce: string, agirlik = A[kod] ?? 0) => { if (!s.some(x => x.kod === kod && x.gerekce === gerekce)) s.push({ kod, agirlik, gerekce }); };

  const anilan = markalariBul(`${g.metin} ${g.mail?.gorunenAd ?? ''}`, markalar);
  const llmMarka = g.metinSonucu?.impersonated_brand ? markalar.find(m => katla(m.ad) === katla(g.metinSonucu!.impersonated_brand!) || m.varyantlar.some(v => katla(v) === katla(g.metinSonucu!.impersonated_brand!))) : undefined;
  const marka = anilan[0] ?? llmMarka ?? null;
  let resmiLinkler = 0, liste = false;

  for (const b of g.linkler) {
    const l = b.cozulen ?? b.link;
    const resmi = resmiMi(l.alan, markalar);
    if (resmi) { resmiLinkler++; continue; }
    if (b.cozulen) ekle('kisaltilmis_link', `Kısaltılmış link ${b.link.alan} → ${l.alan} adresine gidiyor.`);
    if (marka && !resmi) ekle('marka_uyusmazligi', `Mesaj ${marka.ad} adına yazılmış ama link ${l.alan} adresine gidiyor; bu ${marka.ad} adresi değil.`);
    const etiket = l.alan.split('.')[0];
    for (const m of markalar) {
      const v = m.varyantlar.map(x => katla(x).replace(/[^a-z0-9]/g, '')).filter(x => x.length >= 3);
      if (v.some(x => katla(l.host).replace(/[^a-z0-9]/g, '').includes(x))) ekle('marka_benzeri_alan', `Alan adı ${m.ad} adını taşıyor ama resmî değil: ${l.unicode}.`);
      for (const r of m.resmi) {
        const re = r.split('.')[0];
        const d = levenshtein(etiket, re);
        if (d > 0 && d <= 2 && re.length >= 4) ekle('typosquat', `${l.alan}, ${m.ad} adresine (${r}) çok benziyor.`);
        if (iskelet(l.alan) === iskelet(r) && l.alan !== r) ekle('homograf', `${l.unicode} adresi ${r} gibi görünmesi için benzer harflerle yazılmış.`);
      }
    }
    if (karisikYazi(l.host)) ekle('homograf', `${l.unicode} adresinde farklı alfabelerin harfleri karışık.`);
    if (/xn--/.test(l.host)) ekle('punycode', `Alan adı uluslararası karakter (punycode) içeriyor: ${l.unicode}.`);
    if (l.ip) ekle('ip_adresli_link', `Link bir alan adı yerine çıplak IP adresine gidiyor: ${l.host}.`);
    const tld = l.alan.split('.').pop() ?? '';
    if (ayar.riskli_uzantilar.includes(tld)) ekle('riskli_uzanti', `.${tld} uzantısı oltalamada sık kullanılıyor.`);
    if (b.link.gorunen) { const f = gorunenFarkli(b.link); if (f) ekle('link_metni_farkli', `Linkte ${f} yazıyor ama ${l.alan} adresine gidiyor.`); }
    if (b.link.qr) ekle('qr_link', `Ekteki QR kod ${l.alan} adresine gidiyor.`);
    if (b.yas?.gun !== null && b.yas?.gun !== undefined) {
      if (b.yas.gun < 7) ekle('alan_7_gun', `Alan adı ${gunOnce(b.yas.gun)} alınmış (${b.yas.tarih}).`);
      else if (b.yas.gun < 30) ekle('alan_30_gun', `Alan adı ${b.yas.gun} gün önce alınmış (${b.yas.tarih}).`);
    }
    if (b.usom) { liste = true; ekle('usom', `${b.usom} USOM'un zararlı bağlantı listesinde.`, 0); }
    if (b.gsb) { liste = true; ekle('gsb', `Google Safe Browsing ${l.alan} adresini zararlı olarak işaretlemiş.`, 0); }
    if (b.vt && b.vt.zararli >= 2) ekle('vt_zararli', `VirusTotal'da ${b.vt.toplam} tarayıcının ${b.vt.zararli} tanesi zararlı diyor.`);
  }

  const m = g.mail;
  if (m) {
    const a = m.auth;
    if (!a || (!a.spf && !a.dkim && !a.dmarc)) ekle('mail_kimlik_yok', 'E-postada gönderen doğrulaması (SPF/DKIM/DMARC) sonucu yok.');
    else {
      if (a.spf && /fail|softfail/.test(a.spf)) ekle('mail_spf_fail', `SPF doğrulaması başarısız (${a.spf}).`);
      if (a.dkim && /fail|none/.test(a.dkim)) ekle('mail_dkim_fail', `DKIM imzası doğrulanamadı (${a.dkim}).`);
      if (a.dmarc && /fail/.test(a.dmarc)) ekle('mail_dmarc_fail', `DMARC doğrulaması başarısız.`);
    }
    if (m.replyToAlan && m.fromAlan && m.replyToAlan !== m.fromAlan) ekle('reply_to_farkli', `Yanıtlar başka bir alan adına gidiyor: ${m.replyToAlan}.`);
    const adMarka = m.gorunenAd ? markalariBul(m.gorunenAd, markalar)[0] : undefined;
    if (adMarka && m.fromAlan && !resmiMi(m.fromAlan, markalar)) ekle('gorunen_ad_marka', `Gönderen adı ${adMarka.ad} ama adres ${m.fromAlan}.`);
    for (const e of m.ekler) if (RISKLI_EK.test(e.ad)) ekle('riskli_ek', `Riskli ek: ${e.ad}.`);
  }

  // Metin (LLM ya da kural tabanlı)
  const ms = g.metinSonucu;
  const taktikler = ms ? ms.tactics : kuralTaktikleri(g.metin);
  const metinPuani = ms ? ms.scam_likelihood : Math.min(60, taktikler.length * 15 + (g.linkler.length ? 10 : 0));
  if (metinPuani > 0) {
    const ad = taktikler.map(t => TAKTIK_AD[t]).join(', ');
    ekle('metin', `${ms ? 'Metin analizi' : 'Kural tabanlı metin analizi'}: %${metinPuani} dolandırıcılık olasılığı${ad ? ` (${ad})` : ''}.`, Math.round(metinPuani * (A.llm_carpani ?? 0.45)));
  }

  let puan = Math.min(100, s.reduce((t, x) => t + x.agirlik, 0));
  if (liste) puan = Math.max(puan, ayar.kurallar.liste_eslesmesi_en_az);
  const baskaSinyal = s.some(x => x.kod !== 'metin') || metinPuani >= 60;
  if (g.linkler.length > 0 && resmiLinkler === g.linkler.length && !baskaSinyal) puan = Math.min(puan, ayar.kurallar.resmi_alan_en_fazla);
  const seviye = puan >= ayar.esikler.tehlikeli ? 'tehlikeli' : puan >= ayar.esikler.supheli ? 'supheli' : 'temiz';
  // Liste eşleşmeleri (kesin kanıt) önce, sonra ağırlık sırası
  const listeMi = (x: Sinyal) => Number(x.kod === 'usom' || x.kod === 'gsb');
  s.sort((a, b) => listeMi(b) - listeMi(a) || b.agirlik - a.agirlik);
  return { puan, seviye, sinyaller: s, marka: marka?.ad ?? null, resmiLinkler };
}
