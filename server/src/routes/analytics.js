const express = require('express');
const router  = express.Router();
const db      = require('../db');


// GET /analytics/overview — dashboard summary
router.get('/overview', async (req, res) => {
  try {
    const [topTools, recentCalls, errorRates, hourlyVolume] = await Promise.all([
      db.query(
        `SELECT t.id, t.name, t.category, t.usage_count, t.security_score, t.status,
                COUNT(tc.id)::int                                              AS calls_24h,
                AVG(tc.latency_ms)                                             AS avg_latency,
                SUM(CASE WHEN tc.success THEN 0 ELSE 1 END)::float
                  / NULLIF(COUNT(tc.id), 0)                                    AS error_rate
        FROM tools t
        LEFT JOIN tool_calls tc ON tc.tool_id = t.id
          AND tc.timestamp > NOW() - INTERVAL '24 hours'
        GROUP BY t.id ORDER BY t.usage_count DESC LIMIT 10`
      ),
      db.query(
        `SELECT tc.id, t.name AS tool_name, tc.agent_id, tc.latency_ms,
                tc.success, tc.error_type, tc.timestamp
        FROM tool_calls tc JOIN tools t ON t.id = tc.tool_id
        ORDER BY tc.timestamp DESC LIMIT 40`
      ),
      db.query(
        `SELECT t.name,
                SUM(CASE WHEN tc.success THEN 0 ELSE 1 END)::float
                  / NULLIF(COUNT(tc.id), 0) * 100 AS error_pct,
                COUNT(tc.id)::int AS total_calls
        FROM tools t
        JOIN tool_calls tc ON tc.tool_id = t.id
        WHERE tc.timestamp > NOW() - INTERVAL '24 hours'
        GROUP BY t.name ORDER BY error_pct DESC NULLS LAST`
      ),
      db.query(
        `SELECT DATE_TRUNC('hour', timestamp) AS hour, COUNT(*)::int AS calls
        FROM tool_calls WHERE timestamp > NOW() - INTERVAL '24 hours'
        GROUP BY hour ORDER BY hour`
      ),
    ]);
    res.json({
      top_tools:      topTools.rows,
      recent_calls:   recentCalls.rows,
      error_heatmap:  errorRates.rows,
      hourly_volume:  hourlyVolume.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// GET /analytics/tools/:id — per-tool deep stats
router.get('/tools/:id', async (req, res) => {
  const { id } = req.params;
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  try {
    const [tool, stats, errors, trend, latDist] = await Promise.all([
      db.query('SELECT name, usage_count, security_score, status FROM tools WHERE id = $1', [id]),
      db.query(
        `SELECT COUNT(*)::int                                                  AS total_calls,
                SUM(CASE WHEN success THEN 1 ELSE 0 END)::int                  AS successful,
                SUM(CASE WHEN success THEN 0 ELSE 1 END)::int                  AS failed,
                AVG(latency_ms)                                                AS avg_latency,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)       AS p95_latency,
                MIN(latency_ms)                                                AS min_latency,
                MAX(latency_ms)                                                AS max_latency
        FROM tool_calls WHERE tool_id = $1`, [id]
      ),
      db.query(
        `SELECT error_type, COUNT(*)::int AS count
        FROM tool_calls WHERE tool_id = $1 AND NOT success AND error_type IS NOT NULL
        GROUP BY error_type ORDER BY count DESC LIMIT 10`, [id]
      ),
      db.query(
        `SELECT DATE_TRUNC('day', timestamp) AS day,
                COUNT(*)::int AS calls,
                SUM(CASE WHEN success THEN 1 ELSE 0 END)::int AS successes,
                ROUND(AVG(latency_ms)) AS avg_latency
        FROM tool_calls
        WHERE tool_id = $1 AND timestamp > NOW() - ($2 || ' days')::INTERVAL
        GROUP BY day ORDER BY day`, [id, days]
      ),
      db.query(
        `SELECT CASE
                  WHEN latency_ms < 100  THEN '<100ms'
                  WHEN latency_ms < 500  THEN '100–500ms'
                  WHEN latency_ms < 1000 THEN '500ms–1s'
                  WHEN latency_ms < 3000 THEN '1–3s'
                  ELSE '>3s'
                END AS bucket, COUNT(*)::int AS count
        FROM tool_calls WHERE tool_id = $1 AND latency_ms IS NOT NULL
        GROUP BY bucket`, [id]
      ),
    ]);
    if (!tool.rows[0]) return res.status(404).json({ error: 'Tool not found' });

    const s = stats.rows[0];
    res.json({
      tool: tool.rows[0],
      total_calls:   s.total_calls,
      successful:    s.successful,
      failed:        s.failed,
      error_rate_pct: s.total_calls > 0 ? +((s.failed / s.total_calls) * 100).toFixed(2) : 0,
      latency: {
        avg:  Math.round(s.avg_latency)  || 0,
        p95:  Math.round(s.p95_latency)  || 0,
        min:  s.min_latency || 0,
        max:  s.max_latency || 0,
        distribution: latDist.rows,
      },
      top_errors:   errors.rows,
      daily_trend:  trend.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /analytics/agent/:agent_id — per-agent breakdown
router.get('/agent/:agent_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.category,
              COUNT(tc.id)::int                                                AS call_count,
              ROUND(AVG(tc.latency_ms))                                        AS avg_latency,
              ROUND(SUM(CASE WHEN tc.success THEN 1 ELSE 0 END)::float
                / NULLIF(COUNT(tc.id),0) * 100, 1)                            AS success_pct,
              MAX(tc.timestamp)                                                AS last_used
      FROM tool_calls tc JOIN tools t ON t.id = tc.tool_id
      WHERE tc.agent_id = $1
      GROUP BY t.id, t.name, t.category ORDER BY call_count DESC`,
      [req.params.agent_id]
    );
    res.json({ agent_id: req.params.agent_id, tools_used: rows.length, breakdown: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch agent analytics' });
  }
});

module.exports = router;
