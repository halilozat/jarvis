// Uzay Laboratuvarı · yaşam izi taraması: animasyon. Hesap life.ts'te; burada yalnızca sahne ve zamanlama.
// 8 adım (her biri Jarvis'in bir cümlesiyle): odak → yüzey taraması → spektrum → yer altı → kontrol listesi → ESI →
// bugüne kadar bulunanlar → sonuç. Adım, en kısa süresi dolup Jarvis cümlesini bitirince ilerler (cümleler önceden
// yüklenir). Jarvis'in sohbet aracıyla başlarsa (sürücü modu) adımları cevabın sahneleri ilerletir; yerel ses yok.
// Ekranda kalıcı not: tarama yaşam bulunduğunu değil, koşulların uygunluğunu gösterir.
import type { Sfx } from '../sfx';
import { VERI } from './data';
import type { Govde } from './facts';
import { CYAN, DIM, TEXT, guvenliAlan } from './labHud';
import { callout, dataColumn, decode, drawBorder, easeOut, gearRing, hexGrid, lockBrackets, mechPanel, odometer, reticle, segArcs, stamp, sweep } from './mech';
import { bolgeSoz, type Madde, type Tarama } from './life';
import { Body, colorsOf, type BodyRenderer } from './planets';
import { drawSection } from './section';
import { sayi } from './sentences';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const NOT = 'Yaşam bulunduğunu değil, yaşam için koşulların uygunluğunu gösterir.';
const ADIM_AD = ['ODAKLANIYOR', 'YÜZEY TARAMASI', 'SPEKTRUM', 'YER ALTI', 'KONTROL LİSTESİ', 'DÜNYA BENZERLİK ENDEKSİ', 'BUGÜNE KADAR BULUNANLAR', 'SONUÇ'];
/** Adımların en kısa süreleri (ms): normal ~16 sn, hızlı ~7 sn */
const SURE = [1300, 2000, 2200, 1700, 2600, 1700, 2400, 2600];
const SURE_HIZLI = [600, 900, 1000, 0, 1300, 900, 1000, 1300];
const BITIS = 1200;

/** Temsili spektrum: gazların kızılötesi soğurma bantlarının yaklaşık merkezleri (µm) */
const BANT: Record<string, number[]> = {
  'CO₂': [4.3, 15], 'H₂O': [1.4, 1.9, 2.7, 6.3], 'CH₄': [1.7, 2.3, 3.3, 7.7], 'O₂': [0.76, 1.27], 'O₃': [9.6], 'CO': [2.35, 4.7], 'H₂': [2.12],
};
const DURUM_RENK: Record<string, string> = { 'KANITLANDI': 'rgb(120,255,170)', 'GÜÇLÜ İŞARET': CYAN, 'TARTIŞMALI': 'rgb(255,200,90)', 'BULUNMADI': 'rgb(170,180,190)' };
const ISARET = (m: Madde) => (m.durum === 'evet' ? ['✓', 'rgb(120,255,170)'] : m.durum === 'hayir' ? ['✗', 'rgb(255,120,120)'] : ['?', 'rgb(255,200,90)']);

export interface ScanHooks {
  say(text: string): Promise<void> | void;
  preload?(lines: string[]): void;
  /** Bir cismin taraması bitti (hafızaya yazılır) */
  done?(t: Tarama): void;
}

export interface ScanItem { t: Tarama; from: { x: number; y: number; r: number }; colors: Uint8ClampedArray | null }

interface Cur {
  it: ScanItem; body: Body; step: number; stepAt: number; spoke: boolean; speechDone: boolean;
  sparks: { x: number; y: number; at: number }[]; cracks: number[][][]; plumes: { x: number; y: number; vx: number; vy: number; at: number }[];
  checkShown: number; esiSound: boolean; doneAt: number | null;
  startAt: number; locked: boolean; itemAt: number[];
}

export class LifeScan {
  active = false;
  /** Oda modu: kullanıcının odası görünür kalsın (arka plan hafif karartılır, paneller koyu) */
  oda = true;
  private items: ScanItem[] = [];
  private idx = 0;
  private hizli = false;
  private surucu = false;
  private drive = -1;
  private driveDone = false;
  /** Bu taramadan sonra gelen ilk sahne görüldü mü (önceki cevabın "bitti" durumu taramayı atlatmasın) */
  private driveSeen = false;
  private cur: Cur | null = null;
  private results: Tarama[] = [];
  private compareAt: number | null = null;
  private fade = 0;
  private resolve: (() => void) | null = null;
  private frame = 0;
  private lastTick = 0;
  /** Bir kez çalan sesler (damga, kilit) */
  private stamped = new Set<string>();
  private bodyCv: HTMLCanvasElement | null = null;
  private bodyG: CanvasRenderingContext2D | null = null;
  private bodyR = 0;
  private sfx: Sfx;
  private hooks: ScanHooks;
  constructor(sfx: Sfx, hooks: ScanHooks) { this.sfx = sfx; this.hooks = hooks; }

  /** Tarama(lar)ı başlat; hepsi bitince çözülür */
  start(items: ScanItem[], hizli: boolean, surucu: boolean, now: number): Promise<void> {
    this.resolve?.();
    this.items = items; this.idx = 0; this.hizli = hizli || items.length > 1; this.surucu = surucu;
    this.drive = -1; this.driveDone = false; this.driveSeen = false; this.results = []; this.compareAt = null;
    this.active = true;
    if (!surucu) this.hooks.preload?.(items.flatMap(i => (this.hizli ? i.t.hizliCumleler : i.t.cumleler).filter(Boolean)));
    this.begin(now);
    return new Promise(r => { this.resolve = r; });
  }

  stop() { this.active = false; this.cur = null; this.resolve?.(); this.resolve = null; }

