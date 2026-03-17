require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db   = require('../db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('🔧 Running migrations…');
  await db.query(sql);
  console.log('✅ Schema ready');
  await db.pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

