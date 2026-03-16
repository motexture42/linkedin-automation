import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export const postCommand = new Command('post')
  .description('Create a new post on LinkedIn')
  .requiredOption('-t, --text <text>', 'Text content of the post')
  .option('-m, --media <path>', 'Path to an image to attach')
  .option('--headless <boolean>', 'Run in headless mode', 'false')
  .action(async (options) => {
    // Force visible mode to avoid easy detection for write actions
    const headless = options.headless === 'true';
    const text = options.text;
    const mediaPath = options.media ? path.resolve(process.cwd(), options.media) : null;

    if (mediaPath && !fs.existsSync(mediaPath)) {
      outputError(`Media file not found at path: ${mediaPath}`, 3);
      return;
    }

    let browser, page;
    try {
      const launched = await launchBrowser(headless);
      browser = launched.browser;
      page = launched.page;

      const hasSession = await restoreSession(page);
      if (!hasSession) {
        outputError('No active session. Please run `li-cli auth` first.', 1);
        if (browser) await browser.close();
        return;
      }

      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });

      try {
        await page.waitForSelector('button.share-box-feed-entry__trigger', { timeout: 15000 });
        await page.click('button.share-box-feed-entry__trigger');
      } catch (err) {
        outputError('Could not find the start post button.', 2);
        if (browser) await browser.close();
        return;
      }

      // Wait for modal
      try {
        await page.waitForSelector('.share-creation-state__share-box-v2', { timeout: 10000 });
      } catch (err) {
        outputError('Post creation modal did not appear.', 2);
        if (browser) await browser.close();
        return;
      }

      // Add media if specified
      if (mediaPath) {
        try {
          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            await fileInput.uploadFile(mediaPath);
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (e: any) {
          outputError('Failed to attach media', 3, { detail: e.message });
          if (browser) await browser.close();
          return;
        }
      }

      // Type text
      try {
        const editorSelector = '.ql-editor';
        await page.waitForSelector(editorSelector, { timeout: 5000 });
        await page.click(editorSelector);
        await page.type(editorSelector, text, { delay: 50 });
      } catch (e) {
        outputError('Could not find text editor area in modal', 2);
        if (browser) await browser.close();
        return;
      }

      // Click Post button
      try {
        await page.waitForSelector('.share-actions__primary-action:not([disabled])', { timeout: 5000 });
        
        // Use keyboard shortcut on Mac/Windows
        const isMac = process.platform === 'darwin';
        if (isMac) {
          await page.keyboard.down('Meta');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Meta');
        } else {
          await page.keyboard.down('Control');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Control');
        }

        // Wait for modal to disappear or toast
        await new Promise(r => setTimeout(r, 4000));
      } catch (e) {
        outputError('Failed to click post button', 3);
        if (browser) await browser.close();
        return;
      }

      await browser.close();
      outputJson({ 
        success: true, 
        message: 'Post created successfully.'
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while creating post', 3, { detail: error.message });
    }
  });
