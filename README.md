<div align="center">
  <h1>⚙️ ToolHub v3.0</h1>
  <p><b>The Universal AI Tool Discovery & Execution Platform</b></p>
  <p>Zero-configuration tool bridging for LLM APIs (Gemini, OpenAI, Anthropic, LangChain), featuring secure server-side credential injection, real-time observability, and enterprise multi-tenancy.</p>
</div>

---<img width="1536" height="1024" alt="ChatGPT Image Mar 17, 2026, 05_22_40 PM" src="https://github.com/user-attachments/assets/81764c57-f34b-422d-a77d-2d11a7799816" />



# ToolHub — AI Tool Registry, Credential Vault & Skills Registry

> Secure, Semantic, Self-healing registry for AI agent capabilities.
> **Tools** are executable. **Skills** are instructional. ToolHub serves both.

ToolHub is a centralized backend that lets AI agents **discover capabilities with natural language**, **invoke them without ever seeing raw credentials**, and **follow reusable workflow templates** — with full observability.

```
Agent (Gemini / OpenAI / LangChain)
   │  search("send an email") / search_skills("deep research")
   ▼
ToolHub Server (Express + Postgres + Redis + Socket.IO)
   ├── Tools Registry  → JSON Schema + endpoint + auth_type + security_score
   ├── Skills Registry → SKILL.md + frontmatter + tags + embeddings
   ├── Credential Vault (AES-256-GCM) → injects keys at invoke time
   ├── Health Monitor (cron) + Analytics + Webhooks + Audit
   ▼
SDKs (Python / JS) · CLI · MCP Adapter · Dashboard
```

---

## 1. Core Concepts: Tools vs Skills

This is the most important distinction in the project. **Do not confuse them.**

|  | **Tools** (`/tools`) | **Skills** (`/skills`) |
|---|---|---|
| **What** | Executable API capabilities | Reusable workflow / instruction templates |
| **Storage** | `tools` table: `name, description, category, json_schema, auth_type, endpoint_url, version, security_score, usage_count, status` | `skills` table: `name, slug, description, source_path, tags, author, version, frontmatter, raw_content, status, usage_count, is_builtin` |
| **Source** | Registered via API, OpenAPI import, or seeded (16 built-ins) | Indexed from `SKILL.md` files on disk via `SKILLS_DIRS` |
| **Discovery** | `POST /tools/search { query }` — semantic search over `tool_embeddings` | `POST /skills/search { query }` — semantic search over `skill_embeddings` |
| **Use** | `hub.invoke(tool_id, args)` → server injects credential, proxies/executes, logs to `tool_calls` | `skills.get_by_slug(slug)` → returns `raw_content` instructions for the LLM to follow |
| **Examples** | `web_search, code_execution, github, slack, email, database_query, image_generation, translation, weather, file_storage` + internal `workspace_read_file, workspace_list_dir, workspace_search, git_status, git_diff, wiki_search` | Any `SKILL.md` folder e.g. `ab-test-setup, deep-research, code-review` — parsed name/description/tags from YAML frontmatter |
| **Security** | Security score 0–100 (min 40 to register), schema validation, approval flag, JWT invoke tokens (15 min) | `raw_content` stripped before showing to Gemini in `DynamicAgent` to prevent prompt injection |

**Rule of thumb:** if the agent *calls* it with arguments → **Tool**. If the agent *reads* it to learn how to behave → **Skill**.

---

## 2. Repository Layout

```
ToolsHub/
├── server/                 # Express API — registry, vault, search, health, analytics
│   └── src/
│       ├── index.js        # App bootstrap, route mounting, skill auto-index, health monitor
│       ├── routes/         # auth, tools, skills, credentials, import, webhooks,
│       │                   # analytics, collections, orgs, audit, mcp, marketplace, pipelines
│       ├── services/       # embeddings, skillEmbeddings, skillsIndexer,
│       │                   # internalTools, security, cache, tokens, aiService, webhooks
│       ├── jobs/healthMonitor.js  # Cron health checks → tool_health + tool_health_summary
│       ├── middleware/     # auth (JWT/admin), quota, rateLimiter, analytics
│       └── db/             # schema.sql + migrations (002_users → 006_requires_approval) + seed.js
├── sdk-py/toolhub_sdk/    # Python SDK: client.py, skills.py, dynamic_agent.py, adapters.py
│   └── demo_*.py           # demo_gemini/openai/langchain/credential_vault/dynamic_tools/
│                           # dynamic_skills/chained_tools
├── sdk-js/src/             # TypeScript SDK: ToolHub.ts, SkillsClient.ts, langchain.ts, types.ts
├── cli/src/cli.ts          # Commander CLI: search/info/register/logs + skills search/list/get/index
├── mcp-adapter/            # MCP bridge (toolhub-mcp binary) — exposes registry as MCP server
├── toolhub-dashboard/src/  # React + Vite dashboard: Dashboard, Marketplace, Skills, AnalyticsCharts
├── docker-compose.yml      # db (Postgres 15) + redis (7) + server (:3000) + dashboard (:80)
└── package.json            # Root scripts: start/dev/migrate/seed/test
```

