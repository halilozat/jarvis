// Kitaplığım · telefon kamerası. Telefonun arka kamerasıyla rafa bakın: telefon kısa süre sabit durunca kare taranır,
// karede görünen kayıtlı kitaplar holografik çerçeveyle işaretlenir; dokununca kitabın sayfası açılır. Kitaplıkta
// olmayan ama adı net okunan kitaplar kitaplığa eklenir (mor çerçeve, "＋ eklendi"). Telefon
// oynayınca kutular soluklaşır ve yeniden taranır. Tanıma görüntü modeliyle (sunucu: /api/kitaplik/kamera); gerçek
// zamanlı değildir, bir tarama birkaç saniye sürer. Kare diske yazılmaz.
import { useEffect, useRef, useState } from 'react';
import { recognizeShelf, type Kitap, type Kutu } from '../lib/library';

interface Bulunan { id: string; ad: string; yazar: string | null; kutu: Kutu; emin: number; yeni?: boolean }

/** Hareket ölçümü için küçük gri kare */
const KW = 48, KH = 27;
function gri(v: HTMLVideoElement, c: HTMLCanvasElement): Float32Array {
  c.width = KW; c.height = KH;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(v, 0, 0, KW, KH);
  const d = g.getImageData(0, 0, KW, KH).data;
  const out = new Float32Array(KW * KH);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  return out;
}
const fark = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

export function ShelfCamera({ kitaplar, onOpen, onAdded, onClose }: { kitaplar: Kitap[]; onOpen(k: Kitap): void; onAdded(): void; onClose(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [durum, setDurum] = useState('kamera açılıyor…');
  const [bulunan, setBulunan] = useState<Bulunan[]>([]);
  const [eski, setEski] = useState(false);
  const [kare, setKare] = useState<{ w: number; h: number } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [boyut, setBoyut] = useState({ W: window.innerWidth, H: window.innerHeight });
  const elle = useRef(false);
  // Bu oturumda eklenenler (kitaplar prop'u yenilenene kadar da dokunulabilsin)
  const [eklenen, setEklenen] = useState<Kitap[]>([]);
  const [toplamYeni, setToplamYeni] = useState(0);

  useEffect(() => {
    const v = video.current!;
    let stream: MediaStream | null = null, alive = true, timer = 0;
    const kucuk = document.createElement('canvas');
    let onceki: Float32Array | null = null, taranan: Float32Array | null = null, sabitAt = 0, mesgul = false, sonTarama = 0;
    const onResize = () => setBoyut({ W: window.innerWidth, H: window.innerHeight });
    window.addEventListener('resize', onResize);

    const tara = async () => {
      if (mesgul || !v.videoWidth) return;
      mesgul = true; elle.current = false;
      setDurum('taranıyor…');
      try {
        const c = document.createElement('canvas');
        const s = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        taranan = gri(v, kucuk);
        const r = await recognizeShelf(c.toDataURL('image/jpeg', 0.85));
        if (!alive) return;
        setKare({ w: v.videoWidth, h: v.videoHeight });
        setBulunan(r.bulunan);
        setEski(false);
        const yeni = r.eklenen?.length ?? 0;
        if (yeni) { setEklenen(l => [...l, ...r.eklenen]); setToplamYeni(n => n + yeni); onAdded(); }
        const kayitli = r.bulunan.length - r.bulunan.filter(b => b.yeni).length;
        setDurum(r.bulunan.length
          ? [kayitli && `${kayitli} kayıtlı`, yeni && `${yeni} yeni kitap eklendi`].filter(Boolean).join(' · ') + ' · dokunun'
          : 'kitap adı okunamadı · biraz yaklaşın');
      } catch (e) {
        if (alive) setDurum(`tanınamadı: ${(e as Error).message}`);
      } finally {
        mesgul = false; sonTarama = performance.now();
      }
    };

    const dongu = () => {
      if (!alive) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const g = gri(v, kucuk), now = performance.now();
        const hareket = onceki ? fark(g, onceki) : 99;
        onceki = g;
        // Taranan kareden uzaklaştı: kutular eskidi
        if (taranan && fark(g, taranan) > 14) setEski(true);
        if (hareket > 4) { sabitAt = now; if (!mesgul) setDurum(d => (d.startsWith('taranıyor') ? d : 'telefonu sabit tutun…')); }
        const yeniKare = !taranan || fark(g, taranan) > 14;
        if ((elle.current || (yeniKare && now - sabitAt > 700 && now - sonTarama > 2500)) && !mesgul) void tara();
      }
      timer = window.setTimeout(dongu, 160);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(s => {
        if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s; v.srcObject = s; v.muted = true;
        return v.play().then(() => { setDurum('telefonu rafa tutun'); dongu(); });
      })
      .catch(e => setHata(e?.name === 'NotAllowedError' ? 'Kamera izni verilmedi.' : `Kamera açılamadı: ${e?.message || e}. (Telefonda kamera yalnızca HTTPS adresinde çalışır.)`));
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); window.removeEventListener('resize', onResize); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- onAdded yalnızca kitaplığı yeniden yükler

  // Kare → ekran (object-fit: cover, ayna yok: arka kamera)
  const yerlestir = (k: Kutu) => {
    if (!kare) return null;
    const { W, H } = boyut;
    const s = Math.max(W / kare.w, H / kare.h), dw = kare.w * s, dh = kare.h * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
    return { left: ox + k[1] * dw, top: oy + k[0] * dh, width: (k[3] - k[1]) * dw, height: (k[2] - k[0]) * dh };
  };

  return (
    <div className="kp-kamera">
      <video ref={video} playsInline muted />
      <div className="kp-kamera-hud">
        {bulunan.map(b => {
          const r = yerlestir(b.kutu);
          const k = kitaplar.find(x => x.id === b.id) ?? eklenen.find(x => x.id === b.id);
          if (!r || !k) return null;
          return (
            <button key={b.id} className={'kp-tanindi ' + (b.yeni ? 'yeni' : k.durum) + (eski ? ' eski' : '')} style={r} onClick={() => onOpen(k)}>
              <span>{b.ad}<em>{b.yeni ? '＋ kitaplığa eklendi' : k.durum === 'bitti' ? 'okundu' : k.durum}{k.notlar.length + k.alintilar.length ? ` · ${k.notlar.length + k.alintilar.length} kayıt` : ''}</em></span>
            </button>
          );
        })}
      </div>
      <header className="kp-kamera-ust">
        <b>KİTAPLIK KAMERASI</b>
        <span>{hata ?? durum}{toplamYeni > 0 && !hata && <i className="kp-kamera-yeni">bu oturumda {toplamYeni} kitap eklendi</i>}</span>
        <button onClick={() => { elle.current = true; }} disabled={!!hata}>⟳ Tara</button>
        <button onClick={onClose} aria-label="Kapat">✕</button>
      </header>
    </div>
  );
}
