<div align="center">
  <h1>⚙️ ToolHub v2.0</h1>
  <p><b>The Universal AI Tool Discovery & Execution Platform</b></p>
  <p>Zero-configuration tool bridging for LLM APIs (Gemini, OpenAI, Anthropic, LangChain), featuring secure server-side credential injection, real-time observability, and enterprise multi-tenancy.</p>
</div>

---<img width="1536" height="1024" alt="ChatGPT Image Mar 17, 2026, 05_22_40 PM" src="https://github.com/user-attachments/assets/81764c57-f34b-422d-a77d-2d11a7799816" />



## 🎯 What is ToolHub?

When building AI Agents, connecting to external APIs is hard. You have to write custom JSON schemas, handle sensitive API credentials in plaintext within your agent memory, parse obscure network errors, and build custom rate-limiting and analytics.

**ToolHub solves this by acting as a secure middleware layer between your AI Agent and the world.**

1. **Agent Prompts ToolHub:** *"I need a tool to evaluate math or search the web."*
2. **ToolHub Searches:** Uses TF-IDF semantic embedding search against its PostgreSQL registry to find the perfect tool schema, instantly formatting it into an OpenAI `FunctionCall` or Gemini `FunctionDeclaration`.
3. **Agent Decides:** The LLM structures the arguments and asks ToolHub to execute the tool natively.
4. **ToolHub Executes:** The backend intercepts the request, securely decrypts and injects AES-256 API keys from the vault, executes the network request natively, logs analytics, enforces quotas, and returns the clean JSON response.

**No plaintext API keys. No writing custom fetch requests. Total observability.**

```text
┌─────────────────────────────────────────────────────────────────┐
│                        ToolHub v2.0                             │
├──────────────┬──────────────┬─────────────┬────────────────────┤
│  REST API    │  MCP Bridge  │  WebSocket  │   CLI (npm -g)     │
│  (Express)   │  Adapter     │  Push Feed  │   toolhub-cli      │
└──────┬───────┴──────────────┴──────┬──────┴────────────────────┘
       │                             │
┌──────▼─────────────────────────────▼──────────────────────────┐
│                      Core Services                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │  Discovery  │  │  Security   │  │   Observability     │    │
│  │  (Vectors)  │  │  (AES+JWT)  │  │   (Calls+Audit)     │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │  Health     │  │  Webhooks   │  │   Quota Engine      │    │
│  │  Monitor    │  │  (HMAC)     │  │   (Billing hooks)   │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
       │
┌──────▼────────────────────────────────────────────────────────┐
│                   PostgreSQL (+ pgvector)                       │
│  tools · credentials · tool_calls · webhooks · tool_health     │
│  tool_embeddings · collections · organizations · audit_log     │
└────────────────────────────────────────────────────────────────┘
       ↕ SDK (Python + TypeScript)  ↕ MCP Protocol
┌──────────────────────────────────────────────────────────────┐
│           Agent Ecosystem                                      │
│  LangChain · OpenAI · Claude (MCP) · Custom agents             │
└──────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Project Structure

ToolHub v2.0 is a monorepo consisting of a robust Node.js backend, a React live dashboard, and multiple native SDKs connecting various AI ecosystems.

```text
toolhub/
├── server/                   # Node.js + Express Backend
│   ├── src/
│   │   ├── routes/           # REST Endpoints (/tools, /orgs, /marketplace, /audit, /mcp)
│   │   ├── middleware/       # Auth guards & Quota enforcement
│   │   ├── services/         # Security (AES-256/scoring) & Embeddings (TF-IDF/OpenAI/Local)
│   │   ├── db/               # PostgreSQL connection pool & migrations
│   │   └── index.js          # App entrypoint & Socket.IO telemetry Server
│   └── package.json
│
├── toolhub-dashboard/        # React + Vite Frontend (Live Analytics & Registry)
│   ├── src/
│   │   ├── components/       # UI Components (Charts, Tables, Badges)
│   │   ├── App.jsx           # Main routing and live Socket.IO connection
│   │   └── index.css         # Styling
│   └── package.json
│
├── sdk-py/                   # Official Python SDK (pip install toolhub-sdk)
│   ├── toolhub_sdk/          # Client internals & framework mappers
│   ├── demo_agent.py         # 20-line quickstart demo
│   └── real_world_agent.py   # Live Gemini 2.5 Flash demo
│
├── sdk-js/                   # Official TypeScript SDK (npm install @toolhub/sdk)
│   ├── src/                  
│   │   ├── ToolHub.ts        # Axios-based client with retry logic
│   │   └── types.ts          # Zod-compatible type definitions
│   └── tsup.config.ts        # ESM/CJS build config
│
├── mcp-adapter/              # Model Context Protocol Bridge
│   └── src/index.ts          # Exposes ToolHub to Claude via SSE and stdio modes
│
└── cli/                      # Developer Terminal Tool
    └── src/cli.ts            # Fast terminal searching (`toolhub search "email"`)
