// Haber Modu · haber merkezi komutlarının ekranları:
//   canlı yayın (ana haber bülteni) katmanı ve kapanış jeneriği · son dakika geçişi · manşet geri sayımı ·
//   "dünyada bugün" küresi · basın özeti duvarı · bölünmüş ekran (3×3 haber duvarı).
// Sıralamayı ve Jarvis'in anlatımını sahne (scene.ts) yönetir; burada yalnızca görüntü var. Bütün içerik sunucudan
// gelen gerçek olaylardır (server/src/newsCenter.ts).
import type { Sfx } from '../sfx';
import { imgUrl } from './api';
import { esc, saatYaz } from './channel';
import { kureCiz, odakla, type Isaret } from './globe';
import { KATEGORI_AD, KATEGORI_RENK, type Basin, type DunyaBugun, type KumeOzet } from './types';

export const bekle = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const div = (parent: HTMLElement, cls: string, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
/** Animasyonu yeniden başlat */
const tazele = (el: HTMLElement, cls: string) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

// ———————————————— Canlı yayın ————————————————

/** Yayın katmanı: sol üstte "● CANLI · ANA HABER BÜLTENİ", sağ üstte haber sırası; sonda kapanış jeneriği */
export class YayinKatmani {
  readonly el: HTMLElement;
  private sira: HTMLElement;
  private jenerikEl: HTMLElement;
  constructor(parent: HTMLElement) {
    this.el = div(parent, 'hb-yayin', '<div class="hb-yy-rozet"><i></i>CANLI · ANA HABER BÜLTENİ<span class="hb-yy-sira"></span></div><div class="hb-yy-jenerik"></div>');
    this.sira = this.el.querySelector('.hb-yy-sira')!;
    this.jenerikEl = this.el.querySelector('.hb-yy-jenerik')!;
    requestAnimationFrame(() => this.el.classList.add('acik'));
  }
  haber(i: number, n: number, k: KumeOzet) {
    this.sira.innerHTML = `<b>${i}</b><span>/ ${n}</span><em style="--k:${KATEGORI_RENK[k.kategori]}">${KATEGORI_AD[k.kategori]}</em>`;
    tazele(this.sira, 'yeni');
  }
  /** Kapanış jeneriği: bültende taranan kaynaklar aşağıdan yukarı akar */
  async jenerik(kaynaklar: string[]) {
    this.sira.innerHTML = '';
    this.jenerikEl.innerHTML = `<div><h3>JARVIS HABER MERKEZİ</h3><p>Bu bültende taranan kaynaklar</p><ul>${kaynaklar.map(k => `<li>${esc(k)}</li>`).join('')}</ul><em>Propagandayı değil, gerçeği arayan…</em></div>`;
    this.el.classList.add('jenerik');
    await bekle(7500);
  }
  async kapat() { this.el.classList.remove('acik'); await bekle(500); this.el.remove(); }
}

// ———————————————— Son dakika ————————————————

/** Son dakika geçişi: kırmızı ekran, kayan şeritler, dev yazı ve sert ses (1,9 sn) */
export async function sonDakikaGecisi(parent: HTMLElement, sfx: Sfx, alt: string): Promise<void> {
  const el = div(parent, 'hb-sondakika', `<div class="hb-sd-seritler"><i></i><i></i><i></i></div><h1>SON DAKİKA</h1><p>${esc(alt)}</p>`);
  sfx.stinger();
  setTimeout(() => sfx.stinger(), 420);
  setTimeout(() => sfx.damga?.(), 900);
  await bekle(1900);
  el.classList.add('git');
  await bekle(450);
  el.remove();
}

// ———————————————— Manşetler ————————————————

/** Manşet geri sayımı: dev numara, başlık, kaç kaynak; fotoğraf (varsa) arka planda */
export class MansetSayaci {
  readonly el: HTMLElement;
  constructor(parent: HTMLElement) { this.el = div(parent, 'hb-mansetler'); }
  goster(n: number, k: KumeOzet) {
    this.el.style.setProperty('--k', KATEGORI_RENK[k.kategori]);
    this.el.innerHTML = `
      ${k.foto ? `<div class="hb-ms-foto" style="background-image:url('${imgUrl(k.foto)}')"></div>` : ''}
      <b class="hb-ms-no">${n}</b>
      <div class="hb-ms-ic"><em>${KATEGORI_AD[k.kategori]} · ${saatYaz(k.ilk)}</em><h2>${esc(k.baslik)}</h2><p><b>${k.kaynakSayisi}</b> kaynak · ilk veren ${esc(k.kaynak)}</p></div>`;
    tazele(this.el, 'yeni');
  }
  async kapat() { this.el.classList.add('git'); await bekle(450); this.el.remove(); }
}

// ———————————————— Dünyada bugün ————————————————

/** Küre: olaylar yerinde işaretli; odaktaki olaya döner (en kısa yoldan), yanında kart açılır */
export class DunyaBugunKatmani {
  readonly el: HTMLElement;
  private kanvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private kart: HTMLElement;
  private olaylar: DunyaBugun['olaylar'] = [];
  private odak = -1;
  private donus = -30;
  private egim = 0.45;
  private hedef = { donus: -30, egim: 0.45 };
  private odakAt = 0;
  constructor(parent: HTMLElement) {
    this.el = div(parent, 'hb-dunyabugun', '<canvas></canvas><div class="hb-db-baslik">DÜNYADA BUGÜN</div><div class="hb-db-kart"></div>');
    this.kanvas = this.el.querySelector('canvas')!;
    this.g = this.kanvas.getContext('2d')!;
    this.kart = this.el.querySelector('.hb-db-kart')!;
    requestAnimationFrame(() => this.el.classList.add('acik'));
  }
  ac(olaylar: DunyaBugun['olaylar']) { this.olaylar = olaylar; }
  odakla(i: number, now: number) {
    this.odak = i; this.odakAt = now;
    const o = this.olaylar[i];
    this.hedef = odakla(o.konum);
    // En kısa yoldan dön
    while (this.hedef.donus - this.donus > 180) this.hedef.donus -= 360;
    while (this.hedef.donus - this.donus < -180) this.hedef.donus += 360;
    const k = o.kume;
    this.kart.style.setProperty('--k', KATEGORI_RENK[k.kategori]);
    this.kart.innerHTML = `${k.foto ? `<div class="hb-db-foto" style="background-image:url('${imgUrl(k.foto)}')"></div>` : ''}<em>${esc(o.yer.toLocaleUpperCase('tr'))} · ${i + 1}/${this.olaylar.length}</em><h3>${esc(k.baslik)}</h3><p><b>${k.kaynakSayisi}</b> kaynak · ${saatYaz(k.son)}</p>`;
    tazele(this.kart, 'yeni');
  }
  update(now: number, dt: number, W: number, H: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.kanvas.width !== Math.round(W * dpr)) { this.kanvas.width = Math.round(W * dpr); this.kanvas.height = Math.round(H * dpr); }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // Odak yoksa yavaş döner; varsa hedefe yumuşak geçiş
    if (this.odak < 0) { this.donus += dt * 8; this.hedef.donus = this.donus; }
    const a = Math.min(1, dt * 2.4);
    this.donus += (this.hedef.donus - this.donus) * a;
    this.egim += (this.hedef.egim - this.egim) * a;
    // Odakta küre büyür ve sola kayar (kart sağda)
    const yakin = this.odak >= 0 ? Math.min(1, (now - this.odakAt) / 900) : 0;
    const r = Math.min(W, H) * (0.3 + 0.08 * yakin);
    const isaretler: Isaret[] = this.olaylar.map((o, i) => ({ konum: o.konum, etiket: o.yer, odak: i === this.odak ? yakin : 0 }));
    kureCiz(g, { now, cx: W * (0.5 - 0.14 * Math.min(1, this.odak >= 0 ? 1 : 0)), cy: H * 0.5, r, donus: this.donus, egim: this.egim, isaretler, isin: this.odak < 0 });
  }
  async kapat() { this.el.classList.remove('acik'); await bekle(500); this.el.remove(); }
}

