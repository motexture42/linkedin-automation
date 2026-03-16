import { Command } from 'commander';
import { outputError } from '../utils/logger';

export const messageCommand = new Command('message')
  .description('Send a message to a connection (Not yet implemented)')
  .action(() => {
    outputError('Command not yet implemented.', 3);
  });
