// Bekçi testleri: link çıkarma, kayıtlı alan adı, homograf, attributedBody, Apple tarihi, maskeleme, defang, puanlama,
// Türkçe sahte/meşru mesaj fixture'ları, e-posta (SPF/DKIM fail + farklı Reply-To), sahte chat.db ile uçtan uca SMS akışı.
// Gerçek ağ isteği yok. Çalıştır: npm run test:bekci (server/)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
process.env.BEKCI_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bekci-'));
for (const k of ['GSB_API_KEY', 'VT_API_KEY', 'URLSCAN_API_KEY', 'NTFY_TOPIC', 'IMAP_ACCOUNTS']) delete process.env[k];
process.env.MOCK = '1';

const { attributedBodyCoz, appleTarih, defang, maskele, katla, levenshtein } = await import('./bekci/metin.js');
const { linkleriCikar, htmlLinkleri, karisikYazi, iskelet, ozelAdres, yonlendirmeCoz, gorunenFarkli, linkKur } = await import('./bekci/link.js');
const { usomAyristir, usomEslesme, usomSorgu, formAlanlari } = await import('./bekci/kaynaklar.js');
const { puanla, ayarOku, markalariOku, kuralTaktikleri } = await import('./bekci/puan.js');
const { sonucuDogrula } = await import('./bekci/llm.js');
const { analizEt } = await import('./bekci/analiz.js');
const { demoSms, demoMail } = await import('./bekci/demo.js');
const { mailCoz, kimlikSonuclari } = await import('./bekci/mail.js');
const { SmsIzleyici } = await import('./bekci/sms.js');
const { sessizMi, tekrarMi, bildirimGonder } = await import('./bekci/depo.js');
const { bekciNiyet } = await import('./bekci/index.js');

let fail = 0, n = 0;
const ok = (ad: string, kosul: boolean, ayrinti = '') => { n++; if (!kosul) fail++; console.log(`${kosul ? '✓' : '✗'} ${ad}${ayrinti ? ` · ${ayrinti}` : ''}`); };
const ayar = ayarOku(), markalar = markalariOku();
const gunOnce = (g: number) => ({ gun: g, tarih: new Date(Date.now() - g * 864e5).toISOString().slice(0, 10), kaynak: 'rdap' as const });

