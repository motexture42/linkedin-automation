#!/usr/bin/env node
import { Command } from 'commander';
import { authCommand } from './commands/auth';
import { feedCommand } from './commands/feed';
import { postCommand } from './commands/post';
import { searchCommand } from './commands/search';
import { commentsCommand } from './commands/comments';
import { likeCommand } from './commands/like';
import { repostCommand } from './commands/repost';
import { commentCommand } from './commands/comment';
import { connectCommand } from './commands/connect';
import { messageCommand } from './commands/message';

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
program.addCommand(likeCommand);
program.addCommand(repostCommand);
program.addCommand(commentCommand);
program.addCommand(connectCommand);
program.addCommand(messageCommand);

program.parse(process.argv);
