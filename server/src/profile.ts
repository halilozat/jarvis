// Kullanıcı profili ("Hakkımda") ve Jarvis'in hafızası. İkisi de yalnızca bu bilgisayarda, server/data altında durur
// (git'e girmez) ve her istekte modelin talimatına eklenir.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const PROFILE_FILE = path.join(DATA, 'profile.json');
const MEMORY_FILE = path.join(DATA, 'memory.json');

export interface Profile { text: string; updated_at: string | null }
export interface MemoryItem { id: string; text: string; at: string }

const MAX_PROFILE = 8000;
const MAX_NOTE = 300;
const MAX_NOTES = 200;

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file: string, v: unknown) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v, null, 2));
}

export function getProfile(): Profile {
  const p = readJson<Profile>(PROFILE_FILE, { text: '', updated_at: null });
  // Profil boşsa .env'deki kısa tanım (eski davranış)
  if (!p.text.trim()) return { text: process.env.USER_ABOUT || "Türkiye'de yaşıyor, yazılımcı ve içerik üreticisi.", updated_at: null };
  return p;
}
export function saveProfile(text: string): Profile {
  const p = { text: String(text).replace(/\r\n/g, '\n').trim().slice(0, MAX_PROFILE), updated_at: new Date().toISOString() };
  writeJson(PROFILE_FILE, p);
  return p;
}

export const getMemory = (): MemoryItem[] => readJson<MemoryItem[]>(MEMORY_FILE, []);

export function addMemory(text: string): MemoryItem | null {
  const t = String(text).replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
  if (!t) return null;
  const list = getMemory();
  // Aynı not ikinci kez eklenmesin
  if (list.some(m => m.text.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))) return null;
  const item = { id: randomUUID().slice(0, 8), text: t, at: new Date().toISOString() };
  writeJson(MEMORY_FILE, [...list, item].slice(-MAX_NOTES));
  return item;
}

export function removeMemory(id: string): MemoryItem | null {
  const list = getMemory();
  const hit = list.find(m => m.id === id);
  if (!hit) return null;
  writeJson(MEMORY_FILE, list.filter(m => m.id !== id));
  return hit;
}

/** Talimata girecek hafıza bölümü: kimlik + tarih + not (model silerken kimliği kullanır) */
export function memoryForPrompt(): string {
  const list = getMemory();
  if (!list.length) return '(henüz not yok)';
  return list.map(m => `- [${m.id}] ${m.text} (${m.at.slice(0, 10)})`).join('\n');
}
