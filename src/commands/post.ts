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
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const headless = options.headless !== 'false';
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
        // Find the "Start a post" button dynamically based on text content instead of a brittle class name
        await page.waitForFunction(() => {
             const spans = Array.from(document.querySelectorAll('span')).filter(s => s.innerText === 'Start a post');
             return spans.length > 0;
        }, { timeout: 15000 });
        
        await page.evaluate(() => {
             const spans = Array.from(document.querySelectorAll('span')).filter(s => s.innerText === 'Start a post');
             if (spans.length > 0) {
                  let p: any = spans[0];
                  while (p && p.tagName !== 'BUTTON') {
                       p = p.parentElement;
                  }
                  if (p) p.click();
             }
        });
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
        // Sometimes Puppeteer type misses characters in rich text editors, so we delay
        await page.type(editorSelector, text, { delay: 50 });
      } catch (e) {
        outputError('Could not find text editor area in modal', 2);
        if (browser) await browser.close();
        return;
      }

      let postUrl: string | null = null;
      // Click Post button
      try {
        // First make sure the button isn't disabled (requires some content to be active)
        await page.waitForSelector('.share-actions__primary-action:not([disabled])', { timeout: 5000 });
        
        // Find the Post button explicitly
        await page.evaluate(() => {
             const buttons = Array.from(document.querySelectorAll('button.share-actions__primary-action')) as HTMLButtonElement[];
             for (const b of buttons) {
                  if (b.innerText.includes('Post') && !b.hasAttribute('disabled')) {
                       b.click();
                       break;
                  }
             }
        });

        // Wait for Toast notification to extract the created Post URL
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            postUrl = await page.evaluate(() => {
                const toastLinks = Array.from(document.querySelectorAll('.artdeco-toast-item a'));
                for (const link of toastLinks) {
                    if ((link as HTMLAnchorElement).href.includes('/feed/update/urn:li:')) {
                        return (link as HTMLAnchorElement).href;
                    }
                }
                return null;
            });
            if (postUrl) break;
        }

      } catch (e) {
        outputError('Failed to click post button or capture post URL', 3);
        if (browser) await browser.close();
        return;
      }

      await browser.close();
      outputJson({ 
        success: true, 
        message: 'Post created successfully.',
        data: postUrl ? { postUrl } : undefined
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while creating post', 3, { detail: error.message });
    }
  });
