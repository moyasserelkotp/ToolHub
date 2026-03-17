require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const db                 = require('./db');
const { loadEmbeddings } = require('./services/embeddings');
const { startHealthMonitor } = require('./jobs/healthMonitor');
const { analyticsMiddleware } = require('./middleware/analytics');
const { requireApiKey, warnIfNoToken } = require('./middleware/auth');

const http = require('http');
const { Server } = require('socket.io');

const app  = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Make io accessible to routers
app.set('io', io);

const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, standardHeaders: true }));
app.use(requireApiKey);      // 🔐 guards write ops; GETs + /tools/search stay public
app.use(analyticsMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/tools',       require('./routes/tools'));
app.use('/credentials', require('./routes/credentials'));
app.use('/webhooks',    require('./routes/webhooks'));
app.use('/analytics',   require('./routes/analytics'));
app.use('/collections', require('./routes/collections'));
app.use('/orgs',        require('./routes/orgs'));
app.use('/audit',       require('./routes/audit'));
app.use('/mcp',         require('./routes/mcp'));
app.use('/marketplace', require('./routes/marketplace'));

// ── Info & health ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', version: '1.0.0', ts: new Date() }));

app.get('/', (_, res) => res.json({
  name: 'ToolHub Registry API',
  version: '1.0.0',
  tagline: 'Secure, Semantic, Self-healing AI Tool Registry',
  endpoints: {
    'POST   /tools':                    'Register a new tool (security_score ≥ 40)',
    'GET    /tools':                    'List tools — ?category=&auth_type=&sort=&limit=&offset=',
    'GET    /tools/:id':                'Full tool details + schema + version history',
    'PUT    /tools/:id':                'Update tool, auto-detect breaking schema changes',
    'POST   /tools/search':             'Semantic search — { query: "..." }',
    'GET    /tools/:id/health':         'Uptime %, last checked, consecutive fails',
    'GET    /tools/:id/invoke-config':  'Issue 15-min signed JWT invoke token',
    'POST   /credentials':              'Store AES-256-GCM encrypted API key',
    'GET    /credentials/:tool_id':     'List credential metadata (key never exposed)',
    'DELETE /credentials/:tool_id':     'Revoke a credential',
    'POST   /webhooks':                 'Subscribe to tool events (degraded/schema_change/restored)',
    'GET    /webhooks':                 'List webhooks — ?agent_id=',
    'DELETE /webhooks/:id':             'Deactivate webhook',
    'GET    /analytics/overview':       'Dashboard: top tools, live feed, error heatmap',
    'GET    /analytics/tools/:id':      'Per-tool: calls, p95 latency, error rate, 30-day trend',
    'GET    /analytics/agent/:id':      'Per-agent: tool usage breakdown',
  },
}));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Startup ───────────────────────────────────────────────────────────────────
(async () => {
  warnIfNoToken();
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connected');
  } catch (err) {
    console.warn('⚠️  Database not reachable:', err.message);
    console.warn('   createdb toolhub && npm run migrate && npm run seed');
  }

  await loadEmbeddings().catch(() => {});
  startHealthMonitor();

  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║  ⚙  ToolHub API  —  http://localhost:${PORT}       ║
║  📡 Socket.IO Real-Time engine active            ║
║  GET / for full endpoint reference               ║
╚══════════════════════════════════════════════════╝`);
  });
})();

module.exports = app;
