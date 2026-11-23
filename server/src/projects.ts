import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
export const BASE_PROJECTS_DIR = 'C:\\_Projects\\JarvisProject';

export type ProjectType = 'web' | 'desktop' | 'cli' | 'api';
export type CodingCli = 'claude' | 'agy';

export interface ProjectAudit {
  timestamp: string;
  ok: boolean;
  port?: number;
  statusCode?: number;
  screenshotFile?: string;
  notes: string;
}

export interface ManagedProject {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  port?: number;
  devCommand?: string;
  activeCli: CodingCli;
  purpose: string;
  techStack: string[];
  status: 'idle' | 'coding' | 'running' | 'error';
  hasStarted: boolean;
  sessionCount: number;
  lastTask?: string;
  lastOutput?: string;
  lastAudit?: ProjectAudit;
  createdAt: string;
  updatedAt: string;
}

function loadProjectsRaw(): ManagedProject[] {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(PROJECTS_FILE)) {
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(raw) as ManagedProject[];
  } catch (e: any) {
    console.warn('[projects] Proje sicili okunamadı:', e.message);
    return [];
  }
}

function saveProjectsRaw(projects: ManagedProject[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
  } catch (e: any) {
    console.error('[projects] Proje sicili kaydedilemedi:', e.message);
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function listProjects(): ManagedProject[] {
  return loadProjectsRaw();
}

export function getProject(idOrName: string): ManagedProject | null {
  if (!idOrName) return null;
  const list = loadProjectsRaw();
  const search = idOrName.toLowerCase().trim();
  const slug = slugify(search);
  return list.find((p) => p.id === idOrName || p.id === slug || p.name.toLowerCase() === search || p.name.toLowerCase().includes(search)) || null;
}

export function createOrUpdateProject(data: {
  name: string;
  id?: string;
  purpose?: string;
  type?: ProjectType;
  port?: number;
  devCommand?: string;
  activeCli?: CodingCli;
  techStack?: string[];
}): ManagedProject {
  const list = loadProjectsRaw();
  const id = data.id ? slugify(data.id) : slugify(data.name);
  const now = new Date().toISOString();

  const projectDir = path.join(BASE_PROJECTS_DIR, id);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const existingIdx = list.findIndex((p) => p.id === id);
  if (existingIdx >= 0) {
    const p = list[existingIdx];
    const updated: ManagedProject = {
      ...p,
      name: data.name || p.name,
      purpose: data.purpose ?? p.purpose,
      type: data.type ?? p.type,
      port: data.port ?? p.port,
      devCommand: data.devCommand ?? p.devCommand,
      activeCli: data.activeCli ?? p.activeCli,
      techStack: data.techStack ?? p.techStack,
      updatedAt: now,
    };
    list[existingIdx] = updated;
    saveProjectsRaw(list);
    return updated;
  }

  const newProject: ManagedProject = {
    id,
    name: data.name,
    path: projectDir,
    type: data.type || 'web',
    port: data.port,
    devCommand: data.devCommand || (data.type === 'desktop' ? 'npm start' : 'npm run dev'),
    activeCli: data.activeCli || 'claude',
    purpose: data.purpose || 'Belirtilmedi',
    techStack: data.techStack || ['Web / Modern JS'],
    status: 'idle',
    hasStarted: false,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  list.push(newProject);
  saveProjectsRaw(list);
  return newProject;
}

export function updateProjectStatus(id: string, patch: Partial<ManagedProject>): ManagedProject | null {
  const list = loadProjectsRaw();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
  saveProjectsRaw(list);
  return list[idx];
}

export function deleteProject(id: string): boolean {
  const list = loadProjectsRaw();
  const filtered = list.filter((p) => p.id !== id);
  if (filtered.length !== list.length) {
    saveProjectsRaw(filtered);
    return true;
  }
  return false;
}