  /** Sürücü modu: Jarvis'in cevabındaki sahne sırası adımı belirler */
  driveTo(i: number, bitti: boolean) {
    if (i >= 0 && !bitti) this.driveSeen = true;
    this.drive = i;
    this.driveDone = bitti && this.driveSeen;
  }

  private begin(now: number) {
    const it = this.items[this.idx];
    const g = it.t.cisim as Govde;
    const body = new Body(g, it.from.x, it.from.y, it.from.r, now);
    body.form = 1;
    if (it.colors) { body.ownColors = true; body.colors = it.colors; } else body.colors = colorsOf(g);
    body.light = [-0.55, 0.35, 0.76];
    this.cur = { it, body, step: 0, stepAt: now, spoke: false, speechDone: false, sparks: [], cracks: cracksFor(it.t), plumes: [], checkShown: 0, esiSound: false, doneAt: null, startAt: now, locked: false, itemAt: [] };
    this.stamped.clear();
  }

  private say(text: string, c: Cur) {
    c.spoke = true;
    if (!text || this.surucu) { c.speechDone = true; return; }
    c.speechDone = false;
    const r = this.hooks.say(text);
    if (r instanceof Promise) r.then(() => { c.speechDone = true; }, () => { c.speechDone = true; });
    else c.speechDone = true;
  }

  update(now: number) {
    if (!this.active) { this.fade = Math.max(0, this.fade - 0.06); return; }
    this.fade = Math.min(1, this.fade + 0.06);
    if (this.compareAt !== null) {
      if (now - this.compareAt > 7000) this.finish();
      return;
    }
    const c = this.cur;
    if (!c) return;
    const t = c.it.t;
    const sure = this.hizli ? SURE_HIZLI : SURE;
    // Yer altı adımı: okyanus yoksa atlanır
    if (c.step === 3 && (t.okyanusKatman < 0 || sure[3] === 0)) { c.step = 4; c.stepAt = now; c.spoke = false; }
    if (!c.spoke) {
      this.say((this.hizli ? t.hizliCumleler : t.cumleler)[c.step], c);
      this.sfx.servo();
      if (c.step === 1) this.sfx.scanBeam(sure[1] / 1000);
    }
    // Kontrol listesi maddeleri sırayla
    if (c.step === 4) {
      const n = t.maddeler.length, k = Math.min(n, Math.floor(((now - c.stepAt) / (sure[4] * 0.85)) * n) + 1);
      while (c.checkShown < k) { this.sfx.check(t.maddeler[c.checkShown].durum); c.checkShown++; }
    }
    if (c.step === 5 && !c.esiSound) { c.esiSound = true; this.sfx.esiRise(1.2, t.esi); }
    // İlerleme
    if (this.surucu) {
      const want = this.driveDone ? 7 : clamp(this.drive, 0, 7);
      if (want > c.step) { c.step = want; c.stepAt = now; c.spoke = false; }
      if (this.driveDone && c.step === 7 && now - c.stepAt > 5000) this.next(now);
      return;
    }
    if (c.speechDone && now - c.stepAt >= sure[c.step]) {
      if (c.step < 7) { c.step++; c.stepAt = now; c.spoke = false; }
      else {
        c.doneAt ??= now;
        if (now - c.doneAt > BITIS) this.next(now);
      }
    }
  }

  private next(now: number) {
    this.results.push(this.cur!.it.t);
    this.hooks.done?.(this.cur!.it.t);
    this.idx++;
    if (this.idx < this.items.length) { this.begin(now); return; }
    if (this.items.length > 1) {
      this.compareAt = now;
      if (!this.surucu) this.hooks.say(bolgeSoz(this.results));
      this.sfx.solar();
      return;
    }
    this.finish();
  }

  private finish() {
    this.active = false;
    this.cur = null;
    this.resolve?.(); this.resolve = null;
  }

  // ---------------------------------------------------------------- Çizim (mekanik HUD)

  render(g: CanvasRenderingContext2D, now: number, W: number, H: number, renderer: BodyRenderer, dpr: number) {
    if (this.fade <= 0.01) return;
    this.frame++;
    const S = guvenliAlan(W, H);
    g.save();
    g.globalAlpha = this.fade;
    if (this.oda) {
      // Odayı kapatma: kenarlara doğru koyulaşan hafif perde, sağdaki panel bölgesi biraz daha koyu
      const gr = g.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, 'rgba(2,8,14,0.35)'); gr.addColorStop(0.45, 'rgba(2,8,14,0.18)'); gr.addColorStop(1, 'rgba(2,8,14,0.55)');
      g.fillStyle = gr;
    } else g.fillStyle = 'rgba(2,6,10,0.88)';
    g.fillRect(-20, -20, W + 40, H + 40);
    hexGrid(g, W, H, (this.oda ? 0.035 : 0.05) * this.fade);
    // Kenarlarda kayan veri sütunları ve cetveller
    dataColumn(g, 18, S.y0 + 40, S.y1 - S.y0 - 40, now, 3, 'left');
    dataColumn(g, W - 18, S.y0 + 40, S.y1 - S.y0 - 40, now, 11, 'right');
    this.ruler(g, S.x0 + 60, S.x1 - 60, S.y0 + 50, now);
    this.ruler(g, S.x0 + 60, S.x1 - 60, S.y1 + 6, -now);
    // Kalıcı not (alt orta)
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(223,251,255,0.92)'; g.font = '600 17px Rajdhani, sans-serif';
    g.fillText(NOT, W / 2, S.y1 + 38);
    g.restore();
    if (this.compareAt !== null) { this.renderCompare(g, now, S); return; }
    const c = this.cur;
    if (!c) return;
    const t = c.it.t;
    const sure = this.hizli ? SURE_HIZLI : SURE;
    const age = now - c.stepAt;
    const p = age / Math.max(1, sure[c.step] || 1);
    const bx = S.x0 + (S.x1 - S.x0) * 0.27, by = (S.y0 + S.y1) / 2 + 22;
    const R = Math.min((S.y1 - S.y0) * 0.28, (S.x1 - S.x0) * 0.16);
    // Başlık: harf harf çözülür
    g.save();
    g.globalAlpha = this.fade;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = CYAN; g.font = '700 32px Rajdhani, sans-serif';
    const baslik = `YAŞAM İZİ TARAMASI · ${t.ad.toLocaleUpperCase('tr')}`;
    g.fillText(decode(baslik, (now - c.startAt) / 700, 5), W / 2, S.y0 - 6);
    g.fillStyle = DIM; g.font = '600 15px Rajdhani, sans-serif';
    const seq = this.items.length > 1 ? `  ·  HEDEF ${this.idx + 1}/${this.items.length}` : '';
    g.fillText(`SCN-${t.cisim.slice(0, 3).toLocaleUpperCase('tr')}-${String(this.frame % 1000).padStart(3, '0')}${seq}${t.girdi.degisti ? '  ·  YERİ DEĞİŞTİRİLDİ' : ''}`, W / 2, S.y0 + 30);
    g.restore();

