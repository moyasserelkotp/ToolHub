const db = require('../db');

function analyticsMiddleware(req, res, next) {
  const start = Date.now();
  const orig  = res.json.bind(res);

  res.json = function(data) {
    const ms      = Date.now() - start;
    const ok      = res.statusCode < 400;
    const agentId = req.headers['x-agent-id'] || req.query.agent_id || null;

    // Log every POST/GET that touches a tool (search, invoke-config, direct calls)
    const m = req.path.match(/^\/tools\/([0-9a-f-]{36})/i);
    if (m && (req.method !== 'GET' || req.path.includes('invoke-config'))) {
      db.query(
        `INSERT INTO tool_calls (tool_id, agent_id, latency_ms, success, error_type, error_message)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [m[1], agentId, ms, ok, ok ? null : (data?.error || 'unknown'), ok ? null : JSON.stringify(data)]
      ).catch(() => {});

      if (ok) db.query(`UPDATE tools SET usage_count = usage_count + 1 WHERE id = $1`, [m[1]]).catch(() => {});
    }
    return orig(data);
  };
  next();
}

async function logToolCall({ tool_id, agent_id, latency_ms, success, error_type, error_message }) {
  await db.query(
    `INSERT INTO tool_calls (tool_id, agent_id, latency_ms, success, error_type, error_message)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [tool_id, agent_id, latency_ms, success, error_type || null, error_message || null]
  );
  if (success) await db.query(`UPDATE tools SET usage_count = usage_count + 1 WHERE id = $1`, [tool_id]);
}

module.exports = { analyticsMiddleware, logToolCall };