```

---

## ✨ Core Features

### 🔐 Secure Execution & Vault
Agents **never** hold raw API keys. The developer registers a key (`sk-abc12345`) once via the CLI or UI. ToolHub stores it encrypted at rest using AES-256-GCM. When an agent requests invocation, ToolHub intercepts it, attaches the `Authorization: Bearer` header server-side, and proxies the payload.

### 🧠 Semantic Tool Discovery
Why hardcode tool IDs? Agents can simply state `"I need to send an email"`. ToolHub runs a vector search (using TF-IDF, OpenAI text-embeddings, or local Xenova models) over the database, mixing semantic similarity with a unified **Security Score** (0-100 based on schema validation and HTTPS usage) to return the safest, most relevant tool.

### 🏢 Enterprise Organizations
ToolHub supports explicit multi-tenancy. You can create Organizations with Role-Based Access Control (Admin/Editor/Viewer).
* **Quotas:** Automatically rate-limit total API calls against org tiers (`free`, `pro`, `enterprise`).
* **Marketplace:** Toggle `is_public` to let tools surface on the global Marketplace discoverability page, while keeping internal tools restricted to your Organization's agents.
* **Audit Logging:** Every critical change (deploying a new tool schema, adding users) ensures a permanent trail.

### ⚡ Live Observability
The server broadcasts millisecond-accurate latency and error streams via Socket.IO. The React dashboard instantly graphs traffic spikes, dynamic error heatmaps, and unique agent identifiers without requiring a page refresh.

---

## 🚀 Quick Start Guide

### 1. Boot the Backbone Services
You will need PostgreSQL installed.

```bash
# Start Server
cd server
cp .env.example .env  # Add your DB URI here
npm install
npm run migrate       # Initialize database
npm run seed          # Insert 10 demo tools
npm start             # Start on :3000

# Start Dashboard (in a new terminal)
cd ../toolhub-dashboard
npm install
npm run dev           # Start on :5173
```

### 2. Connect Your Agent (Python Example)

```bash
cd sdk-py
pip install google-genai
$env:GEMINI_API_KEY="your-key-here"
```

```python
import os, json
from google import genai
from google.genai import types
from toolhub_sdk import ToolHub

# 1. Connect to local ToolHub backend
hub = ToolHub(base_url="http://localhost:3000")

# 2. Ask ToolHub for the requested capability
math_tool = hub.search("evaluate an algebra equation")[0]

# 3. Format it for Gemini instantly
gemini_func = types.FunctionDeclaration(**hub.as_gemini_function(math_tool.id))

# 4. Prompt the LLM
client = genai.Client()
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents='Please exactly solve: 15.34 * 4.22 + sin(45 deg)',
    config=types.GenerateContentConfig(
        tools=[types.Tool(function_declarations=[gemini_func])]
    )
)

# 5. Execute! ToolHub securely proxies the request natively.
if response.function_calls:
    for tool_call in response.function_calls:
        result = hub.handle_gemini_tool_call(tool_call)
        print(f"ToolHub Response: {json.loads(result)}")
```

### 3. Native LangChain Support

```python
from toolhub_sdk import ToolHub
from langchain.agents import initialize_agent, AgentType
from langchain.llms import OpenAI

hub = ToolHub()
web_tool = hub.search("search the web")[0]

# Convert ToolHub tool into Langchain BaseTool automatically
lc_tool = hub.as_langchain_tool(web_tool.id)

agent = initialize_agent([lc_tool], OpenAI(), agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)
agent.run("What is the latest AI news?")
```

### 4. Claude / Cursor MCP Integration

Want to expose your company's internal tools directly into Cursor IDE or Claude Desktop? Connect the MCP adapter!

```json
{
  "mcpServers": {
    "toolhub": {
      "command": "npx",
      "args": ["-y", "@toolhub/mcp-adapter", "--url", "http://localhost:3000"]
    }
  }
}
```

---

## 🛠️ Contributing and Development

- **Server:** Written in Express. Database layers use raw `pg` for performance.
- **Frontend:** React + Vite, using `recharts` for the analytics diagrams.
- **Migrations:** Read `server/src/db/schema.sql` to understand the normalized tables (`tools`, `credentials`, `organizations`, `tool_calls`).

To build the client SDKs:
```bash
cd sdk-js && npm run build
cd mcp-adapter && npm run build
```
