const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');
const logger = require('../logger');

// POST /pipelines
router.post('/', async (req, res) => {
  const { name, steps, org_id } = req.body;
  if (!name || !steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'name and steps (array) are required' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO pipelines (name, steps, org_id) VALUES ($1, $2, $3) RETURNING *`,
      [name, JSON.stringify(steps), org_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to create pipeline' });
  }
});

// GET /pipelines
router.get('/', async (req, res) => {
  const { org_id } = req.query;
  try {
    const query = org_id ? `SELECT * FROM pipelines WHERE org_id = $1` : `SELECT * FROM pipelines WHERE org_id IS NULL`;
    const params = org_id ? [org_id] : [];
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to fetch pipelines' });
  }
});

// Helper for template resolution
function resolveTemplate(templateObj, context) {
  let str = JSON.stringify(templateObj);
  str = str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const parts = path.split('.');
    let val = context;
    for (const p of parts) {
      if (val === undefined || val === null) break;
      val = val[p];
    }
    return val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : val) : match;
  });
  
  // Clean up potential double-quoting if an object was stringified inside a string
  try {
    return JSON.parse(str);
  } catch(e) {
    return str; // fallback if invalid JSON
  }
}

// POST /pipelines/:id/run
router.post('/:id/run', async (req, res) => {
  const { initialContext } = req.body;
  try {
    const { rows } = await db.query(`SELECT * FROM pipelines WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pipeline not found' });
    const pipeline = rows[0];

    const context = { initial: initialContext || {} };
    const results = [];
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

    // Forward headers for auth/quota/agent
    const headers = {
      'Content-Type': 'application/json',
      'x-operator-id': req.headers['x-operator-id'],
      'x-agent-id': req.headers['x-agent-id'],
    };
    if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];
      const stepName = step.name || `step${i+1}`;
      
      const args = resolveTemplate(step.args_template, context);
      
      try {
        const resp = await axios.post(`${baseUrl}/tools/${step.tool_id}/invoke`, args, { headers });
        context[stepName] = resp.data;
        results.push({ step: stepName, success: true, data: resp.data });
      } catch (err) {
        const errData = err.response ? err.response.data : err.message;
        results.push({ step: stepName, success: false, error: errData });
        break; // Stop pipeline on error
      }
    }

    res.json({ pipeline_id: pipeline.id, results, final_context: context });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to run pipeline', details: err.message });
  }
});

module.exports = router;
