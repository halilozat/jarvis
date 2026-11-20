// Toplantı Odası · motor: DebateSession'ı gerçek modellerle (ya da demo senaryosuyla) yürütür. Model akışından gelen
// metin cümle cümle yayınlanır; her cümlenin sesi o anda üretilmeye başlar (istemci istediğinde hazır). İstemci olayları
// sırayla oynatır: ses, uzlaşma çubuğu ve tutanak konuşmayla eşzamanlı ilerler. Araya girince üretim iptal edilir ve
// transkript yalnızca gerçekten seslendirilen kısma indirilir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routellmStream, type ChatMessage } from '../routellm.js';
import { synthesize, type VoiceSel } from '../tts.js';
import { modeller, type Modeller } from './modeller.js';
import { cumleler, DebateSession, dogalTalimat, hakemDogrula, hitapEdilen, ikisineBirden, ilkKonusan, sinirla, siraEtiketi, sonrakiKonusan, uzlasmaDogrula, uzlasmaSozu, type Hakem, type Karakter, type Konusan, type Sira, type Uzlasma } from './oturum.js';
import { tutanakCikar, tutanakKaydet, type Tutanak } from './tutanak.js';

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VERI = process.env.MEETING_DATA || path.join(KOK, 'data', 'meetings');

export interface Ayar {
  karakterler: Record<Karakter, { ad: string; hitap: string; renk: string }>;
  cumle_siniri: number;
  uzlasma_esigi: number;
  ardisik_karakter_siniri: number;
  otomatik_tartisma: boolean;
  transkript_saklama_gun: number;
  demo: { cumle_arasi_ms: number; tur_arasi_ms: number; hakem_ms: number };
}
export const ayarOku = (): Ayar => JSON.parse(fs.readFileSync(process.env.MEETING_AYAR || path.join(KOK, 'config', 'meeting.json'), 'utf8'));
const promptOku = (ad: string) => fs.readFileSync(path.join(KOK, 'prompts', `${ad}_meeting.md`), 'utf8');
const doldur = (s: string, d: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(d[k] ?? ''));

const sinirlar = () => ({
  tur: Number(process.env.MEETING_MAX_TURNS) || 40,
  token: Number(process.env.MEETING_MAX_TOKENS) || 60_000,
  round: Number(process.env.MEETING_MAX_ROUNDS) || 3,
});

/** Demo senaryosu (server/config/meeting-demo.json ya da --meeting-record ile kaydedilmiş bir toplantı) */
export interface DemoSenaryo {
  konu: string;
  turlar: { kim: Konusan; metin: string; bekle?: number }[];
  hakemler?: Hakem[];
  uzlasma?: Uzlasma;
  tutanak?: Tutanak;
}

export type Olay = Record<string, unknown> & { olay: string };

/** Tek bir konuşma (karakter turu): cümleler ve gecikme ölçümleri */
interface Konusma { id: number; kim: Karakter; cumleler: string[]; satir: number; /** Araya girildiğinde çalınmış son cümle */ kesik?: number }

export class Toplanti {
  id = `t-${Date.now()}`;
  oturum: DebateSession;
  baslangic = Date.now();
  m!: Modeller;
  maliyet = { token: 0, tts: 0, cagri: 0 };
  karakterTurlari = 0;
  kapali = false;
  tutanak: Tutanak | null = null;
  private ac: AbortController | null = null;
  private seq = 0;
  private konusmalar: Konusma[] = [];
  private calisiyor: Promise<void> = Promise.resolve();
  private kayit: { t: number; kim: Konusan; metin: string }[] = [];

  constructor(
    public mod: 'tartisma' | 'canli',
    konu: string,
    private yay: (o: Olay) => void,
    private sesler: { jarvis: () => VoiceSel; friday: () => VoiceSel },
    readonly demo: DemoSenaryo | null = null,
    readonly kaydet = false,
  ) {
    const a = ayarOku();
    this.oturum = new DebateSession(konu, { canli: mod === 'canli', maxRounds: sinirlar().round, uzlasmaEsigi: a.uzlasma_esigi, ardisikSinir: a.ardisik_karakter_siniri });
  }