// 1) attributedBody: typedstream örneği (NSString + önek + uzunluk + UTF-8)
{
  const metin = 'PTT: Gönderiniz teslim edilemedi ptt-ornek.xyz';
  const b = Buffer.from(metin, 'utf8');
  const blob = Buffer.concat([Buffer.from('\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString\x01\x94\x84\x01+', 'latin1'), Buffer.from([b.length]), b, Buffer.from('\x86\x84\x02iI\x01', 'latin1')]);
  ok('attributedBody (kısa)', attributedBodyCoz(blob) === metin, attributedBodyCoz(blob) ?? 'null');
  const uzun = 'a'.repeat(300) + ' şüpheli';
  const ub = Buffer.from(uzun, 'utf8');
  const len = Buffer.alloc(2); len.writeUInt16LE(ub.length);
  const blob2 = Buffer.concat([Buffer.from('xxNSString\x01\x94\x84\x01+\x81', 'latin1'), len, ub, Buffer.from('\x86', 'latin1')]);
  ok('attributedBody (0x81 uzunluk)', attributedBodyCoz(blob2) === uzun);
  ok('attributedBody (bozuk)', attributedBodyCoz(Buffer.from('rastgele')) === null);
}
// 2) Apple tarihi
{
  const t = appleTarih(752_000_000_000_000_000); // nanosaniye
  const t2 = appleTarih(752_000_000); // saniye
  ok('Apple tarihi (ns ve sn)', !!t && !!t2 && t.getTime() === t2.getTime() && t.toISOString().startsWith('2024-10-30'), t?.toISOString());
}
// 3) Link çıkarma
{
  const l = linkleriCikar('Odeme icin: ptt-ornek.xyz/odeme. Ayrica https://bit.ly/3abc) ve www.ornek.com.tr, v1.2 surum, ali@ornek.com');
  ok('şemasız + noktalama', l.some(x => x.url === 'https://ptt-ornek.xyz/odeme' && x.alan === 'ptt-ornek.xyz'), l.map(x => x.url).join(' '));
  ok('kısaltılmış link', l.some(x => x.alan === 'bit.ly' && x.url === 'https://bit.ly/3abc'));
  ok('www ve .com.tr kayıtlı alan', l.some(x => x.alan === 'ornek.com.tr'));
  ok('sürüm numarası ve e-posta link değil', !l.some(x => /v1\.2|ornek\.com$/.test(x.host)));
  ok('alt alan adı → kayıtlı alan', linkKur('https://giris.turkiye.gov.tr.ornek.xyz/a')!.alan === 'ornek.xyz');
  const h = htmlLinkleri('<a href="https://kotu.example.xyz/x">www.turkiye.gov.tr</a>');
  ok('görünen metin ↔ href farkı', gorunenFarkli(h[0]) === 'turkiye.gov.tr', `${h[0].alan} ↔ ${gorunenFarkli(h[0])}`);
}
// 4) Homograf, typosquat, özel ağ, defang, maskeleme
{
  ok('Kiril-Latin karışık', karisikYazi('xn--ptt-6cd.gov.tr') || karisikYazi('рtt.gov.tr'), 'рtt (Kiril р)');
  ok('tamamen Kiril benzeri', karisikYazi('аррӏе.com') || karisikYazi('раураl.com'));
  ok('iskelet rn→m', iskelet('rnicrosoft') === 'microsoft');
  ok('Levenshtein', levenshtein('ptt', 'pttt') === 1 && levenshtein('turkiye', 'turkiey') === 2);
  ok('özel ağ (SSRF)', ozelAdres('127.0.0.1') && ozelAdres('10.1.2.3') && ozelAdres('192.168.1.1') && ozelAdres('169.254.169.254') && ozelAdres('::1') && !ozelAdres('8.8.8.8'));
  ok('defang', defang('https://ptt-ornek.xyz/odeme?a=1.2') === 'hxxps://ptt-ornek[.]xyz/odeme?a=1.2', defang('https://ptt-ornek.xyz/odeme?a=1.2'));
  const m = maskele('Tel 0532 123 45 67, mail ali@ornek.com, IBAN TR33 0006 1005 1978 6457 8413 26, kart 4111 1111 1111 1111, TC 10000000146');
  ok('maskeleme', !/0532|ali@|TR33|4111|10000000146/.test(m) && /\[TELEFON\].*\[E-POSTA\].*\[IBAN\].*\[KART\].*\[TC\]/.test(m), m);
  ok('Türkçe katlama', katla('ÖDEME İADE Şubat') === 'odeme iade subat');
}
// 5) Kısaltıcı çözme: SSRF koruması ve en fazla 5 adım (sahte fetch; ağ yok)
{
  const sahte = (async (u: string) => new Response(null, { status: 301, headers: { location: u.includes('bit.ly') ? 'http://127.0.0.1/admin' : 'https://x.example/' } })) as unknown as typeof fetch;
  const r = await yonlendirmeCoz('https://93.184.216.34/a', sahte, 1000);
  ok('yönlendirme özel ağa gitmez', !!r.hata && /özel ağ/.test(r.hata) || r.zincir.length <= 6, r.hata ?? r.son);
}
// 6) USOM ve sandbox form alanları
{
  const s = usomAyristir(JSON.stringify({ totalCount: 3, models: [{ url: 'kotu-site.xyz', type: 'domain' }, { url: 'http://www.zararli.example.top/yol', type: 'url' }, { url: 'x.dinamik-dns.example', type: 'domain' }] }));
  ok('USOM ayrıştırma ve üst alan eşleşmesi', usomEslesme('a.b.kotu-site.xyz', s) === 'kotu-site.xyz' && usomEslesme('zararli.example.top', s) === 'zararli.example.top' && usomEslesme('temiz.com', s) === null && usomEslesme('y.dinamik-dns.example', s) === null);
  let html = false; try { usomAyristir('<!DOCTYPE html><html>'); } catch { html = true; }
  ok('USOM: HTML sayfa liste sayılmaz', html);
  const r = await usomSorgu('giris.kotu-site.xyz', 'kotu-site.xyz', (async (u: string) => new Response(JSON.stringify({ models: [{ url: u.includes('q=kotu-site.xyz') ? 'kotu-site.xyz' : 'baska.com' }] }))) as unknown as typeof fetch);
  ok('USOM canlı sorgu', r.eslesme === 'kotu-site.xyz');
  const f = formAlanlari('<input name="cardNumber" autocomplete="cc-number"><input name="cvv"><input id="skt" placeholder="AA/YY"><input type="password" name="sifre">');
  ok('kart formu tespiti', f.includes('kart numarası') && f.includes('CVV') && f.includes('son kullanma tarihi') && f.includes('şifre'), f.join(', '));
}
// 7) LLM çıktısı doğrulama
{
  const v = sonucuDogrula('Sonuç: {"scam_likelihood": 140, "tactics": ["aciliyet","uydurma"], "impersonated_brand": "null", "short_reason_tr": "x"}', 'm');
  ok('LLM şeması', v?.scam_likelihood === 100 && v.tactics.join() === 'aciliyet' && v.impersonated_brand === null);
  ok('LLM bozuk çıktı', sonucuDogrula('üzgünüm', 'm') === null);
}
// 8) Türkçe fixture'lar: sahte (bir kısmı Türkçe karaktersiz) ve meşru
const SAHTE: [string, string, Record<string, ReturnType<typeof gunOnce>>][] = [
  ['kargo', 'Aras Kargo: Gonderiniz adres eksikligi nedeniyle bekletilmektedir. 24 saat icinde 12,50 TL odeme yapiniz: araskargo-teslim.click/a', { 'araskargo-teslim.click': gunOnce(2) }],
  ['e-Devlet iade', 'e-Devlet: 1.240 TL vergi iadeniz hazir. Iade icin kart bilgilerinizi girin: edevlet-iade.online', { 'edevlet-iade.online': gunOnce(9) }],
  ['banka askı', 'Ziraat: Hesabiniz askiya alinmistir. Kisitlamayi kaldirmak icin hemen giris yapin ziraat-guvenlik.xyz', { 'ziraat-guvenlik.xyz': gunOnce(1) }],
  ['HGS borcu', 'PTT HGS: 3 adet gecis ihlaliniz bulunmaktadir. Ceza almamak icin derhal odeyin: hgs-odeme.top', { 'hgs-odeme.top': gunOnce(4) }],
  ['çekiliş', 'Tebrikler! Trendyol cekilisinde iPhone kazandiniz. Kargo ucreti 29 TL: trendyoI-hediye.shop', { 'trendyoi-hediye.shop': gunOnce(6) }],
];
for (const [ad, metin, yas] of SAHTE) {
  const a = await analizEt({ id: `t-${ad}`, kaynak: 'sms', gonderen: '+90 500 000 00 00', zaman: new Date().toISOString(), metin }, { fikstur: { yas, usom: [], gsb: [], metin: null, sandbox: null } });
  ok(`sahte: ${ad}`, a.seviye === 'tehlikeli', `${a.puan}/100 · ${a.gerekceler.slice(0, 2).join(' | ')}`);
}
const MESRU: [string, string][] = [
  ['OTP', 'Dogrulama kodunuz: 482913. Bu kodu kimseyle paylasmayin.'],
  ['resmî link', 'PTT: Gonderiniz dagitima cikmistir. Takip: https://www.ptt.gov.tr/gonderi-takip'],
  ['kişisel', 'Aksam 8 gibi bizdeyiz, ekmek alir misin?'],
];
for (const [ad, metin] of MESRU) {
  const a = await analizEt({ id: `m-${ad}`, kaynak: 'sms', gonderen: 'PTT', zaman: new Date().toISOString(), metin }, { fikstur: { usom: [], gsb: [], metin: null, sandbox: null } });
  ok(`meşru: ${ad}`, a.seviye === 'temiz' && (ad !== 'resmî link' || a.puan <= ayar.kurallar.resmi_alan_en_fazla), `${a.puan}/100 · ${a.cevap}`);
}
// 9) Kesin kurallar
{
  const a = await analizEt({ id: 'usom', kaynak: 'sms', gonderen: 'x', zaman: new Date().toISOString(), metin: 'Bilgi: kotu-site.xyz' }, { fikstur: { usom: ['kotu-site.xyz'], gsb: [], metin: null, sandbox: null } });
  ok('USOM eşleşmesi → en az 90', a.puan >= 90 && a.gerekceler[0].includes('USOM'), `${a.puan} · ${a.cevap}`);
}
// 10) Demo: Senaryo A, C, D
{
  const d = demoSms();
  const adimlar: string[] = [];
  const a = await analizEt(d.mesaj, { fikstur: { ...d.fikstur, adimMs: 0 }, ilerleme: x => adimlar.push(Object.entries(x.adimlar).map(([k, v]) => `${k}:${v.durum}`).join(',')) });
  ok('demo SMS tehlikeli', a.seviye === 'tehlikeli' && a.puan >= 90, `${a.puan}/100`);
  ok('Senaryo A uyarısı', a.uyari === 'Efendim, gelen mesajdaki link sahte. Lütfen tıklamayın.' || a.uyari.startsWith('Efendim, son mesaj güvenli değil'), a.uyari);
  ok('Senaryo C cevabı', a.cevap === 'Bu link PTT adresi değil. Alan adı üç gün önce alınmış. Ve henüz hiçbir listede yok.', a.cevap);
  ok('Senaryo D (kanıtlı)', a.tiklasaydim === 'Tıklasaydınız, kart bilgileriniz çalınacaktı efendim.', a.tiklasaydim);
  ok('adımlar ilerliyor', adimlar.length >= 8 && adimlar.at(-1)!.includes('sandbox:tamam'), `${adimlar.length} güncelleme`);
  ok('link defang', a.linkler[0].goster === 'hxxps://ptt-ornek[.]xyz/odeme');
  const kanitsiz = await analizEt({ ...d.mesaj, id: 'kanitsiz' }, { fikstur: { ...d.fikstur, sandbox: null } });
  ok('Senaryo D (kanıtsız temkinli)', kanitsiz.tiklasaydim.startsWith('Bunu kesin söyleyemem'), kanitsiz.tiklasaydim.slice(0, 60));
  const m = demoMail();
  const am = await analizEt(m.mesaj, { fikstur: m.fikstur });
  ok('Senaryo B (mail)', am.seviye === 'tehlikeli' && am.uyari.includes('mail') && am.gerekceler.some(g => g.includes('SPF')) && am.gerekceler.some(g => g.includes('Yanıtlar')) && am.gerekceler.some(g => g.includes('Linkte')), `${am.puan}/100 · ${am.gerekceler.length} gerekçe`);
}
// 11) Ham e-posta: SPF/DKIM fail + farklı Reply-To + HTML link; meşru bülten
{
  const ham = ['From: "e-Devlet Kapisi" <bilgi@edevlet-ornek.top>', 'Reply-To: destek@baska-ornek.xyz', 'To: kisi@example.com', 'Subject: Son bildirim',
    'Authentication-Results: mx.example.com; spf=fail smtp.mailfrom=edevlet-ornek.top; dkim=none; dmarc=fail', 'MIME-Version: 1.0', 'Content-Type: text/html; charset=utf-8', '',
    '<p>Cezaniz var. <a href="https://edevlet-ornek.top/giris">www.turkiye.gov.tr</a></p>'].join('\r\n');
  const m = await mailCoz(ham, 'mail-test');
  ok('MIME ayrıştırma', m.mail?.fromAlan === 'edevlet-ornek.top' && m.mail.replyToAlan === 'baska-ornek.xyz' && m.mail.auth?.spf === 'fail' && m.mail.htmlLinkler[0]?.gorunen === 'www.turkiye.gov.tr', JSON.stringify(m.mail?.auth));
  const a = await analizEt(m, { fikstur: { yas: { 'edevlet-ornek.top': gunOnce(5) }, usom: [], gsb: [], metin: null, sandbox: null } });
  ok('sahte mail tehlikeli', a.seviye === 'tehlikeli', `${a.puan}/100`);
  const bulten = ['From: Trendyol <bulten@trendyol.com>', 'Subject: Haftanin firsatlari', 'Authentication-Results: mx; spf=pass; dkim=pass; dmarc=pass', 'Content-Type: text/plain; charset=utf-8', '', 'Yeni sezon urunleri: https://www.trendyol.com/kampanya'].join('\r\n');
  const b = await analizEt(await mailCoz(bulten, 'b'), { fikstur: { usom: [], gsb: [], metin: null, sandbox: null } });
  ok('meşru bülten temiz', b.seviye === 'temiz', `${b.puan}/100`);
  ok('kimlik başlığı yoksa null', kimlikSonuclari([]) === null);
}
// 12) Sessiz saat, tekrar birleştirme, bildirim (sahte ntfy; link defang'li, mesaj metni yok)
{
  ok('sessiz saat (gece yarısını aşan)', sessizMi({ bas: '23:00', bit: '07:00' }, new Date(2026, 0, 1, 2, 0)) && !sessizMi({ bas: '23:00', bit: '07:00' }, new Date(2026, 0, 1, 12, 0)));
  const x = { gonderen: 'g1', linkler: [{ alan: 'a.xyz' }] } as any;
  ok('10 dk birleştirme', !tekrarMi(x, 10) && tekrarMi(x, 10) && tekrarMi({ gonderen: 'baska', linkler: [{ alan: 'a.xyz' }] } as any, 10));
  process.env.NTFY_TOPIC = 'test-topic';
  let govde = '';
  const d = demoSms();
  const a = await analizEt(d.mesaj, { fikstur: d.fikstur });
  const r = await bildirimGonder(a, (async (_u: string, i: RequestInit) => { govde = String(i.body); return new Response('{}'); }) as unknown as typeof fetch);
  const j = JSON.parse(govde);
  ok('ntfy bildirimi', r.ok && j.topic === 'test-topic' && j.title === 'Bekçi: Şüpheli mesaj' && j.priority === 5 && j.message.includes('hxxps://ptt-ornek[.]xyz') && !j.message.includes('Gonderiniz'), j.message.split('\n')[0]);
  delete process.env.NTFY_TOPIC;
}
// 13) Sesli komut niyetleri
ok('niyet: güvenli mi', bekciNiyet('Jarvis bu mesaj güvenli mi')?.istek === 'kontrol' && bekciNiyet('son mesajı kontrol et')?.istek === 'kontrol');
ok('niyet: tıklasaydım', bekciNiyet('tıklasaydım ne olacaktı')?.istek === 'tiklasaydim' && bekciNiyet('hava nasıl') === null);
ok('kural tabanlı taktikler (Türkçe karaktersiz)', kuralTaktikleri('24 saat icinde odeme yapmazsaniz gonderiniz iade edilecek').length >= 3);

