import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Device, JarvisReply } from './types.js';

export interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  device: Device;
  at: string;
  reply?: JarvisReply;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');
const INDEX_FILE = path.join(SESSIONS_DIR, 'index.json');
const ACTIVE_FILE = path.join(SESSIONS_DIR, 'active.json');

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function loadIndex(): SessionSummary[] {
  ensureDir();
  try {
    if (fs.existsSync(INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[sessions] İndeks okunamadı, sıfırlanıyor:', e);
  }
  return [];
}

function saveIndex(list: SessionSummary[]) {
  ensureDir();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function loadActiveId(): string | null {
  ensureDir();
  try {
    if (fs.existsSync(ACTIVE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
      return parsed.activeId || null;
    }
  } catch {}
  return null;
}

function saveActiveId(activeId: string) {
  ensureDir();
  fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ activeId }, null, 2), 'utf8');
}

function sessionFilePath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

/**
 * Oturum yönetimini başlatır ve gerekirse mevcut eski mesajları ilk oturuma aktarır.
 */
export function initSessions(initialMessages?: StoredMessage[]): ChatSession {
  ensureDir();
  let index = loadIndex();
  let activeId = loadActiveId();

  if (activeId && fs.existsSync(sessionFilePath(activeId))) {
    try {
      return JSON.parse(fs.readFileSync(sessionFilePath(activeId), 'utf8'));
    } catch {}
  }

  if (index.length > 0 && fs.existsSync(sessionFilePath(index[0].id))) {
    try {
      const sess = JSON.parse(fs.readFileSync(sessionFilePath(index[0].id), 'utf8'));
      saveActiveId(sess.id);
      return sess;
    } catch {}
  }

  // Hiç oturum yoksa yeni bir oturum oluştur
  const now = new Date().toISOString();
  const id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const defaultTitle = initialMessages && initialMessages.length > 0
    ? (initialMessages[0].text.slice(0, 32) || 'Önceki Sohbet')
    : 'Yeni Sohbet';

  const newSession: ChatSession = {
    id,
    title: defaultTitle,
    createdAt: now,
    updatedAt: now,
    messages: initialMessages ? [...initialMessages] : [],
  };

  fs.writeFileSync(sessionFilePath(id), JSON.stringify(newSession, null, 2), 'utf8');
  index = [{
    id,
    title: newSession.title,
    createdAt: now,
    updatedAt: now,
    messageCount: newSession.messages.length,
    lastMessage: newSession.messages[newSession.messages.length - 1]?.text?.slice(0, 50),
  }];
  saveIndex(index);
  saveActiveId(id);

  return newSession;
}

export function getActiveSession(): ChatSession {
  const activeId = loadActiveId();
  if (activeId && fs.existsSync(sessionFilePath(activeId))) {
    try {
      return JSON.parse(fs.readFileSync(sessionFilePath(activeId), 'utf8'));
    } catch {}
  }
  return initSessions();
}

export function listSessions(): SessionSummary[] {
  return loadIndex();
}

export function getSession(id: string): ChatSession | null {
  const p = sessionFilePath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function createSession(title?: string): ChatSession {
  ensureDir();
  const now = new Date().toISOString();
  const id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const sessionTitle = title?.trim() || `Sohbet ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;

  const newSession: ChatSession = {
    id,
    title: sessionTitle,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };

  fs.writeFileSync(sessionFilePath(id), JSON.stringify(newSession, null, 2), 'utf8');

  const index = loadIndex();
  index.unshift({
    id,
    title: sessionTitle,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  });
  saveIndex(index);
  saveActiveId(id);

  return newSession;
}

export function switchSession(id: string): ChatSession | null {
  const sess = getSession(id);
  if (!sess) return null;
  saveActiveId(id);
  return sess;
}

export function deleteSession(id: string): boolean {
  const p = sessionFilePath(id);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }

  let index = loadIndex();
  index = index.filter(s => s.id !== id);
  saveIndex(index);

  const activeId = loadActiveId();
  if (activeId === id) {
    if (index.length > 0) {
      saveActiveId(index[0].id);
    } else {
      createSession();
    }
  }

  return true;
}

export function appendMessageToActiveSession(msg: StoredMessage): ChatSession {
  const sess = getActiveSession();
  sess.messages.push(msg);
  sess.updatedAt = new Date().toISOString();

  // Oturum başlığı henüz varsayılan veya boş ise, ilk kullanıcı mesajından otomatik anlamlı başlık üret
  if (msg.role === 'user' && (sess.title.startsWith('Yeni Sohbet') || sess.title.startsWith('Sohbet '))) {
    const clean = msg.text.replace(/^[📷\s]+/, '').trim();
    if (clean.length > 0) {
      sess.title = clean.length > 36 ? clean.slice(0, 35) + '…' : clean;
    }
  }

  fs.writeFileSync(sessionFilePath(sess.id), JSON.stringify(sess, null, 2), 'utf8');

  // İndeksi güncelle
  const index = loadIndex();
  const idx = index.findIndex(s => s.id === sess.id);
  const summary: SessionSummary = {
    id: sess.id,
    title: sess.title,
    createdAt: sess.createdAt,
    updatedAt: sess.updatedAt,
    messageCount: sess.messages.length,
    lastMessage: msg.text.slice(0, 60),
  };

  if (idx >= 0) {
    index.splice(idx, 1);
  }
  index.unshift(summary); // Son kullanılan oturumu başa al
  saveIndex(index);

  return sess;
}

export function clearActiveSessionMessages(): ChatSession {
  const sess = getActiveSession();
  sess.messages = [];
  sess.updatedAt = new Date().toISOString();
  fs.writeFileSync(sessionFilePath(sess.id), JSON.stringify(sess, null, 2), 'utf8');

  const index = loadIndex();
  const item = index.find(s => s.id === sess.id);
  if (item) {
    item.messageCount = 0;
    item.lastMessage = undefined;
    item.updatedAt = sess.updatedAt;
    saveIndex(index);
  }

  return sess;
}

/**
 * Tüm oturumların mesajlarında anahtar kelime veya konu araması yapar.
 * Jarvis'in önceki konuşmaları hatırlamasını sağlayan hafıza arama motoru.
 */
export function searchSessionsHistory(query: string, limit = 5): Array<{
  sessionId: string;
  sessionTitle: string;
  date: string;
  role: 'user' | 'assistant';
  snippet: string;
}> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const index = loadIndex();
  const results: Array<{
    sessionId: string;
    sessionTitle: string;
    date: string;
    role: 'user' | 'assistant';
    snippet: string;
    score: number;
  }> = [];

  for (const s of index) {
    const full = getSession(s.id);
    if (!full) continue;

    for (const m of full.messages) {
      const textLower = m.text.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (textLower.includes(term)) score += 1;
      }

      if (score > 0) {
        // Snippet çıkar
        const matchIdx = textLower.indexOf(terms[0]);
        const start = Math.max(0, matchIdx - 40);
        const end = Math.min(m.text.length, matchIdx + 120);
        const snippet = (start > 0 ? '…' : '') + m.text.substring(start, end).trim() + (end < m.text.length ? '…' : '');

        results.push({
          sessionId: full.id,
          sessionTitle: full.title,
          date: m.at,
          role: m.role,
          snippet,
          score,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score || new Date(b.date).getTime() - new Date(a.date).getTime());
  return results.slice(0, limit);
}