    // Gövde: önce sahnedeki yerinden buraya uçar, kıskaçlar ekranın köşelerinden gelip kilitlenir
    const k0 = c.step === 0 ? easeOut(p * 1.3) : 1;
    const x = c.it.from.x + (bx - c.it.from.x) * k0, y = c.it.from.y + (by - c.it.from.y) * k0;
    const r = c.it.from.r + (R - c.it.from.r) * k0;
    const lockT = c.step === 0 ? clamp((p - 0.15) / 0.55, 0, 1) : 1;
    if (lockT >= 1 && !c.locked) { c.locked = true; this.sfx.lock(); }
    g.save();
    g.globalAlpha = this.fade;
    if (c.step >= 1) sweep(g, x, y, r * 1.45, now, c.step === 1 ? 1 : 0.4);
    reticle(g, x, y, r, now, c.step === 0 ? (p - 0.6) / 0.4 : 1);
    if (c.step === 3 && t.okyanusKatman >= 0) {
      drawSection(g, c.body, t.cisim, x, y, r, easeOut(p * 1.4), renderer, now, dpr);
      this.oceanGlow(g, t, x, y, r, now, easeOut(p * 1.4));
    } else this.drawBody(g, c, x, y, r, renderer, now, dpr);
    if (t.basinc && t.basinc > 0.05) {
      const gr = g.createRadialGradient(x, y, r * 0.98, x, y, r * 1.1);
      gr.addColorStop(0, t.cisim === 'titan' ? 'rgba(230,160,70,0.45)' : 'rgba(120,180,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.1, 0, Math.PI * 2); g.fill();
    }
    if (c.step >= 1 && c.step !== 3) this.surface(g, c, x, y, r, now, c.step === 1 ? clamp(p, 0, 1) : 1);
    lockBrackets(g, x, y, r, lockT, W, H, now);
    // Gövdeden dışarı lider çizgileri: o adımın ölçümleri
    this.callouts(g, c, x, y, r, age);
    g.restore();

    // Sağ panel: adımın içeriği, mekanik çerçevede
    const px = S.x0 + (S.x1 - S.x0) * 0.53, pw = S.x1 - px, py = S.y0 + 70, ph = S.y1 - py - 4;
    g.save();
    g.globalAlpha = this.fade;
    // Panel yüksekliği içeriğe göre (boş alan kalmasın)
    const nk = Math.min(4, t.kesifler.length), ch = Math.min(104, 450 / Math.max(1, nk));
    const icerik = [330, 250, 320, 330, 50 + t.maddeler.length * Math.min(72, 430 / t.maddeler.length), 400, 46 + nk * (ch + 10), 370][c.step];
    const ph2 = Math.min(ph, icerik);
    mechPanel(g, px - 14, py - 10, pw + 28, ph2, age, ADIM_AD[c.step], `MOD-0${c.step + 1}`, c.step, 8);
    const iy = py + 34;
    const typing = age < 1400;
    if (typing && now - this.lastTick > 60 && age > 300) { this.lastTick = now; this.sfx.typeTick(); }
    if (age > 260) {
      if (c.step === 0) this.lines(g, px, iy + 10, pw, age, [
        ['HEDEF', t.ad.toLocaleUpperCase('tr')], ["GÜNEŞ'E UZAKLIK", `${sayi(t.girdi.r, 2)} AU`], ['YÜZEY SICAKLIĞI', `≈ ${sayi(Math.round(t.girdi.Tc))} °C`],
        ['YARIÇAP', `${sayi(VERI[t.cisim].yaricap)} km`], ['ATMOSFER', t.basinc ? `${sayi(t.basinc, 2)} bar` : 'yok / çok ince'],
      ], lockT >= 1 ? 'KİLİTLENDİ' : null, now);
      else if (c.step === 1) this.surfacePanel(g, t, px, iy, pw, clamp(p, 0, 1), age);
      else if (c.step === 2) this.spectrum(g, t, px, iy, pw, Math.min(ph, 320) - 50, clamp(p, 0, 1));
      else if (c.step === 3) this.layerInfo(g, t, px, iy + 10, pw, age);
      else if (c.step === 4) this.checklist(g, t, px, iy + 8, pw, c.checkShown, now, c);
      else if (c.step === 5) this.esiGauge(g, t, px, iy, pw, ph - 40, age, now);
      else if (c.step === 6) this.cards(g, t, px, iy + 8, pw, age);
      else if (c.step === 7) this.result(g, t, px, iy + 8, pw, age);
    }
    g.restore();
  }

