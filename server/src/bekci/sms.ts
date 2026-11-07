// Bekçi · SMS / iMessage / RCS kaynağı (yalnızca macOS). ~/Library/Messages/chat.db SALT OKUNUR açılır (WAL'ı görür;
// immutable kullanılmaz). Veritabanına asla yazılmaz, mesaj okundu işaretlenmez. Yeni mesaj: son işlenen ROWID'den
// büyük ve is_from_me = 0. 2 sn yoklama + chat.db-wal değişince hemen. Tam Disk Erişimi yoksa çökmez, uyarır.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { VERI } from './kaynaklar.js';
import { appleTarih, attributedBodyCoz } from './metin.js';
import type { Kaynak, Mesaj } from './analiz.js';

export const CHAT_DB = process.env.BEKCI_CHAT_DB || path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
const DURUM = path.join(VERI, 'sms.json');

export interface SmsDurum { ok: boolean; hata?: string; kurulum?: string; son?: number }

export const KURULUM_SMS = 'Jarvis sunucusunu çalıştıran uygulamaya (Terminal, iTerm ya da VS Code) Sistem Ayarları → Gizlilik ve Güvenlik → Tam Disk Erişimi verin; iPhone\'da Ayarlar → Mesajlar → Metin Mesajı Yönlendirme\'de bu Mac\'i açın.';

const servis = (s: string | null): Kaynak => (/imessage/i.test(s ?? '') ? 'imessage' : /rcs/i.test(s ?? '') ? 'rcs' : 'sms');

/** Satır → mesaj (metin text'te yoksa attributedBody'den) */
export function satirdanMesaj(r: { ROWID: number | bigint; text: string | null; attributedBody: Uint8Array | null; date: number | bigint | null; service: string | null; gonderen: string | null }): Mesaj | null {
  const metin = (r.text && r.text.trim()) || attributedBodyCoz(r.attributedBody);
  if (!metin) return null;
  return { id: `sms-${r.ROWID}`, kaynak: servis(r.service), gonderen: r.gonderen ?? 'bilinmiyor', zaman: (appleTarih(r.date) ?? new Date()).toISOString(), metin };
}

export class SmsIzleyici {
  durum: SmsDurum = { ok: false };
  private db: DatabaseSync | null = null;
  private son = 0;
  private zaman: NodeJS.Timeout | null = null;
  private izci: fs.FSWatcher | null = null;
  private calisiyor = false;
  private yenidenDene = 0;
  private sonDeneme = 0;
  constructor(private yeni: (m: Mesaj) => void, private dosya = CHAT_DB) {}

  baslat() {
    this.ac();
    this.zaman = setInterval(() => this.yokla(), 2000);
    this.zaman.unref();
  }
  durdur() { if (this.zaman) clearInterval(this.zaman); this.izci?.close(); try { this.db?.close(); } catch { /* yok say */ } this.db = null; }

  private ac() {
    this.sonDeneme = Date.now();
    try {
      this.db = new DatabaseSync(this.dosya, { readOnly: true });
      const enSon = Number((this.db.prepare('SELECT IFNULL(MAX(ROWID), 0) AS m FROM message').get() as { m: number }).m);
      // Kaldığı yerden devam (sunucu yeniden başladıysa arada gelenler kaçmasın); kayıt çok eskiyse baştan başlama
      let kayit = 0;
      try { kayit = JSON.parse(fs.readFileSync(DURUM, 'utf8')).son ?? 0; } catch { /* ilk kez */ }
      this.son = kayit && enSon - kayit < 200 ? kayit : enSon;
      this.durum = { ok: true, son: this.son };
      try {
        this.izci = fs.watch(`${this.dosya}-wal`, { persistent: false }, () => setTimeout(() => this.yokla(), 150));
      } catch { /* WAL yoksa yoklama yeter */ }
      console.log(`[bekçi] SMS izleniyor · ${this.dosya} · ROWID > ${this.son}`);
    } catch (e: any) {
      this.db = null;
      const yetki = /unable to open|authorization|permission|not permitted/i.test(String(e?.message));
      this.durum = { ok: false, hata: yetki ? 'Mesajlar veritabanı açılamadı (Tam Disk Erişimi yok ya da bu bir Mac değil)' : String(e?.message || e), kurulum: KURULUM_SMS };
      if (this.yenidenDene++ === 0) console.warn(`[bekçi] SMS: ${this.durum.hata}. ${KURULUM_SMS}`);
    }
  }

  yokla() {
    if (this.calisiyor) return;
    // Erişim yoksa dakikada bir yeniden dene (Tam Disk Erişimi sonradan verilebilir)
    if (!this.db) { if (Date.now() - this.sonDeneme > 60_000) this.ac(); return; }
    this.calisiyor = true;
    try {
      const st = this.db.prepare(`SELECT m.ROWID, m.text, m.attributedBody, m.date, m.service, h.id AS gonderen
        FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.ROWID > ? AND m.is_from_me = 0 ORDER BY m.ROWID LIMIT 50`);
      // message.date nanosaniye (Apple epoch): JavaScript sayısına sığmaz, BigInt okunur
      st.setReadBigInts(true);
      const satirlar = st.all(this.son) as any[];
      for (const r of satirlar) {
        this.son = Math.max(this.son, Number(r.ROWID));
        const m = satirdanMesaj(r);
        if (m) this.yeni(m);
      }
      if (satirlar.length) { fs.mkdirSync(VERI, { recursive: true }); fs.writeFileSync(DURUM, JSON.stringify({ son: this.son })); }
      this.durum = { ok: true, son: this.son };
    } catch (e: any) {
      this.durum = { ok: false, hata: `okuma hatası: ${e?.message || e}`, kurulum: KURULUM_SMS };
      try { this.db?.close(); } catch { /* yok say */ }
      this.db = null;
    } finally { this.calisiyor = false; }
  }
}
