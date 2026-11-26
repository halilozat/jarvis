// Ultron Paketi · A: Savaş Modu oynatıcısı. Bir gösteri ve hikâye modu: Ultron gerçekte hiçbir şeyi değiştirmez; sahne
// bitince (ya da Esc ile) arayüz eski hâline döner. Zaman kaynağı ses saati (AudioContext.currentTime): görüntü ve ses
// aynı saatten okunur. Final A → Ultron'un Gözü; Final B → kapatma parolasıyla Jarvis geri gelir.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRecognizer, speechRecognitionSupported, voice } from '../lib/speech';
import { sahneAl, sesCoz, ultronDurum } from './api';
import { hudCiz } from './hud';
import { SavasSahnesi } from './sahne';
import { hedefleriBul, kutular, temizle, uygula, type Hedefler } from './sekmeler';
import { kirp, sahneSuresi, sesKur, type Kaynak } from './ses';
import { durum, planKur, type Plan } from './zaman';
import './ultron.css';

export type SavasSonu = 'goz' | 'normal' | 'iptal';
const sade = (s: string) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
export const FONT = "'Rajdhani', 'Orbitron', ui-monospace, Menlo, monospace";
/** Önizleme çekimi: ?ultron-karart=0.6 → uygulama arayüzü sahne boyunca daha görünür kalır (yalnız önizlemede) */
const KARART_CARPAN = Math.min(1, Math.max(0, Number(new URLSearchParams(location.search).get('ultron-karart') ?? 1)));

/** Sahneyi hazırla: metin, zaman çizelgesi, sesler (çözülmüş ve kırpılmış), plan */
export async function sahneHazirla(ctx: BaseAudioContext, finalZorla?: 'A' | 'B') {
  const [dur, s] = await Promise.all([ultronDurum(), sahneAl()]);
  const final = finalZorla ?? dur.final;
  const kaynaklar: Record<string, Kaynak> = {};
  await Promise.all(s.satirlar.filter(x => !x.final || x.final === final).map(async x => {
    if (!x.ses) return;
    try { const b = await sesCoz(ctx, x.ses); if (b) kaynaklar[x.id] = kirp(b); } catch { /* ses yok: tahmini süre + altyazı */ }
  }));
  const sureler = Object.fromEntries(s.satirlar.filter(x => kaynaklar[x.id]).map(x => [x.id, sahneSuresi(kaynaklar[x.id], x.kim, x.ton)]));
  const plan = planKur(s.satirlar, s.zaman, sureler, final);
  return { dur, ayar: s.ayar, plan, kaynaklar, sesli: new Set(Object.keys(kaynaklar)) };
}

