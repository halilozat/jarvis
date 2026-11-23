/**
 * Canlı Web Araması (DuckDuckGo tabanlı, ek anahtar gerekmez)
 */

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export async function searchWeb(query: string, limit = 5): Promise<{ query: string; results: SearchResult[]; answer?: string }> {
  const cleanQ = query.trim();
  if (!cleanQ) return { query: cleanQ, results: [] };

  // 1. DuckDuckGo Instant Answer API dene
  let instantAnswer: string | undefined;
  try {
    const instantUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQ)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(instantUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const data: any = await r.json();
      if (data.AbstractText) {
        instantAnswer = data.AbstractText;
      }
    }
  } catch {}

  // 2. DuckDuckGo HTML Lite arama
  const results: SearchResult[] = [];
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const html = await res.text();
      // HTML içindeki sonuç bloklarını tara
      const blockRegex = /<a class="result__snippet[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const titleRegex = /<a class="result__url"[^>]*>([\s\S]*?)<\/a>/gi;
      
      const snippetMatches = [...html.matchAll(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi)];
      const titleMatches = [...html.matchAll(/<h2 class="result__title">[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];

      for (let i = 0; i < Math.min(titleMatches.length, limit); i++) {
        const titleMatch = titleMatches[i];
        const snippetMatch = snippetMatches[i];

        let rawUrl = titleMatch?.[1] || '';
        // DuckDuckGo yönlendirme URL'sini çöz (//duckduckgo.com/l/?uddg=...)
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          rawUrl = decodeURIComponent(uddgMatch[1]);
        }

        const title = decodeHtml(titleMatch?.[2] || '');
        const snippet = decodeHtml(snippetMatch?.[1] || '');

        if (title && snippet) {
          results.push({
            title,
            snippet,
            url: rawUrl,
          });
        }
      }
    }
  } catch (e: any) {
    console.warn(`[websearch] Arama hatası (${cleanQ}):`, e.message);
  }

  return {
    query: cleanQ,
    answer: instantAnswer,
    results: results.slice(0, limit),
  };
}
