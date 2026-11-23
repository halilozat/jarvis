import { exec } from 'node:child_process';
import { loadSettings } from './settings.js';

/**
 * Windows Masaüstü Bildirimi Gösterir (Ekranın sağ alt köşesinde)
 */
export function showNotification(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cleanTitle = title.replace(/'/g, "''");
    const cleanMsg = message.replace(/'/g, "''");

    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $notify = New-Object System.Windows.Forms.NotifyIcon
      $notify.Icon = [System.Drawing.SystemIcons]::Information
      $notify.Visible = $True
      $notify.ShowBalloonTip(5000, '${cleanTitle}', '${cleanMsg}', [System.Windows.Forms.ToolTipIcon]::Info)
      Start-Sleep -Milliseconds 1200
      $notify.Dispose()
    `;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    exec(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`, (err) => {
      if (err) {
        console.warn('[notification] Masaüstü bildirimi hatası:', err.message);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

/**
 * Telegram üzerinden telefona mesaj gönderir
 */
export async function sendTelegramMessage(message: string): Promise<{ success: boolean; message: string }> {
  const settings = loadSettings();
  const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken;
  const chatId = process.env.TELEGRAM_CHAT_ID || settings.telegramChatId;

  if (!token || !chatId) {
    return {
      success: false,
      message: 'Telegram bilgileri eksik. Lütfen .env dosyasına veya sohbete TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID değerlerinizi belirtin.',
    };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      return { success: true, message: 'Mesajınız başarıyla Telegram telefonunuza iletildi.' };
    }
    const errText = await res.text();
    return { success: false, message: `Telegram hatası: ${errText.slice(0, 100)}` };
  } catch (e: any) {
    return { success: false, message: `Telegram gönderilemedi: ${e.message}` };
  }
}
