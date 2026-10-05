import 'dotenv/config';

export const BASE_URL = process.env.ROUTELLM_BASE_URL || 'https://routellm.abacus.ai/v1';
export const API_KEY = process.env.ABACUS_API_KEY || '';
export const CHAT_MODEL = process.env.CHAT_MODEL || 'route-llm';
export const MOCK = process.env.MOCK === '1' || !API_KEY;

export class RouteLLMError extends Error {
  constructor(public status: number, public body: string) {
    super(`RouteLLM ${status}: ${body.slice(0, 300)}`);
  }
}

export async function routellm<T = any>(path: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new RouteLLMError(res.status, text);
  return JSON.parse(text) as T;
}

export interface StreamResult {
  content: string;
  tool_calls: NonNullable<ChatMessage['tool_calls']>;
  model: string | null;
  /** İsteğin gönderilmesinden ilk içerik/araç parçasına kadar geçen süre */
  firstTokenMs: number | null;
  totalMs: number;
}

/**
 * Akışlı sohbet isteği (`stream: true`). İçerik geldikçe `onContent` çağrılır; araç çağrıları parçalardan birleştirilir.
 * Sahne JSON'u bu sayede tamamı bitmeden okunmaya başlar (ilk sahne hazır olunca TTS'i başlar).
 */
export async function routellmStream(body: object, onContent?: (delta: string, full: string) => void): Promise<StreamResult> {
  const t0 = performance.now();
  const res = await fetch(BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) throw new RouteLLMError(res.status, await res.text());
  const dec = new TextDecoder();
  let buf = '';
  let content = '';
  let model: string | null = null;
  let firstTokenMs: number | null = null;
  const calls: { id: string; name: string; args: string }[] = [];
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j: any;
      try { j = JSON.parse(data); } catch { continue; }
      model ??= j.model ?? null;
      const d = j.choices?.[0]?.delta ?? {};
      if ((d.content || d.tool_calls) && firstTokenMs === null) firstTokenMs = Math.round(performance.now() - t0);
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? 0;
        calls[i] ??= { id: '', name: '', args: '' };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
      if (typeof d.content === 'string' && d.content) {
        content += d.content;
        onContent?.(d.content, content);
      }
    }
  }
  return {
    content,
    tool_calls: calls.filter(Boolean).map((c, i) => ({ id: c.id || `call_${i}`, type: 'function' as const, function: { name: c.name, arguments: c.args } })),
    model,
    firstTokenMs,
    totalMs: Math.round(performance.now() - t0),
  };
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | ContentPart[];
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ChatResponse {
  model?: string;
  choices: {
    message: ChatMessage & {
      audio?: { data: string };
      audios?: { id: string; data: string; expires_at: number; transcript: string }[];
    };
    finish_reason: string;
  }[];
}
