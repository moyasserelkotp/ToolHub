const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_generate_a_real_secret_in_production';
const JWT_EXPIRES_IN = '24h';

// POST /auth/register
router.post('/register', [
  body('username').isString().notEmpty().trim(),
  body('password').isString().isLength({ min: 6 }),
  body('org_id').optional().isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password, org_id } = req.body;

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, org_id) VALUES ($1, $2, $3) RETURNING id, username, role, org_id`,
      [username, password_hash, org_id || null]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/token
router.post('/token', [
  body('username').isString().notEmpty(),
  body('password').isString().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;

  try {
    const { rows } = await db.query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, org_id: user.org_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, expires_in: JWT_EXPIRES_IN });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token issuance failed' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Treat as expired to regenerate, or verify ignoreExpiration if strict flow is needed.
    // Simplifying: verify token, issue a new one.
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    
    // Check if user still exists
    const { rows } = await db.query(`SELECT * FROM users WHERE id = $1`, [decoded.sub]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'User no longer exists' });

    const newToken = jwt.sign(
      { sub: user.id, role: user.role, org_id: user.org_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token: newToken, expires_in: JWT_EXPIRES_IN });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
