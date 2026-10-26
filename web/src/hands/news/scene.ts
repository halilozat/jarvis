// Haber Modu · sahne: El Kontrolü'nün "haber" modu. Görünümler: açılış (motto) → karusel → detay → kaynak
// karşılaştırması → dünya basını · iddia kontrolü · sorulmamış sorular; ayrıca sabah özeti ve arama (internet taraması
// animasyonu, sonuçlar karusele gelir). Eller gestures.ts'ten olay olarak gelir,
// sesli komutlar commands.ts'ten. Büyü ve uzay efektleri bu modda çalışmaz. Çizim DOM'da (yazı keskin kalsın);
// kişi ayırma maskesiyle kişi, arkadaki kartlarla öndeki kartların arasına çizilir.
import type { Fx, HoldState } from '../fx';
import type { TrackedHand } from '../gestures';
import type { Sfx } from '../sfx';
import type { SpaceCmd } from '../space/commands';
import type { SpaceScene } from '../space/scene';
import type { PersonCutout } from '../space/segment';
import { analizAl, ara, basinAl, dunyaAl, dunyaBugunAl, iddiaAl, kumeAl, merkezAl, sabahAl, sonDakikaAl, takipEt } from './api';
import { sabahHtml, sabahKartlari, type SabahKart } from './brief';
import { Karusel } from './carousel';
import { Kanal, MOTTO } from './channel';
import type { HaberCmd } from './commands';
import { karsilastirmaHtml, vurguluMetin } from './compare';
import { detayHtml } from './detail';
import { iddiaCumlesi, iddiaHtml } from './factcheck';
import { HaberJest, type JestOlay } from './gestures';
import { sorularHtml } from './questions';
import { basinHtml, bekle, DunyaBugunKatmani, duvarHtml, MansetSayaci, sonDakikaGecisi, YayinKatmani } from './newsroom';
import { Tarama } from './search';
import { dunyaHtml } from './world';
import { KATEGORI_AD, KATEGORI_RENK, KATEGORI_SIRA, type Analiz, type AramaOlay, type Basin, type DunyaBasini, type IddiaSonuc, type Kategori, type KumeOzet, type Merkez, type Sabah, type TemelKume } from './types';

export type Gorunum = 'acilis' | 'karusel' | 'detay' | 'karsilastir' | 'dunya' | 'iddia' | 'sorular' | 'sabah' | 'arama' | 'basin' | 'duvar';

export interface HaberHooks {
  say(text: string): Promise<void> | void;
  mic(): void;
  /** Jarvis'in sesini kes (✊) */
  sus?(): void;
}

const kucuk = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Haber katmanı pointer-events: none olduğu için document.elementFromPoint panelin içini görmez: ekran noktası
 * öğelerin kutularıyla denetlenir. Seçiciye uyan, noktayı içeren en içteki (belge sırasında en sondaki) öğe.
 */
function noktadaki(root: HTMLElement, x: number, y: number, sel: string): HTMLElement | null {
  let hit: HTMLElement | null = null;
  for (const e of root.querySelectorAll<HTMLElement>(sel)) {
    const r = e.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = e;
  }
  return hit;
}
/** Elin altındaki, içeriği taşan (kaydırılabilir) en içteki alan; yoksa panelin taşan ilk alanı */
function kaydirilabilir(panel: HTMLElement, x: number, y: number): HTMLElement | null {
  // Satır sınırlı kısa paragraflar da "taşar"; yalnızca gerçek içerik alanları (sütunlar, listeler) kaydırılır
  const tasan = [...panel.querySelectorAll<HTMLElement>('*')].filter(e => e.clientHeight > 120 && e.scrollHeight > e.clientHeight + 8);
  let hit: HTMLElement | null = null;
  for (const e of tasan) { const r = e.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = e; }
  return hit ?? tasan[0] ?? null;
}

export class NewsScene implements SpaceScene {
  listening = false;
  W = 0; H = 0;
  /** Ayarlar: açılışta motto seslendirilsin */
  mottoSesli = true;
  demo = false;
  cutout: PersonCutout | null = null;
  video: HTMLVideoElement | null = null;
  gorunum: Gorunum = 'acilis';
  /** Demo için: analiz ve iddialar hazır mı */
  get analizHazir() { return !!this.secili && !!this.analiz(this.secili.id); }
  get iddiaHazir() { return !!this.secili && Array.isArray(this.iddialar.get(this.secili.id)); }

  private root: HTMLElement;
  private arka: HTMLElement;
  private kisi: HTMLCanvasElement;
  private kg: CanvasRenderingContext2D;
  private on: HTMLElement;
  private panel: HTMLElement;
  private kanal: Kanal;
  karusel: Karusel;
  private jest = new HaberJest();
  private fx: Fx;
  private sfx: Sfx;
  private hooks: HaberHooks;

  private merkez: Merkez | null = null;
  private kategori: Kategori | null = null;
  private arama: string | null = null;
  secili: KumeOzet | null = null;
  private temeller = new Map<string, TemelKume | Promise<TemelKume | null>>();
  private analizler = new Map<string, Analiz | Promise<Analiz | null>>();
  private iddialar = new Map<string, IddiaSonuc[] | Promise<IddiaSonuc[] | null>>();
  private hatalar = new Map<string, string>();
  private iddiaI = 0;
  private dunyalar = new Map<string, DunyaBasini | Promise<DunyaBasini | null>>();
  /** Arama sonucu: karusel bu olaylarla dolar ("geri" ya da kategori seçimi gündeme döner) */
  private aramaSonuc: { q: string; kumeler: KumeOzet[] } | null = null;
  private tarama: { t: Tarama; iptal: AbortController } | null = null;
  /** Süren çok adımlı gösteri (canlı yayın, son dakika, manşetler, dünyada bugün): yeni komut ya da ✊ onu keser */
  private gosteri: { iptal: boolean } | null = null;
  private yayin: YayinKatmani | null = null;
  private sayac: MansetSayaci | null = null;
  private dunyaTur: DunyaBugunKatmani | null = null;
  private basin: Basin | null = null;
  private duvarListe: KumeOzet[] = [];
  private duvarHover = -1;
  /** 🤏 sürükleme: yön kilidi (yatay: karusel/sonraki haber, dikey: kategori/içerik kaydırma), kaydırılan öğe, tek adımlık eylem yapıldı mı */
  private suruk: { yon: 'yatay' | 'dikey' | null; el: HTMLElement | null; top0: number; adim: boolean } | null = null;
  private sabah: Sabah | null = null;
  private sabahK: SabahKart[] = [];
  private sabahI = 0;
  private sonPanel = '';
  /** Panelin görünümü ve kümesi: değişince giriş animasyonu oynar */
  private sonGorunum = '';
  /** Veri geldi: panel yeniden yazılsın (animasyonsuz) */
  private panelKirli = false;
  private hoverAt = 0;
  private hoverKaynak = '';
  private soruHover = 0;
  private yenileTimer = 0;
  private acilisBitti = false;
  /** Haber modu bir komutla açılıyor ("canlı yayına geç"): motto seslendirilmez (komutun sözünü kesmesin), komut açılış bitince çalışır */
  bekleyenKomut: HaberCmd | null = null;

