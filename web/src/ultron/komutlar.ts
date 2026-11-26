// Ultron Paketi · uygulama genelindeki sesli/yazılı komutlar (modele gitmez).
// "Savaş modunu başlat", "Ultron uyan" → Savaş Modu · "Ultron, dünyayı göster", "Ultron'un gözünü aç" → Ultron'un Gözü
// "Jarvis'i geri getir" → Ultron kapanır. Göz açıkken diğer sözler doğrudan Ultron'a gider (sunucu niyeti çözer).
export type UltronKomut = { tip: 'savas' } | { tip: 'goz' } | { tip: 'kapat' };
const sade = (s: string) => s.toLocaleLowerCase('tr').replace(/[’'`]/g, "'").replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim();

export function ultronKomutu(metin: string, acik: 'savas' | 'goz' | null): UltronKomut | null {
  const t = sade(metin);
  if (/jarvis.?i geri getir|jarvis geri gel|ultron.?u kapat|ultron.?dan [çc][ıi]k/.test(t)) return acik ? { tip: 'kapat' } : null;
  if (/sava[şs] modu(nu)? (ba[şs]lat|a[çc])|ultron uyan|ultron.?u uyand[ıi]r/.test(t)) return { tip: 'savas' };
  if (/ultron.{0,12}(d[üu]nyay[ıi] g[öo]ster|g[öo]z[üu]n[üu] a[çc])|ultron.?un g[öo]z[üu]n[üu] a[çc]|ultron.?un g[öo]z[üu]/.test(t)) return { tip: 'goz' };
  return null;
}
