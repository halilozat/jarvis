// Kitaplık · Jarvis'in kitap danışmanlığı.
// 1) Ruh haline göre öneri ("bugün yorgunum, bana bir kitap öner"): önce kullanıcının rafındaki OKUNMAMIŞ kitaplardan
//    seçilir; model yalnızca bu listeden seçebilir. El Kontrolü açıksa önerilen kitap raftan kendiliğinden çıkar.
// 2) Tarz analizi ("tarzımı analiz et, 5 kitap öner"): okuma profili kodla çıkarılır (durumlar, türler, temalar,
//    yazarlar, en çok not alınan kitaplar); model kitaplıkta OLMAYAN kitaplar önerir, her biri Open Library'de ad ve
//    yazarla aranır, bulunamayan (uydurma olabilecek) öneri atılır.
// 3) Kitap sohbeti: okunan kitap hakkında samimi sohbet için kullanıcı mesajına eklenen not (spoiler sınırıyla).
import { Router } from 'express';
import { addBook, chatDeps, foldTitle, readLibrary, type Kitap } from './library.js';

let yayinla: (e: object) => void = () => {};
export function initAdvisor(broadcast: (e: object) => void) { yayinla = broadcast; }

// ———————————————————— Okuma profili ————————————————————

export interface Profil {
  toplam: number; okunacak: number; okunuyor: number; okundu: number; buYil: number;
  turler: { ad: string; n: number }[];
  temalar: { ad: string; n: number }[];
  yazarlar: { ad: string; n: number }[];
  enCokNot: { ad: string; n: number }[];
  sonOkunan: string[];
}

const say = (list: string[], n: number) => {
  const m = new Map<string, { ad: string; n: number }>();
  for (const x of list) { const k = foldTitle(x); if (!k) continue; const v = m.get(k); if (v) v.n++; else m.set(k, { ad: x, n: 1 }); }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, n);
};

