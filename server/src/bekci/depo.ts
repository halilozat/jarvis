// Bekçi · yerel depo ve bildirim. Mesaj gövdesi SAKLANMAZ: yalnızca kimlik (hash), gönderen, alan adları (defang),
// puan ve gerekçeler; saklama süresi dolanlar (varsayılan 30 gün) silinir. Telefona bildirim: ntfy (link defang'li,
// mesajın tamamı yok). Sessiz saatlerde sesli uyarı yok, yalnızca push. Aynı alan adı/gönderen 10 dk içinde birleşir.
import fs from 'node:fs';
import path from 'node:path';
import type { Analiz } from './analiz.js';
import { VERI } from './kaynaklar.js';
import type { Ayar } from './puan.js';

const KAYIT = () => path.join(VERI, 'kayitlar.json');
const BEYAZ = () => path.join(VERI, 'beyaz.json');

export type Kayit = Omit<Analiz, 'log'> & { guvenliIsaretli?: boolean };

export function kayitlariOku(): Kayit[] {
  try { return JSON.parse(fs.readFileSync(KAYIT(), 'utf8')); } catch { return []; }
}
export function kayitEkle(a: Analiz, ayar: Ayar) {
  const sinir = Date.now() - ayar.saklama_gun * 86_400_000;
  const { log: _log, ...k } = a;
  void _log;
  const l = [k, ...kayitlariOku().filter(x => x.id !== a.id && Date.parse(x.zaman) > sinir)].slice(0, 500);
  fs.mkdirSync(VERI, { recursive: true });
  fs.writeFileSync(KAYIT(), JSON.stringify(l));
}
export function kayitGuncelle(id: string, d: Partial<Kayit>) {
  const l = kayitlariOku();
  const i = l.findIndex(x => x.id === id);
  if (i < 0) return null;
  l[i] = { ...l[i], ...d };
  fs.writeFileSync(KAYIT(), JSON.stringify(l));
  return l[i];
}

export interface Beyaz { gonderenler: string[]; alanlar: string[] }
export function beyazOku(): Beyaz {
  try { const b = JSON.parse(fs.readFileSync(BEYAZ(), 'utf8')); return { gonderenler: b.gonderenler ?? [], alanlar: b.alanlar ?? [] }; } catch { return { gonderenler: [], alanlar: [] }; }
}
export function beyazEkle(d: { gonderen?: string; alan?: string }) {
  const b = beyazOku();
  if (d.gonderen && !b.gonderenler.includes(d.gonderen)) b.gonderenler.push(d.gonderen);
  if (d.alan && !b.alanlar.includes(d.alan)) b.alanlar.push(d.alan);
  fs.mkdirSync(VERI, { recursive: true });
  fs.writeFileSync(BEYAZ(), JSON.stringify(b, null, 2));
  return b;
}
export const beyazdaMi = (gonderen: string, alanlar: string[], b = beyazOku()) => b.gonderenler.includes(gonderen) || (alanlar.length > 0 && alanlar.every(a => b.alanlar.includes(a)));

/** "00:00"–"08:00" aralığında mı (gece yarısını aşan aralık da olur: "23:00"–"07:00") */
export function sessizMi(s: { bas: string; bit: string }, t = new Date()): boolean {
  const dk = (x: string) => { const [h, m] = x.split(':').map(Number); return h * 60 + (m || 0); };
  const n = t.getHours() * 60 + t.getMinutes(), a = dk(s.bas), b = dk(s.bit);
  return a === b ? false : a < b ? n >= a && n < b : n >= a || n < b;
}

/** 10 dk içinde aynı alan adı ya da gönderen için yeniden uyarma */
const sonUyari = new Map<string, number>();
export function tekrarMi(a: Pick<Analiz, 'gonderen' | 'linkler'>, dk: number): boolean {
  const anahtarlar = [`g:${a.gonderen}`, ...a.linkler.map(l => `a:${l.alan}`)];
  const simdi = Date.now();
  const tekrar = anahtarlar.some(k => simdi - (sonUyari.get(k) ?? 0) < dk * 60_000);
  for (const k of anahtarlar) sonUyari.set(k, simdi);
  return tekrar;
}

/** ntfy bildirimi: başlık, puan ve en fazla 2 gerekçe; link tıklanamaz */
export async function bildirimGonder(a: Analiz, f: typeof fetch = fetch): Promise<{ ok: boolean; hata?: string }> {
  const topic = process.env.NTFY_TOPIC?.trim();
  if (!topic) return { ok: false, hata: 'NTFY_TOPIC tanımlı değil' };
  const url = (process.env.NTFY_URL?.trim() || 'https://ntfy.sh').replace(/\/+$/, '');
  const kaynak = a.kaynak === 'mail' ? 'mail' : 'mesaj';
  const govde = [`Risk ${a.puan}/100 · ${a.seviye === 'tehlikeli' ? 'TEHLİKELİ' : 'şüpheli'} ${kaynak}`, ...a.gerekceler.slice(0, 2), a.linkler[0] ? `Link: ${a.linkler[0].goster}` : ''].filter(Boolean).join('\n');
  try {
    // JSON yayın: başlıkta Türkçe karakter (HTTP başlıkları ASCII olmak zorunda)
    const r = await f(url, {
      method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title: a.seviye === 'tehlikeli' ? 'Bekçi: Şüpheli mesaj' : 'Bekçi: Dikkat', message: govde, priority: a.seviye === 'tehlikeli' ? 5 : 3, tags: [a.seviye === 'tehlikeli' ? 'rotating_light' : 'warning'] }),
    });
    return r.ok ? { ok: true } : { ok: false, hata: `ntfy HTTP ${r.status}` };
  } catch (e: any) { return { ok: false, hata: e?.message || 'ntfy gönderilemedi' }; }
}
