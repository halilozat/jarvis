// Kitaplığım · öneriler: ruh haline göre raftan bir kitap ("bugün yorgunum") ve okuma tarzı analiziyle kitaplıkta
// olmayan 5 yeni kitap (Open Library'de doğrulanmış). Sesle de olur: "Jarvis, bugün … hissediyorum, bana bir kitap
// öner", "tarzımı analiz et ve bana 5 güzel kitap öner". Sonuçlar burada kapaklarıyla durur.
import { useEffect, useState } from 'react';
import { addSuggestion, analyzeTaste, coverUrl, getSuggestions, suggestForMood, type Kitap, type Oneriler } from '../lib/library';
import { DURUM_AD } from './shared';

export function SuggestionsPanel({ kitaplar, version, onOpenBook, onChange, flash }: {
  kitaplar: Kitap[]; version: number; onOpenBook(id: string): void; onChange(): void; flash(t: string): void;
}) {
  const [veri, setVeri] = useState<Oneriler | null>(null);
  const [ruh, setRuh] = useState('');
  const [mesgul, setMesgul] = useState<'ruh' | 'tarz' | null>(null);
  const yukle = () => getSuggestions().then(setVeri).catch(e => flash(e.message));
  useEffect(() => { void yukle(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const oner = () => {
    if (!ruh.trim()) return;
    setMesgul('ruh');
    suggestForMood(ruh.trim()).then(() => yukle()).catch(e => flash(e.message)).finally(() => setMesgul(null));
  };
  const analiz = () => {
    setMesgul('tarz');
    analyzeTaste(5).then(() => yukle()).catch(e => flash(e.message)).finally(() => setMesgul(null));
  };
  const bende = (ad: string) => kitaplar.some(b => b.ad && b.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'));
  const p = veri?.profil;
  const t = veri?.tarz;

  return (
    <div className="kp-oneriler">
      <section className="kp-oneri-blok">
        <h4>BUGÜN NASIL HİSSEDİYORSUN?</h4>
        <form className="kp-ekle" onSubmit={e => { e.preventDefault(); oner(); }}>
          <input value={ruh} onChange={e => setRuh(e.target.value)} placeholder="ör. yorgunum, kafamı dağıtacak hafif bir şey" maxLength={300} />
          <button type="submit" disabled={!ruh.trim() || !!mesgul}>{mesgul === 'ruh' ? 'Seçiyor…' : 'Öner'}</button>
        </form>
        <p className="kp-mini">Sesle: "Jarvis, bugün … hissediyorum, bana bir kitap öner". Jarvis rafındaki okunmamış kitaplardan seçer; El Kontrolü açıksa kitap raftan çıkar.</p>
        {veri?.ruh && (
          <div className="kp-ruh">
            <em>“{veri.ruh.ruhHali}”</em>
            {veri.ruh.oneriler.map(o => (
              <button key={o.id} className="kp-ruh-kart" onClick={() => onOpenBook(o.id)}>
                <div className="kp-kart-kapak mini"><div className="kp-kapak-yok"><b>{o.ad}</b></div><img src={coverUrl(o.id)} alt="" onLoad={e => (e.target as HTMLImageElement).classList.add('yuklendi')} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
                <div><b>{o.ad}</b><span>{o.yazar ?? ''} · {DURUM_AD[o.durum]}{o.rafta ? ' · rafta' : ''}</span>{o.neden && <p>{o.neden}</p>}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="kp-oneri-blok">
        <div className="kp-satir ara">
          <h4>OKUMA TARZIN</h4>
          <button className="kp-btn ana" disabled={!!mesgul} onClick={analiz}>{mesgul === 'tarz' ? 'Analiz ediliyor… (15-30 sn)' : t ? '⟳ Yeniden analiz et' : 'Tarzımı analiz et · 5 kitap öner'}</button>
        </div>
        {p && (
          <div className="kp-profil">
            <span><b>{p.okundu}</b>okundu</span><span><b>{p.okunuyor}</b>okunuyor</span><span><b>{p.okunacak}</b>okunacak</span><span><b>{p.buYil}</b>bu yıl</span>
            {p.turler.length > 0 && <div className="kp-etiketler"><i>türler</i>{p.turler.map(x => <em key={x.ad}>{x.ad}</em>)}</div>}
            {p.temalar.length > 0 && <div className="kp-etiketler"><i>temalar</i>{p.temalar.map(x => <em key={x.ad}>{x.ad}</em>)}</div>}
            {p.yazarlar.length > 0 && <div className="kp-etiketler"><i>yazarlar</i>{p.yazarlar.map(x => <em key={x.ad}>{x.ad}{x.n > 1 ? ` ·${x.n}` : ''}</em>)}</div>}
          </div>
        )}
        {t?.ozet && <p className="kp-tarz-ozet">{t.ozet}</p>}
        {t && (
          <ol className="kp-yeni-oneriler">
            {t.oneriler.map(o => (
              <li key={o.ad}>
                <div className="kp-kart-kapak mini">{o.kapak ? <img src={o.kapak} alt="" className="yuklendi" /> : <div className="kp-kapak-yok"><b>{o.ad}</b></div>}</div>
                <div>
                  <b>{o.ad}</b><span>{o.yazar}{o.yil ? ` · ${o.yil}` : ''}</span>
                  {o.neden && <p>{o.neden}</p>}
                  {o.benzer.length > 0 && <p className="kp-mini">rafındaki benzerleri: {o.benzer.join(', ')}</p>}
                  {bende(o.ad) ? <span className="kp-eklendi">✓ kitaplıkta</span>
                    : <button className="kp-btn" onClick={() => addSuggestion(o.ad, o.yazar).then(r => { flash(`${r.kitap.ad} okunacaklara eklendi`); onChange(); }).catch(e => flash(e.message))}>+ Okunacaklara ekle</button>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {t && <p className="kp-mini">Her öneri Open Library'de ad ve yazarla doğrulandı{t.elenen ? `; doğrulanamayan ${t.elenen} öneri gösterilmedi` : ''}. Sesle: "Jarvis, tarzımı analiz et ve bana 5 güzel kitap öner".</p>}
      </section>
    </div>
  );
}
