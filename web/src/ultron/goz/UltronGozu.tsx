// Ultron Paketi · B: Ultron'un Gözü. Gerçek veriyle beslenen canlı dünya izleme aracı. Rakamlar sunucudaki katman
// servislerinden gelir; Ultron yalnızca bu rakamları seslendirir (uydurma sayı yok; kaynak yoksa "VERİ YOK").
// Konum yalnızca kullanıcı izin verirse ve yalnızca o soruda kullanılır; varsayılan ayarlardaki şehirdir.
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { voice } from '../../lib/speech';
import { gozKatmanlar, gozSor, konusYolu, sesCoz, type GozVeri, type SorCevap } from '../api';
import { kirp, replik, sinirlayici, yankiKur } from '../ses';
import { GozKuresi, GORSEL_KATMANLAR, type GorselKatman } from './kure';
import { SATIRLAR, satirDurumu } from './satirlar';
import '../ultron.css';
import './goz.css';

const KATMAN_ADI: Record<string, GorselKatman> = { ucus: 'ucus', deprem: 'deprem', yangin: 'yangin', uydu: 'uydu', haber: 'haber', siber: 'siber', hava: 'hava' };
const BILINMIYOR = 'Bunu göremiyorum. Depremleri, uçuşları, yangınları, uyduları, haberleri, havayı ya da siber tehditleri sor.';

