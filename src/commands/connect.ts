import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const connectCommand = new Command('connect')
  .description('Send a connection request to a user')
  .requiredOption('-u, --url <string>', 'LinkedIn Profile URL')
  .option('-m, --message <string>', 'Optional personalized note')
  .option('--headless <boolean>', 'Run in headless mode', 'false')
  .action(async (options) => {
    const headless = options.headless === 'true';
    const profileUrl = options.url;
    
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

      await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });

      // Wait for profile to load
      try {
        await page.waitForSelector('.pv-top-card', { timeout: 15000 });
      } catch (err) {
        outputError('Could not load profile.', 2);
        if (browser) await browser.close();
        return;
      }

      // Find the Connect button. It might be in a dropdown "More" menu
      let connectButton = await page.$('button[aria-label^="Invite"][class*="pvs-profile-actions"]');
      
      if (!connectButton) {
        // Look in "More" menu
        const moreButton = await page.$('.pvs-profile-actions button[aria-label="More actions"]');
        if (moreButton) {
          await moreButton.click();
          await new Promise(r => setTimeout(r, 1000));
          connectButton = await page.$('.artdeco-dropdown__content button[aria-label^="Invite"]');
        }
      }

      if (!connectButton) {
        outputError('Could not find Connect button. Already connected or pending?', 2);
        if (browser) await browser.close();
        return;
      }

      await connectButton.click();
      await new Promise(r => setTimeout(r, 2000));

      // Handle the modal (Add a note or send directly)
      try {
        await page.waitForSelector('#artdeco-modal-outlet', { timeout: 5000 });
        
        if (options.message) {
          const addNoteBtn = await page.$('button[aria-label="Add a note"]');
          if (addNoteBtn) {
            await addNoteBtn.click();
            await page.waitForSelector('textarea[name="message"]', { timeout: 3000 });
            await page.type('textarea[name="message"]', options.message, { delay: 50 });
          }
        }

        // Click Send
        const sendBtn = await page.$('button[aria-label="Send now"], button[aria-label="Send invitation"]');
        if (sendBtn) {
          await sendBtn.click();
          await new Promise(r => setTimeout(r, 2000));
        } else {
           throw new Error('Send button not found');
        }

      } catch (e) {
        outputError('Failed to interact with connection modal', 3);
        if (browser) await browser.close();
        return;
      }

      await browser.close();
      outputJson({ success: true, message: 'Connection request sent.' });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while connecting', 3, { detail: error.message });
    }
  });
