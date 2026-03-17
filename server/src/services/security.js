const crypto = require('crypto');
const axios = require('axios');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(
  (process.env.ENCRYPTION_KEY || '0'.repeat(64)).slice(0, 64),
  'hex'
);

// ── Encryption ───────────────────────────────────────────────────────────────

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, enc] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let plain = decipher.update(enc, 'hex', 'utf8');
  plain += decipher.final('utf8');
  return plain;
}

// ── Security scoring (0–100) ─────────────────────────────────────────────────

const AUTH_SCORES = { oauth: 35, oauth2: 35, bearer_token: 30, jwt: 30, api_key: 25, basic: 10, none: 0 };

function computeSecurityScore(tool) {
  let score = 0;

  // Authentication (up to 35 pts)
  score += AUTH_SCORES[tool.auth_type] || 0;

  // HTTPS endpoint (20 pts)
  if (tool.endpoint_url?.startsWith('https://')) score += 20;

  // JSON schema features (up to 25 pts)
  if (tool.json_schema && Object.keys(tool.json_schema).length > 0) {
    score += 15; // Basic presence

    // Strict types defined for properties (10 pts)
    const props = tool.json_schema.properties || {};
    const hasProps = Object.keys(props).length > 0;
    const allTyped = hasProps && Object.values(props).every(p => p && p.type);
    if (allTyped) score += 10;
  }

  // Versioned beyond 1.0.0 (10 pts)
  if (tool.version && tool.version !== '1.0.0') score += 10;

  // Detailed description (5 pts)
  if (tool.description && tool.description.length >= 30) score += 5;

  // Rate-limit hint in schema (5 pts)
  if (JSON.stringify(tool.json_schema || {}).match(/rate|limit|throttle/i)) score += 5;

  return Math.min(score, 100);
}

const MINIMUM_SECURITY_SCORE = 40;

// ── Schema diff engine ───────────────────────────────────────────────────────

function diffSchemas(oldSchema, newSchema) {
  const breaking = [];
  const nonBreaking = [];

  const oldProps = (oldSchema || {}).properties || {};
  const newProps = (newSchema || {}).properties || {};
  const oldReq   = new Set((oldSchema || {}).required || []);
  const newReq   = new Set((newSchema || {}).required || []);

  // Removed properties → breaking
  for (const k of Object.keys(oldProps)) {
    if (!newProps[k]) breaking.push({ type: 'property_removed', field: k });
  }

  // Type changed → breaking
  for (const k of Object.keys(newProps)) {
    if (oldProps[k] && oldProps[k].type !== newProps[k].type) {
      breaking.push({ type: 'type_changed', field: k, from: oldProps[k].type, to: newProps[k].type });
    }
  }

  // New required field → breaking
  for (const k of newReq) {
    if (!oldReq.has(k)) breaking.push({ type: 'new_required_field', field: k });
  }

  // Added optional field → non-breaking
  for (const k of Object.keys(newProps)) {
    if (!oldProps[k] && !newReq.has(k)) nonBreaking.push({ type: 'optional_field_added', field: k });
  }

  return { isBreaking: breaking.length > 0, breaking, nonBreaking };
}

// ── Webhook HMAC signing ─────────────────────────────────────────────────────

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

// ── Live Reachability Check ──────────────────────────────────────────────────

async function liveReachabilityCheck(url) {
  if (!url) return false;
  try {
    const res = await axios.get(url, { timeout: 5000 });
    return res.status >= 200 && res.status < 500;
  } catch (err) {
    if (err.response) return err.response.status >= 200 && err.response.status < 500;
    return false;
  }
}

module.exports = { encrypt, decrypt, computeSecurityScore, MINIMUM_SECURITY_SCORE, diffSchemas, signPayload, liveReachabilityCheck };
