// `npm run test`: 1) RSS kaynaklarını, 2) RouteLLM tool calling'i kontrol eder.
import Parser from 'rss-parser';
import { FEEDS } from './news.js';
import { API_KEY, CHAT_MODEL, routellm, type ChatResponse } from './routellm.js';
import { TOOLS } from './tools.js';

const parser = new Parser({ timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });

console.log('— RSS kaynakları —');
for (const f of FEEDS) {
  try {
    const feed = await parser.parseURL(f.url);
    console.log(`✅ ${f.source.padEnd(15)} ${f.category.padEnd(10)} ${feed.items.length} haber`);
  } catch (e: any) {
    console.log(`❌ ${f.source.padEnd(15)} ${f.category.padEnd(10)} ${String(e.message).slice(0, 60)}`);
  }
}

if (!API_KEY) {
  console.log('\nABACUS_API_KEY yok; tool calling testi atlandı.');
  process.exit(0);
}

console.log(`\n— Tool calling (${CHAT_MODEL}) —`);
for (let i = 1; i <= 3; i++) {
  try {
    const r = await routellm<ChatResponse>('/chat/completions', {
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: 'Günaydın, bugünün gündemini özetler misin?' }],
      tools: TOOLS,
      tool_choice: 'auto',
    });
    const m = r.choices[0].message;
    if (m.tool_calls?.length) console.log(`✅ Deneme ${i}: yapılandırılmış tool call → ${m.tool_calls[0].function.name}(${m.tool_calls[0].function.arguments}) [model: ${r.model}]`);
    else if (/get_news/.test(typeof m.content === 'string' ? m.content : '')) console.log(`⚠️ Deneme ${i}: tool call DÜZ METİN olarak geldi (fallback devreye girer) [model: ${r.model}]`);
    else console.log(`❌ Deneme ${i}: tool çağrılmadı [model: ${r.model}] → ${String(m.content ?? '').slice(0, 80)}`);
  } catch (e: any) {
    console.log(`❌ Deneme ${i}: ${e.message}`);
  }
}
