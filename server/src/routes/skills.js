/**
 * Skills Routes — /skills
 *
 * GET    /skills              List skills (public)
 * GET    /skills/slug/:slug   Get by slug (public)
 * GET    /skills/:id          Get by ID (public)
 * POST   /skills/search       Semantic search (public)
 * GET    /skills/:id/related  Related skills (public)
 * POST   /skills              Register skill manually (auth)
 * PUT    /skills/:id          Update skill metadata (auth)
 * DELETE /skills/:id          Remove skill (auth)
 * POST   /skills/:id/invoke   Increment usage_count (auth)
 * POST   /skills/index        Trigger re-index from configured dirs (auth)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth }            = require('../middleware/auth');
const { skillSemanticSearch,
        getRelatedSkills,
        embedSkill }             = require('../services/skillEmbeddings');
const { indexSkillsFromDirs,
        indexSingleSkill }       = require('../services/skillsIndexer');

// ── POST /skills/search  (must come before /:id) ──────────────────────────────
router.post('/search', async (req, res) => {
  const { query, limit = 5 } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });
  try {
    const results = await skillSemanticSearch(query, Math.min(parseInt(limit) || 5, 20));
    res.json({ query, results, count: results.length });
  } catch (err) {
    console.error('[skills/search]', err);
    res.status(500).json({ error: 'Semantic search failed' });
  }
});

// ── POST /skills/index  (trigger re-index — admin only) ──────────────────────
router.post('/index', requireAuth, async (req, res) => {
  const dirs = (process.env.SKILLS_DIRS || '').split(';').filter(Boolean);
  if (dirs.length === 0) {
    return res.status(400).json({
      error: 'SKILLS_DIRS environment variable is not configured',
    });
  }
  try {
    // Run indexing in background — respond immediately
    res.json({ message: 'Skills re-indexing started', dirs });
    await indexSkillsFromDirs(dirs).catch(err =>
      console.error('[skills/index] background error:', err.message)
    );
  } catch (err) {
    console.error('[skills/index]', err);
    res.status(500).json({ error: 'Failed to start re-indexing' });
  }
});

// ── POST /skills  (manual register) ──────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { name, slug, description, tags = [], author, version = '1.0.0',
          raw_content, source_path } = req.body;
  if (!name || !slug || !description) {
    return res.status(400).json({ error: 'name, slug, and description are required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO skills (name, slug, description, tags, author, version, raw_content, source_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [name, slug, description, tags, author, version, raw_content, source_path]
    );
    const skill = rows[0];
    await embedSkill(skill.id, `${name} ${description} ${tags.join(' ')}`);
    res.status(201).json({ skill });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Skill with slug '${slug}' already exists` });
    }
    console.error('[skills POST]', err);
    res.status(500).json({ error: 'Failed to register skill' });
  }
});

// ── GET /skills  (list with filters) ─────────────────────────────────────────
router.get('/', async (req, res) => {
  const { status = 'active', tags, is_builtin, limit = 50, offset = 0 } = req.query;
  const conds  = ['s.status = $1'];
  const params = [status];
  let i = 2;

  if (is_builtin !== undefined) {
    conds.push(`s.is_builtin = $${i++}`);
    params.push(is_builtin === 'true');
  }
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      conds.push(`s.tags && $${i++}`);
      params.push(tagList);
    }
  }

  try {
    const [data, total] = await Promise.all([
      db.query(
        `SELECT s.id, s.name, s.slug, s.description, s.tags, s.author,
                s.version, s.status, s.usage_count, s.is_builtin,
                s.frontmatter, s.created_at, s.updated_at
         FROM skills s
         WHERE ${conds.join(' AND ')}
         ORDER BY s.usage_count DESC, s.name ASC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, parseInt(limit), parseInt(offset)]
      ),
      db.query(
        `SELECT COUNT(*) FROM skills s WHERE ${conds.join(' AND ')}`,
        params
      ),
    ]);
    res.json({
      skills: data.rows,
      total:  parseInt(total.rows[0].count),
      limit:  parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error('[skills GET /]', err);
    res.status(500).json({ error: 'Failed to list skills' });
  }
});

// ── GET /skills/slug/:slug ───────────────────────────────────────────────────
router.get('/slug/:slug', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, se.embedded_text
       FROM skills s
       LEFT JOIN skill_embeddings se ON s.id = se.skill_id
       WHERE s.slug = $1`,
      [req.params.slug]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: `Skill '${req.params.slug}' not found` });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[skills GET /slug]', err);
    res.status(500).json({ error: 'Failed to get skill' });
  }
});

// ── GET /skills/:id/related ──────────────────────────────────────────────────
router.get('/:id/related', async (req, res) => {
  const { limit = 5 } = req.query;
  try {
    const related = await getRelatedSkills(req.params.id, Math.min(parseInt(limit) || 5, 20));
    res.json({ related, count: related.length });
  } catch (err) {
    console.error('[skills GET related]', err);
    res.status(500).json({ error: 'Failed to get related skills' });
  }
});

// ── GET /skills/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, se.embedded_text
       FROM skills s
       LEFT JOIN skill_embeddings se ON s.id = se.skill_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[skills GET /:id]', err);
    res.status(500).json({ error: 'Failed to get skill' });
  }
});

// ── PUT /skills/:id ──────────────────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  const { name, description, tags, author, version, status, raw_content } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE skills SET
         name        = COALESCE($1, name),
         description = COALESCE($2, description),
         tags        = COALESCE($3, tags),
         author      = COALESCE($4, author),
         version     = COALESCE($5, version),
         status      = COALESCE($6, status),
         raw_content = COALESCE($7, raw_content),
         updated_at  = NOW()
       WHERE id = $8
       RETURNING *`,
      [name, description, tags, author, version, status, raw_content, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Skill not found' });

    const skill = rows[0];
    // Re-embed if name/description/tags changed
    if (name || description || tags) {
      await embedSkill(
        skill.id,
        `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')}`
      ).catch(() => {});
    }
    res.json({ skill });
  } catch (err) {
    console.error('[skills PUT]', err);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// ── DELETE /skills/:id ───────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM skills WHERE id = $1 RETURNING id, slug',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Skill not found' });
    res.json({ deleted: true, slug: rows[0].slug });
  } catch (err) {
    console.error('[skills DELETE]', err);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// ── POST /skills/:id/invoke  (increment usage) ───────────────────────────────
router.post('/:id/invoke', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE skills SET usage_count = usage_count + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id, slug, usage_count`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Skill not found' });
    res.json({ success: true, ...rows[0] });
  } catch (err) {
    console.error('[skills POST invoke]', err);
    res.status(500).json({ error: 'Failed to invoke skill' });
  }
});

module.exports = router;
