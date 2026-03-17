const cron  = require('node-cron');
const axios = require('axios');
const db    = require('../db');
const { fireWebhooks } = require('../services/webhooks');

const FAIL_THRESHOLD = 3;

async function checkTool(tool) {
  if (!tool.endpoint_url) return { status: 'no_endpoint', response_ms: null, schema_valid: true };

  const start = Date.now();
  try {
    const resp = await axios.get(tool.endpoint_url, {
      timeout: 8000,
      validateStatus: s => s < 500,
      headers: { 'X-ToolHub-Health-Check': '1', 'User-Agent': 'ToolHub-Monitor/1.0' },
    });
    const response_ms = Date.now() - start;
    // 401/403 means the endpoint exists — count as healthy
    const healthy = resp.status < 500;
    return { status: healthy ? 'healthy' : 'unhealthy', response_ms, schema_valid: true };
  } catch (err) {
    return {
      status: 'unhealthy',
      response_ms: Date.now() - start,
      schema_valid: true,
      error_message: err.message.slice(0, 200),
    };
  }
}

async function runHealthChecks() {
  console.log(`\n🏥 [${new Date().toISOString()}] Running health checks…`);
  let checked = 0, degraded = 0, restored = 0;

  try {
    const { rows: tools } = await db.query(
      `SELECT t.id, t.name, t.endpoint_url, t.status,
              COALESCE(ths.consecutive_fails, 0) AS consecutive_fails
       FROM tools t
       LEFT JOIN tool_health_summary ths ON ths.tool_id = t.id
       WHERE t.status != 'deprecated'`
    );

    for (const tool of tools) {
      const result = await checkTool(tool);
      checked++;

      // Log the check
      await db.query(
        `INSERT INTO tool_health (tool_id, status, response_ms, error_message, schema_valid)
         VALUES ($1,$2,$3,$4,$5)`,
        [tool.id, result.status, result.response_ms, result.error_message || null, result.schema_valid]
      );

      const isDown     = result.status === 'unhealthy';
      const newFails   = isDown ? tool.consecutive_fails + 1 : 0;
      const wasHealthy = tool.status === 'active';
      const wasDegraded = tool.status === 'degraded';

      // Compute rolling 30-day uptime
      const { rows: uptimeRows } = await db.query(
        `SELECT ROUND(AVG(CASE WHEN status = 'healthy' THEN 100.0 ELSE 0.0 END), 2) AS pct,
                ROUND(AVG(response_ms)) AS avg_ms
         FROM tool_health
         WHERE tool_id = $1 AND checked_at > NOW() - INTERVAL '30 days'`,
        [tool.id]
      );
      const uptime = uptimeRows[0]?.pct ?? (isDown ? 0 : 100);
      const avgMs  = uptimeRows[0]?.avg_ms ?? result.response_ms;

      await db.query(
        `INSERT INTO tool_health_summary
           (tool_id, status, uptime_percent, avg_response_ms, consecutive_fails, last_checked)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (tool_id) DO UPDATE
           SET status = $2, uptime_percent = $3, avg_response_ms = $4,
               consecutive_fails = $5, last_checked = NOW(), updated_at = NOW()`,
        [tool.id, result.status, uptime, avgMs, newFails]
      );

      // Degrade after threshold failures
      if (newFails >= FAIL_THRESHOLD && wasHealthy) {
        await db.query(`UPDATE tools SET status = 'degraded' WHERE id = $1`, [tool.id]);
        const fired = await fireWebhooks(tool.id, 'degraded', {
          tool_name: tool.name, consecutive_fails: newFails, last_error: result.error_message,
        });
        console.log(`  ⚠️  ${tool.name} DEGRADED — ${fired} webhook(s) fired`);
        degraded++;
      }

      // Restore if was degraded and now healthy
      if (result.status === 'healthy' && wasDegraded) {
        await db.query(`UPDATE tools SET status = 'active' WHERE id = $1`, [tool.id]);
        const fired = await fireWebhooks(tool.id, 'restored', { tool_name: tool.name });
        console.log(`  ✅ ${tool.name} RESTORED — ${fired} webhook(s) fired`);
        restored++;
      }

      const icon = result.status === 'healthy' ? '✅' : result.status === 'no_endpoint' ? '⏭️' : '❌';
      const ms   = result.response_ms != null ? `${result.response_ms}ms` : 'N/A';
      console.log(`  ${icon} ${tool.name.padEnd(25)} ${result.status.padEnd(12)} ${ms}`);
    }

    console.log(`\n  ✔ Checked ${checked} tools — ${degraded} degraded, ${restored} restored\n`);
  } catch (err) {
    console.error('Health check run failed:', err.message);
  }
}

function startHealthMonitor() {
  cron.schedule('0 */6 * * *', runHealthChecks);
  console.log('⏰ Health monitor scheduled (every 6h)');
  if (process.env.HEALTH_CHECK_ON_START === 'true') {
    setTimeout(runHealthChecks, 5000);
  }
}

module.exports = { startHealthMonitor, runHealthChecks };
