// Ultron Paketi · gerçek sekmelerin görsel olarak "ele geçirilmesi". Yalnızca görünüm: elemanlara bir data özniteliği ve
// CSS değişkenleri eklenir (turuncu, glitch); hiçbir modülün durumu, ayarı ya da verisi değişmez. temizle() her şeyi
// kaldırır: sahne bitince ya da Esc ile iptal edilince arayüz birebir önceki hâline döner.
import { karma, SEKMELER, type Durum, type SekmeAd } from './zaman';

export interface Hedef { setAttribute(a: string, v: string): void; removeAttribute(a: string): void; getAttribute(a: string): string | null; style: { setProperty(a: string, v: string): void; removeProperty(a: string): string }; getBoundingClientRect?(): DOMRect }
export type Hedefler = Record<SekmeAd, Hedef[]>;

const ETIKET: Record<SekmeAd, string[]> = {
  haber: ['Haber', 'Haberler'],
  bekci: ['Bekçi'],
  ev: ['Akıllı ev', 'Ev', 'Akıllı ev panelini aç'],
  toplanti: ['Toplantı Odası', 'Toplantı'],
};
const OZNITELIK = 'data-ultron-ele';
const DEGISKENLER = ['--u-ele', '--u-glitch', '--u-gx', '--u-kirp-ust', '--u-kirp-alt'];

/** Uygulamadaki sekme elemanları (Mark 1 ve Mark 2 düzenleri): erişilebilirlik etiketi ya da kutu başlığıyla bulunur */
export function hedefleriBul(kok: ParentNode = document): Hedefler {
  const h = { haber: [], bekci: [], ev: [], toplanti: [] } as unknown as Record<SekmeAd, HTMLElement[]>;
  for (const s of SEKMELER) {
    for (const e of kok.querySelectorAll<HTMLElement>('button[aria-label]')) if (ETIKET[s].includes(e.getAttribute('aria-label')!)) h[s].push(e);
  }
  // Haber: Mark 1'de manşet şeridi ve gündem paneli; Mark 2'de GÜNDEM kutusu
  h.haber.push(...kok.querySelectorAll<HTMLElement>('.ticker, .ns'));
  for (const b of kok.querySelectorAll<HTMLElement>('.m2-box')) {
    const t = b.querySelector('.m2-title')?.textContent?.trim();
    if (t === 'GÜNDEM') h.haber.push(b);
    if (t === 'EV') h.ev.push(b);
  }
  return h;
}

/** t anındaki ele geçirme görünümünü uygula (deterministik: glitch karma(floor(t·30)) ile) */
export function uygula(d: Durum, h: Hedefler, kok: { style: { setProperty(a: string, v: string): void } } | null = typeof document !== 'undefined' ? document.documentElement : null) {
  const kare = Math.floor(d.t * 30);
  SEKMELER.forEach((s, si) => {
    const { ele, glitch } = d.sekme[s];
    h[s].forEach((e, i) => {
      if (ele <= 0.001 && glitch <= 0.001) { if (e.getAttribute(OZNITELIK) !== null) temizleBir(e); return; }
      e.setAttribute(OZNITELIK, s);
      e.style.setProperty('--u-ele', ele.toFixed(3));
      e.style.setProperty('--u-glitch', glitch.toFixed(3));
      e.style.setProperty('--u-gx', `${((karma(kare, si * 16 + i) - 0.5) * 18 * glitch).toFixed(1)}px`);
      const kirp = glitch > 0.25 && karma(kare, si * 16 + i + 7) > 0.5;
      e.style.setProperty('--u-kirp-ust', kirp ? `${Math.round(karma(kare, si + 3) * 45)}%` : '0%');
      e.style.setProperty('--u-kirp-alt', kirp ? `${Math.round(karma(kare, si + 5) * 35)}%` : '0%');
    });
  });
  if (kok) kok.style.setProperty('--u-tema', d.tema.toFixed(3));
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('ultron-tema', d.tema > 0.001);
}

function temizleBir(e: Hedef) {
  e.removeAttribute(OZNITELIK);
  for (const v of DEGISKENLER) e.style.removeProperty(v);
}
/** Sahne sonu / iptal: eklenen her şeyi kaldır */
export function temizle(h: Hedefler | null) {
  if (h) for (const s of SEKMELER) h[s].forEach(temizleBir);
  if (typeof document !== 'undefined') {
    document.querySelectorAll(`[${OZNITELIK}]`).forEach(e => temizleBir(e as HTMLElement));
    document.documentElement.classList.remove('ultron-tema');
    document.documentElement.style.removeProperty('--u-tema');
  }
}

/** HUD için sekmelerin ekrandaki kutuları (canlı modda turuncu çerçeve ve ULTRON etiketi) */
export function kutular(h: Hedefler): Record<SekmeAd, DOMRect[]> {
  const o = {} as Record<SekmeAd, DOMRect[]>;
  for (const s of SEKMELER) o[s] = h[s].map(e => e.getBoundingClientRect?.()).filter((r): r is DOMRect => !!r && r.width > 2 && r.height > 2);
  return o;
}
