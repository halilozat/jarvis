// Toplantı Odası: Jarvis (cyan) ve Friday (turuncu) yan yana iki reaktör. Konuşanın reaktörü sesin seviyesiyle atar;
// itiraz anında aralarında kıvılcım çakar. Canlı modda mikrofon sürekli açıktır (panel kapanınca kapanır).
// Tuşlar: Esc kapat · G geliştirici (gecikme) · M mikrofon · Boşluk konuşanı durdur
import { useEffect, useRef, useState } from 'react';
import { clientId, headers } from '../lib/api';
import { voice } from '../lib/speech';
import { iz } from './iz';
import { toplantiBitir, toplantiDinle, toplantiKes, toplantiSoz } from './api';
import { CanliDinleyici } from './canli';
import { bosGorunum, Oynatici, ozetGecikme, type Gorunum, type Karakter } from './oynatici';
import './toplanti.css';

export interface ToplantiProps {
  device: string;
  onClose(): void;
  flash(m: string): void;
  /** Panel canlı modda açıldı (mikrofon hemen açılır) */
  canli?: boolean;
}

const DURUM: Record<string, string> = { dinliyor: 'DİNLİYOR', jarvis: 'JARVIS KONUŞUYOR', friday: 'FRIDAY KONUŞUYOR', uzlasma: 'UZLAŞMA', tutanak: 'TUTANAK', bitti: 'TARTIŞMA BİTTİ', hazirlaniyor: 'DÜŞÜNÜYOR…', kapandi: 'KAPANDI' };
/** Sessizlik süresi: ?vad=500 > .env VAD_SILENCE_MS (sunucudan) > 700 ms */
const VAD_PARAM = Number(new URLSearchParams(location.search).get('vad')) || 0;

