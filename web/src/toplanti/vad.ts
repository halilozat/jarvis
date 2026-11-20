// Toplantı Odası · ses etkinliği algılama ve yankı süzgeci (saf; tarayıcı gerektirmez, canli.test.ts ile sınanır).

const kat = (s: string) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
/** İki metnin kelime örtüşmesi (0..1): yankı tespiti */
export function benzerlik(a: string, b: string): number {
  const x = new Set(kat(a).split(' ').filter(w => w.length > 2)), y = new Set(kat(b).split(' ').filter(w => w.length > 2));
  if (!x.size || !y.size) return 0;
  let o = 0;
  for (const w of x) if (y.has(w)) o++;
  return o / Math.min(x.size, y.size);
}
export const yankiMi = (metin: string, son: string[]) => son.some(c => benzerlik(metin, c) >= 0.6);

/**
 * Enerji tabanlı ses etkinliği algılama (saf; test edilir). Ortam gürültüsü tabanı sessizken öğrenilir.
 * Karakter konuşurken eşik çok yüksektir (yankı engellemeden kaçan hoparlör sesi tetiklemesin) ama gereken süre kısadır:
 * kullanıcı gerçekten konuşursa ses ~200 ms içinde kesilir.
 */
export class Vad {
  taban = 0.008;
  private bas = 0;
  private sessiz = 0;
  konusuyor = false;
  sessizlikMs: number;
  constructor(sessizlikMs = 700) { this.sessizlikMs = sessizlikMs; }
  /** Dönüş: 'basladi' (karakter konuşurken: araya girme), 'bitti' (sustu: sessizliğin başladığı an) ya da null */
  adim(rms: number, simdi: number, karakter: boolean): { tur: 'basladi'; araGirme: boolean } | { tur: 'bitti'; sustu: number } | null {
    const esik = Math.max(karakter ? 0.05 : 0.015, this.taban * (karakter ? 7 : 3));
    const sure = karakter ? 170 : 160;
    if (rms > esik) {
      if (!this.bas) this.bas = simdi;
      this.sessiz = 0;
      if (!this.konusuyor && simdi - this.bas >= sure) { this.konusuyor = true; return { tur: 'basladi', araGirme: karakter }; }
      return null;
    }
    this.bas = 0;
    if (!this.konusuyor && !karakter) this.taban = this.taban * 0.97 + rms * 0.03;
    if (this.konusuyor) {
      if (!this.sessiz) this.sessiz = simdi;
      if (simdi - this.sessiz >= this.sessizlikMs) { const sustu = this.sessiz; this.konusuyor = false; this.sessiz = 0; return { tur: 'bitti', sustu }; }
    }
    return null;
  }
}

/** Web Speech sonucu (SpeechRecognitionResult'un kullandığımız kısmı) */
export interface SrSonuc { readonly isFinal: boolean; readonly [i: number]: { transcript: string } }

/**
 * Kullanıcının sözünü ses tanıma sonuçlarından toplar.
 * - Söz, tanıma listesinin bir başlangıç indeksinden itibaren kurulur; gönderilen ya da yok sayılan sonuçlar bir
 *   daha sonraki söze karışmaz (tanımanın geç gelen sonuçları da).
 * - VAD "sustu" dediğinde metin varsa hemen gönderilir. Henüz metin yoksa (Chrome ilk cümlede 1-2 sn geç döner)
 *   söz atılmaz: ilk sonuç gelene kadar beklenir (en fazla beklemeMs).
 * - VAD konuşmayı hiç yakalamasa ya da gürültüde "konuşuyor" durumunda takılı kalsa bile söz kaybolmaz: tanıma
 *   cümleyi kesinleştirip finalMs boyunca yeni sonuç gelmezse (ara sonuçta bayatMs) yine gönderilir.
 */