  constructor(stage: HTMLElement, fx: Fx, sfx: Sfx, hooks: HaberHooks) {
    this.fx = fx; this.sfx = sfx; this.hooks = hooks;
    const root = document.createElement('div');
    root.className = 'hb-root';
    root.innerHTML = '<div class="hb-studyo"></div><div class="hb-arka"></div><canvas class="hb-kisi"></canvas><div class="hb-on"></div><div class="hb-panel"></div>';
    stage.appendChild(root);
    this.root = root;
    this.arka = root.querySelector('.hb-arka')!;
    this.kisi = root.querySelector('.hb-kisi')!;
    this.kg = this.kisi.getContext('2d')!;
    this.on = root.querySelector('.hb-on')!;
    this.panel = root.querySelector('.hb-panel')!;
    this.kanal = new Kanal(root);
    this.karusel = new Karusel(this.arka, this.on);
    root.style.display = 'none';
  }

  resize(W: number, H: number) {
    this.W = W; this.H = H; this.jest.H = H;
    this.kisi.width = W; this.kisi.height = H;
  }

  /** Sahne açık (open çağrıldı) */
  get acik() { return this.root.style.display !== 'none'; }
  /** Açılış (motto) sürüyor: ağır modeller (yüz, kişi ayırma) bu sırada kurulmaz, daktilo takılmasın */
  get acilisSurer() { return this.acik && !this.acilisBitti; }

  lens() { return null; }
  onGesture() {}
  command(_cmd: SpaceCmd) {}

  /** Mod açıldı: kanal açılışı (motto), veriler yüklenir */
  open(_now: number) {
    this.root.style.display = '';
    this.acilisBitti = false;
    // Önceki görünüm (detay, panel, süren gösteri, tarama) temizlenir: açılış boş sahnede oynar
    this.gosteriBitir();
    this.tarama?.iptal.abort(); this.tarama?.t.el.remove(); this.tarama = null;
    this.secili = null;
    this.panel.innerHTML = ''; this.panel.style.transform = '';
    this.git('acilis');
    this.kanal.gorunur(true, false);
    this.kanal.gecis('HABER MERKEZİ');
    this.sfx.jenerik();
    // Motto yazılınca kısa bir an kalır, sonra karusel (Jarvis mottoyu okumayı karusel açılırken sürdürür)
    const komutla = !!this.bekleyenKomut;
    void this.kanal.motto(this.demo || komutla).then(() => setTimeout(() => this.acilisiBitir(), this.demo || komutla ? 400 : 700));
    if (this.mottoSesli && !komutla) void this.hooks.say(MOTTO);
    void this.yukle();
    clearInterval(this.yenileTimer);
    this.yenileTimer = window.setInterval(() => void this.yukle(), 5 * 60_000);
  }

  private acilisiBitir() {
    if (this.acilisBitti) return;
    this.acilisBitti = true;
    this.kanal.mottoKapat();
    this.kanal.gorunur(true, true);
    if (this.gorunum === 'acilis') this.git('karusel');
    const k = this.bekleyenKomut;
    this.bekleyenKomut = null;
    if (k) void this.haber(k);
  }

  reset() {
    clearInterval(this.yenileTimer);
    this.kanal.mottoKapat();
    this.karusel.kumeler([]);
    this.panel.innerHTML = ''; this.sonPanel = ''; this.sonGorunum = '';
    this.kg.clearRect(0, 0, this.W, this.H);
    this.root.style.display = 'none';
    this.secili = null;
  }

  private async yukle() {
    try {
      const m = await merkezAl(this.kategori);
      this.merkez = m;
      this.listeyiKur();
      this.kanal.ticker(m.kumeler);
    } catch (e) {
      this.kanal.durum(0, 0, `haberler alınamadı: ${(e as Error).message}`);
    }
  }

  private listeyiKur() {
    const m = this.merkez;
    if (!m) return;
    let list = m.kumeler;
    if (this.aramaSonuc) list = this.aramaSonuc.kumeler;
    else if (this.arama) {
      const q = kucuk(this.arama).split(/\s+/).filter(w => w.length >= 3).map(w => w.slice(0, 5));
      list = list.filter(k => q.every(w => kucuk(k.baslik).includes(w) || k.kokler.some(x => x.startsWith(w))));
    }
    this.karusel.kumeler(list);
    this.kanal.kategoriler(m.kategoriler, this.kategori);
  }

  // ———————————————— Görünümler ————————————————

  private git(g: Gorunum) {
    const onceki = this.gorunum;
    this.gorunum = g;
    this.root.dataset.g = g;
    this.karusel.geriCekil(g !== 'karusel' && g !== 'acilis');
    if (g === 'karusel' || g === 'acilis') { this.panel.innerHTML = ''; this.sonPanel = ''; this.sonGorunum = ''; }
    if (g !== onceki && g !== 'acilis') {
      const ad: Partial<Record<Gorunum, [string, string]>> = {
        karsilastir: ['KAYNAK KARŞILAŞTIRMASI', '#ffb340'], dunya: ['DÜNYA BASINI', '#5fb4ff'], basin: ['BASIN ÖZETİ', '#ffb340'], duvar: ['HABER DUVARI', '#5fb4ff'], iddia: ['İDDİA KONTROLÜ', '#ff5468'], sorular: ['SORULMAMIŞ SORULAR', '#5fb4ff'], sabah: ['SABAH ÖZETİ', '#3ee08f'],
      };
      const a = ad[g];
      if (a) { this.kanal.gecis(a[0], a[1]); this.sfx.stinger(); }
    }
  }

  private secilen(): KumeOzet | null { return this.gorunum === 'karusel' || this.gorunum === 'acilis' ? this.karusel.onKume : this.secili; }

