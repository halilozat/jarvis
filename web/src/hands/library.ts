// El Kontrolü · Kitaplık: elin görüntüde değdiği kitap seçilir, çimdikle tutulup çekilince raftan kopar, bana doğru
// uçar, kapağını gösterir ve holografik açılır. Raf haritası sunucuda (video normalize kutular, aynalanmamış).
//
// Katmanlar: video → raf katmanı (bu dosyanın canvas'ı: boşluk gölgesi, seçim parıltısı, tarama) → efektler → 3B kitap (DOM)
import { coverUrl, shortLabel, type Kitap, type Referans } from '../lib/library';
import type { Fx, HoldState } from './fx';
import type { P, TrackedHand } from './gestures';
import type { Sfx } from './sfx';
import { makeMapper } from './tracker';

export type Faz = 'bos' | 'secili' | 'tutuldu' | 'ucuyor' | 'kapak' | 'aciliyor' | 'acik' | 'kapaniyor' | 'donuyor';

interface Rect { x: number; y: number; w: number; h: number }

export interface LibraryResult {
  /** Kitap dışarıda: ateş/mühür/gezegen/şimşek ve diğer basılı tutma kontrolleri kapalı */
  capture: boolean;
  /** İşaret ucu/çimdiği kitaplık bölgesindeki eller: bu eller gezegen OLUŞTURMAZ */
  zone: Set<string>;
  holds: HoldState[];
  mode: string | null;
}

export interface LibraryHooks {
  /** 👍 basılı: Jarvis özeti seçili sesle okusun */
  onRead(k: Kitap): void;
  /** Açık kitap değişti (App "bunu özetle" komutu için) */
  onOpenChange(k: Kitap | null): void;
  /** Jarvis sayfaları yoksa doldur (sunucu, RouteLLM): özet, ana fikirler, yazar, temalar, benzerler */
  fill(k: Kitap): Promise<Kitap | null>;
  /** Kapak resmi (Open Library / yüklenen); yoksa null → sırttan kapak üretilir */
  cover(k: Kitap): Promise<HTMLImageElement | null>;
}

// Renkler: beyaz raf + gri duvar üstünde okunsun diye parlak kenarın altında koyu bir kontur var
const AMBER = '255,179,71';
const CYAN = '95,242,255';
const VIDEO_FILTER = 'brightness(0.82) contrast(1.08) saturate(1.05)';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t: number) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inRect = (r: Rect, p: P, mx = 0, my = 0) => p.x >= r.x - mx && p.x <= r.x + r.w + mx && p.y >= r.y - my && p.y <= r.y + r.h + my;


// ---------------------------------------------------------------- Küçük resim (kamera kıpırdadı mı)

export const THUMB_W = 128;
export const THUMB_H = 72;

/** Kareden 128×72 gri küçük resim (base64, 9 KB). Aynalanmamış kare. */
export function thumbOf(src: CanvasImageSource): string {
  const c = document.createElement('canvas');
  c.width = THUMB_W; c.height = THUMB_H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, THUMB_W, THUMB_H);
  const d = g.getImageData(0, 0, THUMB_W, THUMB_H).data;
  let s = '';
  for (let i = 0; i < d.length; i += 4) s += String.fromCharCode(Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114));
  return btoa(s);
}

const unpack = (b64: string) => { const s = atob(b64); const v = new Float32Array(s.length); for (let i = 0; i < s.length; i++) v[i] = s.charCodeAt(i); return v; };

/**
 * Kamera kıpırdadı mı? Referans küçük resim 8×8 karolara bölünür; dokulu her karo yeni karede ±4 px içinde en iyi
 * eşleştiği yere (normalize çapraz korelasyon) bakar. Kamera sabitse eşleşen karoların neredeyse hepsi (0,0)'da kalır;
 * önden geçen kişi yalnızca kapattığı karoları bozar (onlar eşleşmez, oy vermez), ışık değişimi korelasyonu etkilemez.
 * Kamera kayar/döner/yakınlaşırsa karolar kayık yerde eşleşir.
 * Demo karesinde ölçüldü: kişi (%30-60 kaplama), ışık, gürültü → yerinde %96-100; %0,5 kayma → %25, 1° dönme → %37,
 * %1 yakınlaşma → %35. Döner: { conf: güvenle eşleşen karo sayısı, still: bunların yerinde kalan oranı }.
 */
export function thumbStill(refB64: string, curB64: string): { conf: number; still: number } {
  const a = unpack(refB64), b = unpack(curB64);
  const W = THUMB_W, H = THUMB_H, T = 8, R = 4;
  if (a.length !== W * H || b.length !== W * H) return { conf: 0, still: 1 };
  let conf = 0, still = 0;
  for (let y0 = 0; y0 + T <= H; y0 += T) {
    for (let x0 = 0; x0 + T <= W; x0 += T) {
      let ma = 0;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) ma += a[(y0 + y) * W + x0 + x];
      ma /= T * T;
      let va = 0;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const d = a[(y0 + y) * W + x0 + x] - ma; va += d * d; }
      if (Math.sqrt(va / (T * T)) < 6) continue; // düz duvar: bilgi yok
      let best = -2, bx = 0, by = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (x0 + dx < 0 || y0 + dy < 0 || x0 + dx + T > W || y0 + dy + T > H) continue;
          let mb = 0;
          for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) mb += b[(y0 + dy + y) * W + x0 + dx + x];
          mb /= T * T;
          let vb = 0, cv = 0;
          for (let y = 0; y < T; y++) {
            for (let x = 0; x < T; x++) {
              const da = a[(y0 + y) * W + x0 + x] - ma, db = b[(y0 + dy + y) * W + x0 + dx + x] - mb;
              vb += db * db; cv += da * db;
            }
          }
          const n = cv / Math.sqrt(va * vb || 1);
          if (n > best || (n === best && Math.abs(dx) + Math.abs(dy) < Math.abs(bx) + Math.abs(by))) { best = n; bx = dx; by = dy; }
        }
      }
      if (best < 0.7) continue; // kapanmış (önde biri var) ya da değişmiş karo: oy vermez
      conf++;
      if (bx === 0 && by === 0) still++;
    }
  }
  return { conf, still: conf ? still / conf : 1 };
}

/** Yerinde kalan karo oranı bunun altındaysa kamera kıpırdamış (en az MIN_CONF karo eşleşmeli; yoksa karar verilmez) */
export const STILL_LIMIT = 0.6;
const MIN_CONF = 15;

// ---------------------------------------------------------------- Kapak üretimi (Open Library'de yoksa)

function avgColor(c: HTMLCanvasElement): [number, number, number] {
  const s = document.createElement('canvas');
  s.width = 8; s.height = 24;
  const g = s.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(c, 0, 0, 8, 24);
  const d = g.getImageData(0, 0, 8, 24).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return [r / n, gg / n, b / n];
}

