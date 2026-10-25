// Kitaplığım · kitap sayfası: kapak, durum, sayfa, bölüm, Jarvis'in kitap defteri, notlar ve alıntılar, kayıt zaman
// çizelgesi. Sesle eklenen not ya da alıntı (kalemKaydi) burada da kalemle yazılır gibi harf harf belirir.
import { useEffect, useRef, useState } from 'react';
import { shrinkImage } from '../lib/image';
import { coverUrl, deleteBook, fillBook, patchBook, uploadCover, type Bolum, type Durum, type Kitap } from '../lib/library';
import { DURUM_AD, type YeniKayit } from './shared';

const tarih = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Kalemle yazılır gibi: harfler sırayla, ucunda kalem (yeni kayıtta key değişir, baştan başlar) */
function Daktilo({ metin, tirnak }: { metin: string; tirnak?: boolean }) {
  const [n, setN] = useState(0);
  const tam = tirnak ? `“${metin}”` : metin;
  useEffect(() => {
    const t0 = performance.now(), sure = Math.min(3400, 600 + tam.length * 45);
    let raf = 0;
    const adim = () => { const p = Math.min(1, (performance.now() - t0) / sure); setN(Math.round(tam.length * p)); if (p < 1) raf = requestAnimationFrame(adim); };
    raf = requestAnimationFrame(adim);
    return () => cancelAnimationFrame(raf);
  }, [tam]);
  return <span className="kp-daktilo">{tam.slice(0, n)}{n < tam.length && <i className="kp-kalem">✒</i>}</span>;
}