  private temelGetir(id: string) {
    if (this.temeller.has(id)) return;
    this.temeller.set(id, kumeAl(id).then(t => { this.temeller.set(id, t); return t; }).catch(() => { this.temeller.delete(id); return null; }));
  }

  private analizGetir(id: string): Promise<Analiz | null> {
    const v = this.analizler.get(id);
    if (v) return Promise.resolve(v);
    const p = analizAl(id).then(a => { this.analizler.set(id, a); this.panelKirli = true; return a; })
      .catch(e => { this.analizler.delete(id); this.hatalar.set(id, (e as Error).message); this.panelKirli = true; return null; });
    this.analizler.set(id, p);
    return p;
  }

  private iddiaGetir(id: string): Promise<IddiaSonuc[] | null> {
    const v = this.iddialar.get(id);
    if (v) return Promise.resolve(v);
    const p = iddiaAl(id).then(l => { this.iddialar.set(id, l); this.panelKirli = true; return l; })
      .catch(e => { this.iddialar.delete(id); this.hatalar.set(`i:${id}`, (e as Error).message); this.panelKirli = true; return null; });
    this.iddialar.set(id, p);
    return p;
  }

  private analiz(id: string): Analiz | null { const v = this.analizler.get(id); return v && !(v instanceof Promise) ? v : null; }

  /** Kartı aç: detay */
  detayAc(k: KumeOzet | null = this.secilen()) {
    if (!k) return;
    this.secili = k;
    this.temelGetir(k.id);
    void this.analizGetir(k.id);
    this.git('detay');
    this.sfx.kartCek();
  }

  async karsilastirAc(k: KumeOzet | null = this.secilen()) {
    if (!k) return;
    this.secili = k;
    this.temelGetir(k.id);
    this.git('karsilastir');
    this.sfx.yelpaze();
    const a = await this.analizGetir(k.id);
    if (a && this.gorunum === 'karsilastir' && this.secili?.id === k.id) await this.hooks.say(a.karsilastirma.anlatim.join(' '));
  }

  private dunyaGetir(id: string): Promise<DunyaBasini | null> {
    const v = this.dunyalar.get(id);
    if (v) return Promise.resolve(v);
    const p = dunyaAl(id).then(d => { this.dunyalar.set(id, d); this.panelKirli = true; return d; })
      .catch(e => { this.dunyalar.delete(id); this.hatalar.set(`d:${id}`, (e as Error).message); this.panelKirli = true; return null; });
    this.dunyalar.set(id, p);
    return p;
  }

  /** Dünya basını: aynı olay dünya yayınlarında nasıl verildi (Türk basınıyla yan yana) */
  async dunyaAc(k: KumeOzet | null = this.secilen()) {
    // Seçili olay yoksa (ör. haber modu bu komutla açıldı, liste henüz gelmedi): gündemin öndeki olayı
    if (!k) {
      k = (await this.gundem())[0] ?? null;
      if (k) this.karusel.git(Math.max(0, this.liste().findIndex(x => x.id === k!.id)));
    }
    if (!k) return this.hooks.say('Dünya basınına bakacağım bir haber bulamadım efendim.');
    this.secili = k;
    this.temelGetir(k.id);
    void this.analizGetir(k.id);
    this.git('dunya');
    this.sfx.yelpaze();
    const d = await this.dunyaGetir(k.id);
    if (!d || this.gorunum !== 'dunya' || this.secili?.id !== k.id) return;
    if (d.durum === 'model-yok') return this.hooks.say('Dünya basınını karşılaştırmak için modele ihtiyacım var efendim.');
    if (!d.yayinlar.length) {
      return this.hooks.say(d.basliklar.length
        ? `Dünya yayınlarında metin olarak bulamadım efendim; ${d.basliklar.length} yayında yalnızca başlığı var.`
        : `${d.taranan.yayin} dünya yayınını taradım efendim, bu olay orada yok.`);
    }
    const adlar = d.yayinlar.map(y => y.kaynak);
    const vurgu = d.yayinlar.find(y => y.vurgu);
    await this.hooks.say(`${adlar.length === 1 ? adlar[0] : `${adlar.slice(0, -1).join(', ')} ve ${adlar.at(-1)}`} bu olayı veriyor efendim.${vurgu ? ` ${vurgu.kaynak} şunu öne çıkarıyor: ${vurgu.vurgu}` : ''}`);
  }

  /** Anahtar kelimeyle haber getir: internet taraması animasyonu, sonuçlar karusele */
  async araAc(q: string) {
    this.tarama?.iptal.abort();
    this.tarama?.t.el.remove();
    const t = new Tarama(this.root, this.sfx), iptal = new AbortController();
    this.tarama = { t, iptal };
    t.basla(q, performance.now());
    this.git('arama');
    let son: Extract<AramaOlay, { tip: 'bitti' }> | null = null;
    try {
      await ara(q, o => { t.olay(o); if (o.tip === 'bitti') son = o; }, iptal.signal);
    } catch (e) {
      if (iptal.signal.aborted) return;
      t.olay({ tip: 'hata', hata: (e as Error).message });
    }
    // Bütün olaylar ekranda oynatılsın, son sayaçlar bir an görünsün
    await t.tamam;
    await new Promise(r => setTimeout(r, 1300));
    if (this.tarama?.t !== t) return;
    await t.kapat();
    this.tarama = null;
    const sonuc = son as Extract<AramaOlay, { tip: 'bitti' }> | null;
    if (!sonuc?.kumeler.length) { this.git('karusel'); return this.hooks.say(`"${q}" hakkında haber bulamadım efendim.`); }
    this.aramaSonuc = { q, kumeler: sonuc.kumeler };
    this.listeyiKur();
    this.git('karusel');
    this.kanal.gecis(`“${q.toLocaleUpperCase('tr')}”`, '#5fb4ff');
    await this.hooks.say(`${q} için ${sonuc.sayac.yayin} yayını taradım efendim, ${sonuc.sayac.olay} olay buldum. En çok kaynağın verdiği: ${sonuc.kumeler[0].baslik}.`);
  }

  // ———————————————— Haber merkezi komutları ————————————————

  private gosteriBaslat(): { iptal: boolean } {
    this.gosteriBitir();
    const g = { iptal: false };
    this.gosteri = g;
    return g;
  }

  /** Süren gösteriyi kes: Jarvis susar, katmanlar kapanır */
  private gosteriBitir() {
    const g = this.gosteri;
    if (g) { g.iptal = true; this.hooks.sus?.(); }
    this.gosteri = null;
    void this.yayin?.kapat(); this.yayin = null;
    void this.sayac?.kapat(); this.sayac = null;
    void this.dunyaTur?.kapat(); this.dunyaTur = null;
  }

