// Haber Modu · holografik kart karuseli. Olaylar önünüzde yarım daire şeklinde dizilir; öndeki kart ortada.
// Derinlik: geride kalan kartlar (z < -R·0,3) kişinin ARKASINDAKİ katmana taşınır; kişi ayırma maskesi olan
// tuval iki katmanın arasındadır, böylece arkadaki kartlar başınızın arkasında kalır.
// Dönüş: 🤏 tutulunca karusel eli birebir izler (yakala/surukle); bırakınca elin hızıyla kayar, sürtünmeyle
// yavaşlar, en yakın karta yaylanarak oturur. Savurma da hız verir. İki elle yakınlaştırmada öndeki kart büyür (zoom).
import { alanAdi, esc, saatYaz } from './channel';
import { imgUrl } from './api';
import { KATEGORI_AD, KATEGORI_RENK, type KumeOzet } from './types';

const ARALIK = 0.58; // radyan: kartlar arası açı (yan kart öndekinin ancak çeyreğini örter)
const GORUNUR = 2.1; // radyan: bundan ötesi gizli

interface Kart { kume: KumeOzet; el: HTMLElement; katman: 'arka' | 'on' | null; rect: DOMRect | null }

export class Karusel {
  private arka: HTMLElement;
  private on: HTMLElement;
  private kartlar: Kart[] = [];
  /** Öndeki kartın (kesirli) sırası */
  pos = 0;
  private vel = 0;
  hover = -1;
  /** Kart tutuldu (🤏): öne doğru büyür */
  tutulan = -1;
  /** Karusel geri çekildi (detay açıkken) */
  geri = 0;
  private geriHedef = 0;
  /** Elde: karusel ele bağlı (fizik durur) */
  private elde = false;
  private pos0 = 0;
  /** İki elle yakınlaştırma: öndeki kartın büyüklüğü (1 = normal); bırakınca 1'e döner */
  zoom = 1;
  zoomHedef = 1;
  /** Bir kartlık dönüşün ekrandaki karşılığı (px): el bu kadar kayınca karusel bir kart döner */
  private kartPx = 300;

  constructor(arka: HTMLElement, on: HTMLElement) { this.arka = arka; this.on = on; }

  get on_(): number { return this.kartlar.length ? ((Math.round(this.pos) % this.kartlar.length) + this.kartlar.length) % this.kartlar.length : -1; }
  get onKume(): KumeOzet | null { return this.kartlar[this.on_]?.kume ?? null; }
  get sayi() { return this.kartlar.length; }
  get duruyor() { return Math.abs(this.vel) < 0.05 && Math.abs(this.pos - Math.round(this.pos)) < 0.02; }

  kumeler(list: KumeOzet[]) {
    const eskiId = this.onKume?.id;
    for (const k of this.kartlar) k.el.remove();
    this.kartlar = list.map(kume => ({ kume, el: this.kartYap(kume), katman: null, rect: null }));
    const i = eskiId ? list.findIndex(k => k.id === eskiId) : -1;
    this.pos = i >= 0 ? i : 0;
    this.vel = 0;
  }

  private kartYap(k: KumeOzet): HTMLElement {
    const el = document.createElement('article');
    el.className = 'hb-kart';
    el.style.setProperty('--k', KATEGORI_RENK[k.kategori]);
    const noktalar = k.kaynaklar.slice(0, 10).map(() => '<i></i>').join('');
    el.innerHTML = `
      ${k.foto ? `<div class="hb-kart-foto" style="background-image:url('${imgUrl(k.foto)}')"></div>` : '<div class="hb-kart-foto yok"></div>'}
      <header><b>${k.sonDakika ? 'SON DAKİKA' : KATEGORI_AD[k.kategori]}</b><time>${saatYaz(k.son)}</time></header>
      <h3>${esc(k.baslik)}</h3>
      <footer><span class="hb-say"><b>${k.kaynakSayisi}</b> kaynak <span class="hb-noktalar">${noktalar}</span></span><u>${esc(k.kaynak)} · ${esc(alanAdi(k.url))}</u></footer>`;
    return el;
  }

  /** Savurma: yön +1 sonraki, -1 önceki */
  savur(yon: number, hiz = 1) { this.vel += yon * Math.min(9, 2.6 + hiz * 1.6); }
  git(i: number) { if (!this.kartlar.length) return; this.vel = 0; this.pos = Math.round(this.pos) + (((i - this.on_) % this.kartlar.length) + this.kartlar.length) % this.kartlar.length; }
  adim(yon: number) { this.vel = 0; this.pos = Math.round(this.pos) + yon; }
  geriCekil(on: boolean) { this.geriHedef = on ? 1 : 0; }

