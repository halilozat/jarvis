// Gece Gökyüzü · açıkken ekranın özeti. App sohbet isteğine ekler; sunucudaki gokyuzu aracı cevabı bundan kurar
// (server/src/gok.ts). Küçük, bağımsız dosya: App bunu içe aktarınca gökyüzü kodu ana pakete girmez.

let provider: (() => object | null) | null = null;

export function setGokProvider(p: (() => object | null) | null) { provider = p; }

/** Gökyüzü modu kapalıysa null */
export function gokContext(): object | null {
  try { return provider?.() ?? null; } catch { return null; }
}
