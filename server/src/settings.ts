import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearWeatherCache } from './dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

export interface UserSettings {
  city: string;
  lat: number;
  lon: number;
  autoLocation: boolean;
  userName: string;
  telegramChatId?: string;
  telegramBotToken?: string;
  custom?: Record<string, any>;
}

const defaultSettings: UserSettings = {
  city: process.env.WEATHER_CITY || 'Trabzon',
  lat: Number(process.env.WEATHER_LAT || 41.0027),
  lon: Number(process.env.WEATHER_LON || 39.7168),
  autoLocation: true,
  userName: process.env.USER_NAME || 'Celal',
  custom: {},
};

let currentSettings: UserSettings = { ...defaultSettings };

export function loadSettings(): UserSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      currentSettings = { ...defaultSettings, ...data };
    }
  } catch (e: any) {
    console.warn('[settings] Ayarlar okunamadı, varsayılanlar yüklendi:', e.message);
  }
  applyEnv();
  return currentSettings;
}

export function saveSettings(settings: Partial<UserSettings>): UserSettings {
  currentSettings = { ...currentSettings, ...settings };
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
  } catch (e: any) {
    console.error('[settings] Ayarlar kaydedilemedi:', e.message);
  }
  applyEnv();
  return currentSettings;
}

function applyEnv() {
  process.env.WEATHER_CITY = currentSettings.city;
  process.env.WEATHER_LAT = String(currentSettings.lat);
  process.env.WEATHER_LON = String(currentSettings.lon);
  if (currentSettings.userName) process.env.USER_NAME = currentSettings.userName;
  try {
    clearWeatherCache();
  } catch {}
}

/**
 * IP üzerinden otomatik konum tespiti
 */
export async function detectLocationByIp(): Promise<{ city: string; lat: number; lon: number } | null> {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=status,country,city,lat,lon', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j: any = await res.json();
      if (j.status === 'success' && j.city) {
        return {
          city: j.city,
          lat: Number(j.lat),
          lon: Number(j.lon),
        };
      }
    }
  } catch {}

  try {
    const res2 = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
    if (res2.ok) {
      const j: any = await res2.json();
      if (j.city) {
        return {
          city: j.city,
          lat: Number(j.latitude),
          lon: Number(j.longitude),
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Şehir adına göre (ör. "Trabzon", "İzmir") koordinat bulma
 */
export async function geocodeCity(cityName: string): Promise<{ city: string; lat: number; lon: number } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName.trim())}&count=1&language=tr&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j: any = await res.json();
    if (j.results && j.results.length > 0) {
      const first = j.results[0];
      return {
        city: first.name,
        lat: Number(first.latitude),
        lon: Number(first.longitude),
      };
    }
  } catch (e: any) {
    console.warn(`[settings] Geocoding hatası (${cityName}):`, e.message);
  }
  return null;
}

/**
 * Konumu güncelle (şehir adı verilirse o şehir, verilmezse IP ile otomatik)
 */
export async function setLocation(cityName?: string): Promise<{ success: boolean; city: string; lat: number; lon: number; message: string }> {
  if (cityName && cityName.toLowerCase() !== 'otomatik' && cityName.toLowerCase() !== 'auto') {
    const geo = await geocodeCity(cityName);
    if (geo) {
      saveSettings({ city: geo.city, lat: geo.lat, lon: geo.lon, autoLocation: false });
      return { success: true, ...geo, message: `Konum başarıyla ${geo.city} olarak güncellendi. Artık hava durumu ve panolar ${geo.city} bilgilerini gösterecek.` };
    } else {
      return { success: false, city: currentSettings.city, lat: currentSettings.lat, lon: currentSettings.lon, message: `"${cityName}" şehri bulunamadı.` };
    }
  } else {
    const ipGeo = await detectLocationByIp();
    if (ipGeo) {
      saveSettings({ city: ipGeo.city, lat: ipGeo.lat, lon: ipGeo.lon, autoLocation: true });
      return { success: true, ...ipGeo, message: `Konum IP adresiniz üzerinden otomatik tespit edildi: ${ipGeo.city}. Ayarlar güncellendi.` };
    }
    return { success: false, city: currentSettings.city, lat: currentSettings.lat, lon: currentSettings.lon, message: 'Otomatik konum tespiti yapılamadı.' };
  }
}

/**
 * Başlangıçta ayarları ve konumu başlat
 */
export async function initSettings() {
  loadSettings();
  if (currentSettings.autoLocation) {
    const detected = await detectLocationByIp();
    if (detected && (detected.city !== currentSettings.city || Math.abs(detected.lat - currentSettings.lat) > 0.05)) {
      saveSettings({ city: detected.city, lat: detected.lat, lon: detected.lon });
      console.log(`[settings] Konum IP üzerinden güncellendi: ${detected.city} (${detected.lat}, ${detected.lon})`);
    }
  }
}
