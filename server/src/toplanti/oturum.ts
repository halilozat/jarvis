// Toplantı Odası · tartışma motoru (saf: ağ, ses ve arayüzden bağımsız; metinle test edilir).
// Senaryo A: opening (Jarvis ilk görüş) → debate (tur = Friday + Jarvis; her turdan sonra hakem) → consensus → closed.
// Canlı toplantı: meeting durumunda kullanıcı konuşur, söz sırası kurallarla belirlenir.

export type Konusan = 'user' | 'jarvis' | 'friday';
export type Karakter = Exclude<Konusan, 'user'>;
export type Durum = 'opening' | 'debate' | 'consensus' | 'meeting' | 'closed';

export interface Satir { konusan: Konusan; metin: string; ts: number }
export interface Hakem { agreement: number; new_point_raised: boolean; should_continue: boolean }
export interface Uzlasma { agreed: string[]; disagreed: string[]; recommendation: string; confidence: 'düşük' | 'orta' | 'yüksek' }

export interface OturumAyar { maxRounds: number; uzlasmaEsigi: number; ardisikSinir: number }
export const VARSAYILAN: OturumAyar = { maxRounds: 3, uzlasmaEsigi: 80, ardisikSinir: 2 };

/** Senaryo A'da sıradaki iş */
export type Adim = { tur: 'konus'; kim: Karakter; talimat: string } | { tur: 'hakem' } | { tur: 'uzlasma' } | { tur: 'bitti' };

export class DebateSession {
  topic: string;
  transcript: Satir[] = [];
  round = 0;
  maxRounds: number;
  state: Durum;
  hakemler: Hakem[] = [];
  uzlasma: Uzlasma | null = null;
  /** Canlı toplantı mı (tartışma bitince 'meeting'e döner) */
  readonly canli: boolean;
  private a: OturumAyar;

  constructor(topic: string, o: Partial<OturumAyar> & { canli?: boolean } = {}) {
    this.a = { ...VARSAYILAN, ...o };
    this.topic = topic.trim();
    this.maxRounds = this.a.maxRounds;
    this.canli = !!o.canli;
    this.state = this.canli && !this.topic ? 'meeting' : 'opening';
    if (this.topic) this.transcript.push({ konusan: 'user', metin: this.topic, ts: Date.now() });
  }

  /**
   * Konuşmanın ortasında duraklayınca söz ikiye bölünür ("…kitap nasıl" + "bulacağım"). Son satır kullanıcınınsa,
   * yeniyse (≤ pencereMs) ve arada karakter konuşmadıysa iki parça tek söz olur. Dönüş: birleşmiş metin ya da null.
   */
  devamiMi(metin: string, simdi = Date.now(), pencereMs = 10_000): string | null {
    const son = this.transcript.at(-1);
    if (!son || son.konusan !== 'user' || simdi - son.ts > pencereMs) return null;
    this.transcript.pop();
    // Aynı söz iki kez geldiyse (iki dinleyici/cihaz) tekrar eklenmez
    const sade = (x: string) => x.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (sade(son.metin).endsWith(sade(metin))) return son.metin;
    return `${son.metin} ${metin.trim()}`;
  }

  ekle(konusan: Konusan, metin: string) { this.transcript.push({ konusan, metin: metin.trim(), ts: Date.now() }); }