  /** Jarvis anlatır; en az `enAz` ms ekranda kalır. Gösteri kesildiyse false. */
  private async anlat(g: { iptal: boolean }, metin: string, enAz = 0): Promise<boolean> {
    if (g.iptal) return false;
    await Promise.all([this.hooks.say(metin), bekle(enAz)]);
    return !g.iptal;
  }

  /** Gündemin çok kaynaklı olayları (karusel listesi; arama sonucu değil) */
  private async gundem(): Promise<KumeOzet[]> {
    if (!this.merkez) await this.yukle();
    return (this.merkez?.kumeler ?? []).filter(k => k.kaynakSayisi >= 2);
  }

  /** "Canlı yayına geç": ana haber bülteni. Jarvis spiker gibi ilk 5 olayı sunar, sonda kapanış jeneriği. */
  async yayinAc() {
    const g = this.gosteriBaslat();
    this.aramaSonuc = null;
    const list = (await this.gundem()).slice(0, 5);
    if (g.iptal) return;
    if (!list.length) { this.gosteri = null; return this.hooks.say('Bülten için yeterli haber yok efendim.'); }
    this.git('karusel');
    this.yayin = new YayinKatmani(this.root);
    this.kanal.gecis('ANA HABER BÜLTENİ', '#ff3b4e');
    this.sfx.jenerik();
    const saat = new Date().getHours();
    const selam = saat < 11 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
    const kaynakSay = this.merkez?.kaynaklar.calisan ?? 25;
    if (!await this.anlat(g, `${selam} efendim. Jarvis Haber Merkezi'nden ana haber bültenine hoş geldiniz. ${kaynakSay} kaynağı taradık; işte gündemin öne çıkanları.`, 2500)) return;
    const giris = ['İlk haberimiz.', 'Gündemin bir diğer başlığı.', 'Sıradaki haber.', 'Bir başka gelişme.', 'Ve bültenimizin son haberi.'];
    for (let i = 0; i < list.length; i++) {
      const k = list[i];
      this.yayin?.haber(i + 1, list.length, k);
      this.karusel.git(Math.max(0, this.merkez!.kumeler.findIndex(x => x.id === k.id)));
      this.detayAc(k);
      // Analiz en çok 9 sn beklenir; yoksa başlık ve kaynak sayısı (uydurma yok)
      const a = await Promise.race([this.analizGetir(k.id), bekle(9000).then(() => null)]);
      if (g.iptal) return;
      const metin = a?.detay.ozet.slice(0, 2).join(' ') || `${k.kaynakSayisi} kaynağın verdiği haber: ${k.baslik}.`;
      if (!await this.anlat(g, `${i === list.length - 1 ? giris[4] : giris[Math.min(i, 3)]} ${metin}`, 5000)) return;
      if (i < list.length - 1) this.sfx.stinger();
    }
    if (!await this.anlat(g, 'Bültenin sonuna geldik efendim. Gündemi izlemeye devam ediyoruz.', 1500)) return;
    this.git('karusel');
    const kaynaklar = [...new Set((this.merkez?.kumeler ?? []).flatMap(k => k.kaynaklar))].sort((a, b) => a.localeCompare(b, 'tr'));
    await this.yayin?.jenerik(kaynaklar);
    if (!g.iptal) { this.gosteri = null; void this.yayin?.kapat(); this.yayin = null; }
  }

  /** "Son dakika!": en son gelişen çok kaynaklı olay. 45 dakikadan eskiyse bu açıkça söylenir. */
  async sonDakika() {
    const g = this.gosteriBaslat();
    const s = await sonDakikaAl().catch(() => null);
    if (g.iptal) return;
    this.gosteri = null;
    if (!s?.kume || s.dakika === null) return this.hooks.say('Şu an son dakika bir gelişme yok efendim.');
    const k = s.kume, taze = s.dakika <= 45;
    const sure = s.dakika < 60 ? `${s.dakika} dakika önce` : `${Math.round(s.dakika / 60)} saat önce`;
    await sonDakikaGecisi(this.root, this.sfx, taze ? sure : `en son gelişme · ${sure}`);
    this.detayAc(k);
    await this.hooks.say(taze
      ? `Son dakika efendim. ${k.baslik}. ${k.kaynakSayisi} kaynak veriyor; ilk haberi ${sure} ${k.kaynak} verdi.`
      : `Son kırk beş dakikada yeni bir gelişme yok efendim. En son gelişme ${sure}: ${k.baslik}. ${k.kaynakSayisi} kaynak veriyor.`);
  }

  /** "Manşetleri ver": ilk 10 olay, onuncudan birinciye geri sayım */
  async mansetler() {
    const g = this.gosteriBaslat();
    this.aramaSonuc = null;
    const list = (await this.gundem()).slice(0, 10);
    if (g.iptal) return;
    if (!list.length) { this.gosteri = null; return this.hooks.say('Şu an manşet çıkaracak kadar haber yok efendim.'); }
    this.git('karusel');
    this.sayac = new MansetSayaci(this.root);
    this.kanal.gecis('GÜNÜN MANŞETLERİ', '#ff3b4e');
    this.sfx.stinger();
    if (!await this.anlat(g, `Günün manşetleri, ${list.length === 10 ? 'onuncudan' : `${list.length}. sıradan`} birinciye.`, 1200)) return;
    for (let n = list.length; n >= 1; n--) {
      const k = list[n - 1];
      this.sayac?.goster(n, k);
      this.sfx.kartKaydir();
      if (!await this.anlat(g, n === 1 ? `Ve günün bir numarası: ${k.baslik}. ${k.kaynakSayisi} kaynak bunu veriyor.` : `${n}. ${k.baslik}.`, n === 1 ? 4500 : 2600)) return;
    }
    this.karusel.git(Math.max(0, this.merkez!.kumeler.findIndex(x => x.id === list[0].id)));
    this.gosteri = null;
    await this.sayac?.kapat(); this.sayac = null;
  }

