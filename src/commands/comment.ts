import { Command } from 'commander';
import { outputError } from '../utils/logger';

export const commentCommand = new Command('comment')
  .description('Comment on a specific post (Not yet implemented)')
  .action(() => {
    outputError('Command not yet implemented.', 3);
  });
