import type { ReactNode } from 'react';

// Küçük ve güvenli markdown: başlık, madde, alıntı, kalın, italik, kod, link.
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!;
      out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>);
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = (k: number) => {
    if (list.length) blocks.push(<ul key={'ul' + k}>{list}</ul>);
    list = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(<li key={i}>{inline(line.replace(/^\s*[-*]\s+/, ''), 'l' + i)}</li>);
      return;
    }
    flush(i);
    if (h) blocks.push(<h4 key={i}>{inline(h[2], 'h' + i)}</h4>);
    else if (line.startsWith('>')) blocks.push(<blockquote key={i}>{inline(line.replace(/^>\s?/, ''), 'q' + i)}</blockquote>);
    else if (line.trim()) blocks.push(<p key={i}>{inline(line, 'p' + i)}</p>);
  });
  flush(lines.length);
  return <div className="md">{blocks}</div>;
}