  /** "Dünyada bugün ne oldu?": küre, dünya olayları yerlerinde; sırayla her birine döner ve anlatır */
  async dunyaBugun() {
    const g = this.gosteriBaslat();
    const d = await dunyaBugunAl().catch(() => null);
    if (g.iptal) return;
    if (!d?.olaylar.length) { this.gosteri = null; return this.hooks.say('Dünya gündeminde yerini belirleyebildiğim bir olay bulamadım efendim.'); }
    this.git('karusel');
    const t = new DunyaBugunKatmani(this.root);
    this.dunyaTur = t;
    t.ac(d.olaylar);
    this.sfx.scanStart?.();
    if (!await this.anlat(g, `Dünyada bugün öne çıkan ${d.olaylar.length} gelişme var efendim.`, 2200)) return;
    for (let i = 0; i < d.olaylar.length; i++) {
      const o = d.olaylar[i];
      t.odakla(i, performance.now());
      this.sfx.kartKaydir();
      await bekle(900);
      if (!await this.anlat(g, `${o.yer}. ${o.kume.baslik}.`, 3600)) return;
    }
    if (!await this.anlat(g, 'Dünya turumuz bu kadar efendim.', 600)) return;
    this.gosteri = null;
    await t.kapat(); this.dunyaTur = null;
    this.kategoriSec('dunya');
  }

  /** "Basın özeti": her kaynağın baş haberi, aynı olayı öne çıkaranlar ve kimsenin baş habere koymadığı büyük olay */
  async basinAc() {
    this.basin = null;
    this.git('basin');
    this.sfx.yelpaze();
    const b = await basinAl().catch(() => null);
    if (!b) return this.hooks.say('Basın özetini şu an alamadım efendim.');
    this.basin = b;
    this.panelKirli = true;
    if (this.gorunum !== 'basin') return;
    const ilk = b.ortak[0];
    await this.hooks.say(`${b.kaynaklar.length} kaynağın baş haberine baktım efendim. ${ilk ? `${ilk.sayi} kaynak aynı olayı öne çıkarıyor: ${ilk.kume.baslik}.` : 'Her biri farklı bir haberi öne çıkarıyor.'}${b.mansetteYok ? ` Dikkat çekici bir şey var: ${b.mansetteYok.kaynakSayisi} kaynağın verdiği şu haberi hiçbiri baş habere koymamış: ${b.mansetteYok.baslik}.` : ''}`);
  }

  /** "Bunu takibe al": yeni bir kaynak ya da gelişme gelince (haber modu kapalıyken de) bildirilir */
  async takip(ac: boolean) {
    const k = this.secilen();
    if (!k) return this.hooks.say('Önce bir haber seçin efendim.');
    try { await takipEt(k.id, ac); } catch { return this.hooks.say('Takip listesine ulaşamadım efendim.'); }
    k.takipte = ac;
    this.kanal.gecis(ac ? 'TAKİPTE' : 'TAKİP BIRAKILDI', '#ffb340');
    this.sfx.damga();
    await this.hooks.say(ac ? 'Takibe aldım efendim. Bu olayda yeni bir kaynak ya da yeni bir gelişme çıkarsa haber vereceğim.' : 'Takibi bıraktım efendim.');
  }

  /** "Ekranı böl": 3×3 haber duvarı (arama sonucu varsa onlar) */
  async duvarAc() {
    const list = this.aramaSonuc?.kumeler ?? await this.gundem();
    this.duvarListe = list.slice(0, 9);
    this.duvarHover = -1;
    if (!this.duvarListe.length) return this.hooks.say('Duvara koyacak haber yok efendim.');
    this.git('duvar');
    this.sfx.yelpaze();
    await this.hooks.say(`${this.duvarListe.length} haber ekranda efendim. Numarasını söyleyin ya da tutun, açayım.`);
  }

  /** Haber duvarında numaralı kutu (duvar açık değilse karuseldeki sıra) */
  numaraAc(n: number) {
    const list = this.gorunum === 'duvar' ? this.duvarListe : this.liste();
    const k = list[n - 1];
    if (!k) return void this.hooks.say(`${n} numaralı bir haber yok efendim.`);
    const i = this.liste().findIndex(x => x.id === k.id);
    if (i >= 0) this.karusel.git(i);
    this.detayAc(k);
  }

  /** Karuseldeki liste (arama sonucu ya da gündem) */
  private liste(): KumeOzet[] { return this.aramaSonuc?.kumeler ?? this.merkez?.kumeler ?? []; }

  /** Aramayı bırak: gündeme dön */
  private aramadanCik() {
    this.aramaSonuc = null;
    this.arama = null;
    this.listeyiKur();
    this.kanal.gecis('TÜM GÜNDEM');
    this.sfx.kartKaydir();
  }

  async iddiaAc(k: KumeOzet | null = this.secilen()) {
    if (!k) return;
    this.secili = k;
    this.iddiaI = 0;
    this.git('iddia');
    this.sfx.terazi();
    const l = await this.iddiaGetir(k.id);
    if (this.gorunum !== 'iddia' || this.secili?.id !== k.id) return;
    if (l?.length) { this.sfx.damga(); await this.hooks.say(`${l.length} doğrulanabilir iddia buldum efendim. İlki: ${iddiaCumlesi(l[0])}`); }
    else if (l) await this.hooks.say('Bu haberde doğrulanabilir bir olgusal iddia bulamadım efendim.');
  }

  async sorularAc(k: KumeOzet | null = this.secilen()) {
    if (!k) return;
    this.secili = k;
    this.git('sorular');
    this.sfx.soru();
    const a = await this.analizGetir(k.id);
    if (!a || this.gorunum !== 'sorular' || this.secili?.id !== k.id) return;
    if (!a.sorular.length) { await this.hooks.say('Kaynaklarda belirgin bir boşluk bulamadım efendim.'); return; }
    await this.hooks.say(`Kimsenin sormadığı ${a.sorular.length === 1 ? 'bir soru' : `${a.sorular.length} soru`} var efendim. ${a.sorular.map(s => s.soru).join(' ')}`);
  }

  async sabahAc() {
    this.git('sabah');
    this.sabahI = 0;
    this.sabah = null;
    try {
      this.sabah = await sabahAl();
      this.sabahK = sabahKartlari(this.sabah);
      this.panelKirli = true;
      if (this.gorunum === 'sabah' && this.sabahK[0]) await this.hooks.say(`Günaydın efendim. ${this.sabahK[0].soz}`);
    } catch (e) {
      this.sabahK = [];
      await this.hooks.say('Sabah özetini şu an alamadım efendim.');
      console.warn('[haber] sabah', e);
    }
  }

  private sabahKaydir(yon: number) {
    const n = this.sabahK.length;
    if (!n) return;
    const i = Math.max(0, Math.min(n - 1, this.sabahI + yon));
    if (i === this.sabahI) return;
    this.sabahI = i;
    this.sfx.kartKaydir();
    void this.hooks.say(this.sabahK[i].soz);
  }

