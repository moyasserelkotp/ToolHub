#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ToolHub } from 'sdk';
const Table = require('cli-table3');

const program = new Command();

program
  .name('toolhub')
  .description('CLI to interact with the ToolHub AI Tool Registry')
  .version('1.0.0')
  .option('-u, --url <url>', 'ToolHub server URL', process.env.TOOLHUB_URL || 'http://localhost:3000')
  .option('-t, --token <token>', 'Admin Bearer Token', process.env.TOOLHUB_ADMIN_TOKEN || '');

program
  .command('search <query>')
  .description('Semantic search for tools')
  .action(async (query: string) => {
    const opts = program.opts();
    const hub = new ToolHub({ baseUrl: opts.url, adminToken: opts.token });
    
    try {
      console.log(chalk.blue(`\n🔍 Searching ToolHub for: "${query}"...\n`));
      const tools = await hub.search(query, 5);

      if (tools.length === 0) {
        console.log(chalk.yellow('No matching tools found.'));
        return;
      }

      const table = new Table({
        head: [chalk.cyan('ID / Name'), chalk.cyan('Category'), chalk.cyan('Auth'), chalk.cyan('Score'), chalk.cyan('Match %')],
        style: { compact: true }
      });

      tools.forEach(t => {
        table.push([
          `${chalk.bold(t.name)}\n${chalk.dim(t.id)}`,
          t.category,
          t.auth_type || 'none',
          t.security_score.toString(),
          t.semantic_score ? (t.semantic_score * 100).toFixed(1) + '%' : '-'
        ]);
      });

      console.log(table.toString());
      console.log();
    } catch (err: any) {
      console.error(chalk.red('\n❌ Search failed:'), err.message);
    }
  });

program
  .command('info <id>')
  .description('Get detailed info about a specific tool')
  .action(async (id: string) => {
    const opts = program.opts();
    const hub = new ToolHub({ baseUrl: opts.url, adminToken: opts.token });

    try {
      const tool = await hub.get(id);
      console.log(chalk.bold.blue(`\n📦 ${tool.name} `) + chalk.dim(`v${tool.version}`));
      console.log(chalk.cyan('ID:         ') + tool.id);
      console.log(chalk.cyan('Category:   ') + tool.category);
      console.log(chalk.cyan('Auth Type:  ') + tool.auth_type);
      console.log(chalk.cyan('Status:     ') + (tool.status === 'degraded' ? chalk.red(tool.status) : chalk.green(tool.status)));
      console.log(chalk.cyan('Score:      ') + tool.security_score + '/100');
      console.log(chalk.cyan('Usage:      ') + tool.usage_count + ' calls');
      console.log(`\n${chalk.italic(tool.description)}\n`);
    } catch (err: any) {
      console.error(chalk.red('\n❌ Failed to get tool info:'), err.message);
    }
  });

program.parse(process.argv);