export class SozToplayici {
  private liste: ArrayLike<SrSonuc> | null = null;
  private bas = 0;
  private birikmis = '';
  private bekleyen: { sustu: number; zaman: ReturnType<typeof setTimeout> | null; vadsiz: boolean } | null = null;
  private gonder: (metin: string, sustu: number, neden: string) => void;
  private beklemeMs: number;
  private araMs: number;
  private finalMs: number;
  private bayatMs: number;
  constructor(gonder: (metin: string, sustu: number, neden: string) => void, beklemeMs = 2500, araMs = 350, finalMs = 1000, bayatMs = 2000) {
    this.gonder = gonder; this.beklemeMs = beklemeMs; this.araMs = araMs; this.finalMs = finalMs; this.bayatMs = bayatMs;
  }

  metin(): string {
    let s = this.birikmis;
    const l = this.liste;
    if (l) for (let i = this.bas; i < l.length; i++) s += ` ${l[i][0].transcript}`;
    return s.replace(/\s+/g, ' ').trim();
  }
  /** VAD susmuş ama metni gelmemiş bir söz var mı */
  get bekliyor() { return !!this.bekleyen && !this.bekleyen.vadsiz; }

  /** Tanıma sonucu geldi. yoksay: karakter konuşuyor, gelen büyük ihtimalle hoparlör sesi */
  sonuc(liste: ArrayLike<SrSonuc>, yoksay = false, simdi = performance.now()) {
    this.liste = liste;
    if (yoksay && !this.bekleyen) { this.tuket(); return; }
    if (!this.metin()) return;
    const kesin = !!liste[liste.length - 1]?.isFinal;
    if (this.bekleyen && !this.bekleyen.vadsiz) {
      // VAD sustu demişti, metin şimdi geldi
      if (kesin) this.bitir('tanıma geç döndü'); else this.zamanla(this.araMs, 'tanıma geç döndü (ara)');
      return;
    }
    // VAD henüz susma demedi (ya da konuşmayı hiç yakalamadı): yeni sonuç gelmezse tanımanın kendisine güven
    if (!this.bekleyen) this.bekleyen = { sustu: simdi, zaman: null, vadsiz: true };
    else this.bekleyen.sustu = simdi;
    this.zamanla(kesin ? this.finalMs : this.bayatMs, kesin ? 'tanıma kesinleştirdi' : 'ara sonuç bayatladı');
  }
  /** Tanıma oturumu yeniden başladı (liste sıfırlanır; toplanmış metin korunur) */
  yenidenBasladi() { this.birikmis = this.metin(); this.liste = null; this.bas = 0; }
  /** Şimdiye kadarki sonuçları yok say (araya girme anında hoparlör yankısı) */
  tuket() { this.bas = this.liste?.length ?? 0; this.birikmis = ''; }
  /** Kullanıcı (yeniden) konuşmaya başladı: bekleyen gönderim iptal, metin toplanmaya devam eder */
  konusmaBasladi() { if (this.bekleyen?.zaman) clearTimeout(this.bekleyen.zaman); this.bekleyen = null; }
  /** Kullanıcı sustu (VAD) */
  sustu(t: number) {
    this.konusmaBasladi();
    if (this.metin()) { this.bitir('sustu', t); return; }
    this.bekleyen = { sustu: t, zaman: null, vadsiz: false };
    this.zamanla(this.beklemeMs, 'metin gelmedi');
  }
  durdur() { this.konusmaBasladi(); }

  private zamanla(ms: number, neden: string) {
    if (!this.bekleyen) return;
    if (this.bekleyen.zaman) clearTimeout(this.bekleyen.zaman);
    this.bekleyen.zaman = setTimeout(() => this.bitir(neden), ms);
  }
  private bitir(neden: string, sustu?: number) {
    const s = sustu ?? this.bekleyen?.sustu ?? 0;
    this.konusmaBasladi();
    const m = this.metin();
    this.tuket();
    if (m.length >= 2) this.gonder(m, s, neden);
  }
}
