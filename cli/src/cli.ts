#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ToolHub } from 'sdk';
import axios from 'axios';
import inquirer from 'inquirer';
import ora from 'ora';
import { io } from 'socket.io-client';
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

program
  .command('register')
  .description('Import tools from an OpenAPI spec')
  .requiredOption('--url <url>', 'URL to the OpenAPI specification')
  .action(async (options) => {
    const opts = program.opts();
    const serverUrl = opts.url || process.env.TOOLHUB_URL || 'http://localhost:3000';
    const specUrl = options.url;
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `This will fetch ${specUrl} and register all endpoints as AI tools. Proceed?`,
        default: true
      }
    ]);
    
    if (!confirm) {
      console.log(chalk.dim('Operation cancelled by user.'));
      return;
    }

    const spinner = ora('Analyzing spec & registering tools...').start();
    try {
      const res = await axios.post(`${serverUrl}/tools/import-openapi`, { spec_url: specUrl }, { headers: { 'Authorization': `Bearer ${opts.token}` } });
      spinner.succeed('Import process completed!');
      
      console.log(chalk.green(`\n✅ Successfully arrayed ${res.data.imported || 0} tools.`));
      if (res.data.skipped > 0) {
        console.log(chalk.yellow(`⚠️  Skipped ${res.data.skipped} tools (duplicates or low security score).`));
      }
    } catch (err: any) {
      spinner.fail('Failed to process OpenAPI spec');
      console.error(chalk.red(err.response?.data?.error || err.message));
    }
  });

program
  .command('logs')
  .description('Stream real-time invocation logs from ToolHub')
  .option('--tail', 'Tail the live feed indefinitely', false)
  .action((options) => {
    const opts = program.opts();
    const serverUrl = opts.url || process.env.TOOLHUB_URL || 'http://localhost:3000';
    
    console.log(chalk.blue(`\n📡 Connecting to live log stream at ${serverUrl}...`));
    const socket = io(serverUrl);
    
    socket.on('connect', () => {
      console.log(chalk.green('✅ Connected. Waiting for tool invocations...\n'));
    });
    
    socket.on('live_call', (data) => {
      const statusStr = data.success ? chalk.bgGreen.black(' OK ') : chalk.bgRed.white(' ERR ');
      const latencyStr = `[${data.latency_ms}ms]`;
      console.log(`${chalk.dim(new Date(data.timestamp).toLocaleTimeString())}  ${statusStr}  ${chalk.cyan(latencyStr.padEnd(8))}  ${chalk.bold(data.tool_name)}  ${chalk.dim('by')} ${data.agent_id}`);
    });
    
    socket.on('tool_registered', (data) => {
      console.log(`${chalk.bgBlue.white(' NEW ')}  ${chalk.bold(data.name)}  ${chalk.dim('in cat:')} ${data.category}`);
    });

    socket.on('disconnect', () => {
      console.log(chalk.yellow('\n⚠️  Disconnected from server. Retrying...'));
    });
  });

program.parse(process.argv);