  /** Gövde: büyük çizim pahalı; iki karede bir yeniden çizilir, arada önbellekten (görünür fark yok) */
  private drawBody(g: CanvasRenderingContext2D, c: Cur, x: number, y: number, r: number, renderer: BodyRenderer, now: number, dpr: number) {
    const b = c.body;
    b.yaw += 0.003;
    const S = Math.ceil(r * 2.3 * dpr);
    if (!this.bodyCv) { this.bodyCv = document.createElement('canvas'); this.bodyG = this.bodyCv.getContext('2d')!; }
    const cv = this.bodyCv, bg = this.bodyG!;
    const stale = cv.width !== S || Math.abs(this.bodyR - r) > 1 || this.frame % 2 === 0;
    if (stale) {
      if (cv.width !== S) { cv.width = S; cv.height = S; }
      bg.setTransform(1, 0, 0, 1, 0, 0);
      bg.clearRect(0, 0, S, S);
      bg.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.x = b.tx = S / dpr / 2; b.y = b.ty = S / dpr / 2; b.r = b.tr = r;
      renderer.draw(bg, b, now, dpr);
      this.bodyR = r;
    }
    g.drawImage(cv, x - S / dpr / 2, y - S / dpr / 2, S / dpr, S / dpr);
  }

  /** İnce çentikli cetvel (kayan) */
  private ruler(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, now: number) {
    g.save();
    g.strokeStyle = 'rgba(95,242,255,0.18)'; g.lineWidth = 1;
    g.beginPath();
    const off = (now / 40) % 24;
    for (let x = x0 + off; x < x1; x += 12) { const big = Math.round((x - off - x0) / 12) % 4 === 0; g.moveTo(x, y); g.lineTo(x, y + (big ? 7 : 3)); }
    g.stroke();
    g.restore();
  }

  /** Adıma göre lider çizgileri ve küçük ölçüm kutuları */
  private callouts(g: CanvasRenderingContext2D, c: Cur, x: number, y: number, r: number, age: number) {
    const t = c.it.t, v = VERI[t.cisim];
    const pts: [number, number, string, string][] = [];
    if (c.step === 1) pts.push(
      [-0.45, -0.55, 'YÜZEY ÖRNEĞİ 01', `T ≈ ${sayi(Math.round(t.girdi.Tc))} °C`],
      [0.55, 0.35, 'YÜZEY ÖRNEĞİ 02', `albedo ${sayi(v.albedo, 2)}`],
      [-0.3, 0.7, 'YÜZEY ÖRNEĞİ 03', `yoğunluk ${sayi(v.yogunluk)} kg/m³`],
    );
    else if (c.step === 2) pts.push([0.7, -0.6, 'ATMOSFER KABUĞU', t.basinc ? `${sayi(t.basinc, 2)} bar` : 'ölçülemeyecek kadar ince']);
    else if (c.step === 5) pts.push([0.6, -0.6, 'KAÇIŞ HIZI', `${sayi(v.kacis, 2)} km/s`], [-0.6, 0.6, 'YÜZEY ÇEKİMİ', `${sayi(v.cekim, 2)} m/s²`]);
    pts.forEach(([u, w, lab, sub], i) => {
      const x0 = x + u * r, y0 = y + w * r;
      const dir = u >= 0 ? 1 : -1;
      callout(g, x0, y0, x + dir * r * 1.75, y0 - 26, lab, sub, (age - 250 - i * 380) / 600);
    });
  }

  /** Satır satır yazılan bilgi listesi (harf harf çözülür); sonunda isteğe bağlı damga */
  private lines(g: CanvasRenderingContext2D, x: number, y: number, w: number, age: number, rows: [string, string][], damga: string | null, now: number) {
    g.textBaseline = 'top';
    rows.forEach(([k, v], i) => {
      const p = (age - 300 - i * 160) / 380;
      if (p <= 0) return;
      const ry = y + i * 40;
      g.fillStyle = DIM; g.font = '600 15px Rajdhani, sans-serif'; g.textAlign = 'left';
      g.fillText(k, x, ry + 6);
      g.fillStyle = TEXT; g.font = '700 24px Rajdhani, sans-serif'; g.textAlign = 'right';
      g.fillText(decode(v, p, i + 11), x + w, ry);
      g.strokeStyle = 'rgba(95,242,255,0.12)'; g.beginPath(); g.moveTo(x, ry + 34); g.lineTo(x + w * Math.min(1, p), ry + 34); g.stroke();
    });
    if (damga) {
      const sp = (age - 300 - rows.length * 160) / 260;
      stamp(g, damga, x + w * 0.5, y + rows.length * 40 + 46, sp, CYAN, 24);
      if (sp > 0 && !this.stamped.has('lock')) { this.stamped.add('lock'); this.sfx.stamp(); }
    }
    void now;
  }

