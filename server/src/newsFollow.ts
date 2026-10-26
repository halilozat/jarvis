// Haber Modu · olay takibi ("Jarvis, bunu takibe al"). Takipteki olaylar server/data/haber-takip.json'da (git'e girmez).
// Her haber taramasında (10 dk) takipteki olayın kümesi aranır: aynı kimlik ya da kök benzerliği yüksek yeni bir küme.
// Yeni bir kaynak o olayı vermişse ya da olayın yeni bir kümesi (gelişmesi) çıkmışsa bildirilir; haber modu kapalıyken
// bile ekranda "SON GELİŞME" uyarısı çıkar. Takip 7 gün sonra kendiliğinden biter.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kokBenzerligi, type Kume } from './newsCluster.js';

const DOSYA = process.env.HABER_TAKIP || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'haber-takip.json');
const SURE_GUN = 7;
/** Bu kadar benzer kökleri olan küme aynı olayın gelişmesi sayılır */
export const TAKIP_BENZERLIK = 0.5;

export interface Takip { id: string; baslik: string; kokler: string[]; kaynaklar: string[]; kumeler: string[]; eklendi: string; son: string }
export interface Gelisme { takip: { id: string; baslik: string }; kume: Kume; yeniKaynaklar: string[]; yeniKume: boolean }

let liste: Takip[] | null = null;
function oku(): Takip[] {
  if (liste) return liste;
  try { liste = JSON.parse(fs.readFileSync(DOSYA, 'utf8')) as Takip[]; } catch { liste = []; }
  return liste;
}
function yaz() {
  try { fs.mkdirSync(path.dirname(DOSYA), { recursive: true }); fs.writeFileSync(DOSYA, JSON.stringify(oku(), null, 1)); }
  catch (e) { console.warn('Haber takibi yazılamadı:', e instanceof Error ? e.message : e); }
}

export const takipListesi = () => oku().filter(t => Date.now() - new Date(t.eklendi).getTime() < SURE_GUN * 86400_000);
export const takipte = (id: string) => takipListesi().some(t => t.id === id || t.kumeler.includes(id));

export function takibeAl(k: Kume): Takip {
  const var_ = oku().find(t => t.id === k.id || t.kumeler.includes(k.id));
  if (var_) return var_;
  const t: Takip = { id: k.id, baslik: k.baslik, kokler: k.kokler, kaynaklar: [...k.kaynaklar], kumeler: [k.id], eklendi: new Date().toISOString(), son: k.son };
  oku().push(t);
  yaz();
  return t;
}

export function takiptenCik(id: string): boolean {
  const l = oku();
  const i = l.findIndex(t => t.id === id || t.kumeler.includes(id));
  if (i < 0) return false;
  l.splice(i, 1);
  yaz();
  return true;
}

/**
 * Yeni taramanın kümelerinde takipteki olayların gelişmeleri. Kayıt güncellenir (aynı gelişme iki kez bildirilmez).
 * Yeni küme: kökleri benzer ama kimliği farklı ve takipten sonra ortaya çıkmış (olayın yeni bir aşaması).
 */
export function gelismeler(kumeler: Kume[]): Gelisme[] {
  const l = oku();
  if (!l.length) return [];
  const out: Gelisme[] = [];
  let degisti = false;
  for (const t of l) {
    if (Date.now() - new Date(t.eklendi).getTime() >= SURE_GUN * 86400_000) continue;
    for (const k of kumeler) {
      const ayni = t.kumeler.includes(k.id);
      const yeniKume = !ayni && k.kaynaklar.length >= 2 && k.ilk > t.son && kokBenzerligi(t.kokler, k.kokler) >= TAKIP_BENZERLIK;
      if (!ayni && !yeniKume) continue;
      const yeniKaynaklar = k.kaynaklar.filter(x => !t.kaynaklar.includes(x));
      if (!yeniKume && !yeniKaynaklar.length) continue;
      out.push({ takip: { id: t.id, baslik: t.baslik }, kume: k, yeniKaynaklar, yeniKume });
      t.kaynaklar = [...new Set([...t.kaynaklar, ...k.kaynaklar])];
      if (yeniKume) t.kumeler.push(k.id);
      if (k.son > t.son) t.son = k.son;
      degisti = true;
    }
  }
  // Süresi dolanlar atılır
  const once = l.length;
  liste = l.filter(t => Date.now() - new Date(t.eklendi).getTime() < SURE_GUN * 86400_000);
  if (degisti || liste.length !== once) yaz();
  return out;
}
