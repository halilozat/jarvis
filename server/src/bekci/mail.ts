// Bekçi · e-posta kaynağı: IMAP IDLE ile anlık dinleme (imapflow), birden çok hesap. Kutu SALT OKUNUR açılır
// (EXAMINE) ve mesajlar BODY.PEEK ile çekilir: okundu işaretleme, taşıma, silme yok. Bağlantı koparsa üstel geri
// çekilmeyle yeniden bağlanır; IDLE her 25 dakikada yenilenir. MIME: postal-mime. Görsel eklerdeki QR: jsQR.
import { ImapFlow } from 'imapflow';
import jpeg from 'jpeg-js';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import PostalMime from 'postal-mime';
import { parse as tldParse } from 'tldts';
import type { Mesaj } from './analiz.js';
import { htmlLinkleri, htmlMetin, linkKur, type Link } from './link.js';

export interface Hesap { name: string; host: string; port?: number; user: string; pass: string; secure?: boolean }
export interface HesapDurum { ad: string; ok: boolean; hata?: string; son?: string }

export function hesaplariOku(): { hesaplar: Hesap[]; hata?: string } {
  const ham = process.env.IMAP_ACCOUNTS?.trim();
  if (!ham) return { hesaplar: [] };
  try {
    const j = JSON.parse(ham);
    if (!Array.isArray(j)) throw new Error('dizi değil');
    return { hesaplar: j.filter(h => h?.host && h?.user && h?.pass).map(h => ({ name: String(h.name || h.user), host: h.host, port: Number(h.port) || 993, user: h.user, pass: h.pass, secure: h.secure !== false })) };
  } catch (e: any) { return { hesaplar: [], hata: `IMAP_ACCOUNTS okunamadı (${e?.message}). Örnek: [{"name":"gmail","host":"imap.gmail.com","port":993,"user":"...","pass":"uygulama-sifresi"}]` }; }
}

const alanOf = (adres?: string | null) => { const d = adres?.split('@')[1]?.toLowerCase().replace(/[>\s]/g, ''); return d ? tldParse(d).domain ?? d : null; };

/** Authentication-Results başlığından spf/dkim/dmarc sonuçları */
export function kimlikSonuclari(basliklar: { key: string; value: string }[]): { spf?: string; dkim?: string; dmarc?: string } | null {
  const ar = basliklar.filter(h => h.key === 'authentication-results').map(h => h.value).join('; ');
  if (!ar) return null;
  const al = (k: string) => new RegExp(`\\b${k}=(\\w+)`, 'i').exec(ar)?.[1]?.toLowerCase();
  return { spf: al('spf'), dkim: al('dkim'), dmarc: al('dmarc') };
}

/** Görsel ekte QR kod varsa içindeki metin (PNG / JPEG; PDF desteklenmez) */
export function qrCoz(icerik: Uint8Array, tur: string): string | null {
  try {
    let w: number, h: number, data: Uint8ClampedArray;
    if (/png/i.test(tur)) { const p = PNG.sync.read(Buffer.from(icerik)); w = p.width; h = p.height; data = new Uint8ClampedArray(p.data); }
    else if (/jpe?g/i.test(tur)) { const j = jpeg.decode(Buffer.from(icerik), { useTArray: true, maxMemoryUsageInMB: 256 }); w = j.width; h = j.height; data = new Uint8ClampedArray(j.data); }
    else return null;
    if (w * h > 25_000_000) return null;
    return jsQR(data, w, h)?.data ?? null;
  } catch { return null; }
}