/** Sırt görüntüsünden ve adla sade bir kapak: sırtın rengi, sırt dokusu solda şerit, büyük başlık */
export function makeCover(k: Kitap, spine: HTMLCanvasElement | null, w = 600, h = 900): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const [r, gg, b] = spine ? avgColor(spine) : [30, 50, 80];
  const lum = (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
  const ink = lum > 0.6 ? '#1a1a1a' : '#f6f1e6';
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, `rgb(${r * 1.08},${gg * 1.08},${b * 1.08})`);
  bg.addColorStop(1, `rgb(${r * 0.72},${gg * 0.72},${b * 0.72})`);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (spine) {
    // Gerçek sırt solda şerit olarak (kitabın kendisinden bir parça)
    g.globalAlpha = 0.9;
    g.drawImage(spine, 0, 0, w * 0.13, h);
    g.globalAlpha = 0.25;
    g.fillStyle = '#000'; g.fillRect(w * 0.13, 0, 6, h);
    g.globalAlpha = 1;
  }
  g.strokeStyle = ink; g.globalAlpha = 0.35; g.lineWidth = 2;
  g.strokeRect(w * 0.2, h * 0.08, w * 0.72, h * 0.84);
  g.globalAlpha = 1;
  g.fillStyle = ink;
  g.textAlign = 'center';
  const title = (k.ad || 'Bilinmeyen kitap').toLocaleUpperCase('tr');
  const words = title.split(/\s+/);
  const lines: string[] = [];
  g.font = `700 64px Rajdhani, "Arial Narrow", sans-serif`;
  let line = '';
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (g.measureText(t).width > w * 0.62 && line) { lines.push(line); line = wd; } else line = t;
  }
  if (line) lines.push(line);
  const fs = Math.min(64, (w * 0.62) / Math.max(...lines.map(l => g.measureText(l).width / 64)));
  g.font = `700 ${fs}px Rajdhani, "Arial Narrow", sans-serif`;
  lines.forEach((l, i) => g.fillText(l, w * 0.56, h * 0.3 + i * fs * 1.05));
  if (k.yazar) {
    g.font = `500 30px Rajdhani, sans-serif`;
    g.globalAlpha = 0.85;
    g.fillText(k.yazar.toLocaleUpperCase('tr'), w * 0.56, h * 0.84);
  }
  return c;
}

// ---------------------------------------------------------------- Kitap

interface OutBook {
  k: Kitap;
  rect: Rect;
  spine: HTMLCanvasElement;
  cover: HTMLCanvasElement | HTMLImageElement;
  coverSrc: string;
  /** Kitabın son (tam) boyu: kalınlık T, boy Hb, kapak genişliği C */
  T: number; Hb: number; C: number;
  /** Ekranda sırtın ilk ölçeği (rect.h / Hb) */
  s0: number;
  t0: number;
  from: P;
  via: P;
  /** Faz başlangıcı */
  at: number;
  spread: number;
  pages: string[];
  fillLoading: boolean;
  flip: { dir: 1 | -1; at: number } | null;
  lastFlip: number;
  pushRef: Map<string, number>;
  holdFired: Map<string, number>;
  twoApart: number | null;
  el: { box: HTMLDivElement; spread: HTMLDivElement; left: HTMLDivElement; right: HTMLDivElement; leaf: HTMLDivElement; front: HTMLDivElement; back: HTMLDivElement };
}

interface Gap { rect: Rect; a: number; closing: boolean }
interface Flash { rect: Rect; at: number }

interface ScanAnim {
  at: number;
  /** null: model cevabı bekleniyor */
  doneAt: number | null;
  books: Kitap[];
  bulunan: number;
  belirsiz: number;
  error: string | null;
}

export class Library {
  books: Kitap[] = [];
  faz: Faz = 'bos';
  hooks: LibraryHooks;
  ref: Referans | null = null;
  /** Kamera kıpırdamış: uyarı gösterilir, efekt çalışmaya devam eder */
  moved = false;
  /** Ayar modu açıkken seçim/tutma kapalı (fare ile kutu çiziliyor) */
  paused = false;

  private g: CanvasRenderingContext2D;
  private W = 0; private H = 0; private dpr = 1;
  private rects = new Map<string, Rect>();
  private zoneRect: Rect | null = null;
  private rectKey = '';
  /** Harita her değiştiğinde artar (ekran dikdörtgenleri yeniden hesaplanır) */
  private booksVer = 0;
  private sel: string | null = null;
  private selHand: string | null = null;
  private cand: string | null = null;
  /** Raf bölgesindeki parmak uçları (nişangâh çizilir: dar sırtlara nişan almak için) */
  private pointers: P[] = [];
  private candSince = 0;
  private lostSince: number | null = null;
  private held: { hand: string; start: P; size: number; at: number; lostAt: number | null } | null = null;
  private grabSpine: HTMLCanvasElement | null = null;
  private tension = 0;
  private out: OutBook | null = null;
  private gaps = new Map<string, Gap>();
  private flashes: Flash[] = [];
  private scan: ScanAnim | null = null;
  private cooldownUntil = 0;
  private lastMotion = 0;
  private movedN = 0;

  private canvas: HTMLCanvasElement;
  private stage: HTMLDivElement;
  private video: HTMLVideoElement;
  private fx: Fx;
  private sfx: Sfx;
  constructor(canvas: HTMLCanvasElement, stage: HTMLDivElement, video: HTMLVideoElement, fx: Fx, sfx: Sfx, hooks: LibraryHooks) {
    this.canvas = canvas; this.stage = stage; this.video = video; this.fx = fx; this.sfx = sfx; this.hooks = hooks;
    this.g = canvas.getContext('2d')!;
  }

  resize(W: number, H: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.rectKey = '';
  }

  /** Harita yüklendi/değişti. Dışarıdaki kitap kimliğiyle korunur (notu yeni eklendiyse sayfaları yenilenir). */
  setBooks(list: Kitap[], ref: Referans | null) {
    this.books = list;
    this.ref = ref;
    this.booksVer++;
    this.moved = false; this.movedN = 0;
    const out = this.out;
    if (out) {
      const nk = list.find(b => b.id === out.k.id);
      if (nk) {
        const renamed = nk.ad !== out.k.ad;
        out.k = nk;
        if (renamed) { out.fillLoading = false; this.renamed(out); }
        out.pages = this.buildPages(out);
        this.paintSpread();
        this.maybeFill(out);
      }
    }
    if (this.sel && !list.some(b => b.id === this.sel)) this.sel = null;
  }

  get openBook(): Kitap | null { return this.out && (this.faz === 'acik' || this.faz === 'aciliyor' || this.faz === 'kapak') ? this.out.k : null; }

  /** Video normalize kutu → ekran dikdörtgeni (ayna + object-fit: cover). Pencere değişince yeniden hesaplanır. */
  rectOf(id: string): Rect | null { this.ensureRects(); return this.rects.get(id) ?? null; }

  private ensureRects() {
    const vw = this.video.videoWidth || this.ref?.genislik || 1920, vh = this.video.videoHeight || this.ref?.yukseklik || 1080;
    const key = `${this.W}x${this.H}:${vw}x${vh}:${this.booksVer}`;
    if (key === this.rectKey) return;
    this.rectKey = key;
    this.rects.clear();
    const map = makeMapper(vw, vh, this.W, this.H);
    let zx0 = Infinity, zy0 = Infinity, zx1 = -Infinity, zy1 = -Infinity;
    for (const b of this.books) {
      if (!b.kutu) continue;
      const [y0, x0, y1, x1] = b.kutu;
      const a = map(x0, y0), c = map(x1, y1);
      const r = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
      this.rects.set(b.id, r);
      zx0 = Math.min(zx0, r.x); zy0 = Math.min(zy0, r.y); zx1 = Math.max(zx1, r.x + r.w); zy1 = Math.max(zy1, r.y + r.h);
    }
    const m = Math.min(this.W, this.H) * 0.04;
    this.zoneRect = this.rects.size ? { x: zx0 - m, y: zy0 - m, w: zx1 - zx0 + 2 * m, h: zy1 - zy0 + 2 * m } : null;
  }

  // ---------------------------------------------------------------- Her kare

