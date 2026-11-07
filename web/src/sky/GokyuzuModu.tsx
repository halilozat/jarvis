// Gece Gökyüzü Modu: telefonla çekilen gece fotoğrafındaki yıldızlar, takımyıldızlar ve gezegenler.
// Tanıma: astrometry.net (plate solving) + yıldız kataloğu + astronomy-engine. Yapay zekâ görüntüye bakmaz.
// Tuşlar: L temiz çekim · R animasyonu yeniden oynat · E el kontrolü · S simülasyon · +/− yakınlaş · 0 sıfırla · Esc kart/kapat
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { coz, gokDurum, type Cozum, type CozumDurumu } from './api';
import { setGokProvider } from './baglam';
import { AMBER, ciz, CYAN, ekran, enYakin, type Gorunum } from './cizim';
import { ornekYukle, type Ornek } from './demo';
import { kameraEli, sentetikEl, type ElKaynagi } from './el';
import { fotografHazirla, SEHIRLER, tarayiciKonumu, yakinSehir, type Fotograf } from './foto';
import type { GokCismi, Konum } from './gezegen';
import { olayYiliYaz, uzaklikYaz, yilYaz, yolaCikisYaz } from './isik';
import { katalogYukle, yildizRengi, type Katalog } from './katalog';
import { ozetKur, yonAdi, type Kaynak } from './ozet';
import { sahneKur, sapmaOlc, type Sahne, type SahneCisim, type SahneYildiz } from './sahne';
import { simSahne, simZemin, yonelimdenBakis, type Bakis } from './simulasyon';
import { wcsKalibrasyondan, wcsOku, wcsOlcekle, type Wcs } from './wcs';
import './gokyuzu.css';

export type GokCmd = { tip: 'tara' } | { tip: 'vurgula'; hedef: number | string } | { tip: 'simulasyon' };

export interface GokyuzuProps {
  /** ?gok=demo: örnek fotoğraf ve çözümle internetsiz başla */
  demo?: boolean;
  /** ?isaret=demo: sentetik el (kamera yok) */
  sentetikEl?: boolean;
  /** Sesli komut / gokyuzu aracı: n her istekte artar */
  cmd?: { cmd: GokCmd; n: number } | null;
  caption: string;
  core: string;
  listening?: boolean;
  onMic?(): void;
  /** Yazarak sor (mikrofonsuz masaüstü): App'in normal sohbet akışı, gökyüzü özetiyle */
  onSor?(metin: string): void;
  onClose(): void;
  flash(m: string): void;
}

type Asama = 'giris' | 'hazirlik' | 'konum' | 'cozuluyor' | 'sahne' | 'sim';
type KonumKaynagi = 'exif' | 'tarayici' | 'secim' | 'ornek';

const ADIMLAR: [string, string][] = [['giris', 'bağlantı'], ['yukleniyor', 'fotoğraf gönderiliyor'], ['kuyrukta', 'sırada'], ['cozuluyor', 'yıldızlar eşleştiriliyor'], ['sonuclar', 'çözüm indiriliyor']];
const ISTANBUL: Konum = { lat: 41.0082, lon: 28.9784 };