  private iddiaKaydir(yon: number) {
    const l = this.secili ? this.iddialar.get(this.secili.id) : null;
    if (!Array.isArray(l) || !l.length) return;
    const i = Math.max(0, Math.min(l.length - 1, this.iddiaI + yon));
    if (i === this.iddiaI) return;
    this.iddiaI = i;
    this.panelKirli = true;
    this.sfx.damga();
    void this.hooks.say(iddiaCumlesi(l[i]));
  }

  async ozetle(k: KumeOzet | null = this.secilen()) {
    if (!k) return;
    const a = this.analiz(k.id);
    if (a) return this.hooks.say(a.detay.ozet.join(' '));
    // Analiz yoksa yalnızca başlık ve kaynak sayısı (uydurma yok)
    await this.hooks.say(`${k.kaynakSayisi} kaynağın verdiği haber: ${k.baslik}.`);
    void this.analizGetir(k.id);
  }

  geri() {
    if (this.gosteri) { this.gosteriBitir(); return; }
    if (this.gorunum === 'basin' || this.gorunum === 'duvar') { this.git('karusel'); this.sfx.kartKaydir(); return; }
    if (this.gorunum === 'arama') { this.tarama?.iptal.abort(); void this.tarama?.t.kapat(); this.tarama = null; this.git('karusel'); this.sfx.kartKaydir(); }
    else if (this.gorunum === 'dunya') { this.git('karsilastir'); this.sfx.kartKaydir(); }
    else if (this.gorunum === 'karsilastir' || this.gorunum === 'iddia' || this.gorunum === 'sorular') { this.git('detay'); this.sfx.kartKaydir(); }
    else if (this.gorunum === 'detay' || this.gorunum === 'sabah') { this.git('karusel'); this.sfx.kartKaydir(); }
    else if (this.gorunum === 'karusel' && this.aramaSonuc) this.aramadanCik();
    else this.hooks.sus?.();
  }

  /** Klavye ↑/↓: kategori */
  kategoriAdim(yon: number) { if (this.gorunum === 'sabah') this.sabahKaydir(yon); else { this.git('karusel'); this.kategoriDegis(yon); } }

  private kategoriDegis(yon: number) {
    const sira: (Kategori | null)[] = [null, ...KATEGORI_SIRA];
    const i = sira.indexOf(this.kategori);
    this.kategoriSec(sira[(i + yon + sira.length) % sira.length]);
  }

  private kategoriSec(k: Kategori | null) {
    this.kategori = k;
    this.arama = null;
    this.aramaSonuc = null;
    this.kanal.gecis(k ? KATEGORI_AD[k] : 'TÜM GÜNDEM', k ? KATEGORI_RENK[k] : '#ff3b4e');
    this.sfx.stinger();
    void this.yukle();
  }

  // ———————————————— Sesli komutlar ————————————————

  haber(cmd: HaberCmd): Promise<void> | void {
    if (!this.acilisBitti && cmd.tip !== 'haber') {
      // Açılış sürerken başka komut: motto kesilir
      if (this.mottoSesli) this.hooks.sus?.();
      this.acilisiBitir();
    }
    // Yeni komut süren gösteriyi keser (takip ve numara gösteriyi bozmaz)
    if (this.gosteri && cmd.tip !== 'takip' && cmd.tip !== 'numara') this.gosteriBitir();
    switch (cmd.tip) {
      case 'yayin': if (cmd.ac) return this.yayinAc(); return this.hooks.say('Yayını kapattım efendim.');
      case 'sonDakika': return this.sonDakika();
      case 'mansetler': return this.mansetler();
      case 'dunyaBugun': return this.dunyaBugun();
      case 'basin': return this.basinAc();
      case 'takip': return this.takip(cmd.ac);
      case 'duvar': return this.duvarAc();
      case 'numara': return this.numaraAc(cmd.n);
      // Zaten açıkken "haber modunu aç": açılış yeniden oynar (açılış sürüyorsa dokunulmaz)
      case 'haber': if (cmd.ac && this.gorunum !== 'acilis') this.open(performance.now()); return;
      case 'sabah': return this.sabahAc();
      case 'kategori': this.git('karusel'); this.kategoriSec(cmd.kategori); return this.hooks.say(`${KATEGORI_AD[cmd.kategori].toLocaleLowerCase('tr').replace(/^./, c => c.toLocaleUpperCase('tr'))} haberleri, efendim.`);
      // "[konu] hakkında ne var?" ve "[konu] hakkında haber getir": internet taraması
      case 'konu': case 'ara': return this.araAc(cmd.q);
      case 'dunya': return this.dunyaAc();
      case 'sonraki': case 'onceki': {
        const y = cmd.tip === 'sonraki' ? 1 : -1;
        if (this.gorunum === 'iddia') return this.iddiaKaydir(y);
        if (this.gorunum === 'sabah') return this.sabahKaydir(y);
        this.karusel.adim(y); this.sfx.kartKaydir();
        if (this.gorunum === 'detay') this.detayAc(this.karusel.kume(this.karusel.on_));
        return;
      }
      case 'ozetle': return this.ozetle();
      case 'detay': return this.detayAc();
      case 'karsilastir': return this.karsilastirAc();
      case 'kontrol': return this.iddiaAc();
      case 'sorular': return this.sorularAc();
      case 'geri': return this.geri();
    }
  }

  // ———————————————— El hareketleri ————————————————

