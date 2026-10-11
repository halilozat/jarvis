import { useState } from 'react';

/**
 * Sunucu erişim anahtarı (ACCESS_TOKEN) istiyor ve bu cihazda yoksa/yanlışsa: anahtarı yapıştırma ekranı.
 * iPhone/iPad ana ekran uygulaması Safari'den ayrı depolama kullanır; "?token=" bağlantısı oraya geçmez, bu yüzden gerekli.
 */
export function TokenGate({ wrong }: { wrong: boolean }) {
  const [v, setV] = useState('');
  const save = () => {
    const t = v.trim();
    if (!t) return;
    try { localStorage.setItem('jarvis.token', t); } catch { /* yok say */ }
    location.reload();
  };
  return (
    <div className="tokengate">
      <div className="tg-box">
        <div className="tg-title">JARVIS · ERİŞİM ANAHTARI</div>
        <p>{wrong ? 'Bu cihazdaki anahtar geçersiz (değişmiş olabilir).' : 'Bu Jarvis bir erişim anahtarıyla korunuyor.'} Anahtarı yapıştırın; bu cihazda saklanır.</p>
        <form onSubmit={e => { e.preventDefault(); save(); }}>
          <input value={v} onChange={e => setV(e.target.value)} placeholder="anahtar" autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false} type="password" />
          <button type="submit" disabled={!v.trim()}>Giriş</button>
        </form>
        <p className="tg-note">Anahtar bilgisayardaki server/.env dosyasında ACCESS_TOKEN satırında.</p>
      </div>
    </div>
  );
}