const tarihYaz = (d: Date) => d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const kadirYaz = (k: number) => k.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace('-', '−');
const yerelGiris = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function GokyuzuModu(p: GokyuzuProps) {
  const [katalog, setKatalog] = useState<Katalog | null>(null);
  const [asama, setAsama] = useState<Asama>('giris');
  const [foto, setFoto] = useState<Fotograf | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [wcs, setWcs] = useState<Wcs | null>(null);
  const [cozum, setCozum] = useState<Cozum | null>(null);
  const [kaynak, setKaynak] = useState<Kaynak>('fotograf');
  const [cekim, setCekim] = useState<Date>(() => new Date());
  const [cekimTahmini, setCekimTahmini] = useState(false);
  const [konum, setKonum] = useState<Konum | null>(null);
  const [konumKaynagi, setKonumKaynagi] = useState<KonumKaynagi | null>(null);
  const [durum, setDurum] = useState<CozumDurumu | null>(null);
  const [yedekNedeni, setYedekNedeni] = useState('');
  const [hata, setHata] = useState('');
  const [astrometry, setAstrometry] = useState<boolean | null>(null);
  const [secili, setSecili] = useState<number | string | null>(null);
  const [temiz, setTemiz] = useState(false);
  const [el, setEl] = useState<'' | 'yukleniyor' | 'acik'>('');
  const [elMesaj, setElMesaj] = useState('');
  const [surukle, setSurukle] = useState(false);
  const [pusula, setPusula] = useState<'yok' | 'izin' | 'acik'>('yok');
  const [, setTik] = useState(0);
  const [soru, setSoru] = useState('');

  const tuval = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const kutu = useRef<HTMLDivElement>(null);
  const t0 = useRef(performance.now());
  const seciliT = useRef(0);
  const goruntu = useRef({ z: 1, cx: 0, cy: 0 });
  const bakis = useRef<Bakis>({ az: 180, alt: 35, fov: 70 });
  const imlec = useRef<number | string | null>(null);
  const elKaynak = useRef<ElKaynagi | null>(null);
  const elTutma = useRef<{ hedef: number | string | null; bas: number }>({ hedef: null, bas: 0 });
  const elImlec = useRef<{ x: number; y: number; jest: string; ilerleme: number } | null>(null);
  const iptal = useRef<AbortController | null>(null);
  const simRef = useRef<Sahne | null>(null);
  const gorunumRef = useRef<Gorunum>({ s: 1, ox: 0, oy: 0 });
  const konumRef = useRef<Konum | null>(null);
  konumRef.current = konum;

  // Katalog ve astrometry durumu
  useEffect(() => {
    katalogYukle().then(setKatalog).catch(e => setHata(`Katalog yüklenemedi: ${e.message}`));
    gokDurum().then(d => setAstrometry(d.astrometry)).catch(() => setAstrometry(false));
  }, []);

  // Fotoğraf görüntüsü
  useEffect(() => {
    if (!foto) { setImg(null); return; }
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = foto.url;
    return () => { i.onload = null; };
  }, [foto]);

  // Çözülmüş fotoğrafın sahnesi
  const sahne = useMemo<Sahne | null>(() => {
    if (!katalog || !wcs || !konum || !foto) return null;
    return sahneKur({ wcs: wcsOlcekle(wcs, foto.w, foto.h), katalog, cekim, konum });
  }, [katalog, wcs, konum, foto, cekim]);
  const sapma = useMemo(() => {
    if (!sahne || !cozum || kaynak === 'simulasyon') return null;
    // annotations çözülen görüntünün pikselinde; sahne ekrandaki fotoğrafın pikselinde
    const k = foto && wcs ? foto.w / wcs.w : 1;
    return sapmaOlc({ ...sahne, yildizlar: sahne.yildizlar.map(y => ({ ...y, x: (y.x + 0.5) / k - 0.5, y: (y.y + 0.5) / k - 0.5 })) }, cozum.annotations);
  }, [sahne, cozum, foto, wcs, kaynak]);

  const yer = konum ? (konumKaynagi === 'ornek' ? 'İstanbul' : yakinSehir(konum)) : '';

  // Sohbete giden özet (gokyuzu aracı)
  useEffect(() => {
    setGokProvider(() => {
      const s = asama === 'sim' ? simRef.current : asama === 'sahne' ? sahne : null;
      return s ? ozetKur(s, { kaynak: asama === 'sim' ? 'simulasyon' : kaynak, yer, secili }) : null;
    });
    return () => setGokProvider(null);
  }, [asama, sahne, kaynak, yer, secili]);

  const animasyon = useCallback(() => { t0.current = performance.now(); }, []);
  const sec = useCallback((id: number | string | null) => { setSecili(id); seciliT.current = (performance.now() - t0.current) / 1000; }, []);

  // ---------------------------------------------------------------- Akış

  const sahneyeGec = useCallback((k: Kaynak) => {
    setKaynak(k);
    goruntu.current = { z: 1, cx: NaN, cy: NaN };
    setAsama('sahne');
    sec(null);
    animasyon();
  }, [animasyon, sec]);

  const simulasyonaGec = useCallback((neden: string, t?: Date, k?: Konum | null) => {
    setYedekNedeni(neden);
    if (t) setCekim(t);
    if (k) setKonum(k);
    else if (!konum) { setKonum(ISTANBUL); setKonumKaynagi('secim'); }
    sec(null);
    simRef.current = null;
    setAsama('sim');
    animasyon();
  }, [animasyon, konum, sec]);

  const fotografAl = useCallback(async (dosya: Blob, lastModified?: number) => {
    iptal.current?.abort();
    setHata(''); setYedekNedeni(''); setCozum(null); setWcs(null); sec(null);
    setAsama('hazirlik');
    let f: Fotograf;
    try { f = await fotografHazirla(dosya); } catch (e: any) { setHata(e.message); setAsama('giris'); return; }
    setFoto(f);
    setCekim(f.cekim ?? new Date(lastModified ?? Date.now()));
    setCekimTahmini(!f.cekim);
    let k: Konum | null = f.konum, kk: KonumKaynagi | null = f.konum ? 'exif' : null;
    if (!k) { k = await tarayiciKonumu(); kk = k ? 'tarayici' : null; }
    setKonum(k); setKonumKaynagi(kk);
    konumRef.current = k;
    // Çözüm hemen başlar (konum gerekmez); konum yoksa bu arada şehir sorulur
    setAsama(k ? 'cozuluyor' : 'konum');
    const ac = new AbortController();
    iptal.current = ac;
    setDurum({ durum: 'giris', mesaj: 'başlıyor' });
    const d = await coz({ resim: f.resim, w: f.w, h: f.h, olcek: f.olcek }, setDurum, ac.signal).catch(e => ({ durum: 'hata', mesaj: String(e?.message || e) }) as CozumDurumu);
    if (ac.signal.aborted) return;
    setDurum(d);
    if (d.durum === 'tamam' && d.cozum) {
      setCozum(d.cozum);
      let w: Wcs;
      try { w = d.cozum.wcs ? wcsOku(d.cozum.wcs) : wcsKalibrasyondan(d.cozum.calibration, d.cozum.w, d.cozum.h); }
      catch { w = wcsKalibrasyondan(d.cozum.calibration, d.cozum.w, d.cozum.h); }
      if (!w.w || !w.h) { w.w = d.cozum.w; w.h = d.cozum.h; }
      setWcs(w);
      // Konum hâlâ seçilmediyse şehir sorusu ekranda kalır; seçilince sahne açılır
      if (konumRef.current) sahneyeGec('fotograf');
      else setKaynak('fotograf');
    } else {
      const neden = d.anahtarYok ? 'astrometry.net anahtarı tanımlı değil' : d.durum === 'cozulemedi' ? d.mesaj : `çözüm hatası: ${d.hata || d.mesaj}`;
      p.flash(`Fotoğraf çözülemedi: ${neden}. Simülasyona geçiliyor.`);
      simulasyonaGec(neden, f.cekim ?? undefined, k);
    }
  }, [p, sahneyeGec, sec, simulasyonaGec]);

  const ornegiAc = useCallback(async () => {
    iptal.current?.abort();
    setHata(''); setYedekNedeni(''); sec(null);
    setAsama('hazirlik');
    try {
      const { ornek, foto: blob } = await ornekYukle();
      const o: Ornek = ornek;
      const url = URL.createObjectURL(blob);
      setFoto({ resim: '', url, w: o.cozum.w, h: o.cozum.h, cekim: new Date(o.cekim), saatDilimi: 'exif', konum: o.konum, olcek: null, odak35: null });
      setCekim(new Date(o.cekim)); setCekimTahmini(false);
      setKonum(o.konum); setKonumKaynagi('ornek');
      setCozum(o.cozum);
      setWcs(wcsOku(o.cozum.wcs));
      // Çözüm adımları kısa bir gösteriyle (internet yok; gerçek çözüm dosyadan)
      setAsama('cozuluyor');
      const adim = ['giris', 'yukleniyor', 'kuyrukta', 'cozuluyor', 'sonuclar'];
      for (let i = 0; i < adim.length; i++) { setDurum({ durum: adim[i], mesaj: 'örnek çözüm', sure: i }); await new Promise(r => setTimeout(r, i === 3 ? 900 : 260)); }
      sahneyeGec('ornek');
    } catch (e: any) { setHata(e.message); setAsama('giris'); }
  }, [sahneyeGec, sec]);

  // ?gok=demo
  const demoBasladi = useRef(false);
  useEffect(() => {
    if (p.demo && katalog && !demoBasladi.current) { demoBasladi.current = true; void ornegiAc(); }
  }, [p.demo, katalog, ornegiAc]);

  // Sesli komutlar / araç
  const sonCmd = useRef(0);
  useEffect(() => {
    const c = p.cmd;
    if (!c || c.n === sonCmd.current) return;
    sonCmd.current = c.n;
    if (c.cmd.tip === 'tara') {
      if (asama === 'sahne' || asama === 'sim') { sec(null); animasyon(); }
      else if (asama === 'giris' && p.demo) void ornegiAc();
    } else if (c.cmd.tip === 'simulasyon') simulasyonaGec('istek üzerine');
    else if (c.cmd.tip === 'vurgula') {
      const h = c.cmd.hedef;
      sec(h);
      // Simülasyonda hedef görünmüyorsa o yöne dön
      if (asama === 'sim' && katalog && simRef.current && !simRef.current.yildizlar.some(y => y.hip === h) && !simRef.current.cisimler.some(x => x.id === h)) {
        const y = katalog.yildizlar.find(x => x.hip === h);
        if (y) import('./gezegen').then(m => { const u = m.yildizUfuk(y.ra, y.dec, cekim, konum ?? ISTANBUL); bakis.current = { ...bakis.current, az: u.azimut, alt: Math.max(10, u.irtifa) }; });
      }
    }
  }, [p.cmd, p.demo, asama, animasyon, sec, ornegiAc, simulasyonaGec, katalog, cekim, konum]);

  // ---------------------------------------------------------------- Görünüm

  const boyut = () => { const r = kutu.current?.getBoundingClientRect(); return { W: r?.width ?? innerWidth, H: r?.height ?? innerHeight }; };
  const gorunumHesapla = useCallback((s: Sahne, W: number, H: number): Gorunum => {
    if (asama === 'sim') return { s: 1, ox: -0.5, oy: -0.5 };
    const dikey = H > W * 1.1 && s.w > s.h;
    // Dikey ekranda yatay fotoğraf: yüksekliği doldurur (kaydırılabilir); yatayda tamamı sığar
    const s0 = dikey ? H / s.h : Math.min(W / s.w, H / s.h);
    const g = goruntu.current;
    if (Number.isNaN(g.cx)) {
      // Dikey ekranda en parlak işaretlerin ortasına odaklan
      const on = [...s.cisimler.map(c => ({ x: c.x, y: c.y })), ...s.yildizlar.slice(0, 8)];
      g.cx = dikey && on.length ? on.reduce((a, b) => a + b.x, 0) / on.length : s.w / 2;
      g.cy = s.h / 2;
    }
    const sc = s0 * g.z;
    // Kenarlar: fotoğraf ekranı doldurmuyorsa ortala, dolduruyorsa dışına taşma
    const yarW = W / 2 / sc, yarH = H / 2 / sc;
    g.cx = s.w * sc <= W ? s.w / 2 : Math.min(s.w - yarW, Math.max(yarW, g.cx));
    g.cy = s.h * sc <= H ? s.h / 2 : Math.min(s.h - yarH, Math.max(yarH, g.cy));
    return { s: sc, ox: W / 2 - (g.cx + 0.5) * sc, oy: H / 2 - (g.cy + 0.5) * sc };
  }, [asama]);

  const yakinlas = useCallback((k: number, ex?: number, ey?: number) => {
    const g = goruntu.current;
    const gv = gorunumRef.current;
    const { W, H } = boyut();
    const x = ex ?? W / 2, y = ey ?? H / 2;
    // Odak noktası yerinde kalsın
    const px = (x - gv.ox) / gv.s - 0.5, py = (y - gv.oy) / gv.s - 0.5;
    const z2 = Math.min(8, Math.max(1, g.z * k));
    const s2 = (gv.s / g.z) * z2;
    g.z = z2;
    g.cx = px + (W / 2 - x) / s2;
    g.cy = py + (H / 2 - y) / s2;
  }, []);

  // ---------------------------------------------------------------- Çizim döngüsü

  useEffect(() => {
    let raf = 0;
    const kare = (now: number) => {
      raf = requestAnimationFrame(kare);
      const c = tuval.current;
      if (!c) return;
      const { W, H } = boyut();
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (now - t0.current) / 1000;
      let s: Sahne | null = null;
      if (asama === 'sim' && katalog) {
        const zaman = yedekNedeni && cekim ? cekim : new Date();
        s = simSahne(katalog, zaman, konum ?? ISTANBUL, bakis.current, W, H);
        const ilk = !simRef.current;
        simRef.current = s;
        if (ilk) setTik(n => n + 1); // üst bilgi satırı ilk karede dolsun
        simZemin(ctx, bakis.current, W, H);
      } else if (asama === 'sahne') s = sahne;

      if (s) {
        const g = gorunumHesapla(s, W, H);
        gorunumRef.current = g;
        elAdimi(now, s, g);
        ciz2(ctx, s, g, W, H, t, asama === 'sim' ? null : img);
        imlecCiz(ctx);
      } else if ((asama === 'cozuluyor' || asama === 'konum' || asama === 'hazirlik') && img && foto) {
        // Çözülürken: fotoğraf soluk, tarama çizgisi gidip gelir (henüz işaret yok)
        ctx.clearRect(0, 0, W, H);
        const sc = Math.min(W / foto.w, H / foto.h);
        const ox = (W - foto.w * sc) / 2, oy = (H - foto.h * sc) / 2;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(img, ox, oy, foto.w * sc, foto.h * sc);
        ctx.globalAlpha = 1;
        const k = (Math.sin(now / 900) + 1) / 2;
        const x = ox + k * foto.w * sc;
        ctx.strokeStyle = `rgba(${CYAN}, 0.8)`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = `rgba(${CYAN}, 0.9)`; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + foto.h * sc); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(${CYAN}, 0.07)`;
        ctx.lineWidth = 1;
        for (let gx = ox; gx < ox + foto.w * sc; gx += 48) { ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, oy + foto.h * sc); ctx.stroke(); }
        for (let gy = oy; gy < oy + foto.h * sc; gy += 48) { ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + foto.w * sc, gy); ctx.stroke(); }
      } else ctx.clearRect(0, 0, W, H);
    };
    const ciz2 = (ctx: CanvasRenderingContext2D, s: Sahne, g: Gorunum, W: number, H: number, t: number, f: CanvasImageSource | null) => {
      ciz(ctx, { W, H, foto: f, sahne: s, g, t, secili, imlec: imlec.current, sim: asama === 'sim', etiketSiniri: H > W ? 14 : 26, seciliT: seciliT.current });
    };
    const imlecCiz = (ctx: CanvasRenderingContext2D) => {
      const m = elImlec.current;
      if (!m) return;
      ctx.save();
      ctx.strokeStyle = m.jest === 'cimdik' ? `rgba(${AMBER}, 0.95)` : `rgba(${CYAN}, 0.95)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.x - 22, m.y); ctx.lineTo(m.x - 8, m.y); ctx.moveTo(m.x + 8, m.y); ctx.lineTo(m.x + 22, m.y);
      ctx.moveTo(m.x, m.y - 22); ctx.lineTo(m.x, m.y - 8); ctx.moveTo(m.x, m.y + 8); ctx.lineTo(m.x, m.y + 22); ctx.stroke();
      if (m.ilerleme > 0) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(m.x, m.y, 19, -Math.PI / 2, -Math.PI / 2 + m.ilerleme * Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    };
    raf = requestAnimationFrame(kare);
    return () => cancelAnimationFrame(raf);
  });

  // El: işaret → vurgu, tut → kart, çimdik → yakınlaş, açık el → sıfırla
  const elAdimi = (now: number, s: Sahne, g: Gorunum) => {
    const k = elKaynak.current;
    if (!k) { elImlec.current = null; return; }
    const eller = k.eller(now);
    if (!eller.length) { elImlec.current = null; imlec.current = null; return; }
    const cimdikler = eller.filter(e => e.jest === 'cimdik');
    if (cimdikler.length === 2) {
      const d = Math.hypot(cimdikler[0].cimdik.x - cimdikler[1].cimdik.x, cimdikler[0].cimdik.y - cimdikler[1].cimdik.y);
      const onceki = elTutma.current as { iki?: number };
      if (onceki.iki) yakinlas(d / onceki.iki, (cimdikler[0].cimdik.x + cimdikler[1].cimdik.x) / 2, (cimdikler[0].cimdik.y + cimdikler[1].cimdik.y) / 2);
      onceki.iki = d;
      return;
    }
    (elTutma.current as { iki?: number }).iki = undefined;
    const e = eller.find(x => x.jest === 'isaret') ?? eller[0];
    const nokta = e.jest === 'cimdik' ? e.cimdik : e.uc;
    const t = (now - t0.current) / 1000;
    if (e.jest === 'isaret') {
      const y = enYakin(s, g, nokta.x, nokta.y, 70, t);
      imlec.current = y?.id ?? null;
      const tut = elTutma.current;
      if (y?.id !== tut.hedef) { tut.hedef = y?.id ?? null; tut.bas = now; }
      const ilerleme = tut.hedef !== null ? Math.min(1, (now - tut.bas) / 900) : 0;
      if (ilerleme >= 1 && secili !== tut.hedef) sec(tut.hedef);
      elImlec.current = { x: nokta.x, y: nokta.y, jest: e.jest, ilerleme: secili === tut.hedef ? 0 : ilerleme };
    } else if (e.jest === 'cimdik') {
      if (asama === 'sim') bakis.current = { ...bakis.current, fov: Math.max(20, bakis.current.fov * 0.992) };
      else yakinlas(1.012, nokta.x, nokta.y);
      elImlec.current = { x: nokta.x, y: nokta.y, jest: e.jest, ilerleme: 0 };
    } else if (e.jest === 'acik') {
      const sure = (now - e.since) / 1000;
      if (sure > 0.8 && (goruntu.current.z !== 1 || secili !== null)) { goruntu.current.z = 1; sec(null); if (asama === 'sim') bakis.current = { ...bakis.current, fov: 70 }; }
      elImlec.current = { x: nokta.x, y: nokta.y, jest: e.jest, ilerleme: 0 };
      imlec.current = null;
    } else elImlec.current = { x: nokta.x, y: nokta.y, jest: e.jest, ilerleme: 0 };
  };

  const elAc = useCallback(async () => {
    if (elKaynak.current) { elKaynak.current.dur(); elKaynak.current = null; setEl(''); elImlec.current = null; return; }
    if (p.sentetikEl) {
      elKaynak.current = sentetikEl(() => {
        const s = asamaRef.current === 'sim' ? simRef.current : sahneRef.current;
        if (!s) return [];
        const g = gorunumRef.current;
        const on = [...s.cisimler.map(c => ekran(g, c.x, c.y)), ...s.yildizlar.filter(y => y.adli).slice(0, 4).map(y => ekran(g, y.x, y.y))];
        return on.slice(0, 4);
      });
      setEl('acik');
      return;
    }
    setEl('yukleniyor');
    try {
      elKaynak.current = await kameraEli(video.current!, boyut, setElMesaj);
      setEl('acik');
    } catch (e: any) { setEl(''); p.flash(`El kontrolü açılamadı: ${e?.message || e}`); }
  }, [p]);
  const asamaRef = useRef(asama); asamaRef.current = asama;
  const sahneRef = useRef(sahne); sahneRef.current = sahne;
  useEffect(() => () => { elKaynak.current?.dur(); iptal.current?.abort(); }, []);
  // Demo eli: sahne hazır olunca kendiliğinden
  useEffect(() => { if (p.sentetikEl && (asama === 'sahne' || asama === 'sim') && !elKaynak.current) void elAc(); }, [p.sentetikEl, asama, elAc]);

  // Simülasyon: canlı saat (yedek değilse) ve pusula
  useEffect(() => {
    if (asama !== 'sim') return;
    const t = setInterval(() => setTik(n => n + 1), 20_000);
    return () => clearInterval(t);
  }, [asama]);
  useEffect(() => {
    if (pusula !== 'acik') return;
    const f = (e: Event) => {
      const b = yonelimdenBakis(e as DeviceOrientationEvent);
      if (b) bakis.current = { ...bakis.current, az: bakis.current.az + ((((b.az - bakis.current.az) % 360) + 540) % 360 - 180) * 0.25, alt: bakis.current.alt + (b.alt - bakis.current.alt) * 0.25 };
    };
    const tur = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(tur, f);
    return () => window.removeEventListener(tur, f);
  }, [pusula]);
  const pusulaAc = async () => {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof D.requestPermission === 'function') {
      try { if ((await D.requestPermission()) !== 'granted') { p.flash('Pusula izni verilmedi'); return; } } catch { p.flash('Pusula izni alınamadı'); return; }
    }
    setPusula('acik');
  };

  // ---------------------------------------------------------------- Dokunma, fare, klavye

  const isaretciler = useRef(new Map<number, { x: number; y: number }>());
  const surukleme = useRef<{ x: number; y: number; hareket: number; mesafe?: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (asama !== 'sahne' && asama !== 'sim') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    isaretciler.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    surukleme.current = { x: e.clientX, y: e.clientY, hareket: 0 };
    if (isaretciler.current.size === 2) { const [a, b] = [...isaretciler.current.values()]; surukleme.current.mesafe = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const r = kutu.current!.getBoundingClientRect();
    const s = asama === 'sim' ? simRef.current : sahne;
    if (!surukleme.current) {
      // Fareyle üstüne gelince vurgu
      if (s && e.pointerType === 'mouse' && !elKaynak.current) imlec.current = enYakin(s, gorunumRef.current, e.clientX - r.left, e.clientY - r.top, 26, (performance.now() - t0.current) / 1000)?.id ?? null;
      return;
    }
    const onceki = isaretciler.current.get(e.pointerId);
    isaretciler.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isaretciler.current.size === 2 && surukleme.current.mesafe) {
      const [a, b] = [...isaretciler.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (asama === 'sim') bakis.current = { ...bakis.current, fov: Math.min(110, Math.max(15, bakis.current.fov * (surukleme.current.mesafe / d))) };
      else yakinlas(d / surukleme.current.mesafe, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      surukleme.current.mesafe = d;
      surukleme.current.hareket += 10;
      return;
    }
    if (!onceki) return;
    const dx = e.clientX - onceki.x, dy = e.clientY - onceki.y;
    surukleme.current.hareket += Math.abs(dx) + Math.abs(dy);
    if (asama === 'sim') {
      const k = bakis.current.fov / r.width;
      bakis.current = { ...bakis.current, az: (bakis.current.az - dx * k + 360) % 360, alt: Math.min(89, Math.max(-10, bakis.current.alt + dy * k)) };
    } else {
      const g = gorunumRef.current;
      goruntu.current.cx -= dx / g.s;
      goruntu.current.cy -= dy / g.s;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    isaretciler.current.delete(e.pointerId);
    const sv = surukleme.current;
    if (isaretciler.current.size === 0) surukleme.current = null;
    if (!sv || sv.hareket > 8 || isaretciler.current.size) return;
    const r = kutu.current!.getBoundingClientRect();
    const s = asama === 'sim' ? simRef.current : sahne;
    if (!s) return;
    const y = enYakin(s, gorunumRef.current, e.clientX - r.left, e.clientY - r.top, e.pointerType === 'touch' ? 36 : 26, (performance.now() - t0.current) / 1000);
    sec(y?.id ?? null);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (asama === 'sim') { bakis.current = { ...bakis.current, fov: Math.min(110, Math.max(15, bakis.current.fov * Math.exp(e.deltaY * 0.0015))) }; return; }
    if (asama !== 'sahne') return;
    const r = kutu.current!.getBoundingClientRect();
    yakinlas(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement;
      if (hedef?.tagName === 'INPUT' || hedef?.tagName === 'SELECT' || hedef?.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); if (secili !== null) sec(null); else p.onClose(); return; }
      if (e.code === 'KeyL') { e.stopImmediatePropagation(); setTemiz(v => !v); return; }
      if (e.code === 'KeyR') { e.stopImmediatePropagation(); sec(null); animasyon(); return; }
      if (e.code === 'KeyE') { e.stopImmediatePropagation(); void elAc(); return; }
      if (e.code === 'KeyS' && katalog) { e.stopImmediatePropagation(); if (asama === 'sim' && sahne) sahneyeGec(kaynak); else simulasyonaGec('istek üzerine'); return; }
      if (e.key === '+' || e.key === '=') { e.stopImmediatePropagation(); asama === 'sim' ? (bakis.current = { ...bakis.current, fov: Math.max(15, bakis.current.fov / 1.25) }) : yakinlas(1.25); return; }
      if (e.key === '-') { e.stopImmediatePropagation(); asama === 'sim' ? (bakis.current = { ...bakis.current, fov: Math.min(110, bakis.current.fov * 1.25) }) : yakinlas(0.8); return; }
      if (e.key === '0') { e.stopImmediatePropagation(); goruntu.current.z = 1; bakis.current = { ...bakis.current, fov: 70 }; }
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, [secili, p, animasyon, elAc, asama, sahne, kaynak, katalog, sahneyeGec, simulasyonaGec, sec]);

  // ---------------------------------------------------------------- Görünüm (DOM)

  const aktifSahne = asama === 'sim' ? simRef.current : asama === 'sahne' ? sahne : null;
  const seciliYildiz: SahneYildiz | null = typeof secili === 'number' ? aktifSahne?.yildizlar.find(y => y.hip === secili) ?? null : null;
  const seciliCisim: GokCismi | SahneCisim | null = typeof secili === 'string' ? aktifSahne?.cisimler.find(c => c.id === secili) ?? aktifSahne?.gorunenCisimler.find(c => c.id === secili) ?? null : null;

  const dosyaSec = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fotografAl(f, f.lastModified); };
  const birak = (e: React.DragEvent) => { e.preventDefault(); setSurukle(false); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith('image/')) void fotografAl(f, f.lastModified); };

  return (
    <div className={`gk${temiz ? ' temiz' : ''}${asama === 'sim' ? ' sim' : ''}`} ref={kutu}
      onDragOver={e => { e.preventDefault(); setSurukle(true); }} onDragLeave={() => setSurukle(false)} onDrop={birak}>
      <canvas className="gk-tuval" ref={tuval} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} />
      <video ref={video} className="gk-video" muted playsInline />

      {asama === 'sim' && <div className="gk-sim-etiket">SİMÜLASYON<small>{yedekNedeni && yedekNedeni !== 'istek üzerine' ? `fotoğraf çözülemedi · ${yedekNedeni}` : 'katalogdan çizildi · fotoğraf değil'}</small></div>}
      {asama === 'sahne' && kaynak === 'ornek' && <div className="gk-ornek-etiket">ÖRNEK · sentetik görüntü, gerçek astrometry.net çözümü</div>}

      {!temiz && (
        <header className="gk-ust">
          <div className="gk-baslik">
            <b>GECE GÖKYÜZÜ</b>
            {asama === 'sahne' && <span className="gk-chip ok">{kaynak === 'ornek' ? 'ÖRNEK ÇÖZÜM' : 'FOTOĞRAF ÇÖZÜLDÜ'}</span>}
            {asama === 'sim' && <span className="gk-chip uyari">SİMÜLASYON</span>}
          </div>
          {aktifSahne && (
            <div className="gk-bilgi">
              <span>{tarihYaz(new Date(aktifSahne.cekim))}{cekimTahmini && asama === 'sahne' ? ' (tahmini)' : ''}</span>
              <span>{yer}{konumKaynagi === 'exif' ? ' · GPS' : konumKaynagi === 'tarayici' ? ' · tarayıcı konumu' : konumKaynagi === 'secim' ? ' · seçilen şehir' : ''}</span>
              <span>{aktifSahne.yildizlar.length} yıldız · {aktifSahne.takimyildizlar.length} takımyıldız{aktifSahne.cisimler.length ? ` · ${aktifSahne.cisimler.map(c => c.ad).join(', ')}` : ''}</span>
              {asama === 'sahne' && <span>alan {Math.round(aktifSahne.alan[0])}×{Math.round(aktifSahne.alan[1])}°{cozum ? ` · astrometry.net iş ${cozum.jobId}` : ''}</span>}
              {asama === 'sahne' && sapma && <span title="Katalogdan hesaplanan konum ile astrometry.net'in işaretlediği konum arasındaki fark">doğrulama: {sapma.eslesen} yıldız · sapma {sapma.ortanca.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} px</span>}
            </div>
          )}
          <button className="gk-kapat" onClick={p.onClose} aria-label="Kapat">✕</button>
        </header>
      )}

      {(asama === 'giris' || asama === 'hazirlik') && (
        <div className={`gk-giris${surukle ? ' surukle' : ''}`}>
          <div className="gk-giris-kutu">
            <div className="gk-giris-baslik">Gece gökyüzü fotoğrafınızı verin</div>
            <p>Yıldızlar <b>astrometry.net</b> çözümü ve yıldız kataloğuyla tanınır; yapay zekâ görüntüye bakmaz. Gezegenler çekim anı ve konumunuza göre hesaplanır.</p>
            <div className="gk-dusur">{asama === 'hazirlik' ? 'fotoğraf hazırlanıyor…' : 'fotoğrafı buraya sürükleyin'}</div>
            <div className="gk-dugmeler">
              <label className="gk-dugme ana">Fotoğraf seç<input type="file" accept="image/*" onChange={dosyaSec} hidden /></label>
              <label className="gk-dugme">Kamerayla çek<input type="file" accept="image/*" capture="environment" onChange={dosyaSec} hidden /></label>
              <button className="gk-dugme" onClick={() => void ornegiAc()} disabled={!katalog}>Örnek fotoğraf</button>
              <button className="gk-dugme" onClick={() => simulasyonaGec('istek üzerine')} disabled={!katalog}>Simülasyon</button>
            </div>
            {astrometry === false && <p className="gk-not">astrometry.net anahtarı tanımlı değil: kendi fotoğrafınız çözülemez, simülasyona geçilir. Anahtar ücretsiz: README → Gece Gökyüzü Modu.</p>}
            <p className="gk-not">İpucu: tripod ya da sabit bir yüzey, gece modu, 3–10 sn pozlama; gökyüzü kadrajın çoğunda olsun. Konum ve saat fotoğrafın EXIF bilgisinden okunur; yükleme öncesi silinir.</p>
            {hata && <p className="gk-hata">{hata}</p>}
          </div>
        </div>
      )}

      {asama === 'konum' && (
        <div className="gk-giris">
          <div className="gk-giris-kutu dar">
            <div className="gk-giris-baslik">Fotoğraf nerede çekildi?</div>
            <p>Fotoğrafta konum bilgisi yok ve tarayıcı konumu alınamadı. Gezegenlerin ufkun üstünde olup olmadığı konuma bağlı.</p>
            <select defaultValue="" onChange={e => { const s = SEHIRLER.find(x => x.ad === e.target.value); if (s) { setKonum(s.konum); konumRef.current = s.konum; setKonumKaynagi('secim'); if (wcs) sahneyeGec(kaynak); else setAsama('cozuluyor'); } }}>
              <option value="" disabled>Şehir seçin</option>
              {SEHIRLER.map(s => <option key={s.ad} value={s.ad}>{s.ad}</option>)}
            </select>
            <label className="gk-saat">Çekim zamanı{cekimTahmini ? ' (fotoğrafta yok, düzeltin)' : ''}
              <input type="datetime-local" value={yerelGiris(cekim)} onChange={e => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) setCekim(d); }} />
            </label>
          </div>
        </div>
      )}

      {asama === 'cozuluyor' && (
        <div className="gk-coz">
          <div className="gk-coz-baslik">YILDIZLAR EŞLEŞTİRİLİYOR…</div>
          <ol>
            {ADIMLAR.map(([k, ad], i) => {
              const sira = ADIMLAR.findIndex(a => a[0] === durum?.durum);
              return <li key={k} className={i < sira ? 'bitti' : i === sira ? 'su' : ''}>{ad}</li>;
            })}
          </ol>
          <div className="gk-coz-alt">{durum?.mesaj}{durum?.sure ? ` · ${durum.sure} sn` : ''}{kaynak !== 'ornek' ? ' · astrometry.net' : ''}</div>
          <button className="gk-dugme" onClick={() => { iptal.current?.abort(); simulasyonaGec('çözüm beklenmedi', foto?.cekim ?? undefined, konum); }}>Beklemeden simülasyona geç</button>
        </div>
      )}

      {(seciliYildiz || seciliCisim) && (
        <Kart key={String(secili)} yildiz={seciliYildiz} cisim={seciliCisim} cekim={aktifSahne ? new Date(aktifSahne.cekim) : cekim} onKapat={() => sec(null)} />
      )}

      {!temiz && p.caption && <div className="gk-altyazi">{p.caption}</div>}

      {!temiz && (asama === 'sahne' || asama === 'sim') && (
        <footer className="gk-alt">
          <div className="gk-ipucu">
            <span><b>dokun</b> yıldız kartı</span><span><b>L</b> temiz çekim</span><span><b>R</b> yeniden oynat</span>
            <span><b>E</b> el {el === 'acik' ? 'açık' : el === 'yukleniyor' ? elMesaj || 'açılıyor…' : 'kontrolü'}</span><span><b>S</b> {asama === 'sim' ? 'fotoğrafa dön' : 'simülasyon'}</span>
            {el === 'acik' && <span>☝️ işaret et · tut: kart · 🤏 yakınlaş · ✋ sıfırla</span>}
          </div>
          <div className="gk-alt-dugmeler">
            {asama === 'sim' && pusula !== 'acik' && 'DeviceOrientationEvent' in window && <button className="gk-dugme" onClick={() => void pusulaAc()}>Pusula</button>}
            <button className="gk-dugme" onClick={() => { setAsama('giris'); sec(null); }}>Yeni fotoğraf</button>
            {p.onSor && (
              <form className="gk-sor" onSubmit={e => { e.preventDefault(); if (soru.trim()) { p.onSor!(soru.trim()); setSoru(''); } }}>
                <input value={soru} onChange={e => setSoru(e.target.value)} placeholder="Jarvis'e sor: en parlak yıldız hangisi?" enterKeyHint="send" />
              </form>
            )}
            {p.onMic && <button className={`gk-mik${p.listening ? ' dinliyor' : ''}`} onClick={p.onMic} aria-label="Mikrofon">●</button>}
          </div>
        </footer>
      )}
    </div>
  );
}

