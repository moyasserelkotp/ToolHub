const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../db');

// POST /webhooks
router.post('/', async (req, res) => {
  const { tool_id, agent_id, callback_url, events } = req.body;
  if (!tool_id || !agent_id || !callback_url) {
    return res.status(400).json({ error: 'tool_id, agent_id, and callback_url are required' });
  }
  try {
    const secret = crypto.randomBytes(20).toString('hex');
    const { rows } = await db.query(
      `INSERT INTO webhooks (tool_id, agent_id, callback_url, events, secret)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tool_id, agent_id, callback_url, events || ['degraded','schema_change','restored'], secret]
    );
    res.status(201).json({ webhook: rows[0], note: 'Store the secret — it will not be shown again' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});

// GET /webhooks
router.get('/', async (req, res) => {
  const { agent_id } = req.query;
  try {
    const { rows } = await db.query(
      `SELECT w.id, w.tool_id, t.name AS tool_name, w.agent_id, w.callback_url,
              w.events, w.is_active, w.created_at
       FROM webhooks w JOIN tools t ON t.id = w.tool_id
       WHERE ($1::text IS NULL OR w.agent_id = $1) AND w.is_active = true`,
      [agent_id || null]
    );
    res.json({ webhooks: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

// DELETE /webhooks/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`UPDATE webhooks SET is_active = false WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Webhook deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

module.exports = router;
