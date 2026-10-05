import { useEffect, useMemo, useRef } from 'react';
import { voice } from '../../lib/speech';
import type { JarvisReply } from '../../lib/types';
import type { AgendaItem } from './agenda';
import { DashPanel } from './common';

/** Konuşurken sağ sütundaki "Bugünün akışı". Aktif madde parlar, solundaki çubuk anlatıldıkça dolar. */
export function AgendaPanel({ reply, items, sceneIdx }: { reply: JarvisReply; items: AgendaItem[]; sceneIdx: number }) {
  const barRef = useRef<HTMLElement | null>(null);
  const active = useMemo(() => items.findIndex(it => sceneIdx >= it.start && sceneIdx < it.end), [items, sceneIdx]);

  // İlerleme çubuğu: React yerine doğrudan DOM'a yazılır (her karede yeniden render yok).
  useEffect(() => {
    if (active < 0) return;
    const it = items[active];
    const text = reply.sahneler[sceneIdx]?.ses ?? '';
    const t0 = performance.now();
    let raf = 0;
    const loop = () => {
      // Sunucu sesi çalıyorsa gerçek ilerleme; tarayıcı sesinde metin uzunluğundan tahmin.
      const p = voice.progress() ?? Math.min(1, (performance.now() - t0) / Math.max(2600, text.length * 55));
      const total = Math.min(1, (sceneIdx - it.start + p) / (it.end - it.start));
      if (barRef.current) barRef.current.style.transform = `scaleY(${total})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, items, reply, sceneIdx]);

  return (
    <DashPanel index={0} label="Bugünün akışı" className="agenda">
      <ol className="ag-list">
        {items.map((it, k) => {
          const state = k === active ? 'active' : sceneIdx >= it.end ? 'past' : 'next';
          return (
            <li key={it.start} className={state}>
              <span className="ag-bar"><i ref={k === active ? barRef : undefined} /></span>
              <span className="ag-n">{String(k + 1).padStart(2, '0')}</span>
              <span className="ag-title">{it.title}</span>
            </li>
          );
        })}
      </ol>
    </DashPanel>
  );
}
