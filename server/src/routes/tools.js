const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { computeSecurityScore, MINIMUM_SECURITY_SCORE, diffSchemas } = require('../services/security');
const { embedTool, semanticSearch, getRelatedTools } = require('../services/embeddings');
const { generateInvokeToken, TOKEN_TTL } = require('../services/tokens');
const { decrypt } = require('../services/security');
const { fireWebhooks } = require('../services/webhooks');
const { checkQuota } = require('../middleware/quota');
const axios = require('axios');

// ── POST /tools/search  (must come before /:id) ───────────────────────────────
router.post('/search', async (req, res) => {
  const { query, limit = 5 } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });
  try {
    const results = await semanticSearch(query, Math.min(parseInt(limit) || 5, 20));
    res.json({ query, results, count: results.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── POST /tools ────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, description, category, json_schema, auth_type, endpoint_url, version, org_id, is_public } = req.body;
  if (!name || !description || !category) {
    return res.status(400).json({ error: 'name, description, and category are required' });
  }

  const score = computeSecurityScore({ auth_type: auth_type || 'none', json_schema, endpoint_url, version });
  if (score < MINIMUM_SECURITY_SCORE) {
    return res.status(422).json({
      error: `Security score ${score}/100 is below minimum threshold of ${MINIMUM_SECURITY_SCORE}`,
      score,
      tips: [
        (!auth_type || auth_type === 'none') && 'Add authentication (api_key, bearer_token, oauth)',
        (!json_schema || !Object.keys(json_schema).length) && 'Add a JSON schema for input validation',
        (!endpoint_url?.startsWith('https://')) && 'Use an HTTPS endpoint URL',
      ].filter(Boolean),
    });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO tools (name, description, category, json_schema, auth_type, endpoint_url, version, security_score, org_id, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, description, category, JSON.stringify(json_schema || {}),
       auth_type || 'none', endpoint_url, version || '1.0.0', score, org_id || null, is_public !== undefined ? is_public : true]
    );
    const tool = rows[0];

    // Bootstrap health summary row
    await db.query(
      `INSERT INTO tool_health_summary (tool_id, status) VALUES ($1,'unknown') ON CONFLICT DO NOTHING`,
      [tool.id]
    );

    // Initial version record
    await db.query(
      `INSERT INTO tool_versions (tool_id, version, schema, changelog, is_active) VALUES ($1,$2,$3,$4,true)`,
      [tool.id, tool.version, JSON.stringify(json_schema || {}), 'Initial version']
    );

    // Embed for semantic search
    await embedTool(tool.id, `${name} ${description}`);

    // Emit real-time creation event
    req.app.get('io').emit('tool_registered', {
      id: tool.id,
      name: tool.name,
      category: tool.category,
      created_at: tool.created_at
    });

    res.status(201).json({ tool, security_score: score });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Tool '${name}' already exists` });
    console.error(err);
    res.status(500).json({ error: 'Failed to register tool' });
  }
});

// ── GET /tools ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { category, auth_type, status = 'active', org_id, limit = 50, offset = 0, sort = 'usage_count' } = req.query;
  const conds  = ['t.status = $1'];
  const params = [status];
  let   i = 2;

  if (org_id) {
    conds.push(`t.org_id = $${i++}`); params.push(org_id);
  } else {
    // Marketplace view: hide private tools unless org is specified
    conds.push(`t.is_public = true`);
  }

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
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

// ── GET /tools/:id/related ─────────────────────────────────────────────────────
router.get('/:id/related', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const related = await getRelatedTools(req.params.id, Math.min(parseInt(limit) || 5, 20));
    res.json({ related, count: related.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch related tools' });
  }
});

// ── GET /tools/:id ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*,
              ths.status AS health_status, ths.uptime_percent, ths.avg_response_ms, ths.last_checked,
              (SELECT json_agg(v ORDER BY v.created_at DESC)
               FROM tool_versions v WHERE v.tool_id = t.id) AS versions
       FROM tools t
       LEFT JOIN tool_health_summary ths ON ths.tool_id = t.id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tool not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tool' });
  }
});

// ── PUT /tools/:id ─────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { description, json_schema, endpoint_url, version, status, is_public } = req.body;
  try {
    const { rows: existing } = await db.query('SELECT * FROM tools WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Tool not found' });
    const old = existing[0];

    const schemaDiff = json_schema ? diffSchemas(old.json_schema, json_schema) : null;

    const { rows } = await db.query(
      `UPDATE tools
       SET description  = COALESCE($1, description),
           json_schema  = COALESCE($2, json_schema),
           endpoint_url = COALESCE($3, endpoint_url),
           version      = COALESCE($4, version),
           status       = COALESCE($5, status),
           is_public    = COALESCE($6, is_public),
           updated_at   = NOW()
       WHERE id = $7 RETURNING *`,
      [description, json_schema ? JSON.stringify(json_schema) : null, endpoint_url, version, status, is_public, req.params.id]
    );

    // New version record
    if (version && version !== old.version) {
      await db.query(`UPDATE tool_versions SET is_active = false WHERE tool_id = $1`, [req.params.id]);
      await db.query(
        `INSERT INTO tool_versions (tool_id, version, schema, changelog, is_active) VALUES ($1,$2,$3,$4,true)`,
        [req.params.id, version, JSON.stringify(json_schema || old.json_schema),
         schemaDiff ? (schemaDiff.isBreaking ? '⚠️ Breaking changes' : '✅ Non-breaking changes') : 'Version bump']
      );
    }

    // Re-embed if description changed
    if (description) await embedTool(req.params.id, `${old.name} ${description}`);

    // Fire webhooks on breaking schema change
    if (schemaDiff?.isBreaking) {
      fireWebhooks(req.params.id, 'schema_change', { version, diff: schemaDiff }).catch(() => {});
    }

    res.json({ tool: rows[0], schema_diff: schemaDiff });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

// ── GET /tools/:id/health ──────────────────────────────────────────────────────
router.get('/:id/health', async (req, res) => {
  try {
    const [summary, history] = await Promise.all([
      db.query(
        `SELECT t.name, t.status, ths.*
         FROM tools t
         LEFT JOIN tool_health_summary ths ON ths.tool_id = t.id
         WHERE t.id = $1`,
        [req.params.id]
      ),
      db.query(
        `SELECT status, response_ms, error_message, schema_valid, checked_at
         FROM tool_health WHERE tool_id = $1 ORDER BY checked_at DESC LIMIT 20`,
        [req.params.id]
      ),
    ]);
    if (!summary.rows[0]) return res.status(404).json({ error: 'Tool not found' });
    res.json({ ...summary.rows[0], recent_checks: history.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch health' });
  }
});

// ── GET /tools/:id/invoke-config ───────────────────────────────────────────────
router.get('/:id/invoke-config', async (req, res) => {
  const operatorId = req.query.operator_id || req.headers['x-operator-id'] || 'default';
  try {
    const { rows: toolRows } = await db.query(
      `SELECT id, name, auth_type, endpoint_url, json_schema FROM tools WHERE id = $1 AND status = 'active'`,
      [req.params.id]
    );
    if (!toolRows[0]) return res.status(404).json({ error: 'Tool not found or not active' });

    // Look up credential for this operator
    const { rows: credRows } = await db.query(
      `SELECT encrypted_key, auth_type FROM credentials WHERE tool_id = $1 AND operator_id = $2 AND is_active = true`,
      [req.params.id, operatorId]
    );
    if (!credRows[0]) return res.status(404).json({ error: `No credential registered for operator '${operatorId}'` });

    // Decrypt and embed in short-lived JWT (agent gets token, never raw key)
    const rawKey = decrypt(credRows[0].encrypted_key);
    const token  = generateInvokeToken(req.params.id, operatorId);

    // Update last_used
    await db.query(
      `UPDATE credentials SET last_used_at = NOW() WHERE tool_id = $1 AND operator_id = $2`,
      [req.params.id, operatorId]
    );

    res.json({
      tool_id:      toolRows[0].id,
      tool_name:    toolRows[0].name,
      endpoint_url: toolRows[0].endpoint_url,
      auth_type:    credRows[0].auth_type,
      json_schema:  toolRows[0].json_schema,
      invoke_token: token,
      expires_in:   TOKEN_TTL,
      // NOTE: raw_key returned for agent convenience — in production route through a proxy
      // so agents never touch keys. Set PROXY_MODE=true to omit this field.
      ...(process.env.PROXY_MODE !== 'true' && { api_key: rawKey }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to issue invoke config' });
  }
});

// ── POST /tools/:id/invoke ──────────────────────────────────────────────────
router.post('/:id/invoke', checkQuota, async (req, res) => {
  const operatorId = req.headers['x-operator-id'] || 'default';
  const agentId    = req.headers['x-agent-id']    || 'unknown';
  const payload    = req.body;
  const startTime  = Date.now();

  try {
    // 1. Fetch tool config
    const { rows: toolRows } = await db.query(
      `SELECT id, name, auth_type, endpoint_url, json_schema, org_id FROM tools WHERE id = $1 AND status = 'active'`,
      [req.params.id]
    );
    if (!toolRows[0]) return res.status(404).json({ error: 'Tool not found or not active' });
    const tool = toolRows[0];

    // 2. Fetch & decrypt credentials
    const { rows: credRows } = await db.query(
      `SELECT encrypted_key FROM credentials WHERE tool_id = $1 AND operator_id = $2 AND is_active = true`,
      [tool.id, operatorId]
    );

    const headers = { 'Content-Type': 'application/json', 'X-ToolHub-Agent': agentId };
    if (credRows[0]) {
      const rawKey = decrypt(credRows[0].encrypted_key);
      if (tool.auth_type === 'api_key') headers['X-API-Key'] = rawKey;
      else if (tool.auth_type === 'bearer_token') headers['Authorization'] = `Bearer ${rawKey}`;
    }

    // 3. Proxy the request
    let response;
    let success = true;
    let errorType = null;
    let errorMessage = null;

    if (!tool.endpoint_url) {
      // Stub mode
      response = { data: { message: `Stub response for ${tool.name}`, params: payload } };
    } else {
      try {
        response = await axios.post(tool.endpoint_url, payload, { headers, timeout: 10000 });
      } catch (err) {
        success = false;
        errorType = err.response ? 'upstream_error' : 'network_timeout';
        errorMessage = err.message;
        response = err.response || { status: 500, data: { error: err.message } };
      }
    }

    const latency = Date.now() - startTime;

    // 4. Record the call (Observability)
    await db.query(
       `INSERT INTO tool_calls (tool_id, agent_id, latency_ms, success, error_type, error_message)
        VALUES ($1,$2,$3,$4,$5,$6)`,
       [tool.id, agentId, latency, success, errorType, errorMessage]
    );

    // Increment usage count & quota
    await db.query(`UPDATE tools SET usage_count = usage_count + 1 WHERE id = $1`, [tool.id]);
    if (tool.org_id) {
      await db.query(`UPDATE org_quotas SET calls_used = calls_used + 1 WHERE org_id = $1`, [tool.org_id]);
    }

    // Process real-time event
    req.app.get('io').emit('live_call', {
      tool_id: tool.id,
      tool_name: tool.name,
      agent_id: agentId,
      success,
      latency_ms: latency,
      error_type: errorType,
      timestamp: new Date()
    });

    res.status(response.status || 200).json(response.data);

  } catch (err) {
    console.error(`Tool invoke failed:`, err);
    res.status(500).json({ error: 'Tool invocation failed', message: err.message });
  }
});

module.exports = router;
