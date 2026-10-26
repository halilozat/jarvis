// Haber Modu · arama animasyonu ("internet taranıyor"). Yalnızca sunucudan gelen gerçek olaylarla ilerler
// (server/src/newsSearch.ts): bir yayına ulaşılınca küre üstünde Türkiye'den o şehre ışık yayı çıkar, bulunan her
// başlık yanlarda akan sütunlara katılır (haber foto modunda fotoğraf, video modunda başlık kartı), adımlar ve
// sayaçlar canlı. Google News yayınlarının yeri bilinmediği için küreye konmaz; yalnızca yayın akışında görünür.
// Sunucu önbellekten anında cevap verse de tarama görünsün diye olaylar kuyruğa alınıp tempolu oynatılır (yayınlar
// teker teker, başlıklar akarak); hiçbir olay uydurulmaz ya da atlanmaz.
import type { Sfx } from '../sfx';
import { imgUrl } from './api';
import { esc, saatYaz } from './channel';
import { kureCiz, TR, type Nokta, type Yay } from './globe';
import type { AramaOlay } from './types';


export class Tarama {
  readonly el: HTMLElement;
  private kure: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private sutunlar: HTMLElement[];
  private akis: HTMLElement;
  private adimlar: HTMLElement;
  private sayac: HTMLElement;
  private soru: HTMLElement;
  private sfx: Sfx;
  private noktalar = new Map<string, Nokta>();
  private yaylar: Yay[] = [];
  private donus = 0;
  private bas = 0;
  private kartSirasi = 0;
  private say = { yayin: 0, haber: 0, arsiv: 0 };
  private sonSes = 0;
  private yazilan = '';
  private hedefSoru = '';
  bitti = false;
  private kuyruk: AramaOlay[] = [];
  private sonrakiAt = 0;
  private oynatildi: (() => void) | null = null;
  /** Bütün olaylar ("bitti" dahil) ekranda oynatılınca çözülür */
  readonly tamam = new Promise<void>(r => { this.oynatildi = r; });

  constructor(parent: HTMLElement, sfx: Sfx) {
    this.sfx = sfx;
    const el = document.createElement('div');
    el.className = 'hb-tarama';
    el.innerHTML = `
      <div class="hb-tr-izgara"></div>
      <div class="hb-tr-sutunlar">${'<div class="hb-tr-sutun"></div>'.repeat(4)}</div>
      <canvas class="hb-tr-kure"></canvas>
      <header class="hb-tr-ust"><b>JARVIS · İNTERNET TARAMASI</b><div class="hb-tr-cubuk"><i>⌕</i><span class="hb-tr-soru"></span><u></u></div></header>
      <aside class="hb-tr-akis"></aside>
      <footer class="hb-tr-alt"><ol class="hb-tr-adimlar"></ol><div class="hb-tr-sayac"></div></footer>`;
    parent.appendChild(el);
    this.el = el;
    this.kure = el.querySelector('.hb-tr-kure')!;
    this.g = this.kure.getContext('2d')!;
    this.sutunlar = [...el.querySelectorAll<HTMLElement>('.hb-tr-sutun')];
    this.akis = el.querySelector('.hb-tr-akis')!;
    this.adimlar = el.querySelector('.hb-tr-adimlar')!;
    this.sayac = el.querySelector('.hb-tr-sayac')!;
    this.soru = el.querySelector('.hb-tr-soru')!;
  }

  basla(q: string, now: number) {
    this.bas = now;
    this.hedefSoru = q;
    this.yazilan = '';
    this.el.classList.add('acik');
    this.sfx.scanStart?.();
    this.sayacYaz(now);
  }

  /** Sunucudan gelen olay: kuyruğa (update içinde tempolu oynatılır) */
  olay(o: AramaOlay) { this.kuyruk.push(o); }

  /** Olayın ekranda kalma süresi (ms): bir sonraki olay bu kadar sonra */
  private tempo(o: AramaOlay): number {
    const kalan = this.kuyruk.length;
    const hizli = kalan > 60 ? 0.35 : kalan > 25 ? 0.6 : 1;
    if (o.tip === 'kaynak') return (o.adet ? 95 : 22) * hizli;
    if (o.tip === 'baslik') return 85 * hizli;
    if (o.tip === 'adim') return 260;
    return 0;
  }

