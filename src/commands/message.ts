import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const messageCommand = new Command('message')
  .description('Send a direct message to a connection')
  .requiredOption('-u, --url <string>', 'LinkedIn Profile URL of the recipient')
  .requiredOption('-m, --message <string>', 'The message to send')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const headless = options.headless !== 'false';
    const profileUrl = options.url;
    const message = options.message;
    
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

      // The overlay may open in a new tab/window — poll across ALL browser pages
  let typed = false;
  let debugInfo = '';

  for (let attempt = 0; attempt < 24 && !typed; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    const allPages = await browser.pages();

    const currentPages = await browser.pages();
  for (const p of currentPages) {
      for (const frame of p.frames()) {
        try {
          const found = await frame.evaluate((text) => {
            function findEditor(root: any): HTMLElement | null {
              if (!root) return null;
              if (root.nodeType === Node.ELEMENT_NODE) {
                const el = root as HTMLElement;
                const isEditable = el.getAttribute('contenteditable') === 'true' || 
                                   el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false' ||
                                   el.tagName === 'TEXTAREA' || 
                                   el.getAttribute('role') === 'textbox';
                
                if (isEditable) {
                  const label = (el.getAttribute('aria-label') || '').toLowerCase();
                  // Skip search bars
                  if (!label.includes('search') && !label.includes('cerca') && el.tagName !== 'INPUT') {
                    // Make sure it's not hidden
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                      return el;
                    }
                  }
                }
                if (el.shadowRoot) {
                  const shadow = findEditor(el.shadowRoot);
                  if (shadow) return shadow;
                }
              }
              for (const child of root.childNodes) {
                const childFound = findEditor(child);
                if (childFound) return childFound;
              }
              return null;
            }

            const editor = findEditor(document.body);
            if (!editor) return false;
            
            editor.scrollIntoView({ block: 'center' });
            editor.focus();
            
            
            if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
               (editor as HTMLInputElement).value = '';
            } else {
               editor.innerHTML = '';
            }
            return true;

          }, message);
          
          if (found) { typed = true; await p.bringToFront(); await p.keyboard.type(message, { delay: 10 }); break; }
        } catch(e) { /* ignore cross origin errors */ }
      }
      if (typed) break;
    }

    if (!typed && attempt === 23) {
      // Dump the full page HTML to /tmp so we can inspect it
      try {
        const html = await page.content();
        const fs = (await import('fs')).default;
        fs.writeFileSync('/tmp/linkedin-msg-debug.html', html);
      } catch (_) {}
      const allPages2 = await browser.pages();
      const infos = await Promise.all(allPages2.map(async (p) => {
        const url = p.url();
        const count = await p.evaluate(() => document.querySelectorAll('[contenteditable]').length).catch(() => -1);
        const bodyClass = await p.evaluate(() => document.body?.className ?? '').catch(() => '');
        return `${url}: ${count} contenteditable, body=${bodyClass.slice(0, 80)}`;
      }));
      debugInfo = infos.join(' | ');
    }
  }

  if (!typed) {
      await browser.close();
      throw new Error(`Could not find the message editor box. Debug: ${debugInfo}. Full HTML dumped to /tmp/linkedin-msg-debug.html`);
  }

  await new Promise(r => setTimeout(r, 1500));

  let sent = false;
  const currentPages = await browser.pages();
  for (const p of currentPages) {
    for (const frame of p.frames()) {
      try {
        const didSend = await frame.evaluate(() => {
           // Fallback to sending Enter key on the editor if no button is found
           const sendBtns = Array.from(document.querySelectorAll('button.msg-form__send-button, button[aria-label="Send"], button[aria-label="Invia"], button[type="submit"]')) as HTMLButtonElement[];
           for (const b of sendBtns) {
                if (!b.hasAttribute('disabled') && !b.closest('form[role="search"]')) {
                    b.click();
                    return true;
                }
           }
           return false;
        });
        if (didSend) { sent = true; break; }
      } catch(e) {}
    }
    if (sent) break;
  }
  
  if (!sent && typed) {
    // Fallback: press Enter on active element
    try {
      // In LinkedIn, Ctrl+Enter or Cmd+Enter often forces a send rather than a newline
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
      sent = true;
    } catch(e) {}
  }

  if (!sent) {
      await browser.close();
      throw new Error('Could not click the send button.');
  }

  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
  

      await browser.close();
      outputJson({ success: true, message: 'Message sent successfully.' });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while sending message', 3, { detail: error.message });
    }
  });