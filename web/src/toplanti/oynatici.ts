// Toplantı Odası · olay oynatıcı. Sunucu konuşmaları hızla üretir; burada olaylar SIRAYLA işlenir: cümleler seçili
// seslerle çalınır, uzlaşma çubuğu, kıvılcım ve tutanak ilgili konuşmaya gelince güncellenir. Araya girince
// durdur() en son çalan cümleyi döndürür (sunucu transkripti oraya kadar kırpar).
import { voice } from '../lib/speech';
import { iz } from './iz';
import type { VoiceSel } from '../lib/types';

export type Karakter = 'jarvis' | 'friday';
export interface TOlay { olay: string; [k: string]: any }
export interface Satir { id: number; kim: Karakter | 'user'; metin: string; tamam: boolean }
export interface Tutanak { title: string; date: string; participants: string[]; decisions: string[]; open_questions: string[]; action_items: { who: string; what: string; when: string }[]; summary: string }
export interface Uzlasma { agreed: string[]; disagreed: string[]; recommendation: string; confidence: string }

export interface Gorunum {
  id: string | null;
  mod: 'tartisma' | 'canli';
  demo: boolean;
  /** dinliyor · jarvis · friday · uzlasma · tutanak · bitti · hazirlaniyor */
  durum: string;
  konusan: Karakter | null;
  satirlar: Satir[];
  uzlasma: number | null;
  /** İtiraz anı (kıvılcım efekti başlangıcı, performance.now) */
  kivilcim: number;
  sonuc: Uzlasma | null;
  tutanak: (Tutanak & { dosya?: string }) | null;
  modeller: { jarvis: string; friday: string; hakem: string; ayniAile?: boolean } | null;
  karakterler: Record<Karakter, { ad: string; hitap: string; renk: string }> | null;
  maliyet: { token: number; tts: number; cagri: number };
  tur: number;
  sinirlar: { tur: number; token: number } | null;
  /** Kullanıcı sustuktan ilk sese (ms): canlı modda ölçülür */
  gecikmeler: number[];
  sunucuGecikme: { ilkToken?: number; ilkCumle?: number; tts?: number } | null;
  hata: string | null;
}

export const bosGorunum = (): Gorunum => ({
  id: null, mod: 'tartisma', demo: false, durum: 'hazirlaniyor', konusan: null, satirlar: [], uzlasma: null, kivilcim: 0, sonuc: null, tutanak: null,
  modeller: null, karakterler: null, maliyet: { token: 0, tts: 0, cagri: 0 }, tur: 0, sinirlar: null, gecikmeler: [], sunucuGecikme: null, hata: null,
});

export class Oynatici {
  g: Gorunum = bosGorunum();
  private kuyruk: TOlay[] = [];
  private calisiyor = false;
  private sesler: Record<Karakter, VoiceSel> | null = null;
  /** Bu cihaz ses çalar mı (toplantıyı başlatan cihaz) */
  sesli = true;
  /** En son çalmaya başlayan cümle (araya girmede sunucuya gider) */
  private son: { id: number; sira: number } | null = null;
  /** Kullanıcının sustuğu an (canlı mod gecikme ölçümü) */
  sustu: number | null = null;
  /** Son çalınan cümleler (yankı süzgeci için) */
  sonCumleler: string[] = [];
  private nesil = 0;

  private bildir: (g: Gorunum) => void;
  constructor(bildir: (g: Gorunum) => void) { this.bildir = bildir; }

  private guncelle(d: Partial<Gorunum>) { this.g = { ...this.g, ...d }; this.bildir(this.g); }

  ekle(o: TOlay) {
    switch (o.olay) {
      case 'acildi':
        this.durdur(false);
        this.sesler = o.sesler;
        this.g = { ...bosGorunum(), id: o.id, mod: o.mod, demo: !!o.demo, modeller: o.modeller, karakterler: o.karakterler, sinirlar: o.sinirlar, durum: o.konu ? 'hazirlaniyor' : 'dinliyor', satirlar: o.konu ? [{ id: 0, kim: 'user', metin: o.konu, tamam: true }] : [] };
        this.bildir(this.g);
        voice.beginReply();
        return;
      case 'kullanici': {
        // Duraklamayla bölünmüş söz birleştiyse önceki kullanıcı satırı güncellenir (cevapsız kalan parça ayrı durmaz)
        const s = this.g.satirlar.filter(x => x.tamam || x.metin);
        const i = o.birlesti ? s.map(x => x.kim).lastIndexOf('user') : -1;
        const satir = { id: -Date.now(), kim: 'user' as const, metin: o.metin, tamam: true };
        this.guncelle({ satirlar: i >= 0 ? [...s.slice(0, i), satir, ...s.slice(i + 1)] : [...s, satir], durum: 'hazirlaniyor' });
        return;
      }
      case 'gecikme': this.guncelle({ sunucuGecikme: { ilkToken: o.ilkToken, ilkCumle: o.ilkCumle, tts: o.tts } }); return;
      case 'hata': this.guncelle({ hata: o.mesaj }); return;
      case 'kesildi': return;
      default:
        // "Toplantıyı bitir": süren konuşma kesilir, tutanak hemen gelir
        if (o.olay === 'durum' && o.durum === 'tutanak') this.durdur(false);
        this.kuyruk.push(o);
        // Sıradaki cümlelerin sesini önceden iste
        if (o.olay === 'cumle' && this.sesli && this.sesler) void voice.preload(o.metin, this.sesler[o.kim as Karakter]);
        void this.dongu();
    }
  }