/** Yıldız / gezegen bilgi kartı: kısa zaman çizgisi bugünden geriye akıp ışığın yola çıktığı yılda durur */
function Kart({ yildiz, cisim, cekim, onKapat }: { yildiz: SahneYildiz | null; cisim: GokCismi | SahneCisim | null; cekim: Date; onKapat(): void }) {
  const [yil, setYil] = useState(cekim.getFullYear());
  const [bitti, setBitti] = useState(false);
  const hedef = yildiz?.isik?.yil ?? null;
  const bugun = cekim.getFullYear();
  useEffect(() => {
    if (hedef === null) return;
    const t0 = performance.now(), sure = 1700;
    let raf = 0;
    const f = (now: number) => {
      const k = Math.min(1, (now - t0) / sure);
      const e = 1 - (1 - k) ** 3;
      setYil(Math.round(bugun + (hedef - bugun) * e));
      if (k < 1) raf = requestAnimationFrame(f); else setBitti(true);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [hedef, bugun]);

  if (cisim) {
    return (
      <aside className="gk-kart gezegen">
        <div className="gk-kart-ust"><span>{cisim.id === 'ay' ? 'UYDU' : 'GEZEGEN'}</span><button onClick={onKapat} aria-label="Kapat">✕</button></div>
        <h2>{cisim.ad}</h2>
        <dl>
          <div><dt>Uzaklık</dt><dd>{cisim.id === 'ay' ? `${Math.round(cisim.au * 149_597_870.7).toLocaleString('tr-TR')} km` : `${cisim.au.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} AU`}</dd></div>
          <div><dt>Parlaklık</dt><dd>kadir {kadirYaz(cisim.kadir)}</dd></div>
          <div><dt>Konum</dt><dd>{yonAdi(cisim.azimut)} · ufkun {Math.round(cisim.irtifa)}° üstünde</dd></div>
          <div><dt>Işığın yolculuğu</dt><dd>{cisim.id === 'ay' ? `${(cisim.isikDk * 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} saniye` : `${Math.round(cisim.isikDk)} dakika`}</dd></div>
        </dl>
        <p className="gk-olay">{cisim.id === 'ay' ? 'Ay ışığı aslında yansıyan Güneş ışığı.' : `${cisim.ad} yıldız değil: Güneş ışığını yansıtıyor. Bu ışık fotoğraf çekilmeden yalnızca ${Math.round(cisim.isikDk)} dakika önce yola çıktı.`}</p>
        <div className="gk-kaynak">konum: astronomy-engine (VSOP87) · çekim anı ve konum</div>
      </aside>
    );
  }
  if (!yildiz) return null;
  const i = yildiz.isik;
  const o = yildiz.olay;
  // Zaman çizgisi: sol uç ışığın yola çıktığı yıldan biraz önce, sağ uç bugün
  const sol = hedef !== null ? Math.min(hedef, o ? Math.min(o.olay.yil, hedef) : hedef) - Math.max(5, (bugun - hedef) * 0.08) : bugun - 10;
  const konumYuzde = (y: number) => ((y - sol) / (bugun - sol)) * 100;
  return (
    <aside className="gk-kart">
      <div className="gk-kart-ust"><span>YILDIZ{yildiz.tanim ? ` · ${yildiz.tanim}` : ''}</span><button onClick={onKapat} aria-label="Kapat">✕</button></div>
      <h2 style={{ textShadow: `0 0 18px ${yildizRengi(yildiz.renk)}66` }}>{yildiz.ad}</h2>
      <div className="gk-tk">{yildiz.tkAd} takımyıldızı</div>
      <dl>
        <div><dt>Uzaklık</dt><dd>{i ? uzaklikYaz(i) : 'ölçülmemiş'}</dd></div>
        <div><dt>Parlaklık</dt><dd>kadir {kadirYaz(yildiz.kadir)}</dd></div>
        <div><dt>Işığın yola çıkışı</dt><dd>{i ? yolaCikisYaz(i) : '—'}</dd></div>
      </dl>
      {i && hedef !== null && (
        <div className="gk-zaman">
          <div className="gk-zaman-yil">{yilYaz(yil)}</div>
          <div className="gk-zaman-cizgi">
            {i.yaklasik && <div className="gk-zaman-aralik" style={{ left: `${Math.max(0, konumYuzde(i.yilAralik[0] ?? sol))}%`, right: `${100 - konumYuzde(i.yilAralik[1])}%` }} />}
            {o && (() => {
              const x = konumYuzde(o.olay.yil < 0 ? o.olay.yil + 1 : o.olay.yil);
              // Etiket kenarda taşmasın: solda sola, sağda sağa yaslanır
              return <div className={`gk-zaman-olay${bitti ? ' gorunur' : ''}${x < 30 ? ' sol' : x > 70 ? ' sag' : ''}`} style={{ left: `${x}%` }}><i /><span>{o.olay.ad} · {olayYiliYaz(o.olay.yil)}</span></div>;
            })()}
            <div className="gk-zaman-isaret" style={{ left: `${konumYuzde(yil)}%` }} />
            <span className="gk-zaman-bugun">{yilYaz(bugun)}</span>
          </div>
        </div>
      )}
      {o && <p className={`gk-olay${bitti ? ' gorunur' : ''}`}>{o.cumle}</p>}
      {i?.yaklasik && <p className="gk-not">Uzaklık yaklaşık: paralaks {i.goreliHata > 0.2 ? `hatası %${Math.round(i.goreliHata * 100)}` : 'çok küçük'}; bu kadar uzak yıldızlarda ölçüm belirsiz.</p>}
      <div className="gk-kaynak">uzaklık: Hipparcos paralaksı (van Leeuwen 2007) · olay: elle hazırlanan liste</div>
    </aside>
  );
}
