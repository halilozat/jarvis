import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const userHome = os.homedir();
const desktopDir = path.join(userHome, 'Desktop');
const downloadsDir = path.join(userHome, 'Downloads');
const documentsDir = path.join(userHome, 'Documents');

function resolveTargetDir(name?: string): string {
  if (!name) return desktopDir;
  const l = name.toLowerCase();
  if (l.includes('indir') || l.includes('download')) return downloadsDir;
  if (l.includes('belge') || l.includes('document')) return documentsDir;
  if (l.includes('masa') || l.includes('desktop')) return desktopDir;
  if (fs.existsSync(name)) return name;
  return desktopDir;
}

/**
 * Belirtilen klasördeki en son değiştirilen dosyaları listeler
 */
export async function getRecentFiles(folder = 'downloads', limit = 10): Promise<{ folder: string; files: { name: string; sizeMb: number; modified: string }[] }> {
  const target = resolveTargetDir(folder);
  if (!fs.existsSync(target)) return { folder: target, files: [] };

  const entries = fs
    .readdirSync(target, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.') && e.name.toLowerCase() !== 'desktop.ini' && e.name.toLowerCase() !== 'thumbs.db')
    .map((e) => {
      const fullPath = path.join(target, e.name);
      try {
        const stats = fs.statSync(fullPath);
        return {
          name: e.name,
          sizeMb: Math.round((stats.size / 1024 / 1024) * 10) / 10,
          modifiedMs: stats.mtimeMs,
          modified: stats.mtime.toLocaleString('tr-TR'),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as { name: string; sizeMb: number; modifiedMs: number; modified: string }[];

  entries.sort((a, b) => b.modifiedMs - a.modifiedMs);

  return {
    folder: target,
    files: entries.slice(0, limit).map(({ name, sizeMb, modified }) => ({ name, sizeMb, modified })),
  };
}

/**
 * Dosya arama
 */
export async function searchLocalFiles(query: string, folder = 'desktop'): Promise<{ folder: string; query: string; matches: string[] }> {
  const target = resolveTargetDir(folder);
  if (!fs.existsSync(target)) return { folder: target, query, matches: [] };

  const q = query.toLowerCase().trim();
  const matches: string[] = [];

  function scan(dir: string, depth = 0) {
    if (depth > 2) return;
    try {
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of list) {
        if (item.name.toLowerCase().includes(q)) {
          matches.push(path.join(dir, item.name));
        }
        if (item.isDirectory() && !item.name.startsWith('.') && !item.name.startsWith('$')) {
          scan(path.join(dir, item.name), depth + 1);
        }
      }
    } catch {}
  }

  scan(target);

  return {
    folder: target,
    query,
    matches: matches.slice(0, 15),
  };
}

/**
 * Masaüstünü Kategorilere Göre Düzenler
 */
export async function organizeDesktop(): Promise<{ success: boolean; movedCount: number; message: string }> {
  if (!fs.existsSync(desktopDir)) return { success: false, movedCount: 0, message: 'Masaüstü klasörü bulunamadı.' };

  const categories: Record<string, string[]> = {
    Görseller: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'],
    Belgeler: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.txt', '.csv'],
    Arşivler: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    Kurulumlar: ['.exe', '.msi'],
  };

  let moved = 0;
  const files = fs.readdirSync(desktopDir, { withFileTypes: true });

  for (const f of files) {
    if (!f.isFile()) continue;
    const ext = path.extname(f.name).toLowerCase();
    // Kısayollara dokunma
    if (ext === '.lnk' || ext === '.url' || ext === '.ini') continue;

    for (const [category, extList] of Object.entries(categories)) {
      if (extList.includes(ext)) {
        const destFolder = path.join(desktopDir, category);
        fs.mkdirSync(destFolder, { recursive: true });
        const oldPath = path.join(desktopDir, f.name);
        const newPath = path.join(destFolder, f.name);
        try {
          fs.renameSync(oldPath, newPath);
          moved++;
        } catch {}
        break;
      }
    }
  }

  return {
    success: true,
    movedCount: moved,
    message: moved > 0 ? `Masaüstündeki ${moved} dosya ilgili klasörlere (Görseller, Belgeler, vb.) taşındı.` : 'Masaüstünde taşınacak dosya bulunamadı, masaüstünüz zaten düzenli.',
  };
}
