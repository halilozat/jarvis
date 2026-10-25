// Kitaplık · kalem animasyonu. Sesle eklenen not ve alıntı açık kitabın sayfasına holografik bir dolma kalemle
// harf harf yazılır (mürekkep parıltısı, kalem sesi). Durum değişince kalem kutuyu işaretler ve damga basılır.
import type { Sfx } from './sfx';

const KALEM_SVG = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
  <defs><linearGradient id="lbk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9fdff"/><stop offset="1" stop-color="#5ff2ff"/></linearGradient></defs>
  <path d="M6 58 L14 40 L46 8 Q52 4 56 8 Q60 12 56 18 L24 50 Z" fill="rgba(10,40,60,0.55)" stroke="url(#lbk)" stroke-width="2"/>
  <path d="M14 40 L24 50" stroke="#ffd36b" stroke-width="2.4"/>
  <path d="M6 58 L10 49 L15 54 Z" fill="#ffd36b"/>
  <circle cx="51" cy="13" r="2.2" fill="#5ff2ff"/>
</svg>`;

/** Sayfa elemanına göre konum */
function yerel(el: HTMLElement, sayfa: HTMLElement) {
  const a = el.getBoundingClientRect(), b = sayfa.getBoundingClientRect();
  const s = b.width / (sayfa.offsetWidth || b.width || 1); // sayfa ölçeklenmiş olabilir (3B dönüşüm)
  return { x: (a.left - b.left) / s, y: (a.top - b.top) / s, w: a.width / s, h: a.height / s };
}

function kalemYap(sayfa: HTMLElement): HTMLDivElement {
  const k = document.createElement('div');
  k.className = 'lb-kalem';
  k.innerHTML = KALEM_SVG;
  sayfa.appendChild(k);
  return k;
}

/** Ucun (sol alt) hedef noktaya gelmesi için kalemi konumla */
const kalemKoy = (k: HTMLDivElement, x: number, y: number, egim = 0) => { k.style.transform = `translate(${x - 4}px, ${y - 58}px) rotate(${egim}deg)`; };

/**
 * Metni hedef paragrafa kalemle yaz. Süre metnin uzunluğuna göre (en fazla ≈3,4 sn).
 * hedef boşaltılır, harfler eklenirken kalem ucu son harfin hemen sağında gezinir.
 */
export function kalemleYaz(hedef: HTMLElement, metin: string, sfx: Sfx, tirnak = false): Promise<void> {
  const sayfa = (hedef.closest('.lb-pg') as HTMLElement) ?? hedef.parentElement!;
  const kalem = kalemYap(sayfa);
  const imlec = document.createElement('i');
  imlec.className = 'lb-uc';
  const yazi = document.createElement('span');
  hedef.replaceChildren(yazi, imlec);
  const tam = tirnak ? `“${metin}”` : metin;
  const sure = Math.min(3400, 600 + tam.length * 45);
  const t0 = performance.now();
  let son = 0, sesAt = 0;
  return new Promise(res => {
    const adim = (now: number) => {
      const p = Math.min(1, (now - t0) / sure);
      const n = Math.round(tam.length * p);
      if (n !== son) {
        // Yeni harfler mürekkep parıltısıyla belirir
        for (let i = son; i < n; i++) {
          const c = document.createElement('span');
          c.className = 'lb-murekkep';
          c.textContent = tam[i];
          yazi.appendChild(c);
        }
        son = n;
        if (now - sesAt > 70) { sesAt = now; sfx.kalem(); }
      }
      const u = yerel(imlec, sayfa);
      kalemKoy(kalem, u.x, u.y + u.h * 0.85, Math.sin(now / 60) * 3);
      if (p < 1) { requestAnimationFrame(adim); return; }
      imlec.remove();
      kalem.classList.add('kalk');
      hedef.closest('.lb-note')?.classList.add('lb-yazildi');
      setTimeout(() => { kalem.remove(); res(); }, 450);
    };
    requestAnimationFrame(adim);
  });
}

/** Durum ya da sayfa: kalem kutunun yanına onay işareti çizer, ardından damga basılır */
export function kalemleIsaretle(hedef: HTMLElement, damga: string, sfx: Sfx): Promise<void> {
  const sayfa = (hedef.closest('.lb-pg') as HTMLElement) ?? hedef.parentElement!;
  const kalem = kalemYap(sayfa);
  const u = yerel(hedef, sayfa);
  const tik = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tik.setAttribute('class', 'lb-tik');
  tik.setAttribute('viewBox', '0 0 40 40');
  tik.innerHTML = '<path d="M6 21 L16 31 L35 8"/>';
  tik.style.left = `${u.x + u.w + 8}px`;
  tik.style.top = `${u.y + u.h / 2 - 16}px`;
  sayfa.appendChild(tik);
  const yol = tik.querySelector('path')!;
  const L = 48;
  const t0 = performance.now(), sure = 700;
  return new Promise(res => {
    const adim = (now: number) => {
      const p = Math.min(1, (now - t0) / sure);
      yol.style.strokeDashoffset = String(L * (1 - p));
      // Kalem ucu onay işaretinin yolunu izler
      const q = p < 0.35 ? p / 0.35 : (p - 0.35) / 0.65;
      const [ax, ay, bx, by] = p < 0.35 ? [6, 21, 16, 31] : [16, 31, 35, 8];
      kalemKoy(kalem, u.x + u.w + 8 + (ax + (bx - ax) * q) * 0.8, u.y + u.h / 2 - 16 + (ay + (by - ay) * q) * 0.8, -6);
      if (Math.random() < 0.3) sfx.kalem();
      if (p < 1) { requestAnimationFrame(adim); return; }
      kalem.classList.add('kalk');
      const d = document.createElement('div');
      d.className = 'lb-damga';
      d.textContent = damga;
      sayfa.appendChild(d);
      sfx.stamp();
      setTimeout(() => { kalem.remove(); res(); }, 900);
    };
    requestAnimationFrame(adim);
  });
}
