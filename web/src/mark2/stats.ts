// Mark 2'nin istemci göstergeleri: hepsi bu cihazdan gerçek ölçüm. Tarayıcı bir değeri vermiyorsa null
// döner ve gösterge "yok" der (tahmin yok).
import { useEffect, useState } from 'react';

export interface ClientStats {
  fps: number | null;
  /** JS yığını (MB) — yalnızca Chromium */
  heapMb: number | null;
  heapLimitMb: number | null;
  /** 0..1 */
  battery: number | null;
  charging: boolean | null;
  /** Mbps (Network Information API; Safari'de yok) */
  downlink: number | null;
  rtt: number | null;
  netType: string | null;
  /** Bu sekme kaç sn'dir açık */
  uptime: number;
  screen: string;
}

type Batt = { level: number; charging: boolean; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
type Conn = { downlink?: number; rtt?: number; effectiveType?: string; addEventListener?(t: string, f: () => void): void };

const t0 = performance.now();

export function useClientStats(): ClientStats {
  const [s, setS] = useState<ClientStats>(() => ({
    fps: null, heapMb: null, heapLimitMb: null, battery: null, charging: null, downlink: null, rtt: null, netType: null, uptime: 0,
    screen: `${screen.width}×${screen.height}`,
  }));

  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const tick = () => { frames++; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    let last = performance.now();
    let batt: Batt | null = null;
    const nav = navigator as Navigator & { getBattery?: () => Promise<Batt>; connection?: Conn };

    const sample = () => {
      const now = performance.now();
      const fps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const c = nav.connection;
      setS(p => ({
        ...p,
        fps: document.visibilityState === 'visible' ? fps : p.fps,
        heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        heapLimitMb: mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : null,
        battery: batt ? batt.level : null,
        charging: batt ? batt.charging : null,
        downlink: c?.downlink ?? null,
        rtt: c?.rtt ?? null,
        netType: c?.effectiveType ?? null,
        uptime: Math.round((now - t0) / 1000),
        screen: `${screen.width}×${screen.height}`,
      }));
    };
    nav.getBattery?.().then(b => { batt = b; sample(); }).catch(() => {});
    const id = setInterval(sample, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, []);
  return s;
}

/** Her saniye yenilenen saat */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const uptimeLabel = (s: number) => (s < 3600 ? `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}` : `${Math.floor(s / 3600)} sa ${pad2(Math.floor((s % 3600) / 60))} dk`);
