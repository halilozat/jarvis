// Haber Modu · sahne: El Kontrolü'nün "haber" modu. Görünümler: açılış (motto) → karusel → detay → kaynak
// karşılaştırması · iddia kontrolü · sorulmamış sorular; ayrıca sabah özeti. Eller gestures.ts'ten olay olarak gelir,
// sesli komutlar commands.ts'ten. Büyü ve uzay efektleri bu modda çalışmaz. Çizim DOM'da (yazı keskin kalsın);
// kişi ayırma maskesiyle kişi, arkadaki kartlarla öndeki kartların arasına çizilir.
import type { Fx, HoldState } from '../fx';
import type { TrackedHand } from '../gestures';
import type { Sfx } from '../sfx';
import type { SpaceCmd } from '../space/commands';
import type { SpaceScene } from '../space/scene';
import type { PersonCutout } from '../space/segment';
import { analizAl, iddiaAl, kumeAl, merkezAl, sabahAl } from './api';
import { sabahHtml, sabahKartlari, type SabahKart } from './brief';
import { Karusel } from './carousel';
import { Kanal, MOTTO } from './channel';
import type { HaberCmd } from './commands';
import { karsilastirmaHtml, vurguluMetin } from './compare';
import { detayHtml } from './detail';
import { iddiaCumlesi, iddiaHtml } from './factcheck';
import { HaberJest, type JestOlay } from './gestures';
import { sorularHtml } from './questions';
import { KATEGORI_AD, KATEGORI_RENK, KATEGORI_SIRA, type Analiz, type IddiaSonuc, type Kategori, type KumeOzet, type Merkez, type Sabah, type TemelKume } from './types';

export type Gorunum = 'acilis' | 'karusel' | 'detay' | 'karsilastir' | 'iddia' | 'sorular' | 'sabah';

export interface HaberHooks {
  say(text: string): Promise<void> | void;
  mic(): void;
  /** Jarvis'in sesini kes (✊) */
  sus?(): void;
}