  update(hands: TrackedHand[], now: number, dt: number): LibraryResult {
    this.ensureRects();
    this.pointers = [];
    const zone = new Set<string>();
    const holds: HoldState[] = [];
    if (this.zoneRect && !this.out) {
      for (const h of hands) {
        if (inRect(this.zoneRect, this.pointer(h)) || inRect(this.zoneRect, h.shape.pinchPt)) zone.add(h.id);
      }
    }
    this.motionCheck(now);

    switch (this.faz) {
      case 'bos':
      case 'secili':
        if (!this.paused && now > this.cooldownUntil) this.hover(hands, now);
        else this.sel = null;
        this.faz = this.sel ? 'secili' : 'bos';
        if (this.faz === 'secili') this.tryGrab(hands, now);
        break;
      case 'tutuldu':
        this.pull(hands, now);
        break;
      case 'ucuyor':
      case 'donuyor':
        this.flight(now, dt);
        break;
      case 'kapak':
        this.coverPhase(hands, now);
        break;
      case 'aciliyor':
      case 'kapaniyor':
        this.openAnim(now);
        break;
      case 'acik':
        this.openPhase(hands, now, dt, holds);
        break;
    }
    if (this.out && this.faz !== 'ucuyor' && this.faz !== 'donuyor') this.place(now);

    const capture = !!this.out;
    const mode =
      this.faz === 'bos' ? null : this.faz === 'secili' ? 'kitap · seçili' : this.faz === 'tutuldu' ? 'kitap · tutuldu'
        : this.faz === 'acik' ? `kitap · sayfa ${this.out!.spread * 2 + 1}/${this.out!.pages.length}` : `kitap · ${this.faz}`;
    return { capture, zone: this.faz === 'secili' || this.faz === 'tutuldu' ? new Set([...zone, this.selHand!].filter(Boolean)) : zone, holds, mode };
  }

  private pointer(h: TrackedHand): P { return h.gesture === 'cimdik' ? h.shape.pinchPt : h.pts[8]; }

  /**
   * SEÇ: işaret ucu ya da çimdik noktasına en yakın sırt (mıknatıs gibi). Uzaktan çekimde sırtlar 15-20 px; parmağın tam
   * sırtın içinde durması gerekmez: ucun hizasındaki raftaki en yakın sırt aday olur, 150 ms kalınca seçilir.
   * Komşuya geçiş titremesin diye histerezis: yeni aday seçiliden belirgin daha yakın olmalı.
   */
  private hover(hands: TrackedHand[], now: number) {
    this.pointers = [];
    if (!this.rects.size) { this.sel = null; return; }
    /** p'ye göre sırtın uzaklığı (px); hizada değilse ya da çok uzaksa null */
    const dist = (r: Rect, p: P) => {
      const my = r.h * 0.12 + 6;
      if (p.y < r.y - my || p.y > r.y + r.h + my) return null;
      const dx = Math.abs(p.x - (r.x + r.w / 2));
      return dx <= r.w / 2 + Math.max(14, r.w * 0.8) ? dx : null;
    };
    let best: { id: string; hand: string; d: number } | null = null;
    let selD: number | null = null;
    for (const h of hands) {
      const p = this.pointer(h);
      if (this.zoneRect && !inRect(this.zoneRect, p)) continue;
      this.pointers.push(p);
      for (const [id, r] of this.rects) {
        const d = dist(r, p);
        if (d === null) continue;
        if (id === this.sel && h.id === this.selHand) selD = d;
        if (!best || d < best.d) best = { id, hand: h.id, d };
      }
    }
    if (this.sel && selD !== null) {
      this.lostSince = null;
      const r = this.rects.get(this.sel)!;
      // Seçili kalır; aday ancak belirgin daha yakınsa ve 150 ms öyle kalırsa geçer
      if (!best || best.id === this.sel || best.d > selD - Math.max(6, r.w * 0.5)) { this.cand = null; return; }
    }
    if (best && best.id !== this.sel) {
      if (this.cand !== best.id) { this.cand = best.id; this.candSince = now; }
      else if (now - this.candSince >= 150) {
        this.sel = best.id; this.selHand = best.hand; this.cand = null; this.lostSince = null;
        this.sfx.hover();
      }
      return;
    }
    if (!best) this.cand = null;
    if (this.sel && selD === null) {
      // Takip bir iki kare kaçabilir: seçimi hemen bırakma
      this.lostSince ??= now;
      if (now - this.lostSince > 350) { this.sel = null; this.selHand = null; this.lostSince = null; }
    }
  }

  /** TUT: seçiliyken çimdik */
  private tryGrab(hands: TrackedHand[], now: number) {
    const h = hands.find(x => x.id === this.selHand);
    if (!h || h.gesture !== 'cimdik') return;
    const k = this.books.find(b => b.id === this.sel);
    const r = this.sel ? this.rects.get(this.sel) : null;
    if (!k || !r) return;
    this.held = { hand: h.id, start: { ...h.shape.pinchPt }, size: h.shape.size, at: now, lostAt: null };
    this.grabSpine = this.crop(k, r);
    this.tension = 0;
    this.faz = 'tutuldu';
    this.sfx.grab();
  }

  /** ÇEK: tutarken el raftan uzaklaşınca (ekranda mesafe) ya da kameraya yaklaşınca (el büyür) kitap kopar */
  private pull(hands: TrackedHand[], now: number) {
    const held = this.held!;
    const h = hands.find(x => x.id === held.hand);
    if (!h || h.gesture !== 'cimdik') {
      held.lostAt ??= now;
      // Kısa kayıplar (bir iki kare jest kaçması) bırakma sayılmaz
      if (now - held.lostAt > 180) { this.held = null; this.faz = 'secili'; this.tension = 0; }
      return;
    }
    held.lostAt = null;
    const moved = dist(h.shape.pinchPt, held.start) / (Math.min(this.W, this.H) * 0.11);
    const grow = (h.shape.size / held.size - 1) / 0.22;
    this.tension = clamp(Math.max(moved, grow), 0, 1.2);
    if (this.tension >= 1) this.detach(h, now);
  }

