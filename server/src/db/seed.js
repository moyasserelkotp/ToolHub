require('dotenv').config();
const db = require('../db');
const { computeSecurityScore } = require('../services/security');
const { embedTool } = require('../services/embeddings');

const TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for real-time information, news, articles and research results. Returns ranked results with titles, snippets, and URLs.',
    category: 'research',
    auth_type: 'api_key',
    endpoint_url: 'https://api.search.example.com/v1/search',
    version: '2.1.0',
    json_schema: {
      type: 'object', required: ['query'],
      properties: {
        query:       { type: 'string', description: 'Search query', maxLength: 500 },
        num_results: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
        language:    { type: 'string', default: 'en' },
        date_range:  { type: 'string', enum: ['day','week','month','year','any'], default: 'any' },
      },
    },
  },
  {
    name: 'code_execution',
    description: 'Execute Python, JavaScript, or Bash code in a secure sandboxed environment. Returns stdout, stderr, and exit code with optional file I/O.',
    category: 'development',
    auth_type: 'bearer_token',
    endpoint_url: 'https://sandbox.execute.example.com/v1/run',
    version: '3.0.1',
    json_schema: {
      type: 'object', required: ['code','language'],
      properties: {
        code:       { type: 'string', description: 'Code to execute' },
        language:   { type: 'string', enum: ['python','javascript','bash'] },
        timeout_ms: { type: 'integer', default: 5000, maximum: 30000 },
        stdin:      { type: 'string' },
        packages:   { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'weather',
    description: 'Get current weather conditions and 7-day forecasts for any location worldwide. Includes temperature, humidity, wind speed, and precipitation.',
    category: 'data',
    auth_type: 'api_key',
    endpoint_url: 'https://api.weather.example.com/v2/forecast',
    version: '2.0.0',
    json_schema: {
      type: 'object', required: ['location'],
      properties: {
        location: { type: 'string', description: 'City name or lat,lon coordinates' },
        units:    { type: 'string', enum: ['metric','imperial'], default: 'metric' },
        days:     { type: 'integer', default: 1, minimum: 1, maximum: 7 },
      },
    },
  },
  {
    name: 'github',
    description: 'Interact with GitHub repositories: read files, create issues, open pull requests, search code, list commits, and manage branches.',
    category: 'development',
    auth_type: 'oauth',
    endpoint_url: 'https://api.github.com',
    version: '1.2.0',
    json_schema: {
      type: 'object', required: ['action','owner','repo'],
      properties: {
        action: { type: 'string', enum: ['read_file','create_issue','list_commits','create_pr','search_code'] },
        owner:  { type: 'string' },
        repo:   { type: 'string' },
        path:   { type: 'string' },
        branch: { type: 'string', default: 'main' },
        title:  { type: 'string' },
        body:   { type: 'string' },
        query:  { type: 'string' },
      },
    },
  },
  {
    name: 'slack',
    description: 'Send messages, read channels, list users, reply to threads, and post formatted blocks to Slack workspaces.',
    category: 'communication',
    auth_type: 'oauth',
    endpoint_url: 'https://slack.com/api',
    version: '2.0.0',
    json_schema: {
      type: 'object', required: ['action'],
      properties: {
        action:    { type: 'string', enum: ['send_message','read_channel','list_channels','reply_thread'] },
        channel:   { type: 'string', description: 'Channel ID or #name' },
        text:      { type: 'string', maxLength: 4000 },
        thread_ts: { type: 'string' },
        blocks:    { type: 'array' },
        limit:     { type: 'integer', default: 100 },
      },
    },
  },
  {
    name: 'email',
    description: 'Send and receive emails, search inbox, create drafts, and manage attachments via SMTP/IMAP or API. Supports HTML formatting and bulk templates.',
    category: 'communication',
    auth_type: 'api_key',
    endpoint_url: 'https://api.email.example.com/v1',
    version: '1.3.0',
    json_schema: {
      type: 'object', required: ['action'],
      properties: {
        action:      { type: 'string', enum: ['send','read','search','create_draft','list_inbox'] },
        to:          { type: 'string', format: 'email' },
        subject:     { type: 'string', maxLength: 200 },
        body:        { type: 'string' },
        html:        { type: 'boolean', default: false },
        cc:          { type: 'array', items: { type: 'string' } },
        attachments: { type: 'array' },
        query:       { type: 'string' },
      },
    },
  },
  {
    name: 'database_query',
    description: 'Execute read-only SQL queries against connected PostgreSQL, MySQL, or SQLite databases. Returns results as structured JSON with column metadata.',
    category: 'data',
    auth_type: 'api_key',
    endpoint_url: 'https://api.db.example.com/v1/query',
    version: '1.1.0',
    json_schema: {
      type: 'object', required: ['query'],
      properties: {
        query:      { type: 'string', description: 'SQL query (SELECT only)' },
        database:   { type: 'string', description: 'Connection alias' },
        params:     { type: 'array', description: 'Parameterized values' },
        timeout_ms: { type: 'integer', default: 30000 },
        limit:      { type: 'integer', default: 100, maximum: 10000 },
      },
    },
  },
  {
    name: 'image_generation',
    description: 'Generate high-quality images from text prompts using diffusion models. Supports style control, aspect ratios, negative prompts, and image-to-image editing.',
    category: 'media',
    auth_type: 'api_key',
    endpoint_url: 'https://api.imagegen.example.com/v1/generate',
    version: '4.0.0',
    json_schema: {
      type: 'object', required: ['prompt'],
      properties: {
        prompt:          { type: 'string', maxLength: 2000 },
        negative_prompt: { type: 'string' },
        width:           { type: 'integer', enum: [512,768,1024,1536], default: 1024 },
        height:          { type: 'integer', enum: [512,768,1024,1536], default: 1024 },
        steps:           { type: 'integer', default: 30, minimum: 10, maximum: 150 },
        style:           { type: 'string', enum: ['realistic','artistic','anime','cartoon','sketch'] },
        num_images:      { type: 'integer', default: 1, maximum: 4 },
      },
    },
  },
  {
    name: 'translation',
    description: 'Translate text between 100+ languages using neural machine translation. Supports auto-detection, batch translation, formal/informal register, and custom glossaries.',
    category: 'language',
    auth_type: 'api_key',
    endpoint_url: 'https://api.translate.example.com/v1/translate',
    version: '2.3.0',
    json_schema: {
      type: 'object', required: ['text','target_lang'],
      properties: {
        text:        { type: ['string','array'] },
        target_lang: { type: 'string', description: 'BCP-47 language code, e.g. es, fr, zh' },
        source_lang: { type: 'string', description: 'Auto-detected if omitted' },
        formality:   { type: 'string', enum: ['formal','informal','default'], default: 'default' },
        glossary:    { type: 'object' },
      },
    },
  },
  {
    name: 'file_storage',
    description: 'Upload, download, list, and manage files in S3-compatible cloud storage. Supports presigned URLs, folder operations, metadata, and ACL control.',
    category: 'storage',
    auth_type: 'api_key',
    endpoint_url: 'https://api.storage.example.com/v1',
    version: '1.5.0',
    json_schema: {
      type: 'object', required: ['action'],
      properties: {
        action:       { type: 'string', enum: ['upload','download','list','delete','get_url','move'] },
        bucket:       { type: 'string' },
        key:          { type: 'string', description: 'File path/key in bucket' },
        content:      { type: 'string', description: 'Base64-encoded bytes for upload' },
        content_type: { type: 'string' },
        prefix:       { type: 'string' },
        url_ttl:      { type: 'integer', default: 3600 },
        public:       { type: 'boolean', default: false },
      },
    },
  },
];

async function seed() {
  console.log('🌱 Seeding ToolHub with 10 example tools…\n');

  for (const t of TOOLS) {
    const score = computeSecurityScore(t);
    try {
      const { rows } = await db.query(
        `INSERT INTO tools (name, description, category, json_schema, auth_type, endpoint_url, version, security_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (name) DO UPDATE SET
           description = EXCLUDED.description, json_schema = EXCLUDED.json_schema,
           security_score = EXCLUDED.security_score, updated_at = NOW()
         RETURNING id, name, security_score`,
        [t.name, t.description, t.category, JSON.stringify(t.json_schema),
         t.auth_type, t.endpoint_url, t.version, score]
      );
      const { id, name, security_score } = rows[0];

      // Health summary bootstrap
      await db.query(
        `INSERT INTO tool_health_summary (tool_id, status) VALUES ($1,'unknown') ON CONFLICT DO NOTHING`,
        [id]
      );

      // Initial version
      await db.query(
        `INSERT INTO tool_versions (tool_id, version, schema, changelog, is_active)
         VALUES ($1,$2,$3,'Initial seeded version',true) ON CONFLICT DO NOTHING`,
        [id, t.version, JSON.stringify(t.json_schema)]
      );

      // Embed
      await embedTool(id, `${t.name} ${t.description}`);

      console.log(`  ✅ ${name.padEnd(25)} score=${security_score}/100`);
    } catch (err) {
      console.error(`  ❌ ${t.name}: ${err.message}`);
    }
  }

  // Give tools some realistic usage counts
  await db.query(`
    UPDATE tools SET usage_count = CASE name
      WHEN 'web_search'       THEN 48291
      WHEN 'code_execution'   THEN 37104
      WHEN 'email'            THEN 29834
      WHEN 'github'           THEN 24102
      WHEN 'slack'            THEN 19847
      WHEN 'image_generation' THEN 15623
      WHEN 'translation'      THEN 12048
      WHEN 'database_query'   THEN  9302
      WHEN 'weather'          THEN  7841
      WHEN 'file_storage'     THEN  4219
      ELSE usage_count
    END
  `);

  console.log('\n✨ Seed complete. Run `npm start` to launch the server.\n');
  await db.pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

