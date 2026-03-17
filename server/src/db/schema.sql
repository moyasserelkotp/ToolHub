-- ToolHub Registry — Canonical Schema
-- Run via: npm run migrate

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- ORGANIZATIONS (Multi-tenancy & RBAC)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  tier        VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro','enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     VARCHAR(100) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS org_quotas (
  org_id        UUID        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  monthly_calls BIGINT      NOT NULL DEFAULT 10000,
  calls_used    BIGINT      NOT NULL DEFAULT 0,
  reset_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id    VARCHAR(100) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100) NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TOOLS  (core registry)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tools (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(100) NOT NULL UNIQUE,
  description    TEXT         NOT NULL,
  category       VARCHAR(50)  NOT NULL,
  json_schema    JSONB        NOT NULL DEFAULT '{}',
  auth_type      VARCHAR(30)  NOT NULL DEFAULT 'none',
  endpoint_url   TEXT,
  version        VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
  security_score INTEGER      NOT NULL DEFAULT 0 CHECK (security_score BETWEEN 0 AND 100),
  usage_count    BIGINT       NOT NULL DEFAULT 0,
  status         VARCHAR(20)  NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','degraded','deprecated')),
  org_id         UUID         REFERENCES organizations(id) ON DELETE CASCADE,
  is_public      BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Ensure existing tool tables get the new columns
ALTER TABLE tools ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────
-- TOOL VERSIONS  (schema history)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_versions (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id    UUID        NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  version    VARCHAR(20) NOT NULL,
  schema     JSONB       NOT NULL DEFAULT '{}',
  changelog  TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tool_id, version)
);

-- ─────────────────────────────────────────────
-- CREDENTIALS  (AES-256 vault)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credentials (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id       UUID        NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  operator_id   VARCHAR(100) NOT NULL,
  encrypted_key TEXT        NOT NULL,
  key_hint      VARCHAR(20),
  auth_type     VARCHAR(30) NOT NULL DEFAULT 'api_key',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tool_id, operator_id)
);

-- ─────────────────────────────────────────────
-- TOOL CALLS  (observability log)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_calls (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id       UUID        NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  agent_id      VARCHAR(100),
  latency_ms    INTEGER,
  success       BOOLEAN     NOT NULL DEFAULT true,
  error_type    VARCHAR(100),
  error_message TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TOOL HEALTH  (per-check log)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_health (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id       UUID        NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL CHECK (status IN ('healthy','unhealthy','no_endpoint')),
  response_ms   INTEGER,
  error_message TEXT,
  schema_valid  BOOLEAN     NOT NULL DEFAULT true,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TOOL HEALTH SUMMARY  (latest state per tool)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_health_summary (
  tool_id           UUID        PRIMARY KEY REFERENCES tools(id) ON DELETE CASCADE,
  status            VARCHAR(20) NOT NULL DEFAULT 'unknown',
  uptime_percent    NUMERIC(5,2),
  avg_response_ms   INTEGER,
  consecutive_fails INTEGER     NOT NULL DEFAULT 0,
  last_checked      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- WEBHOOKS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_id      UUID        NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  agent_id     VARCHAR(100) NOT NULL,
  callback_url TEXT        NOT NULL,
  events       TEXT[]      NOT NULL DEFAULT '{"degraded","schema_change","restored"}',
  secret       VARCHAR(100),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TOOL EMBEDDINGS  (semantic search vectors)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_embeddings (
  tool_id       UUID        PRIMARY KEY REFERENCES tools(id) ON DELETE CASCADE,
  embedding     FLOAT8[]    NOT NULL,
  embedded_text TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TOOL COLLECTIONS (logical grouping of tools)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_collections (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_by  VARCHAR(100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- COLLECTION TOOLS (many-to-many mapping)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_tools (
  collection_id UUID NOT NULL REFERENCES tool_collections(id) ON DELETE CASCADE,
  tool_id       UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, tool_id)
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tools_category      ON tools(category);
CREATE INDEX IF NOT EXISTS idx_tools_auth_type     ON tools(auth_type);
CREATE INDEX IF NOT EXISTS idx_tools_status        ON tools(status);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_id  ON tool_calls(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_agent_id ON tool_calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_ts       ON tool_calls(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tool_health_tool_id ON tool_health(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_health_ts      ON tool_health(checked_at DESC);