/** Ham e-posta → analiz mesajı */
export async function mailCoz(ham: Uint8Array | string, id: string): Promise<Mesaj> {
  const e = await PostalMime.parse(ham);
  const from = e.from && 'address' in e.from ? e.from : null;
  const replyTo = e.replyTo?.find(a => 'address' in a && a.address) as { address: string } | undefined;
  const returnPath = e.headers.find(h => h.key === 'return-path')?.value.replace(/[<>]/g, '');
  const htmlL: Link[] = e.html ? htmlLinkleri(e.html) : [];
  const qrL: Link[] = [];
  for (const a of e.attachments ?? []) {
    if (!/^image\/(png|jpe?g)/i.test(a.mimeType) || !a.content) continue;
    const icerik = typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : new Uint8Array(a.content as ArrayBuffer);
    const q = qrCoz(icerik, a.mimeType);
    const l = q && /^https?:\/\//i.test(q) ? linkKur(q) : null;
    if (l) qrL.push({ ...l, qr: true });
  }
  const metin = (e.text?.trim() || (e.html ? htmlMetin(e.html) : '')).slice(0, 20_000);
  return {
    id, kaynak: 'mail', gonderen: from?.address ?? returnPath ?? 'bilinmiyor', zaman: (e.date ? new Date(e.date) : new Date()).toISOString(), metin, konu: e.subject ?? '',
    mail: {
      fromAlan: alanOf(from?.address), gorunenAd: from?.name || null, replyToAlan: alanOf(replyTo?.address), auth: kimlikSonuclari(e.headers),
      ekler: (e.attachments ?? []).map(a => ({ ad: a.filename ?? '(adsız)', tur: a.mimeType })), htmlLinkler: htmlL, qrLinkler: qrL,
    },
  };
}

/** Bir hesabı IDLE ile dinler; yeni mesajları (yalnızca bağlandıktan sonra gelenleri) yeni() ile verir */
export class MailIzleyici {
  durum: HesapDurum;
  private istemci: ImapFlow | null = null;
  private sonUid = 0;
  private gecikme = 2000;
  private kapali = false;
  constructor(private h: Hesap, private yeni: (m: Mesaj) => void) { this.durum = { ad: h.name, ok: false, hata: 'bağlanıyor' }; }

  async baslat() {
    while (!this.kapali) {
      try {
        await this.bagla();
        this.gecikme = 2000;
        await new Promise<void>(ok => this.istemci!.once('close', () => ok()));
        if (this.kapali) return;
        this.durum = { ad: this.h.name, ok: false, hata: 'bağlantı koptu, yeniden bağlanıyor' };
      } catch (e: any) {
        const kimlik = /auth|credential|login|invalid/i.test(String(e?.responseText ?? e?.message));
        this.durum = { ad: this.h.name, ok: false, hata: kimlik ? 'Giriş başarısız: kullanıcı adı ya da uygulama şifresi yanlış' : `Bağlanamadı: ${e?.message || e}` };
        console.warn(`[bekçi] mail ${this.h.name}: ${this.durum.hata}`);
      }
      await new Promise(r => setTimeout(r, this.gecikme));
      this.gecikme = Math.min(this.gecikme * 2, 5 * 60_000);
    }
  }

  private async bagla() {
    const c = new ImapFlow({ host: this.h.host, port: this.h.port ?? 993, secure: this.h.secure !== false, auth: { user: this.h.user, pass: this.h.pass }, logger: false, maxIdleTime: 25 * 60_000 });
    c.on('error', () => {}); // 'close' ile ele alınır
    await c.connect();
    const kutu = await c.mailboxOpen('INBOX', { readOnly: true });
    if (!this.sonUid) this.sonUid = Math.max(0, Number(kutu.uidNext) - 1);
    this.istemci = c;
    this.durum = { ad: this.h.name, ok: true };
    console.log(`[bekçi] mail ${this.h.name} dinleniyor (IDLE) · UID > ${this.sonUid}`);
    c.on('exists', () => { void this.cek(); });
  }

  private cekiliyor = false;
  private async cek() {
    if (this.cekiliyor || !this.istemci) return;
    this.cekiliyor = true;
    try {
      for await (const m of this.istemci.fetch(`${this.sonUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
        if (m.uid <= this.sonUid || !m.source) continue;
        this.sonUid = m.uid;
        this.durum = { ad: this.h.name, ok: true, son: new Date().toISOString() };
        try { this.yeni(await mailCoz(m.source, `mail-${this.h.name}-${m.uid}`)); } catch (e) { console.warn('[bekçi] mail çözülemedi', e instanceof Error ? e.message : e); }
      }
    } catch (e) { console.warn('[bekçi] mail çekilemedi', e instanceof Error ? e.message : e); } finally { this.cekiliyor = false; }
  }

  async durdur() { this.kapali = true; await this.istemci?.logout().catch(() => {}); }
}
