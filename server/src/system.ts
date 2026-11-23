import { exec, execSync } from 'node:child_process';
import os from 'node:os';

/**
 * Windows PowerShell komutu çalıştırır
 */
function runPwsh(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`powershell.exe -NoProfile -NonInteractive -Command "${command.replace(/"/g, '\\"')}"`, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

/**
 * Bilgisayar kaynakları: CPU, RAM, Disk
 */
export async function getSystemStats(): Promise<{
  cpuUsage: number;
  ram: { totalGb: number; usedGb: number; freeGb: number; percent: number };
  diskC: { totalGb: number; freeGb: number; percentUsed: number };
  uptimeHours: number;
}> {
  const totalMem = os.totalmem() / 1024 / 1024 / 1024;
  const freeMem = os.freemem() / 1024 / 1024 / 1024;
  const usedMem = totalMem - freeMem;
  const memPct = Math.round((usedMem / totalMem) * 100);

  let cpuPct = 0;
  let diskC = { totalGb: 0, freeGb: 0, percentUsed: 0 };

  try {
    const raw = await runPwsh(`
      $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average;
      $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'";
      $dTotal = [math]::Round($d.Size / 1GB, 1);
      $dFree = [math]::Round($d.FreeSpace / 1GB, 1);
      "$cpu|$dTotal|$dFree"
    `);
    const [c, dt, df] = raw.split('|').map(Number);
    if (!isNaN(c)) cpuPct = c;
    if (!isNaN(dt) && !isNaN(df)) {
      diskC = {
        totalGb: dt,
        freeGb: df,
        percentUsed: Math.round(((dt - df) / dt) * 100),
      };
    }
  } catch {}

  return {
    cpuUsage: Math.round(cpuPct),
    ram: {
      totalGb: Math.round(totalMem * 10) / 10,
      usedGb: Math.round(usedMem * 10) / 10,
      freeGb: Math.round(freeMem * 10) / 10,
      percent: memPct,
    },
    diskC,
    uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
  };
}

/**
 * Windows Ses Seviyesini Ayarlar (0 - 100)
 */
export async function setVolume(level: number, mute?: boolean): Promise<{ success: boolean; message: string }> {
  try {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    const psScript = `
      $wscript = New-Object -ComObject WScript.Shell
      ${mute ? '$wscript.SendKeys([char]173)' : ''}
      # Volume level normalization using CoreAudio
      Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int a, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDevEnum {}
public class Audio {
  public static void SetVol(float vol) {
    var enumerator = new MMDevEnum() as IMMDeviceEnumerator;
    IMMDevice dev;
    enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
    var iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume epv;
    dev.Activate(ref iid, 23, 0, out epv);
    epv.SetMasterVolumeLevelScalar(vol, System.Guid.Empty);
  }
}
"@ -ErrorAction SilentlyContinue
      [Audio]::SetVol(${clamped / 100})
    `;
    await runPwsh(psScript);
    return { success: true, message: `Ses seviyesi %${clamped} olarak ayarlandı.` };
  } catch (e: any) {
    return { success: false, message: `Ses ayarlanamadı: ${e.message}` };
  }
}

/**
 * Güç ve Ekran Yönetimi (Kilitle, Kapat, Yeniden Başlat, Uyku)
 */
export async function controlPower(action: 'lock' | 'sleep' | 'shutdown' | 'restart', delayMinutes = 0): Promise<{ success: boolean; message: string }> {
  try {
    const delaySec = Math.round(delayMinutes * 60);
    switch (action) {
      case 'lock':
        await runPwsh('rundll32.exe user32.dll,LockWorkStation');
        return { success: true, message: 'Bilgisayar kilitlendi.' };
      case 'sleep':
        await runPwsh('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
        return { success: true, message: 'Bilgisayar uyku moduna alınıyor.' };
      case 'shutdown':
        await runPwsh(`shutdown /s /t ${delaySec}`);
        return { success: true, message: delaySec > 0 ? `Bilgisayar ${delayMinutes} dakika içinde kapatılacak.` : 'Bilgisayar kapatılıyor.' };
      case 'restart':
        await runPwsh(`shutdown /r /t ${delaySec}`);
        return { success: true, message: delaySec > 0 ? `Bilgisayar ${delayMinutes} dakika içinde yeniden başlatılacak.` : 'Bilgisayar yeniden başlatılıyor.' };
      default:
        return { success: false, message: 'Bilinmeyen güç eylemi.' };
    }
  } catch (e: any) {
    return { success: false, message: `İşlem gerçekleştirilemedi: ${e.message}` };
  }
}

/**
 * Uygulama Başlatma
 */
export async function launchApp(appName: string): Promise<{ success: boolean; message: string }> {
  const commonApps: Record<string, string> = {
    spotify: 'spotify',
    chrome: 'chrome',
    tarayıcı: 'chrome',
    browser: 'chrome',
    vscode: 'code',
    kod: 'code',
    notepad: 'notepad',
    not: 'notepad',
    hesap: 'calc',
    hesapmakinesi: 'calc',
    terminal: 'wt',
    powershell: 'powershell',
    cmd: 'cmd',
    explorer: 'explorer',
    dosyalar: 'explorer',
  };

  const key = appName.toLowerCase().replace(/[\s\-_]+/g, '');
  const target = commonApps[key] || appName;

  try {
    await runPwsh(`Start-Process "${target}"`);
    return { success: true, message: `${appName} uygulaması başlatıldı.` };
  } catch (e: any) {
    return { success: false, message: `${appName} başlatılamadı: ${e.message}` };
  }
}

/**
 * Uygulama Kapatma
 */
export async function killApp(appName: string): Promise<{ success: boolean; message: string }> {
  try {
    const raw = await runPwsh(`Stop-Process -Name "${appName}" -Force -ErrorAction Stop`);
    return { success: true, message: `${appName} kapatıldı.` };
  } catch (e: any) {
    return { success: false, message: `${appName} bulunamadı veya kapatılamadı.` };
  }
}
