import fs from 'fs';
import path from 'path';
import os from 'os';
import { Page, Cookie } from 'puppeteer';

function getSessionFile(): string {
  try {
    const { app } = require('electron');
    if (app && app.getPath) return path.join(app.getPath('userData'), 'session.json');
  } catch (e) {}
  // Fallback: same OS-standard path as db.ts so the MCP server (no Electron
  // context) always resolves to the same location regardless of process.cwd().
  const isWin = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';
  if (isWin && process.env.APPDATA) return path.join(process.env.APPDATA, 'Klinqd', 'session.json');
  if (isMac) return path.join(os.homedir(), 'Library', 'Application Support', 'Klinqd', 'session.json');
  return path.join(os.homedir(), '.config', 'klinqd', 'session.json');
}
const SESSION_FILE = getSessionFile();

export function saveSession(cookies: Cookie[]) {
  // Save all cookies for linkedin.com to ensure session works properly
  const relevantCookies = cookies.filter(c => c.domain.includes('linkedin.com'));
  fs.writeFileSync(SESSION_FILE, JSON.stringify(relevantCookies, null, 2));
}

export function loadSession(): Cookie[] | null {
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  try {
    const data = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

export async function restoreSession(page: Page): Promise<boolean> {
  const cookies = loadSession();
  if (!cookies || cookies.length === 0) {
    return false;
  }

  // Ensure cookies are correctly formatted for Puppeteer
  const cookieObjects = cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
    path: c.path || '/',
    secure: c.secure ?? true,
    httpOnly: c.httpOnly ?? false,
    sameSite: c.sameSite || 'Lax'
  }));

  await page.setCookie(...(cookieObjects as any));
  return true;
}
