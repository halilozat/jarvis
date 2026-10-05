import { useEffect, useState } from 'react';
import { fmt } from '../lib/format';

/** Sıfırdan hedefe sayarak gelen rakam (1,3 sn, yavaşlayarak). */
export function CountUp({ to, digits }: { to: number; digits?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1300);
      const e = 1 - Math.pow(1 - p, 4);
      setV(to * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{fmt(v, digits)}</>;
}
