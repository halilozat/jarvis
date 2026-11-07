// Bekçi · metin yardımcıları: iMessage attributedBody çözme, Apple tarihi, kişisel veri maskeleme, defang, Türkçe katlama.
// Saf fonksiyonlar (bekci-test.ts ile sınanır).

/**
 * macOS Mesajlar: yeni sürümlerde message.text çoğu zaman NULL, metin attributedBody'de (NSAttributedString typedstream).
 * "NSString" işaretinden sonra birkaç baytlık önek ve '+' (0x2B), ardından uzunluk öneki ve UTF-8 metin gelir.
 * Uzunluk: < 0x80 ise tek bayt; 0x81 → sonraki 2 bayt, 0x82 → 3 bayt, 0x83 → 4 bayt (küçük uçlu).
 */
export function attributedBodyCoz(blob: Uint8Array | Buffer | null | undefined): string | null {
  if (!blob || !blob.length) return null;
  const b = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  const i = b.indexOf('NSString');
  if (i < 0) return null;
  // '+' işaretini işaretten sonraki ilk birkaç baytta ara
  let j = -1;
  for (let k = i + 8; k < Math.min(b.length, i + 20); k++) if (b[k] === 0x2b) { j = k + 1; break; }
  if (j < 0 || j >= b.length) return null;
  let uz = b[j], bas = j + 1;
  if (uz === 0x81) { uz = b.readUInt16LE(j + 1); bas = j + 3; }
  else if (uz === 0x82) { uz = b[j + 1] | (b[j + 2] << 8) | (b[j + 3] << 16); bas = j + 4; }
  else if (uz === 0x83) { uz = b.readUInt32LE(j + 1); bas = j + 5; }
  else if (uz >= 0x80) return null;
  if (bas + uz > b.length) return null;
  const s = b.toString('utf8', bas, bas + uz);
  return s.replace(/￼/g, '').trim() || null;
}

/** Apple zamanı (2001-01-01'den beri saniye; yeni sürümlerde nanosaniye) → Date */
export function appleTarih(n: number | bigint | null | undefined): Date | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return null;
  const sn = Math.abs(v) > 1e11 ? v / 1e9 : v;
  return new Date((sn + 978_307_200) * 1000);
}

/** Türkçe karakterleri katla ve küçült: "Ödeme İADE" → "odeme iade" */
export const katla = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').normalize('NFD').replace(/\p{M}/gu, '');

/** Luhn denetimi (kart numarası) */
const luhn = (d: string) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
/** TC kimlik denetimi */
const tcGecerli = (d: string) => {
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const n = d.split('').map(Number);
  const t1 = ((n[0] + n[2] + n[4] + n[6] + n[8]) * 7 - (n[1] + n[3] + n[5] + n[7])) % 10;
  const t2 = n.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return ((t1 + 10) % 10) === n[9] && t2 === n[10];
};

/**
 * LLM'e gitmeden önce kişisel veriyi maskele: e-posta, IBAN, kart numarası, TC kimlik, telefon.
 * Linkler maskelenmez (analizin konusu); link içindeki e-posta/telefon da maskelenir.
 */
export function maskele(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[E-POSTA]')
    .replace(/\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, '[IBAN]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, m => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) ? '[KART]' : m; })
    .replace(/\b\d{11}\b/g, m => (tcGecerli(m) ? '[TC]' : m))
    .replace(/(?:\+?90[\s-]?)?\(?0?\s?[2-58]\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, '[TELEFON]');
}

/** Bildirimde ve arayüzde tıklanamaz link: https://ptt-ornek.xyz/a → hxxps://ptt-ornek[.]xyz/a */
export function defang(url: string): string {
  const m = /^(?:http(s?):\/\/)?([^/?#]*)(.*)$/i.exec(url)!;
  return `${m[1] !== undefined || /^http/i.test(url) ? `hxxp${m[1] ?? ''}://` : ''}${m[2].replace(/\./g, '[.]')}${m[3]}`;
}

/** İki dizgenin Levenshtein uzaklığı (typosquat) */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let on = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const su = [i];
    for (let j = 1; j <= n; j++) su[j] = Math.min(on[j] + 1, su[j - 1] + 1, on[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    on = su;
  }
  return on[n];
}

/** Mesaj kimliği: içerik saklanmaz, yalnızca bu özet (aynı mesajı iki kez işlememek ve "güvenli işaretle" için) */
export async function ozet(s: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(s).digest('hex').slice(0, 24);
}

const SAYI = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on'];
/** "bugün" · "üç gün önce" · "45 gün önce" (küçük sayılar kelimeyle; ses daha doğal) */
export const gunOnce = (n: number) => (n <= 0 ? 'bugün' : `${n <= 10 ? SAYI[n] : n} gün önce`);
