import { useEffect, useState } from 'react';
import {
  type BeyinDurumu, type BeyinTestSonucu, type Rol, type SaglayiciBilgi,
  demoBeyin, getBeyin, resetBeyin, saveBeyin, testBeyin,
} from '../lib/api';

const ROL_AD: Record<Rol, string> = { chat: 'Sohbet', vision: 'Görüntü (kamera, kitaplık)', stt: 'Ses tanıma', tts: 'Seslendirme' };
export const DEMO_ANAHTARI = 'jarvis.demoTamam';

/**
 * Beyin kurulumu: sağlayıcı seç → anahtarı yapıştır → bağlantıyı test et → kaydet. İlk açılışta (hiç ayar yokken) ve
 * Ayarlar → Beyin'den açılır. Anahtar tarayıcıda saklanmaz; sunucu kaydeder ve yalnızca son 4 hanesini geri gösterir.
 */
export function BeyinKurulum({ ilk, onClose, flash }: { ilk: boolean; onClose: () => void; flash: (m: string) => void }) {
  const [d, setD] = useState<BeyinDurumu | null>(null);
  const [hata, setHata] = useState('');
  const [sec, setSec] = useState<SaglayiciBilgi | null>(null);
  const [anahtar, setAnahtar] = useState('');
  const [adres, setAdres] = useState('');
  const [modeller, setModeller] = useState<Partial<Record<Rol, string>>>({});
  const [test, setTest] = useState<BeyinTestSonucu | null>(null);
  const [mesgul, setMesgul] = useState<'' | 'test' | 'kayit'>('');

  useEffect(() => { getBeyin().then(setD).catch(e => setHata(e.message)); }, []);

  const ayniSaglayici = !!sec && d?.aktif.saglayici === sec.id && !d.aktif.demo;
  const istek = () => ({ saglayici: sec!.id, anahtar: anahtar.trim() || undefined, adres: sec!.adresGirilir ? adres.trim() : undefined, modeller });

  const sec_ = (s: SaglayiciBilgi) => {
    setSec(s); setTest(null); setHata(''); setAnahtar('');
    setAdres(s.adresGirilir && d?.aktif.saglayici === s.id ? d.aktif.adres : '');
    setModeller(d?.aktif.saglayici === s.id && !d.aktif.demo ? { chat: d.aktif.modeller.chat } : {});
  };

  const dene = async () => {
    if (!sec) return;
    setMesgul('test'); setHata(''); setTest(null);
    try {
      const t = await testBeyin(istek());
      setTest(t);
      if (t.ok) setModeller(m => ({ ...t.secilen, ...Object.fromEntries(Object.entries(m).filter(([, v]) => v)) }));
      else setHata(t.hata || 'Bağlantı kurulamadı');
    } catch (e: any) { setHata(e.message); } finally { setMesgul(''); }
  };

  const kaydet = async () => {
    if (!sec) return;
    setMesgul('kayit'); setHata('');
    try {
      const yeni = await saveBeyin(istek());
      setD(yeni);
      flash(`Beyin hazır: ${yeni.aktif.ad} · ${yeni.aktif.modeller.chat}`);
      onClose();
    } catch (e: any) { setHata(e.message); } finally { setMesgul(''); }
  };

  const demoyaGec = async () => {
    try { localStorage.setItem(DEMO_ANAHTARI, '1'); } catch { /* yok say */ }
    // İlk açılışta ayar yazılmaz (sonradan .env'e anahtar eklenirse o geçerli olsun); Ayarlar'dan seçilirse açıkça demo
    if (!ilk && d && !d.aktif.demo) {
      try { await demoBeyin(); flash('Demo moduna geçildi.'); } catch (e: any) { return setHata(e.message); }
    }
    onClose();
  };

  const envDon = async () => {
    try { const y = await resetBeyin(); setD(y); flash(y.aktif.demo ? 'Uygulama ayarı silindi: demo modu.' : `Uygulama ayarı silindi: ${y.aktif.ad} (.env)`); onClose(); }
    catch (e: any) { setHata(e.message); }
  };

  const ucretsiz = d?.saglayicilar.filter(s => s.ucretsiz) ?? [];
  const ucretli = d?.saglayicilar.filter(s => !s.ucretsiz) ?? [];
  const kart = (s: SaglayiciBilgi) => (
    <button key={s.id} className={'bk-card' + (sec?.id === s.id ? ' on' : '') + (d?.aktif.saglayici === s.id && !d.aktif.demo ? ' aktif' : '')} onClick={() => sec_(s)}>
      <span className="bk-card-top">
        <b>{s.ad}</b>
        {s.ucretsiz && <span className="bk-free">ÜCRETSİZ</span>}
        {d?.aktif.saglayici === s.id && !d.aktif.demo && <span className="bk-now">ŞU AN</span>}
      </span>
      <span className="bk-desc">{s.aciklama}</span>
      <span className="bk-caps">
        <span className={s.stt ? 'y' : ''}>{s.stt ? '✓' : '·'} ses tanıma</span>
        <span className={s.tts ? 'y' : ''}>{s.tts ? '✓' : '·'} seslendirme</span>
      </span>
    </button>
  );

  return (
    <div className="bk" role="dialog" aria-label="Beyin kurulumu">
      <div className="bk-box">
        <div className="bk-head">
          <div className="tg-title">JARVIS · BEYİN</div>
          {!ilk && <button className="bk-x" onClick={onClose} aria-label="Kapat">✕</button>}
        </div>
        <p className="bk-lead">
          {ilk ? 'Hoş geldiniz efendim. ' : ''}Jarvis'in beyni bir yapay zekâ servisidir. <b>Google Gemini</b> ya da <b>Groq</b> ile kart bilgisi vermeden,
          ücretsiz bir anahtarla iki dakikada kurulur. Anahtarınız yoksa demo ile başlayabilirsiniz: hava, döviz, gündem ve haber merkezi gerçek verilerle çalışır.
        </p>
        {d && !ilk && (
          <p className="bk-state">
            Şu an: <b>{d.aktif.demo ? 'Demo modu (beyin yok)' : `${d.aktif.ad} · ${d.aktif.modeller.chat}`}</b>
            {!d.aktif.demo && <> · anahtar {d.aktif.anahtar} · {d.aktif.kaynak === 'env' ? '.env dosyasından' : 'uygulamadan kaydedildi'}</>}
          </p>
        )}
        {!d && !hata && <p className="muted small">yükleniyor…</p>}

        {d && (
          <>
            <div className="bk-group">Ücretsiz</div>
            <div className="bk-grid">{ucretsiz.map(kart)}</div>
            <div className="bk-group">Ücretli · kendi hesabınızla</div>
            <div className="bk-grid">{ucretli.map(kart)}</div>
          </>
        )}

        {sec && (
          <div className="bk-form">
            <div className="bk-step">
              <span className="bk-n">1</span>
              {sec.anahtarAdresi
                ? <span><a href={sec.anahtarAdresi} target="_blank" rel="noreferrer">{sec.ad} anahtar sayfasını açın ↗</a>, yeni bir anahtar oluşturup kopyalayın.</span>
                : <span>Servisin OpenAI uyumlu adresini ve sohbet modelinin adını girin.</span>}
            </div>
            {sec.adresGirilir && (
              <input value={adres} onChange={e => { setAdres(e.target.value); setTest(null); }} placeholder="https://api.deepseek.com/v1" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            )}
            <div className="bk-step"><span className="bk-n">2</span><span>Anahtarı buraya yapıştırın (yalnızca bu bilgisayardaki Jarvis sunucusunda saklanır).</span></div>
            <input
              type="password" value={anahtar} onChange={e => { setAnahtar(e.target.value); setTest(null); }}
              placeholder={ayniSaglayici ? `kayıtlı anahtar ${d?.aktif.anahtar} · boş bırakırsanız aynı kalır` : 'API anahtarı'}
              autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus
            />
            {sec.adresGirilir && (
              <input value={modeller.chat ?? ''} onChange={e => setModeller(m => ({ ...m, chat: e.target.value }))} placeholder="sohbet modeli (ör. deepseek-chat)" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            )}
            <div className="bk-step"><span className="bk-n">3</span><span>Bağlantıyı test edin: Jarvis gerçek bir soru sorar ve en uygun modelleri seçer.</span></div>
            <div className="bk-actions">
              <button onClick={dene} disabled={!!mesgul || (!anahtar.trim() && !ayniSaglayici)}>{mesgul === 'test' ? 'Test ediliyor…' : 'Bağlantıyı test et'}</button>
              <button className="bk-primary" onClick={kaydet} disabled={!!mesgul || !test?.ok}>{mesgul === 'kayit' ? 'Kaydediliyor…' : 'Kaydet ve başla'}</button>
            </div>
            {test?.ok && (
              <div className="bk-ok">
                <div>✓ Bağlantı çalışıyor · {test.ms} ms{test.cevap ? ` · “${test.cevap}”` : ''}</div>
                {(['chat', 'vision', 'stt', 'tts'] as Rol[]).filter(r => test.secilen[r] || modeller[r]).map(r => (
                  <label key={r} className="bk-model">
                    <span>{ROL_AD[r]}</span>
                    {test.modeller.length ? (
                      <select value={modeller[r] ?? ''} onChange={e => setModeller(m => ({ ...m, [r]: e.target.value }))}>
                        {[...new Set([modeller[r] ?? '', ...test.modeller])].filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : <input value={modeller[r] ?? ''} onChange={e => setModeller(m => ({ ...m, [r]: e.target.value }))} spellCheck={false} />}
                  </label>
                ))}
                {!sec.stt && <div className="muted small">Bu serviste ses tanıma yok: mikrofon tarayıcının ses tanımasını kullanır (Chrome önerilir).</div>}
                {!sec.tts && <div className="muted small">Bu serviste seslendirme yok: Jarvis tarayıcının Türkçe sesiyle konuşur (ElevenLabs anahtarı varsa o).</div>}
              </div>
            )}
          </div>
        )}

        {hata && <p className="bk-err">{hata}</p>}

        <div className="bk-foot">
          {(ilk || !d?.aktif.demo) && <button className="bk-link" onClick={demoyaGec}>{ilk ? 'Anahtarsız demo ile devam et →' : 'Demo moduna geç'}</button>}
          {(d?.aktif.kaynak === 'dosya' || d?.aktif.kaynak === 'demo') && <button className="bk-link" onClick={envDon}>Uygulamadaki ayarı sil (.env'e dön)</button>}
        </div>
      </div>
    </div>
  );
}
