// Haber Modu · arşiv. Her gün için olay kümeleri bir dosyada: server/data/haber-arsivi/YYYY-AA-GG.json (gitignore'da).
// Kullanım: "aynı konu daha önce nasıl anlatılmıştı?", sorulmamış sorularda takip edilmemiş sözler ve bir kez yapılan
// analizin (karşılaştırma, iddia kontrolü, sorular) yeniden model çağrısı olmadan açılması. 90 günden eskisi silinir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kokBenzerligi, type Kume } from './newsCluster.js';

const DIR = process.env.HABER_ARSIV || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'haber-arsivi');
const SAKLA_GUN = 90;

export interface ArsivKaynak { ad: string; baslik: string; ozet: string; url: string; saat: string; metin?: string | null }
export interface ArsivKume {
  id: string;
  tarih: string;
  baslik: string;
  kategori: string;
  ilk: string;
  son: string;
  kaynaklar: ArsivKaynak[];
  kokler: string[];
  /** Bir kez yapılan analiz (newsAnalysis.ts); yeniden açılınca model çağrılmaz */
  analiz?: unknown;
}

type Gun = Map<string, ArsivKume>;
const gunler = new Map<string, Gun>();
const kirli = new Set<string>();
let yazTimer: ReturnType<typeof setTimeout> | null = null;

/** İstanbul saatine göre gün: 2026-10-24 */
export const gunAdi = (iso: string | number | Date) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const dosya = (gun: string) => path.join(DIR, `${gun}.json`);

function yukle(gun: string): Gun {
  let g = gunler.get(gun);
  if (g) return g;
  g = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(dosya(gun), 'utf8')) as { kumeler: ArsivKume[] };
    for (const k of j.kumeler ?? []) g.set(k.id, k);
  } catch { /* o gün yok */ }
  gunler.set(gun, g);
  return g;
}

function yazSonra() {
  if (yazTimer) return;
  yazTimer = setTimeout(() => {
    yazTimer = null;
    try {
      fs.mkdirSync(DIR, { recursive: true });
      for (const gun of kirli) {
        const g = gunler.get(gun);
        if (!g) continue;
        fs.writeFileSync(dosya(gun), JSON.stringify({ tarih: gun, kumeler: [...g.values()] }));
      }
      kirli.clear();
    } catch (e) {
      console.warn('Haber arşivi yazılamadı:', e instanceof Error ? e.message : e);
    }
  }, 1500);
  yazTimer.unref?.();
}

/** Kümeleri arşive işle: yeni kaynaklar eklenir, eski analiz korunur */
export function arsivle(kumeler: Kume[]) {
  for (const k of kumeler) {
    const gun = gunAdi(k.ilk);
    const g = yukle(gun);
    const eski = g.get(k.id);
    const kaynaklar = eski?.kaynaklar ?? [];
    let degisti = !eski;
    for (const h of k.haberler) {
      if (kaynaklar.some(x => x.url === h.url && x.ad === h.source)) continue;
      kaynaklar.push({ ad: h.source, baslik: h.title, ozet: h.summary, url: h.url, saat: h.published_at });
      degisti = true;
    }
    if (!degisti) continue;
    g.set(k.id, { id: k.id, tarih: gun, baslik: k.baslik, kategori: k.kategori, ilk: k.ilk, son: k.son, kaynaklar, kokler: k.kokler, analiz: eski?.analiz });
    kirli.add(gun);
  }
  if (kirli.size) yazSonra();
}

/** Kümeyi bul (son 3 gün) */
export function arsivKume(id: string): ArsivKume | null {
  for (let i = 0; i < 3; i++) {
    const k = yukle(gunAdi(Date.now() - i * 86400_000)).get(id);
    if (k) return k;
  }
  return null;
}

/** Analizi kümeye kaydet (tam metinler dahil) */
export function analizKaydet(id: string, analiz: unknown, metinler?: Record<string, string | null>) {
  const k = arsivKume(id);
  if (!k) return;
  k.analiz = analiz;
  if (metinler) for (const s of k.kaynaklar) if (s.url in metinler) s.metin = metinler[s.url];
  kirli.add(k.tarih);
  yazSonra();
}

export interface OncekiHaber { tarih: string; baslik: string; kaynaklar: { ad: string; baslik: string; url: string; saat: string; ozet: string }[]; benzerlik: number }

/** "Daha önce nasıl anlatılmıştı?": son `gun` gün içinde, bugünden önce, benzer kümeler */
export function oncekiler(kokler: string[], haric: string, gun = 30, n = 3, esik = 0.45): OncekiHaber[] {
  const bugun = gunAdi(Date.now());
  const out: OncekiHaber[] = [];
  for (let i = 1; i <= gun; i++) {
    const g = gunAdi(Date.now() - i * 86400_000);
    if (g === bugun || !fs.existsSync(dosya(g))) continue;
    for (const k of yukle(g).values()) {
      if (k.id === haric) continue;
      const b = kokBenzerligi(kokler, k.kokler);
      if (b >= esik) out.push({ tarih: k.tarih, baslik: k.baslik, kaynaklar: k.kaynaklar.map(s => ({ ad: s.ad, baslik: s.baslik, url: s.url, saat: s.saat, ozet: s.ozet })), benzerlik: +b.toFixed(2) });
    }
  }
  return out.sort((a, b) => b.benzerlik - a.benzerlik || b.tarih.localeCompare(a.tarih)).slice(0, n);
}

/** Arşivde anahtar kelime: başlığında ya da kaynak başlıklarında bütün kelimeler geçen kümeler (son `gun` gün, yeniler önce) */
export function arsivAra(eslesir: (metin: string) => boolean, gun = 90, n = 30): { kume: ArsivKume; gun: string }[] {
  const out: { kume: ArsivKume; gun: string }[] = [];
  for (let i = 0; i <= gun && out.length < n; i++) {
    const g = gunAdi(Date.now() - i * 86400_000);
    if (!gunler.has(g) && !fs.existsSync(dosya(g))) continue;
    for (const k of yukle(g).values()) {
      if (out.length >= n) break;
      if (eslesir(`${k.baslik} ${k.kaynaklar.map(s => s.baslik).join(' ')}`)) out.push({ kume: k, gun: g });
    }
  }
  return out;
}

/** Taranacak arşiv günü sayısı (dosyası olan) */
export const arsivGunSayisi = () => { try { return fs.readdirSync(DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length; } catch { return 0; } };

/** 90 günden eski dosyaları sil (açılışta ve günde bir) */
export function arsivTemizle() {
  try {
    const sinir = gunAdi(Date.now() - SAKLA_GUN * 86400_000);
    for (const f of fs.readdirSync(DIR)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
      if (m && m[1] < sinir) fs.unlinkSync(path.join(DIR, f));
    }
  } catch { /* klasör yok */ }
  // Bellekteki eski günleri bırak (yalnızca son 31 gün tutulur)
  const sinirBellek = gunAdi(Date.now() - 31 * 86400_000);
  for (const g of gunler.keys()) if (g < sinirBellek && !kirli.has(g)) gunler.delete(g);
}