  /** O anki kareden sırt bölgesini kırp (ekranda göründüğü gibi: ayna ve video filtresi uygulanmış) */
  private crop(k: Kitap, r: Rect): HTMLCanvasElement {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const c = document.createElement('canvas');
    if (!k.kutu || !vw || this.video.readyState < 2) {
      c.width = Math.max(8, Math.round(r.w)); c.height = Math.max(8, Math.round(r.h));
      const g = c.getContext('2d')!;
      g.fillStyle = '#34465a'; g.fillRect(0, 0, c.width, c.height);
      return c;
    }
    const [y0, x0, y1, x1] = k.kutu;
    const sx = x0 * vw, sy = y0 * vh, sw = Math.max(2, (x1 - x0) * vw), sh = Math.max(2, (y1 - y0) * vh);
    // Çok küçük sırtlar uçarken bulanık olmasın diye en az 2×
    const up = Math.max(1, Math.min(4, 320 / sh));
    c.width = Math.round(sw * up); c.height = Math.round(sh * up);
    const g = c.getContext('2d')!;
    g.filter = VIDEO_FILTER;
    g.imageSmoothingQuality = 'high';
    g.translate(c.width, 0); g.scale(-1, 1); // ekrandaki ayna
    g.drawImage(this.video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }

  // ---------------------------------------------------------------- Kopma ve uçuş

  private detach(h: TrackedHand, now: number) {
    const k = this.books.find(b => b.id === this.sel)!;
    const r = this.rects.get(k.id)!;
    const spine = this.grabSpine ?? this.crop(k, r);
    const Hb = Math.min(this.H * 0.64, this.W * 0.42);
    const C = Hb * 0.66;
    const T = clamp((Hb * r.w) / Math.max(1, r.h), Hb * 0.05, Hb * 0.32);
    const cover = makeCover(k, spine);
    const out: OutBook = {
      k, rect: r, spine, cover, coverSrc: cover.toDataURL('image/jpeg', 0.85), T, Hb, C, s0: r.h / Hb, t0: now,
      from: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
      via: { x: lerp(h.shape.pinchPt.x, this.W / 2, 0.3), y: Math.min(h.shape.pinchPt.y, this.H * 0.6) },
      at: now, spread: 0, pages: [], fillLoading: false, flip: null, lastFlip: 0, pushRef: new Map(), holdFired: new Map(), twoApart: null,
      el: this.buildDom(),
    };
    out.pages = this.buildPages(out);
    this.out = out;
    this.held = null;
    this.gaps.set(k.id, { rect: r, a: 1, closing: false });
    this.faz = 'ucuyor';
    this.sfx.whoosh();
    this.paintBook();
    // Kapak (Open Library / yüklenen) gelirse üretileni değiştir
    this.hooks.cover(k).then(img => {
      if (!img || this.out !== out) return;
      out.cover = img; out.coverSrc = img.src;
      this.paintBook(); this.paintSpread();
    }).catch(() => {});
    // Jarvis sayfaları yoksa şimdiden iste (açılana kadar çoğu zaman hazır olur)
    this.maybeFill(out);
  }

  private maybeFill(out: OutBook) {
    if (out.k.jarvis || !out.k.ad || out.fillLoading) return;
    out.fillLoading = true;
    const id = out.k.id;
    this.hooks.fill(out.k).then(nk => {
      if (this.out !== out) return;
      out.fillLoading = false;
      if (nk && nk.id === id && nk.ad === out.k.ad) out.k = nk;
      out.pages = this.buildPages(out);
      this.paintSpread();
    }).catch(() => { out.fillLoading = false; });
    out.pages = this.buildPages(out);
    this.paintSpread();
  }

  /** Açık kitabın adı değişti ("Jarvis, bu kitabın adı …"): kapağı yeniden üret, varsa gerçek kapağı ara */
  private renamed(out: OutBook) {
    out.cover = makeCover(out.k, out.spine);
    out.coverSrc = (out.cover as HTMLCanvasElement).toDataURL('image/jpeg', 0.85);
    this.paintBook();
    this.hooks.cover(out.k).then(img => {
      if (!img || this.out !== out) return;
      out.cover = img; out.coverSrc = img.src;
      out.pages = this.buildPages(out);
      this.paintBook(); this.paintSpread();
    }).catch(() => {});
  }

  /** Uçuş: raftan ele doğru büyüyerek, sonra ekranın ortasına; yolda 90° dönüp kapağını gösterir. Dönüşte tersi. */
  private flight(now: number, dt: number) {
    const o = this.out!;
    const back = this.faz === 'donuyor';
    const dur = back ? 820 : 950;
    const t = clamp((now - o.at) / dur, 0, 1);
    const p = back ? 1 - easeInOut(t) : easeInOut(t);
    const to = { x: this.W / 2, y: this.H * 0.47 };
    // İkinci dereceden Bezier: sırt → elin önü → orta
    const q = (a: number, b: number, c: number) => (1 - p) * (1 - p) * a + 2 * (1 - p) * p * b + p * p * c;
    const x = q(o.from.x, o.via.x, to.x), y = q(o.from.y, o.via.y, to.y);
    const s = lerp(o.s0, 1, back ? p : ease(p * 1.1));
    const ry = -90 * clamp((p - 0.28) / 0.62, 0, 1) ** 1.2;
    const rz = Math.sin(p * Math.PI) * (back ? -6 : 8);
    const rx = Math.sin(p * Math.PI) * 10;
    this.boxTransform(x, y, s, ry, rx, rz);
    o.el.box.style.opacity = '1';
    // Toz ve kıvılcım izi
    if (t < 1) {
      const n = Math.round(dt * 260 * Math.sin(Math.PI * t));
      this.fx.bookDust(x, y, n, o.Hb * s * 0.35, Math.random() < 0.6 ? 'gold' : 'cyan');
    }
    if (t >= 1) {
      if (back) this.landed(now);
      else { this.faz = 'kapak'; o.at = now; this.hooks.onOpenChange(o.k); }
    }
  }

  private landed(now: number) {
    const o = this.out!;
    this.stage.replaceChildren();
    const gap = this.gaps.get(o.k.id);
    if (gap) gap.closing = true;
    this.flashes.push({ rect: o.rect, at: now });
    this.sfx.thud();
    this.fx.bookDust(o.from.x, o.from.y, 40, o.rect.h * 0.4, 'cyan');
    this.out = null;
    this.faz = 'bos';
    this.sel = null;
    this.cooldownUntil = now + 900;
    this.hooks.onOpenChange(null);
  }

  /** KAPAK: 1 sn görünür kalınca ya da iki açık el ayrılınca açılır */
  private coverPhase(hands: TrackedHand[], now: number) {
    const o = this.out!;
    const open = hands.filter(h => h.gesture === 'acik');
    if (open.length === 2) {
      const d = dist(open[0].shape.palm, open[1].shape.palm);
      o.twoApart ??= d;
      if (d - o.twoApart > Math.min(this.W, this.H) * 0.12) return this.beginOpen(now);
    } else o.twoApart = null;
    if (now - o.at > 1000) this.beginOpen(now);
  }

  private beginOpen(now: number) {
    const o = this.out!;
    this.faz = 'aciliyor';
    o.at = now;
    o.spread = 0;
    this.paintSpread();
    o.el.box.style.opacity = '0';
    o.el.spread.style.opacity = '1';
    this.sfx.open();
  }

  /** Kapak sola açılır (aciliyor) ya da geri kapanır (kapaniyor). Kapandıktan sonra kitap rafına uçar. */
  private openAnim(now: number) {
    const o = this.out!;
    const closing = this.faz === 'kapaniyor';
    const t = clamp((now - o.at) / (closing ? 620 : 820), 0, 1);
    const p = easeInOut(closing ? 1 - t : t);
    o.el.leaf.style.transform = `rotateY(${-180 * p}deg)`;
    o.el.spread.style.setProperty('--shift', `${-(1 - p) * o.C * 0.5}px`);
    o.el.spread.style.setProperty('--holo', String(p));
    if (t < 1) return;
    if (closing) {
      this.faz = 'donuyor';
      o.at = now;
      o.el.spread.style.opacity = '0';
      this.paintBook();
    } else {
      this.faz = 'acik';
      o.at = now;
      o.el.leaf.style.visibility = 'hidden';
      o.el.left.style.visibility = 'visible';
      this.paintSpread();
    }
  }

  /** AÇIK: sayfa çevir (açık avucu savur), 👍 basılı = özeti oku, ✊ basılı ya da eli ileri it = rafa koy */
  private openPhase(hands: TrackedHand[], now: number, dt: number, holds: HoldState[]) {
    const o = this.out!;
    if (o.flip) {
      const t = clamp((now - o.flip.at) / 700, 0, 1);
      const p = easeInOut(t);
      o.el.leaf.style.transform = `rotateY(${o.flip.dir === 1 ? -180 * p : -180 * (1 - p)}deg)`;
      if (t >= 1) {
        o.flip = null;
        o.el.leaf.style.visibility = 'hidden';
        this.paintSpread();
      }
      return;
    }
    const spreads = Math.ceil(o.pages.length / 2);
    for (const h of hands) {
      // Sayfa çevir: yatay savurma (hız eşiği), dikey hareket sayılmaz
      if ((h.gesture === 'acik' || h.gesture === 'diger') && now - o.lastFlip > 650 && Math.abs(h.vel.x) > 1100 && Math.abs(h.vel.x) > Math.abs(h.vel.y) * 1.8) {
        const dir: 1 | -1 = h.vel.x < 0 ? 1 : -1; // sola savur = sonraki sayfa
        if ((dir === 1 && o.spread < spreads - 1) || (dir === -1 && o.spread > 0)) this.flipPage(dir, now);
        else this.sfx.tick(0.1);
        o.lastFlip = now;
        return;
      }
      // Rafa koy: açık avuç ileri itilince el küçülür
      if (h.gesture === 'acik') {
        const ref = o.pushRef.get(h.id);
        const k = 1 - Math.exp(-dt / 1.2);
        if (ref === undefined) o.pushRef.set(h.id, h.shape.size);
        else {
          if (h.shape.size < ref * 0.72 && now - o.at > 1200) return this.close(now);
          o.pushRef.set(h.id, ref + (h.shape.size - ref) * k);
        }
      } else o.pushRef.delete(h.id);
      // Basılı tutma: 👍 özeti oku · ✊ rafa koy
      const ctl = h.gesture === 'basparmak' ? { ad: '🔊 ÖZETİ OKU', sure: 1000 } : h.gesture === 'yumruk' ? { ad: '↩ RAFA KOY', sure: 900 } : null;
      if (!ctl) continue;
      const p = (now - h.since - 300) / ctl.sure;
      if (p <= 0) continue;
      const fired = o.holdFired.get(h.id) === h.since;
      if (!fired && p >= 1) {
        o.holdFired.set(h.id, h.since);
        this.sfx.confirm();
        this.fx.confirmBurst(h.shape.palm.x, h.shape.palm.y, h.shape.size * 1.25);
        if (h.gesture === 'yumruk') return this.close(now);
        this.hooks.onRead(o.k);
      }
      if (!fired) holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: h.shape.size * 1.25, p: Math.min(1, p), label: ctl.ad, done: 0 });
    }
  }

  private flipPage(dir: 1 | -1, now: number) {
    const o = this.out!;
    const pg = (i: number) => o.pages[i] ?? '';
    const i = o.spread;
    const { left, right, leaf, front, back } = o.el;
    if (dir === 1) {
      front.innerHTML = pg(2 * i + 1); back.innerHTML = pg(2 * i + 2);
      right.innerHTML = pg(2 * i + 3);
      leaf.style.transform = 'rotateY(0deg)';
    } else {
      front.innerHTML = pg(2 * i - 1); back.innerHTML = pg(2 * i);
      left.innerHTML = pg(2 * i - 2);
      leaf.style.transform = 'rotateY(-180deg)';
    }
    front.className = 'lb-pg front'; back.className = 'lb-pg back';
    leaf.style.visibility = 'visible';
    o.spread += dir;
    o.flip = { dir, at: now };
    this.sfx.page();
  }

  /** GERİ KOY */
  close(now = performance.now()) {
    const o = this.out;
    if (!o || this.faz !== 'acik') return;
    const { leaf, front, back, left } = o.el;
    front.innerHTML = this.coverHtml(o);
    front.className = 'lb-pg front cover';
    back.innerHTML = o.pages[o.spread * 2] ?? '';
    back.className = 'lb-pg back';
    left.style.visibility = 'hidden';
    leaf.style.visibility = 'visible';
    leaf.style.transform = 'rotateY(-180deg)';
    this.faz = 'kapaniyor';
    o.at = now;
    this.sfx.close();
    this.hooks.onOpenChange(null);
  }

  /** Dışarıdaki kitabı ekranın ortasında hafif süzdür (kapak/açık) */
  private place(now: number) {
    const o = this.out!;
    const fl = Math.sin(now / 900) * 6;
    if (this.faz === 'kapak') this.boxTransform(this.W / 2, this.H * 0.47 + fl, 1, -90, Math.sin(now / 1300) * 3, 0);
    const s = o.el.spread.style;
    s.transform = `translate3d(${this.W / 2 - o.C}px, ${this.H * 0.47 - o.Hb / 2 + fl}px, 0) translateX(var(--shift, 0px)) rotateX(${4 + Math.sin(now / 1300) * 2}deg)`;
  }

  private boxTransform(x: number, y: number, s: number, ry: number, rx: number, rz: number) {
    const o = this.out!;
    o.el.box.style.transform = `translate3d(${x - o.T / 2}px, ${y - o.Hb / 2}px, 0) scale(${s}) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // ---------------------------------------------------------------- DOM

  private buildDom(): OutBook['el'] {
    const div = (cls: string, parent?: HTMLElement) => { const d = document.createElement('div'); d.className = cls; parent?.appendChild(d); return d; };
    this.stage.replaceChildren();
    const box = div('lb-box', this.stage);
    for (const f of ['spine', 'cover', 'backc', 'top', 'bottom', 'edge']) div(`lb-f ${f}`, box);
    const spread = div('lb-spread', this.stage);
    const left = div('lb-pg left', spread);
    const right = div('lb-pg right', spread);
    const leaf = div('lb-leaf', spread);
    const front = div('lb-pg front', leaf);
    const back = div('lb-pg back', leaf);
    box.style.opacity = '0';
    spread.style.opacity = '0';
    return { box, spread, left, right, leaf, front, back };
  }

  /** Kutunun yüzleri: sırt (gerçek kırpılmış görüntü), kapak, sayfa kenarları */
  private paintBook() {
    const o = this.out!;
    const { box } = o.el;
    const { T, Hb, C } = o;
    box.style.width = `${T}px`; box.style.height = `${Hb}px`;
    const f = (cls: string) => box.querySelector<HTMLDivElement>(`.lb-f.${cls}`)!;
    const spine = f('spine');
    spine.style.cssText = `width:${T}px;height:${Hb}px;transform:translateZ(${C / 2}px)`;
    if (!spine.firstChild) { o.spine.className = 'lb-img'; spine.appendChild(o.spine); }
    const edge = f('edge');
    edge.style.cssText = `width:${T}px;height:${Hb}px;transform:rotateY(180deg) translateZ(${C / 2}px)`;
    const cov = f('cover');
    cov.style.cssText = `width:${C}px;height:${Hb}px;left:${(T - C) / 2}px;transform:rotateY(90deg) translateZ(${T / 2}px)`;
    cov.replaceChildren();
    const img = o.cover instanceof HTMLCanvasElement ? o.cover : (o.cover.cloneNode() as HTMLImageElement);
    img.className = 'lb-img';
    cov.appendChild(img);
    const backc = f('backc');
    backc.style.cssText = `width:${C}px;height:${Hb}px;left:${(T - C) / 2}px;transform:rotateY(-90deg) translateZ(${T / 2}px);background:${this.spineTone(o)}`;
    for (const [cls, rot] of [['top', 90], ['bottom', -90]] as const) {
      f(cls).style.cssText = `width:${T}px;height:${C}px;top:${(Hb - C) / 2}px;transform:rotateX(${rot}deg) translateZ(${Hb / 2}px)`;
    }
  }

  private spineTone(o: OutBook) {
    const [r, g, b] = avgColor(o.spine);
    return `rgb(${r * 0.8},${g * 0.8},${b * 0.8})`;
  }

  private coverHtml(o: OutBook) { return `<img class="lb-img" src="${o.coverSrc}" alt="">`; }

  private paintSpread() {
    const o = this.out;
    if (!o) return;
    const { spread, left, right, leaf, front, back } = o.el;
    spread.style.width = `${o.C * 2}px`;
    spread.style.height = `${o.Hb}px`;
    spread.style.setProperty('--pw', `${o.C}px`);
    spread.style.setProperty('--fs', `${Math.max(12, o.Hb / 38)}px`);
    if (this.faz === 'aciliyor' || this.faz === 'kapak' || this.faz === 'ucuyor') {
      // Kapalı: kapak sağda (yaprak), açılınca arkası sol sayfa olur
      front.innerHTML = this.coverHtml(o); front.className = 'lb-pg front cover';
      back.innerHTML = o.pages[0] ?? ''; back.className = 'lb-pg back';
      right.innerHTML = o.pages[1] ?? '';
      left.style.visibility = 'hidden';
      leaf.style.visibility = 'visible';
      leaf.style.transform = 'rotateY(0deg)';
      return;
    }
    if (this.faz === 'acik' && !o.flip) {
      left.innerHTML = o.pages[o.spread * 2] ?? '';
      right.innerHTML = o.pages[o.spread * 2 + 1] ?? '';
    }
  }

  /** Sayfalar: (sol) kapak + künye, (sağ) Jarvis özeti, sonra notlar ve alıntılar (sayfa başına 1-2) */
  private buildPages(o: OutBook): string[] {
    const k = o.k;
    const prog = k.sayfa && k.toplamSayfa ? Math.round((k.sayfa / k.toplamSayfa) * 100) : k.durum === 'bitti' ? 100 : null;
    const foot = (i: number, n: number) => `<div class="lb-foot">${String(i).padStart(2, '0')} / ${String(n).padStart(2, '0')}</div>`;
    const J = k.jarvis && !k.jarvis.bilinmiyor ? k.jarvis : null;
    const meta = [J?.tur, J?.yil].filter(Boolean).join(' · ');
    const p0 = `<div class="lb-in"><div class="lb-h">KİTAPLIK · KÜNYE</div>
      <img class="lb-thumb" src="${o.coverSrc}" alt="">
      <h2>${esc(k.ad || 'Okunamayan kitap')}</h2>
      ${k.yazar ? `<p class="lb-au">${esc(k.yazar)}</p>` : ''}
      ${meta ? `<p class="lb-small">${esc(meta.toLocaleUpperCase('tr'))}</p>` : ''}
      <span class="lb-chip ${k.durum}">${k.durum.toLocaleUpperCase('tr')}</span>
      ${prog !== null ? `<div class="lb-bar"><i style="width:${prog}%"></i></div><p class="lb-small">${k.sayfa ? `s. ${k.sayfa}${k.toplamSayfa ? ` / ${k.toplamSayfa}` : ''} · ` : ''}%${prog}</p>` : ''}
      __FOOT0__</div>`;
    const ozet = k.ozet
      ? `<p class="lb-text">${esc(k.ozet)}</p>`
      : o.fillLoading ? '<p class="lb-text dim"><span class="lb-spin"></span> Jarvis sayfaları dolduruyor…</p>'
        : k.jarvis?.bilinmiyor ? '<p class="lb-text dim">Jarvis bu kitabı tanımıyor; sayfa uydurmadı. Adı doğru mu?</p>'
          : `<p class="lb-text dim">${k.ad ? 'Bu kitap için özet yok.' : 'Kitabın adı bilinmiyor. "Jarvis, bu kitabın adı …" deyin ya da K ile adını yazın.'}</p>`;
    const p1 = `<div class="lb-in"><div class="lb-h">JARVIS · ÖZET</div>${ozet}<p class="lb-hint">👍 basılı tut: sesli oku</p>__FOOT1__</div>`;
    // Jarvis'in kitap defteri: ana fikirler (3'erli), yazar ve temalar, neden okumalı ve raftan benzerler
    const jp: string[] = [];
    if (J) {
      const ideas = J.anaFikirler;
      for (let i = 0; i < ideas.length; i += 3) {
        jp.push(`<div class="lb-in"><div class="lb-h">JARVIS · ANA FİKİRLER${ideas.length > 3 ? ` ${i / 3 + 1}/${Math.ceil(ideas.length / 3)}` : ''}</div><ol class="lb-ideas" start="${i + 1}">${ideas
          .slice(i, i + 3).map(x => `<li>${esc(x)}</li>`).join('')}</ol>__FOOT__</div>`);
      }
      if (J.yazarHakkinda || J.temalar.length) {
        jp.push(`<div class="lb-in"><div class="lb-h">JARVIS · YAZAR VE TEMALAR</div>${J.yazarHakkinda ? `<p class="lb-text">${esc(J.yazarHakkinda)}</p>` : ''}${J.temalar.length ? `<div class="lb-tags">${J.temalar.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}__FOOT__</div>`);
      }
      if (J.nedenOku || J.kimeUygun || J.benzer.length) {
        jp.push(`<div class="lb-in"><div class="lb-h">JARVIS · NEDEN OKUMALI</div>${J.nedenOku ? `<p class="lb-text">${esc(J.nedenOku)}</p>` : ''}${J.kimeUygun ? `<p class="lb-text dim">${esc(J.kimeUygun)}</p>` : ''}${J.benzer.length ? `<div class="lb-sub">RAFINIZDAN BENZERLER</div><ul class="lb-similar">${J.benzer.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}__FOOT__</div>`);
      }
    } else if (o.fillLoading) {
      jp.push('<div class="lb-in"><div class="lb-h">JARVIS · KİTAP DEFTERİ</div><p class="lb-text dim"><span class="lb-spin"></span> Ana fikirler, yazar ve rafınızdan benzer kitaplar yazılıyor…</p>__FOOT__</div>');
    }
    const items = [...k.notlar.map(t => ({ t: 'NOT', x: t })), ...k.alintilar.map(t => ({ t: 'ALINTI', x: t }))];
    const rest: string[] = [];
    if (!items.length) rest.push('<div class="lb-in"><div class="lb-h">NOTLARIM</div><p class="lb-text dim">Henüz not yok.</p><p class="lb-hint">Kitap açıkken: "Jarvis, not al: …" ya da "alıntı ekle: …"</p>__FOOT__</div>');
    for (let i = 0; i < items.length; i += 2) {
      const chunk = items.slice(i, i + 2);
      rest.push(`<div class="lb-in"><div class="lb-h">${chunk.every(c => c.t === 'ALINTI') ? 'ALINTILAR' : 'NOTLARIM'}</div>${chunk
        .map(c => `<div class="lb-note ${c.t === 'ALINTI' ? 'q' : ''}"><em>${c.t}</em><p>${c.t === 'ALINTI' ? `“${esc(c.x)}”` : esc(c.x)}</p></div>`)
        .join('')}__FOOT__</div>`);
    }
    const pages = [p0, p1, ...jp, ...rest];
    if (pages.length % 2) pages.push('<div class="lb-in"><div class="lb-h">&nbsp;</div><div class="lb-end">◈</div>__FOOT__</div>');
    const n = pages.length;
    return pages.map((p, i) => p.replace(/__FOOT\d?__/, foot(i + 1, n)));
  }

  // ---------------------------------------------------------------- Tarama sahnesi

  scanStart() { this.scan = { at: performance.now(), doneAt: null, books: [], bulunan: 0, belirsiz: 0, error: null }; this.sfx.scanStart(); }
  scanResult(books: Kitap[], bulunan: number, belirsiz: number) {
    const s = this.scan ?? { at: performance.now(), doneAt: null, books: [], bulunan: 0, belirsiz: 0, error: null };
    this.scan = { ...s, doneAt: performance.now(), books, bulunan, belirsiz };
  }
  scanFail(msg: string) { if (this.scan) { this.scan.error = msg; this.scan.doneAt = performance.now(); } }
  get scanning() { return !!this.scan && this.scan.doneAt === null; }

  // ---------------------------------------------------------------- Kamera kıpırdadı mı

  private motionCheck(now: number) {
    if (!this.ref?.kucukResim || now - this.lastMotion < 3000 || this.video.readyState < 2 || !this.video.videoWidth) return;
    this.lastMotion = now;
    const v = this.video;
    const ratio = v.videoWidth / v.videoHeight, refRatio = this.ref.genislik / this.ref.yukseklik;
    let moved = Math.abs(ratio - refRatio) > 0.02;
    if (!moved) {
      try {
        const r = thumbStill(this.ref.kucukResim, thumbOf(v));
        if (r.conf < MIN_CONF) return; // kadraj kapalı/karanlık: karar verme
        moved = r.still < STILL_LIMIT;
      } catch { return; }
    }
    // Tek ölçüm yetmez (kadraja biri girip çıkabilir): iki ölçüm üst üste
    this.movedN = moved ? this.movedN + 1 : 0;
    if (this.movedN >= 2 && !this.moved) this.sfx.tick(0.2);
    this.moved = this.movedN >= 2;
  }

  // ---------------------------------------------------------------- Çizim (raf katmanı)

  render(now: number) {
    const g = this.g, { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    this.ensureRects();

    // Boşluk: kitap çekilince rafta kalan karanlık yer (içe doğru koyulaşan degrade)
    for (const [id, gp] of this.gaps) {
      if (gp.closing) { gp.a -= 0.06; if (gp.a <= 0) { this.gaps.delete(id); continue; } }
      this.drawGap(g, this.rects.get(id) ?? gp.rect, gp.a);
    }

    // Tutulan kitap: yerinden hafifçe dışarı çıkmış sırt (gerilim), titreşen çerçeve
    if (this.faz === 'tutuldu' && this.sel && this.grabSpine) {
      const r = this.rects.get(this.sel)!;
      const k = Math.min(1, this.tension);
      this.drawGap(g, r, k * 0.9);
      const jx = (Math.random() - 0.5) * 2.4 * (0.4 + k), jy = (Math.random() - 0.5) * 2.4 * (0.4 + k);
      const lift = 1 + k * 0.12;
      const dy = -k * r.h * 0.04;
      g.save();
      g.translate(r.x + r.w / 2 + jx, r.y + r.h / 2 + jy + dy);
      g.scale(lift, lift);
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 14 * k; g.shadowOffsetY = 6 * k;
      g.drawImage(this.grabSpine, -r.w / 2, -r.h / 2, r.w, r.h);
      g.restore();
      this.outline(g, { x: r.x + jx - (lift - 1) * r.w / 2, y: r.y + jy + dy - (lift - 1) * r.h / 2, w: r.w * lift, h: r.h * lift }, CYAN, 0.9 + 0.1 * Math.sin(now / 40));
    }

    // Seçili kitap: kenar parıltısı + üstünde HUD etiketi
    if (this.faz === 'secili' && this.sel) {
      const r = this.rects.get(this.sel), k = this.books.find(b => b.id === this.sel);
      if (r && k) {
        const pulse = 0.75 + 0.25 * Math.sin(now / 160);
        g.fillStyle = `rgba(${AMBER},${0.1 * pulse})`;
        g.fillRect(r.x, r.y, r.w, r.h);
        this.outline(g, r, AMBER, pulse);
        this.label(g, r, shortLabel(k), AMBER);
      }
    }
    // Aday (200 ms dolmadan): ince çizgi
    if (this.cand && this.faz !== 'tutuldu') {
      const r = this.rects.get(this.cand);
      if (r) { g.strokeStyle = `rgba(${AMBER},0.45)`; g.lineWidth = 1; g.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }
    }

    // Nişangâh: parmak ucunun rafta nereye düştüğü (kitap dışarıdayken yok)
    if (!this.out && this.faz !== 'tutuldu') {
      for (const p of this.pointers) {
        g.save();
        g.strokeStyle = `rgba(0,0,0,0.55)`; g.lineWidth = 3;
        g.beginPath(); g.arc(p.x, p.y, 7, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = `rgba(${this.sel ? AMBER : CYAN},0.95)`; g.lineWidth = 1.5;
        g.beginPath(); g.arc(p.x, p.y, 7, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        g.moveTo(p.x - 13, p.y); g.lineTo(p.x - 9, p.y); g.moveTo(p.x + 9, p.y); g.lineTo(p.x + 13, p.y);
        g.moveTo(p.x, p.y - 13); g.lineTo(p.x, p.y - 9); g.moveTo(p.x, p.y + 9); g.lineTo(p.x, p.y + 13);
        g.stroke();
        g.restore();
      }
    }

    // Rafa dönen kitabın sırtı kısa bir an parlar
    this.flashes = this.flashes.filter(f => now - f.at < 700);
    for (const f of this.flashes) {
      const a = 1 - (now - f.at) / 700;
      g.fillStyle = `rgba(${CYAN},${0.35 * a})`;
      g.fillRect(f.rect.x, f.rect.y, f.rect.w, f.rect.h);
      this.outline(g, f.rect, CYAN, a);
    }

    if (this.scan) this.drawScan(g, now);
  }

  private drawGap(g: CanvasRenderingContext2D, r: Rect, a: number) {
    if (a <= 0) return;
    g.save();
    g.globalAlpha = a;
    // Arka panelin gölgesi: kenarlarda biraz açık, içe doğru koyu
    const gx = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
    gx.addColorStop(0, 'rgba(28,22,16,0.78)');
    gx.addColorStop(0.5, 'rgba(6,5,4,0.94)');
    gx.addColorStop(1, 'rgba(28,22,16,0.78)');
    g.fillStyle = gx;
    g.fillRect(r.x, r.y, r.w, r.h);
    const gy = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    gy.addColorStop(0, 'rgba(0,0,0,0.55)');
    gy.addColorStop(0.25, 'rgba(0,0,0,0)');
    gy.addColorStop(0.9, 'rgba(0,0,0,0)');
    gy.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = gy;
    g.fillRect(r.x, r.y, r.w, r.h);
    // Komşu kitapların kenarına düşen gölge
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(r.x - 2, r.y, 2, r.h); g.fillRect(r.x + r.w, r.y, 2, r.h);
    g.restore();
  }

  private outline(g: CanvasRenderingContext2D, r: Rect, rgb: string, a: number) {
    g.save();
    g.lineJoin = 'round';
    g.strokeStyle = `rgba(0,0,0,${0.55 * a})`; g.lineWidth = 4;
    g.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    g.shadowColor = `rgba(${rgb},${a})`; g.shadowBlur = 16;
    g.strokeStyle = `rgba(${rgb},${a})`; g.lineWidth = 2;
    g.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    g.restore();
  }

  private label(g: CanvasRenderingContext2D, r: Rect, text: string, rgb: string) {
    g.save();
    g.font = `700 ${clamp(this.W / 85, 13, 19)}px Rajdhani, "JetBrains Mono", sans-serif`;
    const tw = g.measureText(text).width;
    const above = r.y > 70;
    const cx = clamp(r.x + r.w / 2, tw / 2 + 24, this.W - tw / 2 - 24);
    const y = above ? r.y - 34 : r.y + r.h + 34;
    g.strokeStyle = `rgba(${rgb},0.8)`; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(r.x + r.w / 2, above ? r.y - 3 : r.y + r.h + 3); g.lineTo(cx, y + (above ? 12 : -12)); g.stroke();
    g.fillStyle = 'rgba(3,10,16,0.82)';
    g.beginPath(); g.roundRect(cx - tw / 2 - 12, y - 13, tw + 24, 26, 6); g.fill();
    g.strokeStyle = `rgba(${rgb},0.9)`; g.stroke();
    g.fillStyle = `rgb(${rgb})`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = `rgba(${rgb},0.8)`; g.shadowBlur = 8;
    g.fillText(text, cx, y + 1);
    g.restore();
  }

  private banner(g: CanvasRenderingContext2D, text: string, rgb: string, y: number) {
    g.save();
    g.font = `700 ${clamp(this.W / 70, 15, 22)}px Rajdhani, sans-serif`;
    const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(3,10,16,0.82)';
    g.beginPath(); g.roundRect(this.W / 2 - tw / 2 - 20, y - 20, tw + 40, 40, 20); g.fill();
    g.strokeStyle = `rgba(${rgb},0.9)`; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = `rgb(${rgb})`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = `rgba(${rgb},0.8)`; g.shadowBlur = 10;
    g.fillText(text, this.W / 2, y + 1);
    g.restore();
  }

  /**
   * Tarama: cevap beklenirken tarama çizgisi raf boyunca gidip gelir; sonuç gelince son bir geçişte bulunan her
   * sırt çizgi üstünden geçerken parlar ve adı sırt boyunca yazılır; sonunda özet ("14 kitap tanındı · 3 belirsiz").
   */
  private drawScan(g: CanvasRenderingContext2D, now: number) {
    const s = this.scan!;
    const { W, H } = this;
    const zone = this.zoneRect ?? { x: W * 0.04, y: H * 0.06, w: W * 0.92, h: H * 0.88 };
    const SWEEP = 2600;
    let lineX: number | null = null;
    if (s.doneAt === null) {
      const t = ((now - s.at) % 1700) / 1700;
      lineX = zone.x + zone.w * easeInOut(t);
      this.banner(g, `KİTAPLIK TARANIYOR · ${((now - s.at) / 1000).toFixed(1)} sn`, CYAN, 70);
    } else if (!s.error) {
      const t = (now - s.doneAt) / SWEEP;
      if (t < 1) lineX = zone.x + zone.w * t;
      const vw = this.video.videoWidth || 1920, vh = this.video.videoHeight || 1080;
      const map = makeMapper(vw, vh, W, H);
      const lx = lineX ?? Infinity;
      for (const b of s.books) {
        if (!b.kutu) continue;
        const a = map(b.kutu[1], b.kutu[0]), c = map(b.kutu[3], b.kutu[2]);
        const r = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
        if (r.x + r.w / 2 > lx) continue;
        // Çizgi geçtiği an parlak, sonra sakin bir çerçeve
        const since = lineX === null ? 9 : (lx - (r.x + r.w / 2)) / (zone.w / (SWEEP / 1000));
        const fresh = clamp(1 - since / 0.5, 0, 1);
        const col = b.ad ? CYAN : AMBER;
        // Sonuç kısa süre kalır; bir kitap seçilince hemen çekilir (etiketle çakışmasın)
        const fade = this.faz !== 'bos' ? 0 : lineX === null ? clamp(1 - (now - s.doneAt - SWEEP) / 1800, 0, 1) : 1;
        if (fade <= 0) continue;
        g.save();
        g.globalAlpha = fade;
        g.fillStyle = `rgba(${col},${0.08 + fresh * 0.35})`;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = `rgba(${col},${0.6 + fresh * 0.4})`;
        g.lineWidth = b.ad ? 1.2 : 1;
        if (!b.ad) g.setLineDash([4, 3]);
        g.strokeRect(r.x, r.y, r.w, r.h);
        g.setLineDash([]);
        // Ad sırt boyunca (dar sütunda üst üste binmez)
        const name = b.ad ? b.ad.toLocaleUpperCase('tr') : '?';
        const typed = name.slice(0, Math.ceil(name.length * clamp(since / 0.35, 0, 1)));
        g.translate(r.x + r.w / 2, r.y + 4);
        g.rotate(Math.PI / 2);
        g.font = `700 ${clamp(r.w * 0.55, 9, 15)}px Rajdhani, sans-serif`;
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,0.65)';
        const tw = Math.min(g.measureText(typed).width, r.h - 8);
        g.fillRect(-2, -clamp(r.w * 0.35, 6, 10), tw + 4, clamp(r.w * 0.7, 12, 20));
        g.fillStyle = `rgb(${col})`;
        g.fillText(typed, 0, 1, r.h - 8);
        g.restore();
      }
      if (lineX === null) {
        const a = clamp(1 - (now - s.doneAt - SWEEP - 2500) / 1500, 0, 1);
        if (a <= 0) { this.scan = null; return; }
        g.save(); g.globalAlpha = a;
        this.banner(g, `${s.bulunan} KİTAP TANINDI${s.belirsiz ? ` · ${s.belirsiz} BELİRSİZ` : ''}`, CYAN, 70);
        g.restore();
      }
    } else {
      const a = clamp(1 - (now - s.doneAt) / 4000, 0, 1);
      if (a <= 0) { this.scan = null; return; }
      g.save(); g.globalAlpha = a; this.banner(g, `TARAMA OLMADI · ${s.error}`.slice(0, 90), AMBER, 70); g.restore();
    }
    if (lineX !== null) {
      // Tarama çizgisi + arkasında solan ışık
      const tail = g.createLinearGradient(lineX - 140, 0, lineX, 0);
      tail.addColorStop(0, `rgba(${CYAN},0)`); tail.addColorStop(1, `rgba(${CYAN},0.22)`);
      g.fillStyle = tail;
      g.fillRect(lineX - 140, zone.y, 140, zone.h);
      g.save();
      g.shadowColor = `rgb(${CYAN})`; g.shadowBlur = 18;
      g.fillStyle = `rgba(${CYAN},0.95)`;
      g.fillRect(lineX - 1.5, zone.y, 3, zone.h);
      g.restore();
      if (s.doneAt !== null && Math.random() < 0.3) this.fx.bookDust(lineX, zone.y + Math.random() * zone.h, 2, 4, 'cyan');
    }
  }

  /** Kitaplık ayardan kapatıldı: dışarıdaki kitap kaybolur, raf katmanı temizlenir */
  reset() {
    if (this.out) this.hooks.onOpenChange(null);
    this.stage.replaceChildren();
    this.out = null; this.faz = 'bos'; this.sel = null; this.cand = null; this.held = null;
    this.gaps.clear(); this.flashes = []; this.scan = null; this.pointers = [];
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  dispose() { this.stage.replaceChildren(); this.out = null; }
}

/** Sunucudaki kapak (Open Library ya da yüklenen). Bulunamazsa null. */
export function loadCover(k: Kitap): Promise<HTMLImageElement | null> {
  if (k.id.startsWith('demo-')) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 10 ? img : null);
    img.onerror = () => resolve(null);
    img.src = coverUrl(k.id, k.kapak ?? '');
  });
}