  /** Tartışma (Senaryo A) sıradaki adım: opening → [Friday, Jarvis, hakem]×tur → uzlaşma */
  siradaki(): Adim {
    if (this.state === 'closed' || this.state === 'meeting') return { tur: 'bitti' };
    if (this.state === 'consensus') return this.uzlasma ? { tur: 'bitti' } : { tur: 'uzlasma' };
    if (this.state === 'opening') {
      const acildi = this.transcript.slice(this.turBasi).some(s => s.konusan === 'jarvis');
      if (!acildi) return { tur: 'konus', kim: 'jarvis', talimat: 'Konu hakkında ilk görüşünü ver.' };
      this.state = 'debate';
      this.turBasi = this.transcript.length;
    }
    // debate: bu turda (son hakemden beri) Friday ve ardından Jarvis konuştu mu?
    const tur = this.transcript.slice(this.turBasi);
    const fi = tur.findIndex(s => s.konusan === 'friday');
    const friday = fi >= 0;
    const jarvis = friday && tur.slice(fi + 1).some(s => s.konusan === 'jarvis');
    if (!friday) return { tur: 'konus', kim: 'friday', talimat: this.round === 0 ? "Jarvis'in görüşünü sorgula." : 'Yeni bir nokta getir ya da ikna olduysan söyle.' };
    if (!jarvis) return { tur: 'konus', kim: 'jarvis', talimat: "Yalnızca Friday'in getirdiği noktaya cevap ver: haklıysa fikrini düzelt, değilse gerekçeyle savun. Kendi ilk görüşünü tekrar etme; yeni bir somut adım ya da gerekçe ekle." };
    return { tur: 'hakem' };
  }

  /** Hakem kararı: eşik, yeni nokta yokluğu ya da tur sınırı → uzlaşma */
  hakemSonucu(h: Hakem) {
    this.hakemler.push(h);
    this.round++;
    this.turBasi = this.transcript.length;
    if (h.agreement >= this.a.uzlasmaEsigi || !h.new_point_raised || !h.should_continue || this.round >= this.maxRounds) this.state = 'consensus';
  }

  uzlasmaSonucu(u: Uzlasma) {
    this.uzlasma = u;
    this.state = this.canli ? 'meeting' : 'closed';
  }

  /** Canlı toplantıda yeni bir tartışma (kullanıcı karar sorusu sordu) */
  tartismaBaslat(konu: string) {
    this.topic = konu.trim();
    this.round = 0;
    this.hakemler = [];
    this.uzlasma = null;
    this.ekle('user', konu);
    this.turBasi = this.transcript.length;
    this.state = 'opening';
  }

  kapat() { this.state = 'closed'; }

  /** Geçerli turun (ya da açılışın) transkriptte başladığı yer */
  private turBasi = 0;
  sonKarakterSatiri() { for (let i = this.transcript.length - 1; i >= 0; i--) if (this.transcript[i].konusan !== 'user') return this.transcript[i]; return null; }
  get agreement() { return this.hakemler.at(-1)?.agreement ?? null; }
}

// ---------------------------------------------------------------- Söz sırası (canlı toplantı)

const kat = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

/** Ses tanımanın yazdığı biçimler de: "fraydi", "cervis", "carvis" */
const AD: Record<Karakter, RegExp> = {
  friday: /\b(friday|fraydi|fıraydı|fraydey|frayday|freyday|cuma)\b/,
  jarvis: /\b(jarvis|carvis|cervis|carviz|jarviz|carvıs)\b/,
};

/** Kullanıcı bir karaktere adıyla hitap etti mi (ilki döner; "cuma" yalnızca cümle başında) */
export function hitapEdilen(metin: string): Karakter | null {
  const k = kat(metin);
  const f = AD.friday.exec(k), j = AD.jarvis.exec(k);
  const fOk = f && (f[1] !== 'cuma' || f.index === 0);
  if (fOk && j) return f!.index <= j.index ? 'friday' : 'jarvis';
  if (fOk) return 'friday';
  if (j) return 'jarvis';
  return null;
}

/** "Siz ne düşünüyorsunuz?", "ikiniz", "ikinize" */
export const ikisineBirden = (metin: string) => /\b(siz ne dusunuyorsunuz|ikiniz|ikinize|ikinizin|ikinizde|sizce|siz ne dersiniz|ikiniz de)\b/.test(kat(metin));

export type Sira = Karakter | 'user';

/** Konuşmanın sonundaki "[SIRA: friday]" etiketi: model sözü kime bıraktığını seçer. Etiket seslendirilmez. */
export function siraEtiketi(metin: string): { temiz: string; sira: Sira | null } {
  let sira: Sira | null = null;
  for (const m of metin.matchAll(/\[\s*s[ıi]ra\s*:\s*([^\]\s]+)\s*\]?/gi)) {
    const k = kat(m[1]);
    sira = k.startsWith('fri') ? 'friday' : k.startsWith('jar') ? 'jarvis' : k.startsWith('kul') || k.startsWith('user') || k.startsWith('siz') ? 'user' : sira;
  }
  // Etiketler ve akış sırasında yarım kalmış bir etiket başlangıcı ("[SIR") temizlenir
  const temiz = metin.replace(/\[\s*s[ıi]ra\s*:[^\]]*\]?/gi, '').replace(/\[[^\]]{0,12}$/, '').replace(/\s+/g, ' ').trim();
  return { temiz, sira };
}

