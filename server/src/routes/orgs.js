const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── GET /orgs ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM organizations ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

// ── POST /orgs ───────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, tier } = req.body;
  if (!name) return res.status(400).json({ error: 'Organization name is required' });

  try {
    await db.query('BEGIN');
    const { rows: orgRows } = await db.query(
      `INSERT INTO organizations (name, tier) VALUES ($1, $2) RETURNING *`,
      [name, tier || 'free']
    );
    const org = orgRows[0];

    // Create default quota
    const quota = tier === 'enterprise' ? 1000000 : tier === 'pro' ? 100000 : 10000;
    await db.query(
      `INSERT INTO org_quotas (org_id, monthly_calls) VALUES ($1, $2)`,
      [org.id, quota]
    );

    // Initial audit log
    await db.query(
      `INSERT INTO audit_logs (org_id, actor_id, action, resource, details) VALUES ($1, $2, $3, $4, $5)`,
      [org.id, 'system', 'org.created', 'organization', JSON.stringify({ tier: org.tier })]
    );

    await db.query('COMMIT');
    res.status(201).json(org);
  } catch (err) {
    await db.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: `Organization '${name}' already exists` });
    console.error(err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// ── GET /orgs/:id/members ────────────────────────────────────────────────────
router.get('/:id/members', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM org_members WHERE org_id = $1`, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

// ── POST /orgs/:id/members ───────────────────────────────────────────────────
router.post('/:id/members', async (req, res) => {
  const { user_id, role = 'viewer' } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = $3 RETURNING *`,
      [req.params.id, user_id, role]
    );

    await db.query(
      `INSERT INTO audit_logs (org_id, actor_id, action, resource, details) VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, 'system', 'member.added', 'org_members', JSON.stringify({ user_id, role })]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// ── GET /orgs/:id/quota ──────────────────────────────────────────────────────
router.get('/:id/quota', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM org_quotas WHERE org_id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Quota not found for organization' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quota' });
  }
});

// End of orgs router
module.exports = router;
