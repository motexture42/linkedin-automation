import fs from 'fs';
import path from 'path';
import { Page, Cookie } from 'puppeteer';

const SESSION_FILE = path.join(process.cwd(), 'session.json');

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
