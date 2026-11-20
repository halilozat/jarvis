// Toplantı Odası · teşhis: panelin dinleme ve çalma olayları tarayıcı konsoluna ve sunucu konsoluna ([panel]).
// Sorun kullanıcının tarayıcısında olduğunda (ses çalmıyor, söz algılanmıyor) nedeni sunucu kaydından görülebilsin.
import { headers } from '../lib/api';

let tampon: string[] = [];
let zaman: ReturnType<typeof setTimeout> | null = null;
const t0 = performance.now();

export function iz(...a: unknown[]) {
  const satir = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.info('[toplantı]', satir);
  tampon.push(`${((performance.now() - t0) / 1000).toFixed(1)}s ${satir}`);
  zaman ??= setTimeout(() => {
    const satirlar = tampon;
    tampon = []; zaman = null;
    void fetch('/api/toplanti/iz', { method: 'POST', headers: headers(), body: JSON.stringify({ satirlar }) }).catch(() => {});
  }, 1000);
}