const kucuk = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '');

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
  private liste: KumeOzet[] = [];
  private kategori: Kategori | null = null;
  private arama: string | null = null;
  secili: KumeOzet | null = null;
  private temeller = new Map<string, TemelKume | Promise<TemelKume | null>>();
  private analizler = new Map<string, Analiz | Promise<Analiz | null>>();
  private iddialar = new Map<string, IddiaSonuc[] | Promise<IddiaSonuc[] | null>>();
  private hatalar = new Map<string, string>();
  private iddiaI = 0;
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
  private mottoSoz: Promise<void> | void = undefined;

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

  lens() { return null; }
  onGesture() {}
  command(_cmd: SpaceCmd) {}

  /** Mod açıldı: kanal açılışı (motto), veriler yüklenir */
  open(_now: number) {
    this.root.style.display = '';
    this.acilisBitti = false;
    this.git('acilis');
    this.kanal.gorunur(true, false);
    this.kanal.gecis('HABER MERKEZİ');
    this.sfx.jenerik();
    void this.kanal.motto(this.demo).then(() => {
      // Motto yazıldı: seslendirme bitene kadar (en fazla birkaç saniye) bekle, sonra karusel
      void Promise.race([Promise.resolve(this.mottoSoz), new Promise(r => setTimeout(r, this.demo ? 600 : 2500))]).then(() => this.acilisiBitir());
    });
    if (this.mottoSesli) this.mottoSoz = this.hooks.say(MOTTO);
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
    if (this.arama) {
      const q = kucuk(this.arama).split(/\s+/).filter(w => w.length >= 3).map(w => w.slice(0, 5));
      list = list.filter(k => q.every(w => kucuk(k.baslik).includes(w) || k.kokler.some(x => x.startsWith(w))));
    }
    this.liste = list;
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
        karsilastir: ['KAYNAK KARŞILAŞTIRMASI', '#ffb340'], iddia: ['İDDİA KONTROLÜ', '#ff5468'], sorular: ['SORULMAMIŞ SORULAR', '#5fb4ff'], sabah: ['SABAH ÖZETİ', '#3ee08f'],
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
    if (this.gorunum === 'karsilastir' || this.gorunum === 'iddia' || this.gorunum === 'sorular') { this.git('detay'); this.sfx.kartKaydir(); }
    else if (this.gorunum === 'detay' || this.gorunum === 'sabah') { this.git('karusel'); this.sfx.kartKaydir(); }
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
    switch (cmd.tip) {
      // Zaten açıkken "haber modunu aç": açılış yeniden oynar (açılış sürüyorsa dokunulmaz)
      case 'haber': if (cmd.ac && this.gorunum !== 'acilis') this.open(performance.now()); return;
      case 'sabah': return this.sabahAc();
      case 'kategori': this.git('karusel'); this.kategoriSec(cmd.kategori); return this.hooks.say(`${KATEGORI_AD[cmd.kategori].toLocaleLowerCase('tr').replace(/^./, c => c.toLocaleUpperCase('tr'))} haberleri, efendim.`);
      case 'konu': {
        this.git('karusel');
        this.arama = cmd.q;
        this.listeyiKur();
        if (!this.liste.length) { this.arama = null; this.listeyiKur(); return this.hooks.say(`"${cmd.q}" hakkında gündemde bir olay bulamadım efendim.`); }
        this.kanal.gecis(`“${cmd.q.toLocaleUpperCase('tr')}”`, '#5fb4ff');
        return this.hooks.say(`${cmd.q} hakkında ${this.liste.length} olay buldum efendim.`);
      }
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
    if (g === 'acilis') {
      if (o.tip === 'savur' || o.tip === 'tut') this.acilisiBitir();
      return;
    }
    switch (o.tip) {
      case 'savur': {
        const yatay = o.yon === 'sag' || o.yon === 'sol';
        const ileri = o.yon === 'sol' ? 1 : o.yon === 'sag' ? -1 : 0;
        if (g === 'karusel') {
          if (yatay) { this.karusel.savur(ileri, o.hiz); this.sfx.kartKaydir(); }
          else this.kategoriDegis(o.yon === 'asagi' ? 1 : -1);
        } else if (g === 'sabah') {
          if (o.yon === 'yukari') this.sabahKaydir(1);
          else if (o.yon === 'asagi') this.sabahKaydir(-1);
          else this.geri();
        } else if (g === 'iddia' && yatay) this.iddiaKaydir(ileri);
        else if (g === 'detay' && yatay) { this.karusel.adim(ileri); this.detayAc(this.karusel.kume(this.karusel.on_)); this.sfx.kartKaydir(); }
        else if (o.yon === 'yukari') this.geri();
        return;
      }
      case 'isaret': {
        if (g === 'karusel') {
          const i = o.p ? this.karusel.kartAt(o.p.x, o.p.y) : -1;
          if (i !== this.karusel.hover && i >= 0) this.sfx.vurgu();
          this.karusel.hover = i;
        } else if (g === 'karsilastir' && o.p) {
          const el = document.elementFromPoint(o.p.x, o.p.y)?.closest('.hb-kaynak') as HTMLElement | null;
          const ad = el?.dataset.kaynak ?? '';
          if (ad !== this.hoverKaynak) { this.hoverKaynak = ad; this.hoverAt = now; }
          // 0,4 sn üstünde dur: o kaynağın metninde alıntılar vurgulanır
          if (ad && now - this.hoverAt > 400 && !el!.classList.contains('acik')) this.kaynakVurgula(ad);
        } else if (g === 'detay' && o.p) {
          const el = document.elementFromPoint(o.p.x, o.p.y)?.closest('.hb-soru-ipucu');
          if (el) { this.soruHover ||= now; if (now - this.soruHover > 700) { this.soruHover = 0; void this.sorularAc(); } }
          else this.soruHover = 0;
        }
        return;
      }
      case 'tut': {
        if (g !== 'karusel') return;
        const i = this.karusel.kartAt(o.p.x, o.p.y);
        this.karusel.tutulan = i >= 0 ? i : this.karusel.on_;
        this.sfx.grab();
        return;
      }
      case 'cek': {
        if (g !== 'karusel' || this.karusel.tutulan < 0) return;
        const k = this.karusel.kume(this.karusel.tutulan);
        this.karusel.git(this.karusel.tutulan);
        this.karusel.tutulan = -1;
        this.detayAc(k);
        return;
      }
      case 'birak': this.karusel.tutulan = -1; return;
      case 'yelpaze': if (g === 'karusel' || g === 'detay' || g === 'iddia' || g === 'sorular') void this.karsilastirAc(); return;
      case 'terazi': if (g === 'karusel' || g === 'detay' || g === 'karsilastir' || g === 'sorular') void this.iddiaAc(); return;
      case 'basparmak': void this.ozetle(); return;
      case 'yumruk': this.hooks.sus?.(); this.geri(); return;
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
    } else if (this.gorunum === 'sorular' && k) {
      const a = this.analiz(k.id);
      html = sorularHtml(a ? a.sorular : null, this.hatalar.get(k.id) ?? null);
    } else if (this.gorunum === 'sabah') {
      html = sabahHtml(this.sabahK, this.sabahI, !this.sabah);
    }
    const key = `${this.gorunum}|${k?.id}|${this.iddiaI}|${this.sabahI}|${html.length}`;
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
    for (const o of this.jest.update(hands, now, holds)) this.uygula(o, now);
    if (!hands.some(h => h.gesture === 'isaret')) this.karusel.hover = -1;
    this.karusel.update(dt, this.W, this.H);
    // Öndeki kartın analizi arka planda hazırlansın (detay açılınca bekletmesin)
    const on = this.karusel.onKume;
    if (on && this.karusel.duruyor && this.gorunum === 'karusel') { this.temelGetir(on.id); }
    this.kanal.tick();
    this.kanal.altBant(this.gorunum === 'karusel' ? on : this.gorunum === 'sabah' ? null : this.secili);
    const m = this.merkez;
    const bekleyen = [...this.analizler.values()].filter(v => v instanceof Promise).length + [...this.iddialar.values()].filter(v => v instanceof Promise).length;
    this.kanal.durum(m?.kaynaklar.calisan ?? 0, m?.kaynaklar.toplam ?? 0, this.listening ? '🎙 DİNLİYOR' : bekleyen ? 'JARVIS ANALİZ EDİYOR' : '');
    this.panelCiz();
    this.kisiCiz();
    this.fx.render(dt, now, [], holds);
    const mode = this.gorunum === 'acilis' ? 'haber · açılış' : this.gorunum === 'karusel' ? `haber · ${this.kategori ? KATEGORI_AD[this.kategori].toLocaleLowerCase('tr') : 'gündem'}` : `haber · ${this.gorunum}`;
    return { mode, holds };
  }

  dispose() { this.reset(); this.kanal.dispose(); this.root.remove(); }
}
