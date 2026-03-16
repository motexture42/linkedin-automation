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

      let searchUrl = `https://www.linkedin.com/search/results/all/?keywords=${query}`;
      if (options.type === 'people') {
        searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${query}`;
      } else if (options.type === 'posts') {
        searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${query}`;
      }

      const extractedApiPosts: any[] = [];
      const extractedResults: any[] = [];
      const seenContentHashes = new Set<string>();
      const seenUrls = new Set<string>();

      page.on('response', async (response) => {
        const url = response.url();
        if (options.type === 'posts' && (url.includes('/api/graphql') || url.includes('/api/voyager') || url.includes('/api/search'))) {
           try {
             const json = await response.json();
             const walkJson = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                
                let urn = obj.entityUrn || obj.urn || (obj.updateMetadata && obj.updateMetadata.urn);
                if (urn && typeof urn === 'string' && (urn.includes('urn:li:activity:') || urn.includes('urn:li:ugcPost:'))) {
                   const cleanUrn = urn.replace(/%3A/g, ':');
                   const idMatch = cleanUrn.match(/(?:activity|ugcPost):(\d+)/);
                   
                   if (idMatch) {
                       const standardizedUrn = `urn:li:${cleanUrn.includes('ugcPost') ? 'ugcPost' : 'activity'}:${idMatch[1]}`;
                       
                       let entry = extractedApiPosts.find(p => p.urn === standardizedUrn);
                       if (!entry) {
                           entry = { urn: standardizedUrn, text: "", author: "" };
                           extractedApiPosts.push(entry);
                       }
                       
                       // Accumulate text from various possible locations in the JSON
                       if (obj.commentary?.text?.text) entry.text = obj.commentary.text.text;
                       else if (obj.value?.com?.linkedin?.voyager?.dash?.feed?.Update?.commentary?.text?.text) entry.text = obj.value.com.linkedin.voyager.dash.feed.Update.commentary.text.text;
                       else if (obj.summary?.text?.text) entry.text = obj.summary.text.text;
                       else if (obj.text?.text) entry.text = obj.text.text;

                       // Accumulate author
                       if (obj.actor?.name?.text) entry.author = obj.actor.name.text;
                       else if (obj.title?.text) entry.author = obj.title.text;
                   }
                }

                for (const key of Object.keys(obj)) {
                    walkJson(obj[key]);
                }
             };
             walkJson(json);
           } catch (e) {}
        }
      });

      let pageNum = 1;
      let iterationsWithNoNewResults = 0;
      
      while (extractedResults.length < limit && iterationsWithNoNewResults < 4) {
          const currentUrl = pageNum === 1 ? searchUrl : `${searchUrl}&page=${pageNum}`;
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
          await new Promise(resolve => setTimeout(resolve, 5000)); // crucial to wait for API
          
          if (options.type === 'people') {
              // People extraction via DOM
              await page.evaluate(() => window.scrollBy(0, 1000));
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              const batch = (await page.evaluate(() => {
                  const results: any[] = [];
                  const personLinks = Array.from(document.querySelectorAll('a[href*="linkedin.com/in/"]')) as HTMLAnchorElement[];
                  for (const link of personLinks) {
                    const url = link.href.split('?')[0];
                    if (url.includes('/overlay/')) continue;
                    
                    const name = link.textContent?.trim();
                    if (!name || name === 'LinkedIn' || name.length > 50) continue;
                    
                    let subtitle = '';
                    const container = link.closest('li') || link.closest('.reusable-search__result-container') || (link.parentElement ? link.parentElement.parentElement : null);
                    if (container) {
                       const texts = (container as HTMLElement).innerText.split('\n').map(s => s.trim()).filter(Boolean);
                       const nameIdx = texts.findIndex(t => t.includes(name));
                       if (nameIdx !== -1 && texts.length > nameIdx + 1) {
                          subtitle = texts[nameIdx + 1];
                       }
                    }
                    results.push({ type: 'person', url, name, subtitle });
                  }
                  return results;
              })) as any[];
              
              let newAdded = 0;
              for (const item of batch) {
                  if (extractedResults.length >= limit) break;
                  if (!seenUrls.has(item.url)) {
                      seenUrls.add(item.url);
                      extractedResults.push(item);
                      newAdded++;
                  }
              }
              if (newAdded === 0) iterationsWithNoNewResults++;
              else iterationsWithNoNewResults = 0;

          } else {
              // Scroll to bottom to trigger any lazy API calls
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await new Promise(resolve => setTimeout(resolve, 2000));

              let newAdded = 0;
              
              // Process the newly intercepted items accumulated in extractedApiPosts
              for (const item of extractedApiPosts) {
                  if (extractedResults.length >= limit) break;
                  
                  // Only consider posts that actually have text or an author
                  if (item.text || item.author) {
                      const postUrl = `https://www.linkedin.com/feed/update/${item.urn}/`;
                      
                      if (!seenContentHashes.has(postUrl)) {
                          seenContentHashes.add(postUrl);
                          extractedResults.push({
                              type: 'post',
                              postUrl,
                              author: { name: item.author || "Unknown", url: '' },
                              text: item.text.substring(0, 500) + (item.text.length > 500 ? '...' : '')
                          });
                          newAdded++;
                      } else {
                          // Merge better data
                          const existing = extractedResults.find(r => r.postUrl === postUrl);
                          if (existing) {
                              if (existing.author.name === "Unknown" && item.author) existing.author.name = item.author;
                              if (existing.text.length < item.text.length) existing.text = item.text.substring(0, 500) + (item.text.length > 500 ? '...' : '');
                          }
                      }
                  }
              }
              
              if (newAdded === 0) iterationsWithNoNewResults++;
              else iterationsWithNoNewResults = 0;
          }
          
          pageNum++;
      }

      await browser.close();
      
      // Cleanup empty/useless nodes that snuck in if we hit the limit
      const cleanedData = extractedResults.filter(r => r.type === 'person' || (r.text && r.text.length > 5));

      outputJson({ success: true, data: cleanedData.slice(0, limit) });
      return;

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while searching', 3, { detail: error.message });
    }
  });