export default function ToplantiOdasi(p: ToplantiProps) {
  const [g, setG] = useState<Gorunum>(bosGorunum);
  const [mik, setMik] = useState(false);
  const [gelistirici, setGelistirici] = useState(new URLSearchParams(location.search).get('gelistirici') === '1');
  const [yazi, setYazi] = useState('');
  const [ara, setAra] = useState('');
  const [tutanakGizli, setTutanakGizli] = useState<string | null>(null);
  const oyn = useRef<Oynatici | null>(null);
  const din = useRef<CanliDinleyici | null>(null);
  const mikAciliyor = useRef(false);
  const tuval = useRef<HTMLCanvasElement>(null);
  const dalga = useRef<HTMLCanvasElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const [sessizlik, setSessizlik] = useState(VAD_PARAM || 700);
  useEffect(() => { if (!VAD_PARAM) fetch('/api/toplanti/durum', { headers: headers() }).then(r => r.json()).then(d => { if (d.vadMs) setSessizlik(d.vadMs); }).catch(() => {}); }, []);
  const gRef = useRef(g);
  useEffect(() => { gRef.current = g; }, [g]);

  // Olaylar → oynatıcı (yalnızca toplantıyı başlatan cihaz ses çalar)
  useEffect(() => {
    const o = new Oynatici(setG);
    oyn.current = o;
    toplantiDinle(e => {
      if (e.olay === 'acildi') {
        o.sesli = e.origin ? e.origin === clientId : p.device === 'masaustu';
        iz(`toplantı açıldı · bu cihaz ${o.sesli ? 'sesli' : 'SESSİZ'} · ses bağlamı ${voice.context?.state ?? 'yok'}`);
      }
      if (e.olay === 'hata') iz(`sunucu hatası: ${e.mesaj}`);
      o.ekle(e);
    });
    return () => { toplantiDinle(null); o.durdur(false); };
  }, [p.device]);

  useEffect(() => { liste.current?.scrollTo({ top: liste.current.scrollHeight, behavior: 'smooth' }); }, [g.satirlar]);

  const gonder = (t: string) => {
    const k = t.toLocaleLowerCase('tr');
    if (/^(bekle|dur|sus)\b/.test(k)) { const son = oyn.current?.durdur(); void toplantiKes(son ?? null); return; }
    // Toplantı yoksa sunucu açar (istemci kendi durumuna bakıp yeni toplantı başlatmaz: sıfırlanma olmaz)
    iz(`söz gönderiliyor (${t.length} karakter) · panel durumu ${gRef.current.durum}`);
    void toplantiSoz(t).catch(e => { iz(`söz gönderilemedi: ${e.message}`); p.flash(e.message); });
  };
  // Ses kilidi: panelde her tıklama/tuş sesi açar (tarayıcı, dokunuş olmadan açılan ses bağlamını askıda tutar;
  // panel tuşları uygulamanın genel ses açma kodundan önce yakalandığı için burada da açılır)
  useEffect(() => {
    const ac = () => { voice.unlock(); if (voice.context?.state === 'suspended') void voice.context.resume(); };
    window.addEventListener('pointerdown', ac, true);
    window.addEventListener('keydown', ac, true);
    return () => { window.removeEventListener('pointerdown', ac, true); window.removeEventListener('keydown', ac, true); };
  }, []);

  // Mikrofon (canlı toplantı)
  const mikAc = async () => {
    // Açılış sürerken ikinci çağrı (React geliştirme modunda efekt iki kez çalışır) ikinci bir dinleyici kurmasın:
    // iki dinleyici her sözü iki kez gönderir
    if (din.current || mikAciliyor.current) return;
    mikAciliyor.current = true;
    const d = new CanliDinleyici({
      sessizlikMs: sessizlik,
      konusuyorMu: () => !!oyn.current?.konusuyor,
      sonCumleler: () => oyn.current?.sonCumleler ?? [],
      onAraGir: () => { const son = oyn.current?.durdur(); void toplantiKes(son ?? null).catch(() => {}); },
      onAra: t => setAra(t),
      onSoz: (t, sustu) => { setAra(''); if (oyn.current) oyn.current.sustu = sustu; gonder(t); },
      onHata: m => p.flash(m),
    });
    try { await d.baslat(); din.current = d; setMik(true); }
    catch (e: any) { p.flash(`Mikrofon açılamadı: ${e?.message || e}`); }
    finally { mikAciliyor.current = false; }
  };
  const mikKapat = () => { din.current?.durdur(); din.current = null; setMik(false); setAra(''); };
  useEffect(() => {
    if (p.canli) void mikAc();
    return () => { din.current?.durdur(); din.current = null; }; // panel kapanınca mikrofon kapanır
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bitir = () => { void toplantiBitir().catch(e => p.flash(e.message)); };

  // Klavye
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') { if (e.key === 'Escape') (t as HTMLInputElement).blur(); return; }
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); p.onClose(); }
      else if (e.code === 'KeyG') { e.stopImmediatePropagation(); setGelistirici(v => !v); }
      else if (e.code === 'KeyM') { e.stopImmediatePropagation(); if (mik) mikKapat(); else void mikAc(); }
      else if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); const son = oyn.current?.durdur(); void toplantiKes(son ?? null); }
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  });

  // Reaktörler ve kıvılcım (tuval)
  useEffect(() => {
    let raf = 0;
    const seviye: Record<Karakter, number> = { jarvis: 0, friday: 0 };
    const ciz = (now: number) => {
      raf = requestAnimationFrame(ciz);
      const c = tuval.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, r.width, r.height);
      const G = gRef.current;
      const renk = { jarvis: G.karakterler?.jarvis.renk ?? '#4de1ff', friday: G.karakterler?.friday.renk ?? '#ff9d4d' };
      const lv = voice.level();
      for (const k of ['jarvis', 'friday'] as Karakter[]) seviye[k] += ((G.konusan === k ? lv : 0) - seviye[k]) * 0.3;
      const R = Math.min(r.height * 0.27, r.width * 0.12);
      const merkez = { jarvis: { x: r.width * 0.27, y: r.height * 0.5 }, friday: { x: r.width * 0.73, y: r.height * 0.5 } };
      // Kıvılcım: itiraz anında iki reaktör arasında titreşen çizgi
      const kv = (now - G.kivilcim) / 900;
      if (G.kivilcim && kv < 1) {
        x.save();
        x.strokeStyle = `rgba(255, 230, 180, ${1 - kv})`;
        x.shadowColor = '#ffb547'; x.shadowBlur = 18; x.lineWidth = 2.5;
        x.beginPath();
        const a = merkez.jarvis, b = merkez.friday, n = 14;
        x.moveTo(a.x + R, a.y);
        for (let i = 1; i < n; i++) { const t = i / n; x.lineTo(a.x + R + (b.x - R - a.x - R) * t, a.y + (Math.random() - 0.5) * 34 * (1 - kv)); }
        x.lineTo(b.x - R, b.y);
        x.stroke();
        x.restore();
      }
      for (const k of ['jarvis', 'friday'] as Karakter[]) {
        const m = merkez[k], s = seviye[k], aktif = G.konusan === k;
        x.save();
        x.globalAlpha = aktif ? 1 : G.konusan ? 0.35 : 0.6;
        // Dış halkalar
        for (let i = 0; i < 3; i++) {
          x.strokeStyle = renk[k]; x.globalAlpha *= 1; x.lineWidth = i === 0 ? 2 : 1;
          x.setLineDash(i === 1 ? [4, 8] : []);
          x.beginPath(); x.arc(m.x, m.y, R * (1 + i * 0.16) + s * 18 * (i + 1), now / (2000 + i * 900) * (i % 2 ? -1 : 1), now / (2000 + i * 900) * (i % 2 ? -1 : 1) + Math.PI * 1.6); x.stroke();
        }
        x.setLineDash([]);
        // Çekirdek
        const gr = x.createRadialGradient(m.x, m.y, 0, m.x, m.y, R * (0.55 + s * 0.35));
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, renk[k]); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.shadowColor = renk[k]; x.shadowBlur = 30 + s * 50;
        x.beginPath(); x.arc(m.x, m.y, R * (0.55 + s * 0.35), 0, Math.PI * 2); x.fill();
        x.restore();
      }
      // Kullanıcı dalga formu
      const d = dalga.current, an = din.current?.analiz;
      if (d) {
        const dr = d.getBoundingClientRect();
        if (d.width !== Math.round(dr.width * dpr)) { d.width = Math.round(dr.width * dpr); d.height = Math.round(dr.height * dpr); }
        const y = d.getContext('2d')!;
        y.setTransform(dpr, 0, 0, dpr, 0, 0);
        y.clearRect(0, 0, dr.width, dr.height);
        if (an) {
          const b = new Float32Array(an.fftSize);
          an.getFloatTimeDomainData(b);
          y.strokeStyle = 'rgba(232, 246, 255, 0.85)'; y.lineWidth = 1.6; y.beginPath();
          for (let i = 0; i < dr.width; i++) { const v = b[Math.floor((i / dr.width) * b.length)] * 3; y.lineTo(i, dr.height / 2 + v * dr.height); }
          y.stroke();
        }
      }
    };
    raf = requestAnimationFrame(ciz);
    return () => cancelAnimationFrame(raf);
  }, []);

  const k = g.karakterler;
  const gz = ozetGecikme(g.gecikmeler);
  const durumMetni = mik && g.durum === 'dinliyor' ? 'DİNLİYOR' : DURUM[g.durum] ?? g.durum.toUpperCase();

  return (
    <div className="tp" role="dialog" aria-label="Toplantı Odası">
      <header className="tp-ust">
        <div className="tp-baslik"><b>TOPLANTI ODASI</b>{g.demo && <span className="tp-demo">DEMO</span>}</div>
        <span className={`tp-cip d-${g.durum}${mik && g.durum === 'dinliyor' ? ' dinliyor' : ''}`}>{durumMetni}</span>
        <div className="tp-uzlasma" title="Hakem çağrısına göre uzlaşma">
          <span>UZLAŞMA</span>
          <div className="tp-bar"><i style={{ width: `${g.uzlasma ?? 0}%` }} /></div>
          <b>{g.uzlasma === null ? '—' : `%${g.uzlasma}`}</b>
        </div>
        <div className="tp-maliyet" title="Bu oturumun yaklaşık token ve seslendirme karakteri">≈{g.maliyet.token.toLocaleString('tr-TR')} token · {g.maliyet.tts.toLocaleString('tr-TR')} ses karakteri{g.sinirlar ? ` · tur ${g.tur}/${g.sinirlar.tur}` : ''}</div>
        <button className="tp-kapat" onClick={p.onClose} aria-label="Kapat">✕</button>
      </header>

      <div className="tp-govde">
        <div className="tp-sahne">
          <canvas ref={tuval} className="tp-tuval" />
          <div className="tp-ad j"><b style={{ color: k?.jarvis.renk }}>JARVIS</b><span>{g.modeller?.jarvis ?? '…'}</span></div>
          <div className="tp-ad f"><b style={{ color: k?.friday.renk }}>FRIDAY</b><span>{g.modeller?.friday ?? '…'}</span></div>
          {g.modeller?.ayniAile && <div className="tp-uyari">Jarvis ve Friday aynı model ailesinde: JARVIS_MODEL / FRIDAY_MODEL ile farklı iki model seçin, tartışma daha gerçek olur.</div>}
          <div className={`tp-kullanici${mik ? ' acik' : ''}`}>
            <canvas ref={dalga} />
            <span>{mik ? (ara || 'mikrofon açık · konuşun ya da sözü kesin') : 'mikrofon kapalı (M)'}</span>
          </div>
        </div>
        <div className="tp-dokum" ref={liste}>
          {g.satirlar.map(s => (
            <div key={s.id} className={`tp-satir k-${s.kim}${s.tamam ? '' : ' canli'}`}>
              <b style={s.kim !== 'user' ? { color: k?.[s.kim].renk } : undefined}>{s.kim === 'user' ? 'SİZ' : s.kim === 'jarvis' ? 'JARVIS' : 'FRIDAY'}</b>
              <span>{s.metin || '…'}</span>
            </div>
          ))}
          {g.sonuc && (
            <div className="tp-sonuc">
              <b>ORTAK SONUÇ · güven {g.sonuc.confidence}</b>
              {g.sonuc.agreed.map((x, i) => <div key={`a${i}`}>✓ {x}</div>)}
              {g.sonuc.disagreed.map((x, i) => <div key={`d${i}`} className="ayrilik">≠ {x}</div>)}
              <div className="oneri">→ {g.sonuc.recommendation}</div>
            </div>
          )}
          {g.hata && <div className="tp-hata">{g.hata}</div>}
        </div>
      </div>

      {g.tutanak && tutanakGizli !== g.tutanak.dosya && (
        <aside className="tp-tutanak">
          <div className="tp-tutanak-ust"><b>TUTANAK</b><span>{g.tutanak.date}{g.tutanak.dosya ? ` · ${g.tutanak.dosya}` : ''}</span><button onClick={() => setTutanakGizli(g.tutanak!.dosya ?? '')} aria-label="Tutanağı kapat">✕</button></div>
          <h2>{g.tutanak.title}</h2>
          <p className="ozet">{g.tutanak.summary}</p>
          <div className="tp-kolonlar">
            <div><h3>Kararlar</h3><ul>{g.tutanak.decisions.map((x, i) => <li key={i}>{x}</li>)}{!g.tutanak.decisions.length && <li className="bos">—</li>}</ul></div>
            <div><h3>Açık sorular</h3><ul>{g.tutanak.open_questions.map((x, i) => <li key={i}>{x}</li>)}{!g.tutanak.open_questions.length && <li className="bos">—</li>}</ul></div>
            <div><h3>Yapılacaklar</h3><ul>{g.tutanak.action_items.map((x, i) => <li key={i}><b>{x.who || '—'}:</b> {x.what}{x.when ? <em> · {x.when}</em> : null}</li>)}{!g.tutanak.action_items.length && <li className="bos">—</li>}</ul></div>
          </div>
        </aside>
      )}

      {gelistirici && (
        <div className="tp-gelistirici">
          <b>GECİKME</b>
          <div>sustuktan ilk sese: {gz ? `medyan ${gz.medyan} ms · p90 ${gz.p90} ms · ${gz.n} tur` : '— (canlı modda ölçülür)'}</div>
          <div>son tur: ilk token {g.sunucuGecikme?.ilkToken ?? '—'} ms · ilk cümle {g.sunucuGecikme?.ilkCumle ?? '—'} ms · TTS {g.sunucuGecikme?.tts ?? '—'} ms</div>
          <div>hakem: {g.modeller?.hakem ?? '—'} · VAD sessizlik {sessizlik} ms</div>
        </div>
      )}

      <footer className="tp-alt">
        <button className={`tp-mik${mik ? ' acik' : ''}`} onClick={() => (mik ? mikKapat() : void mikAc())} title="Mikrofon (M)">{mik ? '● CANLI' : '○ MİKROFON'}</button>
        <form className="tp-yaz" onSubmit={e => { e.preventDefault(); if (yazi.trim()) { gonder(yazi.trim()); setYazi(''); } }}>
          <input value={yazi} onChange={e => setYazi(e.target.value)} placeholder='Yazın ya da konuşun: "Friday, sen ne düşünüyorsun?"' enterKeyHint="send" />
        </form>
        <button className="tp-dugme" onClick={() => { const son = oyn.current?.durdur(); void toplantiKes(son ?? null); }} title="Konuşanı durdur (Boşluk)">Dur</button>
        <button className="tp-dugme ana" onClick={bitir} disabled={!g.id || g.durum === 'kapandi' || g.durum === 'tutanak'}>Toplantıyı bitir</button>
      </footer>
    </div>
  );
}
