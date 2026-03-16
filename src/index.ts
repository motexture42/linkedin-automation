#!/usr/bin/env node
import { Command } from 'commander';
import { authCommand } from './commands/auth';
import { feedCommand } from './commands/feed';
import { postCommand } from './commands/post';
import { searchCommand } from './commands/search';
import { commentsCommand } from './commands/comments';
import { connectCommand } from './commands/connect';
import { messageCommand } from './commands/message';
import { interactCommand } from './commands/interact';
import { analyticsCommand } from './commands/analytics';

const program = new Command();

program
  .name('li-cli')
  .description('Agentic AI-friendly LinkedIn CLI using browser automation')
  .version('1.0.0');

program.addCommand(authCommand);
program.addCommand(feedCommand);
program.addCommand(postCommand);
program.addCommand(searchCommand);
program.addCommand(commentsCommand);
program.addCommand(connectCommand);
program.addCommand(messageCommand);
program.addCommand(interactCommand);
program.addCommand(analyticsCommand);

program.parse(process.argv);
