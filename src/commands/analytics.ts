import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const analyticsCommand = new Command('analytics')
  .description('Fetch analytics for a post or specific comment (likes, comments, reposts, interactions)')
  .requiredOption('-u, --url <string>', 'LinkedIn Post URL')
  .option('--post', 'Fetch analytics for the main post')
  .option('--comment <urn>', 'Fetch analytics for a specific comment by URN')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const headless = options.headless !== 'false';
    let postUrl = options.url;
    
    if (!options.post && !options.comment) {
      outputError('You must specify either --post or --comment <urn>', 1);
      return;
    }

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

      try {
        await page.waitForSelector('.feed-shared-update-v2, .core-rail', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 4000)); // allow React to hydrate
      } catch (err) {
        outputError('Could not load post.', 2);
        if (browser) await browser.close();
        return;
      }

      const results: any = { url: postUrl };

      // POST ANALYTICS
      if (options.post) {
          const postStats = await page.evaluate(() => {
              const counts = document.querySelector('.social-details-social-counts');
              if (!counts) return { error: "No social counts found on this post" };
              
              const text = (counts as HTMLElement).innerText || '';
              
              // Safely extract numbers
              const extractNum = (str: string) => {
                  const num = str.replace(/[^0-9]/g, '');
                  return num ? parseInt(num, 10) : 0;
              };

              const likesMatch = text.match(/([\d,\.]+)\s*(?:reactions|likes|Consiglia)/i) || text.match(/^([\d,\.]+)/);
              const commentsMatch = text.match(/([\d,\.]+)\s*(?:comments|commenti)/i);
              const repostsMatch = text.match(/([\d,\.]+)\s*(?:reposts|diffondi)/i);
              
              return {
                  likes: likesMatch ? extractNum(likesMatch[1]) : 0,
                  comments: commentsMatch ? extractNum(commentsMatch[1]) : 0,
                  reposts: repostsMatch ? extractNum(repostsMatch[1]) : 0
              };
          });
          results.post = postStats;
      }

      // COMMENT ANALYTICS
      if (options.comment) {
          // Scroll and try to find the comment
          let found = false;
          for (let i = 0; i < 10; i++) {
              found = await page.evaluate((urn: string) => {
                  return !!document.querySelector(`article[data-id="${urn}"]`);
              }, options.comment);
              
              if (found) break;
              
              await page.evaluate(() => window.scrollBy(0, 1000));
              await new Promise(r => setTimeout(r, 1000));
              
              // Click load more if present
              await page.evaluate(() => {
                   const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
                   for (const b of buttons) {
                       const txt = b.innerText.trim().toLowerCase();
                       if (txt.includes('load more comments') || txt.includes('carica altri commenti') || txt === 'load more') {
                            b.click();
                       }
                   }
              });
              await new Promise(r => setTimeout(r, 1000));
          }

          if (!found) {
              results.comment = { error: "Comment URN not found on this post" };
          } else {
              const commentStats = await page.evaluate((urn: string) => {
                  const article = document.querySelector(`article[data-id="${urn}"]`);
                  if (!article) return null;

                  const text = (article as HTMLElement).innerText || '';
                  
                  // Check if Liked by Me
                  const buttons = Array.from(article.querySelectorAll('button'));
                  const likeBtn = buttons.find(b => b.innerText.includes('Like') || b.innerText.includes('Consiglia') || b.getAttribute('aria-label')?.includes('Like'));
                  const likedByMe = likeBtn ? likeBtn.classList.contains('react-button--active') || (likeBtn.getAttribute('aria-label') || '').includes('Undo') : false;
                  
                  // Extract likes count
                  const likesMatch = text.match(/(?:Like|Consiglia)\s*\|?\s*([\d,\.]+)/i) || text.match(/([\d,\.]+)\s*(?:Likes|Like|Consiglia)/i);
                  let likesCount = 0;
                  if (likesMatch) {
                       likesCount = parseInt(likesMatch[1].replace(/[^0-9]/g, ''), 10);
                  } else {
                       // Sometimes the number is inside a specific span near the like button
                       const likeCountNode = article.querySelector('.comments-comment-social-bar__reactions-count');
                       if (likeCountNode) likesCount = parseInt((likeCountNode as HTMLElement).innerText.replace(/[^0-9]/g, ''), 10) || 0;
                  }

                  // Extract replies count
                  const loadRepliesBtn = buttons.find(b => b.innerText.includes('replies') || b.innerText.includes('risposte'));
                  let repliesCount = 0;
                  if (loadRepliesBtn) {
                      const m = loadRepliesBtn.innerText.match(/([\d,\.]+)/);
                      if (m) repliesCount = parseInt(m[1].replace(/[^0-9]/g, ''), 10);
                  } else {
                      const replyMatch = text.match(/([\d,\.]+)\s*(?:Replies|Reply|Risposte)/i) || text.match(/(?:Reply|Rispondi)\s*\|?\s*([\d,\.]+)/i);
                      if (replyMatch) repliesCount = parseInt(replyMatch[1].replace(/[^0-9]/g, ''), 10);
                  }

                  return {
                      urn,
                      likedByMe: !!likedByMe,
                      likesCount,
                      repliesCount
                  };
              }, options.comment);
              
              results.comment = commentStats;
          }
      }

      await browser.close();
      outputJson({ success: true, data: results });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while fetching analytics', 3, { detail: error.message });
    }
  });