  private async dongu() {
    if (this.calisiyor) return;
    this.calisiyor = true;
    const n = this.nesil;
    try {
      while (this.kuyruk.length && n === this.nesil) {
        const o = this.kuyruk.shift()!;
        await this.isle(o);
      }
    } finally { if (n === this.nesil) this.calisiyor = false; }
  }

  private async isle(o: TOlay) {
    switch (o.olay) {
      case 'konusma':
        this.guncelle({ konusan: o.kim, durum: o.kim, satirlar: [...this.g.satirlar, { id: o.id, kim: o.kim, metin: '', tamam: false }] });
        return;
      case 'cumle': {
        this.son = { id: o.id, sira: o.sira };
        this.guncelle({ satirlar: this.g.satirlar.map(s => (s.id === o.id ? { ...s, metin: s.metin ? `${s.metin} ${o.metin}` : o.metin } : s)) });
        if (o.sira === 0 && this.sustu !== null) {
          const t = this.sustu;
          this.sustu = null;
          voice.onPlay = () => { voice.onPlay = null; this.guncelle({ gecikmeler: [...this.g.gecikmeler, Math.round(performance.now() - t)].slice(-40) }); };
        }
        this.sonCumleler = [...this.sonCumleler, o.metin].slice(-6);
        const t = performance.now();
        if (this.sesli && this.sesler) {
          const ctx = voice.context?.state ?? 'yok';
          await voice.speak(o.metin, this.sesler[o.kim as Karakter]);
          iz(`çalındı ${o.kim} ${o.id}.${o.sira + 1}: ${Math.round(performance.now() - t)} ms · ses bağlamı ${ctx} · ${o.metin.length} karakter`);
        } else {
          iz(`SESSİZ (bu cihaz toplantıyı başlatan değil) ${o.kim} ${o.id}.${o.sira + 1}`);
          await new Promise(r => setTimeout(r, Math.max(1200, o.metin.length * 55)));
        }
        return;
      }
      case 'konusma_son':
        this.guncelle({ konusan: null, satirlar: o.kesildi ? this.g.satirlar.filter(s => s.id !== o.id || s.metin) : this.g.satirlar.map(s => (s.id === o.id ? { ...s, tamam: true } : s)) });
        return;
      case 'hakem':
        this.guncelle({ uzlasma: o.agreement, ...(o.agreement < 60 && o.new_point_raised ? { kivilcim: performance.now() } : {}) });
        return;
      case 'uzlasma': this.guncelle({ sonuc: o.sonuc, durum: 'uzlasma' }); return;
      case 'tutanak': this.guncelle({ tutanak: { ...o.tutanak, dosya: o.dosya }, durum: 'tutanak', maliyet: o.maliyet ?? this.g.maliyet }); return;
      case 'durum': this.guncelle({ durum: o.durum, maliyet: o.maliyet ?? this.g.maliyet, tur: o.tur ?? this.g.tur }); return;
    }
  }

  /** İtiraz gibi görünen Friday cümlesi gelince kıvılcım (hakemden önce de) */
  itiraz() { this.guncelle({ kivilcim: performance.now() }); }

  /** Araya girme / dur: ses anında kesilir, kuyruk boşalır; en son çalan cümle döner */
  durdur(bildir = true): { id: number; sira: number } | null {
    if (this.konusuyor) iz(`durduruldu (${bildir ? 'araya girme/dur' : 'yeni toplantı'})`);
    this.nesil++;
    this.calisiyor = false;
    this.kuyruk = [];
    voice.stop();
    const s = this.son;
    this.son = null;
    if (bildir) this.guncelle({ konusan: null, durum: 'dinliyor', satirlar: this.g.satirlar.filter(x => x.tamam || x.metin).map(x => ({ ...x, tamam: true })) });
    return s;
  }

  get konusuyor() { return this.g.konusan !== null || this.kuyruk.length > 0; }
}

/** Gecikme özeti: medyan ve 90. persentil */
export function ozetGecikme(x: number[]): { medyan: number; p90: number; n: number } | null {
  if (!x.length) return null;
  const s = [...x].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { medyan: q(0.5), p90: q(0.9), n: s.length };
}
