const db = require('../db');

/**
 * Quota Middleware
 * Verifies that the organization associated with the requested tool
 * has not exceeded its monthly call limits.
 */
async function checkQuota(req, res, next) {
  try {
    // 1. Find the tool to get its org_id
    const { rows: toolRows } = await db.query(
      `SELECT org_id FROM tools WHERE id = $1`,
      [req.params.id]
    );

    if (!toolRows[0] || !toolRows[0].org_id) {
      // Tool not found, or public tool without an org: skip quota check
      return next();
    }

    const orgId = toolRows[0].org_id;

    // 2. Check the organization's quota usage
    const { rows: quotaRows } = await db.query(
      `SELECT calls_used, monthly_calls FROM org_quotas WHERE org_id = $1`,
      [orgId]
    );

    if (quotaRows[0] && quotaRows[0].calls_used >= quotaRows[0].monthly_calls) {
      return res.status(429).json({ error: 'Organization usage quota exceeded' });
    }

    // Attach org_id to req for downstream usage
    req.tool_org_id = orgId;
    next();
  } catch (err) {
    console.error('Quota check failed:', err);
    res.status(500).json({ error: 'Failed to verify quota' });
  }
}

module.exports = { checkQuota };
