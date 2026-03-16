import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { saveSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const authCommand = new Command('auth')
  .description('Launch an interactive browser to log in to LinkedIn')
  .action(async () => {
    try {
      const { browser, page } = await launchBrowser(false);
      
      console.log('Browser launched. Please log in to LinkedIn.');
      console.log('Once logged in, the session will be saved automatically when you are on the feed.');
      console.log('Waiting for successful login...');
      
      await page.goto('https://www.linkedin.com/login');
      
      // Wait for the global navigation bar which indicates successful login
      await page.waitForSelector('#global-nav', { timeout: 300000 }); // 5 minutes max
      
      const cookies = await page.cookies();
      saveSession(cookies);
      
      await browser.close();
      
      outputJson({ success: true, message: 'Authentication successful, session saved.' });
    } catch (error: any) {
      outputError('Authentication failed or timed out.', 3, { detail: error.message });
    }
  });
