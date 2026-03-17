const axios = require('axios');
const db    = require('../db');
const { signPayload } = require('./security');

async function fireWebhooks(toolId, event, payload) {
  let fired = 0;
  try {
    const { rows } = await db.query(
      `SELECT * FROM webhooks WHERE tool_id = $1 AND is_active = true AND $2 = ANY(events)`,
      [toolId, event]
    );
    await Promise.allSettled(rows.map(async wh => {
      const body = { event, tool_id: toolId, timestamp: new Date().toISOString(), data: payload };
      const headers = { 'Content-Type': 'application/json', 'X-ToolHub-Event': event };
      if (wh.secret) headers['X-ToolHub-Signature'] = `sha256=${signPayload(body, wh.secret)}`;
      try {
        await axios.post(wh.callback_url, body, { headers, timeout: 5000 });
        fired++;
      } catch (err) {
        console.warn(`Webhook ${wh.id} failed: ${err.message}`);
      }
    }));
  } catch (err) {
    console.error('fireWebhooks error:', err.message);
  }
  return fired;
}

module.exports = { fireWebhooks };
