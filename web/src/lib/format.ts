/** Türkçe sayı biçimi. `digits` verilmezse tam sayılarda ondalık yok, diğerlerinde 1-2 hane. */
export const fmt = (n: number, digits?: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: digits ?? (Number.isInteger(n) ? 0 : 1), maximumFractionDigits: digits ?? 2 });

/** "2026-10-02" → "02.10" */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** "2026-10-02" → "02.10.2026" */
export const trDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
