// Haber Modu · jestler. Eller her karede buraya gelir; çıkan olayları sahne (scene.ts) uygular.
// KİLİT: kamera bir eli görür görmez iş yapmaz. Avuç açık, kameraya dönük ve sabit 0,6 sn durunca el kilitlenir
// (halka dolar, "KONTROL"); yalnızca kilitli el olay üretir. El 0,4 sn'den uzun kaybolur ya da kol aşağı inerse kilit
// açılır. Kadraja giren, sallanan ya da yarı kapalı gelen el hiçbir şey tetiklemez. İki elle hareketlerde iki el de kilitli.
// Doğrudan yönetim: kartlar ele birebir bağlıdır.
//   🤏 tut ve sürükle → karusel eli izler (bırakınca hızıyla kayar) · dikey: kategori / detayda içeriği kaydırır
//   🤏 tutup kendine çek → detay
//   🤏🤏 iki elle aç / kapat → yakınlaştır (karusel → detay → kaynak karşılaştırması) / uzaklaştır (bir seviye geri);
//     bir tutuşta bir seviye: daha derine inmek için elleri bırakıp yeniden tutun
//   🤏🤏 elleri ters yönde yukarı-aşağı ("terazi") → iddia kontrolü
//   ✊→🖐 kısa yumruk ve aç (0,2–0,8 sn) → kartı aç · ✊ yumruğu 0,8 sn tut → kapat (bir seviye geri)
//     Yumruk yapmak tek başına bir şey tetiklemez: karar el açılınca ya da halka dolunca verilir.
//   ☝️ işaret → kartı vurgula
//   👍 1 sn → Jarvis özetler · ✌️ → mikrofon
// Eşikler el büyüklüğüyle ölçeklenir (kameraya yakın el daha hızlı ve büyük görünür).
import type { HoldState } from '../fx';
import type { P, TrackedHand } from '../gestures';

export type JestOlay =
  /** El kilitlendi / kilit açıldı (ses ve ipucu için) */
  | { tip: 'kilit'; acik: boolean }
  | { tip: 'isaret'; p: P | null }
  | { tip: 'tut'; p: P; id: string }
  /** Tutuşun başından beri elin yer değiştirmesi (px) */
  | { tip: 'surukle'; dx: number; dy: number; p: P }
  | { tip: 'cek'; p: P }
  /** Bırakış: elin son hızı (px/sn) */
  | { tip: 'birak'; vx: number; vy: number }
  /** İki elle: ellerin arası / başlangıçtaki ara (1 = başlangıç) */
  | { tip: 'zoom'; oran: number }
  | { tip: 'zoomBitti' }
  | { tip: 'yakinlas' }
  | { tip: 'uzaklas' }
  | { tip: 'terazi' }
  | { tip: 'ac' }
  | { tip: 'kapat' }
  | { tip: 'basparmak' }
  | { tip: 'mikrofon' };

const HOLD_MS = 1000;
const MIC_MS = 600;
/** Kilit: avuç bu kadar sabit durunca; kayıp bu kadar sürünce kilit açılır */
export const KILIT_MS = 600;
const KAYIP_MS = 400;
/** Kilitlendikten hemen sonra eylem yok (kilitleyen el açıkken "aç" sayılmasın) */
const KILIT_SONRASI = 350;
/** İki elle yakınlaştırma eşikleri (oran) ve bir seviyeden sonra bekleme */
export const YAKIN = 1.45, UZAK = 0.7;
/** ✊→🖐 aç: yumruk en az YUMRUK_EN_AZ, en çok KAPAT_MS sürmüş; açılış ACILIS_MS içinde. ✊ KAPAT_MS tutulursa kapat */
const YUMRUK_EN_AZ = 180, ACILIS_MS = 450;
export const KAPAT_MS = 800;
/** "KAPAT" halkası yumruk bu kadar sürünce görünür (kısa yumruk açmak içindir) */
const KAPAT_HALKA = 300;
/** Kapattıktan sonra el gevşeyip açılınca kart yeniden açılmasın (ve tersi) */
const AC_KAPAT_BEKLE = 1300;
/** Tutuşta bu kadar oynamadan "sürükleme" sayılmaz (çekmeyle karışmasın) */
const SURUKLE_ESIK = 0.35;

interface ElDurum {
  /** Kilit: dolmaya başladığı an (0: dolmuyor), kilitlendiği an (0: kilitli değil), kolun aşağıda olduğu an */
  doluyor: number;
  kilitAt: number;
  asagiAt: number;
  sonGorulme: number;
  tutBas: { p: P; size: number; at: number; surukle: boolean } | null;
  cekildi: boolean;
  holdFired: number;
  /** Son kararlı jest ve başladığı an (✊→🖐 / 🖐→✊ geçişleri için) */
  onceki: { g: TrackedHand['gesture']; since: number; bitti: number } | null;
  simdiki: { g: TrackedHand['gesture']; since: number };
}

