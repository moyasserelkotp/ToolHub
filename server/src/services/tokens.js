const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const TOKEN_TTL  = 15 * 60; // seconds

function generateInvokeToken(toolId, operatorId) {
  return jwt.sign(
    { tool_id: toolId, operator_id: operatorId, type: 'invoke', jti: crypto.randomBytes(8).toString('hex') },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL, issuer: 'toolhub', audience: 'agent' }
  );
}

function verifyInvokeToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: 'toolhub', audience: 'agent' });
}

module.exports = { generateInvokeToken, verifyInvokeToken, TOKEN_TTL };