---

## 3. Features

### Tools Registry
- CRUD with version history (`tool_versions`), breaking-change detection on `PUT /tools/:id`.
- Semantic search (`POST /tools/search`) via pluggable embeddings: `tfidf | local (@xenova/transformers) | openai | gemini`, cached in Redis.
- Security scoring (`services/security.js`): auth type (0–35) + HTTPS (20) + JSON Schema completeness (25) + version (10) + description (5). **Rejects score < 40.**
- OpenAPI import: `POST /tools/import-openapi { spec_url }` → auto-registers endpoints as tools.
- Internal executable tools (`services/internalTools.js`, no `endpoint_url` needed): safe workspace file read / dir list / text search (traversal-proof), `git_status` / `git_diff`, Wikipedia search (gated by `TOOLHUB_ALLOW_OUTBOUND_HTTP`).

### Skills Registry
- Auto-index on boot from `SKILLS_DIRS` (semicolon-separated roots, e.g. `C:\Users\...\skills`). Each subfolder with `SKILL.md` → parsed with `gray-matter` (fallback inline parser) → upsert on `slug` conflict → embedded via `embedSkill()`.
- Endpoints: `GET /skills`, `GET /skills/:id`, `GET /skills/slug/:slug`, `POST /skills/search`, `GET /skills/:id/related`, `POST /skills` / `PUT /skills/:id` / `DELETE /skills/:id` (auth), `POST /skills/:id/invoke` (usage counter), `POST /skills/index` (re-index).
- Related-skills via embedding cosine similarity. Tag filtering (`?tags=`), builtin filter (`?is_builtin=`).

### Credential Vault + Secure Invocation
- `POST /credentials` stores API keys **AES-256-GCM** encrypted (`ENCRYPTION_KEY`, 64 hex chars). `GET /credentials/:tool_id` returns only metadata + `key_hint` — never plaintext.
- `GET /tools/:id/invoke-config` issues 15-min signed JWT (`JWT_SECRET`). `hub.invoke()` uses it; server injects the key server-side. LLM context **never sees raw secrets**.

### Self-healing + Observability
- `healthMonitor` cron pings every tool endpoint → `tool_health` log + `tool_health_summary` (`healthy/unhealthy/no_endpoint`, uptime %, avg ms, consecutive fails). `GET /tools/:id/health`.
- Analytics: `GET /analytics/overview` (top tools, live feed, error heatmap), per-tool (`calls, p95, error rate, 30-day trend`), per-agent breakdown. Live stream over Socket.IO (`live_call`, `tool_registered`).
- Webhooks (`POST /webhooks`): subscribe `agent_id + callback_url` to `degraded | schema_change | restored`.
- Collections (group tools), Pipelines (multi-step `{tool_id, args_template}` chains with template resolution), Marketplace (browse/install), Orgs + RBAC (`admin/editor/viewer`) + monthly quotas, Audit logs.

### Agent Integrations
- **Python SDK** (`sdk-py`): `ToolHub.search/invoke/as_gemini_function/as_openai_function/as_langchain_tool/handle_gemini_tool_call/handle_openai_tool_call`, `SkillsClient.search/get_by_slug`, `DynamicAgent` loop.
- **DynamicAgent** (`dynamic_agent.py`): Gemini starts with only `search_tools` + `search_skills` meta-tools, discovers capabilities mid-task, executes them, with loop prevention (`MAX_SAME_QUERY=3`), exponential backoff on 429/503, `max_iterations=20`. Set `enable_tools / enable_skills` independently.
- **JS SDK + MCP adapter**: use registry from Node or expose it as an MCP server (`toolhub-mcp`) for any MCP client.
- **CLI**: `toolhub search/info/register/logs` + `toolhub skills search/list/get/index`.

---

## 4. Quickstart

### A. Run with Docker (recommended)

```bash
cp server/.env.example server/.env   # set ENCRYPTION_KEY, JWT_SECRET, SKILLS_DIRS, EMBEDDING_PROVIDER
docker compose up --build
# API → http://localhost:3000  (GET / for endpoint map, GET /health)
# Dashboard → http://localhost:80
```

Seed demo tools:

```bash
npm run migrate   # server/src/db/migrate.js — applies schema.sql + migrations
npm run seed      # server/src/db/seed.js — inserts 16 tools + embeddings + usage counts
npm start
```

