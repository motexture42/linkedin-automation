import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const messageCommand = new Command('message')
  .description('Send a direct message to a connection')
  .requiredOption('-u, --url <string>', 'LinkedIn Profile URL of the recipient')
  .requiredOption('-m, --message <string>', 'The message to send')
  .option('--headless <boolean>', 'Run in headless mode', 'false')
  .action(async (options) => {
    const headless = options.headless === 'true';
    const profileUrl = options.url;
    const messageText = options.message;
    
    let browser, page: any;
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

      // Navigate directly to the messaging overlay with the user by clicking 'Message' on their profile
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });

      try {
        await page.waitForSelector('main', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        outputError('Could not load profile.', 2);
        if (browser) await browser.close();
        return;
      }

      // Find the Message button directly in the main section
      let clickSuccess = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('main button, main a')) as HTMLElement[];
          for (const b of buttons) {
              const text = b.innerText.trim();
              const aria = b.getAttribute('aria-label') || '';
              if (text === 'Message' || text === 'Messaggio' || aria.includes('Message ')) {
                  b.click();
                  return true;
              }
          }
          return false;
      });

      if (!clickSuccess) {
         outputError('Could not find the Message button. Are you connected with this person?', 2);
         if (browser) await browser.close();
         return;
      }

      await new Promise(r => setTimeout(r, 2000)); // Wait for chat box to open

      // Wait for the message text area to appear
      const editorSelector = '.msg-form__contenteditable, div[role="textbox"][aria-label*="message"]';
      try {
          await page.waitForSelector(editorSelector, { timeout: 5000 });
          await page.click(editorSelector);
          await page.type(editorSelector, messageText, { delay: 50 });
      } catch(e) {
          outputError('Could not find the message editor box.', 2);
          if (browser) await browser.close();
          return;
      }

      await new Promise(r => setTimeout(r, 1000));

      // Click the send button
      const sent = await page.evaluate(() => {
          const sendBtns = Array.from(document.querySelectorAll('button.msg-form__send-button'));
          for (const b of sendBtns) {
               if (!b.hasAttribute('disabled')) {
                   (b as HTMLButtonElement).click();
                   return true;
               }
          }
          return false;
      });

      if (!sent) {
          outputError('Could not click the send button.', 2);
          if (browser) await browser.close();
          return;
      }

      await new Promise(r => setTimeout(r, 2000)); // wait for message to process

      await browser.close();
      outputJson({ success: true, message: 'Message sent successfully.' });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while sending message', 3, { detail: error.message });
    }
  });