// Haber Modu · haber kanalı grafikleri (DOM): kanal logosu, "● CANLI", saat, kategori şeridi, alt bant, kayan yazı,
// "SON DAKİKA" bandı, bölüm geçişleri (çapraz ışık süpürmesi + bölüm başlığı) ve açılıştaki motto (daktilo).
// Başlıklar kısa alıntıdır; her başlığın yanında kaynak adı görünür.
import { KATEGORI_AD, KATEGORI_RENK, KATEGORI_SIRA, type Kategori, type KumeOzet } from './types';

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const saatYaz = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
export const alanAdi = (u: string) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return h === 'news.google.com' ? 'Google News' : h; } catch { return ''; } };

export const MOTTO = 'Gündemi takip eden, söylenenlerle gerçekleri karşılaştıran, farklı kaynakları analiz eden ve kimsenin bize anlatmadığı soruları soran bir yapay zekâ. Propagandayı değil, gerçeği arayan… Kendi haber merkezimizi kuruyoruz.';

export class Kanal {
  el: HTMLElement;
  private saatEl: HTMLElement;
  private tarihEl: HTMLElement;
  private seritEl: HTMLElement;
  private altEl: HTMLElement;
  private tickerEl: HTMLElement;
  private tickerIc: HTMLElement;
  private bantEl: HTMLElement;
  private gecisEl: HTMLElement;
  private durumEl: HTMLElement;
  private mottoEl: HTMLElement;
  private sonTicker = '';
  private sonAlt = '';
  private mottoTimer = 0;

  constructor(root: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'hb-kanal';
    el.innerHTML = `
      <div class="hb-logo"><b>JARVIS</b><span>HABER</span><i class="hb-canli"><em></em>CANLI</i></div>
      <div class="hb-saat"><b></b><span></span></div>
      <nav class="hb-serit"></nav>
      <div class="hb-durum"></div>
      <div class="hb-alt"></div>
      <div class="hb-ticker"><div class="hb-bant">GÜNDEM</div><div class="hb-akis"><div class="hb-akis-ic"></div></div></div>
      <div class="hb-gecis"><i></i><b></b></div>
      <div class="hb-motto"><h1></h1><p></p></div>`;
    root.appendChild(el);
    this.el = el;
    const q = (s: string) => el.querySelector(s) as HTMLElement;
    this.saatEl = q('.hb-saat b'); this.tarihEl = q('.hb-saat span');
    this.seritEl = q('.hb-serit'); this.altEl = q('.hb-alt'); this.durumEl = q('.hb-durum');
    this.tickerEl = q('.hb-ticker'); this.tickerIc = q('.hb-akis-ic'); this.bantEl = q('.hb-bant');
    this.gecisEl = q('.hb-gecis'); this.mottoEl = q('.hb-motto');
  }

  /** Saat (her karede çağrılabilir; saniyede bir yazar) */
  tick() {
    const d = new Date();
    const s = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Istanbul' });
    if (this.saatEl.textContent !== s) {
      this.saatEl.textContent = s;
      this.tarihEl.textContent = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' }).toLocaleUpperCase('tr');
    }
  }

  kategoriler(list: { id: Kategori; sayi: number }[], aktif: Kategori | null) {
    const html = [`<span class="${aktif ? '' : 'on'}">TÜMÜ</span>`, ...KATEGORI_SIRA.map(k => {
      const n = list.find(x => x.id === k)?.sayi ?? 0;
      return `<span class="${aktif === k ? 'on' : ''}" style="--k:${KATEGORI_RENK[k]}">${KATEGORI_AD[k]}<sup>${n}</sup></span>`;
    })].join('');
    if (this.seritEl.innerHTML !== html) this.seritEl.innerHTML = html;
  }

  durum(calisan: number, toplam: number, analiz: string) {
    const html = `<i></i>KAYNAK İZLEME <b>${calisan}/${toplam}</b>${analiz ? ` · <em>${esc(analiz)}</em>` : ''}`;
    if (this.durumEl.innerHTML !== html) this.durumEl.innerHTML = html;
  }