  /** 🤏 tutuş başladı: karusel ele bağlanır */
  yakala() { this.elde = true; this.pos0 = this.pos; this.vel = 0; }
  /** Elin tutuştan beri yatay yer değiştirmesi (px): kart ele birebir eşlik eder (sağa çekince önceki kart gelir) */
  surukle(dx: number) { if (this.elde) this.pos = this.pos0 - dx / this.kartPx; }
  /** Bırakış: elin hızı (px/sn) karusele hız olarak geçer */
  birak(vx = 0) { if (!this.elde) return; this.elde = false; this.vel = Math.max(-7, Math.min(7, -vx / this.kartPx)); }
  get tutuluyor() { return this.elde; }

  /** Ekrandaki noktanın üstündeki kart (önceki karenin konumlarıyla) */
  kartAt(x: number, y: number): number {
    let best = -1, bz = -Infinity;
    this.kartlar.forEach((k, i) => {
      const r = k.rect;
      if (!r || k.el.style.opacity === '0') return;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const z = Number(k.el.dataset.z || 0);
        if (z > bz) { bz = z; best = i; }
      }
    });
    return best;
  }
  kume(i: number) { return this.kartlar[i]?.kume ?? null; }
  rectOf(i: number) { return this.kartlar[i]?.rect ?? null; }

  update(dt: number, W: number, H: number) {
    const n = this.kartlar.length;
    if (!n) return;
    // Fizik: sürtünme, durunca en yakın karta yay (elde değilken)
    if (!this.elde) this.pos += this.vel * dt;
    this.vel *= Math.exp(-dt * 2.4);
    if (Math.abs(this.vel) < 1.2) {
      const hedef = Math.round(this.pos);
      this.vel += (hedef - this.pos) * 22 * dt;
      this.vel *= Math.exp(-dt * 6);
    }
    if (this.elde) this.vel = 0;
    this.geri += (this.geriHedef - this.geri) * Math.min(1, dt * 6);
    this.zoom += (this.zoomHedef - this.zoom) * Math.min(1, dt * 14);
    const R = Math.min(W * 0.42, H * 0.8);
    this.kartPx = R * ARALIK;
    const kartW = Math.min(420, W * 0.27);
    const cy = H * (0.47 - this.geri * 0.08);
    for (let i = 0; i < n; i++) {
      const k = this.kartlar[i];
      // Halkada en kısa yönden fark
      let d = i - this.pos;
      d = ((d % n) + n * 1.5) % n - n / 2;
      const th = d * ARALIK;
      const gizli = Math.abs(th) > GORUNUR;
      const x = Math.sin(th) * R, z = (Math.cos(th) - 1) * R - this.geri * R * 0.9;
      const vurgu = i === this.hover ? 1 : 0, tut = i === this.tutulan ? 1 : 0;
      const one = Math.abs(d) < 0.5;
      const zm = one ? this.zoom : 1;
      const sc = (1 + vurgu * 0.1 + tut * 0.16 + (one ? 0.06 : 0)) * zm;
      const katman: 'arka' | 'on' = z < -R * 0.3 ? 'arka' : 'on';
      if (k.katman !== katman) { (katman === 'arka' ? this.arka : this.on).appendChild(k.el); k.katman = katman; }
      // Yakınlaşırken yandaki kartlar solar (öndeki kart ekranı doldurur)
      const sol = one ? 1 : Math.max(0.15, 1 - Math.max(0, this.zoom - 1) * 1.6);
      const opak = (gizli ? 0 : Math.max(0, 1 - Math.max(0, Math.abs(th) - 1.4) / 0.7) * (1 - this.geri * 0.75)) * sol;
      k.el.style.width = `${kartW}px`;
      k.el.style.transform = `translate(-50%, -50%) translate3d(${W / 2 + x}px, ${cy}px, ${z + tut * 120 + (zm - 1) * 160}px) rotateY(${-th}rad) scale(${sc})`;
      k.el.style.opacity = String(opak);
      k.el.style.zIndex = String(Math.round(1000 + z));
      k.el.dataset.z = String(z);
      k.el.classList.toggle('vurgu', !!vurgu);
      k.el.classList.toggle('one', Math.abs(d) < 0.5);
      k.el.classList.toggle('tutuldu', !!tut);
      k.rect = opak > 0.05 ? k.el.getBoundingClientRect() : null;
    }
  }

  dispose() { for (const k of this.kartlar) k.el.remove(); this.kartlar = []; }
}
