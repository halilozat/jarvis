// Kitaplığım · bölümler: kitaplığın 6 bölümü, her birinin yakın çekim fotoğrafları ve onlardan okunan sıralı liste.
// Tek tek (bölüm kartından) ya da toplu (birden çok fotoğraf: dosya adındaki rakama, yoksa sıraya göre bölümlere
// dağılır; yüklemeden önce değiştirilebilir) yüklenir. Kamera taraması okuyamadığı sırtları bu listelerle tamamlar.
import { useRef, useState } from 'react';
import { shrinkImage } from '../lib/image';
import { bolumTahmin } from './shared';
import { addSectionPhoto, bolumFotoUrl, deleteSectionPhoto, patchSection, type Bolum, type Kitap } from '../lib/library';

interface Bekleyen { file: File; bolum: number; url: string }


export function SectionsPanel({ bolumler, kitaplar, onChange, onOpenBook, flash }: {
  bolumler: Bolum[]; kitaplar: Kitap[];
  onChange(): void; onOpenBook(k: Kitap): void; flash(t: string): void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [bekleyen, setBekleyen] = useState<Bekleyen[] | null>(null);
  const tekil = useRef<HTMLInputElement>(null);
  const toplu = useRef<HTMLInputElement>(null);
  const hedef = useRef<number>(1);

  /** Fotoğrafları sırayla yükle (her biri görüntü modeline gider, 5-15 sn) */
  const yukle = async (isler: { file: File; bolum: number }[]) => {
    let okunan = 0, yeni = 0, belirsiz = 0;
    try {
      for (let i = 0; i < isler.length; i++) {
        const { file, bolum } = isler[i];
        setBusy(`${bolumler.find(b => b.id === bolum)?.ad ?? `Bölüm ${bolum}`} · fotoğraf ${i + 1}/${isler.length} okunuyor…`);
        const r = await addSectionPhoto(bolum, await shrinkImage(file, 2200, 0.9));
        okunan += r.okunan; yeni += r.eklenen.length; belirsiz += r.belirsiz;
      }
      flash(`${okunan} kitap okundu${yeni ? ` · ${yeni} yeni kitap eklendi` : ''}${belirsiz ? ` · ${belirsiz} sırt okunamadı` : ''}`);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(null);
      onChange();
    }
  };

  const topluSec = (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
    setBekleyen(list.map((file, i) => ({ file, bolum: bolumTahmin(file.name, i), url: URL.createObjectURL(file) })));
  };
  const bekleyenKapat = () => { bekleyen?.forEach(b => URL.revokeObjectURL(b.url)); setBekleyen(null); };

  return (
    <div className="kp-bolumler">
      <div className="kp-bolum-ust">
        <p>Her bölümü telefonla <b>yakından</b> çekin (bir fotoğrafta bir iki raf). Jarvis kitapları raf raf, soldan sağa sırayla okur. Kamera taraması okuyamadığı sırtları bu listelerden tamamlar; bunun için El Kontrolü'nde <b>K</b> ile her bölümün kameradaki alanını bir kez çizin.</p>
        <button className="kp-btn ana" disabled={!!busy} onClick={() => toplu.current?.click()}>⇪ Toplu yükle (birden çok fotoğraf)</button>
        <input ref={toplu} type="file" accept="image/*" multiple hidden onChange={e => { topluSec(e.target.files); e.target.value = ''; }} />
        <input ref={tekil} type="file" accept="image/*" multiple hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void yukle(f.map(file => ({ file, bolum: hedef.current }))); }} />
        {busy && <p className="kp-mesgul"><i />{busy}</p>}
      </div>

      {bekleyen && (
        <div className="kp-dagit">
          <h4>{bekleyen.length} fotoğraf · hangisi hangi bölüm?</h4>
          <ul>
            {bekleyen.map((b, i) => (
              <li key={b.url}>
                <img src={b.url} alt="" />
                <span>{b.file.name}</span>
                <select value={b.bolum} onChange={e => setBekleyen(l => l!.map((x, j) => (j === i ? { ...x, bolum: Number(e.target.value) } : x)))}>
                  {bolumler.map(x => <option key={x.id} value={x.id}>{x.ad}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="kp-satir">
            <button className="kp-btn ana" onClick={() => { const isler = bekleyen.map(b => ({ file: b.file, bolum: b.bolum })); bekleyenKapat(); void yukle(isler); }}>Yükle</button>
            <button className="kp-btn" onClick={bekleyenKapat}>Vazgeç</button>
          </div>
        </div>
      )}

      <div className="kp-bolum-izgara">
        {bolumler.map(b => {
          const okunan = b.liste.filter(x => x.ad);
          const rafta = okunan.filter(x => kitaplar.find(k => k.id === x.kitapId)?.kutu).length;
          const rafs = [...new Set(b.liste.map(x => `${x.foto}:${x.raf}`))];
          return (
            <section key={b.id} className="kp-bolum">
              <header>
                <b>B{b.id}</b>
                <input defaultValue={b.ad} maxLength={40} key={b.ad} onBlur={e => e.target.value.trim() && e.target.value !== b.ad && patchSection(b.id, { ad: e.target.value.trim() }).then(onChange).catch(err => flash(err.message))} />
                <span className={b.alan ? 'var' : ''} title={b.alan ? 'Kameradaki alanı çizildi' : "El Kontrolü'nde K ile alanını çizin"}>{b.alan ? '◉ kamerada' : '○ alan yok'}</span>
              </header>
              <div className="kp-fotolar">
                {b.fotograflar.map(f => (
                  <figure key={f.id}>
                    <img src={bolumFotoUrl(b.id, f.id)} alt="" loading="lazy" />
                    <figcaption>{f.okunan} okundu{f.belirsiz ? ` · ${f.belirsiz} ?` : ''}</figcaption>
                    <button aria-label="Fotoğrafı sil" onClick={() => { if (confirm('Bu fotoğraf ve ondan okunan liste silinsin mi? (Kitaplar kitaplıkta kalır.)')) deleteSectionPhoto(b.id, f.id).then(onChange).catch(e => flash(e.message)); }}>✕</button>
                  </figure>
                ))}
                <button className="kp-foto-ekle" disabled={!!busy} onClick={() => { hedef.current = b.id; tekil.current?.click(); }}>＋<span>fotoğraf</span></button>
              </div>
              {okunan.length > 0 ? (
                <>
                  <p className="kp-mini">{okunan.length} kitap · {rafta} tanesinin rafta yeri biliniyor · {rafs.length} raf</p>
                  <ol className="kp-bolum-liste">
                    {b.liste.map((x, i) => {
                      const k = kitaplar.find(y => y.id === x.kitapId);
                      return x.ad
                        ? <li key={i} className={k?.kutu ? 'rafta' : ''} onClick={() => k && onOpenBook(k)}><em>{x.raf}.{x.sira}</em>{x.ad}</li>
                        : <li key={i} className="belirsiz"><em>{x.raf}.{x.sira}</em>okunamadı</li>;
                    })}
                  </ol>
                </>
              ) : <p className="kp-soluk">Henüz fotoğraf yok.</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
