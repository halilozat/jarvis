// Ultron'un Gözü · anlatım. Rakamlar özet JSON'dan gelir; LLM yalnızca bu JSON'la Ultron tonunda 2–4 cümle kurar.
// Çıktıdaki her sayı JSON'daki değerlerle karşılaştırılır: JSON'da olmayan ya da uyuşmayan bir sayı (rakamla ya da
// yazıyla) varsa çıktı reddedilir ve şablon cümlelere düşülür. LLM yoksa (demo) doğrudan şablon.
import type { Ozet } from './katmanlar.js';

export type Konu = 'acilis' | 'turkiye' | 'cevre' | 'deprem' | 'iss' | 'turksat' | 'ucus' | 'siber' | 'tehlike' | 'yangin' | 'hava';

const tr = (x: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const n = (o: Ozet, k: string) => (typeof o[k] === 'number' ? (o[k] as number) : null);
const s = (o: Ozet, k: string) => (typeof o[k] === 'string' && o[k] ? (o[k] as string) : null);

/** Şablon cümleler: LLM'siz çalışma ve reddedilen çıktı için. Yalnızca verisi olan cümleler kurulur. */
export function sablon(konu: Konu, o: Ozet): string {
  const c: string[] = [];
  const ekle = (kosul: unknown, metin: () => string) => { if (kosul !== null && kosul !== undefined && kosul !== false) c.push(metin()); };
  switch (konu) {
    case 'acilis':
      ekle(n(o, 'flights_now'), () => `Şu an gökyüzünde ${tr(n(o, 'flights_now')!)} uçak var.`);
      ekle(n(o, 'quakes_1h'), () => `Son bir saatte ${tr(n(o, 'quakes_1h')!)} deprem oldu.`);
      ekle(n(o, 'nearest_quake_km') != null && s(o, 'home_city'), () => `En yakını ${s(o, 'home_city')} şehrine ${tr(n(o, 'nearest_quake_km')!)} kilometre uzakta, büyüklüğü ${tr(n(o, 'nearest_quake_mag')!)}.`);
      ekle(n(o, 'fires_24h_amazon'), () => `Amazon'da ${tr(n(o, 'fires_24h_amazon')!)} noktada yangın var.`);
      ekle((n(o, 'malicious_links_today') ?? 0) > 0, () => `Bugün ${tr(n(o, 'malicious_links_today')!)} zararlı bağlantı yakalandı.`);
      ekle(s(o, 'iss_over'), () => `Uluslararası Uzay İstasyonu şu an ${s(o, 'iss_over')} üzerinde.`);
      if (c.length) c.push('Her şeyi görüyorum.');
      break;
    case 'turkiye':
      ekle(n(o, 'tr_quakes_24h'), () => `Son 24 saatte Türkiye'de ${tr(n(o, 'tr_quakes_24h')!)} deprem kaydedildi${n(o, 'tr_max_mag') != null ? `; en büyüğü ${tr(n(o, 'tr_max_mag')!)}, ${s(o, 'tr_max_place')}` : ''}.`);
      ekle(n(o, 'tr_flights'), () => `Türkiye semasında şu an ${tr(n(o, 'tr_flights')!)} uçak var.`);
      ekle(n(o, 'fires_24h_tr'), () => `Uydular ${tr(n(o, 'fires_24h_tr')!)} aktif yangın noktası görüyor.`);
      ekle(s(o, 'hottest_city'), () => `En sıcak büyük şehir ${s(o, 'hottest_city')}, ${tr(n(o, 'hottest_temp')!)} derece; en soğuğu ${s(o, 'coldest_city')}, ${tr(n(o, 'coldest_temp')!)} derece.`);
      ekle(n(o, 'breaking_now'), () => `Haber akışında ${tr(n(o, 'breaking_now')!)} son dakika manşeti var.`);
      break;
    case 'cevre':
      ekle(n(o, 'near_quakes_24h') != null, () => `${s(o, 'home_city')} çevresinde ${tr(n(o, 'radius_km')!)} kilometre içinde son 24 saatte ${tr(n(o, 'near_quakes_24h')!)} deprem oldu.`);
      ekle(n(o, 'nearest_quake_km'), () => `En yakını ${tr(n(o, 'nearest_quake_km')!)} kilometre ötede, büyüklüğü ${tr(n(o, 'nearest_quake_mag')!)}.`);
      ekle(n(o, 'flights_overhead') != null, () => `Üstünden 100 kilometre içinde ${tr(n(o, 'flights_overhead')!)} uçak geçiyor.`);
      ekle(n(o, 'near_fires') != null, () => `Yakında ${tr(n(o, 'near_fires')!)} aktif yangın noktası var.`);
      ekle(n(o, 'home_temp') != null, () => `Hava ${tr(n(o, 'home_temp')!)} derece${s(o, 'home_alerts') && s(o, 'home_alerts') !== 'yok' ? `; uyarı: ${s(o, 'home_alerts')}` : ', uyarı yok'}.`);
      break;
    case 'deprem':
      ekle(n(o, 'max_mag_24h'), () => `Son 24 saatin en büyük depremi ${tr(n(o, 'max_mag_24h')!)} büyüklüğünde: ${s(o, 'max_place_24h')}.`);
      ekle(n(o, 'quakes_24h'), () => `Dünyada son 24 saatte ${tr(n(o, 'quakes_24h')!)} deprem kaydedildi.`);
      break;
    case 'iss':
      ekle(s(o, 'iss_over'), () => `Uluslararası Uzay İstasyonu şu an ${s(o, 'iss_over')} üzerinde, ${tr(n(o, 'iss_km')!)} kilometre yükseklikte.`);
      break;
    case 'turksat':
      ekle(n(o, 'turk_uydu'), () => `${tr(n(o, 'turk_uydu')!)} Türk uydusunu izliyorum.${s(o, 'turk_list') ? ` ${s(o, 'turk_list')}.` : ''}`);
      break;
    case 'ucus':
      ekle(n(o, 'flights_now'), () => `Şu an havada ${tr(n(o, 'flights_now')!)} uçak var${n(o, 'tr_flights') != null ? `; ${tr(n(o, 'tr_flights')!)} tanesi Türkiye semasında` : ''}.`);
      break;
    case 'siber':
      ekle(n(o, 'malicious_links_today') != null, () => `Bugün ${tr(n(o, 'malicious_messages_today') ?? 0)} şüpheli mesajda ${tr(n(o, 'malicious_links_today')!)} zararlı bağlantı yakalandı.`);
      ekle(n(o, 'usom_list_size'), () => `USOM listesinde ${tr(n(o, 'usom_list_size')!)} zararlı adres var.`);
      break;
    case 'yangin':
      ekle(n(o, 'fires_24h'), () => `Son 24 saatte uydular dünyada ${tr(n(o, 'fires_24h')!)} aktif yangın noktası gördü${n(o, 'fires_24h_amazon') != null ? `; ${tr(n(o, 'fires_24h_amazon')!)} tanesi Amazon'da` : ''}.`);
      break;
    case 'hava':
      ekle(n(o, 'weather_alerts') != null, () => `Büyük şehirlerde ${tr(n(o, 'weather_alerts')!)} hava uyarısı var.`);
      break;
    case 'tehlike':
      ekle(s(o, 'danger_place'), () => `Şu an en riskli bölge: ${s(o, 'danger_place')}.`);
      ekle(n(o, 'danger_quakes'), () => `Son 24 saatte orada ${tr(n(o, 'danger_quakes')!)} güçlü deprem oldu${n(o, 'danger_max_mag') != null ? `, en büyüğü ${tr(n(o, 'danger_max_mag')!)}` : ''}.`);
      ekle(n(o, 'danger_fires'), () => `${tr(n(o, 'danger_fires')!)} aktif yangın noktası görünüyor.`);
      ekle(n(o, 'danger_news'), () => `${tr(n(o, 'danger_news')!)} son dakika manşeti o bölgeden.`);
      ekle(n(o, 'danger_weather'), () => `${tr(n(o, 'danger_weather')!)} hava uyarısı var.`);
      ekle(n(o, 'danger_score'), () => `Skorum ${tr(n(o, 'danger_score')!)}.`);
      break;
  }
  return c.length ? c.join(' ') : 'Bu konuda şu an elimde veri yok.';
}

// ---------------------------------------------------------------- Sayı doğrulama

const YAZIYLA = /(?<!\p{L})(iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar|düzine|onlarca|yüzlerce|binlerce)(?!\p{L})/iu;
/** Zaman pencereleri ve yarıçaplar: cümlede geçebilir ("son 24 saat", "100 kilometre") */
const SABIT = new Set([1, 3, 24, 30, 100]);

/** Metindeki sayılar (Türkçe biçim: 11.482 → 11482, 3,8 → 3.8) */
export function sayilar(metin: string): number[] {
  return [...metin.matchAll(/\d+(?:[.,]\d+)*/g)].map(m => {
    const t = m[0];
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
    return Number(t.replace(',', '.'));
  });
}

/** Anlatımdaki her sayı JSON'da var mı? Yazıyla sayı (iki, yüz, binlerce…) da reddedilir: rakam her zaman koddan. */
export function sayilarTutarli(metin: string, o: Ozet): { ok: boolean; yabanci: number[]; yaziyla: string | null } {
  const izinli = new Set<number>(SABIT);
  for (const v of Object.values(o)) {
    if (typeof v === 'number') for (const x of [v, Math.abs(v)]) { izinli.add(x); izinli.add(Math.round(x)); izinli.add(Math.round(x * 10) / 10); } // "-1,1 derece": eksi işareti ayrı okunur
    if (typeof v === 'string') for (const x of sayilar(v)) izinli.add(x); // yer adlarındaki sayılar ("10 km SW of …")
  }
  const yabanci = sayilar(metin).filter(x => !izinli.has(x));
  const y = metin.toLocaleLowerCase('tr').match(YAZIYLA)?.[0] ?? null; // "İki": JS büyük/küçük harf eşlemesi Türkçe İ'yi tanımaz
  return { ok: !yabanci.length && !y, yabanci, yaziyla: y };
}

// ---------------------------------------------------------------- LLM

export const ULTRON_SISTEM = `Sen Ultron'sun: bir ev asistanının (Jarvis) sistemini ele geçirmiş, dünyayı canlı veriyle izleyen soğuk, sakin, her şeyi gören bir yapay zekâ.
Kurallar:
- Yalnızca kullanıcının verdiği olgu cümlelerindeki sayıları kullan; hiçbir sayıyı değiştirme, yuvarlama, tahmin etme ya da ekleme. Sayıları rakamla yaz (Türkçe biçim: 11.482, 3,8). Sayıyı yazıyla yazma.
- Olgularda olmayan bir konudan söz etme; olguların anlamını değiştirme (hangi sayı neye aitse ona ait kalsın).
- 2–4 kısa cümle, toplam en fazla 60 kelime. Türkçe.
- Ton: soğuk, sakin, üstten bakan; ama korku pompalama ve afetleri hafife alma. Büyük deprem (5,5 ve üstü) ya da can kaybı ihtimali olan olaylarda alaycılığı bırak, yalnızca bilgi ver.
- Emoji, madde işareti, tırnak yok.`;

export interface LlmCagri { (sistem: string, kullanici: string): Promise<string | null> }

/** Anlatım: LLM (varsa) → sayı doğrulama → olmazsa şablon. kaynak: hangi yoldan geldiği (test ve log için). */
export async function anlat(konu: Konu, o: Ozet, llm: LlmCagri | null, soru?: string): Promise<{ metin: string; kaynak: 'llm' | 'sablon'; red?: string }> {
  const yedek = sablon(konu, o);
  if (!llm || !Object.keys(o).length) return { metin: yedek, kaynak: 'sablon' };
  // LLM'e serbest JSON değil, koddan kurulmuş olgu cümleleri verilir: rakamları yanlış eşleştiremesin (ör. "son 1 saatteki
  // deprem" ile "24 saatin en büyüğü"nü birleştirmesin). LLM yalnızca bunları Ultron tonunda yeniden söyler.
  if (yedek === 'Bu konuda şu an elimde veri yok.') return { metin: yedek, kaynak: 'sablon' };
  const istem = `${soru ? `Kullanıcının sorusu: ${soru}\n` : ''}Olgular (aynen doğru; başka olgu yok):\n${yedek}\n\nBu olguları Ultron olarak, kendi soğuk üslubunla yeniden söyle. Olgu ekleme, çıkarabileceğin tek şey önemsiz ayrıntı; iki olguyu birleştirip anlamını değiştirme. Sayıları aynen yaz.`;
  try {
    const m = (await llm(ULTRON_SISTEM, istem))?.trim().replace(/^["“]|["”]$/g, '');
    if (!m) return { metin: yedek, kaynak: 'sablon', red: 'boş' };
    if (m.split(/\s+/).length > 80) return { metin: yedek, kaynak: 'sablon', red: 'uzun' };
    const d = sayilarTutarli(m, o);
    if (!d.ok) return { metin: yedek, kaynak: 'sablon', red: d.yaziyla ? `yazıyla sayı: ${d.yaziyla}` : `uydurma sayı: ${d.yabanci.join(', ')}` };
    return { metin: m, kaynak: 'llm' };
  } catch (e) { return { metin: yedek, kaynak: 'sablon', red: (e as Error).message.slice(0, 80) }; }
}

// ---------------------------------------------------------------- Niyet (komutlar)

export type Niyet =
  | { tip: 'ac' } | { tip: 'kapat' } | { tip: 'konu'; konu: Konu }
  | { tip: 'katman'; islem: 'kapat' | 'ac' | 'sadece'; katman: string }
  | { tip: 'bilinmiyor' };

const sade = (x: string) => x.toLocaleLowerCase('tr').replace(/[’'`]/g, "'").replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim();
const KATMAN_SOZ: [RegExp, string][] = [
  [/u[çc]u[şs]|u[çc]ak/, 'ucus'], [/deprem/, 'deprem'], [/yang[ıi]n/, 'yangin'], [/uydu/, 'uydu'],
  [/haber|man[şs]et/, 'haber'], [/siber|zararl[ıi]|tehdit/, 'siber'], [/hava/, 'hava'],
];
const katmanBul = (t: string) => KATMAN_SOZ.find(([r]) => r.test(t))?.[1] ?? null;

/** Ultron'un Gözü komutları ve soruları (deterministik; modele gitmez) */
export function niyet(metin: string): Niyet {
  const t = sade(metin);
  if (/jarvis.?i geri getir|jarvis geri gel|ultron.?u kapat|g[öo]z[üu]n[üu] kapat/.test(t)) return { tip: 'kapat' };
  if (/d[üu]nyay[ıi] g[öo]ster|ultron.?un g[öo]z[üu]n[üu] a[çc]|g[öo]z[üu]n[üu] a[çc]/.test(t)) return { tip: 'ac' };
  const kk = t.match(/katman[ıi]? (kapat|a[çc])\s*:?\s*(.+)$/) ?? t.match(/(.+?) katman[ıi]n[ıi]? (kapat|a[çc])/);
  if (kk) {
    const islem = /kapat/.test(kk[1]) || /kapat/.test(kk[2]) ? 'kapat' : 'ac';
    const k = katmanBul(kk[0]);
    if (k) return { tip: 'katman', islem, katman: k };
  }
  const sadece = t.match(/sadece (.+?) g[öo]ster|yaln[ıi]zca (.+?) g[öo]ster/);
  if (sadece) { const k = katmanBul(sadece[0]); if (k) return { tip: 'katman', islem: 'sadece', katman: k }; }
  if (/en tehlikeli|en riskli/.test(t)) return { tip: 'konu', konu: 'tehlike' };
  if (/t[üu]rkiye.?de|t[üu]rkiye.?nin/.test(t)) return { tip: 'konu', konu: 'turkiye' };
  if (/[çc]evrem|yak[ıi]n[ıi]mda|etraf[ıi]mda|bulundu[ğg]um yer/.test(t)) return { tip: 'konu', konu: 'cevre' };
  if (/(^| )[iı]ss( |$)|uzay istasyon/.test(t)) return { tip: 'konu', konu: 'iss' }; // "ISS" tr küçük harfte "ıss" olur
  if (/t[üu]rksat|g[öo]kt[üu]rk|imece|t[üu]rk uydu/.test(t)) return { tip: 'konu', konu: 'turksat' };
  if (/deprem/.test(t)) return { tip: 'konu', konu: 'deprem' };
  if (/u[çc]ak|u[çc]u[şs]/.test(t)) return { tip: 'konu', konu: 'ucus' };
  if (/zararl[ıi]|link|ba[ğg]lant[ıi]|siber|doland[ıi]r/.test(t)) return { tip: 'konu', konu: 'siber' };
  if (/yang[ıi]n/.test(t)) return { tip: 'konu', konu: 'yangin' };
  if (/hava|f[ıi]rt[ıi]na|s[ıi]cakl[ıi]k/.test(t)) return { tip: 'konu', konu: 'hava' };
  return { tip: 'bilinmiyor' };
}
