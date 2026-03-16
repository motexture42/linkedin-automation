import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const searchCommand = new Command('search')
  .description('Search LinkedIn for People or Posts')
  .requiredOption('-q, --query <string>', 'Search query')
  .option('-t, --type <type>', 'Type of search: "people" or "posts"', 'people')
  .option('-l, --limit <number>', 'Number of results to extract', '10')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const limit = parseInt(options.limit, 10);
    const headless = options.headless !== 'false';
    const query = encodeURIComponent(options.query);
    
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

      // Construct LinkedIn search URL
      let searchUrl = `https://www.linkedin.com/search/results/all/?keywords=${query}`;
      if (options.type === 'people') {
        searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${query}`;
      } else if (options.type === 'posts') {
        searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${query}`;
      }

      // Listen to network to catch GraphQL/Voyager responses containing Post Data
      const interceptedPosts: any[] = [];
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/api/graphql') || url.includes('/api/voyager')) {
           try {
             const json = await response.json();
             const jsonStr = JSON.stringify(json);
             if (jsonStr.includes('urn:li:activity:')) {
                 interceptedPosts.push(jsonStr);
             }
           } catch (e) {}
        }
      });

      // Go to search page directly
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const extractedResults: any[] = [];
      const seenUrls = new Set<string>();
      const seenContentHashes = new Set<string>();

      // Gradually scroll down to trigger lazy loading of posts and extract continuously
      for (let i = 0; i < 20; i++) {
        await page.evaluate(() => {
            // Scroll the main window
            window.scrollBy(0, 1000);
            
            // Scroll the specific list container which usually holds the elements
            const containers = document.querySelectorAll('.scaffold-layout__main, .search-results-container, ul, .scaffold-layout__list');
            containers.forEach(c => {
                c.scrollBy(0, 1000);
                c.scrollTop = c.scrollHeight;
            });
            
            document.documentElement.scrollTop = document.documentElement.scrollHeight;
        });
        await new Promise(resolve => setTimeout(resolve, 800));

        // Try to click "Next" page or "Show more results" if it exists
        try {
           const nextButton = await page.$('button[aria-label="Next"], button.artdeco-pagination__button--next');
           if (nextButton) {
               const isDisabled = await page.evaluate(btn => btn.hasAttribute('disabled'), nextButton);
               if (!isDisabled) {
                   await nextButton.click();
                   await new Promise(resolve => setTimeout(resolve, 2000));
               }
           }
        } catch(e) {}

        const batch = (await page.evaluate(async (t: string, l: number, apiData: string[]) => {
            const results: any[] = [];
            const type = t;
            const limit = l;

            if (type === 'people') {
              const personLinks = Array.from(document.querySelectorAll('a[href*="linkedin.com/in/"]')) as HTMLAnchorElement[];
              for (const link of personLinks) {
                const url = link.href.split('?')[0];
                if (url.includes('/overlay/')) continue;
                
                const name = link.textContent?.trim();
                if (!name || name === 'LinkedIn' || name.length > 50) continue;
                
                let subtitle = '';
                const container = link.closest('li') || link.closest('.reusable-search__result-container') || (link.parentElement ? link.parentElement.parentElement : null);
                if (container) {
                   const texts = (container as HTMLElement).innerText.split('\\n').map(s => s.trim()).filter(Boolean);
                   const nameIdx = texts.findIndex(t => t.includes(name));
                   if (nameIdx !== -1 && texts.length > nameIdx + 1) {
                      subtitle = texts[nameIdx + 1];
                   }
                }
                results.push({ type: 'person', url, name, subtitle });
              }
            } else {
              // Extract posts using author links and walking up the DOM (since class names are obfuscated)
              const authorLinks = Array.from(document.querySelectorAll('a[href*="linkedin.com/in/"], a[href*="linkedin.com/company/"]')) as HTMLAnchorElement[];
              for (const link of authorLinks) {
                const url = link.href.split('?')[0];
                const authorName = link.textContent?.trim() || '';
                if (!authorName || authorName.length > 50) continue;

                let container: HTMLElement | null = link.parentElement as HTMLElement | null;
                let foundValidContainer = false;
                for (let i=0; i<8; i++) {
                   if (container && container.innerText && container.innerText.length > 100) {
                      if (container.innerText.includes('Like') && container.innerText.includes('Comment')) {
                         foundValidContainer = true;
                         break;
                      }
                   }
                   if (container) container = container.parentElement as HTMLElement | null;
                }

                if (foundValidContainer && container) {
                   const text = container.innerText || '';
                   const hash = text.substring(0, 100);

                   const lines = text.split('\\n').map(s => s.trim()).filter(Boolean);
                   const snippetForMatch = lines.slice(0, 5).join(' ').substring(0, 50);
                   
                   let postUrl = '';

                   // Since LinkedIn obfuscates class names and removes URNs from the DOM tree,
                   // but keeps them in the initial `window.__como_rehydration__` JSON script payload,
                   // we can match the author name or a snippet of the text to find the nearest URN
                   // in the raw page source.
                   const rawPageSource = document.documentElement.innerHTML;
                   
                   // Try to find the JSON block containing the author name
                   const parts = rawPageSource.split(authorName);
                   if (parts.length > 1) {
                       for (let p = 1; p < parts.length; p++) {
                           // Look behind or ahead in the JSON payload for the nearest urn:li:activity
                           const textContext = parts[p].substring(0, 2000);
                           const matchAhead = textContext.match(/urn(?:%3A|:)li(?:%3A|:)activity(?:%3A|:)(\\d+)/);
                           if (matchAhead) {
                               postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${matchAhead[1]}/`;
                               break;
                           }
                           
                           // Sometimes the URN is declared right *before* the author name in the JSON array
                           const textBehind = parts[p-1].slice(-2000);
                           const matchesBehind = Array.from(textBehind.matchAll(/urn(?:%3A|:)li(?:%3A|:)activity(?:%3A|:)(\\d+)/g));
                           if (matchesBehind.length > 0) {
                               const lastMatch = matchesBehind[matchesBehind.length - 1];
                               postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${lastMatch[1]}/`;
                               break;
                           }
                       }
                   }

                   const fallbackUrl = url.endsWith('/') ? `${url}recent-activity/all/` : `${url}/recent-activity/all/`;
                   const finalPostUrl = postUrl || fallbackUrl;
                   
                   results.push({
                     type: 'post',
                     postUrl: finalPostUrl,
                     hash,
                     author: { name: authorName, url },
                     text: lines.slice(0, 10).join('\\n') + (lines.length > 10 ? '...' : '')
                   });
                }
              }
            }
            return results;
        }, options.type, limit, interceptedPosts)) as any[];

        for (const item of batch) {
            if (extractedResults.length >= limit) break;
            
            if (item.type === 'person') {
                if (!seenUrls.has(item.url)) {
                    seenUrls.add(item.url);
                    extractedResults.push(item);
                }
            } else {
                const dedupeKey = item.postUrl || item.hash;
                if (!seenContentHashes.has(dedupeKey)) {
                    seenContentHashes.add(dedupeKey);
                    delete item.hash; // clean up before output
                    extractedResults.push(item);
                }
            }
        }

        if (extractedResults.length >= limit) break;
        
        try {
           const nextButton = await page.$('button[aria-label="Next"]');
           if (nextButton) {
               await nextButton.click();
               await new Promise(resolve => setTimeout(resolve, 1500));
           }
        } catch(e) {}
      }

      await browser.close();
      outputJson({ success: true, data: extractedResults });
      return;

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while searching', 3, { detail: error.message });
    }
  });