export function BookSheet({ k, bolumler, yeni, onChange, onDelete, onClose, flash }: {
  k: Kitap; bolumler: Bolum[]; yeni: YeniKayit | null;
  onChange(k: Kitap): void; onDelete(): void; onClose(): void; flash(t: string): void;
}) {
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState('');
  const [busy, setBusy] = useState(false);
  const [coverV, setCoverV] = useState(k.kapak ?? '');
  const [hasCover, setHasCover] = useState(true);
  const file = useRef<HTMLInputElement>(null);

  const save = (patch: Partial<Kitap>) => patchBook(k.id, patch).then(r => onChange(r.kitap)).catch(e => flash(e.message));
  const add = (key: 'notlar' | 'alintilar', text: string, clear: () => void) => {
    const t = text.trim();
    if (!t) return;
    save({ [key]: [...k[key], t] });
    clear();
  };
  const del = (key: 'notlar' | 'alintilar', i: number) => save({ [key]: k[key].filter((_, j) => j !== i) });
  const fill = () => {
    setBusy(true);
    fillBook(k.id, !!k.jarvis)
      .then(r => { onChange(r.kitap); if (r.bilinmiyor) flash('Jarvis bu kitabı tanımadı; sayfa uydurulmadı. Adı doğru mu?'); })
      .catch(e => flash(e.message))
      .finally(() => setBusy(false));
  };
  const onCover = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await uploadCover(k.id, await shrinkImage(f, 900, 0.88));
      onChange(r.kitap); setCoverV(String(Date.now())); setHasCover(true);
      flash('Kapak yüklendi');
    } catch (e) { flash((e as Error).message); }
  };
  const prog = k.sayfa && k.toplamSayfa ? Math.round((k.sayfa / k.toplamSayfa) * 100) : k.durum === 'bitti' ? 100 : null;
  // Sesle eklenen son kayıt (bu kitapta): o satır harf harf yazılır
  const yeniNot = yeni?.tip === 'not' ? k.notlar.length - 1 : -1;
  const yeniAlinti = yeni?.tip === 'alinti' ? k.alintilar.length - 1 : -1;
  const kayitlar = [...(k.kayitlar ?? [])].reverse();

  return (
    <div className="kp-sheet" onClick={e => e.target === e.currentTarget && onClose()}>
      <article className="kp-sayfa">
        <button className="kp-x" onClick={onClose} aria-label="Kapat">✕</button>
        <header className="kp-ust">
          <div className="kp-kapak" onClick={() => file.current?.click()} title="Kapak fotoğrafı yükle">
            {hasCover ? <img src={coverUrl(k.id, coverV)} alt="" onError={() => setHasCover(false)} /> : <div className="kp-kapak-yok"><b>{k.ad ?? 'Adsız kitap'}</b><span>{k.yazar ?? ''}</span><em>📷 kapak ekle</em></div>}
          </div>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={e => onCover(e.target.files?.[0])} />
          <div className="kp-kunye">
            <input className="kp-ad" defaultValue={k.ad ?? ''} key={`a${k.id}${k.ad}`} placeholder="Kitabın adı" maxLength={160} onBlur={e => { const v = e.target.value.trim(); if (v && v !== k.ad) save({ ad: v }); }} />
            <input className="kp-yazar" defaultValue={k.yazar ?? ''} key={`y${k.id}${k.yazar}`} placeholder="Yazar" maxLength={120} onBlur={e => { const v = e.target.value.trim(); if (v !== (k.yazar ?? '')) save({ yazar: v || null }); }} />
            <div className={'kp-durumlar' + (yeni?.tip === 'durum' ? ' kp-isaret' : '')}>
              {(['okunacak', 'okunuyor', 'bitti'] as Durum[]).map(d => <button key={d} className={k.durum === d ? `on ${d}` : ''} onClick={() => save({ durum: d })}>{DURUM_AD[d]}</button>)}
            </div>
            <div className="kp-sayfalar">
              <input type="number" min={1} placeholder="sayfa" defaultValue={k.sayfa ?? ''} key={`s${k.sayfa}`} onBlur={e => Number(e.target.value) !== (k.sayfa ?? 0) && save({ sayfa: Number(e.target.value) || undefined })} />
              <span>/</span>
              <input type="number" min={1} placeholder="toplam" defaultValue={k.toplamSayfa ?? ''} key={`t${k.toplamSayfa}`} onBlur={e => Number(e.target.value) !== (k.toplamSayfa ?? 0) && save({ toplamSayfa: Number(e.target.value) || undefined })} />
              <select value={k.bolum ?? ''} onChange={e => save({ bolum: Number(e.target.value) || undefined })}>
                <option value="">bölüm yok</option>
                {bolumler.map(b => <option key={b.id} value={b.id}>{b.ad}</option>)}
              </select>
            </div>
            {prog !== null && <div className={'kp-bar' + (yeni?.tip === 'sayfa' ? ' kp-isaret' : '')}><i style={{ width: `${prog}%` }} /><span>%{prog}</span></div>}
            <p className="kp-mini">{k.kutu ? (k.tahmini ? '≈ rafta yeri tahmini (sırtı okunamadı)' : '● rafta yeri biliniyor') : k.rafDisi ? '○ rafta değil · okuma listesinde' : '○ rafta yeri yok'}{k.tamamlandi ? ' · adı bölüm listesinden tamamlandı' : ''}{k.bittiAt ? ` · okundu: ${tarih(k.bittiAt)}` : ''}</p>
          </div>
        </header>

        <section className="kp-blok">
          <h4>JARVIS · ÖZET</h4>
          {k.ozet ? <p>{k.ozet}</p> : <p className="kp-soluk">{k.jarvis?.bilinmiyor ? 'Jarvis bu kitabı tanımıyor; sayfa uydurmadı.' : 'Özet yok.'}</p>}
          {k.jarvis && !k.jarvis.bilinmiyor && k.jarvis.anaFikirler.length > 0 && <ol className="kp-fikirler">{k.jarvis.anaFikirler.map((x, i) => <li key={i}>{x}</li>)}</ol>}
          {k.jarvis?.benzer.length ? <p className="kp-soluk">Rafınızdan benzerler: {k.jarvis.benzer.join(' · ')}</p> : null}
          <button className="kp-btn" disabled={busy || !k.ad} onClick={fill}>{busy ? 'Jarvis yazıyor…' : k.jarvis ? 'Jarvis sayfalarını yeniden yaz' : 'Jarvis doldursun'}</button>
        </section>

        <section className="kp-blok">
          <h4>NOTLARIM <em>sesle: "not al: …"</em></h4>
          <ul className="kp-liste">{k.notlar.map((n, i) => <li key={i} className={i === yeniNot ? 'yeni' : ''}><span>{i === yeniNot ? <Daktilo metin={n} key={`${yeni!.n}`} /> : n}</span><button onClick={() => del('notlar', i)} aria-label="Sil">✕</button></li>)}</ul>
          <form className="kp-ekle" onSubmit={e => { e.preventDefault(); add('notlar', note, () => setNote('')); }}>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Not ekle" maxLength={600} />
            <button type="submit" disabled={!note.trim()}>Ekle</button>
          </form>
        </section>

        <section className="kp-blok">
          <h4>ALINTILAR <em>sesle: "bu kitaba şu alıntıyı ekle: …"</em></h4>
          <ul className="kp-liste q">{k.alintilar.map((n, i) => <li key={i} className={i === yeniAlinti ? 'yeni' : ''}><span>{i === yeniAlinti ? <Daktilo metin={n} tirnak key={`${yeni!.n}`} /> : `“${n}”`}</span><button onClick={() => del('alintilar', i)} aria-label="Sil">✕</button></li>)}</ul>
          <form className="kp-ekle" onSubmit={e => { e.preventDefault(); add('alintilar', quote, () => setQuote('')); }}>
            <input value={quote} onChange={e => setQuote(e.target.value)} placeholder="Alıntı ekle" maxLength={600} />
            <button type="submit" disabled={!quote.trim()}>Ekle</button>
          </form>
        </section>

        {kayitlar.length > 0 && (
          <section className="kp-blok">
            <h4>KAYITLAR</h4>
            <ol className="kp-zaman">
              {kayitlar.slice(0, 30).map((x, i) => (
                <li key={i} className={x.tur}>
                  <time>{tarih(x.at)}</time>
                  <span>{x.tur === 'durum' ? (x.metin === 'eklendi' ? 'Kitaplığa eklendi' : `Durum: ${DURUM_AD[x.metin as Durum] ?? x.metin}`) : x.tur === 'sayfa' ? `Sayfa ${x.metin}` : x.tur === 'alinti' ? `Alıntı: “${x.metin}”` : `Not: ${x.metin}`}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <button className="kp-btn tehlike" onClick={() => { if (confirm(`${k.ad ?? 'Bu kitap'} kitaplıktan silinsin mi? Notları da silinir.`)) deleteBook(k.id).then(onDelete).catch(e => flash(e.message)); }}>Kitaplıktan sil</button>
      </article>
    </div>
  );
}
