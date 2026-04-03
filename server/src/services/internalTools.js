const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const axios = require('axios');

const WORKSPACE_ROOT =
  process.env.TOOLHUB_WORKSPACE_ROOT ||
  path.resolve(__dirname, '..', '..', '..'); // server/src/services -> ToolsHub/

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
]);

function toRelWorkspacePath(absPath) {
  const rel = path.relative(WORKSPACE_ROOT, absPath);
  if (!rel || rel.trim().length === 0) return '.';
  // Keep paths readable in UI / LLM context.
  return rel.split(path.sep).join('/');
}

function resolveWorkspacePath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim().length === 0) {
    throw new Error('path must be a non-empty string');
  }

  const candidate = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(WORKSPACE_ROOT, inputPath);

  const resolved = path.resolve(candidate);
  const rootWithSep = WORKSPACE_ROOT.endsWith(path.sep)
    ? WORKSPACE_ROOT
    : WORKSPACE_ROOT + path.sep;

  // Prevent directory traversal outside the workspace root.
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error('path is outside the workspace root');
  }
  return resolved;
}

function isProbablyBinary(buffer) {
  // Heuristic: null bytes usually indicate binary.
  // Also skip very large buffers upstream via max_file_bytes.
  for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function runGit(args, maxChars = 20000) {
  const result = spawnSync('git', args, {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024, // 1MB hard cap for safety
  });

  if (result.error) {
    throw new Error(`git execution failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString();
    throw new Error(`git failed (exit ${result.status}): ${stderr.slice(0, 300)}`);
  }
  const out = (result.stdout || '').toString();
  return out.length > maxChars ? out.slice(0, maxChars) + '\n...[truncated]' : out;
}

function listDir({ absPath, recursive, maxItems }) {
  const items = [];
  const queue = [{ absPath, relPath: toRelWorkspacePath(absPath) || '.' }];
  let truncated = false;

  while (queue.length > 0) {
    const cur = queue.pop();
    const entries = fs.readdirSync(cur.absPath, { withFileTypes: true });

    for (const ent of entries) {
      if (items.length >= maxItems) {
        truncated = true;
        break;
      }

      const entryAbs = path.join(cur.absPath, ent.name);
      const entryRel = cur.relPath === '.'
        ? ent.name
        : path.join(cur.relPath, ent.name).split(path.sep).join('/');

      if (IGNORE_DIRS.has(ent.name) || (ent.isDirectory() && ent.name === '.git')) {
        continue;
      }

      const stat = fs.statSync(entryAbs);
      items.push({
        path: entryRel,
        type: ent.isDirectory() ? 'dir' : 'file',
        size: ent.isFile() ? stat.size : null,
        mtime_ms: ent.isFile() || ent.isDirectory() ? stat.mtimeMs : null,
      });

      if (recursive && ent.isDirectory()) {
        queue.push({ absPath: entryAbs, relPath: entryRel });
      }
    }

    if (truncated) break;
  }

  return { items, count: items.length, truncated, workspace_root: WORKSPACE_ROOT };
}

function workspaceSearchText({
  baseAbsPath,
  pattern,
  useRegex,
  ignoreCase,
  maxResults,
  maxFileBytes,
  maxFiles,
}) {
  const matches = [];
  let fileCount = 0;
  let truncated = false;

  let re = null;
  if (useRegex) {
    const flags = ignoreCase ? 'ig' : 'g';
    try {
      re = new RegExp(pattern, flags);
    } catch (err) {
      throw new Error(`invalid regex pattern: ${err.message}`);
    }
  }

  const stack = [baseAbsPath];
  while (stack.length > 0) {
    if (fileCount >= maxFiles) break;
    const curDir = stack.pop();
    if (!fs.existsSync(curDir)) continue;

    const entries = fs.readdirSync(curDir, { withFileTypes: true });
    for (const ent of entries) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }

      // Skip directories we know are noise.
      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name)) continue;
        stack.push(path.join(curDir, ent.name));
        continue;
      }

      if (!ent.isFile()) continue;

      fileCount++;
      const fileAbs = path.join(curDir, ent.name);
      let stat;
      try {
        stat = fs.statSync(fileAbs);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.size > maxFileBytes) continue;

      let buf;
      try {
        buf = fs.readFileSync(fileAbs);
      } catch {
        continue;
      }

      if (isProbablyBinary(buf)) continue;

      let text;
      try {
        text = buf.toString('utf8');
      } catch {
        continue;
      }

      const rel = toRelWorkspacePath(fileAbs);
      const lines = text.split(/\r?\n/);
      const needle = ignoreCase ? pattern.toLowerCase() : pattern;

      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxResults) {
          truncated = true;
          break;
        }
        const line = lines[i] ?? '';
        if (useRegex) {
          re.lastIndex = 0;
          if (re.test(line)) {
            matches.push({
              path: rel,
              line_number: i + 1,
              line: line.slice(0, 500),
            });
          }
        } else {
          const hay = ignoreCase ? line.toLowerCase() : line;
          if (hay.includes(needle)) {
            matches.push({
              path: rel,
              line_number: i + 1,
              line: line.slice(0, 500),
            });
          }
        }
      }

      if (truncated) break;
    }

    if (truncated) break;
  }

  return { matches, truncated, searched_files: fileCount, workspace_root: WORKSPACE_ROOT };
}

async function wikiSearch(payload) {
  const query = payload?.query;
  const limit = Math.min(Number(payload?.limit ?? 5), 20);
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('query is required');
  }

  if (process.env.TOOLHUB_ALLOW_OUTBOUND_HTTP !== 'true') {
    throw new Error('Outbound HTTP is disabled (set TOOLHUB_ALLOW_OUTBOUND_HTTP=true).');
  }

  const url = 'https://en.wikipedia.org/w/api.php';
  const resp = await axios.get(url, {
    timeout: 10000,
    params: {
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      srlimit: limit,
    },
    headers: { 'User-Agent': 'ToolHub/1.0 (for agent tool execution)' },
  });

  const results = resp?.data?.query?.search || [];
  return {
    query,
    limit,
    results: results.map(r => ({
      pageid: r.pageid,
      title: r.title,
      snippet: (r.snippet || '').replace(/<[^>]+>/g, ''),
      url: `https://en.wikipedia.org/?curid=${r.pageid}`,
    })),
  };
}

