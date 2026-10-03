/**
 * Skills Indexer Service
 *
 * Scans skill directories for SKILL.md files, parses YAML frontmatter,
 * upserts into the `skills` table, and stores vector embeddings.
 *
 * Usage:
 *   const { indexSkillsFromDirs, indexSingleSkill } = require('./skillsIndexer');
 *   await indexSkillsFromDirs(['C:\\Users\\moham\\.gemini\\config\\skills']);
 */

const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const { embedSkill } = require('./skillEmbeddings');

// ── YAML frontmatter parser (inline — avoids gray-matter dep if not installed) ─
// Falls back gracefully: tries gray-matter first, then a tiny built-in parser.

let _matter;
function getMatter() {
  if (_matter) return _matter;
  try {
    _matter = require('gray-matter');
  } catch {
    // Tiny built-in fallback
    _matter = (raw) => {
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) return { data: {}, content: raw };
      const lines   = fmMatch[1].split('\n');
      const data    = {};
      lines.forEach(line => {
        const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
        if (!m) return;
        let val = m[2].trim();
        // Parse arrays: [a, b, c]
        if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
        }
        data[m[1]] = val;
      });
      const content = raw.slice(fmMatch[0].length).trim();
      return { data, content };
    };
  }
  return _matter;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugToName(slug) {
  return slug
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractFirstSentence(text) {
  if (!text) return '';
  const clean = text.replace(/^#+.*$/m, '').trim();
  const m = clean.match(/^([^.!?\n]{10,200}[.!?])/);
  return m ? m[1].trim() : clean.slice(0, 120).trim();
}

function normalizeTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(/[,\s]+/).map(t => t.trim()).filter(Boolean);
  }
  return [];
}

// ── Parse a single SKILL.md file ─────────────────────────────────────────────

function parseSkillFile(filePath) {
  const raw     = fs.readFileSync(filePath, 'utf8');
  const matter  = getMatter();
  const { data: frontmatter, content } = matter(raw);

  const slug = path.basename(path.dirname(filePath));

  return {
    slug,
    name:        frontmatter.name        || slugToName(slug),
    description: frontmatter.description || extractFirstSentence(content),
    tags:        normalizeTags(frontmatter.tags),
    author:      frontmatter.author      || null,
    version:     frontmatter.version     || '1.0.0',
    frontmatter: frontmatter,
    raw_content: content,
    source_path: filePath,
  };
}

// ── Upsert one skill into DB + embed ─────────────────────────────────────────

async function upsertSkill(parsed, opts = {}) {
  const { isBuiltin = false, orgId = null } = opts;

  const { rows } = await db.query(
    `INSERT INTO skills
       (name, slug, description, source_path, tags, author, version,
        frontmatter, raw_content, status, is_builtin, org_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11)
     ON CONFLICT (slug) DO UPDATE SET
       name        = EXCLUDED.name,
       description = EXCLUDED.description,
       source_path = EXCLUDED.source_path,
       tags        = EXCLUDED.tags,
       author      = EXCLUDED.author,
       version     = EXCLUDED.version,
       frontmatter = EXCLUDED.frontmatter,
       raw_content = EXCLUDED.raw_content,
       is_builtin  = EXCLUDED.is_builtin,
       updated_at  = NOW()
     RETURNING id, slug`,
    [
      parsed.name,
      parsed.slug,
      parsed.description,
      parsed.source_path,
      parsed.tags,
      parsed.author,
      parsed.version,
      JSON.stringify(parsed.frontmatter),
      parsed.raw_content,
      isBuiltin,
      orgId,
    ]
  );

  const skillId   = rows[0].id;
  const embedText = `${parsed.name} ${parsed.description} ${parsed.tags.join(' ')}`;

  await embedSkill(skillId, embedText);
  return { id: skillId, slug: parsed.slug };
}

// ── Index a single SKILL.md by file path ─────────────────────────────────────

async function indexSingleSkill(skillMdPath, opts = {}) {
  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found: ${skillMdPath}`);
  }
  const parsed = parseSkillFile(skillMdPath);
  return upsertSkill(parsed, opts);
}

// ── Walk a directory tree and collect SKILL.md files ─────────────────────────

function findSkillFiles(rootDir) {
  const results = [];
  if (!fs.existsSync(rootDir)) return results;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(rootDir, entry.name, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      results.push(skillMd);
    }
  }
  return results;
}

// ── Index all skill directories ───────────────────────────────────────────────

async function indexSkillsFromDirs(dirs, opts = { isBuiltin: true }) {
  let indexed = 0;
  let failed  = 0;
  const errors = [];

  for (const dir of dirs) {
    const files = findSkillFiles(dir);
    console.log(`🔎 Found ${files.length} SKILL.md files in: ${dir}`);

    for (const file of files) {
      try {
        const { slug } = await indexSingleSkill(file, opts);
        indexed++;
        console.log(`   ✅  ${slug}`);
      } catch (err) {
        failed++;
        errors.push({ file, error: err.message });
        console.warn(`   ⚠️  Failed to index ${file}: ${err.message}`);
      }
    }
  }

  console.log(`\n📚 Skills indexing complete — ${indexed} indexed, ${failed} failed`);
  return { indexed, failed, errors };
}

module.exports = {
  indexSkillsFromDirs,
  indexSingleSkill,
  parseSkillFile,
};
