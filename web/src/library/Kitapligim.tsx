// Kitaplığım: kitaplıktaki bütün kayıtlar tek ekranda. Kapak ızgarası, arama, okunacak / okunuyor / okundu filtreleri,
// 6 bölüm (yakın çekim fotoğrafları), kitap sayfası (notlar, alıntılar, kayıt zaman çizelgesi) ve telefonda kitaplık
// kamerası. Açık kitap varken sesli komutlar ("not al: …", "okundu listesine ekle") o kitaba gider.
import { useEffect, useMemo, useState } from 'react';
import { addBook, coverUrl, getLibrary, type Bolum, type Durum, type Kitap } from '../lib/library';
import { BookSheet } from './BookSheet';
import { DURUM_AD, type YeniKayit } from './shared';
import { SectionsPanel } from './SectionsPanel';
import { SuggestionsPanel } from './SuggestionsPanel';
import { ShelfCamera } from './ShelfCamera';
import './kitapligim.css';

type Filtre = 'hepsi' | Durum;

export interface KitapligimProps {
  version: number;
  /** Jarvis yeni öneri yaptı (sesle): Öneriler sekmesi yenilenir */
  oneriVersion: number;
  flash(t: string): void;
  onClose(): void;
  /** Açık kitap değişti (sesli komutlar için) */
  onOpenBook(k: Kitap | null): void;
  /** Sesle eklenen son kayıt: açık kitapta harf harf yazılır */
  kalemKaydi: { kayit: { tip: 'not' | 'alinti' | 'durum' | 'sayfa'; metin?: string }; n: number; id?: string } | null;
}

/** Kapak: yüklenene kadar (ya da hiç yoksa) adlı ve yazarlı yer tutucu */
function Kapak({ k }: { k: Kitap }) {
  const [durum, setDurum] = useState<'yukleniyor' | 'var' | 'yok'>('yukleniyor');
  return (
    <>
      {durum !== 'var' && <div className="kp-kapak-yok"><b>{k.ad ?? 'Adsız'}</b><span>{k.yazar ?? ''}</span></div>}
      {k.ad && durum !== 'yok' && <img className={durum === 'var' ? 'yuklendi' : ''} src={coverUrl(k.id, k.kapak ?? '')} alt="" loading="lazy" onLoad={() => setDurum('var')} onError={() => setDurum('yok')} />}
    </>
  );
}

