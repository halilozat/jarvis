// Toplantı Odası · canlı dinleme: sürekli mikrofon (yankı engelleme açık), enerji tabanlı VAD, sürekli Web Speech
// tanıma. Kullanıcı ~700 ms susunca o ana kadarki metin hemen gönderilir (tanımanın kendi "final"ini beklemeden).
// Jarvis/Friday konuşurken eşik yükselir ve daha uzun ses ister (hoparlör sesi araya girme sayılmasın); yine de
// konuşma algılanırsa onAraGir() → ses anında kesilir. Tanıma sonucu son çalınan cümlelere çok benziyorsa (yankı)
// atılır. Web Speech yoksa konuşma parçaları sunucunun ses tanımasına gönderilir.
import { stt } from '../lib/api';
import { SozToplayici, Vad, yankiMi } from './vad';

export { benzerlik, SozToplayici, Vad, yankiMi } from './vad';

export interface CanliSecenek {
  sessizlikMs: number;
  /** Şu an Jarvis ya da Friday konuşuyor mu (eşik yükselir) */
  konusuyorMu(): boolean;
  /** Son çalınan cümleler (yankı süzgeci) */
  sonCumleler(): string[];
  onAraGir(): void;
  /** Kullanıcının sözü; sustu = sessizliğin başladığı an (performance.now) */
  onSoz(metin: string, sustu: number): void;
  onAra?(metin: string): void;
  onHata?(m: string): void;
}

import { iz } from './iz';

export class CanliDinleyici {
  private akis: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  analiz: AnalyserNode | null = null;
  private buf = new Float32Array(1024);
  private zaman: ReturnType<typeof setInterval> | null = null;
  private tanima: any = null;
  private kayit: MediaRecorder | null = null;
  private parcalar: Blob[] = [];
  private vad: Vad;
  private toplayici: SozToplayici;
  private araGirildi = false;
  /** Karakterin en son konuştuğu an (yankı süzgecinin zaman penceresi) */
  private sonKarakterSesi = -Infinity;
  private kapali = false;
  /** Anlık ses seviyesi 0..1 (dalga formu) */
  seviye = 0;

  private o: CanliSecenek;
  constructor(o: CanliSecenek) {
    this.o = o;
    this.vad = new Vad(o.sessizlikMs);
    // Sustuktan sonra tanıma metni henüz gelmediyse söz atılmaz, beklenir (ilk cümle sorunu)
    this.toplayici = new SozToplayici((metin, sustu, neden) => {
      // Yankı yalnızca karakter konuşurken ya da hemen ardından olabilir; sonra konunun kelimelerini tekrar etmek yankı değildir
      if (performance.now() - this.sonKarakterSesi < 2500 && yankiMi(metin, this.o.sonCumleler())) { iz('yankı sayıldı, atıldı:', metin); return; }
      iz(`gönderildi (${neden}):`, metin);
      this.o.onSoz(metin, sustu);
    });
  }

  async baslat() {
    this.akis = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.ctx = new AudioContext();
    const kaynak = this.ctx.createMediaStreamSource(this.akis);
    this.analiz = this.ctx.createAnalyser();
    this.analiz.fftSize = 2048;
    kaynak.connect(this.analiz);
    this.zaman = setInterval(() => this.adim(), 30);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) this.tanimaBaslat(SR);
  }

  private tanimaBaslat(SR: any) {
    const r = new SR();
    r.lang = 'tr-TR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      // Karakter konuşurken (ve araya girilmediyse) gelen metin büyük ihtimalle hoparlör sesi: tutma
      const yoksay = this.o.konusuyorMu() && !this.araGirildi;
      const son = e.results[e.results.length - 1];
      iz(`tanıma ${son?.isFinal ? 'kesin' : 'ara'}${yoksay ? ' (karakter konuşuyor, yok sayıldı)' : ''}:`, son?.[0]?.transcript);
      this.toplayici.sonuc(e.results, yoksay);
      if (!yoksay) this.o.onAra?.(this.toplayici.metin());
    };
    r.onstart = () => iz('tanıma başladı');
    r.onerror = (e: any) => { iz('tanıma hatası:', e.error); if (!['no-speech', 'aborted', 'network'].includes(e.error)) this.o.onHata?.(`ses tanıma: ${e.error}`); };
    r.onend = () => { iz('tanıma bitti, yeniden başlıyor'); this.toplayici.yenidenBasladi(); if (!this.kapali) try { r.start(); } catch { /* zaten çalışıyor */ } };
    r.start();
    this.tanima = r;
  }

  private adim() {
    if (!this.analiz) return;
    this.analiz.getFloatTimeDomainData(this.buf);
    let t = 0;
    for (const v of this.buf) t += v * v;
    const rms = Math.sqrt(t / this.buf.length);
    this.seviye = Math.min(1, rms * 12);
    const karakter = this.o.konusuyorMu();
    if (karakter) this.sonKarakterSesi = performance.now();
    const r = this.vad.adim(rms, performance.now(), karakter);
    if (r) iz(r.tur === 'basladi' ? `VAD: konuşma başladı${r.araGirme ? ' (araya girme)' : ''}` : 'VAD: sustu', `rms ${rms.toFixed(3)} · taban ${this.vad.taban.toFixed(4)}`);
    if (r?.tur === 'basladi') {
      this.toplayici.konusmaBasladi();
      if (r.araGirme) { this.araGirildi = true; this.toplayici.tuket(); this.o.onAraGir(); }
      if (!this.tanima) this.kayitBaslat();
    } else if (r?.tur === 'bitti') this.bitti(r.sustu);
  }

  private bitti(sustu: number) {
    this.araGirildi = false;
    if (!this.tanima) { this.kayitBitir(sustu); return; }
    this.toplayici.sustu(sustu);
  }

  // Web Speech yoksa: konuşma parçasını kaydet, sunucunun ses tanımasına gönder
  private kayitBaslat() {
    if (!this.akis || this.kayit) return;
    this.parcalar = [];
    this.kayit = new MediaRecorder(this.akis);
    this.kayit.ondataavailable = e => { if (e.data.size) this.parcalar.push(e.data); };
    this.kayit.start();
  }
  private kayitBitir(sustu: number) {
    const k = this.kayit;
    if (!k) return;
    this.kayit = null;
    k.onstop = () => {
      const b = new Blob(this.parcalar, { type: k.mimeType });
      stt(b).then(t => { if (t.trim() && !yankiMi(t, this.o.sonCumleler())) this.o.onSoz(t.trim(), sustu); }).catch(e => this.o.onHata?.(e.message));
    };
    k.stop();
  }

  durdur() {
    this.kapali = true;
    this.toplayici.durdur();
    if (this.zaman) clearInterval(this.zaman);
    try { this.tanima?.stop(); } catch { /* yok say */ }
    try { this.kayit?.stop(); } catch { /* yok say */ }
    this.akis?.getTracks().forEach(t => t.stop());
    void this.ctx?.close();
    this.analiz = null;
  }
}
