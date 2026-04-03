require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db   = require('../db');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    console.log('🔧 Running base schema…');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await db.query(sql);
  }

  const migrationsDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      console.log(`🔧 Running migration ${file}…`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await db.query(sql);
    }
  }

  console.log('✅ Schema ready');
  await db.pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

