/**
 * Skill Embeddings — mirrors embeddings.js but targets skill_embeddings / skills tables
 *
 * Scoring: 70% semantic similarity + 30% log(usage_count)
 */

const db    = require('../db');
const cache = require('./cache');
const { computeEmbedding } = require('./embeddings'); // reuse provider router

// ── Cache helpers ─────────────────────────────────────────────────────────────

const cacheKey = (id) => `toolhub:skill:emb:${id}`;

// ── Persist & cache a skill embedding ─────────────────────────────────────────

async function embedSkill(skillId, text) {
  const embedding = await computeEmbedding(text);
  await cache.set(cacheKey(skillId), embedding);
  try {
    await db.query(
      `INSERT INTO skill_embeddings (skill_id, embedding, embedded_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (skill_id)
       DO UPDATE SET embedding = $2, embedded_text = $3, created_at = NOW()`,
      [skillId, embedding, text]
    );
  } catch (err) {
    console.warn('[skillEmbeddings] Could not persist embedding:', err.message);
  }
  return embedding;
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma  += a[i] * a[i];
    mb  += b[i] * b[i];
  }
  const denom = Math.sqrt(ma) * Math.sqrt(mb);
  return denom > 0 ? dot / denom : 0;
}

// ── Score a batch of skill rows ───────────────────────────────────────────────

async function _scoreSkills(rows, qVec) {
  const scored = await Promise.all(rows.map(async skill => {
    let emb = skill.embedding || await cache.get(cacheKey(skill.id));
    if (!emb) {
      const text = `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')}`;
      emb = await computeEmbedding(text);
      await cache.set(cacheKey(skill.id), emb);
    }
    const sem   = cosineSimilarity(qVec, emb);
    const usage = skill.usage_count > 0 ? Math.log1p(skill.usage_count) / 15 : 0;
    const score = sem * 0.70 + Math.min(usage, 1) * 0.30;
    return {
      ...skill,
      embedding:      undefined,
      semantic_score: +sem.toFixed(3),
      score:          +score.toFixed(3),
    };
  }));
  return scored.sort((a, b) => b.score - a.score);
}

// ── Warm cache on startup ─────────────────────────────────────────────────────

async function loadSkillEmbeddings() {
  try {
    const { rows } = await db.query('SELECT skill_id, embedding FROM skill_embeddings');
    await Promise.all(rows.map(r => cache.set(cacheKey(r.skill_id), r.embedding)));
    console.log(`📐 Loaded ${rows.length} skill embeddings into cache`);
  } catch (err) {
    console.warn('[skillEmbeddings] Could not load embeddings:', err.message);
  }
}

// ── Semantic search across skills ─────────────────────────────────────────────

async function skillSemanticSearch(query, topK = 5) {
  const qVec = await computeEmbedding(query);

  const { rows } = await db.query(
    `SELECT s.id, s.name, s.slug, s.description, s.tags, s.author,
            s.version, s.status, s.usage_count, s.is_builtin, s.frontmatter,
            se.embedding
     FROM skills s
     LEFT JOIN skill_embeddings se ON s.id = se.skill_id
     WHERE s.status = 'active'`
  );

  const scored = await _scoreSkills(rows, qVec);
  return scored.slice(0, topK);
}

// ── Related skills by embedding ───────────────────────────────────────────────

async function getRelatedSkills(skillId, topK = 5) {
  let qVec = await cache.get(cacheKey(skillId));

  if (!qVec) {
    const { rows } = await db.query(
      'SELECT embedding FROM skill_embeddings WHERE skill_id = $1',
      [skillId]
    );
    if (rows.length > 0 && rows[0].embedding) {
      qVec = rows[0].embedding;
      await cache.set(cacheKey(skillId), qVec);
    } else {
      const { rows: sr } = await db.query(
        'SELECT name, description, tags FROM skills WHERE id = $1',
        [skillId]
      );
      if (sr.length === 0) return [];
      const text = `${sr[0].name} ${sr[0].description} ${(sr[0].tags || []).join(' ')}`;
      qVec = await computeEmbedding(text);
      await cache.set(cacheKey(skillId), qVec);
    }
  }

  const { rows } = await db.query(
    `SELECT s.id, s.name, s.slug, s.description, s.tags, s.author,
            s.version, s.status, s.usage_count, s.is_builtin, s.frontmatter,
            se.embedding
     FROM skills s
     LEFT JOIN skill_embeddings se ON s.id = se.skill_id
     WHERE s.status = 'active' AND s.id != $1`,
    [skillId]
  );

  const scored = await _scoreSkills(rows, qVec);
  return scored.slice(0, topK);
}

module.exports = {
  embedSkill,
  loadSkillEmbeddings,
  skillSemanticSearch,
  getRelatedSkills,
};