// ———————————————— Basın özeti ————————————————

const GRUP_RENK = ['#ffb340', '#5fb4ff', '#3ee08f', '#b58cff', '#ff7a8a', '#4ff0e0'];

/** Her kaynağın baş haberi; aynı olayı öne çıkaranlar aynı renkte, önde. Kimsenin baş habere koymadığı büyük olay ayrıca. */
export function basinHtml(b: Basin): string {
  const renk = new Map(b.ortak.slice(0, GRUP_RENK.length).map((o, i) => [o.kume.id, GRUP_RENK[i]]));
  // Önce gruplar (en kalabalıktan), sonra diğerleri kendi sırasıyla
  const grupSira = (id: string | null) => (id && renk.has(id) ? [...renk.keys()].indexOf(id) : 99);
  const sira = b.kaynaklar.map((x, i) => ({ x, i })).sort((p, q) => grupSira(p.x.kumeId) - grupSira(q.x.kumeId) || p.i - q.i).map(o => o.x);
  const kartlar = sira.map((x, i) => {
    const r = x.kumeId ? renk.get(x.kumeId) : undefined;
    const n = r ? b.ortak.find(o => o.kume.id === x.kumeId)!.sayi : 0;
    return `<article class="hb-bs-kart${r ? ' grup' : ''}" style="--i:${i};${r ? `--g:${r}` : ''}"><header><b>${esc(x.kaynak)}</b><time>${saatYaz(x.saat)}</time></header><p>${esc(x.baslik)}</p>${r ? `<i>${n} kaynak aynı olay</i>` : ''}</article>`;
  }).join('');
  const ust = b.ortak[0] ? `<p class="hb-bs-ozet"><b style="color:${GRUP_RENK[0]}">${b.ortak[0].sayi} kaynak</b> aynı olayı öne çıkarıyor: ${esc(b.ortak[0].kume.baslik)}</p>` : '<p class="hb-bs-ozet">Kaynakların baş haberleri birbirinden farklı.</p>';
  const yok = b.mansetteYok ? `<div class="hb-bs-yok"><b>MANŞETLERDE YOK</b><span>${b.mansetteYok.kaynakSayisi} kaynak veriyor ama hiçbiri baş habere koymamış:</span><h4>${esc(b.mansetteYok.baslik)}</h4></div>` : '';
  return `<div class="hb-basin"><h2>BASIN ÖZETİ <span>${b.kaynaklar.length} kaynağın şu anki baş haberi · ${saatYaz(b.at)}</span></h2>${ust}<div class="hb-bs-ic"><div class="hb-bs-duvar">${kartlar}</div>${yok}</div></div>`;
}

// ———————————————— Bölünmüş ekran ————————————————

/** 3×3 haber duvarı: numaralı kutular; işaret edilen büyür, tutulan açılır */
export function duvarHtml(list: KumeOzet[], hover: number): string {
  return `<div class="hb-duvar9"><h2>HABER DUVARI <span>☝️ seç · 🤏 tut: aç · "3 numarayı aç"</span></h2><div class="hb-dv-izgara">${list.slice(0, 9).map((k, i) => `
    <article class="hb-dv-kart${i === hover ? ' secili' : ''}" data-i="${i}" style="--i:${i};--k:${KATEGORI_RENK[k.kategori]}">
      ${k.foto ? `<div class="hb-dv-foto" style="background-image:url('${imgUrl(k.foto)}')"></div>` : '<div class="hb-dv-foto yok"></div>'}
      <b class="hb-dv-no">${i + 1}</b>
      <div class="hb-dv-ic"><em>${KATEGORI_AD[k.kategori]} · ${saatYaz(k.son)}</em><h3>${esc(k.baslik)}</h3><p><b>${k.kaynakSayisi}</b> kaynak</p></div>
    </article>`).join('')}</div></div>`;
}