  async baslat() {
    this.m = this.demo ? { jarvis: 'demo senaryosu', friday: 'demo senaryosu', hakem: 'demo', ayniAile: false, kaynak: 'demo' } : await modeller();
    const a = ayarOku();
    this.yay({
      olay: 'acildi', id: this.id, mod: this.mod, konu: this.oturum.topic, demo: !!this.demo, modeller: this.m,
      sesler: { jarvis: this.sesler.jarvis(), friday: this.sesler.friday() }, karakterler: a.karakterler, sinirlar: sinirlar(),
    });
    if (this.oturum.topic) this.isEkle(() => this.tartis());
    else this.durum('dinliyor');
  }

  /** İşler sırayla (bir konuşma bitmeden diğeri başlamaz) */
  private isEkle(fn: () => Promise<void>) { this.calisiyor = this.calisiyor.then(fn).catch(e => this.hata(e)); return this.calisiyor; }
  private hata(e: unknown) {
    if ((e as Error)?.name === 'AbortError') return;
    console.warn('[toplantı]', e instanceof Error ? e.message : e);
    this.yay({ olay: 'hata', mesaj: String((e as Error)?.message || e) });
    this.durum(this.mod === 'canli' ? 'dinliyor' : 'bitti');
  }
  private durum(d: string) { this.yay({ olay: 'durum', durum: d, maliyet: this.maliyet, tur: this.karakterTurlari }); }

  // ---------------------------------------------------------------- Senaryo A: tartış ve uzlaş

  /** Araya girme/iptal sayacı: eski nesilden kalan döngüler sessizce durur */
  private nesil = 0;

  private async tartis() {
    const o = this.oturum;
    const n = this.nesil;
    for (let g = 0; g < 20 && !this.kapali && n === this.nesil; g++) {
      const ad = o.siradaki();
      if (ad.tur === 'bitti') break;
      if (this.sinirAsildi()) return this.sinirdaKapat();
      if (ad.tur === 'konus') await this.konus(ad.kim, ad.talimat);
      else if (ad.tur === 'hakem') {
        const h = await this.hakem();
        if (n !== this.nesil) return;
        o.hakemSonucu(h);
        this.yay({ olay: 'hakem', ...h, round: o.round, uzlasma: o.state === 'consensus' });
      } else if (ad.tur === 'uzlasma') {
        const u = await this.uzlas();
        if (n !== this.nesil) return;
        o.uzlasmaSonucu(u);
        this.yay({ olay: 'uzlasma', sonuc: u });
        await this.konus('jarvis', '', uzlasmaSozu(u, ayarOku().karakterler.jarvis.hitap));
      }
    }
    if (n === this.nesil) this.durum(this.mod === 'canli' ? 'dinliyor' : 'bitti');
  }

  // ---------------------------------------------------------------- Canlı toplantı: kullanıcı konuştu

