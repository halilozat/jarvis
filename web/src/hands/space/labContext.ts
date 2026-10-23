// Uzay Laboratuvarı · açıkken ekrandaki durumun özeti. App sohbet isteğine ekler; Jarvis "neden dondu?" gibi
// soruları bu verilerle cevaplar. (Küçük, bağımsız dosya: App bunu içe aktarınca laboratuvar kodu ana pakete girmez.)

let provider: (() => object | null) | null = null;

export function setLabProvider(p: (() => object | null) | null) { provider = p; }

/** Laboratuvar açık değilse null */
export function labContext(): object | null {
  try { return provider?.() ?? null; } catch { return null; }
}