// 14) Uçtan uca: sahte chat.db (salt okunur açılır, yalnızca yeni ve gelen mesajlar)
{
  const db = path.join(process.env.BEKCI_DATA!, 'chat.db');
  const w = new DatabaseSync(db);
  w.exec(`CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT); CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, date INTEGER, service TEXT, handle_id INTEGER, is_from_me INTEGER);
    INSERT INTO handle VALUES (1, '+905000000000'); INSERT INTO message VALUES (1, 'eski mesaj', NULL, 700000000000000000, 'SMS', 1, 0);`);
  const gelen: string[] = [];
  const iz = new SmsIzleyici(m => gelen.push(`${m.kaynak}|${m.gonderen}|${m.metin}`), db);
  iz.baslat();
  const b = Buffer.from('PTT: odeme ptt-ornek.xyz', 'utf8');
  const blob = Buffer.concat([Buffer.from('NSString\x01\x94\x84\x01+', 'latin1'), Buffer.from([b.length]), b]);
  const ins = w.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?, ?, ?)');
  ins.run(2, null, blob, 752_000_000_000_000_000, 'iMessage', 1, 0);
  ins.run(3, 'benim gonderdigim', null, 752_000_000_000_000_000, 'SMS', 1, 1);
  ins.run(4, 'RCS mesaji', null, 752_000_000_000_000_000, 'RCS', 1, 0);
  iz.yokla();
  iz.durdur();
  w.close();
  ok('chat.db: yeni gelenler, eskiler ve giden yok', gelen.length === 2 && gelen[0] === 'imessage|+905000000000|PTT: odeme ptt-ornek.xyz' && gelen[1].startsWith('rcs|'), gelen.join(' / '));
  const yok = new SmsIzleyici(() => {}, '/olmayan/yol/chat.db');
  yok.baslat(); yok.durdur();
  ok('erişim yoksa çökmez', !yok.durum.ok && !!yok.durum.kurulum, yok.durum.hata);
}

console.log(`${n - fail}/${n} Bekçi testi geçti`);
if (fail) process.exit(1);
process.exit(0);