  private uygula(o: JestOlay, now: number) {
    const g = this.gorunum;
    // Tarama sürerken yalnızca kapatma (🖐→✊ ya da ✊ basılı) çalışır
    if (g === 'arama') { if (o.tip === 'kapat') this.geri(); return; }
    // Gösteri sürerken yalnızca ✊ (keser) çalışır
    if (this.gosteri) { if (o.tip === 'kapat') this.gosteriBitir(); return; }
    // Haber duvarı: ☝️ seç, 🤏 tut ya da ✊→🖐 aç
    if (g === 'duvar') {
      if (o.tip === 'isaret') {
        const el = o.p ? noktadaki(this.panel, o.p.x, o.p.y, '.hb-dv-kart') : null;
        const i = el ? Number(el.dataset.i) : -1;
        if (i !== this.duvarHover && i >= 0) this.sfx.vurgu();
        if (o.p || i >= 0) this.duvarHover = i;
        return;
      }
      if (o.tip === 'tut') { const el = noktadaki(this.panel, o.p.x, o.p.y, '.hb-dv-kart'); if (el) this.numaraAc(Number(el.dataset.i) + 1); return; }
      if (o.tip === 'ac' && this.duvarHover >= 0) { this.numaraAc(this.duvarHover + 1); return; }
    }
    if (g === 'acilis') {
      if (o.tip === 'tut' || o.tip === 'ac' || o.tip === 'kilit') this.acilisiBitir();
      return;
    }
    switch (o.tip) {
      case 'kilit': if (o.acik) this.sfx.lockOn?.(); else this.sfx.tick?.(0.2); return;
      case 'isaret': {
        if (g === 'karusel') {
          const i = o.p ? this.karusel.kartAt(o.p.x, o.p.y) : -1;
          if (i !== this.karusel.hover && i >= 0) this.sfx.vurgu();
          this.karusel.hover = i;
        } else if (g === 'karsilastir' && o.p) {
          const el = noktadaki(this.panel, o.p.x, o.p.y, '.hb-kaynak');
          const ad = el?.dataset.kaynak ?? '';
          if (ad !== this.hoverKaynak) { this.hoverKaynak = ad; this.hoverAt = now; }
          // 0,4 sn üstünde dur: o kaynağın metninde alıntılar vurgulanır
          if (ad && now - this.hoverAt > 400 && !el!.classList.contains('acik')) this.kaynakVurgula(ad);
        } else if (g === 'detay' && o.p) {
          const el = noktadaki(this.panel, o.p.x, o.p.y, '.hb-soru-ipucu');
          if (el) { this.soruHover ||= now; if (now - this.soruHover > 700) { this.soruHover = 0; void this.sorularAc(); } }
          else this.soruHover = 0;
        }
        return;
      }
      case 'tut': {
        this.suruk = { yon: null, el: null, top0: 0, adim: false };
        if (g === 'karusel') {
          const i = this.karusel.kartAt(o.p.x, o.p.y);
          this.karusel.tutulan = i >= 0 ? i : this.karusel.on_;
          this.karusel.yakala();
        } else {
          // Detay ve paneller: elin altındaki kaydırılabilir alan (yoksa panelin kendisi)
          this.suruk.el = kaydirilabilir(this.panel, o.p.x, o.p.y);
          this.suruk.top0 = this.suruk.el?.scrollTop ?? 0;
        }
        this.sfx.grab();
        return;
      }
      case 'surukle': {
        const sr = this.suruk;
        if (!sr) return;
        // Yön ilk belirgin harekette kilitlenir (çapraz el titremesi iki eylemi birden yapmasın)
        if (!sr.yon) sr.yon = Math.abs(o.dx) >= Math.abs(o.dy) ? 'yatay' : 'dikey';
        if (g === 'karusel') {
          if (sr.yon === 'yatay') { this.karusel.tutulan = -1; this.karusel.surukle(o.dx); }
          else if (!sr.adim && Math.abs(o.dy) > this.H * 0.14) { sr.adim = true; this.karusel.birak(0); this.karusel.tutulan = -1; this.kategoriDegis(o.dy > 0 ? 1 : -1); }
          return;
        }
        if (sr.yon === 'dikey') {
          // İçerik eli izler: el yukarı → içerik yukarı (aşağısı görünür)
          // Sabah özetinde kart değişir; diğer panellerde elin altındaki alan kayar
          if (g === 'sabah') { if (!sr.adim && Math.abs(o.dy) > this.H * 0.12) { sr.adim = true; this.sabahKaydir(o.dy < 0 ? 1 : -1); } }
          else if (sr.el) sr.el.scrollTop = sr.top0 - o.dy * 1.6;
          return;
        }
        // Yatay: bir sonraki / önceki haber (detayda), iddia (iddiada); bir tutuşta bir adım
        if (sr.adim || Math.abs(o.dx) < this.W * 0.16) return;
        sr.adim = true;
        const ileri = o.dx < 0 ? 1 : -1;
        if (g === 'detay') { this.karusel.adim(ileri); this.detayAc(this.karusel.kume(this.karusel.on_)); this.sfx.kartKaydir(); }
        else if (g === 'iddia') this.iddiaKaydir(ileri);
        else if (g === 'sabah') this.sabahKaydir(ileri);
        return;
      }
      case 'cek': {
        if (g !== 'karusel' || this.karusel.tutulan < 0) return;
        const k = this.karusel.kume(this.karusel.tutulan);
        this.karusel.birak(0);
        this.karusel.git(this.karusel.tutulan);
        this.karusel.tutulan = -1;
        this.suruk = null;
        this.detayAc(k);
        return;
      }
      case 'birak': {
        const yatay = this.suruk?.yon === 'yatay';
        this.suruk = null;
        this.karusel.tutulan = -1;
        if (this.karusel.tutuluyor) { this.karusel.birak(yatay ? o.vx : 0); if (yatay) this.sfx.kartKaydir(); }
        return;
      }
      // 🤏🤏 iki elle: canlı büyüme, eşikte bir seviye in / çık
      case 'zoom':
        if (g === 'karusel') this.karusel.zoomHedef = Math.max(0.8, Math.min(1.7, o.oran));
        else this.panel.style.transform = `scale(${Math.max(0.85, Math.min(1.08, 1 + (o.oran - 1) * 0.25))})`;
        return;
      case 'zoomBitti': this.karusel.zoomHedef = 1; this.panel.style.transform = ''; return;
      case 'yakinlas':
        this.panel.style.transform = '';
        if (g === 'karusel') { this.karusel.zoomHedef = 1; this.detayAc(); }
        else if (g === 'detay') void this.karsilastirAc();
        else if (g === 'karsilastir') void this.dunyaAc();
        return;
      case 'uzaklas': this.panel.style.transform = ''; if (g !== 'karusel') this.geri(); return;
      // ✊→🖐 kısa yumruk ve aç: kartı aç (işaret edilen ya da öndeki) · ✊ 0,8 sn tut: bir seviye geri
      case 'ac':
        if (g === 'karusel') { const i = this.karusel.hover; if (i >= 0) this.karusel.git(i); this.detayAc(i >= 0 ? this.karusel.kume(i) : this.karusel.onKume); }
        else if (g === 'detay') void this.karsilastirAc();
        else if (g === 'karsilastir') void this.dunyaAc();
        return;
      case 'kapat': this.hooks.sus?.(); if (g !== 'karusel') this.geri(); return;
      case 'terazi': if (g === 'karusel' || g === 'detay' || g === 'karsilastir' || g === 'sorular') void this.iddiaAc(); return;
      case 'basparmak': void this.ozetle(); return;
      case 'mikrofon': this.hooks.mic(); return;
    }
  }