  /** Alt bant: öndeki olay (null: gizle) */
  altBant(k: KumeOzet | null, ek = '') {
    const key = k ? `${k.id}|${ek}` : '';
    if (key === this.sonAlt) return;
    this.sonAlt = key;
    if (!k) { this.altEl.classList.remove('acik'); return; }
    const ilk = k.kaynak;
    this.altEl.innerHTML = `
      <div class="hb-alt-kat" style="--k:${KATEGORI_RENK[k.kategori]}">${k.sonDakika ? 'SON DAKİKA' : KATEGORI_AD[k.kategori]}</div>
      <div class="hb-alt-ic">
        <h2>${esc(k.baslik)}</h2>
        <p><b>${k.kaynakSayisi} KAYNAK</b> · ${saatYaz(k.ilk)} · ilk veren: ${esc(ilk)} · <u>${esc(alanAdi(k.url))}</u>${ek ? ` · ${esc(ek)}` : ''}</p>
      </div>`;
    this.altEl.classList.remove('acik');
    void this.altEl.offsetWidth; // animasyonu yeniden başlat
    this.altEl.classList.add('acik');
  }

  /** Kayan yazı: başlıklar ve kaynak adları */
  ticker(list: KumeOzet[]) {
    const html = list.slice(0, 18).map(k => `<span><b style="color:${KATEGORI_RENK[k.kategori]}">●</b> ${esc(k.baslik)} <em>${esc(k.kaynak)}${k.kaynakSayisi > 1 ? ` +${k.kaynakSayisi - 1}` : ''}</em></span>`).join('');
    if (html === this.sonTicker) return;
    this.sonTicker = html;
    this.tickerIc.innerHTML = html + html; // kesintisiz akış için iki kez
    this.tickerIc.style.animationDuration = `${Math.max(40, list.length * 7)}s`;
    const son = list.some(k => k.sonDakika);
    this.bantEl.textContent = son ? 'SON DAKİKA' : 'GÜNDEM';
    this.bantEl.classList.toggle('kirmizi', son);
  }

  gorunur(kanal: boolean, ticker = true) {
    this.el.classList.toggle('gizli', !kanal);
    this.tickerEl.classList.toggle('gizli', !ticker);
  }

  /** Bölüm geçişi: ışık süpürmesi ve başlık bandı */
  gecis(baslik: string, renk = '#ff3b4e') {
    const b = this.gecisEl.querySelector('b')!;
    b.textContent = baslik;
    this.gecisEl.style.setProperty('--k', renk);
    this.gecisEl.classList.remove('oyna');
    void this.gecisEl.offsetWidth;
    this.gecisEl.classList.add('oyna');
  }

  /** Açılış: "HABER MERKEZİ" ve motto daktiloyla. Bitince çözülür. */
  motto(hizli: boolean): Promise<void> {
    clearInterval(this.mottoTimer);
    const h1 = this.mottoEl.querySelector('h1')!, p = this.mottoEl.querySelector('p')!;
    h1.textContent = 'HABER MERKEZİ';
    p.textContent = '';
    this.mottoEl.classList.add('acik');
    // Daktilo saate bağlı: motto 2,2 sn'de (demoda 1,5 sn) yazılır; açılışta kamera ve el modeli yüklenirken kareler
    // gecikse de süre uzamaz. Seslendirme beklenmez, karusel açılırken sürer.
    const t0 = performance.now(), sure = hizli ? 1500 : 2200;
    return new Promise(res => {
      this.mottoTimer = window.setInterval(() => {
        const i = Math.min(MOTTO.length, Math.ceil(((performance.now() - t0) / sure) * MOTTO.length));
        p.innerHTML = `${esc(MOTTO.slice(0, i))}<i class="hb-imlec"></i>`;
        if (i >= MOTTO.length) { clearInterval(this.mottoTimer); res(); }
      }, 30);
    });
  }

  mottoKapat() { clearInterval(this.mottoTimer); this.mottoEl.classList.remove('acik'); }

  dispose() { clearInterval(this.mottoTimer); this.el.remove(); }
}
