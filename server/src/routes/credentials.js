const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { encrypt } = require('../services/security');

// POST /credentials — store encrypted API key
router.post('/', async (req, res) => {
  const { tool_id, operator_id, api_key, auth_type } = req.body;
  if (!tool_id || !operator_id || !api_key) {
    return res.status(400).json({ error: 'tool_id, operator_id, and api_key are required' });
  }
  const { rows: t } = await db.query('SELECT id FROM tools WHERE id = $1', [tool_id]);
  if (!t[0]) return res.status(404).json({ error: 'Tool not found' });

  try {
    const encrypted_key = encrypt(api_key);
    const key_hint      = api_key.length > 6 ? `${api_key.slice(0,3)}…${api_key.slice(-3)}` : '***';
    const { rows } = await db.query(
      `INSERT INTO credentials (tool_id, operator_id, encrypted_key, key_hint, auth_type)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tool_id, operator_id) DO UPDATE
         SET encrypted_key = $3, key_hint = $4, auth_type = $5, is_active = true
       RETURNING id, tool_id, operator_id, key_hint, auth_type, created_at`,
      [tool_id, operator_id, encrypted_key, key_hint, auth_type || 'api_key']
    );
    res.status(201).json({ credential: rows[0], message: '🔐 API key encrypted with AES-256-GCM and stored' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to store credential' });
  }
});

// GET /credentials/:tool_id — metadata only, key never exposed
router.get('/:tool_id', async (req, res) => {
  const { operator_id } = req.query;
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.tool_id, c.operator_id, c.key_hint, c.auth_type,
              c.is_active, c.last_used_at, c.created_at, t.name AS tool_name
       FROM credentials c JOIN tools t ON t.id = c.tool_id
       WHERE c.tool_id = $1 ${operator_id ? 'AND c.operator_id = $2' : ''}`,
      operator_id ? [req.params.tool_id, operator_id] : [req.params.tool_id]
    );
    res.json({ credentials: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list credentials' });
  }
});

// DELETE /credentials/:tool_id — revoke
router.delete('/:tool_id', async (req, res) => {
  const { operator_id = 'default' } = req.query;
  try {
    await db.query(
      `UPDATE credentials SET is_active = false WHERE tool_id = $1 AND operator_id = $2`,
      [req.params.tool_id, operator_id]
    );
    res.json({ message: 'Credential revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke credential' });
  }
});

module.exports = router;
