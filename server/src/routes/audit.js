const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── GET /audit/orgs/:id ──────────────────────────────────────────────────────
router.get('/orgs/:id', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const { rows } = await db.query(
      `SELECT * FROM audit_logs WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    res.json({ logs: rows, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ── GET /audit/global ────────────────────────────────────────────────────────
// Require admin token for global audit logs
router.get('/global', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { rows } = await db.query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ logs: rows, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch global audit logs' });
  }
});

module.exports = router;