  private kaynakVurgula(ad: string) {
    const a = this.secili ? this.analiz(this.secili.id) : null;
    if (!a) return;
    for (const el of this.panel.querySelectorAll<HTMLElement>('.hb-kaynak')) {
      const on = el.dataset.kaynak === ad;
      el.classList.toggle('acik', on);
      const m = el.querySelector('.hb-metin') as HTMLElement;
      m.innerHTML = on ? vurguluMetin(a, ad) : '';
    }
    this.sfx.vurgu();
  }

  // ———————————————— Kare ————————————————

  private panelCiz() {
    const k = this.secili;
    let html = '';
    if (this.gorunum === 'detay' && k) {
      const t = this.temeller.get(k.id);
      html = detayHtml(k, t && !(t instanceof Promise) ? t : null, this.analiz(k.id), this.hatalar.get(k.id) ?? null);
    } else if (this.gorunum === 'karsilastir' && k) {
      const a = this.analiz(k.id);
      html = a ? karsilastirmaHtml(a) : `<div class="hb-karsilastir"><h2>KAYNAK KARŞILAŞTIRMASI <span>${k.kaynakSayisi} kaynak</span></h2><div class="hb-analiz"><i></i><span>${this.hatalar.get(k.id) ?? 'TAM METİNLER OKUNUYOR · ortak bilgi · farklı vurgu · farklı sayılar'}</span></div></div>`;
    } else if (this.gorunum === 'iddia' && k) {
      const l = this.iddialar.get(k.id);
      html = iddiaHtml(Array.isArray(l) ? l : null, this.iddiaI, this.hatalar.get(`i:${k.id}`) ?? null);
    } else if (this.gorunum === 'dunya' && k) {
      const d = this.dunyalar.get(k.id);
      html = dunyaHtml(k, this.analiz(k.id), d && !(d instanceof Promise) ? d : null, this.hatalar.get(`d:${k.id}`) ?? null);
    } else if (this.gorunum === 'sorular' && k) {
      const a = this.analiz(k.id);
      html = sorularHtml(a ? a.sorular : null, this.hatalar.get(k.id) ?? null);
    } else if (this.gorunum === 'sabah') {
      html = sabahHtml(this.sabahK, this.sabahI, !this.sabah);
    } else if (this.gorunum === 'basin') {
      html = this.basin ? basinHtml(this.basin) : '<div class="hb-basin"><h2>BASIN ÖZETİ</h2><div class="hb-analiz"><i></i><span>KAYNAKLARIN BAŞ HABERLERİ TOPLANIYOR</span></div></div>';
    } else if (this.gorunum === 'duvar') {
      html = duvarHtml(this.duvarListe, this.duvarHover);
    }
    const key = `${this.gorunum}|${k?.id}|${this.iddiaI}|${this.sabahI}|${html.length}|${this.gorunum === 'dunya' && k ? this.dunyalar.get(k.id) instanceof Promise : ''}|${this.duvarHover}|${this.basin?.at ?? ''}`;
    if (key === this.sonPanel && !this.panelKirli) return;
    this.panelKirli = false;
    const gorunum = `${this.gorunum}|${k?.id}`;
    const gorunumDegisti = gorunum !== this.sonGorunum;
    this.sonGorunum = gorunum;
    this.sonPanel = key;
    this.panel.innerHTML = html;
    if (gorunumDegisti) { this.panel.classList.remove('gir'); void this.panel.offsetWidth; this.panel.classList.add('gir'); }
    if (this.gorunum === 'karsilastir' && this.hoverKaynak) this.kaynakVurgula(this.hoverKaynak);
  }

  /** Kişi: arkadaki kartların önünde (yalnızca karusel görünürken) */
  private kisiCiz() {
    const g = this.kg;
    g.clearRect(0, 0, this.W, this.H);
    const c = this.cutout, v = this.video;
    if (!c || !v || (this.gorunum !== 'karusel' && this.gorunum !== 'acilis')) return;
    c.drawPerson(g, v, this.W, this.H);
  }

  update(hands: TrackedHand[], now: number, dt: number): { mode: string; holds: HoldState[] } {
    const holds: HoldState[] = [];
    if (this.root.style.display === 'none') return { mode: 'haber', holds };
    this.jest.kilitGerekli = !this.demo;
    for (const o of this.jest.update(hands, now, holds)) this.uygula(o, now);
    if (!hands.some(h => h.gesture === 'isaret')) this.karusel.hover = -1;
    this.karusel.update(dt, this.W, this.H);
    this.tarama?.t.update(now, this.W, this.H);
    this.dunyaTur?.update(now, dt, this.W, this.H);
    // Öndeki kartın analizi arka planda hazırlansın (detay açılınca bekletmesin)
    const on = this.karusel.onKume;
    if (on && this.karusel.duruyor && this.gorunum === 'karusel') { this.temelGetir(on.id); }
    this.kanal.tick();
    this.kanal.altBant(this.gorunum === 'karusel' ? on : this.gorunum === 'sabah' || this.gorunum === 'arama' ? null : this.secili, [this.aramaSonuc && this.gorunum === 'karusel' ? `ARAMA · ${this.aramaSonuc.q}` : '', (this.gorunum === 'karusel' ? on : this.secili)?.takipte ? '★ TAKİPTE' : ''].filter(Boolean).join(' · '));
    const m = this.merkez;
    const bekleyen = [...this.analizler.values()].filter(v => v instanceof Promise).length + [...this.iddialar.values()].filter(v => v instanceof Promise).length;
    this.kanal.durum(m?.kaynaklar.calisan ?? 0, m?.kaynaklar.toplam ?? 0, this.listening ? '🎙 DİNLİYOR' : bekleyen ? 'JARVIS ANALİZ EDİYOR' : '');
    this.panelCiz();
    this.kisiCiz();
    this.fx.render(dt, now, [], holds);
    const mode = this.gorunum === 'acilis' ? 'haber · açılış' : this.gorunum === 'karusel' ? `haber · ${this.kategori ? KATEGORI_AD[this.kategori].toLocaleLowerCase('tr') : 'gündem'}` : `haber · ${this.gorunum}`;
    // El görünüyor ama kilitli değil: ipucu
    return { mode: this.jest.kilitBekleyen ? `${mode} · ✋ avucunu göster: kontrol` : mode, holds };
  }

  dispose() { this.reset(); this.kanal.dispose(); this.root.remove(); }
}