export class HaberJest {
  private el = new Map<string, ElDurum>();
  /** İki elle tutuş: başlangıç uzaklığı, terazi salınımı, yakınlaştırma */
  private cift: { d0: number; at: number; isaret: number; gecis: number; tepe: number; terazi: boolean; seviye: boolean } | null = null;
  private acAt = -1e9;
  private kapatAt = -1e9;
  H = 1080;
  /** Demo (sentetik eller): kilit adımı yok */
  kilitGerekli = true;
  /** Görünen ama kilitli olmayan el var mı (ekranda "avucunu göster" ipucu) */
  kilitBekleyen = false;

  private durum(id: string): ElDurum {
    let d = this.el.get(id);
    if (!d) { d = { doluyor: 0, kilitAt: 0, asagiAt: 0, sonGorulme: 0, tutBas: null, cekildi: false, holdFired: -1, onceki: null, simdiki: { g: 'diger', since: 0 } }; this.el.set(id, d); }
    return d;
  }

  /**
   * Kilit: kilitli el true döner (olay üretebilir). Kilitli değilse avuç açık, kameraya dönük, sabit ve kol yukarıda
   * olduğu sürece halka dolar; şart bozulursa sıfırlanır. Kilitli elin kolu 0,4 sn'den uzun aşağıdaysa kilit açılır.
   */
  private kilitle(h: TrackedHand, now: number, holds: HoldState[], out: JestOlay[]): boolean {
    const d = this.durum(h.id);
    const sz = h.shape.size, p = h.shape.palm;
    if (!this.kilitGerekli) { d.kilitAt ||= now - KILIT_SONRASI; return true; }
    if (d.kilitAt) {
      // Kol aşağı indi (kadrajın alt kenarı): bırakıldı
      if (p.y > this.H * 0.9) { d.asagiAt ||= now; if (now - d.asagiAt > KAYIP_MS) { d.kilitAt = 0; d.doluyor = 0; out.push({ tip: 'kilit', acik: false }); return false; } }
      else d.asagiAt = 0;
      holds.push({ x: p.x, y: p.y, r: sz * 0.62, p: 1, label: '', done: 0.6 });
      return true;
    }
    // Yeni jest izi: kilitlenmeden önceki hareketler eylem sayılmasın
    d.simdiki = { g: h.gesture, since: h.since };
    d.onceki = null;
    d.tutBas = null;
    const sabit = Math.hypot(h.vel.x, h.vel.y) < Math.max(160, sz * 1.4);
    const uygun = h.gesture === 'acik' && h.shape.face > 0.55 && sabit && p.y < this.H * 0.86;
    if (!uygun) { d.doluyor = 0; return false; }
    d.doluyor ||= now;
    const pr = (now - d.doluyor) / KILIT_MS;
    if (pr >= 1) { d.kilitAt = now; d.doluyor = 0; out.push({ tip: 'kilit', acik: true }); return true; }
    holds.push({ x: p.x, y: p.y, r: sz * 1.1, p: pr, label: '✋ KONTROL', done: 0 });
    return false;
  }