  private oynat(o: AramaOlay, now: number) {
    switch (o.tip) {
      case 'sorguEn':
        if (o.qEn) this.el.querySelector('.hb-tr-cubuk u')!.textContent = `EN · ${o.qEn}`;
        return;
      case 'basla':
        for (const y of o.yayinlar) this.noktalar.set(y.ad, { ad: y.ad, konum: y.konum, dil: y.dil, adet: -1, at: 0 });
        this.sayac.dataset.arsiv = String(o.arsivGun);
        return;
      case 'adim': {
        this.adimlar.querySelector('li.simdi')?.classList.replace('simdi', 'tamam');
        const li = document.createElement('li');
        li.className = 'simdi';
        li.textContent = o.ad;
        this.adimlar.appendChild(li);
        return;
      }
      case 'kaynak': {
        if (o.grup === 'arsiv') { this.say.arsiv = o.adet; this.akisEkle(`ARŞİV · ${o.adet} olay`, 'arsiv', o.adet); break; }
        const n = o.konum ? this.noktalar.get(o.ad) : null;
        if (n && o.konum) {
          n.adet = o.adet; n.at = now;
          // Kendi yayınlarımız: Türkiye'den dışa (dünya yayınları) ya da Türkiye içinde kısa yay
          this.yaylar.push({ a: TR, b: o.konum, at: now + this.yaylar.length * 35, guc: o.adet ? 1 : 0.25, dil: o.dil });
        }
        if (o.adet) { this.say.yayin++; this.akisEkle(o.ad, o.dil, o.adet, o.grup === 'google'); }
        break;
      }
      case 'baslik':
        this.say.haber++;
        this.kartEkle(o);
        break;
      case 'bitti':
        this.adimlar.querySelector('li.simdi')?.classList.replace('simdi', 'tamam');
        this.say = { yayin: o.sayac.yayin, haber: o.sayac.haber, arsiv: o.sayac.arsiv };
        this.sayac.dataset.olay = String(o.sayac.olay);
        this.bitti = true;
        this.sfx.damga?.();
        this.oynatildi?.();
        break;
      case 'hata':
        this.adimlar.insertAdjacentHTML('beforeend', `<li class="hata">${esc(o.hata)}</li>`);
        this.bitti = true;
        this.oynatildi?.();
        break;
    }
    this.sayacYaz(now);
    if (o.tip === 'kaynak' && o.adet && now - this.sonSes > 90) { this.sonSes = now; this.sfx.vurgu?.(); }
  }

  private sayacYaz(now: number) {
    const sn = ((now - this.bas) / 1000).toFixed(1);
    const olay = this.sayac.dataset.olay;
    this.sayac.innerHTML = `<span><b>${this.say.yayin}</b>YAYIN</span><span><b>${this.say.haber}</b>HABER</span>${olay ? `<span><b>${olay}</b>OLAY</span>` : ''}<span><b>${this.say.arsiv}</b>ARŞİVDE</span><span><b>${sn}</b>SN</span>`;
  }

  /** Sağdaki yayın akışı: ulaşılan her yayın bir satır (en yeni üstte, en çok 14) */
  private akisEkle(ad: string, dil: 'tr' | 'en' | 'arsiv', adet: number, google = false) {
    const d = document.createElement('div');
    d.className = `hb-tr-yayin ${dil}${google ? ' google' : ''}`;
    d.innerHTML = `<i>${dil === 'en' ? 'EN' : dil === 'arsiv' ? '◷' : 'TR'}</i><span>${esc(ad)}</span><b>${adet}</b>`;
    this.akis.prepend(d);
    while (this.akis.children.length > 14) this.akis.lastElementChild!.remove();
  }

  /** Akan sütunlara bir haber: fotoğraf (varsa) ya da başlık kartı */
  private kartEkle(o: Extract<AramaOlay, { tip: 'baslik' }>) {
    const s = this.sutunlar[this.kartSirasi++ % this.sutunlar.length];
    const d = document.createElement('div');
    d.className = `hb-tr-kart ${o.dil}${o.foto ? ' foto' : ''}`;
    d.innerHTML = `${o.foto ? `<div class="hb-tr-foto" style="background-image:url('${imgUrl(o.foto)}')"></div>` : ''}<em>${esc(o.kaynak)} · ${saatYaz(o.saat)}</em><p>${esc(o.baslik)}</p>`;
    s.prepend(d);
    while (s.children.length > 9) s.lastElementChild!.remove();
  }

  update(now: number, W: number, H: number) {
    if (!this.el.classList.contains('acik')) return;
    // Kuyruk: sırası gelen olaylar
    while (this.kuyruk.length && now >= this.sonrakiAt) {
      const o = this.kuyruk.shift()!;
      this.oynat(o, now);
      this.sonrakiAt = now + this.tempo(o);
    }
    // Arama çubuğu: sorgu harf harf yazılır
    if (this.yazilan.length < this.hedefSoru.length && now - this.bas > 200 + this.yazilan.length * 55) {
      this.yazilan = this.hedefSoru.slice(0, this.yazilan.length + 1);
      this.soru.textContent = `“${this.yazilan}”`;
      this.sfx.typeTick?.();
    }
    if (!this.bitti) this.sayacYaz(now);
    // Küre Türkiye'nin çevresinde salınır (Avrupa, Orta Doğu ve sırayla Amerika görünür)
    this.donus = -25 + Math.sin((now - this.bas) / 1000 * 0.32) * 42;
    this.kureCiz(now, W, H);
  }

  private kureCiz(now: number, W: number, H: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = Math.min(W * 0.17, H * 0.29);
    // Yayın akışı kürenin sağ kenarında
    this.akis.style.left = `${W / 2 + r + 26}px`;
    const boy = Math.ceil(r * 2.6);
    if (this.kure.width !== boy * dpr) { this.kure.width = this.kure.height = boy * dpr; this.kure.style.width = this.kure.style.height = `${boy}px`; }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, boy, boy);
    kureCiz(this.g, { now, cx: boy / 2, cy: boy / 2, r, donus: this.donus, egim: 0.38, yaylar: this.yaylar, noktalar: [...this.noktalar.values()], isin: !this.bitti });
  }

  /** Sonuç hazır: kartlar merkeze toplanır, katman söner */
  async kapat(): Promise<void> {
    this.el.classList.add('bitis');
    await new Promise(r => setTimeout(r, 750));
    this.el.remove();
  }
}
