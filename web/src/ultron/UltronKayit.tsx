// Ultron Paketi · kayıt / demo modu (video çekimi için). ?ultron-record=war|eye|full&aspect=9:16|16:9[&snapshot=…][&ultron-preview=28.5]
// Kareler sabit 30 fps'te deterministik çizilir (render(t)), PNG olarak sunucuya yazılır (server/data/ultron-kayit/…).
// Ses OfflineAudioContext'te çizilir: seslendirme, müzik, efekt ayrı WAV + karışım. Temiz plaka: altyazı yok.
// Göz kaydında o anki gerçek veriler snapshot.json'a yazılır; aynı snapshot'la kayıt tekrarlanabilir.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gozKatmanlar, gozSor, kayitBasla, kayitBitir, kayitKare, kayitSes, konusYolu, sesCoz } from './api';
import { hudCiz } from './hud';
import { SavasSahnesi } from './sahne';
import { fonDrone, kirp, replik, sesKur, sinirlayici, wav, yankiKur } from './ses';
import { FONT, sahneHazirla } from './SavasModu';
import { durum, SEKMELER } from './zaman';
import { GozKuresi } from './goz/kure';
import { gozHudCiz } from './goz/hud';
import './ultron.css';

const Q = new URLSearchParams(location.search);
const SR = 48000;
/** Göz açılışında anlatımın başladığı an (küre ve katmanlar önce belirir) */
const GOZ_ANLATIM = 2.6;

