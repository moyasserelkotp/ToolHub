const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── GET /marketplace/tools ───────────────────────────────────────────────────
// Discover public tools across all organizations
router.get('/tools', async (req, res) => {
  const { category, auth_type, limit = 50, offset = 0, sort = 'usage_count' } = req.query;
  
  // Enforce public only, active only
  const conds  = ['t.status = $1', 't.is_public = true'];
  const params = ['active'];
  let   i = 2;

  if (category)  { conds.push(`t.category = $${i++}`);  params.push(category); }
  if (auth_type) { conds.push(`t.auth_type = $${i++}`); params.push(auth_type); }

  const SAFE_SORT = { usage_count: 'DESC', security_score: 'DESC', name: 'ASC', created_at: 'DESC' };
  const dir = SAFE_SORT[sort] || 'DESC';
  const col = SAFE_SORT[sort] !== undefined ? sort : 'usage_count';

  try {
    const [data, total] = await Promise.all([
      db.query(
        `SELECT t.*, ths.status AS health_status, ths.uptime_percent, ths.last_checked
         FROM tools t
         LEFT JOIN tool_health_summary ths ON ths.tool_id = t.id
         WHERE ${conds.join(' AND ')}
         ORDER BY t.${col} ${dir}
         LIMIT $${i} OFFSET $${i+1}`,
        [...params, parseInt(limit), parseInt(offset)]
      ),
      db.query(`SELECT COUNT(*) FROM tools t WHERE ${conds.join(' AND ')}`, params),
    ]);
    res.json({ tools: data.rows, total: parseInt(total.rows[0].count), limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list marketplace tools' });
  }
});

// ── GET /marketplace/trending ────────────────────────────────────────────────
// Get top tools across the entire platform
router.get('/trending', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.category, t.usage_count, t.security_score, ths.status as health_status
       FROM tools t
       LEFT JOIN tool_health_summary ths ON ths.tool_id = t.id
       WHERE t.status = 'active' AND t.is_public = true
       ORDER BY t.usage_count DESC
       LIMIT 10`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trending tools' });
  }
});

module.exports = router;
