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

// ── Skills commands ───────────────────────────────────────────────────────────

const skills = program.command('skills').description('Manage and search agent skills');

skills
  .command('search <query>')
  .description('Semantic search for agent skills')
  .option('-n, --limit <n>', 'Max results', '5')
  .action(async (query: string, options) => {
    const opts = program.opts();
    const serverUrl = opts.url || process.env.TOOLHUB_URL || 'http://localhost:3000';
    const spinner = ora(`Searching skills for: "${query}"...`).start();

    try {
      const res = await axios.post(
        `${serverUrl}/skills/search`,
        { query, limit: parseInt(options.limit) || 5 }
      );
      spinner.stop();

      const results: any[] = res.data.results || [];
      if (results.length === 0) {
        console.log(chalk.yellow('\n📭 No matching skills found.\n'));
        return;
      }

      console.log(chalk.bold.blue(`\n🧠 Skills matching: "${query}"\n`));
      const table = new Table({
        head: [
          chalk.cyan('Name / Slug'),
          chalk.cyan('Tags'),
          chalk.cyan('Match %'),
          chalk.cyan('Uses'),
          chalk.cyan('Built-in'),
        ],
        style: { compact: true },
      });

      results.forEach((s: any) => {
        table.push([
          `${chalk.bold(s.name)}\n${chalk.dim('/' + s.slug)}`,
          (s.tags || []).slice(0, 3).join(', ') || chalk.dim('—'),
          s.semantic_score ? (s.semantic_score * 100).toFixed(1) + '%' : '—',
          s.usage_count?.toString() || '0',
          s.is_builtin ? chalk.green('✓') : chalk.dim('—'),
        ]);
      });

      console.log(table.toString());
      console.log();
    } catch (err: any) {
      spinner.fail('Search failed');
      console.error(chalk.red(err.response?.data?.error || err.message));
    }
  });

skills
  .command('list')
  .description('List all indexed skills')
  .option('--tags <tags>', 'Comma-separated tag filter')
  .option('--builtin', 'Show only built-in skills', false)
  .option('-n, --limit <n>', 'Max results', '50')
  .action(async (options) => {
    const opts = program.opts();
    const serverUrl = opts.url || process.env.TOOLHUB_URL || 'http://localhost:3000';
    const spinner = ora('Fetching skills...').start();

    try {
      const params: any = { limit: parseInt(options.limit) || 50, status: 'active' };
      if (options.tags)    params.tags       = options.tags;
      if (options.builtin) params.is_builtin = 'true';

      const res = await axios.get(`${serverUrl}/skills`, { params });
      spinner.stop();

      const list: any[]  = res.data.skills || [];
      const total: number = res.data.total  || 0;

      if (list.length === 0) {
        console.log(chalk.yellow('\n📭 No skills found. Run: toolhub skills index\n'));
        return;
      }

      console.log(chalk.bold.blue(`\n🧠 Skills Registry`) + chalk.dim(` — ${total} total\n`));
      const table = new Table({
        head: [chalk.cyan('Name'), chalk.cyan('Slug'), chalk.cyan('Tags'), chalk.cyan('Uses'), chalk.cyan('Built-in')],
        style: { compact: true },
      });

      list.forEach((s: any) => {
        table.push([
          chalk.bold(s.name),
          chalk.dim('/' + s.slug),
          (s.tags || []).slice(0, 3).join(', ') || chalk.dim('—'),
          s.usage_count?.toString() || '0',
          s.is_builtin ? chalk.green('✓') : '',
        ]);
      });

      console.log(table.toString());
      console.log(chalk.dim(`  Showing ${list.length} of ${total} skills\n`));
    } catch (err: any) {
      spinner.fail('Failed to list skills');
      console.error(chalk.red(err.response?.data?.error || err.message));
    }
  });

skills
  .command('get <slug>')
  .description('Show details of a specific skill by slug')
  .action(async (slug: string) => {
    const opts = program.opts();
    const serverUrl = opts.url || process.env.TOOLHUB_URL || 'http://localhost:3000';

    try {
      const res = await axios.get(`${serverUrl}/skills/slug/${slug}`);
      const s   = res.data;

      console.log(chalk.bold.blue(`\n🧠 ${s.name}`) + chalk.dim(` v${s.version || '1.0.0'}`));
      console.log(chalk.cyan('ID:          ') + s.id);
      console.log(chalk.cyan('Slug:        ') + `/${s.slug}`);
      console.log(chalk.cyan('Author:      ') + (s.author || chalk.dim('—')));
      console.log(chalk.cyan('Status:      ') + (s.status === 'active' ? chalk.green(s.status) : chalk.yellow(s.status)));
      console.log(chalk.cyan('Built-in:    ') + (s.is_builtin ? chalk.green('Yes') : 'No'));
      console.log(chalk.cyan('Usage count: ') + s.usage_count);
      if (s.tags?.length > 0) {
        console.log(chalk.cyan('Tags:        ') + s.tags.join(', '));
      }
      console.log(chalk.cyan('Source:      ') + (s.source_path || chalk.dim('—')));
      console.log(`\n${chalk.italic(s.description)}\n`);

      if (s.raw_content) {
        console.log(chalk.bold('── SKILL.md Preview ──────────────────────────'));
        console.log(chalk.dim(s.raw_content.slice(0, 600)));
        if (s.raw_content.length > 600) console.log(chalk.dim('  … (truncated)'));
        console.log();
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        console.error(chalk.red(`\n❌ Skill '${slug}' not found`));
      } else {
        console.error(chalk.red('\n❌ Error:'), err.response?.data?.error || err.message);
      }
    }
  });

skills
  .command('index')
  .description('Trigger re-indexing of SKILLS_DIRS on the server (admin)')
  .action(async () => {
    const opts = program.opts();
    const serverUrl = opts.url || process.env.TOOLHUB_URL || 'http://localhost:3000';
    const spinner = ora('Triggering skills re-index on server...').start();

    try {
      const res = await axios.post(
        `${serverUrl}/skills/index`,
        {},
        { headers: { Authorization: `Bearer ${opts.token}` } }
      );
      spinner.succeed('Re-indexing started!');
      console.log(chalk.green(`\n✅ ${res.data.message}`));
      if (res.data.dirs?.length > 0) {
        console.log(chalk.dim('   Dirs: ' + res.data.dirs.join('\n         ')));
      }
      console.log();
    } catch (err: any) {
      spinner.fail('Re-index failed');
      if (err.response?.status === 401) {
        console.error(chalk.red('❌ Unauthorized — pass --token <admin_token>'));
      } else {
        console.error(chalk.red(err.response?.data?.error || err.message));
      }
    }
  });

program.parse(process.argv);
