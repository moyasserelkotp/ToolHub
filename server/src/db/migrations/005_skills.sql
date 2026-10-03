-- ────────────────────────────────────────────────────────────────
-- Migration 005 — Skills Registry
-- Adds skills + skill_embeddings tables (mirrors tools pattern)
-- ────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- SKILLS  (core registry)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL UNIQUE,
  slug          VARCHAR(120) NOT NULL UNIQUE,        -- folder name e.g. "deep-research"
  description   TEXT         NOT NULL,
  source_path   TEXT,                                -- absolute path to SKILL.md on disk
  tags          TEXT[]       NOT NULL DEFAULT '{}',
  author        VARCHAR(100),
  version       VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
  frontmatter   JSONB        NOT NULL DEFAULT '{}',  -- full parsed YAML frontmatter
  raw_content   TEXT,                                -- full SKILL.md markdown body
  status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','deprecated','hidden')),
  usage_count   BIGINT       NOT NULL DEFAULT 0,
  is_builtin    BOOLEAN      NOT NULL DEFAULT false, -- shipped with Antigravity/agent
  org_id        UUID         REFERENCES organizations(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- SKILL EMBEDDINGS  (semantic search vectors)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_embeddings (
  skill_id      UUID        PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
  embedding     FLOAT8[]    NOT NULL,
  embedded_text TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_skills_tags       ON skills USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_skills_status     ON skills (status);
CREATE INDEX IF NOT EXISTS idx_skills_slug       ON skills (slug);
CREATE INDEX IF NOT EXISTS idx_skills_is_builtin ON skills (is_builtin);
CREATE INDEX IF NOT EXISTS idx_skills_org_id     ON skills (org_id);