async function invokeInternalTool(toolName, payload) {
  switch (toolName) {
    case 'workspace_read_file': {
      const p = resolveWorkspacePath(payload?.path);
      const maxBytes = Math.min(Number(payload?.max_bytes ?? 200000), 2_000_000);
      const stat = fs.statSync(p);
      if (!stat.isFile()) throw new Error('path is not a file');
      if (stat.size > maxBytes) {
        return {
          path: toRelWorkspacePath(p),
          size: stat.size,
          truncated: true,
          content: fs.readFileSync(p).slice(0, maxBytes).toString('utf8'),
        };
      }
      const content = fs.readFileSync(p).toString('utf8');
      return { path: toRelWorkspacePath(p), size: stat.size, truncated: false, content };
    }

    case 'workspace_list_dir': {
      const rel = typeof payload?.path === 'string' ? payload.path : '.';
      const p = resolveWorkspacePath(rel);
      const recursive = Boolean(payload?.recursive ?? false);
      const maxItems = Math.min(Number(payload?.max_items ?? 200), 5000);
      const stat = fs.statSync(p);
      if (!stat.isDirectory()) throw new Error('path is not a directory');
      return listDir({ absPath: p, recursive, maxItems });
    }

    case 'workspace_search': {
      const pattern = payload?.pattern;
      if (typeof pattern !== 'string' || pattern.trim().length === 0) {
        throw new Error('pattern is required');
      }
      const relPath = typeof payload?.path === 'string' && payload.path.trim().length > 0
        ? payload.path
        : '.';
      const baseAbs = resolveWorkspacePath(relPath);
      const useRegex = Boolean(payload?.use_regex ?? false);
      const ignoreCase = Boolean(payload?.ignore_case ?? true);
      const maxResults = Math.min(Number(payload?.max_results ?? 20), 200);
      const maxFileBytes = Math.min(Number(payload?.max_file_bytes ?? 200000), 2_000_000);
      const maxFiles = Math.min(Number(payload?.max_files ?? 5000), 50000);
      const stat = fs.statSync(baseAbs);
      if (!stat.isDirectory()) throw new Error('path must be a directory');
      return workspaceSearchText({
        baseAbsPath: baseAbs,
        pattern,
        useRegex,
        ignoreCase,
        maxResults,
        maxFileBytes,
        maxFiles,
      });
    }

    case 'git_status': {
      const cwdSubdir = typeof payload?.path === 'string' && payload.path.trim().length > 0
        ? payload.path
        : '.';
      const target = resolveWorkspacePath(cwdSubdir);
      if (!fs.statSync(target).isDirectory()) throw new Error('path must be a directory');
      const args = ['-C', toRelWorkspacePath(target), 'status', '--porcelain=v1'];
      return { workspace_root: WORKSPACE_ROOT, status: runGit(args, payload?.max_chars ?? 20000) };
    }

    case 'git_diff': {
      const maxChars = Math.min(Number(payload?.max_chars ?? 20000), 200000);
      const filePath = typeof payload?.path === 'string' && payload.path.trim().length > 0
        ? payload.path
        : null;

      // Note: -C expects a path relative to cwd. We already run from WORKSPACE_ROOT,
      // so we can pass file paths as-is (relative) for diff.
      const args = ['diff', '--patch', '--no-color'];
      if (filePath) args.push('--', filePath);
      const out = runGit(args, maxChars);
      return { path: filePath, diff: out, truncated: out.includes('[truncated]') };
    }

    case 'web_search':
    case 'wiki_search': {
      return wikiSearch(payload || {});
    }

    default: {
      return {
        message: `No internal handler for '${toolName}'.`,
        params: payload,
        workspace_root: WORKSPACE_ROOT,
      };
    }
  }
}

module.exports = { invokeInternalTool };