  private surfacePanel(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, w: number, p: number, age: number) {
    const v = VERI[t.cisim];
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = TEXT; g.font = '700 26px Rajdhani, sans-serif';
    g.fillText(decode(v.kaya ? 'GÖRÜNÜR + KIZILÖTESİ TARAMA' : 'BULUT TEPELERİ TARANIYOR', (age - 300) / 500, 21), x, y + 10);
    // İlerleme çubuğu (bloklar)
    const n = 32;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i / n < p ? CYAN : 'rgba(95,242,255,0.12)';
      g.fillRect(x + i * (w / n), y + 54, w / n - 3, 12);
    }
    g.fillStyle = DIM; g.font = '600 15px Rajdhani, sans-serif';
    g.fillText(`ENLEM ${sayi(90 - 180 * p, 1)}°  ·  ÇİZGİ ${Math.floor(p * 360)}/360`, x, y + 76);
    g.fillStyle = TEXT; g.font = '600 19px Rajdhani, sans-serif';
    wrap(g, t.buzlu ? 'Buz yüzeyinde çatlak ağı saptandı' : t.puskurme ? 'Güney kutbunda etkin püskürmeler' : v.kaya ? 'Yüzey dokusu ve sıcaklık örnekleniyor' : 'Katı yüzey yok', w).forEach((l, i) => g.fillText(decode(l, (age - 900) / 500, 31 + i), x, y + 110 + i * 24));
  }

  /** Yüzey: tarama ışını, parlayıp sönen noktalar; buzlu yüzeyde çatlaklar, Enceladus'ta güney kutbu püskürmeleri */
  private surface(g: CanvasRenderingContext2D, c: Cur, x: number, y: number, r: number, now: number, p: number) {
    const t = c.it.t;
    const ly = y - r + 2 * r * p;
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    // Enlem-boylam ağı (tel kafes)
    g.strokeStyle = 'rgba(95,242,255,0.16)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 6; i++) { const yy = y - r + (2 * r * i) / 6, hw = Math.sqrt(Math.max(0, r * r - (yy - y) ** 2)); g.moveTo(x - hw, yy); g.lineTo(x + hw, yy); }
    for (let i = 1; i < 6; i++) { const k = -1 + (2 * i) / 6; g.ellipse(x, y, Math.abs(k) * r, r, 0, 0, Math.PI * 2); }
    g.stroke();
    if (c.cracks.length) {
      g.strokeStyle = t.cisim === 'europa' ? 'rgba(220,120,70,0.9)' : 'rgba(120,200,255,0.85)';
      g.lineWidth = Math.max(1, r * 0.012);
      g.beginPath();
      for (const cr of c.cracks) {
        for (let i = 1; i < cr.length; i++) {
          const y0 = y + cr[i - 1][1] * r, y1 = y + cr[i][1] * r;
          if (Math.max(y0, y1) > ly) continue;
          g.moveTo(x + cr[i - 1][0] * r, y0); g.lineTo(x + cr[i][0] * r, y1);
        }
      }
      g.stroke();
    }
    if (p < 1) {
      const gr = g.createLinearGradient(0, ly - 22, 0, ly + 22);
      gr.addColorStop(0, 'rgba(95,242,255,0)'); gr.addColorStop(0.5, 'rgba(95,242,255,0.8)'); gr.addColorStop(1, 'rgba(95,242,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, ly - 22, r * 2, 44);
      g.fillStyle = 'rgba(220,255,255,0.95)'; g.fillRect(x - r, ly - 1, r * 2, 2);
      if (Math.random() < 0.8) {
        const u = (Math.random() * 2 - 1) * Math.sqrt(Math.max(0, r * r - (ly - y) ** 2));
        c.sparks.push({ x: x + u, y: ly, at: now });
      }
    }
    for (const sp of c.sparks) {
      const a = 1 - (now - sp.at) / 700;
      if (a <= 0) continue;
      g.strokeStyle = `rgba(200,255,255,${a})`; g.lineWidth = 1;
      const s2 = 3 + (1 - a) * 6;
      g.strokeRect(sp.x - s2 / 2, sp.y - s2 / 2, s2, s2);
    }
    c.sparks = c.sparks.filter(sp => now - sp.at < 700);
    g.restore();
    // Işının iki ucunda kıskaç
    if (p < 1) {
      const hw = Math.sqrt(Math.max(0, r * r - (ly - y) ** 2));
      g.save(); g.strokeStyle = CYAN; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - hw - 14, ly - 6); g.lineTo(x - hw - 6, ly); g.lineTo(x - hw - 14, ly + 6); g.moveTo(x + hw + 14, ly - 6); g.lineTo(x + hw + 6, ly); g.lineTo(x + hw + 14, ly + 6); g.stroke();
      g.restore();
    }
    if (t.puskurme) {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
        c.plumes.push({ x: x + (Math.random() - 0.5) * r * 0.35, y: y + r * 0.96, vx: Math.cos(a) * (40 + Math.random() * 60), vy: Math.sin(a) * (60 + Math.random() * 90), at: now });
      }
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const q of c.plumes) {
        const age = (now - q.at) / 1000;
        if (age > 1.6) continue;
        g.fillStyle = `rgba(190,230,255,${0.5 * (1 - age / 1.6)})`;
        g.fillRect(q.x + q.vx * age, q.y + q.vy * age, 2, 2);
      }
      g.restore();
      c.plumes = c.plumes.filter(q => now - q.at < 1600);
      if (c.step === 1) this.tag(g, x, y + r * 1.25, 'GÜNEY KUTBU PÜSKÜRMELERİ');
    }
  }

  private tag(g: CanvasRenderingContext2D, x: number, y: number, s: string) {
    g.save();
    g.font = '700 16px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = CYAN; g.fillText(s, x, y);
    g.restore();
  }

  /** Kesitte okyanus katmanı parlar */
  private oceanGlow(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, r: number, now: number, open: number) {
    const L = VERI[t.cisim].katmanlar;
    const i = t.okyanusKatman, r1 = L[i].r * r, r0 = (i > 0 ? L[i - 1].r : 0) * r;
    const a1 = -Math.PI / 2 + (Math.PI / 2) * open;
    const pulse = 0.45 + 0.35 * Math.sin(now / 180);
    g.save();
    g.beginPath(); g.arc(x, y, Math.max(r1, r0 + 2), -Math.PI / 2, a1); g.arc(x, y, r0, a1, -Math.PI / 2, true); g.closePath();
    g.fillStyle = `rgba(80,180,255,${pulse})`; g.fill();
    g.restore();
    if (open > 0.6) this.tag(g, x, y + r * 1.08, 'OKYANUS');
  }

  /** Temsili spektrum: soldan sağa çizilir, gazların bantları belirip etiketlenir */
  private spectrum(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, w: number, h: number, p: number) {
    const gases = [...t.atmosfer];
    if (t.cisim === 'dunya') gases.push(['H₂O', 0.4], ['O₃', 0.0001]);
    const yok = !gases.length || (t.basinc !== null && t.basinc < 0.001);
    const lmin = Math.log(0.5), lmax = Math.log(16);
    const X = (um: number) => x + ((Math.log(um) - lmin) / (lmax - lmin)) * w;
    const dips: { um: number; depth: number; gas: string }[] = [];
    if (!yok) for (const [gas, pct] of gases) for (const um of BANT[gas] ?? []) dips.push({ um, gas, depth: clamp(0.18 + 0.1 * Math.log10(pct * 1e4 + 1), 0.15, 0.75) });
    const top = y + 30, bot = y + h - 22;
    const Y = (um: number) => {
      let v = 0.15 + 0.7 * Math.exp(-((Math.log(um) - Math.log(2.2)) ** 2) / 1.4);
      for (const d of dips) v *= 1 - d.depth * Math.exp(-((um - d.um) ** 2) / (2 * (d.um * 0.035) ** 2));
      return bot - 4 - v * (bot - top - 30);
    };
    g.save();
    g.fillStyle = DIM; g.font = '500 13px Rajdhani, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('temsili spektrum · bantlar gerçek bileşimden', x, y);
    // Izgara
    g.strokeStyle = 'rgba(95,242,255,0.08)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 6; i++) { const yy = top + ((bot - top) * i) / 6; g.moveTo(x, yy); g.lineTo(x + w, yy); }
    for (const um of [0.5, 1, 2, 5, 10, 16]) { g.moveTo(X(um), top); g.lineTo(X(um), bot); }
    g.stroke();
    g.fillStyle = DIM; g.font = '500 12px Rajdhani, sans-serif'; g.textAlign = 'center';
    for (const um of [0.5, 1, 2, 5, 10, 16]) g.fillText(`${sayi(um, um < 1 ? 1 : 0)} µm`, X(um), bot + 4);
    // Eğri ve tarayan dikey çizgi
    const end = Math.exp(lmin + (lmax - lmin) * p);
    g.strokeStyle = 'rgb(160,240,255)'; g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 240; i++) {
      const um = Math.exp(lmin + ((lmax - lmin) * i) / 240);
      if (um > end) break;
      const yy = yok ? bot - 4 - 0.5 * (bot - top - 30) : Y(um);
      if (i === 0) g.moveTo(X(um), yy); else g.lineTo(X(um), yy);
    }
    g.stroke();
    if (p < 1) { g.strokeStyle = 'rgba(95,242,255,0.6)'; g.beginPath(); g.moveTo(X(end), top); g.lineTo(X(end), bot); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    const seen = new Set<string>();
    for (const d of dips) {
      if (d.um > end) continue;
      const xx = X(d.um), yy = Y(d.um);
      g.strokeStyle = 'rgba(255,220,140,0.6)'; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(xx, yy + 4); g.lineTo(xx, top + 18); g.stroke(); g.setLineDash([]);
      const key = d.gas + Math.round(xx / 40);
      if (!seen.has(key)) {
        seen.add(key);
        g.fillStyle = 'rgba(255,225,150,0.18)'; g.font = '700 15px Rajdhani, sans-serif';
        const tw = g.measureText(d.gas).width + 10;
        g.fillRect(xx - tw / 2, top - 2, tw, 20);
        g.fillStyle = 'rgb(255,225,150)'; g.fillText(d.gas, xx, top + 16);
      }
    }
    if (yok && p > 0.5) stamp(g, 'ATMOSFER YOK / ÇOK İNCE', x + w / 2, (top + bot) / 2, (p - 0.5) * 4, 'rgb(255,200,90)', 22);
    const iz = gases.filter(([gs]) => !BANT[gs]).map(([gs]) => gs);
    if (!yok && iz.length && p > 0.9) {
      g.fillStyle = DIM; g.font = '500 13px Rajdhani, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top';
      g.fillText(`${iz.join(', ')}: bu aralıkta bant yok`, x + w, y);
    }
    g.restore();
  }

  private layerInfo(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, w: number, age: number) {
    const v = VERI[t.cisim];
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = TEXT; g.font = '700 28px Rajdhani, sans-serif';
    g.fillText(decode('YER ALTI OKYANUSU', (age - 280) / 400, 41), x, y);
    // Derinlik sütunu: katmanlar yukarıdan aşağı, okyanus parlar
    const L = [...v.katmanlar].reverse();
    const colX = x, colY = y + 50, colH = 200, colW = 46;
    let yy = colY;
    L.forEach((k, i) => {
      const inner = i + 1 < L.length ? L[i + 1].r : 0;
      const h = Math.max(12, (k.r - inner) * colH);
      const ok = /okyanus/i.test(k.ad);
      const a = clamp((age - 400 - i * 180) / 300, 0, 1);
      g.globalAlpha = a;
      g.fillStyle = ok ? `rgba(80,180,255,${0.6 + 0.3 * Math.sin(age / 160)})` : k.renk;
      g.fillRect(colX, yy, colW, h - 2);
      g.fillStyle = ok ? CYAN : TEXT; g.font = `${ok ? 700 : 600} ${ok ? 18 : 15}px Rajdhani, sans-serif`;
      g.fillText(fit(g, k.ad, w - colW - 16), colX + colW + 14, yy + Math.max(0, h / 2 - 10));
      g.globalAlpha = 1;
      yy += h;
    });
    g.fillStyle = DIM; g.font = '500 15px Rajdhani, sans-serif';
    wrap(g, t.maddeler.find(m => m.ad === 'Yer altında sıvı su')?.deger ?? '', w).forEach((l, i) => g.fillText(l, x, colY + colH + 24 + i * 20));
  }

  private checklist(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, w: number, shown: number, now: number, c: Cur) {
    g.textBaseline = 'top';
    const rowH = Math.min(72, 430 / t.maddeler.length);
    t.maddeler.slice(0, shown).forEach((m, i) => {
      const at = c.itemAt[i] ??= now;
      const a = clamp((now - at) / 380, 0, 1);
      const ry = y + i * rowH;
      const [ic, col] = ISARET(m);
      // Satır yuvası: soldan kayan çerçeve
      g.strokeStyle = 'rgba(95,242,255,0.18)'; g.lineWidth = 1;
      g.strokeRect(x - 6, ry - 6, (w + 12) * easeOut(a), rowH - 8);
      // Durum damgası (büyükten çakılır)
      g.save();
      const sc = 1 + (1 - easeOut(a)) * 1.5;
      g.translate(x + 14, ry + 16); g.scale(sc, sc);
      g.fillStyle = col; g.font = '800 30px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = Math.min(1, a * 2);
      g.fillText(ic, 0, 0);
      g.restore();
      g.textAlign = 'left';
      g.fillStyle = TEXT; g.font = '700 21px Rajdhani, sans-serif';
      g.fillText(decode(m.ad, a * 1.6, i + 51), x + 38, ry);
      g.font = '700 11px Rajdhani, sans-serif';
      const tw = g.measureText(m.etiket).width + 12;
      g.fillStyle = m.etiket === 'HESAPLANDI' ? 'rgba(95,242,255,0.2)' : 'rgba(200,200,210,0.14)';
      g.fillRect(x + w - tw, ry + 3, tw, 18);
      g.fillStyle = m.etiket === 'HESAPLANDI' ? CYAN : 'rgb(200,205,215)';
      g.textAlign = 'center'; g.fillText(m.etiket, x + w - tw / 2, ry + 6);
      g.textAlign = 'left'; g.fillStyle = DIM; g.font = '500 16px Rajdhani, sans-serif';
      g.fillText(fit(g, decode(m.deger, (a - 0.3) * 1.6, i + 71), w - 38), x + 38, ry + 26);
    });
  }

  private esiGauge(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, w: number, h: number, age: number, now: number) {
    const cx = x + w / 2, cy = y + Math.min(h, 360) * 0.4, R = Math.min(w * 0.28, 100);
    const p = clamp((age - 250) / 1300, 0, 1);
    const v = odometer(t.esi, p);
    const rot = now / 1000;
    gearRing(g, cx, cy, R + 18, rot * 0.3, 90, 5, 'rgba(95,242,255,0.4)', 15);
    segArcs(g, cx, cy, R + 34, -rot * 0.5, 3, 0.6, 2, 'rgba(95,242,255,0.35)');
    // Parçalı gösterge: 48 parça sırayla yanar
    const n = 48, lit = Math.round(n * v);
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2 + 0.01, a1 = a0 + (Math.PI * 2) / n - 0.03;
      g.strokeStyle = i < lit ? (v > 0.8 ? 'rgb(120,255,170)' : v > 0.6 ? CYAN : 'rgb(255,200,90)') : 'rgba(95,242,255,0.1)';
      g.lineWidth = 14;
      g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    }
    // Dünya = 1 işareti (tepe)
    g.fillStyle = 'rgb(120,255,170)';
    g.beginPath(); g.moveTo(cx, cy - R - 12); g.lineTo(cx - 6, cy - R - 22); g.lineTo(cx + 6, cy - R - 22); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = TEXT; g.font = '700 56px Rajdhani, sans-serif';
    g.fillText(sayi(Math.max(0, v), 2), cx, cy);
    g.fillStyle = DIM; g.font = '600 13px Rajdhani, sans-serif';
    g.fillText('ESI', cx, cy + 36);
    g.textBaseline = 'top';
    g.fillStyle = CYAN; g.font = '700 20px Rajdhani, sans-serif';
    g.fillText(decode('DÜNYA BENZERLİK ENDEKSİ', (age - 300) / 500, 61), cx, cy + R + 44);
    g.fillStyle = DIM; g.font = '500 15px Rajdhani, sans-serif';
    wrap(g, `Dünya = 1. ${t.esiNot}`, w).forEach((l, i) => g.fillText(decode(l, (age - 900) / 600, 81 + i), cx, cy + R + 72 + i * 20));
  }

  private cards(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, w: number, age: number) {
    const ks = t.kesifler.slice(0, 4);
    const ch = Math.min(104, 450 / ks.length);
    ks.forEach((k, i) => {
      const a = clamp((age - 250 - i * 420) / 380, 0, 1);
      if (a <= 0) return;
      if (a >= 1 && !this.stamped.has(`kart${i}`)) { this.stamped.add(`kart${i}`); this.sfx.stamp(); }
      const cx = x + (1 - easeOut(a)) * 160, cy = y + i * (ch + 10);
      g.save();
      g.globalAlpha *= Math.min(1, a * 1.5);
      g.fillStyle = 'rgba(3,14,22,0.9)';
      g.fillRect(cx, cy, w, ch);
      drawBorder(g, cx, cy, w, ch, a * 1.4, DURUM_RENK[k.durum], 10);
      g.fillStyle = DIM; g.font = '600 14px Rajdhani, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillText(`${k.yil} · ${k.gorev}`, cx + 14, cy + 12);
      g.fillStyle = TEXT; g.font = '600 18px Rajdhani, sans-serif';
      wrap(g, k.cumle, w - 170).slice(0, 3).forEach((l, j) => g.fillText(decode(l, (a - 0.2) * 1.8, i * 7 + j), cx + 14, cy + 34 + j * 21));
      g.restore();
      stamp(g, k.durum, cx + w - 78, cy + ch / 2, (age - 450 - i * 420) / 260, DURUM_RENK[k.durum], 15);
    });
  }

  private result(g: CanvasRenderingContext2D, t: Tarama, x: number, y: number, w: number, age: number) {
    const s = t.sonuc;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgb(120,255,170)'; g.font = '700 16px Rajdhani, sans-serif';
    g.fillText('EN UMUT VERİCİ BÖLGE', x, y);
    g.fillStyle = TEXT; g.font = '700 28px Rajdhani, sans-serif';
    const l1 = wrap(g, s.bolge, w);
    l1.forEach((l, i) => g.fillText(decode(l, (age - 300) / 600, 91 + i), x, y + 24 + i * 32));
    let yy = y + 28 + l1.length * 32;
    g.fillStyle = DIM; g.font = '500 17px Rajdhani, sans-serif';
    const l2 = wrap(g, s.neden, w);
    l2.forEach((l, i) => g.fillText(decode(l, (age - 700) / 600, 101 + i), x, yy + i * 22));
    yy += l2.length * 22 + 20;
    g.fillStyle = CYAN; g.font = '700 16px Rajdhani, sans-serif';
    g.fillText('BİR SONRAKİ ADIM', x, yy);
    g.fillStyle = TEXT; g.font = '600 19px Rajdhani, sans-serif';
    wrap(g, s.sonraki === '—' ? 'Planlanmış bir görev yok' : s.sonraki, w).forEach((l, i) => g.fillText(decode(l, (age - 1100) / 600, 111 + i), x, yy + 24 + i * 24));
    const sp = (age - 1500) / 260;
    stamp(g, `ESI ${sayi(t.esi, 2)} · ${t.maddeler.filter(m => m.durum === 'evet').length}/${t.maddeler.length} ✓`, x + w - 110, y + 290, sp, s.bolge === 'Yok' ? 'rgb(255,150,110)' : 'rgb(120,255,170)', 20);
    if (sp > 0 && !this.stamped.has('sonuc')) { this.stamped.add('sonuc'); this.sfx.stamp(); }
  }

  /** Bölge taraması sonu: karşılaştırma tablosu */
  private renderCompare(g: CanvasRenderingContext2D, now: number, S: ReturnType<typeof guvenliAlan>) {
    const rows = this.results;
    const w = Math.min(800, S.x1 - S.x0), x = (S.x0 + S.x1) / 2 - w / 2, y = S.y0 + 60;
    const age = now - this.compareAt!;
    g.save();
    g.globalAlpha = this.fade;
    g.textBaseline = 'top'; g.textAlign = 'center';
    g.fillStyle = CYAN; g.font = '700 32px Rajdhani, sans-serif';
    g.fillText(decode('BÖLGE KARŞILAŞTIRMASI', age / 600, 9), (S.x0 + S.x1) / 2, S.y0 - 6);
    mechPanel(g, x - 20, y - 14, w + 40, 60 + rows.length * 50, age, 'KARŞILAŞTIRMA', 'MOD-09', 8, 8);
    const cols = ['', 'ESI', 'Yüzeyde su', 'Yer altında su', 'Enerji', 'Organik'];
    const cx = [x, x + w * 0.34, x + w * 0.48, x + w * 0.64, x + w * 0.8, x + w * 0.92];
    g.fillStyle = DIM; g.font = '700 15px Rajdhani, sans-serif';
    cols.forEach((c, i) => { g.textAlign = i === 0 ? 'left' : 'center'; g.fillText(c, cx[i], y + 24); });
    const mark = (m?: Madde) => (m ? ISARET(m) : ['—', DIM]);
    rows.forEach((t, j) => {
      const a = clamp((age - 400 - j * 250) / 300, 0, 1);
      if (a <= 0) return;
      const ry = y + 52 + j * 46;
      g.globalAlpha = this.fade * a;
      g.textAlign = 'left'; g.fillStyle = TEXT; g.font = '700 24px Rajdhani, sans-serif';
      g.fillText(decode(t.ad, a * 1.5, j), cx[0], ry);
      g.textAlign = 'center'; g.font = '700 22px Rajdhani, sans-serif';
      g.fillText(sayi(t.esi, 2), cx[1], ry);
      const ms = [t.maddeler.find(m => m.ad === 'Yüzeyde sıvı su'), t.maddeler.find(m => m.ad === 'Yer altında sıvı su'),
        t.maddeler.filter(m => m.ad.startsWith('Enerji')).sort((p, q) => (p.durum === 'evet' ? -1 : 1) - (q.durum === 'evet' ? -1 : 1))[0],
        t.maddeler.find(m => m.ad.startsWith('Temel elementler'))];
      ms.forEach((m, i) => { const [ic, col] = mark(m); g.fillStyle = col; g.fillText(ic, cx[i + 2], ry); });
    });
    g.restore();
  }
}