  /** Kullanıcının sözü (canlı modda; Senaryo B) */
  soz(metin: string) {
    let t = metin.trim();
    if (!t || this.kapali) return;
    this.mod = 'canli'; // yazılı tartışmadan sonra konuşmaya devam edilirse canlı toplantı olur
    if (this.oturum.state === 'closed') this.oturum.state = 'meeting';
    this.kes(null);
    const k0 = t.toLocaleLowerCase('tr');
    if (/\b(toplant[ıi]y[ıi] bitir|toplant[ıi] bitti|toplant[ıi]y[ıi] kapat)\b/.test(k0)) { void this.bitir(); return; }
    if (/^(bekle|dur|sus|bir dakika|tamam dur)\b/.test(k0)) { this.durum('dinliyor'); return; }
    // Duraklamayla bölünen söz: önceki parçaya henüz cevap verilmediyse ikisi tek söz olur ve baştan cevaplanır
    const birlesik = this.oturum.devamiMi(t);
    if (birlesik) t = birlesik;
    const k = t.toLocaleLowerCase('tr');
    this.kayitEkle('user', t);
    this.yay({ olay: 'kullanici', metin: t, birlesti: !!birlesik });
    // Resmî tartışma (Jarvis açar → Friday sorgular → hakem) yalnızca açıkça "tartışın" denince (Senaryo A).
    // Karar soruları da doğal sohbette konuşulur: sıra kalıbı yok, karakterler sözü birbirine ya da kullanıcıya bırakır.
    if (/\b(tart[ıi][sş][ıi]n|tart[ıi][sş]s[ıi]n)\b/.test(k)) {
      this.oturum.tartismaBaslat(t.replace(/^.*?(tart[ıi][sş][ıi]n|tart[ıi][sş]s[ıi]n)\s*[:,]?\s*/i, '') || t);
      this.isEkle(() => this.tartis());
      return;
    }
    const son = this.oturum.sonKarakterSatiri()?.konusan as Karakter | undefined;
    this.oturum.ekle('user', t);
    // Söz sırası kalıp değil: her konuşmacı sözü kime bırakacağını kendisi seçer ([SIRA: …]); sınır dolunca kullanıcıya
    const a = ayarOku();
    // Belirli birine hitap edilmediyse ikisi de en az bir kez konuşur; sonrasını kendileri seçer
    const ikiDe = !hitapEdilen(t) || ikisineBirden(t);
    const n = this.nesil;
    this.isEkle(async () => {
      let kim: Karakter = ilkKonusan(t, son ?? null), ardisik = 0;
      for (;;) {
        if (this.kapali || n !== this.nesil) return;
        if (this.sinirAsildi()) return this.sinirdaKapat();
        const secim = await this.konus(kim, dogalTalimat(kim, ardisik, a.ardisik_karakter_siniri, a.karakterler[kim].hitap));
        ardisik++;
        const s = sonrakiKonusan({ kim, secim, ardisik, sinir: a.ardisik_karakter_siniri, ikiDe });
        if (s === 'user') break;
        kim = s;
      }
      if (n === this.nesil) this.durum('dinliyor');
    });
  }

  // ---------------------------------------------------------------- Konuşma (LLM akışı → cümleler → TTS)