export function okumaProfili(kitaplar: Kitap[] = readLibrary().kitaplar): Profil {
  const adli = kitaplar.filter(b => b.ad);
  const yil = new Date().getFullYear();
  return {
    toplam: adli.length,
    okunacak: adli.filter(b => b.durum === 'okunacak').length,
    okunuyor: adli.filter(b => b.durum === 'okunuyor').length,
    okundu: adli.filter(b => b.durum === 'bitti').length,
    buYil: adli.filter(b => b.bittiAt && new Date(b.bittiAt).getFullYear() === yil).length,
    turler: say(adli.map(b => b.jarvis?.tur).filter((x): x is string => !!x), 6),
    temalar: say(adli.flatMap(b => b.jarvis?.temalar ?? []), 8),
    yazarlar: say(adli.map(b => b.yazar).filter((x): x is string => !!x), 6),
    enCokNot: adli.map(b => ({ ad: b.ad!, n: b.notlar.length + b.alintilar.length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5),
    sonOkunan: adli.filter(b => b.bittiAt).sort((a, b) => b.bittiAt!.localeCompare(a.bittiAt!)).slice(0, 5).map(b => b.ad!),
  };
}

function jsonAl(s: string): any {
  const t = s.replace(/```(?:json)?/gi, '');
  const a = t.search(/[[{]/), z = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a < 0 || z <= a) return null;
  try { return JSON.parse(t.slice(a, z + 1)); } catch { return null; }
}

// ———————————————————— Ruh haline göre (raftan) ————————————————————

export interface RafOnerisi { id: string; ad: string; yazar: string | null; neden: string; rafta: boolean; durum: Kitap['durum'] }

const kisaOzet = (b: Kitap) => (b.ozet ?? '').split(/(?<=[.!?])\s+/)[0]?.slice(0, 160) ?? '';

/** Model yalnızca adaylardan seçebilir; seçilmeyen ya da listede olmayan ad atılır */
export function oneriSuz(ham: any, adaylar: Kitap[], adet: number): RafOnerisi[] {
  const adla = new Map(adaylar.map(b => [foldTitle(b.ad!), b]));
  const out: RafOnerisi[] = [];
  for (const x of Array.isArray(ham?.oneriler) ? ham.oneriler : []) {
    // Model listedeki satırı kopyalayabilir ("Ad · Yazar · tür"): ilk parça ad
    const b = typeof x?.ad === 'string' ? adla.get(foldTitle(x.ad)) ?? adla.get(foldTitle(x.ad.split(' · ')[0])) : undefined;
    if (!b || out.some(o => o.id === b.id)) continue;
    const neden = typeof x?.neden === 'string' ? x.neden.trim().slice(0, 240) : '';
    out.push({ id: b.id, ad: b.ad!, yazar: b.yazar, neden, rafta: !!b.kutu, durum: b.durum });
    if (out.length >= adet) break;
  }
  return out;
}

export async function ruhHalineOner(ruhHali: string, adet = 1): Promise<{ oneriler: RafOnerisi[]; aday: number; not?: string }> {
  const kitaplar = readLibrary().kitaplar.filter(b => b.ad);
  // Önce okunmamışlar; hiç yoksa (her şey okunmuşsa) yeniden okunabilecekler
  let adaylar = kitaplar.filter(b => b.durum === 'okunacak');
  if (!adaylar.length) adaylar = kitaplar;
  if (!adaylar.length) return { oneriler: [], aday: 0, not: 'Kitaplık boş.' };
  const liste = adaylar.slice(0, 220).map(b => `- ${b.ad}${b.yazar ? ` · ${b.yazar}` : ''}${b.jarvis?.tur ? ` · ${b.jarvis.tur}` : ''}${b.jarvis?.temalar?.length ? ` · ${b.jarvis.temalar.slice(0, 3).join(', ')}` : ''}${kisaOzet(b) ? ` · ${kisaOzet(b)}` : ''}`).join('\n');
  const istem = `Kullanıcı şöyle hissettiğini söylüyor: "${ruhHali}".
Aşağıda kullanıcının kitaplığında henüz okumadığı kitaplar var. Bu ruh haline en iyi gelecek ${adet} kitabı YALNIZCA bu listeden seç.
Her biri için tek cümlelik, samimi ve somut bir neden yaz (ruh haline nasıl iyi geleceği; kitabın içeriğinden). Kitabı tanımıyorsan seçme.
YALNIZCA JSON döndür: {"oneriler": [{"ad": "listedeki ad, yazıldığı gibi", "neden": "..."}]}
Liste:
${liste}`;
  const metin = await chatDeps.chat(istem);
  let oneriler = oneriSuz(jsonAl(metin), adaylar, adet);
  // Model yoksa (demo) ya da cevap bozuksa: rastgele okunmamış kitap, nedeni uydurulmadan
  if (!oneriler.length) oneriler = adaylar.slice().sort(() => Math.random() - 0.5).slice(0, adet).map(b => ({ id: b.id, ad: b.ad!, yazar: b.yazar, neden: '', rafta: !!b.kutu, durum: b.durum }));
  sonOneri = { tur: 'ruh', ruhHali, oneriler, at: new Date().toISOString() };
  // El Kontrolü: ilk önerilen kitap raftan çıkar · Kitaplığım: öneriler sekmesi yenilenir
  yayinla({ type: 'kitap_oner', id: oneriler[0]?.id ?? null, ad: oneriler[0]?.ad ?? null, ruhHali });
  return { oneriler, aday: adaylar.length };
}

// ———————————————————— Tarz analizi ve yeni kitaplar ————————————————————

export interface YeniOneri { ad: string; yazar: string; neden: string; benzer: string[]; kapak: string | null; yil: number | null; olKey: string | null }

/** Open Library'de ad ve yazarla ara: kitap gerçekten var mı (uydurma öneri atılır) */
export const advisorDeps = {
  async openLibrary(ad: string, yazar: string): Promise<{ var: boolean; kapak: string | null; yil: number | null; key: string | null }> {
    const q = new URLSearchParams({ title: ad, author: yazar, limit: '5', fields: 'title,author_name,cover_i,first_publish_year,key' });
    const r = await fetch(`https://openlibrary.org/search.json?${q}`, { headers: { 'User-Agent': 'Jarvis kisisel asistan (kitap onerisi)' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { var: false, kapak: null, yil: null, key: null };
    const d = (await r.json()) as { docs?: { title: string; author_name?: string[]; cover_i?: number; first_publish_year?: number; key?: string }[] };
    const soyad = foldTitle(yazar).split(' ').pop() ?? '';
    const doc = (d.docs ?? []).find(x => (x.author_name ?? []).some(a => foldTitle(a).includes(soyad)));
    if (!doc) return { var: false, kapak: null, yil: null, key: null };
    return { var: true, kapak: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null, yil: doc.first_publish_year ?? null, key: doc.key ?? null };
  },
};

export interface TarzSonucu { profil: Profil; ozet: string; oneriler: YeniOneri[]; elenen: number; at: string }

export async function tarzaGoreOner(adet = 5): Promise<TarzSonucu> {
  const kitaplar = readLibrary().kitaplar.filter(b => b.ad);
  const profil = okumaProfili(kitaplar);
  const bende = new Set(kitaplar.map(b => foldTitle(b.ad!)));
  const satir = (b: Kitap) => `${b.ad}${b.yazar ? ` (${b.yazar})` : ''}${b.durum === 'bitti' ? ' [okundu]' : b.durum === 'okunuyor' ? ' [okunuyor]' : ''}${b.notlar.length + b.alintilar.length ? ` [${b.notlar.length + b.alintilar.length} not/alıntı]` : ''}`;
  const istem = `Kullanıcının kitaplığı (${kitaplar.length} kitap):
${kitaplar.slice(0, 200).map(satir).join('\n')}
Profil: türler ${profil.turler.map(t => t.ad).join(', ') || '-'}; temalar ${profil.temalar.map(t => t.ad).join(', ') || '-'}; en çok not aldığı kitaplar ${profil.enCokNot.map(t => t.ad).join(', ') || '-'}.
1) Okuma tarzını 2-3 samimi cümleyle özetle ("ozet"): neleri seviyor, nelere yöneliyor. Yalnızca listeye dayan.
2) Kitaplıkta OLMAYAN ${adet * 2} gerçek, yayımlanmış kitap öner (Türkçede bulunabilenler tercih). Her birinde: ad, yazar, tek cümlelik neden (kitaplığındaki hangi kitaplara benzediği üzerinden), "benzer": kitaplığındaki 1-2 kitabın adı, listede yazıldığı gibi.
Emin olmadığın kitabı yazma; ad ve yazar doğru olmalı.
YALNIZCA JSON: {"ozet": "...", "oneriler": [{"ad": "...", "yazar": "...", "neden": "...", "benzer": ["..."]}]}`;
  const ham = jsonAl(await chatDeps.chat(istem));
  const adaylar: { ad: string; yazar: string; neden: string; benzer: string[] }[] = [];
  for (const x of Array.isArray(ham?.oneriler) ? ham.oneriler : []) {
    if (typeof x?.ad !== 'string' || typeof x?.yazar !== 'string' || !x.ad.trim() || !x.yazar.trim()) continue;
    if (bende.has(foldTitle(x.ad)) || adaylar.some(a => foldTitle(a.ad) === foldTitle(x.ad))) continue;
    const benzer = (Array.isArray(x.benzer) ? x.benzer : []).filter((t: unknown): t is string => typeof t === 'string' && bende.has(foldTitle(t))).slice(0, 2);
    adaylar.push({ ad: x.ad.trim().slice(0, 160), yazar: x.yazar.trim().slice(0, 120), neden: typeof x.neden === 'string' ? x.neden.trim().slice(0, 260) : '', benzer });
  }
  // Open Library doğrulaması: aynı anda en fazla 4
  const oneriler: YeniOneri[] = [];
  let elenen = 0;
  for (let i = 0; i < adaylar.length && oneriler.length < adet; i += 4) {
    const grup = adaylar.slice(i, i + 4);
    const sonuc = await Promise.all(grup.map(a => advisorDeps.openLibrary(a.ad, a.yazar).catch(() => ({ var: false, kapak: null, yil: null, key: null }))));
    grup.forEach((a, j) => {
      if (!sonuc[j].var) { elenen++; return; }
      if (oneriler.length < adet) oneriler.push({ ...a, kapak: sonuc[j].kapak, yil: sonuc[j].yil, olKey: sonuc[j].key });
    });
  }
  const ozet = typeof ham?.ozet === 'string' ? ham.ozet.trim().slice(0, 500) : '';
  const s: TarzSonucu = { profil, ozet, oneriler, elenen, at: new Date().toISOString() };
  sonTarz = s;
  yayinla({ type: 'kitap_tarzi' });
  console.log(`[kitaplık] tarz analizi · ${oneriler.length} öneri · ${elenen} doğrulanamadı`);
  return s;
}

/** Öneriyi kitaplığa ekle (okunacaklar) */
export function oneriyiEkle(ad: string, yazar: string) { return addBook(ad, yazar); }

// ———————————————————— Son sonuçlar (Kitaplığım → Öneriler) ————————————————————

let sonOneri: { tur: 'ruh'; ruhHali: string; oneriler: RafOnerisi[]; at: string } | null = null;
let sonTarz: TarzSonucu | null = null;
export const sonOneriler = () => ({ ruh: sonOneri, tarz: sonTarz, profil: okumaProfili() });

// ———————————————————— Kitap sohbeti ————————————————————

/**
 * Kitap sohbeti notu: kullanıcı mesajına eklenir (sistem talimatı değişmez). Kitabın künyesi, kaldığı yer, notları ve
 * alıntıları ile sohbet kuralları. Spoiler sınırı: kullanıcının kaldığı yerden sonrası anlatılmaz.
 */
export function kitapSohbetiNotu(id: string, ilk: boolean): string | null {
  const b = readLibrary().kitaplar.find(x => x.id === id);
  if (!b?.ad) return null;
  const yer = b.durum === 'bitti' ? 'kitabı bitirdi (sonu konuşulabilir)'
    : b.sayfa ? `şu an ${b.sayfa}. sayfada${b.toplamSayfa ? ` (${b.toplamSayfa} sayfanın %${Math.round((b.sayfa / b.toplamSayfa) * 100)}'i)` : ''}`
      : b.durum === 'okunuyor' ? 'okuyor ama kaldığı yer bilinmiyor' : 'henüz başlamadı';
  const satirlar = [
    `Kitap: ${b.ad}${b.yazar ? ` · ${b.yazar}` : ''}${b.jarvis?.tur ? ` · ${b.jarvis.tur}` : ''}`,
    `Okuma durumu: ${yer}.`,
    b.ozet ? `Jarvis'in özeti: ${b.ozet}` : '',
    b.jarvis?.temalar?.length ? `Temalar: ${b.jarvis.temalar.join(', ')}` : '',
    b.notlar.length ? `Kullanıcının notları: ${b.notlar.slice(-8).map(n => `"${n}"`).join('; ')}` : '',
    b.alintilar.length ? `Kullanıcının alıntıları: ${b.alintilar.slice(-5).map(n => `"${n}"`).join('; ')}` : '',
  ].filter(Boolean);
  return `\n\n[Sistem notu: KİTAP SOHBETİ. ${process.env.USER_NAME || 'Kullanıcı'} okuduğu kitap hakkında seninle samimi bir sohbet yapıyor.
${satirlar.join('\n')}
Kurallar: İki kitapsever arkadaş gibi konuş: sıcak, meraklı, kısa (sahne başına 1-2 cümle). Her cevapta en fazla BİR soru sor; onun düşüncesini merak et, sorgu gibi değil.
SPOILER: Kaldığı yerden sonraki olayları, sonu, sürprizleri ASLA anlatma; kaldığı yer bilinmiyorsa önce "nerelerdesin?" diye sor. Kitap bittiyse sonu konuşulabilir.
Kitabı iyi tanımıyorsan uydurma; onun notlarına ve anlattıklarına dayan, bilmediğini dürüstçe söyle.
Notlarına ve alıntılarına doğal biçimde değin ("geçen ... diye not almıştın"). Uygunsa kitaplığındaki başka bir kitapla bağ kur (yalnızca kitaplık listesindekiler).
İlginç bir düşünce söylerse "bunu kitabın notlarına ekleyeyim mi?" diye sor; evet derse \`kitaplik_not_ekle\` ile ekle.
Görsel: "ikon" (book-open) ya da "kart"; uzun liste yok.${ilk ? '\nBu sohbetin İLK mesajı: kısa ve sıcak bir girişle kitaba dair tek bir merak sorusuyla başla.' : ''}]`;
}

// ———————————————————— HTTP (Kitaplığım → Öneriler) ————————————————————

/** libraryRouter'dan ÖNCE bağlanır ("/api/kitaplik/:id" bu yolları yakalamasın) */
export function advisorRouter(): Router {
  const r = Router();
  r.get('/api/kitaplik/oneriler', (_req, res) => res.json(sonOneriler()));
  r.post('/api/kitaplik/oner', async (req, res) => {
    const ruh = String(req.body?.ruh_hali ?? '').trim().slice(0, 300);
    if (!ruh) return res.status(400).json({ error: 'ruh_hali gerekli' });
    try { res.json(await ruhHalineOner(ruh, Math.min(3, Math.max(1, Number(req.body?.adet) || 1)))); }
    catch (e) { res.status(502).json({ error: `Öneri yapılamadı: ${String((e as Error).message).slice(0, 120)}` }); }
  });
  r.post('/api/kitaplik/tarz', async (req, res) => {
    try { res.json(await tarzaGoreOner(Math.min(8, Math.max(3, Number(req.body?.adet) || 5)))); }
    catch (e) { res.status(502).json({ error: `Analiz yapılamadı: ${String((e as Error).message).slice(0, 120)}` }); }
  });
  r.post('/api/kitaplik/oneri-ekle', (req, res) => {
    const a = oneriyiEkle(String(req.body?.ad ?? ''), String(req.body?.yazar ?? ''));
    if ('hata' in a) return res.status(400).json({ error: a.hata });
    res.json(a);
  });
  return r;
}
