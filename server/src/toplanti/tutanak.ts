// Toplantı Odası · tutanak. Tüm transkript tek çağrıyla JSON tutanağa çevrilir; ekranda gösterilir ve
// server/data/meetings/YYYY-MM-DD_HHMM_<başlık>.md olarak kaydedilir (git'e girmez: repo herkese açık). Ses kaydı yok;
// yalnızca metin. Saklama süresi dolan dosyalar silinir (config/meeting.json → transkript_saklama_gun).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routellmStream, type ChatMessage } from '../routellm.js';
import { jsonAyikla, type DebateSession } from './oturum.js';

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERI = () => process.env.MEETING_DATA || path.join(KOK, 'data', 'meetings');

export interface Tutanak {
  title: string;
  date: string;
  participants: string[];
  decisions: string[];
  open_questions: string[];
  action_items: { who: string; what: string; when: string }[];
  summary: string;
}

const AD = { user: 'Kullanıcı', jarvis: 'Jarvis', friday: 'Friday' } as const;
export const dokum = (o: DebateSession) => o.transcript.map(s => `${AD[s.konusan]}: ${s.metin}`).join('\n');

export function tutanakDogrula(ham: string): Tutanak | null {
  const j = jsonAyikla(ham);
  if (!j || typeof j.summary !== 'string') return null;
  const d = (x: unknown) => (Array.isArray(x) ? x.map(v => String(v).trim()).filter(Boolean) : []);
  return {
    title: String(j.title || 'Toplantı').trim().slice(0, 80),
    date: String(j.date || '').trim(),
    participants: d(j.participants).length ? d(j.participants) : ['Kullanıcı', 'Jarvis', 'Friday'],
    decisions: d(j.decisions), open_questions: d(j.open_questions),
    action_items: Array.isArray(j.action_items) ? j.action_items.map((a: any) => ({ who: String(a?.who ?? '').trim(), what: String(a?.what ?? '').trim(), when: String(a?.when ?? '').trim() })).filter((a: any) => a.what) : [],
    summary: j.summary.trim(),
  };
}

export async function tutanakCikar(o: DebateSession, model: string, maliyet: (m: ChatMessage[], c: string) => void): Promise<Tutanak> {
  const tarih = new Date().toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const mesajlar: ChatMessage[] = [
    { role: 'system', content: fs.readFileSync(path.join(KOK, 'prompts', 'tutanak_meeting.md'), 'utf8').replace(/\{\{tarih\}\}/g, tarih) },
    { role: 'user', content: `${o.topic ? `Konu: ${o.topic}\n\n` : ''}${dokum(o)}`.slice(-30_000) },
  ];
  const r = await routellmStream({ model, messages: mesajlar, temperature: 0.1, max_tokens: 900 }).catch(() => null);
  maliyet(mesajlar, r?.content ?? '');
  return tutanakDogrula(r?.content ?? '') ?? {
    title: o.topic.slice(0, 60) || 'Toplantı', date: tarih, participants: ['Kullanıcı', 'Jarvis', 'Friday'],
    decisions: o.uzlasma ? [o.uzlasma.recommendation] : [], open_questions: o.uzlasma?.disagreed ?? [], action_items: [],
    summary: o.uzlasma ? `Önerimiz: ${o.uzlasma.recommendation}.` : 'Toplantı kaydedildi; tutanak özeti çıkarılamadı.',
  };
}

const dosyaAdi = (t: string) => t.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'toplanti';

export function tutanakMd(t: Tutanak, o: DebateSession, ek: { modeller: { jarvis: string; friday: string }; maliyet: { token: number; tts: number }; sure: number }): string {
  const liste = (x: string[]) => (x.length ? x.map(s => `- ${s}`).join('\n') : '- —');
  return `# ${t.title}

**Tarih:** ${t.date}
**Katılımcılar:** ${t.participants.join(', ')}
**Modeller:** Jarvis · ${ek.modeller.jarvis} — Friday · ${ek.modeller.friday}
**Süre:** ${Math.round(ek.sure / 60000)} dk · ≈${ek.maliyet.token.toLocaleString('tr-TR')} token · ${ek.maliyet.tts.toLocaleString('tr-TR')} TTS karakteri

> ${t.summary}

## Kararlar
${liste(t.decisions)}

## Açık sorular
${liste(t.open_questions)}

## Yapılacaklar
${t.action_items.length ? t.action_items.map(a => `- **${a.who || '—'}:** ${a.what}${a.when ? ` (${a.when})` : ''}`).join('\n') : '- —'}
${o.uzlasma ? `\n## Jarvis ile Friday'in ortak sonucu\n- **Anlaşılan:** ${o.uzlasma.agreed.join(' · ') || '—'}\n- **Anlaşılamayan:** ${o.uzlasma.disagreed.join(' · ') || '—'}\n- **Öneri:** ${o.uzlasma.recommendation} (güven: ${o.uzlasma.confidence})\n` : ''}
## Döküm
${o.transcript.map(s => `**${AD[s.konusan]}:** ${s.metin}`).join('\n\n')}
`;
}

export function tutanakKaydet(t: Tutanak, o: DebateSession, ek: Parameters<typeof tutanakMd>[2]): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ad = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_${dosyaAdi(t.title)}`;
  fs.mkdirSync(VERI(), { recursive: true });
  const f = path.join(VERI(), `${ad}.md`);
  fs.writeFileSync(f, tutanakMd(t, o, ek));
  fs.writeFileSync(path.join(VERI(), `${ad}.json`), JSON.stringify(t));
  return f;
}

/** Son toplantının tutanağı ("Son toplantının kararları neydi?") */
export function sonTutanak(): (Tutanak & { dosya: string }) | null {
  try {
    const f = fs.readdirSync(VERI()).filter(x => /^\d{4}-\d{2}-\d{2}_\d{4}_.+\.json$/.test(x)).sort().at(-1);
    return f ? { ...JSON.parse(fs.readFileSync(path.join(VERI(), f), 'utf8')), dosya: f.replace(/\.json$/, '.md') } : null;
  } catch { return null; }
}

/** Saklama süresi dolan tutanak/transkript dosyalarını sil */
export function eskileriSil(gun: number) {
  try {
    const sinir = Date.now() - gun * 86_400_000;
    for (const f of fs.readdirSync(VERI())) {
      const p = path.join(VERI(), f);
      if (fs.statSync(p).mtimeMs < sinir) fs.rmSync(p, { force: true });
    }
  } catch { /* klasör yok */ }
}

/** "Son toplantının kararları neydi?" sesli cevabı */
export function sonKararlarSozu(t: Tutanak | null): string {
  if (!t) return 'Henüz kaydedilmiş bir toplantı yok efendim.';
  const k = t.decisions.slice(0, 3);
  return k.length
    ? `Son toplantı "${t.title}" konusundaydı efendim. ${k.length === 1 ? 'Alınan karar' : 'Alınan kararlar'}: ${k.map(x => x.replace(/[.\s]+$/, '')).join('; ')}.${t.action_items[0] ? ` Yapılacak ilk iş: ${t.action_items[0].what.replace(/[.\s]+$/, '')}.` : ''}`
    : `Son toplantı "${t.title}" konusundaydı efendim ama net bir karar alınmamıştı. Özet: ${t.summary}`;
}
