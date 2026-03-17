/**
 * Semantic Embeddings Strategy Router
 * Supports: TF-IDF (default), OpenAI, Local (Transformers.js)
 */
const db = require('../db');

const PROVIDER = process.env.EMBEDDING_PROVIDER || 'tfidf';

// ── TF-IDF Strategy ──────────────────────────────────────────────────────────
const VOCAB = [
  'search','web','internet','find','query','lookup','browse','crawl','research','news','results',
  'code','execute','run','python','javascript','bash','script','program','compute','sandbox','compile',
  'weather','forecast','temperature','rain','wind','climate','storm','humidity','location','coordinates',
  'github','git','repository','commit','pull','push','branch','issue','pr','merge','diff','blame',
  'slack','message','chat','channel','notify','alert','team','workspace','thread','mention','dm',
  'email','mail','send','receive','smtp','inbox','attachment','compose','forward','reply','draft',
  'database','sql','query','select','insert','update','postgres','mysql','table','schema','record',
  'image','generate','picture','photo','draw','art','visual','diffusion','stable','midjourney','dalle',
  'translate','language','text','convert','spanish','french','chinese','german','japanese','korean',
  'file','storage','upload','download','s3','bucket','save','retrieve','blob','object','cloud',
  'api','http','request','response','endpoint','rest','graphql','webhook','token','auth','key',
  'analytics','report','metric','log','monitor','latency','error','rate','count','trend','dashboard',
];

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function computeTfidfEmbedding(text) {
  const tokens = tokenize(text);
  const vec = new Array(VOCAB.length).fill(0);
  tokens.forEach(tok => {
    VOCAB.forEach((word, i) => {
      if (tok === word)               vec[i] += 3.0;
      else if (tok.startsWith(word))  vec[i] += 1.5;
      else if (word.startsWith(tok) && tok.length > 3) vec[i] += 1.0;
    });
  });
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag > 0 ? vec.map(v => v / mag) : vec;
}

// ── Strategy Router ──────────────────────────────────────────────────────────

let transformersPipeline;
let openaiClient;

async function computeEmbedding(text) {
  if (PROVIDER === 'local') {
    if (!transformersPipeline) {
      // Dynamic import for ESM package
      const transformers = await import('@xenova/transformers');
      transformersPipeline = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    }
    const result = await transformersPipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  } else if (PROVIDER === 'openai') {
    if (!openaiClient) {
      const { OpenAI } = require('openai');
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    const res = await openaiClient.embeddings.create({ model: 'text-embedding-3-small', input: text });
    return res.data[0].embedding;
  }
  
  // Default to tfidf
  return computeTfidfEmbedding(text);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; ma += a[i]*a[i]; mb += b[i]*b[i]; }
  const denom = Math.sqrt(ma) * Math.sqrt(mb);
  return denom > 0 ? dot / denom : 0;
}

// In-memory cache: toolId → Array of floats
const cache = new Map();

async function loadEmbeddings() {
  try {
    const { rows } = await db.query('SELECT tool_id, embedding FROM tool_embeddings');
    rows.forEach(r => cache.set(r.tool_id, r.embedding));
    console.log(`📐 Loaded ${rows.length} embeddings into memory (Provider: ${PROVIDER})`);
  } catch (err) {
    console.warn('Could not load embeddings:', err.message);
  }
}

async function embedTool(toolId, text) {
  const embedding = await computeEmbedding(text);
  cache.set(toolId, embedding);
  try {
    await db.query(
      `INSERT INTO tool_embeddings (tool_id, embedding, embedded_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (tool_id) DO UPDATE SET embedding = $2, embedded_text = $3, created_at = NOW()`,
      [toolId, embedding, text]
    );
  } catch (err) {
    console.warn('Could not persist embedding:', err.message);
  }
  return embedding;
}

async function _scoreTools(rows, qVec) {
  const scored = await Promise.all(rows.map(async tool => {
    let emb = tool.embedding || cache.get(tool.id);
    if (!emb) {
      emb = await computeEmbedding(`${tool.name} ${tool.description}`);
      cache.set(tool.id, emb);
    }
    const sem   = cosineSimilarity(qVec, emb);
    const sec   = (tool.security_score || 0) / 100;
    const usage = tool.usage_count > 0 ? Math.log1p(tool.usage_count) / 15 : 0;
    const score = sem * 0.60 + sec * 0.20 + Math.min(usage, 1) * 0.20;
    return { ...tool, embedding: undefined, semantic_score: +sem.toFixed(3), score: +score.toFixed(3) };
  }));
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Semantic search — composite score:
 *   60% semantic similarity  +  20% security score  +  20% log(usage)
 */
async function semanticSearch(query, topK = 5) {
  const qVec = await computeEmbedding(query);

  const { rows } = await db.query(
    `SELECT t.id, t.name, t.description, t.category, t.auth_type,
            t.security_score, t.usage_count, t.status, t.version, t.json_schema,
            te.embedding
     FROM tools t
     LEFT JOIN tool_embeddings te ON t.id = te.tool_id
     WHERE t.status = 'active'`
  );

  const scored = await _scoreTools(rows, qVec);
  return scored.slice(0, topK);
}

/**
 * Get related tools using the specified tool's embedding
 */
async function getRelatedTools(toolId, topK = 5) {
  let qVec = cache.get(toolId);
  if (!qVec) {
    const { rows } = await db.query('SELECT embedding FROM tool_embeddings WHERE tool_id = $1', [toolId]);
    if (rows.length > 0 && rows[0].embedding) {
      qVec = rows[0].embedding;
      cache.set(toolId, qVec);
    } else {
      const { rows: toolRows } = await db.query('SELECT name, description FROM tools WHERE id = $1', [toolId]);
      if (toolRows.length === 0) return [];
      qVec = await computeEmbedding(`${toolRows[0].name} ${toolRows[0].description}`);
      cache.set(toolId, qVec);
    }
  }

  const { rows } = await db.query(
    `SELECT t.id, t.name, t.description, t.category, t.auth_type,
            t.security_score, t.usage_count, t.status, t.version, t.json_schema,
            te.embedding
     FROM tools t
     LEFT JOIN tool_embeddings te ON t.id = te.tool_id
     WHERE t.status = 'active' AND t.id != $1`,
    [toolId]
  );

  const scored = await _scoreTools(rows, qVec);
  return scored.slice(0, topK);
}

module.exports = { embedTool, semanticSearch, loadEmbeddings, computeEmbedding, getRelatedTools };