function arkaPlan(g: CanvasRenderingContext2D, w: number, h: number, karart: number, tema: number) {
  // Kayıtta uygulama arkada yok: koyu HUD zemini (tema ile maviden turuncuya)
  const a = 1 - karart;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  if (a <= 0.01) return;
  const r = Math.round(3 + 14 * tema), gg = Math.round(10 - 6 * tema), b = Math.round(20 - 16 * tema);
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  gr.addColorStop(0, `rgba(${r * 2},${gg * 2},${b * 2},${a})`); gr.addColorStop(1, `rgba(${r},${gg},${b},${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = tema > 0.5 ? `rgba(255,106,26,${0.07 * a})` : `rgba(61,180,255,${0.07 * a})`; g.lineWidth = 1;
  const adim = Math.min(w, h) / 18;
  g.beginPath();
  for (let x = 0; x < w; x += adim) { g.moveTo(x, 0); g.lineTo(x, h); }
  for (let y = 0; y < h; y += adim) { g.moveTo(0, y); g.lineTo(w, y); }
  g.stroke();
}

const blob = (c: HTMLCanvasElement) => new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('PNG üretilemedi'))), 'image/png'));

export default function UltronKayit({ mod }: { mod: 'war' | 'eye' | 'full' }) {
  const onRef = useRef<HTMLCanvasElement>(null);
  const [durumMetin, setDurum] = useState('hazırlanıyor…');
  const basladi = useRef(false);

  useEffect(() => {
    if (basladi.current) return;
    basladi.current = true;
    (async () => {
      const oran = Q.get('aspect') === '9:16' ? '9:16' : '16:9';
      const [W, H] = oran === '9:16' ? [1080, 1920] : [1920, 1080];
      const onizleme = Q.get('ultron-preview') != null ? Number(Q.get('ultron-preview')!.replace(/^t=/, '')) : null;
      const k = await kayitBasla(onizleme != null ? 'war' : mod, oran, Q.get('snapshot'));
      const fps = 30;
      const bilesik = document.createElement('canvas'); bilesik.width = W; bilesik.height = H;
      const bg = bilesik.getContext('2d')!;
      const on = onRef.current!; on.width = W / 2; on.height = H / 2;
      const og = on.getContext('2d')!;
      let no = 0;
      const bekleyen: Promise<void>[] = [];
      const kareGonder = async () => {
        og.drawImage(bilesik, 0, 0, on.width, on.height);
        const b = await blob(bilesik);
        const n = no++;
        bekleyen.push(kayitKare(k.ad, n, b));
        if (bekleyen.length >= 4) await bekleyen.shift();
      };

      // ---------------- Savaş Modu
      const savasVar = mod !== 'eye' || onizleme != null;
      const final = mod === 'full' ? 'A' : undefined;
      const sesHazirlik = new OfflineAudioContext(6, SR, SR); // yalnızca çözmek için
      const sv = savasVar ? await sahneHazirla(sesHazirlik, final) : null;
      const savasSure = sv ? sv.plan.toplam : 0;

      // ---------------- Göz (veri + anlatım)
      const gozVar = mod !== 'war' && onizleme == null;
      let gozVeri = null as Awaited<ReturnType<typeof gozKatmanlar>> | null;
      let anlatim: AudioBuffer | null = null, anlatimMetin = '';
      if (gozVar) {
        gozVeri = await gozKatmanlar(k.snapshot);
        const c = await gozSor('', { snapshot: k.snapshot });
        anlatimMetin = c.metin ?? '';
        anlatim = anlatimMetin ? await sesCoz(sesHazirlik, konusYolu(anlatimMetin)).catch(() => null) : null;
      }
      const anlatimK = anlatim ? kirp(anlatim) : null;
      const gozSure = gozVar ? GOZ_ANLATIM + (anlatimK ? anlatimK.sure / 0.93 : 8) + 2.5 : 0;

      // ---------------- Kareler
      if (sv) {
        const gl = document.createElement('canvas'); gl.width = W; gl.height = H;
        const sahne = new SavasSahnesi(gl, sv.ayar, { kayit: true });
        sahne.boyut(W, H, 1);
        const hud = document.createElement('canvas'); hud.width = W; hud.height = H;
        const hg = hud.getContext('2d')!;
        const olcek = Math.min(W, H) / 1080 * (W > H ? 1.25 : 1.1);
        const ciz = (t: number) => {
          const d = durum(sv.plan, t);
          sahne.render(d);
          hudCiz(hg, d, { w: W, h: H, olcek, font: FONT, kayit: true, kutular: null, altyazi: false });
          arkaPlan(bg, W, H, d.karart, d.tema);
          bg.globalCompositeOperation = 'screen'; bg.drawImage(gl, 0, 0); bg.globalCompositeOperation = 'source-over';
          bg.drawImage(hud, 0, 0);
        };
        if (onizleme != null) {
          ciz(onizleme); await kareGonder(); await Promise.all(bekleyen);
          const r = await kayitBitir(k.ad, { mod: 'onizleme', t: onizleme, oran, fps });
          setDurum(`Önizleme karesi yazıldı: ${r.klasor}`);
          sahne.dispose();
          return;
        }
        const n = Math.ceil(savasSure * fps);
        for (let i = 0; i < n; i++) {
          ciz(i / fps);
          await kareGonder();
          if (i % 15 === 0) setDurum(`Savaş Modu · kare ${i + 1}/${n}`);
        }
        sahne.dispose();
      }
      if (gozVar && gozVeri) {
        const gl = document.createElement('canvas'); gl.width = W; gl.height = H;
        const kure = new GozKuresi(gl, { kayit: true });
        kure.boyut(W, H, 1);
        kure.veri(gozVeri);
        const hud = document.createElement('canvas'); hud.width = W; hud.height = H;
        const hg = hud.getContext('2d')!;
        const an0 = new Date(gozVeri.zaman).getTime();
        const veri = anlatim?.getChannelData(0);
        const seviye = (t: number) => {
          if (!veri || !anlatimK || t < GOZ_ANLATIM) return 0;
          const i = Math.floor((anlatimK.bas + (t - GOZ_ANLATIM) * 0.93) * anlatim!.sampleRate);
          if (i >= veri.length) return 0;
          let s = 0; const n = 1024;
          for (let j = i; j < Math.min(veri.length, i + n); j++) s += veri[j] * veri[j];
          return Math.min(1, Math.sqrt(s / n) * 6);
        };
        const n = Math.ceil(gozSure * fps);
        for (let i = 0; i < n; i++) {
          const t = i / fps;
          kure.render(t, { acilis: mod === 'full' ? Math.max(t, 1.2) : t, w: W, h: H, an: new Date(an0 + t * 1000) });
          gozHudCiz(hg, { w: W, h: H, t, veri: gozVeri, seviye: seviye(t), etiketler: kure.ekranEtiketleri, font: FONT, acilis: t });
          bg.fillStyle = '#000'; bg.fillRect(0, 0, W, H);
          bg.globalCompositeOperation = 'screen'; bg.drawImage(gl, 0, 0); bg.globalCompositeOperation = 'source-over';
          bg.drawImage(hud, 0, 0);
          await kareGonder();
          if (i % 15 === 0) setDurum(`Ultron'un Gözü · kare ${i + 1}/${n}`);
        }
        kure.dispose();
      }
      await Promise.all(bekleyen);

      // ---------------- Ses (ayrı stem'ler + karışım)
      setDurum('ses çiziliyor…');
      const toplam = savasSure + gozSure;
      const ctx = new OfflineAudioContext(6, Math.ceil((toplam + 0.5) * SR), SR);
      const birles = ctx.createChannelMerger(6); birles.connect(ctx.destination);
      const yol = (kanal: number) => { const g = ctx.createGain(); const ay = ctx.createChannelSplitter(2); g.connect(ay); ay.connect(birles, 0, kanal); ay.connect(birles, 1, kanal + 1); return g; };
      const yollar = { ses: yol(0), muzik: yol(2), efekt: yol(4) };
      yollar.muzik.gain.value = 0.8; yollar.efekt.gain.value = 0.85;
      if (sv) {
        // Sesleri bu bağlamda yeniden çöz (bağlamlar arası tampon paylaşımı yerine)
        const kaynaklar = Object.fromEntries(await Promise.all(Object.entries(sv.kaynaklar).map(async ([id, kk]) => [id, kk] as const)));
        sesKur(ctx, sv.plan, kaynaklar, 0, yollar);
      }
      if (gozVar && anlatimK) {
        const sn = sinirlayici(ctx); sn.connect(yollar.ses);
        const y = yankiKur(ctx, sn);
        replik(ctx, { id: 'goz', kim: 'ultron', ton: 'sakin', metin: anlatimMetin, vurus: 0, bas: 0, sure: anlatimK.sure }, anlatimK, savasSure + GOZ_ANLATIM, sn, y);
      }
      if (gozVar) fonDrone(ctx, savasSure + (mod === 'full' ? 0 : 0.2), toplam, yollar.muzik);
      const r = await ctx.startRendering();
      const kanal = (i: number) => r.getChannelData(i);
      const stem = (a: number) => [kanal(a), kanal(a + 1)];
      const karisim = [0, 1].map(c => { const o = new Float32Array(r.length); for (const s of [0, 2, 4]) { const x = kanal(s + c); for (let i = 0; i < o.length; i++) o[i] += x[i]; } return o; });
      // Karışım tepe değere göre normalize (≤ 0,95); stem'ler olduğu gibi kalır
      let tepe = 0; for (const k of karisim) for (let i = 0; i < k.length; i += 3) tepe = Math.max(tepe, Math.abs(k[i]));
      if (tepe > 0.95) for (const k of karisim) for (let i = 0; i < k.length; i++) k[i] *= 0.95 / tepe;
      setDurum('ses yükleniyor…');
      await kayitSes(k.ad, 'seslendirme.wav', wav(stem(0), SR));
      await kayitSes(k.ad, 'muzik.wav', wav(stem(2), SR));
      await kayitSes(k.ad, 'efekt.wav', wav(stem(4), SR));
      await kayitSes(k.ad, 'karisim.wav', wav(karisim, SR));
      const bit = await kayitBitir(k.ad, { mod, oran, fps, kare: no, sure: toplam, savasSure, gozSure, final: sv?.plan.final ?? null, anlatim: anlatimMetin || null, sekmeler: SEKMELER });
      setDurum(`Bitti: ${no} kare · ${toplam.toFixed(1)} sn · ${bit.mp4 ? 'MP4 hazır' : 'PNG + WAV'} → ${bit.klasor}`);
      (window as any).__ultronKayit = { bitti: true, klasor: bit.klasor, kare: no };
    })().catch(e => { setDurum(`Kayıt hatası: ${(e as Error).message}`); (window as any).__ultronKayit = { bitti: true, hata: (e as Error).message }; });
  }, [mod]);

  return createPortal(
    <div className="ultron-savas kayit" style={{ background: '#000', display: 'grid', placeItems: 'center' }}>
      <canvas ref={onRef} style={{ position: 'static', width: 'auto', height: '80vh', maxWidth: '90vw', objectFit: 'contain' }} />
      <div className="ultron-kayit-ilerleme">{durumMetin}</div>
    </div>,
    document.body,
  );
}