  /** Karakter konuşur. hazir verilirse (uzlaşma sözü, sınır uyarısı) model çağrılmaz. */
  /** Dönüş: modelin sözü bıraktığı kişi ([SIRA: …]) ya da null */
  private async konus(kim: Karakter, talimat: string, hazir?: string): Promise<Sira | null> {
    const a = ayarOku();
    const k: Konusma = { id: ++this.seq, kim, cumleler: [], satir: -1 };
    this.konusmalar.push(k);
    this.yay({ olay: 'konusma', id: k.id, kim, model: hazir ? null : this.m[kim] });
    const t0 = performance.now();
    const olc: Record<string, number> = {};
    const sade = (x: string) => x.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const cumleYay = (c: string) => {
      // Aynı konuşmada zaten söylenmiş bir cümle (model tekrarı) bir daha okunmaz
      if (sade(c).length > 12 && sade(k.cumleler.join(' ')).includes(sade(c))) return;
      const sira = k.cumleler.length;
      k.cumleler.push(c);
      if (sira === 0) olc.ilkCumle = Math.round(performance.now() - t0);
      const sel = this.sesler[kim]();
      this.maliyet.tts += c.length;
      const t1 = performance.now();
      void synthesize(c, sel, `toplantı ${kim} ${k.id}.${sira + 1}`, !!this.demo).then(s => { if (sira === 0 && s) { olc.ttsHazir = Math.round(performance.now() - t0); olc.tts = Math.round(performance.now() - t1); this.yay({ olay: 'gecikme', id: k.id, ...olc }); } });
      this.yay({ olay: 'cumle', id: k.id, kim, sira, metin: c });
    };

    let metin: string;
    let secim: Sira | null = null, hamCevap = '';
    if (hazir !== undefined) {
      for (const c of cumleler(hazir)) cumleYay(c);
      metin = hazir;
    } else if (this.demo) {
      const tur = this.demoTur(kim);
      const n = this.nesil;
      await bekle(a.demo.tur_arasi_ms); // konuşmalar arası duraklama (config/meeting.json → demo)
      for (const c of cumleler(tur)) { await bekle(a.demo.cumle_arasi_ms); if (n !== this.nesil) return null; cumleYay(c); }
      metin = tur;
    } else {
      this.ac = new AbortController();
      const ac = this.ac;
      const zaman = setTimeout(() => ac.abort(), 25_000);
      const mesajlar = this.mesajlar(kim, talimat, a);
      let yayilan = 0, yeter = false, ilkParca = '', sonFull = '';
      let etiketZamani: ReturnType<typeof setTimeout> | null = null;
      try {
        const r = await routellmStream({ model: this.m[kim], messages: mesajlar, temperature: kim === 'friday' ? 0.8 : 0.6, max_tokens: 220 }, (_d, full) => {
          olc.ilkToken ??= Math.round(performance.now() - t0);
          sonFull = full;
          if (yeter) { if (siraEtiketi(full).sira) ac.abort(); return; } // sınırdan sonra yalnızca söz etiketi beklenir
          const yazi = siraEtiketi(full).temiz; // [SIRA: …] etiketi seslendirilmez
          const cs = cumleler(yazi);
          const biten = /[.!?…]["')”’]*\s*$/.test(yazi) ? cs.length : cs.length - 1;
          // İlk ses erken başlasın: ilk cümle uzunsa ilk virgülde böl (yalnızca ilk parça)
          if (yayilan === 0 && biten === 0 && !olc.ilkParca) {
            const v = /^(.{28,}?[,;:])\s/.exec(cs[0] ?? '');
            if (v) { olc.ilkParca = 1; ilkParca = v[1]; cumleYay(v[1]); }
          }
          while (yayilan < Math.min(biten, a.cumle_siniri)) {
            let c = sinirla(cs[yayilan++], 1);
            if (ilkParca && c.startsWith(ilkParca)) { c = c.slice(ilkParca.length).trim(); ilkParca = ''; if (!c) continue; }
            cumleYay(c);
          }
          // Sınır doldu: başka cümle okunmaz. Model sözü kime bıraktığını ([SIRA: …]) en sona yazar; onu kısa bir süre bekle
          if (yayilan >= a.cumle_siniri && !yeter) {
            yeter = true;
            if (siraEtiketi(full).sira) ac.abort();
            else etiketZamani = setTimeout(() => ac.abort(), 1200);
          }
        }, ac.signal).catch(e => { if (yeter || ac.signal.aborted) return null; throw e; });
        this.maliyetEkle(mesajlar, r?.content ?? k.cumleler.join(' '));
        hamCevap = r?.content ?? sonFull;
        if (r && !yeter) {
          const cs = cumleler(sinirla(r.content, a.cumle_siniri));
          // Token sınırında yarım kalan son cümle okunmaz
          if (cs.length > 1 && !/[.!?…]["')”’]*$/.test(cs.at(-1)!)) cs.pop();
          while (yayilan < cs.length) cumleYay(cs[yayilan++]);
        }
      } finally { clearTimeout(zaman); if (etiketZamani) clearTimeout(etiketZamani); if (this.ac === ac) this.ac = null; }
      if (ac.signal.aborted && !yeter) {
        // Araya girildi: seslendirilmiş cümleler transkriptte kalır (bağlam kopmasın)
        if (k.kesik !== undefined && k.cumleler.length) { const m = k.cumleler.slice(0, k.kesik + 1).join(' '); this.oturum.ekle(kim, m); k.satir = this.oturum.transcript.length - 1; this.kayitEkle(kim, m); }
        this.yay({ olay: 'konusma_son', id: k.id, kim, kesildi: true });
        return null;
      }
      metin = k.cumleler.join(' ');
      secim = siraEtiketi(hamCevap).sira;
    }
    if (!metin.trim()) metin = '…';
    this.oturum.ekle(kim, metin);
    k.satir = this.oturum.transcript.length - 1;
    this.karakterTurlari++;
    this.kayitEkle(kim, metin);
    console.log(`[toplantı] ${kim} · ${this.m[kim]} · ilk token ${olc.ilkToken ?? '—'} ms · ilk cümle ${olc.ilkCumle ?? '—'} ms · ${k.cumleler.length} cümle`);
    this.yay({ olay: 'konusma_son', id: k.id, kim, metin, gecikme: olc, sira: secim });
    return secim;
  }

  private mesajlar(kim: Karakter, talimat: string, a: Ayar): ChatMessage[] {
    const sistem = doldur(promptOku(kim), { hitap: a.karakterler[kim].hitap, cumle_siniri: a.cumle_siniri, tarih: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }), kullanici: process.env.USER_NAME || 'Kullanıcı' });
    const ad = { user: 'Kullanıcı', jarvis: 'Jarvis', friday: 'Friday' };
    const dokum = this.oturum.transcript.slice(-24).map(s => `${ad[s.konusan]}: ${s.metin}`).join('\n');
    return [
      { role: 'system', content: sistem },
      { role: 'user', content: `${this.oturum.topic ? `Konu: ${this.oturum.topic}\n\n` : ''}Şimdiye kadar konuşulanlar:\n${dokum || '(henüz yok)'}\n\nSıra sende (${ad[kim]}). ${talimat} En fazla ${a.cumle_siniri} cümle.` },
    ];
  }

  private async hakem(): Promise<Hakem> {
    if (this.demo) { await bekle(ayarOku().demo.hakem_ms); return this.demo.hakemler?.[this.oturum.round] ?? { agreement: 85, new_point_raised: false, should_continue: false }; }
    const tur = this.oturum.transcript.slice(-2).map(s => `${s.konusan === 'jarvis' ? 'Jarvis' : s.konusan === 'friday' ? 'Friday' : 'Kullanıcı'}: ${s.metin}`).join('\n');
    const once = this.oturum.transcript.slice(0, -2).filter(s => s.konusan !== 'user').map(s => s.metin).join(' ').slice(-2500);
    const mesajlar: ChatMessage[] = [{ role: 'system', content: promptOku('hakem') }, { role: 'user', content: `Konu: ${this.oturum.topic}\n\nÖnceki turlarda söylenenler: ${once || '(yok)'}\n\nSon tur:\n${tur}` }];
    const r = await routellmStream({ model: this.m.hakem, messages: mesajlar, temperature: 0, max_tokens: 80 }).catch(() => null);
    this.maliyetEkle(mesajlar, r?.content ?? '');
    return hakemDogrula(r?.content ?? '') ?? { agreement: 50, new_point_raised: true, should_continue: this.oturum.round + 1 < this.oturum.maxRounds };
  }

  private async uzlas(): Promise<Uzlasma> {
    if (this.demo?.uzlasma) { await bekle(ayarOku().demo.hakem_ms); return this.demo.uzlasma; }
    const ad = { user: 'Kullanıcı', jarvis: 'Jarvis', friday: 'Friday' };
    const mesajlar: ChatMessage[] = [{ role: 'system', content: promptOku('uzlasma') }, { role: 'user', content: `Konu: ${this.oturum.topic}\n\n${this.oturum.transcript.map(s => `${ad[s.konusan]}: ${s.metin}`).join('\n')}` }];
    const r = await routellmStream({ model: this.m.jarvis, messages: mesajlar, temperature: 0.2, max_tokens: 350 }).catch(() => null);
    this.maliyetEkle(mesajlar, r?.content ?? '');
    return uzlasmaDogrula(r?.content ?? '') ?? { agreed: [], disagreed: [], recommendation: 'Kararı kendi önceliklerinize göre verin; iki görüşü de not ettim', confidence: 'düşük' };
  }

  // ---------------------------------------------------------------- Araya girme, sınırlar, bitiş

  /**
   * Araya girme / "dur": üretim iptal, transkript seslendirilen kısma iner. son: istemcide en son çalan cümle
   * ({ id: konuşma, sira: cümle }); null ise yalnızca üretim durur.
   */
  kes(son: { id: number; sira: number } | null) {
    this.nesil++;
    this.ac?.abort();
    this.ac = null;
    if (!son) return;
    const i = this.konusmalar.findIndex(k => k.id === son.id);
    if (i < 0) return;
    const k = this.konusmalar[i];
    k.kesik = son.sira;
    const kalan = k.cumleler.slice(0, son.sira + 1).join(' ');
    // Sonraki konuşmalar (henüz çalınmadı) transkriptten çıkar
    const sil = new Set(this.konusmalar.slice(i + 1).filter(x => x.satir >= 0).map(x => x.satir));
    if (k.satir >= 0) this.oturum.transcript[k.satir].metin = kalan || '…';
    if (sil.size) this.oturum.transcript = this.oturum.transcript.filter((_, j) => !sil.has(j));
    this.konusmalar.splice(i + 1);
    if (this.oturum.state !== 'closed') this.oturum.state = this.mod === 'canli' ? 'meeting' : 'closed';
    this.calisiyor = Promise.resolve();
    this.yay({ olay: 'kesildi', id: son.id, sira: son.sira });
  }

  private sinirAsildi() { const s = sinirlar(); return this.karakterTurlari >= s.tur || this.maliyet.token >= s.token; }
  private async sinirdaKapat() {
    await this.konus('jarvis', '', `Efendim, bu toplantı için ayrılan sınıra ulaştık. Tutanağı çıkarıyorum.`);
    await this.bitir(true);
  }

  /** Senaryo C: tutanak (ekranda + dosya) ve tek cümlelik sesli özet */
  async bitir(icerden = false) {
    if (this.kapali) return this.tutanak;
    if (!icerden) { this.kes(null); await this.calisiyor.catch(() => {}); }
    this.kapali = true;
    this.durum('tutanak');
    const t = this.demo?.tutanak ?? await tutanakCikar(this.oturum, this.m.jarvis, (m, c) => this.maliyetEkle(m, c));
    t.date ||= new Date().toISOString().slice(0, 16).replace('T', ' ');
    const dosya = tutanakKaydet(t, this.oturum, { modeller: this.m, maliyet: this.maliyet, sure: Date.now() - this.baslangic });
    this.tutanak = t;
    this.oturum.kapat();
    this.yay({ olay: 'tutanak', tutanak: t, dosya: path.basename(dosya), maliyet: this.maliyet });
    if (this.kaydet) this.kaydiYaz();
    this.kapali = false; // özet konuşulabilsin
    await this.konus('jarvis', '', t.summary || 'Toplantı tutanağı hazır efendim.');
    this.kapali = true;
    this.durum('kapandi');
    return t;
  }

  private maliyetEkle(mesajlar: ChatMessage[], cevap: string) {
    const karakter = mesajlar.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0) + cevap.length;
    this.maliyet.token += Math.round(karakter / 3.6); // Türkçe için kaba token tahmini (≈)
    this.maliyet.cagri++;
  }

