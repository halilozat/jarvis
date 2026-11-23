import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { showNotification } from './notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const TODOS_FILE = path.join(DATA_DIR, 'todos.json');

export interface Reminder {
  id: string;
  text: string;
  targetTime: string;
  minutes: number;
  completed: boolean;
}

export interface TodoItem {
  id: string;
  text: string;
  priority: 'dusuk' | 'normal' | 'yuksek';
  completed: boolean;
  createdAt: string;
}

let activeTimers = new Map<string, NodeJS.Timeout>();

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {}
  return fallback;
}

function saveJson<T>(file: string, data: T) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e: any) {
    console.error(`[reminders] Dosya kaydedilemedi (${file}):`, e.message);
  }
}

// ---------- HATIRLATICILAR ----------

export function addReminder(text: string, minutes: number): { success: boolean; reminder: Reminder; message: string } {
  const ms = Math.max(1, Math.round(minutes * 60 * 1000));
  const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const targetDate = new Date(Date.now() + ms);

  const reminder: Reminder = {
    id,
    text,
    minutes,
    targetTime: targetDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    completed: false,
  };

  const reminders = loadJson<Reminder[]>(REMINDERS_FILE, []);
  reminders.push(reminder);
  saveJson(REMINDERS_FILE, reminders);

  const timer = setTimeout(() => {
    console.log(`\n🔔 [JARVIS HATIRLATICI]: ${text}`);
    showNotification('Jarvis Hatırlatıcı', text);
    reminder.completed = true;
    const all = loadJson<Reminder[]>(REMINDERS_FILE, []);
    const idx = all.findIndex((r) => r.id === id);
    if (idx >= 0) {
      all[idx].completed = true;
      saveJson(REMINDERS_FILE, all);
    }
    activeTimers.delete(id);
  }, ms);

  activeTimers.set(id, timer);

  return {
    success: true,
    reminder,
    message: `${minutes} dakika sonrası için (${reminder.targetTime}) "${text}" hatırlatıcısı kuruldu.`,
  };
}

export function listReminders(): Reminder[] {
  return loadJson<Reminder[]>(REMINDERS_FILE, []).filter((r) => !r.completed);
}

// ---------- YAPILACAKLAR (TODO) ----------

export function addTodo(text: string, priority: 'dusuk' | 'normal' | 'yuksek' = 'normal'): { success: boolean; item: TodoItem; message: string } {
  const todos = loadJson<TodoItem[]>(TODOS_FILE, []);
  const item: TodoItem = {
    id: `todo_${Date.now()}`,
    text: text.trim(),
    priority,
    completed: false,
    createdAt: new Date().toLocaleDateString('tr-TR'),
  };
  todos.push(item);
  saveJson(TODOS_FILE, todos);
  return { success: true, item, message: `"${item.text}" yapılacaklar listesine eklendi.` };
}

export function listTodos(showCompleted = false): TodoItem[] {
  const todos = loadJson<TodoItem[]>(TODOS_FILE, []);
  return showCompleted ? todos : todos.filter((t) => !t.completed);
}

export function completeTodo(textOrId: string): { success: boolean; message: string } {
  const todos = loadJson<TodoItem[]>(TODOS_FILE, []);
  const search = textOrId.toLowerCase().trim();
  const item = todos.find((t) => t.id === textOrId || t.text.toLowerCase().includes(search));

  if (item) {
    item.completed = true;
    saveJson(TODOS_FILE, todos);
    return { success: true, message: `"${item.text}" tamamlandı olarak işaretlendi.` };
  }
  return { success: false, message: `"${textOrId}" görevi listede bulunamadı.` };
}

export function deleteTodo(textOrId: string): { success: boolean; message: string } {
  const todos = loadJson<TodoItem[]>(TODOS_FILE, []);
  const search = textOrId.toLowerCase().trim();
  const idx = todos.findIndex((t) => t.id === textOrId || t.text.toLowerCase().includes(search));

  if (idx >= 0) {
    const removed = todos.splice(idx, 1)[0];
    saveJson(TODOS_FILE, todos);
    return { success: true, message: `"${removed.text}" listeden silindi.` };
  }
  return { success: false, message: `"${textOrId}" bulunamadı.` };
}
