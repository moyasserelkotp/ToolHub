# ToolHub Python SDK

ToolHub is an **AI-native tool discovery and secure credential vault** for your AI agents.
Your agents can search for capabilities using natural language, and ToolHub injects API keys
securely at execution time — the LLM context window **never** sees a raw credential.

---

## Installation

```bash
pip install toolhub-sdk
```

For specific LLM frameworks:
```bash
pip install "toolhub-sdk[openai]"    # OpenAI function calling
pip install "toolhub-sdk[langchain]" # LangChain tools
pip install google-genai             # Gemini integration
```

---

## 🗂️ Demo Examples

| File | What it shows | Requires |
|------|--------------|----------|
| [`demo_gemini.py`](demo_gemini.py) | ToolHub + Gemini function calling | `GOOGLE_API_KEY` |
| [`demo_openai.py`](demo_openai.py) | ToolHub + OpenAI GPT-4o function calling | `OPENAI_API_KEY` |
| [`demo_langchain.py`](demo_langchain.py) | ToolHub tools as native LangChain BaseTools | `OPENAI_API_KEY` |
| [`demo_credential_vault.py`](demo_credential_vault.py) | How credential injection works | ToolHub server |
| [`demo_dynamic_tools.py`](demo_dynamic_tools.py) | **Agent-driven** tool discovery (Gemini decides) | `GOOGLE_API_KEY` |
| [`demo_dynamic_skills.py`](demo_dynamic_skills.py) | **Agent-driven** skills discovery | `GOOGLE_API_KEY` |
| [`demo_chained_tools.py`](demo_chained_tools.py) | **Multi-hop chains** — tool output feeds next tool | `GOOGLE_API_KEY` |

---

## 🚀 Quick Start

```python
from toolhub_sdk import ToolHub

# 1. Connect to your registry (agent never touches keys)
hub = ToolHub(base_url="http://localhost:3000", agent_id="my-agent-123")

# 2. Semantic search for a tool using natural language
tools = hub.search("I need to send an email")
email_tool = tools[0]

# 3. Invoke! ToolHub dynamically injects the API keys on the backend
response = hub.invoke(email_tool.id, {"to": "team@example.com", "body": "Hello!"})
print(response.data)
```

---

## 🤖 Gemini Integration

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
    model='gemini-2.5-flash-8b',
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

▶ Full runnable example: [`demo_gemini.py`](demo_gemini.py)

---

## 🧠 OpenAI Function Calling

```python
import openai
from toolhub_sdk import ToolHub

hub = ToolHub(base_url="http://localhost:3000")
web_tool = hub.search("search the web")[0]

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Search the web for AI news."}],
    tools=[{"type": "function", "function": hub.as_openai_function(web_tool.id)}],
)

tool_call = response.choices[0].message.tool_calls[0]
result_json_str = hub.handle_openai_tool_call(tool_call)
print(result_json_str)
```

▶ Full runnable example: [`demo_openai.py`](demo_openai.py)

---

## 🦜 LangChain Integration

```python
from toolhub_sdk import ToolHub
from langchain.agents import initialize_agent, AgentType
from langchain_openai import OpenAI

hub = ToolHub()
web_tool = hub.search("search the web")[0]

# Convert any ToolHub tool into a native LangChain BaseTool
lc_tool = hub.as_langchain_tool(web_tool.id)

agent = initialize_agent(
    [lc_tool],
    OpenAI(),
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION
)
agent.run("What is the latest AI news?")
```

▶ Full runnable example: [`demo_langchain.py`](demo_langchain.py)

---

## 🔐 Credential Vault

ToolHub stores API keys **AES-256 encrypted** on the server.
Your agent calls `hub.invoke()` — it never sees the raw key.

```python
hub = ToolHub(base_url="http://localhost:3000", operator_id="my-org")

# Register a key once — it's encrypted and stored in the vault
hub.register_credential(
    tool_id="<tool-uuid>",
    api_key="sk-live-12345",
    auth_type="api_key"
)

# The agent calls the tool normally — key injection happens automatically
result = hub.invoke(tool_id, {"location": "Cairo"})

# To rotate the key, just register again — it upserts
hub.register_credential(tool_id="<tool-uuid>", api_key="sk-live-NEW", auth_type="api_key")
```

▶ Full explanation: [`demo_credential_vault.py`](demo_credential_vault.py)

---

## 🌟 Agent-Driven Dynamic Discovery

The most powerful mode: the **LLM itself** decides what tools it needs.

Instead of your application pre-loading tools, Gemini starts with only
two meta-tools (`search_tools`, `search_skills`) and dynamically
discovers capabilities as it works through a task.

```python
from dynamic_agent import DynamicAgent

agent = DynamicAgent(
    toolhub_url="http://localhost:3000",
    gemini_api_key="YOUR_KEY",
    token="<jwt>",
    enable_tools=True,   # Gemini can discover executable tools
    enable_skills=True,  # Gemini can discover workflow templates
    verbose=True,
)

answer = agent.run("Search the latest AI news and email me a summary.")
print(answer)
```

What happens internally:

```
Turn 1:  Gemini sees [search_tools, search_skills]
         → Calls search_tools("search the web")
         → ToolHub returns: web_search, slack, translation

Turn 2:  Gemini now sees [search_tools, search_skills, web_search, slack, translation]
         → Calls web_search({"query": "latest AI news"})
         → Gets results back

Turn 3:  Gemini needs email → calls search_tools("send email")
         → ToolHub returns: email, image_generation

Turn 4:  Gemini calls email({...})  → task complete
```

▶ Tool discovery demo: [`demo_dynamic_tools.py`](demo_dynamic_tools.py)
▶ Skills discovery demo: [`demo_dynamic_skills.py`](demo_dynamic_skills.py)

---

## 📚 Skills Registry

ToolHub also stores **agent workflow templates** (Skills) — not just executable tools.

```python
from toolhub_sdk.skills import SkillsClient

skills = SkillsClient(base_url="http://localhost:3000", token="<jwt>")

# Search for workflow guidance using natural language
results = skills.search("how do I set up an A/B test?")
for skill in results:
    print(f"{skill.name}  score={skill.score:.3f}")

# Read the full skill instructions
skill = skills.get_by_slug("ab-test-setup")
print(skill.raw_content)
```

> **Security note:** When using `DynamicAgent`, `raw_content` is automatically
> stripped from skill results before they are shown to Gemini.
> This prevents prompt injection attacks from malicious skill content.

---

## Configuration Reference

| Parameter | Default | Description |
|-----------|---------|-------------|
| `base_url` | `http://localhost:3000` | ToolHub server URL |
| `agent_id` | `"default"` | Identifier logged in analytics |
| `operator_id` | `"default"` | Credential vault namespace |
| `token` | `None` | JWT from `/auth/token` |

### DynamicAgent-specific

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enable_tools` | `True` | Expose `search_tools` to Gemini |
| `enable_skills` | `True` | Expose `search_skills` to Gemini |
| `gemini_model` | `gemini-2.5-flash-8b` | Model to use |
| `max_iterations` | `20` | Hard cap on agent loop turns |
| `verbose` | `True` | Print discovery progress |
