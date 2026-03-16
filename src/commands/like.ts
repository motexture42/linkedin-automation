import { Command } from 'commander';
import { outputError } from '../utils/logger';

export const likeCommand = new Command('like')
  .description('Like a specific post (Not yet implemented)')
  .action(() => {
    outputError('Command not yet implemented.', 3);
  });
