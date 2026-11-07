// Bekçi paneli: gelen mesaj akışı, analiz adımları (LİNK · WHOIS · USOM · LİSTELER · METİN · SANDBOX), risk reaktörü,
// gerekçeler ve "TUZAK" damgası. Linkler tıklanamaz (defang). Klavye: Esc kapat · D demo SMS · M demo mail.
import { useEffect, useMemo, useRef, useState } from 'react';
import { bekciAnaliz, bekciBeyaz, bekciBildirimTesti, bekciDemo, bekciDurum, bekciGuvenli, type AdimAd, type Analiz, type Durum } from './api';
import './bekci.css';

const ADIMLAR: [AdimAd, string][] = [['link', 'LİNK'], ['whois', 'WHOIS'], ['usom', 'USOM'], ['liste', 'LİSTELER'], ['metin', 'METİN'], ['sandbox', 'SANDBOX']];
const KAYNAK: Record<Analiz['kaynak'], string> = { sms: 'SMS', imessage: 'iMessage', rcs: 'RCS', mail: 'MAİL', el: 'YAPIŞTIRILAN', demo: 'DEMO' };
const SEVIYE: Record<Analiz['seviye'], string> = { tehlikeli: 'TEHLİKELİ', supheli: 'ŞÜPHELİ', temiz: 'TEMİZ' };
const saat = (z: string) => new Date(z).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export interface BekciProps {
  /** Canlı analizler (SSE ile gelen; id → son hâli) */
  canli: Record<string, Analiz>;
  secili: string | null;
  onSec(id: string | null): void;
  onClose(): void;
  flash(m: string): void;
  /** Liste değişti (beyaz liste, güvenli işaret) sinyali */
  surum: number;
}

