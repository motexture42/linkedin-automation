import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const commentsCommand = new Command('comments')
  .description('Scrape comments from a specific post')
  .requiredOption('-u, --url <string>', 'LinkedIn Post URL')
  .option('-l, --limit <number>', 'Number of comments to extract', '20')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const headless = options.headless !== 'false';
    const postUrl = options.url;
    const limit = parseInt(options.limit, 10);
    
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

      await page.goto(postUrl, { waitUntil: 'domcontentloaded' });

      // Wait for the post to load
      try {
        await page.waitForSelector('.feed-shared-update-v2, .core-rail', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 4000));
      } catch (err) {
        outputError('Could not load post.', 2);
        if (browser) await browser.close();
        return;
      }

      const extractedComments: any[] = [];
      const seenHashes = new Set<string>();

      // Since interceptor is missing the initial batch embedded in the page load, we use DOM extraction.
      for (let i = 0; i < 5; i++) {
          if (extractedComments.length >= limit) break;
          
          const batch = await page.evaluate(() => {
               const results: any[] = [];
               // LinkedIn comments are almost always wrapped in <article> tags inside the comments section
               const articles = document.querySelectorAll('article');
               for (const art of Array.from(articles)) {
                    // Extract URN
                    const urn = art.getAttribute('data-id') || '';

                    // Extract text
                    const textNode = art.querySelector('.comments-comment-item__main-content, .update-components-text');
                    let text = "";
                    if (textNode) text = (textNode as HTMLElement).innerText.trim();
                    
                    // Extract author robustly
                    let author = "Unknown";
                    // Authors usually have an a tag pointing to their profile
                    const authorLinks = art.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
                    for (const link of Array.from(authorLinks)) {
                        const linkText = (link as HTMLElement).innerText.trim();
                        // ensure we didn't just grab the comment text by mistake
                        if (linkText && linkText.length < 60 && !linkText.includes(text.substring(0, 20))) {
                             author = linkText.split('\n')[0]; // grab first line just in case
                             break;
                        }
                    }
                    
                    if (author === "Unknown") {
                         // Fallback: the raw text of the article usually starts with the author's name
                         const rawText = (art as HTMLElement).innerText.trim();
                         const firstLine = rawText.split('\n')[0];
                         if (firstLine && firstLine.length < 60) {
                              author = firstLine.split('•')[0].trim();
                         }
                    }
                    
                    if (text) {
                         results.push({ urn, author, text });
                    }
               }
               return results;
          });

          for (const c of batch) {
              if (extractedComments.length >= limit) break;
              const hash = c.urn || `${c.author}:${c.text.substring(0, 20)}`;
              if (!seenHashes.has(hash)) {
                  seenHashes.add(hash);
                  // Build a direct comment URL if we have the URN
                  let commentUrl = null;
                  if (c.urn) {
                      // Post url is already in options.url. We just append the commentUrn
                      const baseUrl = options.url.split('?')[0];
                      commentUrl = `${baseUrl}?commentUrn=${encodeURIComponent(c.urn)}`;
                  }
                  extractedComments.push({ ...c, commentUrl });
              }
          }
          
          if (extractedComments.length >= limit) break;

          // Scroll down to load more
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise(r => setTimeout(r, 2000));
          
          // Try to click "Load more comments"
          await page.evaluate(() => {
               const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
               for (const b of buttons) {
                   const txt = b.innerText.trim().toLowerCase();
                   if (txt.includes('load more comments') || txt.includes('carica altri commenti') || txt === 'load more') {
                        b.click();
                        return true;
                   }
               }
               return false;
          });
          
          await new Promise(r => setTimeout(r, 2000));
      }

      await browser.close();
      outputJson({ success: true, data: extractedComments.slice(0, limit) });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while scraping comments', 3, { detail: error.message });
    }
  });