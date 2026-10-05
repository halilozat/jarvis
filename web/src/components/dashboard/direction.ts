export type Direction = 'up' | 'down' | 'flat' | 'none';

/** Kur değişimi yönü. TL açısından: kur yükseldiyse (▲) kırmızı, düştüyse (▼) yeşil. */
export function direction(changePct: number | null): Direction {
  if (changePct === null) return 'none';
  if (Math.abs(changePct) < 0.005) return 'flat';
  return changePct > 0 ? 'up' : 'down';
}
export const ARROW: Record<Direction, string> = { up: '▲', down: '▼', flat: '■', none: '' };