  update(hands: TrackedHand[], now: number, holds: HoldState[]): JestOlay[] {
    const out: JestOlay[] = [];
    // Görünmeyen el: kısa kopmalarda kilit korunur, KAYIP_MS'den uzun kaybolursa unutulur
    for (const [id, d] of this.el) if (!hands.some(h => h.id === id) && now - d.sonGorulme > KAYIP_MS) { this.el.delete(id); if (d.kilitAt) out.push({ tip: 'kilit', acik: false }); }
    for (const h of hands) this.durum(h.id).sonGorulme = now;
    hands = hands.filter(h => this.kilitle(h, now, holds, out));
    this.kilitBekleyen = hands.length === 0 && this.el.size > 0 && [...this.el.values()].some(d => !d.kilitAt);
    const pinching = hands.filter(h => h.gesture === 'cimdik');

    // 🤏🤏 iki elle: yakınlaştır / uzaklaştır (ellerin yatay arası) ya da terazi (ters yönde dikey salınım)
    if (pinching.length === 2) {
      const [a, b] = pinching;
      const pa = a.shape.pinchPt, pb = b.shape.pinchPt;
      const d = Math.max(1, Math.abs(pa.x - pb.x)), dy = pa.y - pb.y;
      const sz = (a.shape.size + b.shape.size) / 2;
      if (!this.cift) this.cift = { d0: d, at: now, isaret: Math.sign(dy) || 1, gecis: 0, tepe: Math.abs(dy), terazi: false, seviye: false };
      const c = this.cift;
      // Terazi: dikey fark işaret değiştirir (en az iki geçiş), her geçişte genlik el büyüklüğünün yarısını aşar
      const s = Math.sign(dy);
      c.tepe = Math.max(c.tepe, Math.abs(dy));
      if (s && s !== c.isaret && c.tepe > sz * 0.45) { c.gecis++; c.isaret = s; c.tepe = 0; }
      if (!c.terazi && c.gecis >= 2 && now - c.at < 4000) { c.terazi = true; out.push({ tip: 'terazi' }); }
      // Yakınlaştırma: salınım başladıysa (terazi) yakınlaştırma yok
      if (c.gecis === 0) {
        const oran = d / c.d0;
        out.push({ tip: 'zoom', oran });
        // Bir tutuşta bir seviye (eller açılmaya devam etse de iki kat birden inmez)
        if (!c.seviye) {
          if (oran > YAKIN) { out.push({ tip: 'yakinlas' }); c.seviye = true; }
          else if (oran < UZAK) { out.push({ tip: 'uzaklas' }); c.seviye = true; }
        }
      }
      for (const h of pinching) { const dd = this.durum(h.id); if (dd.tutBas) { dd.tutBas = null; out.push({ tip: 'birak', vx: 0, vy: 0 }); } }
    } else if (this.cift) { this.cift = null; out.push({ tip: 'zoomBitti' }); }

    for (const h of hands) {
      const d = this.durum(h.id);
      const sz = h.shape.size;
      // Kararlı jest değişti: ✊→🖐 aç · 🖐→✊ kapat
      if (h.gesture !== d.simdiki.g || h.since !== d.simdiki.since) {
        d.onceki = { ...d.simdiki, bitti: now };
        d.simdiki = { g: h.gesture, since: h.since };
        const o = d.onceki;
        // ✊→🖐: kısa yumruk açıldı (kapatmak için tutulan yumruğun açılması sayılmaz: o yumruk "kapat" oldu)
        if (now - d.kilitAt < KILIT_SONRASI) { /* kilitlenir kilitlenmez eylem yok */ }
        else if (h.gesture === 'acik' && o.g === 'yumruk' && o.since !== d.holdFired && o.bitti - o.since >= YUMRUK_EN_AZ && o.bitti - o.since < KAPAT_MS && now - o.bitti < ACILIS_MS && now - this.kapatAt > AC_KAPAT_BEKLE) {
          this.acAt = now; out.push({ tip: 'ac' });
        }
      }
      // ☝️ işaret parmağı ucu
      if (h.gesture === 'isaret') out.push({ tip: 'isaret', p: h.pts[8] });
      // 🤏 tek elle tut: sürükle (el oynadıkça) ya da kendine çek (el büyür ya da aşağı iner, yerinde)
      if (h.gesture === 'cimdik' && pinching.length === 1) {
        const p = h.shape.pinchPt;
        if (!d.tutBas) { d.tutBas = { p, size: sz, at: now, surukle: false }; d.cekildi = false; out.push({ tip: 'tut', p, id: h.id }); }
        else {
          const t = d.tutBas;
          const dx = p.x - t.p.x, dy = p.y - t.p.y;
          // Yatay oynama sürüklemedir; dikey iniş çekmeyle karışabilir, el büyümüyorsa sürükleme
          if (!t.surukle && !d.cekildi && (Math.abs(dx) > sz * SURUKLE_ESIK || (Math.abs(dy) > sz * SURUKLE_ESIK * 1.6 && sz < t.size * 1.06))) t.surukle = true;
          if (t.surukle) out.push({ tip: 'surukle', dx, dy, p });
          else if (!d.cekildi && sz > t.size * 1.15) { d.cekildi = true; out.push({ tip: 'cek', p }); }
        }
      } else if (d.tutBas) { d.tutBas = null; out.push({ tip: 'birak', vx: h.vel.x, vy: h.vel.y }); }
      // Basılı tutma: 👍 1 sn · ✊ 0,8 sn kapat (halka 0,3 sn'den sonra) · ✌️ 0,6 sn
      const yumruk = h.gesture === 'yumruk';
      const sure = h.gesture === 'basparmak' ? HOLD_MS : yumruk ? KAPAT_MS - KAPAT_HALKA : h.gesture === 'zafer' ? MIC_MS : 0;
      if (sure && d.holdFired !== h.since && now - d.kilitAt >= KILIT_SONRASI) {
        const pr = (now - h.since - (yumruk ? KAPAT_HALKA : 120)) / sure;
        if (pr >= 1) {
          d.holdFired = h.since;
          if (yumruk) { if (now - this.acAt > AC_KAPAT_BEKLE) { this.kapatAt = now; out.push({ tip: 'kapat' }); } }
          else out.push({ tip: h.gesture === 'basparmak' ? 'basparmak' : 'mikrofon' });
        } else if (pr > 0) {
          holds.push({ x: h.shape.palm.x, y: h.shape.palm.y, r: sz * 1.1, p: pr, label: h.gesture === 'basparmak' ? '👍 ÖZETLE' : h.gesture === 'yumruk' ? '✊ KAPAT' : '🎙 DİNLE', done: 0 });
        }
      }
    }
    if (!hands.some(h => h.gesture === 'isaret')) out.push({ tip: 'isaret', p: null });
    return out;
  }
}
