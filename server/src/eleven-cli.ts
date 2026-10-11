// npm run eleven              → kullanım, hesaptaki sesler, kütüphanedeki en çok kullanılan Türkçe erkek sesler
// npm run eleven -- kadin     → Türkçe kadın sesler
// npm run eleven -- ekle <public_owner_id> <voice_id> <ad>   → kütüphanedeki sesi hesaba ekler (Ayarlar'da görünür)
import { ELEVEN_KEY, ELEVEN_MODEL, elevenAddShared, elevenSearchTurkish, elevenUsage, elevenVoices } from './eleven.js';

if (!ELEVEN_KEY) {
  console.error('ELEVENLABS_API_KEY yok. server/.env dosyasına ekleyin.');
  process.exit(1);
}
const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'ekle') {
  const [owner, id, ...name] = args;
  if (!owner || !id) { console.error('Kullanım: npm run eleven -- ekle <public_owner_id> <voice_id> <ad>'); process.exit(1); }
  const vid = await elevenAddShared(owner, id, name.join(' ') || 'Jarvis');
  console.log(`Eklendi: ${vid} — Ayarlar → Seslendiren'de görünür.`);
  process.exit(0);
}

const u = await elevenUsage();
console.log(u ? `Plan: ${u.tier} · bu ay ${u.used.toLocaleString('tr-TR')} / ${u.limit.toLocaleString('tr-TR')} karakter${u.resetAt ? ` · yenilenme ${u.resetAt.slice(0, 10)}` : ''}` : 'Kullanım bilgisi alınamadı');
console.log(`Model: ${ELEVEN_MODEL}\n`);

const mine = await elevenVoices();
console.log(`Hesaptaki sesler (${mine.length}):`);
for (const v of mine) console.log(`  ${v.voice_id}  ${v.name}  ${v.category ?? ''} ${v.labels ? JSON.stringify(v.labels) : ''}`);

const lib = await elevenSearchTurkish(cmd === 'kadin' ? 'female' : 'male');
console.log(`\nKütüphanede Türkçe ${cmd === 'kadin' ? 'kadın' : 'erkek'} sesler (kullanıma göre):`);
for (const v of lib) {
  console.log(`  ${v.name} · ${v.age ?? ''} ${v.accent ?? ''} · ${v.use_case ?? ''} · ${v.descriptive ?? ''}`);
  console.log(`     ekle: npm run eleven -- ekle ${v.public_owner_id} ${v.voice_id} "${v.name}"`);
  if (v.preview_url) console.log(`     dinle: ${v.preview_url}`);
}
