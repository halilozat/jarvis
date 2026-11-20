// Toplantı Odası · sesli/yazılı komutlar (modele gitmez). Karar sorularını sunucu tanır (normal sohbette de çalışsın).
export type ToplantiKomut = { tip: 'ac' } | { tip: 'tartis'; konu: string } | { tip: 'bitir' } | { tip: 'dur' };

const kat = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

export function toplantiKomutu(t: string, acik = false): ToplantiKomut | null {
  const k = kat(t.trim());
  if (/toplanti(yi)? (bitir|kapat|sonlandir)|toplanti bitti/.test(k)) return acik ? { tip: 'bitir' } : null;
  if (acik && /^(bekle|dur|sus)\b/.test(k)) return { tip: 'dur' };
  if (/toplanti (baslat|ac)|toplanti odasini? ac|toplanti odasi/.test(k)) return { tip: 'ac' };
  // "Jarvis ve Friday tartışsın: …", "İkiniz tartışın: …", "Friday ile tartışın …"
  // Türkçe küçük harfte eşle ("İkiniz"), konuyu özgün yazımıyla al (uzunluk değişmez)
  const ozgun = t.trim(), kucuk = ozgun.toLocaleLowerCase('tr');
  const m = /^(?:.*?\b(?:jarvis (?:ve|ile) friday|friday (?:ve|ile) jarvis|ikiniz|siz ikiniz|friday ile)\s+)?tart[ıi][sş](?:s[ıi]n|[ıi]n[ıi]z|[ıi]n)\b[\s:,.-]*(.*)$/.exec(kucuk);
  if (m && /tartis(sin|in|iniz)/.test(k)) {
    const konu = ozgun.slice(ozgun.length - m[1].length).trim();
    return konu.length >= 6 ? { tip: 'tartis', konu } : null;
  }
  return null;
}