export default function BekciPanel(p: BekciProps) {
  const [durum, setDurum] = useState<Durum | null>(null);
  const [metin, setMetin] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bekciDurum().then(setDurum).catch(e => p.flash(`Bekçi durumu alınamadı: ${e.message}`)); }, [p.surum]); // eslint-disable-line react-hooks/exhaustive-deps

  // Akış: canlı analizler + kayıtlı geçmiş (yeni olan önde)
  const akis = useMemo(() => {
    const m = new Map<string, Analiz>();
    for (const a of durum?.son ?? []) m.set(a.id, a);
    for (const a of Object.values(p.canli)) m.set(a.id, { ...m.get(a.id), ...a });
    return [...m.values()].sort((a, b) => b.zaman.localeCompare(a.zaman)).slice(0, 60);
  }, [durum, p.canli]);
  const a = (p.secili && akis.find(x => x.id === p.secili)) || akis[0] || null;

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [a?.log?.length]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); p.onClose(); return; }
      if (t?.tagName === 'TEXTAREA' || t?.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
      if (e.code === 'KeyD') { e.stopImmediatePropagation(); bekciDemo('sms').catch(x => p.flash(x.message)); }
      if (e.code === 'KeyM') { e.stopImmediatePropagation(); bekciDemo('mail').catch(x => p.flash(x.message)); }
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, [p]);

  const kontrol = async () => {
    if (!metin.trim()) return;
    setBekliyor(true);
    try { const r = await bekciAnaliz(metin.trim()); p.onSec(r.id); setMetin(''); }
    catch (e: any) { p.flash(`Analiz edilemedi: ${e.message}`); } finally { setBekliyor(false); }
  };

  const bitenAdim = a ? ADIMLAR.filter(([k]) => ['tamam', 'atlandi', 'hata'].includes(a.adimlar[k]?.durum)).length : 0;
  const calisiyor = a ? ADIMLAR.some(([k]) => a.adimlar[k]?.durum === 'calisiyor') || (bitenAdim < ADIMLAR.length && !a.puan && !a.gerekceler.length) : false;

  return (
    <div className="bk2" role="dialog" aria-label="Bekçi">
      <header className="bk2-ust">
        <div className="bk2-baslik"><b>BEKÇİ</b><span>gelen mesaj denetimi · uyarır, engellemez</span></div>
        {durum && (
          <div className="bk2-durumlar">
            <span className={durum.sms.ok ? 'ok' : 'yok'} title={durum.sms.hata}>SMS {durum.sms.ok ? '●' : '○'}</span>
            <span className={durum.mail.durumlar.some(d => d.ok) ? 'ok' : 'yok'} title={durum.mail.hata ?? durum.mail.durumlar.map(d => `${d.ad}: ${d.ok ? 'bağlı' : d.hata}`).join(' · ')}>MAİL {durum.mail.hesap ? `${durum.mail.durumlar.filter(d => d.ok).length}/${durum.mail.hesap}` : '○'}</span>
            <span className={durum.usom ? 'ok' : 'yok'}>USOM {durum.usom ? '●' : '○'}</span>
            <span className={durum.anahtarlar.gsb || durum.anahtarlar.vt ? 'ok' : 'yok'}>GSB/VT {durum.anahtarlar.gsb || durum.anahtarlar.vt ? '●' : '○'}</span>
            <span className={durum.anahtarlar.urlscan ? 'ok' : 'yok'}>SANDBOX {durum.anahtarlar.urlscan ? '●' : '○'}</span>
            <button className={durum.anahtarlar.ntfy ? 'ok' : 'yok'} onClick={() => bekciBildirimTesti().then(r => p.flash(r.ok ? 'Deneme bildirimi gönderildi' : `Bildirim: ${r.hata}`)).catch(e => p.flash(e.message))} title="Deneme bildirimi gönder">PUSH {durum.anahtarlar.ntfy ? '●' : '○'}</button>
          </div>
        )}
        <button className="bk2-kapat" onClick={p.onClose} aria-label="Kapat">✕</button>
      </header>
      {durum && !durum.sms.ok && durum.sms.kurulum && <div className="bk2-uyari"><b>SMS izlenemiyor:</b> {durum.sms.hata}. {durum.sms.kurulum}</div>}
      {durum?.mail.hata && <div className="bk2-uyari"><b>E-posta:</b> {durum.mail.hata}</div>}

      <div className="bk2-govde">
        <aside className="bk2-akis">
          <div className="bk2-etiket">GELEN MESAJLAR</div>
          {!akis.length && <div className="bk2-bos">Henüz analiz edilen mesaj yok. Yeni mesajlar gelir gelmez burada görünür.</div>}
          {akis.map(x => (
            <button key={x.id} className={`bk2-satir s-${x.seviye}${a?.id === x.id ? ' on' : ''}${x.guvenliIsaretli ? ' guvenli' : ''}`} onClick={() => p.onSec(x.id)}>
              <span className="bk2-kaynak">{KAYNAK[x.kaynak]}{x.demo ? ' · DEMO' : ''}</span>
              <span className="bk2-gonderen">{x.gonderen}</span>
              <span className="bk2-saat">{saat(x.zaman)}</span>
              <span className="bk2-rozet">{x.gerekceler.length || x.puan ? x.puan : '…'}</span>
            </button>
          ))}
        </aside>

        <section className="bk2-analiz">
          {!a ? <div className="bk2-bos">Bir mesaj seçin ya da aşağıya yapıştırın.</div> : (
            <>
              <div className="bk2-ust2">
                <Reaktor puan={a.puan} seviye={a.seviye} calisiyor={calisiyor} />
                <div className="bk2-ozet">
                  <div className="bk2-kaynak2">{KAYNAK[a.kaynak]} · {a.gonderen} · {saat(a.zaman)}</div>
                  <div className={`bk2-seviye s-${a.seviye}`}>{calisiyor ? 'ANALİZ EDİLİYOR…' : SEVIYE[a.seviye]}</div>
                  {!calisiyor && a.cevap && <p className="bk2-cevap">{a.cevap}</p>}
                  <div className="bk2-model">model: {a.model ?? '—'}{a.sureMs ? ` · ${(a.sureMs / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn` : ''}</div>
                </div>
                {!calisiyor && a.seviye === 'tehlikeli' && <div className="bk2-damga">TUZAK</div>}
              </div>

              <div className="bk2-adimlar">
                {ADIMLAR.map(([k, ad]) => {
                  const s = a.adimlar[k] ?? { durum: 'bekliyor', not: '' };
                  return <div key={k} className={`bk2-hap d-${s.durum}`} title={s.not}><b>{ad}</b><span>{s.not || s.durum}</span></div>;
                })}
              </div>
              <div className="bk2-ilerleme"><i style={{ width: `${(bitenAdim / ADIMLAR.length) * 100}%` }} /></div>

              <div className="bk2-iki">
                <div>
                  <div className="bk2-etiket">GEREKÇELER</div>
                  <ul className="bk2-gerekce">{a.gerekceler.map((g, i) => <li key={i}>{g}</li>)}{!a.gerekceler.length && <li className="bos">—</li>}</ul>
                  {a.linkler.length > 0 && <>
                    <div className="bk2-etiket">LİNKLER (tıklanamaz)</div>
                    <ul className="bk2-linkler">{a.linkler.map((l, i) => <li key={i} className={l.resmi ? 'resmi' : ''}><code>{l.goster}</code><span>{l.resmi ? 'resmî' : [l.yasGun !== null ? `${l.yasGun} günlük` : 'yaşı bilinmiyor', l.usom ? 'USOM LİSTESİNDE' : 'listede yok'].join(' · ')}</span></li>)}</ul>
                  </>}
                  {a.sandbox?.formAlanlari.length ? <div className="bk2-sandbox"><b>SANDBOX:</b> sayfa {a.sandbox.formAlanlari.join(', ')} istiyor.</div> : null}
                  {a.sandbox?.ekran ? <img className="bk2-ekran" src={a.sandbox.ekran} alt="Sandbox ekran görüntüsü (urlscan.io)" referrerPolicy="no-referrer" /> : null}
                </div>
                <div>
                  <div className="bk2-etiket">ANALİZ GÜNLÜĞÜ</div>
                  <div className="bk2-log" ref={logRef}>{(a.log ?? []).map((l, i) => <div key={i}>{l}</div>)}{calisiyor && <div className="imlec">▌</div>}</div>
                  <div className="bk2-dugmeler">
                    <button disabled={a.guvenliIsaretli} onClick={() => bekciGuvenli(a.id).then(() => p.flash('Güvenli olarak işaretlendi')).catch(e => p.flash(e.message))}>{a.guvenliIsaretli ? 'Güvenli işaretli' : 'Güvenli işaretle'}</button>
                    {a.kaynak !== 'el' && <button onClick={() => bekciBeyaz({ gonderen: a.gonderen }).then(() => p.flash(`${a.gonderen} beyaz listede`)).catch(e => p.flash(e.message))}>Göndereni beyaz listeye al</button>}
                    {a.linkler[0] && <button onClick={() => bekciBeyaz({ alan: a.linkler[0].alan.split(' ')[0] }).then(() => p.flash(`${a.linkler[0].alan} beyaz listede`)).catch(e => p.flash(e.message))}>Alan adını beyaz listeye al</button>}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <footer className="bk2-alt">
        <textarea value={metin} onChange={e => setMetin(e.target.value)} placeholder="Şüphelendiğiniz mesajı buraya yapıştırın…" rows={2} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void kontrol(); }} />
        <button className="bk2-ana" onClick={() => void kontrol()} disabled={bekliyor || !metin.trim()}>{bekliyor ? 'Kontrol ediliyor…' : 'Kontrol et'}</button>
      </footer>
    </div>
  );
}

/** Risk reaktörü: puan halkası; şüphelide turuncu, tehlikelide kırmızı ve nabız */
function Reaktor({ puan, seviye, calisiyor }: { puan: number; seviye: Analiz['seviye']; calisiyor: boolean }) {
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div className={`bk2-reaktor r-${calisiyor ? 'calisiyor' : seviye}`}>
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="66" className="dis" />
        <circle cx="70" cy="70" r={R} className="iz" />
        <circle cx="70" cy="70" r={R} className="deger" style={{ strokeDasharray: C, strokeDashoffset: calisiyor ? C * 0.75 : C * (1 - puan / 100) }} transform="rotate(-90 70 70)" />
        <circle cx="70" cy="70" r="30" className="cekirdek" />
      </svg>
      <div className="bk2-puan">{calisiyor ? '…' : puan}<small>/100</small></div>
    </div>
  );
}