### B. Python SDK — Tools

```python
from toolhub_sdk import ToolHub

hub = ToolHub(base_url="http://localhost:3000", agent_id="my-agent-123")

tools = hub.search("I need to send an email")   # semantic search
result = hub.invoke(tools[0].id, {"to": "team@example.com", "body": "Hello!"})
print(result.data)
```

### C. Python SDK — Skills

```python
from toolhub_sdk.skills import SkillsClient

skills = SkillsClient(base_url="http://localhost:3000", token="<jwt from /auth/token>")
for s in skills.search("how do I set up an A/B test?"):
    print(s.name, round(s.score, 3))

print(skills.get_by_slug("ab-test-setup").raw_content)
```

### D. Dynamic agent (LLM decides what it needs)

```python
from toolhub_sdk.dynamic_agent import DynamicAgent

agent = DynamicAgent(
    toolhub_url="http://localhost:3000",
    gemini_api_key="YOUR_KEY", token="<jwt>",
    enable_tools=True, enable_skills=True, verbose=True,
)
print(agent.run("Search the latest AI news and email me a summary."))
# Turn 1: search_tools("search the web") → web_search loaded
# Turn 2: web_search({...}) → results
# Turn 3: search_tools("send email") → email loaded → email({...}) → done
```

See `sdk-py/demo_*.py` and `sdk-py/README.md` for Gemini / OpenAI / LangChain / vault / chained-tools demos.

### E. CLI

```bash
toolhub search "query postgres database" --url http://localhost:3000
toolhub info <tool-id>
toolhub register --url https://petstore.swagger.io/v2/swagger.json
toolhub logs --tail
toolhub skills search "deep research" -n 5
toolhub skills list --builtin
toolhub skills get ab-test-setup
toolhub skills index --token <admin_token>
```

---

## 5. Configuration (`server/.env`)

| Var | Purpose |
|---|---|
| `PORT` / `DATABASE_URL` / `REDIS_URL` | Server, Postgres, Redis wiring (compose sets these) |
| `ENCRYPTION_KEY` (64 hex) | AES-256-GCM vault key — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_SECRET` | Signs 15-min invoke tokens + `/auth/token` |
| `TOOLHUB_ADMIN_TOKEN` | Guards `POST/PUT/DELETE` (empty = open dev mode) |
| `EMBEDDING_PROVIDER` | `tfidf` (default, offline) \| `local` \| `openai` (+`OPENAI_API_KEY`) \| `gemini` (+`GEMINI_API_KEY`) |
| `SKILLS_DIRS` | `;`-separated skill roots, each child dir must contain `SKILL.md` |
| `TOOLHUB_ALLOW_OUTBOUND_HTTP` | Must be `true` for `wiki_search` / web tools |
| `HEALTH_CHECK_ON_START` | Run health sweep on boot (dev) |

---

## 6. API Map (see `GET /`)

```
POST   /tools                       Register (security_score ≥ 40)
GET    /tools?category=&auth_type=&sort=&limit=&offset=
GET    /tools/:id                   Details + schema + version history
PUT    /tools/:id                   Update + breaking-change detection
POST   /tools/search                { query }
GET    /tools/:id/health  |  GET /tools/:id/invoke-config
POST   /credentials  |  GET|DELETE /credentials/:tool_id
POST|GET|DELETE /webhooks
GET    /analytics/overview | /analytics/tools/:id | /analytics/agent/:id
GET    /skills?status=&tags=&is_builtin=  |  GET /skills/:id  |  GET /skills/slug/:slug
POST   /skills/search  |  GET /skills/:id/related  |  POST /skills/index (auth)
POST   /pipelines  |  GET /pipelines  |  /collections  /marketplace  /mcp  /orgs  /audit  /auth
```

---

## 7. Development Notes

- DB: `server/src/db/schema.sql` is canonical; migrations in `server/src/db/migrations/`. Tables: `organizations, users, org_members, org_quotas, audit_logs, tools, tool_versions, credentials, tool_calls, tool_audit_logs, tool_health, tool_health_summary, webhooks, tool_embeddings, tool_collections, collection_tools, pipelines, tool_ratings, skills, skill_embeddings`.
- Auth: `middleware/auth.js` — public `GET` + `/tools/search` + `/skills/search`; writes require `TOOLHUB_ADMIN_TOKEN` bearer or JWT. `warnIfNoToken()` warns on boot if unset.
- Rate limiting: `express-rate-limit` (2000/15min) + Redis store; request logging via `pino-http`.
- Dashboard (`toolhub-dashboard`, React 19 + Vite + Recharts + socket.io-client) and `mcp-adapter` / `sdk-js` build with `tsup` (`npm run build`).