export default function UltronGozu({ gecis, girdi, onKapat, onMic, dinliyor }: { gecis: boolean; girdi: MutableRefObject<((t: string) => void) | null>; onKapat(): void; onMic(): void; dinliyor: boolean }) {
  const tuvalRef = useRef<HTMLCanvasElement>(null);
  const etiketRef = useRef<HTMLDivElement>(null);
  const reaktorRef = useRef<HTMLDivElement>(null);
  const kureRef = useRef<GozKuresi | null>(null);
  const zamanRef = useRef(0);
  const seviyeRef = useRef(0);
  const sesRef = useRef<{ dur(): void } | null>(null);
  const [veri, setVeri] = useState<GozVeri | null>(null);
  const [konusma, setKonusma] = useState<{ metin: string; kaynak?: string } | null>(null);
  const [acik, setAcik] = useState<Record<GorselKatman, boolean>>(() => Object.fromEntries(GORSEL_KATMANLAR.map(k => [k, true])) as Record<GorselKatman, boolean>);
  const [yaz, setYaz] = useState('');
  const [konum, setKonum] = useState<{ lat: number; lon: number } | null>(null);
  const [kapaniyor, setKapaniyor] = useState(false);
  const [bilgi, setBilgi] = useState(false);
  const konumRef = useRef(konum);
  konumRef.current = konum;

  // Küre ve kare döngüsü
  useEffect(() => {
    const c = tuvalRef.current!;
    const k = new GozKuresi(c);
    kureRef.current = k;
    const boyut = () => k.boyut(window.innerWidth, window.innerHeight);
    boyut();
    window.addEventListener('resize', boyut);
    const t0 = performance.now();
    let raf = 0;
    const havuz: HTMLDivElement[] = [];
    const kare = () => {
      const t = (performance.now() - t0) / 1000;
      zamanRef.current = t;
      k.render(t, { acilis: gecis ? null : t, w: window.innerWidth, h: window.innerHeight });
      // Etiketler: havuzdan yeniden kullan (React yeniden çizimi yok)
      const kutu = etiketRef.current;
      if (kutu) {
        k.ekranEtiketleri.forEach((e, i) => {
          let d = havuz[i];
          if (!d) { d = document.createElement('div'); havuz.push(d); kutu.appendChild(d); }
          d.className = `ug-etiket ${e.tur}`;
          if (d.textContent !== e.metin) d.textContent = e.metin;
          d.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px)`;
          d.style.display = '';
        });
        for (let i = k.ekranEtiketleri.length; i < havuz.length; i++) havuz[i].style.display = 'none';
      }
      if (reaktorRef.current) reaktorRef.current.style.setProperty('--sv', seviyeRef.current.toFixed(3));
      raf = requestAnimationFrame(kare);
    };
    raf = requestAnimationFrame(kare);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', boyut); k.dispose(); kureRef.current = null; };
  }, [gecis]);

  // Veri: açılışta ve 30 sn'de bir (yalnızca panel açıkken)
  useEffect(() => {
    let canli = true;
    const al = () => gozKatmanlar().then(v => { if (!canli) return; setVeri(v); kureRef.current?.veri(v); }).catch(() => {});
    void al();
    const id = setInterval(al, 30_000);
    return () => { canli = false; clearInterval(id); };
  }, []);

  /** Ultron konuşur: sunucu sesi (Ultron'un sesi) + metal/yankı; ses seviyesi reaktörü atar. Ses yoksa yalnızca yazı. */
  const konus = async (metin: string, kaynak?: string) => {
    sesRef.current?.dur();
    setKonusma({ metin, kaynak });
    voice.unlock();
    const ctx = voice.context;
    if (!ctx) return;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    const b = await sesCoz(ctx, konusYolu(metin)).catch(() => null);
    if (!b) return;
    const k = kirp(b);
    const an = ctx.createAnalyser(); an.fftSize = 512;
    const g = ctx.createGain(); g.connect(an); an.connect(ctx.destination);
    const sn = sinirlayici(ctx); sn.connect(g);
    const y = yankiKur(ctx, sn);
    const t = ctx.currentTime + 0.05;
    replik(ctx, { id: 'goz', kim: 'ultron', ton: 'sakin', metin, vurus: 0, bas: 0, sure: k.sure }, k, t, sn, y);
    const buf = new Float32Array(an.fftSize);
    let canli = true;
    const olc = () => { if (!canli) return; an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; seviyeRef.current = Math.min(1, Math.sqrt(s / buf.length) * 6); requestAnimationFrame(olc); };
    olc();
    sesRef.current = { dur: () => { canli = false; seviyeRef.current = 0; try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); setTimeout(() => g.disconnect(), 200); } catch { /* */ } } };
    setTimeout(() => { if (sesRef.current) { canli = false; seviyeRef.current = 0; } }, (k.sure / 0.93 + 0.5) * 1000);
  };

  // Açılış anlatımı (B1): veri gelince bir kez
  const anlatildi = useRef(false);
  useEffect(() => {
    if (!veri || anlatildi.current) return;
    anlatildi.current = true;
    gozSor('').then(c => { if (c.metin) void konus(c.metin, c.kaynak); }).catch(() => {});
  }, [veri]); // eslint-disable-line react-hooks/exhaustive-deps

  const katmanAyarla = (ad: GorselKatman, deger: boolean) => { kureRef.current?.gorunur(ad, deger); setAcik(a => ({ ...a, [ad]: deger })); };
  const kapat = () => {
    if (kapaniyor) return;
    sesRef.current?.dur();
    setKapaniyor(true); // kısa mavi geri dönüş
    setTimeout(onKapat, 900);
  };

  const cevapla = async (metin: string) => {
    let c: SorCevap;
    try { c = await gozSor(metin, { konum: konumRef.current }); } catch { konus('Bağlantı koptu. Veri gelmiyor.'); return; }
    const n = c.niyet;
    if (n.tip === 'kapat') { kapat(); return; }
    if (n.tip === 'ac') { kureRef.current?.serbestBirak(zamanRef.current); gozSor('').then(x => { if (x.metin) void konus(x.metin, x.kaynak); }); return; }
    if (n.tip === 'katman' && n.katman) {
      const ad = KATMAN_ADI[n.katman];
      if (n.islem === 'sadece') for (const k of GORSEL_KATMANLAR) katmanAyarla(k, k === ad);
      else katmanAyarla(ad, n.islem === 'ac');
      konus(n.islem === 'sadece' ? `Yalnızca ${SATIRLAR.find(s => s.gorsel === ad)?.ad.toLocaleLowerCase('tr')} katmanı.` : `${SATIRLAR.find(s => s.gorsel === ad)?.ad} katmanı ${n.islem === 'ac' ? 'açık' : 'kapandı'}.`);
      return;
    }
    if (n.tip === 'bilinmiyor' || !c.metin) { konus(BILINMIYOR); return; }
    if (c.odak) kureRef.current?.odakla(c.odak.lat, c.odak.lon, c.odak.zoom, zamanRef.current);
    if (c.katman && KATMAN_ADI[c.katman] && !acik[KATMAN_ADI[c.katman]]) katmanAyarla(KATMAN_ADI[c.katman], true);
    konus(c.metin, c.kaynak);
  };
  useEffect(() => { girdi.current = t => void cevapla(t); return () => { girdi.current = null; }; });

  // Esc → Jarvis'i geri getir
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') kapat(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });
  useEffect(() => () => sesRef.current?.dur(), []);

  const konumIste = () => {
    if (konum) { setKonum(null); return; }
    navigator.geolocation?.getCurrentPosition(p => setKonum({ lat: p.coords.latitude, lon: p.coords.longitude }), () => konus('Konum izni verilmedi. Ayarlardaki şehri kullanıyorum.'), { timeout: 8000 });
  };

  return createPortal(
    <div className={`ultron-goz${gecis ? ' gecis' : ''}${kapaniyor ? ' kapaniyor' : ''}`}>
      <canvas ref={tuvalRef} className="ug-kure" />
      <div ref={etiketRef} className="ug-etiketler" />
      <header className="ug-ust">
        <div ref={reaktorRef} className="ug-reaktor" aria-hidden><i /><i /><i /><b /></div>
        <div>
          <h1>ULTRON'UN GÖZÜ</h1>
          <p>canlı veri · {veri ? new Date(veri.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'bağlanıyor…'}{veri?.ev ? ` · ${veri.ev.ad}` : ''}</p>
        </div>
      </header>
      <aside className="ug-panel">
        {SATIRLAR.map(s => {
          const d = satirDurumu(s, veri);
          return (
            <button key={s.id} className={`ug-satir ${d.durum}${acik[s.gorsel] ? '' : ' kapali'}`} onClick={() => katmanAyarla(s.gorsel, !acik[s.gorsel])} title={acik[s.gorsel] ? 'Katmanı kapat' : 'Katmanı aç'}>
              <span className="ik">{s.ikon}</span>
              <span className="ad">{s.ad}</span>
              <span className="dg">{d.deger}{d.durum !== 'yok' && d.durum !== 'yukleniyor' && <em>{s.birim}</em>}</span>
              <span className="kn">{d.etiket}</span>
            </button>
          );
        })}
        <div className="ug-arac">
          <button onClick={konumIste} className={konum ? 'on' : ''} title="Yalnızca 'çevremde ne var?' sorusunda kullanılır; saklanmaz">{konum ? '◉ konumum' : '○ konumumu kullan'}</button>
          <button onClick={() => setBilgi(b => !b)}>ⓘ</button>
        </div>
        {bilgi && <p className="ug-bilgi">Veriler: USGS, AFAD/Kandilli, OpenSky, NASA FIRMS, CelesTrak, haber modu, Bekçi/USOM, Open-Meteo. Afet verisi bilgilendirme amaçlıdır; resmî uyarıların yerini tutmaz. Mesaj içerikleri asla gösterilmez; yalnızca sayılar.</p>}
      </aside>
      {konusma && (
        <div className="ug-altyazi" key={konusma.metin}>
          <b>ULTRON</b> {konusma.metin}
        </div>
      )}
      <footer className="ug-alt">
        <form onSubmit={e => { e.preventDefault(); if (yaz.trim()) { void cevapla(yaz.trim()); setYaz(''); } }}>
          <input value={yaz} onChange={e => setYaz(e.target.value)} placeholder="Ultron'a sor… (ör. Türkiye'de şu an ne oluyor?)" />
        </form>
        <button className={dinliyor ? 'on' : ''} onClick={onMic} aria-label="Konuş">◉</button>
        <button className="geri" onClick={kapat}>Jarvis'i geri getir</button>
      </footer>
    </div>,
    document.body,
  );
}