export default function SavasModu({ onBitti, final: finalZorla, onizleme }: { onBitti(s: SavasSonu): void; final?: 'A' | 'B'; onizleme?: number | null }) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLCanvasElement>(null);
  const karartRef = useRef<HTMLDivElement>(null);
  const [hazir, setHazir] = useState<'yukleniyor' | 'kilitli' | 'oynuyor' | 'hata'>('yukleniyor');
  const [hata, setHata] = useState('');
  const bittiRef = useRef(onBitti);
  bittiRef.current = onBitti;
  /** ✕ düğmesi (dokunmatik ekranlarda Esc yerine) */
  const kapatRef = useRef<(s: SavasSonu) => void>(() => bittiRef.current('iptal'));

  useEffect(() => {
    let canli = true, raf = 0;
    let sahne: SavasSahnesi | null = null;
    let hedef: Hedefler | null = null;
    let usta: GainNode | null = null;
    let tanima: { start(): void; stop(): void } | null = null;
    let kapandi = false;
    const temizlik: (() => void)[] = [];

    const kapat = (s: SavasSonu) => {
      if (kapandi) return;
      kapandi = true;
      canli = false;
      cancelAnimationFrame(raf);
      try { usta?.gain.setTargetAtTime(0, (usta.context as AudioContext).currentTime, 0.05); setTimeout(() => usta?.disconnect(), 300); } catch { /* ses yok */ }
      try { tanima?.stop(); } catch { /* */ }
      temizle(hedef);
      temizlik.forEach(f => f());
      sahne?.dispose();
      bittiRef.current(s);
    };

    kapatRef.current = kapat;
    const escErken = (e: KeyboardEvent) => { if (e.key === 'Escape') kapat('iptal'); };
    window.addEventListener('keydown', escErken);
    temizlik.push(() => window.removeEventListener('keydown', escErken));

    (async () => {
      voice.stop();
      voice.unlock();
      const ctx = voice.context ?? new AudioContext();
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      let h: Awaited<ReturnType<typeof sahneHazirla>>;
      try { h = await sahneHazirla(ctx, finalZorla); } catch (e) { if (canli) { setHazir('hata'); setHata((e as Error).message); } return; }
      if (!canli) return;
      const { plan, ayar, kaynaklar } = h;

      // Görüntü
      const gl = glRef.current!, hud = hudRef.current!;
      sahne = new SavasSahnesi(gl, ayar);
      const g = hud.getContext('2d')!;
      let olcek = 1, kutu = null as ReturnType<typeof kutular> | null;
      const boyut = () => {
        const w = window.innerWidth, hh = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
        sahne!.boyut(w, hh, dpr);
        hud.width = w * dpr; hud.height = hh * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
        olcek = Math.min(w, hh) / 1080 * (w > hh ? 1.25 : 1.1);
        if (hedef) kutu = kutular(hedef);
      };
      hedef = hedefleriBul();
      boyut();
      window.addEventListener('resize', boyut);
      temizlik.push(() => window.removeEventListener('resize', boyut));

      // Önizleme: tek kare (ses yok)
      if (onizleme != null) {
        // git(t): kareyi t'ye taşır, çizildikten sonra çözülür (uygulama arayüzüyle kare kare çekim için)
        let tOn = onizleme;
        let bekleyen: (() => void) | null = null;
        (window as any).__ultronSavas = {
          plan, durum: (t: number) => durum(plan, t), toplam: plan.toplam,
          git: (t: number) => new Promise<void>(ok => { tOn = t; bekleyen = ok; }),
        };
        // Aynı kare her karede yeniden çizilir (yeniden boyutlanınca tuval temizlenir)
        const tekKare = () => {
          if (!canli) return;
          const d = durum(plan, tOn);
          sahne!.render(d); uygula(d, hedef!);
          hudCiz(g, d, { w: window.innerWidth, h: window.innerHeight, olcek, font: FONT, kayit: false, kutular: kutu, altyazi: false });
          if (karartRef.current) karartRef.current.style.opacity = String(d.karart * KARART_CARPAN);
          if (bekleyen) { const ok = bekleyen; bekleyen = null; requestAnimationFrame(() => ok()); }
          raf = requestAnimationFrame(tekKare);
        };
        setHazir('oynuyor');
        raf = requestAnimationFrame(tekKare);
        return;
      }

      // Tarayıcı sesi kilitliyse (dokunuş yok): ilk dokunuşa kadar bekle; saat ses saatidir, kilitliyken ilerlemez
      if (ctx.state !== 'running') {
        setHazir('kilitli');
        await new Promise<void>(ok => {
          const ac = () => { void ctx.resume().then(() => { if (ctx.state === 'running') { window.removeEventListener('pointerdown', ac, true); window.removeEventListener('keydown', ac, true); ok(); } }); };
          window.addEventListener('pointerdown', ac, true); window.addEventListener('keydown', ac, true);
          temizlik.push(() => { window.removeEventListener('pointerdown', ac, true); window.removeEventListener('keydown', ac, true); });
        });
        if (!canli) return;
      }

      // Ses: üç veri yolu → usta → hoparlör
      usta = ctx.createGain(); usta.gain.value = 0.95; usta.connect(ctx.destination);
      const yollar = { ses: ctx.createGain(), muzik: ctx.createGain(), efekt: ctx.createGain() };
      yollar.ses.gain.value = 1; yollar.muzik.gain.value = 0.8; yollar.efekt.gain.value = 0.85;
      Object.values(yollar).forEach(y => y.connect(usta!));
      const t0 = ctx.currentTime + 0.35;
      const mavi = plan.olaylar.find(o => o.olay === 'maviKivilcim')?.t ?? Infinity;
      sesKur(ctx, plan, kaynaklar, t0, yollar, [-Infinity, plan.final === 'B' ? mavi : Infinity]);
      setHazir('oynuyor');

      // Final B: parola (ses ya da klavye)
      let parolaAlindi = plan.final !== 'B', bekleme = 0, yazilan = '', dinliyor = false;
      const parola = sade(h.dur.parola);
      const parolaKontrol = (metin: string) => {
        if (parolaAlindi || !sade(metin).includes(parola)) return false;
        parolaAlindi = true;
        try { tanima?.stop(); } catch { /* */ }
        bekleme = ctx.currentTime - t0 - (mavi - 0.001);
        sesKur(ctx, plan, kaynaklar, t0 + bekleme, yollar, [mavi, Infinity]);
        return true;
      };
      const tus = (e: KeyboardEvent) => {
        if (parolaAlindi || !(durum(plan, Math.max(0, ctx.currentTime - t0 - bekleme)).parolaBekle)) return;
        if (e.key === 'Enter') { parolaKontrol(yazilan); yazilan = ''; }
        else if (e.key === 'Backspace') yazilan = yazilan.slice(0, -1);
        else if (e.key.length === 1) yazilan += e.key;
        e.preventDefault();
      };
      window.addEventListener('keydown', tus, true);
      temizlik.push(() => window.removeEventListener('keydown', tus, true));
      const dinle = () => {
        if (parolaAlindi || !canli || !speechRecognitionSupported()) return;
        tanima = createRecognizer({ onInterim: t => { if (parolaKontrol(t)) tanima?.stop(); }, onFinal: t => parolaKontrol(t), onEnd: () => { dinliyor = false; if (!parolaAlindi && canli) setTimeout(dinle, 200); }, onError: () => { dinliyor = false; } });
        try { tanima?.start(); dinliyor = true; } catch { dinliyor = false; }
      };

      // Kare döngüsü: zaman = ses saati; kalite otomatik düşer
      const fps: number[] = [];
      let son = performance.now(), dusuk = false, dinlemeBasladi = false;
      const kare = () => {
        if (!canli) return;
        const simdi = performance.now();
        fps.push(1000 / Math.max(1, simdi - son)); son = simdi;
        if (fps.length > 90) fps.shift();
        if (!dusuk && fps.length >= 90) { const m = [...fps].sort((a, b) => a - b)[45]; if (m < ayar.kalite.dusurEsik) { dusuk = true; sahne!.kalite(true); console.info(`[ultron] kalite düşürüldü (medyan ${m.toFixed(0)} fps)`); } }
        let t = Math.max(0, ctx.currentTime - t0 - bekleme);
        let d;
        if (!parolaAlindi && t >= mavi - 0.001) {
          t = mavi - 0.001;
          d = durum(plan, t);
          d.t = ctx.currentTime - t0; // durum sabit, titreşimler canlı
          if (!dinlemeBasladi) { dinlemeBasladi = true; dinle(); }
        } else d = durum(plan, t);
        sahne!.render(d);
        uygula(d, hedef!);
        hudCiz(g, d, { w: window.innerWidth, h: window.innerHeight, olcek, font: FONT, kayit: false, kutular: kutu, altyazi: !!d.altyazi && !h.sesli.has(plan.replikler.find(r => d.t >= r.bas && d.t < r.bas + r.sure)?.id ?? ''), parola: { metin: h.dur.parola, yazilan, dinliyor } });
        if (karartRef.current) karartRef.current.style.opacity = d.karart.toFixed(3);
        if (t >= plan.toplam) { kapat(plan.final === 'A' ? 'goz' : 'normal'); return; }
        raf = requestAnimationFrame(kare);
      };
      raf = requestAnimationFrame(kare);
      (window as any).__ultronSavas = { plan, t: () => ctx.currentTime - t0 - bekleme, fps: () => [...fps].sort((a, b) => a - b)[fps.length >> 1] ?? 0 };
    })();

    return () => { canli = false; if (!kapandi) { temizlik.forEach(f => f()); temizlik.length = 0; kapandi = true; cancelAnimationFrame(raf); try { usta?.disconnect(); } catch { /* */ } try { tanima?.stop(); } catch { /* */ } temizle(hedef); temizlik.forEach(f => f()); sahne?.dispose(); } };
  }, [finalZorla, onizleme]);

  // Katmanlar body altında ayrı ayrı: tuvalin "screen" karışımı arkadaki uygulamayla yapılsın (ortak kapsayıcı
  // kendi katman bağlamını oluşturur ve karışımı yalıtırdı)
  return createPortal(
    <>
      <div className="ultron-savas-karart" ref={karartRef} style={{ opacity: 0 }} />
      <canvas className="ultron-savas-gl" ref={glRef} />
      <canvas className="ultron-savas-hud" ref={hudRef} />
      <div className="ultron-savas-ust" role="presentation">
        {hazir === 'yukleniyor' && <div className="u-durum">bağlantı kuruluyor…</div>}
        {hazir === 'kilitli' && <div className="u-durum">başlatmak için bir yere dokunun</div>}
        {hazir === 'hata' && <div className="u-durum">Savaş Modu açılamadı: {hata} · Esc</div>}
        {onizleme == null && (
          <button className="u-kapat" onPointerDown={e => e.stopPropagation()} onClick={() => kapatRef.current('iptal')} aria-label="Savaş Modunu kapat" title="Kapat (Esc)">✕</button>
        )}
        <div className="u-ipucu">Esc · iptal</div>
      </div>
    </>,
    document.body,
  );
}

/** Plan özeti (geliştirici aracı / test) */
export const planOzeti = (p: Plan) => p.vuruslar.map(v => `${v.no}:${v.bas.toFixed(1)}-${v.bit.toFixed(1)}`).join(' ');