/** Canlı toplantıda ilk söz alan: 1) adıyla hitap edilen, 2) ikisine birden → Jarvis, 3) son konuşan Jarvis'se Friday, değilse Jarvis */
export function ilkKonusan(metin: string, sonKarakter: Karakter | null): Karakter {
  const h = hitapEdilen(metin);
  if (h && !ikisineBirden(metin)) return h;
  if (ikisineBirden(metin)) return 'jarvis';
  return sonKarakter === 'jarvis' ? 'friday' : 'jarvis';
}

/**
 * Sıradaki konuşmacı: modelin seçimi ([SIRA: …]); kendi kendine söz veremez, seçim yoksa söz kullanıcıya döner.
 * Kullanıcı belirli birine hitap etmediyse (ikiDe) ilk konuşandan sonra diğeri de mutlaka konuşur.
 * Karakterler kendi aralarında en fazla `sinir` kez art arda konuşur; sonra söz kullanıcıya döner.
 */
export function sonrakiKonusan(o: { kim: Karakter; secim: Sira | null; ardisik: number; sinir: number; ikiDe?: boolean }): Sira {
  const diger: Karakter = o.kim === 'jarvis' ? 'friday' : 'jarvis';
  if (o.ardisik >= o.sinir) return 'user';
  if (o.ikiDe && o.ardisik === 1) return diger;
  if (!o.secim || o.secim === o.kim) return 'user';
  return o.secim;
}

/** Canlı toplantıda her konuşmanın talimatı: kalıp yok; katıl, itiraz et, ekle, soru sor ya da sözü diğerine bırak */
export function dogalTalimat(kim: Karakter, ardisik: number, sinir: number, hitap: string): string {
  const diger = kim === 'jarvis' ? 'Friday' : 'Jarvis';
  const son = ardisik + 1 >= sinir;
  return [
    ...(ardisik > 0 ? [`Az önce ${diger} konuştu: söylediğini tekrar etme. Ona katılıp yeni bir şey ekle ya da gerekçeyle itiraz et; ${diger} kullanıcıya bir soru sorduysa aynı soruyu yineleme.`] : []),
    `Toplantıda doğal konuş: kullanıcıya ya da ${diger}'e doğrudan cevap verebilir; katılabilir, itiraz edebilir, yeni bir şey ekleyebilir ya da netleştirici bir soru sorabilirsin.`,
    'Her konuşmayı soruyla bitirme; yalnızca gerçekten bir bilgiye ihtiyacın varsa sor. İtiraz etmek zorunda değilsin.',
    son
      ? `Bu, bu turdaki son konuşma: sözü kullanıcıya bırak ("${hitap}" diye hitap edebilirsin) ve en sona [SIRA: kullanıcı] yaz.`
      : `En sona, sözü kime bırakmak istediğini yalnızca şu etiketle yaz: [SIRA: ${diger.toLowerCase()}] ya da [SIRA: kullanıcı]. ${diger}'e itiraz ettiysen, ona bir şey sorduysan ya da onun görüşü kararı değiştirebilecekse sözü ona ver; kullanıcıdan bir bilgi ya da karar gerekiyorsa kullanıcıya bırak.`,
  ].join(' ');
}

// ---------------------------------------------------------------- Model çıktılarını doğrulama

