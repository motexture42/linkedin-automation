import { Command } from 'commander';
import { outputError } from '../utils/logger';

export const commentsCommand = new Command('comments')
  .description('Scrape comments from a specific post (Not yet implemented)')
  .action(() => {
    outputError('Command not yet implemented.', 3);
  });