  // ---------------------------------------------------------------- Demo ve kayıt

  private demoSira = 0;
  private demoTur(kim: Karakter): string {
    const turlar = this.demo!.turlar.filter(t => t.kim !== 'user');
    const t = turlar[this.demoSira++];
    return t && t.kim === kim ? t.metin : t?.metin ?? 'Bu senaryoda söyleyecek başka bir şeyim yok.';
  }
  private kayitEkle(kim: Konusan, metin: string) { if (this.kaydet) this.kayit.push({ t: Date.now() - this.baslangic, kim, metin }); }
  private kaydiYaz() {
    fs.mkdirSync(VERI, { recursive: true });
    const d: DemoSenaryo & { kaydedildi: string } = {
      kaydedildi: new Date().toISOString(), konu: this.oturum.topic,
      turlar: this.kayit.map((k, i) => ({ kim: k.kim, metin: k.metin, bekle: i ? k.t - this.kayit[i - 1].t : 0 })),
      hakemler: this.oturum.hakemler, uzlasma: this.oturum.uzlasma ?? undefined, tutanak: this.tutanak ?? undefined,
    };
    const f = path.join(VERI, `kayit-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.json`);
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
    console.log(`[toplantı] kaydedildi (demo senaryosu olarak oynatılabilir): ${f}`);
  }
}

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));