export function jsonAyikla(ham: string): any {
  const m = /\{[\s\S]*\}/.exec(ham);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export function hakemDogrula(ham: string): Hakem | null {
  const j = jsonAyikla(ham);
  const a = Number(j?.agreement);
  if (!j || !Number.isFinite(a)) return null;
  return { agreement: Math.round(Math.min(100, Math.max(0, a))), new_point_raised: j.new_point_raised !== false, should_continue: j.should_continue !== false };
}

const dizi = (x: unknown, n: number) => (Array.isArray(x) ? x.map(v => String(v).trim()).filter(Boolean).slice(0, n) : []);
export function uzlasmaDogrula(ham: string): Uzlasma | null {
  const j = jsonAyikla(ham);
  if (!j || typeof j.recommendation !== 'string' || !j.recommendation.trim()) return null;
  const c = String(j.confidence ?? '').toLocaleLowerCase('tr');
  return { agreed: dizi(j.agreed, 3), disagreed: dizi(j.disagreed, 2), recommendation: j.recommendation.trim(), confidence: c.startsWith('d') ? 'düşük' : c.startsWith('y') ? 'yüksek' : 'orta' };
}

/** Uzlaşma → 2–4 cümlelik doğal konuşma ("Anlaştığımız nokta şu… Anlaşamadığımız nokta şu… Önerimiz şu…") */
export function uzlasmaSozu(u: Uzlasma, hitap = 'efendim'): string {
  const nokta = (s: string) => s.replace(/[.!?…\s]+$/, '');
  const c = [`${u.agreed.length ? `Anlaştığımız nokta şu ${hitap}: ${nokta(u.agreed[0])}.` : `Tam anlaşamadık ${hitap}.`}`];
  if (u.disagreed.length) c.push(`Anlaşamadığımız nokta şu: ${nokta(u.disagreed[0])}.`);
  c.push(`Önerimiz şu: ${nokta(u.recommendation)}.`);
  return c.join(' ');
}

// ---------------------------------------------------------------- Metin

/** Cümlelere böl (kısaltma ve sayılardaki noktayı bölmeden) */
export function cumleler(s: string): string[] {
  const out: string[] = [];
  const re = /[^.!?…]+(?:[.!?…]+["')”’]*|$)/g;
  let biriken = '';
  for (const m of s.replace(/\s+/g, ' ').trim().matchAll(re)) {
    const p = m[0];
    biriken += p;
    // "Dr." "vb." "3.5" gibi: sonraki parça küçük harf ya da rakamla başlıyorsa birleştir
    const sonraki = s.replace(/\s+/g, ' ').slice(m.index! + p.length).trimStart();
    if (/\b(dr|prof|vb|vs|örn|bkz|no|st)\.$/i.test(biriken.trim()) || (/\d\.$/.test(biriken) && /^\d/.test(sonraki))) continue;
    if (biriken.trim()) out.push(biriken.trim());
    biriken = '';
  }
  if (biriken.trim()) out.push(biriken.trim());
  return out;
}

/** Konuşma sınırı: en fazla n cümle; markdown ve madde işaretleri temizlenir */
export function sinirla(s: string, n: number): string {
  const temiz = siraEtiketi(s).temiz.replace(/[*_#`>]/g, '').replace(/^\s*[-•]\s*/gm, '').replace(/^(Jarvis|Friday)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
  return cumleler(temiz).slice(0, n).join(' ');
}

/** Basit sorular tartışma başlatmaz (Senaryo E); karar/fikir soruları başlatır */
export function kararSorusuMu(metin: string): boolean {
  const k = kat(metin).trim();
  if (k.length < 12) return false;
  if (/\b(saat kac|hava nasil|isig|lamba|kahve|dolar|euro|kur|haber|ac\b|kapat|calistir|sarki|muzik|video|hatirlat|alarm)\b/.test(k) && !/\b(mi|mu|mı|mü)\b.*\?/.test(metin)) return false;
  return /\b(edeyim mi|yapayim mi|alayim mi|kabul edeyim|reddedeyim|secmeli miyim|almali miyim|yapmali miyim|gitmeli miyim|mantikli mi|deger mi|hangisini (secmeliyim|seceyim|almaliyim|alayim)|hangisi daha (iyi|mantikli)|ne yapmaliyim|sence .* mi\b|karar veremiyorum|arasinda kaldim|tavsiye eder misin|baslamali miyim|birakmali miyim|tasinmali miyim)\b/.test(k);
}
