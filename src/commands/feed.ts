import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const feedCommand = new Command('feed')
  .description('Read posts from the LinkedIn feed')
  .option('-l, --limit <number>', 'Number of posts to extract', '10')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const limit = parseInt(options.limit, 10);
    const headless = options.headless !== 'false';
    
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
        await page.waitForSelector('.feed-shared-update-v2', { timeout: 15000 });
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find posts on the feed. UI may have changed.', 2);
        if (browser) await browser.close();
        return;
      }

      const extractedPosts: any[] = [];
      const seenIds = new Set<string>();

      while (extractedPosts.length < limit) {
        const postElements = await page.$$('.feed-shared-update-v2');
        
        for (const el of postElements) {
          if (extractedPosts.length >= limit) break;

          try {
            const postData = await page.evaluate((article) => {
              const textElement = article.querySelector('.feed-shared-update-v2__description, .update-components-text');
              const text = textElement ? (textElement as HTMLElement).innerText : '';
              
              const urn = article.getAttribute('data-urn') || '';
              const id = urn.split(':').pop() || '';
              const url = `https://www.linkedin.com/feed/update/${urn}`;

              const authorElement = article.querySelector('.update-components-actor__name');
              const authorName = authorElement ? (authorElement as HTMLElement).innerText.trim() : '';

              const likesElement = article.querySelector('.social-details-social-counts__reactions-count');
              const commentsElement = article.querySelector('.social-details-social-counts__comments');

              return {
                id,
                url,
                text,
                author: {
                  name: authorName
                },
                metrics: {
                  likes: likesElement ? (likesElement as HTMLElement).innerText.trim() : '0',
                  comments: commentsElement ? (commentsElement as HTMLElement).innerText.trim() : '0',
                }
              };
            }, el);

            if (postData.id && !seenIds.has(postData.id)) {
              seenIds.add(postData.id);
              extractedPosts.push(postData);
            }
          } catch (e) {
            // Ignore detached element errors during scrolling
          }
        }

        if (extractedPosts.length < limit) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      await browser.close();
      outputJson({ success: true, data: extractedPosts });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while fetching feed', 3, { detail: error.message });
    }
  });
