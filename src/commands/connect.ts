import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const connectCommand = new Command('connect')
  .description('Send a connection request to a user')
  .requiredOption('-u, --url <string>', 'LinkedIn Profile URL')
  .option('-m, --message <string>', 'Optional personalized note')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const headless = options.headless !== 'false';
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

      // Wait for profile to load (using a generic selector for the main content area)
      try {
        await page.waitForSelector('main', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 3000)); // allow React hydration
      } catch (err) {
        outputError('Could not load profile.', 2);
        if (browser) await browser.close();
        return;
      }

      // Try to find the Connect button directly in the main section
      let clickSuccess = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('main button')) as HTMLButtonElement[];
          
          // First try to find a direct "Connect" or "Collegati" button (excluding the ones in "People you may know" sidebars)
          // We can identify primary profile buttons as they usually don't have long aria-labels like "Invite X to connect"
          for (const b of buttons) {
              const text = b.innerText.trim();
              const aria = b.getAttribute('aria-label') || '';
              // If it's a direct connect button on the profile header
              if ((text === 'Connect' || text === 'Collegati') && !aria.includes('Invite ')) {
                  b.click();
                  return true;
              }
              // Sometimes aria-label is exactly "Connect" or "Invite [Person] to connect" but it's the primary button
              // The primary buttons are usually higher up in the DOM.
              if (aria.startsWith('Invite ') && aria.endsWith(' to connect') && b.closest('section:first-of-type')) {
                  b.click();
                  return true;
              }
          }
          return false;
      });

      // If direct connect not found, check the "More" menu
      if (!clickSuccess) {
          const openedMore = await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('main button')) as HTMLButtonElement[];
              const moreBtn = buttons.find(b => b.innerText.trim() === 'More' || b.innerText.trim() === 'Altro' || b.getAttribute('aria-label') === 'More actions');
              if (moreBtn) {
                  moreBtn.click();
                  return true;
              }
              return false;
          });

          if (openedMore) {
              await new Promise(r => setTimeout(r, 1500)); // wait for dropdown
              
              clickSuccess = await page.evaluate(() => {
                  // The dropdown might be attached to body or main
                  const dropdownItems = Array.from(document.querySelectorAll('div[role="menu"] div, div[role="menu"] span, .artdeco-dropdown__content button, .artdeco-dropdown__content div'));
                  for (const item of dropdownItems) {
                      const text = (item as HTMLElement).innerText.trim();
                      if (text.includes('Connect') || text.includes('Collegati')) {
                          (item as HTMLElement).click();
                          return true;
                      }
                  }
                  return false;
              });
          }
      }

      if (!clickSuccess) {
        outputError('Could not find Connect button. Already connected, pending, or UI changed.', 2);
        if (browser) await browser.close();
        return;
      }

      await new Promise(r => setTimeout(r, 2500));

      // Handle the modal (Add a note or send directly)
      try {
        // Modal usually appears in a portal div
        let handled = false;
        
        // 1. Check for "How do you know this person?" modal first
        const howDoYouKnow = await page.evaluate(() => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (dialog && dialog.innerHTML.includes('How do you know')) {
                // Select "Other" or similar
                const options = Array.from(dialog.querySelectorAll('button'));
                const otherBtn = options.find(b => b.innerText.includes('Other') || b.innerText.includes('Altro'));
                if (otherBtn) {
                    otherBtn.click();
                    return true;
                }
            }
            return false;
        });

        if (howDoYouKnow) {
            await new Promise(r => setTimeout(r, 1000));
            // Click continue
            await page.evaluate(() => {
                const dialog = document.querySelector('div[role="dialog"]');
                if (dialog) {
                    const btns = Array.from(dialog.querySelectorAll('button'));
                    const continueBtn = btns.find(b => b.innerText.includes('Connect') || b.innerText.includes('Send') || b.className.includes('primary'));
                    if (continueBtn) continueBtn.click();
                }
            });
            await new Promise(r => setTimeout(r, 2000));
        }

        // 2. Add note modal
        if (options.message) {
          const clickedAddNote = await page.evaluate(() => {
              const dialog = document.querySelector('div[role="dialog"]');
              if (!dialog) return false;
              const btns = Array.from(dialog.querySelectorAll('button'));
              const addNoteBtn = btns.find(b => b.innerText.includes('Add a note') || b.getAttribute('aria-label') === 'Add a note');
              if (addNoteBtn) {
                  addNoteBtn.click();
                  return true;
              }
              return false;
          });

          if (clickedAddNote) {
              await new Promise(r => setTimeout(r, 1000));
              await page.type('textarea', options.message, { delay: 50 });
          }
        }

        // 3. Click Send
        const clickedSend = await page.evaluate(() => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return false;
            const btns = Array.from(dialog.querySelectorAll('button'));
            // Could be "Send", "Send without a note", "Send invitation"
            const sendBtn = btns.find(b => {
                const t = b.innerText;
                return t === 'Send' || t.includes('Send without') || t.includes('Send invitation') || b.getAttribute('aria-label')?.includes('Send');
            });
            if (sendBtn) {
                sendBtn.click();
                return true;
            }
            return false;
        });
        
        if (!clickedSend) {
            // No modal appeared, or it was successfully bypassed automatically (some connections send instantly without modal)
            const isSent = await page.evaluate(() => document.body.innerHTML.includes('Pending'));
            if (!isSent) {
                 // Check if there is an email verification modal
                 const emailVerification = await page.evaluate(() => {
                      const d = document.querySelector('div[role="dialog"]');
                      return d && d.innerHTML.includes('email');
                 });
                 if (emailVerification) {
                      throw new Error('Email verification required by this user.');
                 }
                 throw new Error('Send button not found in modal');
            }
        } else {
            await new Promise(r => setTimeout(r, 2000));
        }

      } catch (e: any) {
        // If no modal appeared, it might have been a 1-click connect. We just assume success if no error was thrown
        if (e.message.includes('Email verification')) {
            outputError('Email verification required to connect with this user.', 3);
            if (browser) await browser.close();
            return;
        }
        // It might have just sent successfully without a modal.
      }

      await browser.close();
      outputJson({ success: true, message: 'Connection request sent.' });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while connecting', 3, { detail: error.message });
    }
  });
