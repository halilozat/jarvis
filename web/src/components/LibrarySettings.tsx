import { useEffect, useMemo, useRef, useState } from 'react';
import { shrinkImage } from '../lib/image';
import { addBook, addFromPhoto, coverUrl, deleteBook, fillBook, getLibrary, patchBook, uploadCover, type Durum, type Kitap } from '../lib/library';

/**
 * Ayarlar → Kitaplık: her kitabın durumu, sayfası, notları, alıntıları, özeti ve kapağı. Kitaplık El Kontrolü'nde
 * kameradan taranır (K tuşu); burada yalnızca bilgiler düzenlenir. Telefondan açıp kapak fotoğrafı da yüklenebilir.
 */
export function LibrarySettings({ flash, version }: { flash(t: string): void; version: number }) {
  const [books, setBooks] = useState<Kitap[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [newAd, setNewAd] = useState('');
  const [newYazar, setNewYazar] = useState('');
  const [reading, setReading] = useState<string | null>(null);
  const photos = useRef<HTMLInputElement>(null);

  const reload = () => getLibrary().then(k => setBooks(k.kitaplar)).catch(() => setBooks([]));
  useEffect(() => { reload(); }, [version]);

  const add = () => {
    if (!newAd.trim()) return;
    addBook(newAd, newYazar || undefined)
      .then(r => { flash(r.yeni ? `${r.kitap.ad} kitaplığa eklendi` : `${r.kitap.ad} zaten kitaplıkta`); setNewAd(''); setNewYazar(''); reload(); })
      .catch(e => flash(e.message));
  };
  /** Yakın çekim raf fotoğrafları: her biri görüntü modeline gider, okunan kitaplar eklenir */
  const fromPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    let yeni = 0, var_ = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        setReading(`fotoğraf ${i + 1}/${files.length} okunuyor…`);
        const r = await addFromPhoto(await shrinkImage(files[i], 2000, 0.9));
        yeni += r.eklenen.length; var_ += r.zatenVar.length;
      }
      flash(`${yeni} kitap eklendi${var_ ? ` · ${var_} tanesi zaten vardı` : ''}`);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setReading(null);
      reload();
      if (photos.current) photos.current.value = '';
    }
  };

  const named = useMemo(() => (books ?? []).filter(b => b.ad), [books]);
  const list = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('tr');
    return named.filter(b => !n || `${b.ad} ${b.yazar ?? ''}`.toLocaleLowerCase('tr').includes(n));
  }, [named, q]);
  const put = (k: Kitap) => setBooks(bs => (bs ?? []).map(b => (b.id === k.id ? k : b)));
  const save = (id: string, patch: Partial<Kitap>) => patchBook(id, patch).then(r => put(r.kitap)).catch(e => flash(e.message));

  if (books === null) return null;
  const okunuyor = named.filter(b => b.durum === 'okunuyor').length;
  const adsiz = books.filter(b => !b.ad && b.kutu).length;
  const yersiz = named.filter(b => !b.kutu).length;
  return (
    <>
      <label>Kitaplık · {named.length} kitap{okunuyor ? ` · ${okunuyor} okunuyor` : ''}</label>
      <div className="lib-add">
        <button className="lib-btn" disabled={!!reading} onClick={() => photos.current?.click()}>{reading ?? '📷 Raf fotoğrafından ekle'}</button>
        <input ref={photos} type="file" accept="image/*" multiple hidden onChange={e => fromPhotos(e.target.files)} />
        <span className="muted small">Telefonla rafa yakından çekin (bir fotoğrafta bir iki raf). Jarvis okuduğu kitapları kalıcı olarak kaydeder.</span>
      </div>
      <form className="memory-add" onSubmit={e => { e.preventDefault(); add(); }}>
        <input value={newAd} onChange={e => setNewAd(e.target.value)} placeholder="Kitap adı" maxLength={160} />
        <input value={newYazar} onChange={e => setNewYazar(e.target.value)} placeholder="Yazar (isteğe bağlı)" maxLength={120} />
        <button type="submit" disabled={!newAd.trim()}>Ekle</button>
      </form>
      {(adsiz > 0 || yersiz > 0) && (
        <p className="muted small">
          {adsiz > 0 && <>Kameranın taradığı {adsiz} sırtın adı okunamadı. </>}
          {yersiz > 0 && <>{yersiz} kitabın rafta yeri yok. </>}
          El Kontrolü'nde <b>K</b> ile adsız kutuya tıklayıp adını yazmaya başlayın; eklediğiniz kitaplar öneri olarak çıkar ve seçince o kutuya yerleşir.
        </p>
      )}
      {!named.length ? null : !show ? (
        <button className="profile-peek" onClick={() => setShow(true)}>
          <span>{named.slice(0, 4).map(b => b.ad).join(' · ')}{named.length > 4 ? ' …' : ''}</span>
          <em>notlar, durum, kapak · düzenle</em>
        </button>
      ) : (
        <>
          <div className="memory-add">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Kitap ara" />
            <button onClick={() => { setShow(false); setOpen(null); }}>Kapat</button>
          </div>
          <ul className="lib-list">
            {list.map(b => (
              <li key={b.id} className={open === b.id ? 'open' : ''}>
                <button className="lib-row" onClick={() => setOpen(o => (o === b.id ? null : b.id))}>
                  <span>{b.ad}{!b.kutu && <i className="lib-noplace" title="Rafta yeri yok (K ile yerleştirin)"> · rafta yeri yok</i>}</span>
                  <em>{b.yazar ?? ''}</em>
                  <i className={`lib-st ${b.durum}`}>{b.durum}</i>
                </button>
                {open === b.id && <BookEditor k={b} save={save} put={put} flash={flash} onDelete={() => setBooks(bs => (bs ?? []).filter(x => x.id !== b.id))} />}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">Sesle de olur: "Jarvis, Mülksüzler'e not ekle: …", "Tahıla Karşı'yı bitirdim", "Oblomov'da 120. sayfadayım". Jarvis kayıtlı kitapları bilir ve öneri yaparken bunları kullanır.</p>
    </>
  );
}

function BookEditor({ k, save, put, flash, onDelete }: { k: Kitap; save(id: string, p: Partial<Kitap>): void; put(k: Kitap): void; flash(t: string): void; onDelete(): void }) {
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState('');
  const [busy, setBusy] = useState(false);
  const [coverV, setCoverV] = useState(k.kapak ?? '');
  const [hasCover, setHasCover] = useState(true);
  const file = useRef<HTMLInputElement>(null);

  const add = (key: 'notlar' | 'alintilar', text: string, clear: () => void) => {
    const t = text.trim();
    if (!t) return;
    save(k.id, { [key]: [...k[key], t] });
    clear();
  };
  const del = (key: 'notlar' | 'alintilar', i: number) => save(k.id, { [key]: k[key].filter((_, j) => j !== i) });
  const summary = () => {
    setBusy(true);
    fillBook(k.id, !!k.jarvis)
      .then(r => { put(r.kitap); if (r.bilinmiyor) flash('Jarvis bu kitabı tanımadı; sayfa uydurulmadı. Adı doğru mu?'); })
      .catch(e => flash(e.message))
      .finally(() => setBusy(false));
  };
  const onCover = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await uploadCover(k.id, await shrinkImage(f, 900, 0.88));
      put(r.kitap); setCoverV(String(Date.now())); setHasCover(true);
      flash('Kapak yüklendi');
    } catch (e) { flash((e as Error).message); }
  };

  return (
    <div className="lib-edit">
      <div className="lib-top">
        {hasCover ? <img src={coverUrl(k.id, coverV)} alt="" onError={() => setHasCover(false)} /> : <div className="lib-nocover">kapak yok</div>}
        <div className="lib-meta">
          <div className="seg">
            {(['okunacak', 'okunuyor', 'bitti'] as Durum[]).map(d => <button key={d} className={k.durum === d ? 'on' : ''} onClick={() => save(k.id, { durum: d })}>{d}</button>)}
          </div>
          <div className="lib-pages">
            <input type="number" min={1} placeholder="sayfa" defaultValue={k.sayfa ?? ''} onBlur={e => save(k.id, { sayfa: Number(e.target.value) || undefined })} />
            <span>/</span>
            <input type="number" min={1} placeholder="toplam" defaultValue={k.toplamSayfa ?? ''} onBlur={e => save(k.id, { toplamSayfa: Number(e.target.value) || undefined })} />
          </div>
          <button className="lib-btn" onClick={() => file.current?.click()}>Kapak fotoğrafı yükle</button>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => onCover(e.target.files?.[0])} />
        </div>
      </div>
      <p className="lib-ozet">{k.ozet ?? <span className="muted">Özet yok.</span>}</p>
      {k.jarvis && !k.jarvis.bilinmiyor && (
        <div className="lib-jarvis">
          {k.jarvis.anaFikirler.length > 0 && <ol>{k.jarvis.anaFikirler.map((x, i) => <li key={i}>{x}</li>)}</ol>}
          {k.jarvis.benzer.length > 0 && <p className="muted small">Rafınızdan benzerler: {k.jarvis.benzer.join(' · ')}</p>}
        </div>
      )}
      <button className="lib-btn" disabled={busy} onClick={summary}>{busy ? 'Jarvis yazıyor…' : k.jarvis ? 'Jarvis sayfalarını yeniden yaz' : 'Jarvis doldursun (özet, ana fikirler, benzerler)'}</button>
      <label>Notlarım</label>
      <ul className="memory">{k.notlar.map((n, i) => <li key={i}><span>{n}</span><button onClick={() => del('notlar', i)} aria-label="Sil">✕</button></li>)}</ul>
      <form className="memory-add" onSubmit={e => { e.preventDefault(); add('notlar', note, () => setNote('')); }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Not ekle" maxLength={600} />
        <button type="submit" disabled={!note.trim()}>Ekle</button>
      </form>
      <label>Alıntılar</label>
      <ul className="memory">{k.alintilar.map((n, i) => <li key={i}><span>“{n}”</span><button onClick={() => del('alintilar', i)} aria-label="Sil">✕</button></li>)}</ul>
      <form className="memory-add" onSubmit={e => { e.preventDefault(); add('alintilar', quote, () => setQuote('')); }}>
        <input value={quote} onChange={e => setQuote(e.target.value)} placeholder="Alıntı ekle" maxLength={600} />
        <button type="submit" disabled={!quote.trim()}>Ekle</button>
      </form>
      <button className="lib-btn danger" onClick={() => { if (confirm(`${k.ad} kitaplıktan silinsin mi? Notları da silinir.`)) deleteBook(k.id).then(onDelete).catch(e => flash(e.message)); }}>Kitaplıktan sil</button>
    </div>
  );
}
