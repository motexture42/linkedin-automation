// @ts-nocheck
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-extra';

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

function getChromeExecutablePath() {
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Windows
    '/usr/bin/google-chrome', // Linux
    '/usr/bin/google-chrome-stable' // Linux
  ];
  return paths.find(p => fs.existsSync(p));
}

export async function launchBrowser(headless: boolean = true): Promise<{ browser: Browser; page: Page }> {
  const executablePath = getChromeExecutablePath();
  
  // Use a writable directory for the browser profile — process.cwd() can be
  // non-writable in a packaged app, so prefer Electron's userData path.
  let baseDir = process.cwd();
  try {
    const { app } = require('electron');
    if (app && app.getPath) baseDir = app.getPath('userData');
  } catch (e) {}
  const userDataDir = path.join(baseDir, '.browser_data');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Remove Chrome singleton lock files left behind by crashed/hung processes.
  // Without this, a second launch attempt reuses the existing Chrome window
  // instead of spawning a fresh one, giving Puppeteer a page it cannot control.
  for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const p = path.join(userDataDir, lockFile);
    if (fs.existsSync(p)) {
      try { fs.rmSync(p, { recursive: true }); } catch (_) {}
    }
  }

  const browser = await puppeteer.launch({
    headless: (headless ? 'new' : false) as any,
    executablePath: executablePath || undefined,
    userDataDir: userDataDir, // Use persistent cache
    defaultViewport: null, // Let viewport adjust naturally
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      '--lang=en-US,en'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  // Grant clipboard permissions
  const context = browser.defaultBrowserContext();
  await context.overridePermissions('https://www.linkedin.com', ['clipboard-read', 'clipboard-write']);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
    // Spoof languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
  
  return { browser, page };
}

/**
 * Types text into a selector with a highly human-like rhythm.
 * It introduces variable delays between keystrokes, occasional longer pauses, 
 * and randomly fast bursts to evade uniform typing bot detection.
 */
export async function typeLikeHuman(page: Page, selector: string, text: string) {
  // Wait and click
  if (selector !== 'keyboard') {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
  }
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Type the character
    if (selector === 'keyboard') {
       await page.keyboard.type(char);
    } else {
       await page.type(selector, char);
    }

    // Determine the delay
    let delay = Math.floor(Math.random() * (80 - 30 + 1)) + 30; // Base delay 30-80ms

    // Add longer pauses occasionally (like reading or thinking)
    if (Math.random() < 0.05) { // 5% chance of a longer pause
      delay += Math.floor(Math.random() * (400 - 150 + 1)) + 150; 
    }
    
    // Even longer pause (e.g., at punctuation)
    if (['.', ',', '!', '?', '\n'].includes(char) && Math.random() < 0.5) {
      delay += Math.floor(Math.random() * (600 - 300 + 1)) + 300;
    }

    // Fast burst (e.g., muscle memory for certain words)
    if (Math.random() < 0.1) {
      delay = Math.floor(Math.random() * (30 - 10 + 1)) + 10;
    }

    await new Promise(r => setTimeout(r, delay));
  }
}

/**
 * Moves the mouse in a random bezier-curve-like pattern to simulate human movement
 * and evade basic anti-bot heuristics.
 */
export async function moveMouseRandomly(page: Page) {
  const width = 1920;
  const height = 1080;

  const startX = Math.floor(Math.random() * width);
  const startY = Math.floor(Math.random() * height);
  const endX = Math.floor(Math.random() * width);
  const endY = Math.floor(Math.random() * height);

  await page.mouse.move(startX, startY);
  
  const steps = Math.floor(Math.random() * (15 - 5 + 1)) + 5; // 5 to 15 steps
  
  for (let i = 1; i <= steps; i++) {
      const x = startX + ((endX - startX) * (i / steps)) + (Math.random() * 20 - 10);
      const y = startY + ((endY - startY) * (i / steps)) + (Math.random() * 20 - 10);
      await page.mouse.move(x, y);
      await new Promise(r => setTimeout(r, Math.random() * 50 + 10));
  }
}
