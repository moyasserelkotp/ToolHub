const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── POST /collections ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, description, created_by } = req.body;
  
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO tool_collections (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, description || null, created_by || 'system']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Collection '${name}' already exists` });
    console.error(err);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

// ── GET /collections ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  try {
    const { rows } = await db.query(
      `SELECT c.*, COUNT(ct.tool_id) as tool_count
       FROM tool_collections c
       LEFT JOIN collection_tools ct ON c.id = ct.collection_id
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    res.json({ collections: rows, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

// ── GET /collections/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [collectionRes, toolsRes] = await Promise.all([
      db.query(`SELECT * FROM tool_collections WHERE id = $1`, [req.params.id]),
      db.query(
        `SELECT t.*, ct.added_at 
         FROM tools t
         JOIN collection_tools ct ON t.id = ct.tool_id
         WHERE ct.collection_id = $1
         ORDER BY ct.added_at DESC`,
        [req.params.id]
      )
    ]);

    if (!collectionRes.rows[0]) return res.status(404).json({ error: 'Collection not found' });
    
    res.json({
      ...collectionRes.rows[0],
      tools: toolsRes.rows,
      tool_count: toolsRes.rows.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

// ── POST /collections/:id/tools ──────────────────────────────────────────────
router.post('/:id/tools', async (req, res) => {
  const { tool_ids } = req.body; // Array of UUIDs
  
  if (!Array.isArray(tool_ids) || tool_ids.length === 0) {
    return res.status(400).json({ error: 'tool_ids array is required and must not be empty' });
  }

  try {
    // Check collection exists
    const collRes = await db.query('SELECT 1 FROM tool_collections WHERE id = $1', [req.params.id]);
    if (collRes.rows.length === 0) return res.status(404).json({ error: 'Collection not found' });

    let addedCount = 0;
    for (const toolId of tool_ids) {
      try {
        await db.query(`INSERT INTO collection_tools (collection_id, tool_id) VALUES ($1, $2)`, [req.params.id, toolId]);
        addedCount++;
      } catch (e) {
        // Ignore 23505 duplicate keys or foreign key errors (tool doesn't exist)
      }
    }

    res.json({ message: `Successfully added ${addedCount} tools out of ${tool_ids.length} requested` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add tools to collection' });
  }
});

// ── DELETE /collections/:id/tools/:tool_id ───────────────────────────────────
router.delete('/:id/tools/:tool_id', async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM collection_tools WHERE collection_id = $1 AND tool_id = $2`,
      [req.params.id, req.params.tool_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Tool not found in collection' });
    res.json({ message: 'Tool removed from collection' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove tool from collection' });
  }
});

module.exports = router;