export default function Kitapligim(p: KitapligimProps) {
  const [kitaplar, setKitaplar] = useState<Kitap[] | null>(null);
  const [yil] = useState(() => new Date().getFullYear());
  const [bolumler, setBolumler] = useState<Bolum[]>([]);
  const [sekme, setSekme] = useState<'kitaplar' | 'bolumler' | 'oneriler'>('kitaplar');
  const [filtre, setFiltre] = useState<Filtre>('hepsi');
  const [bolumF, setBolumF] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [acik, setAcik] = useState<string | null>(null);
  const [kamera, setKamera] = useState(false);
  const [yeniAd, setYeniAd] = useState('');
  const [yeniYazar, setYeniYazar] = useState('');

  const yukle = () => getLibrary().then(k => { setKitaplar(k.kitaplar); setBolumler(k.bolumler ?? []); }).catch(e => { p.flash(e.message); setKitaplar([]); });
  useEffect(() => { void yukle(); }, [p.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const adli = useMemo(() => (kitaplar ?? []).filter(b => b.ad), [kitaplar]);
  const liste = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('tr');
    return adli
      .filter(b => filtre === 'hepsi' || b.durum === filtre)
      .filter(b => bolumF === null || b.bolum === bolumF)
      .filter(b => !n || `${b.ad} ${b.yazar ?? ''}`.toLocaleLowerCase('tr').includes(n))
      .sort((a, b) => ({ okunuyor: 0, okunacak: 1, bitti: 2 })[a.durum] - ({ okunuyor: 0, okunacak: 1, bitti: 2 })[b.durum] || a.ad!.localeCompare(b.ad!, 'tr'));
  }, [adli, filtre, bolumF, q]);
  const acikKitap = kitaplar?.find(b => b.id === acik) ?? null;
  useEffect(() => { p.onOpenBook(acikKitap); }, [acikKitap]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => p.onOpenBook(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Esc: önce kitap sayfası, sonra kamera, sonra Kitaplığım kapanır
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (acik) setAcik(null); else if (kamera) setKamera(false); else p.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const say = {
    toplam: adli.length,
    okunuyor: adli.filter(b => b.durum === 'okunuyor').length,
    okundu: adli.filter(b => b.durum === 'bitti').length,
    buYil: adli.filter(b => b.bittiAt && new Date(b.bittiAt).getFullYear() === yil).length,
    kayit: adli.reduce((s, b) => s + b.notlar.length + b.alintilar.length, 0),
  };
  const degisti = (k: Kitap) => setKitaplar(l => (l ?? []).map(b => (b.id === k.id ? k : b)));
  const ekle = () => {
    if (!yeniAd.trim()) return;
    addBook(yeniAd, yeniYazar || undefined)
      .then(r => { p.flash(r.yeni ? `${r.kitap.ad} eklendi` : `${r.kitap.ad} zaten kitaplıkta`); setYeniAd(''); setYeniYazar(''); void yukle(); setAcik(r.kitap.id); })
      .catch(e => p.flash(e.message));
  };
  const yeni: YeniKayit | null = p.kalemKaydi ? { tip: p.kalemKaydi.kayit.tip, metin: p.kalemKaydi.kayit.metin, n: p.kalemKaydi.n } : null;

  return (
    <div className="kp">
      <header className="kp-baslik">
        <h1>KİTAPLIĞIM</h1>
        <div className="kp-sayilar">
          <span><b>{say.toplam}</b>kitap</span>
          <span><b>{say.okunuyor}</b>okunuyor</span>
          <span><b>{say.okundu}</b>okundu</span>
          <span><b>{say.buYil}</b>{yil}'de okunan</span>
          <span><b>{say.kayit}</b>not ve alıntı</span>
        </div>
        <button className="kp-btn ana kp-kam" onClick={() => setKamera(true)}>📷 <span>Kitaplık kamerası</span><em>Kamera</em></button>
        <button className="kp-x" onClick={p.onClose} aria-label="Kapat">✕</button>
      </header>
      <nav className="kp-sekmeler">
        <button className={sekme === 'kitaplar' ? 'on' : ''} onClick={() => setSekme('kitaplar')}>Kitaplar</button>
        <button className={sekme === 'bolumler' ? 'on' : ''} onClick={() => setSekme('bolumler')}>Bölümler · {bolumler.reduce((s, b) => s + b.fotograflar.length, 0)} fotoğraf</button>
        <button className={sekme === 'oneriler' ? 'on' : ''} onClick={() => setSekme('oneriler')}>✨ Öneriler</button>
      </nav>

      {kitaplar === null ? <p className="kp-soluk kp-pad">yükleniyor…</p> : sekme === 'oneriler' ? (
        <SuggestionsPanel kitaplar={kitaplar} version={p.oneriVersion} onOpenBook={id => setAcik(id)} onChange={() => void yukle()} flash={p.flash} />
      ) : sekme === 'bolumler' ? (
        <SectionsPanel bolumler={bolumler} kitaplar={kitaplar} onChange={() => void yukle()} onOpenBook={k => setAcik(k.id)} flash={p.flash} />
      ) : (
        <div className="kp-kitaplar">
          <div className="kp-araclar">
            <input className="kp-ara" value={q} onChange={e => setQ(e.target.value)} placeholder="Kitap ya da yazar ara" />
            <div className="kp-filtre">
              {(['hepsi', 'okunuyor', 'okunacak', 'bitti'] as Filtre[]).map(f => (
                <button key={f} className={filtre === f ? 'on' : ''} onClick={() => setFiltre(f)}>{f === 'hepsi' ? 'Tümü' : DURUM_AD[f]}</button>
              ))}
              <select value={bolumF ?? ''} onChange={e => setBolumF(e.target.value ? Number(e.target.value) : null)}>
                <option value="">bütün bölümler</option>
                {bolumler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}
              </select>
            </div>
            <form className="kp-ekle" onSubmit={e => { e.preventDefault(); ekle(); }}>
              <input value={yeniAd} onChange={e => setYeniAd(e.target.value)} placeholder="Kitap ekle: adı" maxLength={160} />
              <input value={yeniYazar} onChange={e => setYeniYazar(e.target.value)} placeholder="yazar" maxLength={120} />
              <button type="submit" disabled={!yeniAd.trim()}>Ekle</button>
            </form>
          </div>
          {!liste.length ? <p className="kp-soluk kp-pad">{adli.length ? 'Bu filtrede kitap yok.' : 'Kitaplık boş. Bölümler sekmesinden raf fotoğrafı yükleyin ya da kitap ekleyin.'}</p> : (
            <ul className="kp-izgara">
              {liste.map(b => {
                const prog = b.sayfa && b.toplamSayfa ? Math.round((b.sayfa / b.toplamSayfa) * 100) : b.durum === 'bitti' ? 100 : null;
                return (
                  <li key={b.id}>
                    <button className={`kp-kart ${b.durum}`} onClick={() => setAcik(b.id)}>
                      <div className="kp-kart-kapak"><Kapak k={b} />{b.bolum ? <i className="kp-rozet">B{b.bolum}</i> : null}</div>
                      <b>{b.ad}</b>
                      <span>{b.yazar ?? ''}</span>
                      <em className={`kp-durum ${b.durum}`}>{DURUM_AD[b.durum]}{b.notlar.length + b.alintilar.length ? ` · ✎ ${b.notlar.length + b.alintilar.length}` : ''}</em>
                      {prog !== null && <div className="kp-bar ince"><i style={{ width: `${prog}%` }} /></div>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {kamera && <ShelfCamera kitaplar={kitaplar ?? []} onOpen={k => { setAcik(k.id); }} onAdded={() => void yukle()} onClose={() => setKamera(false)} />}
      {acikKitap && (
        <BookSheet k={acikKitap} bolumler={bolumler} yeni={yeni && p.kalemKaydi?.id === acikKitap.id ? yeni : null} flash={p.flash}
          onChange={degisti} onClose={() => setAcik(null)} onDelete={() => { setAcik(null); void yukle(); }} />
      )}
    </div>
  );
}
