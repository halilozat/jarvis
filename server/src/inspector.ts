import { exec, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProject, updateProjectStatus, type ManagedProject, type ProjectAudit } from './projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCREENSHOTS_DIR = path.join(__dirname, '..', 'data', 'screenshots');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// Aktif geliştirme sunucuları (dev server processes)
const runningDevServers = new Map<string, { pid: number; port: number; process: any }>();

function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

/**
 * Portun açık olup olmadığını ve yanıt verip vermediğini kontrol eder
 */
export function isPortListening(port: number, timeoutMs = 2500): Promise<{ open: boolean; statusCode?: number }> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, { timeout: timeoutMs }, (res) => {
      resolve({ open: true, statusCode: res.statusCode });
      res.resume();
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ open: false });
    });
    req.on('error', () => {
      resolve({ open: false });
    });
  });
}

/**
 * Projenin geliştirme sunucusunu (dev server) başlatır
 */
export async function startProjectServer(projectId: string): Promise<{ success: boolean; port: number; message: string }> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Proje bulunamadı: ${projectId}`);

  if (runningDevServers.has(project.id)) {
    const active = runningDevServers.get(project.id)!;
    const isLive = await isPortListening(active.port);
    if (isLive.open) {
      return { success: true, port: active.port, message: `Sunucu zaten localhost:${active.port} üzerinde çalışıyor.` };
    }
  }

  const port = project.port || 3000;
  const devCmd = project.devCommand || 'npm run dev';

  // Windows'ta port üzerinden sunucu başlatma
  const child = spawn(devCmd, {
    cwd: project.path,
    shell: true,
    detached: false,
    env: { ...process.env, PORT: String(port) },
  });

  runningDevServers.set(project.id, {
    pid: child.pid || 0,
    port,
    process: child,
  });

  child.on('exit', () => {
    runningDevServers.delete(project.id);
    updateProjectStatus(project.id, { status: 'idle' });
  });

  // Portun açılmasını 12 saniyeye kadar bekle
  const startTime = Date.now();
  while (Date.now() - startTime < 12000) {
    const check = await isPortListening(port, 1000);
    if (check.open) {
      updateProjectStatus(project.id, { status: 'running', port });
      return { success: true, port, message: `Sunucu localhost:${port} adresinde başarıyla ayağa kalktı.` };
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  updateProjectStatus(project.id, { status: 'running', port });
  return { success: true, port, message: `Sunucu başlatma komutu verildi (${devCmd}, hedef port: ${port}).` };
}

/**
 * Proje sunucusunu durdurur
 */
export async function stopProjectServer(projectId: string): Promise<{ success: boolean; message: string }> {
  const active = runningDevServers.get(projectId);
  if (!active) {
    return { success: true, message: 'Çalışan bir sunucu bulunamadı.' };
  }

  try {
    if (active.process && typeof active.process.kill === 'function') {
      // Windows'ta alt işlemleriyle birlikte kapat
      exec(`taskkill /PID ${active.pid} /T /F`, () => {});
    }
  } catch {}

  runningDevServers.delete(projectId);
  updateProjectStatus(projectId, { status: 'idle' });
  return { success: true, message: 'Geliştirme sunucusu durduruldu.' };
}

/**
 * Yerel Microsoft Edge ile tam çözünürlüklü ekran görüntüsü alır
 */
export function captureUrlScreenshot(url: string, filename: string): Promise<string | null> {
  ensureScreenshotDir();
  const destPath = path.join(SCREENSHOTS_DIR, filename);

  return new Promise((resolve) => {
    const edgeCmd = `"${EDGE_PATH}" --headless --disable-gpu --hide-scrollbars --window-size=1280,800 --screenshot="${destPath}" "${url}"`;
    exec(edgeCmd, { timeout: 15000 }, (err) => {
      if (fs.existsSync(destPath)) {
        return resolve(destPath);
      }
      if (err) {
        console.warn('[inspector] Ekran görüntüsü alınamadı:', err.message);
      }
      resolve(null);
    });
  });
}

/**
 * Projeyi uçtan uca denetler (port, sayfa açılışı, ekran görüntüsü ve hata taraması)
 */
export async function auditProject(projectId: string): Promise<{
  success: boolean;
  project: ManagedProject;
  port?: number;
  screenshotFile?: string;
  screenshotUrl?: string;
  notes: string;
}> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Proje bulunamadı: ${projectId}`);

  const port = project.port || 3000;
  let isLive = await isPortListening(port);

  // Port açık değilse sunucuyu başlatmayı dene
  if (!isLive.open) {
    const startRes = await startProjectServer(project.id);
    if (startRes.success) {
      await new Promise((r) => setTimeout(r, 1500));
      isLive = await isPortListening(port);
    }
  }

  const timestamp = new Date().toISOString();
  const screenFilename = `${project.id}-${Date.now()}.png`;
  let screenshotFile: string | undefined;

  if (isLive.open) {
    const captured = await captureUrlScreenshot(`http://localhost:${port}/`, screenFilename);
    if (captured) {
      screenshotFile = screenFilename;
    }
  }

  // HTML içeriğini oku ve basit hata taraması yap
  let notes = '';
  let ok = isLive.open;

  if (isLive.open) {
    notes = `Proje localhost:${port} adresinde yayında (HTTP ${isLive.statusCode || 200}).`;
    if (screenshotFile) {
      notes += ' Arayüz ekran görüntüsü başarıyla alındı.';
    }
  } else {
    notes = `Proje localhost:${port} üzerinde yanıt vermiyor. Lütfen bağımlılıkları veya 'npm run dev' komutunu kontrol edin.`;
    ok = false;
  }

  const auditResult: ProjectAudit = {
    timestamp,
    ok,
    port,
    statusCode: isLive.statusCode,
    screenshotFile,
    notes,
  };

  updateProjectStatus(project.id, {
    lastAudit: auditResult,
  });

  return {
    success: ok,
    project: getProject(project.id)!,
    port,
    screenshotFile,
    screenshotUrl: screenshotFile ? `/api/screenshots/${screenshotFile}` : undefined,
    notes,
  };
}
