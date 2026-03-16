import { Command } from 'commander';
import { outputError } from '../utils/logger';

export const repostCommand = new Command('repost')
  .description('Repost a specific post (Not yet implemented)')
  .action(() => {
    outputError('Command not yet implemented.', 3);
  });
