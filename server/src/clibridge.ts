import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getProject, updateProjectStatus, type CodingCli, type ManagedProject } from './projects.js';
import { showNotification } from './notifications.js';

const CLAUDE_DIRECT_EXE = path.join(
  process.env.APPDATA || '',
  'npm',
  'node_modules',
  '@anthropic-ai',
  'claude-code',
  'bin',
  'claude.exe'
);

const AGY_DIRECT_EXE = path.join(
  process.env.LOCALAPPDATA || '',
  'agy',
  'bin',
  'agy.exe'
);

export interface CliTaskProgress {
  projectId: string;
  cli: CodingCli;
  line: string;
  timestamp: string;
}

export interface CliRunResult {
  success: boolean;
  cliUsed: CodingCli;
  output: string;
  error?: string;
  resumed: boolean;
}

// Devam eden arka plan görevleri
const activeProcesses = new Map<string, { pid: number; cli: CodingCli; startTime: number }>();

export function isProjectBusy(projectId: string): boolean {
  return activeProcesses.has(projectId);
}

export function getActiveTask(projectId: string) {
  return activeProcesses.get(projectId) || null;
}

/**
 * Tek bir CLI komutunu çalıştırır
 */
function spawnCli(
  cli: CodingCli,
  cwd: string,
  prompt: string,
  isResume: boolean,
  onLine?: (line: string) => void
): Promise<{ success: boolean; output: string; exitCode: number }> {
  return new Promise((resolve) => {
    let output = '';
    const args: string[] = [];

    if (cli === 'claude') {
      // Claude Code
      // claude.ps1 veya claude komutu
      if (isResume) {
        args.push('-c'); // Continue previous conversation in this project
      }
      args.push('-p', prompt);
      args.push('--dangerously-skip-permissions');
    } else {
      // Antigravity CLI (agy)
      if (isResume) {
        args.push('-c'); // Continue conversation
      }
      args.push('-p', prompt);
      args.push('--dangerously-skip-permissions');
    }

    let command = '';
    let useShell = false;

    if (cli === 'claude') {
      if (fs.existsSync(CLAUDE_DIRECT_EXE)) {
        command = CLAUDE_DIRECT_EXE;
        useShell = false;
      } else {
        command = 'claude.cmd';
        useShell = true;
      }
    } else {
      if (fs.existsSync(AGY_DIRECT_EXE)) {
        command = AGY_DIRECT_EXE;
        useShell = false;
      } else {
        command = 'agy.exe';
        useShell = true;
      }
    }

    // Windows'ta doğrudan .exe çağrıldığında shell: false argümanları (boşluk, satır sonu) bozmaz.
    // stdio: ['ignore', 'pipe', 'pipe'] ile stdin bekleyip 3 sn gecikme yapması önlenir.
    const child = spawn(command, args, {
      cwd,
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
    });

    const pid = child.pid || 0;

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output += text;
      const lines = text.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line && onLine) {
          onLine(line);
        }
      }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    let resolved = false;
    const finish = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      resolve({
        success: code === 0,
        output: output.trim(),
        exitCode: code ?? 1,
      });
    };

    child.on('exit', (code) => finish(code));
    child.on('close', (code) => finish(code));

    child.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      resolve({
        success: false,
        output: `${output}\n[HATA] ${err.message}`.trim(),
        exitCode: 1,
      });
    });
  });
}

/**
 * Projeye kodlama görevi gönderir.
 * Öncelik: Claude Code -> Başarısız/Hatalı olursa -> Antigravity CLI fallback.
 * Resume: Proje daha önce başlatıldıysa (-c/resume) bağlamı korunur.
 */
export async function runCodingTask(
  projectOrId: string | ManagedProject,
  prompt: string,
  preferredCli?: CodingCli,
  onProgress?: (p: CliTaskProgress) => void
): Promise<CliRunResult> {
  const project = typeof projectOrId === 'string' ? getProject(projectOrId) : projectOrId;
  if (!project) {
    throw new Error(`Proje bulunamadı: ${projectOrId}`);
  }

  if (isProjectBusy(project.id)) {
    throw new Error(`"${project.name}" projesinde şu an zaten devam eden bir kodlama görevi var.`);
  }

  const cwd = project.path;
  const isResume = project.hasStarted;
  let primaryCli: CodingCli = preferredCli || project.activeCli || 'claude';
  let fallbackCli: CodingCli = primaryCli === 'claude' ? 'agy' : 'claude';

  updateProjectStatus(project.id, {
    status: 'coding',
    lastTask: prompt,
  });

  const progressLogger = (cli: CodingCli) => (line: string) => {
    if (onProgress) {
      onProgress({
        projectId: project.id,
        cli,
        line,
        timestamp: new Date().toLocaleTimeString('tr-TR'),
      });
    }
  };

  activeProcesses.set(project.id, { pid: 0, cli: primaryCli, startTime: Date.now() });

  try {
    progressLogger(primaryCli)(`[Jarvis] ${primaryCli.toUpperCase()} başlatılıyor (Bağlam Devamı: ${isResume ? 'Evet' : 'İlk Kurulum'})...`);

    // 1. Birincil CLI ile dene
    let res = await spawnCli(primaryCli, cwd, prompt, isResume, progressLogger(primaryCli));

    // Eğer birincil CLI başarısız olursa (örn. Claude Code limit/hata)
    if (!res.success && (res.output.toLowerCase().includes('rate limit') || res.output.toLowerCase().includes('error') || res.exitCode !== 0)) {
      progressLogger(fallbackCli)(`[Jarvis] ${primaryCli.toUpperCase()} yanıt vermedi veya hata verdi. ${fallbackCli.toUpperCase()} CLI'a devrediliyor...`);
      
      const fallbackResume = isResume && project.activeCli === fallbackCli;
      const fbRes = await spawnCli(fallbackCli, cwd, prompt, fallbackResume, progressLogger(fallbackCli));

      if (fbRes.success) {
        updateProjectStatus(project.id, {
          status: 'idle',
          activeCli: fallbackCli, // Aktif CLI'ı yedek olanla güncelle
          hasStarted: true,
          sessionCount: project.sessionCount + 1,
          lastOutput: fbRes.output.slice(-2000),
        });

        showNotification('Jarvis Geliştirici', `"${project.name}" projesindeki görev tamamlandı (${fallbackCli.toUpperCase()}).`);

        return {
          success: true,
          cliUsed: fallbackCli,
          output: fbRes.output,
          resumed: fallbackResume,
        };
      }
    }

    // Birincil CLI sonucu başarılıysa veya fallback de tamamlandıysa
    updateProjectStatus(project.id, {
      status: res.success ? 'idle' : 'error',
      activeCli: primaryCli,
      hasStarted: res.success ? true : project.hasStarted,
      sessionCount: res.success ? project.sessionCount + 1 : project.sessionCount,
      lastOutput: res.output.slice(-2000),
    });

    if (res.success) {
      showNotification('Jarvis Geliştirici', `"${project.name}" projesindeki görev tamamlandı (${primaryCli.toUpperCase()}).`);
    } else {
      showNotification('Jarvis Uyarı', `"${project.name}" projesindeki görev bir hatayla sonlandı.`);
    }

    return {
      success: res.success,
      cliUsed: primaryCli,
      output: res.output,
      resumed: isResume,
    };
  } finally {
    activeProcesses.delete(project.id);
  }
}
