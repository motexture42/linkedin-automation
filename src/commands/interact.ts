import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const interactCommand = new Command('interact')
  .description('Interact with a specific post (Like, Comment, Reply, and/or Repost)')
  .requiredOption('-u, --url <string>', 'LinkedIn Post URL')
  .option('--like', 'Like the post')
  .option('--comment <string>', 'Comment on the post with this text')
  .option('--reply-to <urn>', 'The URN of the specific comment you want to reply to')
  .option('--reply <string>', 'The text to reply to the specific comment')
  .option('--repost', 'Repost the post')
  .option('--headless <boolean>', 'Run in headless mode', 'false')
  .action(async (options) => {
    const headless = options.headless === 'true';
    let postUrl = options.url;
    
    // We need to do at least one action
    if (!options.like && !options.comment && !options.repost && !options.reply) {
      outputError('You must specify at least one action: --like, --comment, --reply, or --repost', 1);
      return;
    }

    if (options.reply && !options.replyTo) {
      outputError('You must specify --reply-to <urn> when using --reply', 1);
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

      // Wait for post to load.
      try {
        await page.waitForSelector('.feed-shared-update-v2, .core-rail', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 4000)); // allow React to hydrate and scroll to comment
      } catch (err) {
        outputError('Could not load post.', 2);
        if (browser) await browser.close();
        return;
      }

      const results: any = { postUrl };

      const findAndClickAction = async (actionName: string, ariaPartial: string) => {
        return await page.evaluate((aria: string, act: string) => {
            const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
            for (const b of buttons) {
                const label = b.getAttribute('aria-label') || '';
                const text = b.innerText.trim();
                if (label.includes(aria) || text.includes(act)) {
                    b.click();
                    return true;
                }
            }
            return false;
        }, ariaPartial, actionName);
      };

      // 1. LIKE
      if (options.like) {
          try {
             const clickedLike = await page.evaluate(() => {
                  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
                  for (const b of buttons) {
                      const label = b.getAttribute('aria-label') || '';
                      const text = b.innerText.trim();
                      const isLikeBtn = label.includes('Like') || label.includes('Consiglia') || label.includes('React Like') || text === 'Like' || text === 'Consiglia';
                      const isAlreadyLiked = b.classList.contains('react-button--active') || label.includes('Undo');
                      
                      if (isLikeBtn) {
                          if (!isAlreadyLiked) {
                              b.click();
                              return 'liked';
                          } else {
                              return 'already_liked';
                          }
                      }
                  }
                  return 'not_found';
             });
             
             results.like = clickedLike;
             if (clickedLike === 'liked') await new Promise(r => setTimeout(r, 1500));
          } catch(e) {
             results.like = 'error';
          }
      }

      // 2. COMMENT
      if (options.comment) {
          try {
              await findAndClickAction('Comment', 'Comment');
              await new Promise(r => setTimeout(r, 1500));

              const editorSelector = '.ql-editor';
              await page.waitForSelector(editorSelector, { timeout: 5000 });
              
              await page.evaluate((sel: string) => {
                  const el = document.querySelector(sel);
                  if (el) el.innerHTML = '';
              }, editorSelector);

              await page.type(editorSelector, options.comment, { delay: 50 });
              await new Promise(r => setTimeout(r, 1000));

              const commentPosted = await page.evaluate(() => {
                  const forms = document.querySelectorAll('form, .comments-comment-box');
                  for (const form of Array.from(forms)) {
                       const buttons = Array.from(form.querySelectorAll('button')) as HTMLButtonElement[];
                       for (const btn of buttons) {
                           if (btn.innerText.includes('Post') || btn.innerText.includes('Comment') || btn.innerText.includes('Pubblica')) {
                               if (!btn.hasAttribute('disabled')) {
                                   btn.click();
                                   return true;
                               }
                           }
                       }
                  }
                  return false;
              });

              results.comment = commentPosted ? 'posted' : 'submit_button_not_found';
              if (commentPosted) await new Promise(r => setTimeout(r, 3000));
          } catch(e: any) {
              results.comment = `error: ${e.message}`;
          }
      }

      // 3. REPLY TO COMMENT
      if (options.reply && options.replyTo) {
          try {
              let articleFound = false;
              
              // Aggressively scroll and search for the specific comment article due to virtual DOM
              for (let i = 0; i < 10; i++) {
                  const found = await page.evaluate((urn: string) => {
                      const articles = Array.from(document.querySelectorAll('article'));
                      return articles.some(a => a.getAttribute('data-id') === urn);
                  }, options.replyTo);
                  
                  if (found) {
                      articleFound = true;
                      break;
                  }
                  
                  await page.evaluate(() => window.scrollBy(0, 800));
                  await new Promise(r => setTimeout(r, 1000));
                  
                  // also click "Load more comments" if present to expand the tree
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

              if (!articleFound) {
                  results.reply = 'article_not_found';
              } else {
                  const clickedReply = await page.evaluate((urn: string) => {
                       const articles = Array.from(document.querySelectorAll('article'));
                       const article = articles.find(a => a.getAttribute('data-id') === urn);
                       if (!article) return 'article_not_found';
                       
                       const buttons = Array.from(article.querySelectorAll('button')) as HTMLButtonElement[];
                       const replyBtn = buttons.find(b => b.innerText.trim() === 'Reply' || b.innerText.trim() === 'Rispondi' || b.getAttribute('aria-label')?.includes('Reply'));
                       
                       if (replyBtn) {
                            replyBtn.click();
                            return 'clicked';
                       }
                       return 'reply_btn_not_found';
                  }, options.replyTo);

                  if (clickedReply === 'clicked') {
                       await new Promise(r => setTimeout(r, 1500));
                       // Find the editor inside that specific article
                       const editorFound = await page.evaluate((urn: string) => {
                           const articles = Array.from(document.querySelectorAll('article'));
                           const article = articles.find(a => a.getAttribute('data-id') === urn);
                           if (!article) return false;
                           const editor = article.querySelector('.ql-editor') as HTMLElement;
                           if (editor) {
                               editor.click();
                               return true;
                           }
                           return false;
                       }, options.replyTo);

                       if (editorFound) {
                           // Focus the newly opened ql-editor which should be the active element
                           await page.keyboard.type(options.reply, { delay: 50 });
                           await new Promise(r => setTimeout(r, 1000));

                           // Click submit on the nested form
                           const replyPosted = await page.evaluate((urn: string) => {
                               const articles = Array.from(document.querySelectorAll('article'));
                               const article = articles.find(a => a.getAttribute('data-id') === urn);
                               if (!article) return false;
                               const forms = article.querySelectorAll('form, .comments-comment-box');
                               for (const form of Array.from(forms)) {
                                    const buttons = Array.from(form.querySelectorAll('button')) as HTMLButtonElement[];
                                    for (const btn of buttons) {
                                        if (btn.innerText.includes('Post') || btn.innerText.includes('Reply') || btn.innerText.includes('Rispondi')) {
                                            if (!btn.hasAttribute('disabled')) {
                                                btn.click();
                                                return true;
                                            }
                                        }
                                    }
                               }
                               return false;
                           }, options.replyTo);
                           
                           results.reply = replyPosted ? 'posted' : 'submit_btn_not_found';
                           if (replyPosted) await new Promise(r => setTimeout(r, 3000));
                       } else {
                           results.reply = 'editor_not_found';
                       }
                  } else {
                      results.reply = clickedReply;
                  }
              }

          } catch(e: any) {
              results.reply = `error: ${e.message}`;
          }
      }

      // 4. REPOST
      if (options.repost) {
          try {
              const clickedRepostMenu = await findAndClickAction('Repost', 'Repost');
              if (clickedRepostMenu) {
                  await new Promise(r => setTimeout(r, 1000));
                  const reposted = await page.evaluate(() => {
                      const dropdownItems = Array.from(document.querySelectorAll('.artdeco-dropdown__content div, .artdeco-dropdown__content button, .artdeco-dropdown__content span'));
                      for (const item of dropdownItems) {
                          const text = (item as HTMLElement).innerText.trim();
                          if (text === 'Repost' || text === 'Diffondi' || text.includes('Repost instantly') || text.includes('instantly')) {
                              (item as HTMLElement).click();
                              return true;
                          }
                      }
                      return false;
                  });
                  results.repost = reposted ? 'reposted' : 'dropdown_option_not_found';
                  if (reposted) await new Promise(r => setTimeout(r, 3000));
              } else {
                  results.repost = 'repost_button_not_found';
              }
          } catch(e: any) {
              results.repost = `error: ${e.message}`;
          }
      }

      await browser.close();
      outputJson({ success: true, data: results });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while interacting', 3, { detail: error.message });
    }
  });