/** Buzlu yüzeyler için birim diskte rastgele ama tekrarlanabilir çatlak çizgileri */
function cracksFor(t: Tarama): number[][][] {
  if (!t.buzlu) return [];
  let seed = t.cisim.length * 977;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out: number[][][] = [];
  for (let i = 0; i < (t.cisim === 'europa' ? 14 : 8); i++) {
    let u = rnd() * 1.6 - 0.8, v = -0.95 + rnd() * 0.3, a = Math.PI / 2 + (rnd() - 0.5) * 1.2;
    const pts: number[][] = [];
    for (let k = 0; k < 24; k++) {
      if (u * u + v * v < 1) pts.push([u, v]);
      a += (rnd() - 0.5) * 0.35;
      u += Math.cos(a) * 0.09; v += Math.sin(a) * 0.09;
    }
    if (t.cisim === 'enceladus') for (const p of pts) { p[1] = Math.abs(p[1]) * 0.35 + 0.55; p[0] *= 0.7; } // kaplan çizgileri güneyde
    out.push(pts);
  }
  return out;
}

function wrap(g: CanvasRenderingContext2D, s: string, w: number): string[] {
  const words = s.split(' '), lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (g.measureText(t).width > w && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function fit(g: CanvasRenderingContext2D, s: string, w: number): string {
  if (g.measureText(s).width <= w) return s;
  let t = s;
  while (t.length > 4 && g.measureText(t + '…').width > w) t = t.slice(0, -1);
  return t + '…';
}
