import { useEffect, useState } from 'react';
import { addMemory, deleteMemory, getProfile, saveProfile, type MemoryItem } from '../lib/api';

/**
 * Ayarlar → Hakkımda: Jarvis'in sizi tanıdığı metin ve konuşmalarda not ettikleri (hafıza).
 * İkisi de yalnızca bu bilgisayardaki sunucuda saklanır; her istekte modele gönderilir.
 */
export function ProfileSettings({ flash }: { flash(t: string): void }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [updated, setUpdated] = useState<string | null>(null);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getProfile()
      .then(d => { setText(d.profile.text); setSaved(d.profile.text); setUpdated(d.profile.updated_at); setMemory(d.memory); })
      .catch(() => setText(''));
  }, []);

  const save = () => {
    if (text === null) return;
    saveProfile(text)
      .then(r => { setSaved(r.profile.text); setUpdated(r.profile.updated_at); flash('Tanıtım kaydedildi · Jarvis bir sonraki cevaptan itibaren bunu biliyor'); })
      .catch(e => flash(e.message));
  };
  const add = () => {
    if (!note.trim()) return;
    addMemory(note).then(r => { setMemory(r.memory); setNote(''); }).catch(e => flash(e.message));
  };

  const dirty = text !== null && text !== saved;
  return (
    <>
      <label>Hakkımda (Jarvis sizi bununla tanır)</label>
      {text === null ? <p className="muted small">yükleniyor…</p> : (
        <>
          {!open ? (
            <button className="profile-peek" onClick={() => setOpen(true)}>
              <span>{saved.split('\n').find(l => l.trim() && !l.startsWith('━')) ?? 'Tanıtım boş'}</span>
              <em>{saved.length} karakter{updated ? ` · ${new Date(updated).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}` : ''} · düzenle</em>
            </button>
          ) : (
            <>
              <textarea className="profile-text" value={text} onChange={e => setText(e.target.value)} rows={14} maxLength={8000} />
              <div className="seg">
                <button className={dirty ? 'on' : ''} disabled={!dirty} onClick={save}>Kaydet</button>
                <button onClick={() => { setText(saved); setOpen(false); }}>{dirty ? 'Vazgeç' : 'Kapat'}</button>
              </div>
            </>
          )}
          <p className="muted small">Yalnızca bu bilgisayarda saklanır, GitHub'a gitmez. Her soruda modele (RouteLLM) gönderilir; TC no, adres, sağlık gibi hassas bilgileri yazmayın.</p>
        </>
      )}

      <label>Jarvis'in hafızası · {memory.length} not</label>
      <p className="muted small">Konuşurken "Jarvis, unutma: …" derseniz kendisi not eder; "bunu unut" derseniz siler.</p>
      {memory.length > 0 && (
        <ul className="memory">
          {memory.map(m => (
            <li key={m.id}>
              <span>{m.text}</span>
              <em>{new Date(m.at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</em>
              <button aria-label="Notu sil" onClick={() => deleteMemory(m.id).then(r => setMemory(r.memory)).catch(e => flash(e.message))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <form className="memory-add" onSubmit={e => { e.preventDefault(); add(); }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Elle not ekle (ör. Cuma günleri çekim yapıyorum)" maxLength={300} />
        <button type="submit" disabled={!note.trim()}>Ekle</button>
      </form>
    </>
  );
}
